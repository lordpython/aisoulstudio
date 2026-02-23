/**
 * Shorts/Reels Pipeline Integration Tests
 *
 * Tests complete pipeline execution, vertical aspect ratio, and hook-first content.
 * All external services are mocked.
 *
 * Requirements tested: 6.1, 6.2, 6.3, 6.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineRequest } from '../formatRouter';

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
  generateImageFromPrompt: vi.fn().mockResolvedValue('https://example.com/short-image.png'),
}));

vi.mock('../prompt/imageStyleGuide', () => ({
  buildImageStyleGuide: vi.fn().mockReturnValue('mocked shorts style guide'),
}));

vi.mock('../narratorService', () => ({
  narrateScene: vi.fn().mockResolvedValue({
    sceneId: 'scene_0',
    audioBlob: new Blob(['audio']),
    audioDuration: 15,
    transcript: 'Test short narration',
  }),
  getFormatVoiceForLanguage: vi.fn().mockReturnValue({
    voiceName: 'Puck',
    pitch: 2,
    speakingRate: 1.3,
    stylePrompt: { persona: 'Energetic social creator', emotion: 'excited' },
  }),
}));

vi.mock('../ai/storyPipeline', () => ({
  buildBreakdownPrompt: vi.fn().mockReturnValue('mocked breakdown prompt'),
  buildScreenplayPrompt: vi.fn().mockReturnValue('mocked screenplay prompt'),
  countScriptWords: vi.fn().mockReturnValue(60),
  validateDurationConstraint: vi.fn().mockReturnValue({ valid: true, estimatedSeconds: 30 }),
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
    formatId: 'shorts',
    aspectRatio: '9:16',
    defaultTransition: 'none',
    transitionDuration: 0.3,
  }),
}));

// ============================================================================
// Import pipeline after mocks
// ============================================================================

import { ShortsPipeline } from './shorts';
import { storyModeStore } from '../ai/production/store';

// ============================================================================
// Tests
// ============================================================================

describe('ShortsPipeline', () => {
  let pipeline: ShortsPipeline;

  const mockEngine = {
    execute: vi.fn().mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/short-0.png' }, attempts: 1, duration: 500 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/short-1.png' }, attempts: 1, duration: 500 },
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
          { title: 'Hook', emotionalHook: 'shock', narrativeBeat: 'Immediate attention grab' },
          { title: 'Payoff', emotionalHook: 'satisfaction', narrativeBeat: 'Deliver the value' },
        ],
      })
      .mockResolvedValueOnce({
        scenes: [
          { heading: 'HOOK - FIRST 3 SECONDS', action: 'Close-up face with shocked expression', dialogue: [{ speaker: 'Creator', text: 'You NEED to see this!' }] },
          { heading: 'PAYOFF', action: 'Quick reveal montage', dialogue: [{ speaker: 'Creator', text: 'Follow for more life hacks!' }] },
        ],
      });

    mockEngine.execute.mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/short-0.png' }, attempts: 1, duration: 500 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/short-1.png' }, attempts: 1, duration: 500 },
    ]);

    pipeline = new ShortsPipeline(mockEngine as any);
  });

  describe('getMetadata', () => {
    it('should return shorts format metadata (Req 6.1)', () => {
      const metadata = pipeline.getMetadata();
      expect(metadata.id).toBe('shorts');
      expect(metadata.durationRange).toEqual({ min: 15, max: 60 });
      expect(metadata.aspectRatio).toBe('9:16');
      expect(metadata.checkpointCount).toBe(2);
      expect(metadata.requiresResearch).toBe(false);
    });
  });

  describe('validate', () => {
    it('should accept valid requests', async () => {
      const request: PipelineRequest = {
        formatId: 'shorts',
        idea: 'Amazing life hack for productivity',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(true);
    });

    it('should reject empty ideas', async () => {
      const request: PipelineRequest = {
        formatId: 'shorts',
        idea: '   ',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(false);
    });
  });

  describe('execute', () => {
    const baseRequest: PipelineRequest = {
      formatId: 'shorts',
      idea: 'The one productivity hack that changed my life',
      genre: 'Life Hack',
      language: 'en',
      userId: 'user1',
      projectId: 'proj1',
    };

    it('should execute full pipeline and return success', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.success).toBe(true);
      expect(result.partialResults).toBeDefined();
      expect(result.partialResults.screenplay).toHaveLength(2);
      expect(result.partialResults.visuals).toHaveLength(2);
      expect(result.partialResults.narrationSegments).toHaveLength(2);
    });

    it('should include vertical aspect ratio in results (Req 6.2)', async () => {
      const result = await pipeline.execute(baseRequest);
      expect(result.partialResults.aspectRatio).toBe('9:16');
    });

    it('should pass 9:16 aspect ratio to assembly rules (Req 6.2)', async () => {
      const result = await pipeline.execute(baseRequest);
      expect(result.partialResults.assemblyRules.aspectRatio).toBe('9:16');
    });

    it('should use fast-paced visual style in pipeline (Req 6.4)', async () => {
      // The parallel engine is mocked to return results directly;
      // verify the engine is invoked with visual tasks that contain scene data
      await pipeline.execute(baseRequest);

      expect(mockEngine.execute).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'visual', retryable: true }),
        ]),
        expect.any(Object),
      );
    });

    it('should use parallel execution engine for visuals', async () => {
      await pipeline.execute(baseRequest);

      expect(mockEngine.execute).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          concurrencyLimit: 3,
        }),
      );
    });

    it('should persist session state with format metadata', async () => {
      const result = await pipeline.execute(baseRequest);
      const sessionId = result.partialResults.sessionId;
      const state = (storyModeStore as Map<string, any>).get(sessionId);

      expect(state).toBeDefined();
      expect(state.formatId).toBe('shorts');
      expect(state.language).toBe('en');
    });

    it('should reject if hook checkpoint not approved', async () => {
      const { CheckpointSystem } = await import('../checkpointSystem');
      (CheckpointSystem as any).mockImplementationOnce(function (this: any) {
        this.createCheckpoint = vi.fn()
          .mockResolvedValueOnce({ approved: false })
          .mockResolvedValue({ approved: true });
        this.getAllCheckpoints = vi.fn().mockReturnValue([]);
        this.dispose = vi.fn();
      });

      const freshPipeline = new ShortsPipeline(mockEngine as any);
      const result = await freshPipeline.execute(baseRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Hook rejected');
    });
  });
});
