/**
 * Educational Pipeline Integration Tests
 *
 * Tests complete pipeline execution, learning objectives, chapter organization,
 * and visual text overlays. All external services are mocked.
 *
 * Requirements tested: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineRequest } from '../formatRouter';
import type { ResearchResult } from '../researchService';

// ============================================================================
// Mocks
// ============================================================================

const mockInvoke = vi.fn();

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation(function (this: any) {
    this.withStructuredOutput = () => ({ invoke: mockInvoke });
  }),
}));

vi.mock('../imageService', () => ({
  generateImageFromPrompt: vi.fn().mockResolvedValue('https://example.com/edu-image.png'),
}));

vi.mock('../prompt/imageStyleGuide', () => ({
  buildImageStyleGuide: vi.fn().mockReturnValue('mocked edu style guide'),
}));

vi.mock('../narratorService', () => ({
  narrateScene: vi.fn().mockResolvedValue({
    sceneId: 'scene_0',
    audioBlob: new Blob(['audio']),
    audioDuration: 120,
    transcript: 'Test educational narration',
  }),
  getFormatVoiceForLanguage: vi.fn().mockReturnValue({
    voiceName: 'Leda',
    pitch: 0,
    speakingRate: 1.0,
    stylePrompt: { persona: 'Professional educator', emotion: 'clear and encouraging' },
  }),
}));

vi.mock('../ai/storyPipeline', () => ({
  buildBreakdownPrompt: vi.fn().mockReturnValue('mocked breakdown prompt'),
  buildScreenplayPrompt: vi.fn().mockReturnValue('mocked screenplay prompt'),
  countScriptWords: vi.fn().mockReturnValue(800),
  validateDurationConstraint: vi.fn().mockReturnValue({ valid: true, estimatedSeconds: 600 }),
}));

vi.mock('../shared/apiClient', () => ({
  GEMINI_API_KEY: 'test-key',
  MODELS: { TEXT: 'gemini-test' },
  ai: {},
}));

vi.mock('../logger', () => ({
  agentLogger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock('../checkpointSystem', () => {
  const MockCheckpointSystem = vi.fn().mockImplementation(function (this: any) {
    this.createCheckpoint = vi.fn().mockResolvedValue({ approved: true });
    this.approveCheckpoint = vi.fn();
    this.getAllCheckpoints = vi.fn().mockReturnValue([]);
    this.dispose = vi.fn();
  });
  return { CheckpointSystem: MockCheckpointSystem };
});

vi.mock('../languageDetector', () => ({
  detectLanguage: vi.fn().mockReturnValue('en'),
}));

vi.mock('../ai/production/store', () => ({
  storyModeStore: new Map(),
}));

vi.mock('../ffmpeg/formatAssembly', () => ({
  buildAssemblyRules: vi.fn().mockReturnValue({
    formatId: 'educational',
    aspectRatio: '16:9',
    defaultTransition: 'dissolve',
    transitionDuration: 1.0,
    useChapterStructure: true,
  }),
  buildChapterMarkers: vi.fn().mockReturnValue([
    { id: 'chapter_0', title: 'Introduction', startTime: 0, endTime: 120 },
    { id: 'chapter_1', title: 'Core Concept', startTime: 120, endTime: 360 },
    { id: 'chapter_2', title: 'Summary', startTime: 360, endTime: 600 },
  ]),
}));

// ============================================================================
// Import pipeline after mocks
// ============================================================================

import { EducationalPipeline } from './educational';
import { storyModeStore } from '../ai/production/store';

// ============================================================================
// Tests
// ============================================================================

describe('EducationalPipeline', () => {
  let pipeline: EducationalPipeline;

  const mockResearchService = {
    research: vi.fn().mockResolvedValue({
      sources: [
        { id: '1', title: 'Khan Academy', content: 'Factual content', type: 'web', relevance: 0.9, language: 'en' },
        { id: '2', title: 'Wikipedia', content: 'Overview content', type: 'web', relevance: 0.8, language: 'en' },
      ],
      summary: 'Comprehensive research on the educational topic',
      citations: [
        { sourceId: '1', text: 'Khan Academy', position: 0 },
        { sourceId: '2', text: 'Wikipedia', position: 1 },
      ],
      confidence: 0.88,
    } satisfies ResearchResult),
    prioritizeReferences: vi.fn().mockResolvedValue([]),
  };

  const mockEngine = {
    execute: vi.fn().mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/edu-0.png', overlay: 'Objective 1' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/edu-1.png', overlay: 'Objective 2' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/edu-2.png', overlay: 'Objective 3' }, attempts: 1, duration: 1000 },
    ]),
    cancel: vi.fn(),
    getProgress: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (storyModeStore as Map<string, any>).clear();

    mockInvoke
      .mockResolvedValueOnce({
        acts: [
          { title: 'Introduction', emotionalHook: 'curiosity', narrativeBeat: 'Hook learners', learningObjective: 'Understand the basics' },
          { title: 'Core Concept', emotionalHook: 'understanding', narrativeBeat: 'Explain the main idea', learningObjective: 'Apply the concept' },
          { title: 'Summary', emotionalHook: 'achievement', narrativeBeat: 'Reinforce learning', learningObjective: 'Recall key points' },
        ],
      })
      .mockResolvedValueOnce({
        scenes: [
          { heading: 'INTRODUCTION', action: 'Diagram showing overview', dialogue: [{ speaker: 'Teacher', text: 'Today we will learn about photosynthesis.' }] },
          { heading: 'CORE CONCEPT', action: 'Detailed diagram with labels', dialogue: [{ speaker: 'Teacher', text: 'Plants convert sunlight to energy.' }] },
          { heading: 'SUMMARY', action: 'Summary chart', dialogue: [{ speaker: 'Teacher', text: 'Remember these three key steps.' }] },
        ],
      });

    mockResearchService.research.mockResolvedValue({
      sources: [
        { id: '1', title: 'Khan Academy', content: 'Factual content', type: 'web', relevance: 0.9, language: 'en' },
      ],
      summary: 'Research on educational topic',
      citations: [{ sourceId: '1', text: 'Khan Academy', position: 0 }],
      confidence: 0.88,
    });

    mockEngine.execute.mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/edu-0.png', overlay: 'Understand the basics' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/edu-1.png', overlay: 'Apply the concept' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/edu-2.png', overlay: 'Recall key points' }, attempts: 1, duration: 1000 },
    ]);

    pipeline = new EducationalPipeline(
      mockResearchService as any,
      mockEngine as any,
    );
  });

  describe('getMetadata', () => {
    it('should return educational format metadata (Req 5.1)', () => {
      const metadata = pipeline.getMetadata();
      expect(metadata.id).toBe('educational');
      expect(metadata.durationRange).toEqual({ min: 300, max: 1200 });
      expect(metadata.aspectRatio).toBe('16:9');
      expect(metadata.checkpointCount).toBe(3);
      expect(metadata.requiresResearch).toBe(true);
    });
  });

  describe('validate', () => {
    it('should accept valid requests', async () => {
      const request: PipelineRequest = {
        formatId: 'educational',
        idea: 'How photosynthesis works',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(true);
    });

    it('should reject empty ideas', async () => {
      const request: PipelineRequest = {
        formatId: 'educational',
        idea: '',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(false);
    });
  });

  describe('execute', () => {
    const baseRequest: PipelineRequest = {
      formatId: 'educational',
      idea: 'How photosynthesis works — from sunlight to sugar',
      genre: 'Science',
      language: 'en',
      userId: 'user1',
      projectId: 'proj1',
    };

    it('should execute full pipeline and return success', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.success).toBe(true);
      expect(result.partialResults).toBeDefined();
      expect(result.partialResults.screenplay).toHaveLength(3);
      expect(result.partialResults.visuals).toHaveLength(3);
      expect(result.partialResults.narrationSegments).toHaveLength(3);
      expect(result.partialResults.assemblyRules).toBeDefined();
    });

    it('should include learning objectives in results (Req 5.2)', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.partialResults.learningObjectives).toBeDefined();
      expect(result.partialResults.learningObjectives).toHaveLength(3);
      expect(result.partialResults.learningObjectives[0]).toContain('basics');
    });

    it('should include chapter markers for organized content (Req 5.6)', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.partialResults.chapters).toBeDefined();
      expect(result.partialResults.chapters.length).toBeGreaterThan(0);
      expect(result.partialResults.chapters[0]).toHaveProperty('startTime');
      expect(result.partialResults.chapters[0]).toHaveProperty('endTime');
    });

    it('should perform research for accurate content (Req 5.2)', async () => {
      await pipeline.execute(baseRequest);

      expect(mockResearchService.research).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'How photosynthesis works — from sunlight to sugar',
          language: 'en',
          depth: 'medium',
        }),
      );
    });

    it('should use parallel execution engine for visuals (Req 5.3)', async () => {
      await pipeline.execute(baseRequest);

      expect(mockEngine.execute).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          concurrencyLimit: 4,
        }),
      );
    });

    it('should persist session state with format metadata', async () => {
      const result = await pipeline.execute(baseRequest);
      const sessionId = result.partialResults.sessionId;
      const state = (storyModeStore as Map<string, any>).get(sessionId);

      expect(state).toBeDefined();
      expect(state.formatId).toBe('educational');
      expect(state.language).toBe('en');
      expect(state.screenplay).toHaveLength(3);
    });

    it('should detect Arabic language and propagate it', async () => {
      const arabicRequest: PipelineRequest = {
        ...baseRequest,
        idea: 'كيف تعمل عملية التمثيل الضوئي',
        language: 'ar',
      };

      const result = await pipeline.execute(arabicRequest);
      const state = (storyModeStore as Map<string, any>).get(result.partialResults.sessionId);

      expect(state.language).toBe('ar');
    });

    it('should include chapter structure in assembly rules (Req 5.6)', async () => {
      const result = await pipeline.execute(baseRequest);
      const { buildChapterMarkers } = await import('../ffmpeg/formatAssembly');

      expect(buildChapterMarkers).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('should handle research failure gracefully (Req 5.2)', async () => {
      mockResearchService.research.mockResolvedValueOnce({
        sources: [],
        summary: 'No information found',
        citations: [],
        confidence: 0,
        partial: true,
        failedQueries: 2,
      });

      const result = await pipeline.execute(baseRequest);
      expect(result.success).toBe(true);
    });
  });
});
