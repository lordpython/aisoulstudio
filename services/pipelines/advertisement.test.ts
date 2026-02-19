/**
 * Advertisement Pipeline Integration Tests
 *
 * Tests complete pipeline execution, CTA placement, and format compliance.
 * All external services (LLM, image gen, TTS) are mocked.
 *
 * Requirements tested: 4.1, 4.2, 4.4, 4.5, 4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineRequest } from '../formatRouter';

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
  generateImageFromPrompt: vi.fn().mockResolvedValue('https://example.com/ad-image.png'),
}));

vi.mock('../prompt/imageStyleGuide', () => ({
  buildImageStyleGuide: vi.fn().mockReturnValue('mocked style guide'),
}));

vi.mock('../narratorService', () => ({
  narrateScene: vi.fn().mockResolvedValue({
    sceneId: 'scene_0',
    audioBlob: new Blob(['audio']),
    audioDuration: 10,
    transcript: 'Test ad narration',
  }),
  getFormatVoiceForLanguage: vi.fn().mockReturnValue({
    voiceName: 'Puck',
    pitch: 2,
    speakingRate: 1.25,
    stylePrompt: { persona: 'Commercial voice artist', emotion: 'confident' },
  }),
}));

vi.mock('../ai/storyPipeline', () => ({
  buildBreakdownPrompt: vi.fn().mockReturnValue('mocked breakdown prompt'),
  buildScreenplayPrompt: vi.fn().mockReturnValue('mocked screenplay prompt'),
  countScriptWords: vi.fn().mockReturnValue(50),
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
    formatId: 'advertisement',
    aspectRatio: '16:9',
    defaultTransition: 'none',
    transitionDuration: 0.3,
    ctaMarker: { text: 'Learn More', startTime: 25, duration: 5 },
  }),
  buildCTAMarker: vi.fn().mockImplementation((text: string, totalDuration: number) => ({
    text,
    startTime: Math.max(0, totalDuration - 5),
    duration: Math.min(5, totalDuration),
  })),
  validateCTAPosition: vi.fn().mockReturnValue(true),
}));

// ============================================================================
// Now import the pipeline (after all mocks are declared)
// ============================================================================

import { AdvertisementPipeline } from './advertisement';
import { storyModeStore } from '../ai/production/store';

// ============================================================================
// Tests
// ============================================================================

describe('AdvertisementPipeline', () => {
  let pipeline: AdvertisementPipeline;

  const mockEngine = {
    execute: vi.fn().mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/ad-0.png' }, attempts: 1, duration: 500 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/ad-1.png' }, attempts: 1, duration: 500 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/ad-2.png' }, attempts: 1, duration: 500 },
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
          { title: 'Problem Hook', emotionalHook: 'urgency', narrativeBeat: 'Show the pain point' },
          { title: 'Solution Reveal', emotionalHook: 'desire', narrativeBeat: 'Introduce product' },
          { title: 'CTA Moment', emotionalHook: 'action', narrativeBeat: 'Drive conversion' },
        ],
      })
      .mockResolvedValueOnce({
        scenes: [
          { heading: 'PROBLEM HOOK', action: 'Fast cuts showing frustration', dialogue: [{ speaker: 'Voiceover', text: 'Tired of wasting time?' }] },
          { heading: 'SOLUTION REVEAL', action: 'Product demo close-up', dialogue: [{ speaker: 'Voiceover', text: 'Introducing SmartApp.' }] },
          { heading: 'FINAL CTA FRAME', action: 'Logo with CTA text', dialogue: [{ speaker: 'Voiceover', text: 'Download now — free for 30 days.' }] },
        ],
      });

    mockEngine.execute.mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/ad-0.png' }, attempts: 1, duration: 500 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/ad-1.png' }, attempts: 1, duration: 500 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/ad-2.png' }, attempts: 1, duration: 500 },
    ]);

    pipeline = new AdvertisementPipeline(mockEngine as any);
  });

  describe('getMetadata', () => {
    it('should return advertisement format metadata (Req 4.1)', () => {
      const metadata = pipeline.getMetadata();
      expect(metadata.id).toBe('advertisement');
      expect(metadata.durationRange).toEqual({ min: 15, max: 60 });
      expect(metadata.aspectRatio).toBe('16:9');
      expect(metadata.checkpointCount).toBe(2);
      expect(metadata.requiresResearch).toBe(false);
    });
  });

  describe('validate', () => {
    it('should accept valid requests', async () => {
      const request: PipelineRequest = {
        formatId: 'advertisement',
        idea: 'SmartApp productivity tool',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(true);
    });

    it('should reject empty ideas', async () => {
      const request: PipelineRequest = {
        formatId: 'advertisement',
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
      formatId: 'advertisement',
      idea: 'SmartApp — the productivity tool that saves you 2 hours a day',
      genre: 'Product Launch',
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
    });

    it('should include CTA marker in results (Req 4.6)', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.partialResults.ctaMarker).toBeDefined();

      const ctaMarker = result.partialResults.ctaMarker;
      const totalDuration = result.partialResults.totalDuration;

      // CTA should be in the final 5 seconds
      expect(ctaMarker.startTime).toBeGreaterThanOrEqual(Math.max(0, totalDuration - 5));
    });

    it('should extract CTA text from final scene dialogue (Req 4.2)', async () => {
      const result = await pipeline.execute(baseRequest);
      const ctaMarker = result.partialResults.ctaMarker;

      expect(ctaMarker.text).toBe('Download now — free for 30 days.');
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
      expect(state.formatId).toBe('advertisement');
      expect(state.language).toBe('en');
    });

    it('should use energetic voice profile (Req 4.4)', async () => {
      const { getFormatVoiceForLanguage } = await import('../narratorService');
      await pipeline.execute(baseRequest);

      expect(getFormatVoiceForLanguage).toHaveBeenCalledWith('advertisement', 'en');
    });
  });
});
