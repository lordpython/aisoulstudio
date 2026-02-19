/**
 * YouTube Narrator Pipeline Integration Tests
 *
 * Tests complete pipeline execution, checkpoint flow, and format compliance.
 * All external services (LLM, image gen, TTS) are mocked.
 *
 * Requirements tested: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineRequest } from '../formatRouter';
import type { ResearchResult } from '../researchService';

// ============================================================================
// Mocks — must be declared before imports that use them
// ============================================================================

const mockInvoke = vi.fn();

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation(function (this: any) {
    this.withStructuredOutput = () => ({ invoke: mockInvoke });
  }),
}));

vi.mock('../imageService', () => ({
  generateImageFromPrompt: vi.fn().mockResolvedValue('https://example.com/image.png'),
}));

vi.mock('../prompt/imageStyleGuide', () => ({
  buildImageStyleGuide: vi.fn().mockReturnValue('mocked style guide'),
}));

vi.mock('../narratorService', () => ({
  narrateScene: vi.fn().mockResolvedValue({
    sceneId: 'scene_0',
    audioBlob: new Blob(['audio']),
    audioDuration: 30,
    transcript: 'Test narration',
  }),
  getFormatVoiceForLanguage: vi.fn().mockReturnValue({
    voiceName: 'Kore',
    pitch: 1,
    speakingRate: 1.1,
    stylePrompt: { persona: 'YouTube host', emotion: 'warm' },
  }),
}));

vi.mock('../ai/storyPipeline', () => ({
  buildBreakdownPrompt: vi.fn().mockReturnValue('mocked breakdown prompt'),
  buildScreenplayPrompt: vi.fn().mockReturnValue('mocked screenplay prompt'),
  generateVoiceoverScripts: vi.fn().mockResolvedValue(new Map([
    ['scene_0', 'Did you know...'],
    ['scene_1', 'The key insight is...'],
    ['scene_2', 'Subscribe for more.'],
  ])),
  countScriptWords: vi.fn().mockReturnValue(500),
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
    formatId: 'youtube-narrator',
    aspectRatio: '16:9',
    defaultTransition: 'dissolve',
    transitionDuration: 1.5,
  }),
}));

// ============================================================================
// Now import the pipeline (after all mocks are declared)
// ============================================================================

import { YouTubeNarratorPipeline } from './youtubeNarrator';
import { storyModeStore } from '../ai/production/store';

// ============================================================================
// Tests
// ============================================================================

describe('YouTubeNarratorPipeline', () => {
  let pipeline: YouTubeNarratorPipeline;

  const mockResearchService = {
    research: vi.fn().mockResolvedValue({
      sources: [{ id: '1', title: 'Source', content: 'Facts', type: 'web', relevance: 0.8, language: 'en' }],
      summary: 'Research summary about the topic',
      citations: [{ sourceId: '1', text: 'Source', position: 0 }],
      confidence: 0.85,
    } satisfies ResearchResult),
    prioritizeReferences: vi.fn().mockResolvedValue([]),
  };

  const mockEngine = {
    execute: vi.fn().mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/0.png' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/1.png' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/2.png' }, attempts: 1, duration: 1000 },
    ]),
    cancel: vi.fn(),
    getProgress: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (storyModeStore as Map<string, any>).clear();

    // Reset invoke mock with fresh return values for each test
    mockInvoke
      .mockResolvedValueOnce({
        acts: [
          { title: 'Hook', emotionalHook: 'curiosity', narrativeBeat: 'Intro fact' },
          { title: 'Deep Dive', emotionalHook: 'awe', narrativeBeat: 'Main point' },
          { title: 'Conclusion', emotionalHook: 'inspiration', narrativeBeat: 'Call to action' },
        ],
      })
      .mockResolvedValueOnce({
        scenes: [
          { heading: 'HOOK - COLD OPEN', action: 'B-roll cityscape', dialogue: [{ speaker: 'Narrator', text: 'Did you know...' }] },
          { heading: 'MAIN POINT 1', action: 'B-roll infographic', dialogue: [{ speaker: 'Narrator', text: 'The key insight is...' }] },
          { heading: 'OUTRO CTA', action: 'B-roll logo', dialogue: [{ speaker: 'Narrator', text: 'Subscribe for more.' }] },
        ],
      });

    // Reset research mock
    mockResearchService.research.mockResolvedValue({
      sources: [{ id: '1', title: 'Source', content: 'Facts', type: 'web', relevance: 0.8, language: 'en' }],
      summary: 'Research summary about the topic',
      citations: [{ sourceId: '1', text: 'Source', position: 0 }],
      confidence: 0.85,
    });

    mockEngine.execute.mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/0.png' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/1.png' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/2.png' }, attempts: 1, duration: 1000 },
    ]);

    pipeline = new YouTubeNarratorPipeline(
      mockResearchService as any,
      mockEngine as any,
    );
  });

  describe('getMetadata', () => {
    it('should return youtube-narrator format metadata', () => {
      const metadata = pipeline.getMetadata();
      expect(metadata.id).toBe('youtube-narrator');
      expect(metadata.durationRange).toEqual({ min: 480, max: 1500 });
      expect(metadata.aspectRatio).toBe('16:9');
      expect(metadata.checkpointCount).toBe(3);
      expect(metadata.requiresResearch).toBe(true);
    });
  });

  describe('validate', () => {
    it('should accept valid requests', async () => {
      const request: PipelineRequest = {
        formatId: 'youtube-narrator',
        idea: 'Why the ocean is blue',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(true);
    });

    it('should reject empty ideas', async () => {
      const request: PipelineRequest = {
        formatId: 'youtube-narrator',
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
      formatId: 'youtube-narrator',
      idea: 'The history of the internet',
      genre: 'Educational',
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
      expect(result.partialResults.research).toBeDefined();
    });

    it('should perform research with parallel queries (Req 3.5)', async () => {
      await pipeline.execute(baseRequest);

      expect(mockResearchService.research).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'The history of the internet',
          language: 'en',
          depth: 'medium',
        }),
      );
    });

    it('should use parallel execution engine for visuals (Req 3.3)', async () => {
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
      const sessionId = result.partialResults.sessionId;
      const state = (storyModeStore as Map<string, any>).get(sessionId);

      expect(state).toBeDefined();
      expect(state.formatId).toBe('youtube-narrator');
      expect(state.language).toBe('en');
      expect(state.screenplay).toHaveLength(3);
    });

    it('should detect Arabic language and propagate it (Req 3.7)', async () => {
      const arabicRequest: PipelineRequest = {
        ...baseRequest,
        idea: 'تاريخ الإنترنت',
        language: 'ar',
      };

      const result = await pipeline.execute(arabicRequest);
      const state = (storyModeStore as Map<string, any>).get(result.partialResults.sessionId);

      expect(state.language).toBe('ar');
    });

    it('should handle research failure gracefully', async () => {
      mockResearchService.research.mockResolvedValueOnce({
        sources: [],
        summary: 'No information found',
        citations: [],
        confidence: 0,
        partial: true,
        failedQueries: 3,
      });

      const result = await pipeline.execute(baseRequest);
      expect(result.success).toBe(true);
    });
  });
});
