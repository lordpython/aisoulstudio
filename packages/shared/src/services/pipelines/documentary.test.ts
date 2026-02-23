/**
 * Documentary Pipeline Integration Tests
 *
 * Tests complete pipeline execution, deep research, chapter structure, and
 * archival visual style. All external services are mocked.
 *
 * Requirements tested: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
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
  generateImageFromPrompt: vi.fn().mockResolvedValue('https://example.com/doc-image.png'),
}));

vi.mock('../prompt/imageStyleGuide', () => ({
  buildImageStyleGuide: vi.fn().mockReturnValue('mocked archival style guide'),
}));

vi.mock('../narratorService', () => ({
  narrateScene: vi.fn().mockResolvedValue({
    sceneId: 'scene_0',
    audioBlob: new Blob(['audio']),
    audioDuration: 300,
    transcript: 'Test documentary narration',
  }),
  getFormatVoiceForLanguage: vi.fn().mockReturnValue({
    voiceName: 'Charon',
    pitch: -1,
    speakingRate: 0.95,
    stylePrompt: { persona: 'Documentary narrator', emotion: 'solemn and authoritative' },
  }),
}));

vi.mock('../ai/storyPipeline', () => ({
  buildBreakdownPrompt: vi.fn().mockReturnValue('mocked breakdown prompt'),
  buildScreenplayPrompt: vi.fn().mockReturnValue('mocked screenplay prompt'),
  countScriptWords: vi.fn().mockReturnValue(3000),
  validateDurationConstraint: vi.fn().mockReturnValue({ valid: true, estimatedSeconds: 1800 }),
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
    formatId: 'documentary',
    aspectRatio: '16:9',
    defaultTransition: 'dissolve',
    transitionDuration: 1.5,
    useChapterStructure: true,
  }),
  buildChapterMarkers: vi.fn().mockReturnValue([
    { id: 'chapter_0', title: 'Chapter 1 - Origins', startTime: 0, endTime: 600 },
    { id: 'chapter_1', title: 'Chapter 2 - Conflict', startTime: 600, endTime: 1200 },
    { id: 'chapter_2', title: 'Chapter 3 - Resolution', startTime: 1200, endTime: 1800 },
    { id: 'chapter_3', title: 'Chapter 4 - Legacy', startTime: 1800, endTime: 2400 },
  ]),
  validateChapterSequence: vi.fn().mockReturnValue(true),
}));

// ============================================================================
// Import pipeline after mocks
// ============================================================================

import { DocumentaryPipeline } from './documentary';
import { storyModeStore } from '../ai/production/store';

// ============================================================================
// Tests
// ============================================================================

describe('DocumentaryPipeline', () => {
  let pipeline: DocumentaryPipeline;

  const mockResearchService = {
    research: vi.fn().mockResolvedValue({
      sources: Array.from({ length: 8 }, (_, i) => ({
        id: `src_${i}`,
        title: `Source ${i + 1}`,
        content: `In-depth content from source ${i + 1}`,
        type: 'web' as const,
        relevance: 0.85,
        language: 'en' as const,
      })),
      summary: 'Comprehensive multi-source research on the documentary subject',
      citations: [
        { sourceId: 'src_0', text: 'Source 1 citation', position: 0 },
        { sourceId: 'src_1', text: 'Source 2 citation', position: 1 },
        { sourceId: 'src_2', text: 'Source 3 citation', position: 2 },
      ],
      confidence: 0.91,
    } satisfies ResearchResult),
    prioritizeReferences: vi.fn().mockResolvedValue([]),
  };

  const mockEngine = {
    execute: vi.fn().mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/doc-0.png' }, attempts: 1, duration: 1500 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/doc-1.png' }, attempts: 1, duration: 1500 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/doc-2.png' }, attempts: 1, duration: 1500 },
      { taskId: 'visual_3', success: true, data: { sceneId: 'scene_3', imageUrl: 'https://example.com/doc-3.png' }, attempts: 1, duration: 1500 },
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
          { title: 'Act 1', emotionalHook: 'curiosity', narrativeBeat: 'Origins', chapterTitle: 'Chapter 1 - Origins' },
          { title: 'Act 2', emotionalHook: 'tension', narrativeBeat: 'Conflict', chapterTitle: 'Chapter 2 - Conflict' },
          { title: 'Act 3', emotionalHook: 'revelation', narrativeBeat: 'Resolution', chapterTitle: 'Chapter 3 - Resolution' },
          { title: 'Act 4', emotionalHook: 'reflection', narrativeBeat: 'Legacy', chapterTitle: 'Chapter 4 - Legacy' },
        ],
      })
      .mockResolvedValueOnce({
        scenes: [
          { heading: 'CHAPTER 1 - ORIGINS', action: 'Archival footage of beginnings', dialogue: [{ speaker: 'Narrator', text: 'It all began in...' }] },
          { heading: 'CHAPTER 2 - CONFLICT', action: 'Dramatic archival photos', dialogue: [{ speaker: 'Narrator', text: 'Tensions escalated when...' }] },
          { heading: 'CHAPTER 3 - RESOLUTION', action: 'Data visualization of outcomes', dialogue: [{ speaker: 'Narrator', text: 'The turning point came...' }] },
          { heading: 'CHAPTER 4 - LEGACY', action: 'Modern day comparison shots', dialogue: [{ speaker: 'Narrator', text: 'Today, the legacy endures...' }] },
        ],
      });

    mockResearchService.research.mockResolvedValue({
      sources: Array.from({ length: 8 }, (_, i) => ({
        id: `src_${i}`,
        title: `Source ${i + 1}`,
        content: `Deep content from source ${i + 1}`,
        type: 'web' as const,
        relevance: 0.85,
        language: 'en' as const,
      })),
      summary: 'Comprehensive multi-source research',
      citations: [
        { sourceId: 'src_0', text: 'Source 1 citation', position: 0 },
        { sourceId: 'src_1', text: 'Source 2 citation', position: 1 },
      ],
      confidence: 0.91,
    });

    mockEngine.execute.mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/doc-0.png' }, attempts: 1, duration: 1500 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/doc-1.png' }, attempts: 1, duration: 1500 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/doc-2.png' }, attempts: 1, duration: 1500 },
      { taskId: 'visual_3', success: true, data: { sceneId: 'scene_3', imageUrl: 'https://example.com/doc-3.png' }, attempts: 1, duration: 1500 },
    ]);

    pipeline = new DocumentaryPipeline(
      mockResearchService as any,
      mockEngine as any,
    );
  });

  describe('getMetadata', () => {
    it('should return documentary format metadata (Req 7.1)', () => {
      const metadata = pipeline.getMetadata();
      expect(metadata.id).toBe('documentary');
      expect(metadata.durationRange).toEqual({ min: 900, max: 3600 });
      expect(metadata.aspectRatio).toBe('16:9');
      expect(metadata.checkpointCount).toBe(4);
      expect(metadata.requiresResearch).toBe(true);
    });
  });

  describe('validate', () => {
    it('should accept valid requests', async () => {
      const request: PipelineRequest = {
        formatId: 'documentary',
        idea: 'The rise and fall of the Roman Empire',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(true);
    });

    it('should reject empty ideas', async () => {
      const request: PipelineRequest = {
        formatId: 'documentary',
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
      formatId: 'documentary',
      idea: 'The untold story of the space race',
      genre: 'Historical',
      language: 'en',
      userId: 'user1',
      projectId: 'proj1',
    };

    it('should execute full pipeline and return success', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.success).toBe(true);
      expect(result.partialResults).toBeDefined();
      expect(result.partialResults.screenplay).toHaveLength(4);
      expect(result.partialResults.visuals).toHaveLength(4);
      expect(result.partialResults.narrationSegments).toHaveLength(4);
    });

    it('should perform deep research across multiple sources (Req 7.2)', async () => {
      await pipeline.execute(baseRequest);

      expect(mockResearchService.research).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'The untold story of the space race',
          language: 'en',
          depth: 'deep',
          maxResults: 20,
        }),
      );
    });

    it('should include research results with citations (Req 7.3)', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.partialResults.research).toBeDefined();
      expect(result.partialResults.research.sources.length).toBeGreaterThan(0);
      expect(result.partialResults.research.citations.length).toBeGreaterThan(0);
    });

    it('should include chapter markers (Req 7.5)', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.partialResults.chapters).toBeDefined();
      expect(result.partialResults.chapters.length).toBeGreaterThan(0);
      expect(result.partialResults.chapters[0]).toHaveProperty('title');
      expect(result.partialResults.chapters[0]).toHaveProperty('startTime');
    });

    it('should queue visual tasks for parallel execution (Req 7.4)', async () => {
      // The parallel engine mock returns pre-built results without running tasks;
      // verify it is called with the correct number of visual tasks
      await pipeline.execute(baseRequest);

      expect(mockEngine.execute).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'visual', retryable: true }),
        ]),
        expect.any(Object),
      );
    });

    it('should use parallel execution engine with high concurrency limit', async () => {
      await pipeline.execute(baseRequest);

      expect(mockEngine.execute).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          concurrencyLimit: 5,
        }),
      );
    });

    it('should persist session state with format metadata', async () => {
      const result = await pipeline.execute(baseRequest);
      const state = (storyModeStore as Map<string, any>).get(result.partialResults.sessionId);

      expect(state).toBeDefined();
      expect(state.formatId).toBe('documentary');
      expect(state.language).toBe('en');
    });

    it('should pass reference documents directly to research service (Req 7.6)', async () => {
      const mockDocs = [{ id: 'doc1', filename: 'source.pdf', content: 'test', chunks: ['test'], metadata: {} }];
      const requestWithRefs: PipelineRequest = {
        ...baseRequest,
        referenceDocuments: mockDocs as any,
      };

      await pipeline.execute(requestWithRefs);
      expect(mockResearchService.research).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceDocuments: mockDocs,
        }),
      );
    });

    it('should detect Arabic language and propagate it', async () => {
      const arabicRequest: PipelineRequest = {
        ...baseRequest,
        idea: 'قصة رحلة الفضاء غير المروية',
        language: 'ar',
      };

      const result = await pipeline.execute(arabicRequest);
      const state = (storyModeStore as Map<string, any>).get(result.partialResults.sessionId);
      expect(state.language).toBe('ar');
    });
  });
});
