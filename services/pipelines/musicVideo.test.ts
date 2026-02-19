/**
 * Music Video Pipeline Integration Tests
 *
 * Tests complete pipeline execution, lyrics generation, beat metadata,
 * and beat-synchronized visuals. All external services are mocked.
 *
 * Requirements tested: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
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
  generateImageFromPrompt: vi.fn().mockResolvedValue('https://example.com/mv-image.png'),
}));

vi.mock('../prompt/imageStyleGuide', () => ({
  buildImageStyleGuide: vi.fn().mockReturnValue('mocked music video style guide'),
}));

vi.mock('../narratorService', () => ({
  narrateScene: vi.fn().mockResolvedValue({
    sceneId: 'scene_0',
    audioBlob: new Blob(['audio']),
    audioDuration: 60,
    transcript: 'Sung lyrics narration',
  }),
  getFormatVoiceForLanguage: vi.fn().mockReturnValue({
    voiceName: 'Aoede',
    pitch: 3,
    speakingRate: 1.1,
    stylePrompt: { persona: 'Vocalist', emotion: 'passionate' },
  }),
}));

vi.mock('../ai/storyPipeline', () => ({
  buildBreakdownPrompt: vi.fn().mockReturnValue('mocked breakdown prompt'),
  buildScreenplayPrompt: vi.fn().mockReturnValue('mocked screenplay prompt'),
  countScriptWords: vi.fn().mockReturnValue(200),
  validateDurationConstraint: vi.fn().mockReturnValue({ valid: true, estimatedSeconds: 180 }),
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

vi.mock('../ffmpeg/formatAssembly', () => {
  const beats = Array.from({ length: 36 }, (_, i) => ({
    timestamp: i * 0.5,
    intensity: i % 4 === 0 ? 1.0 : i % 2 === 0 ? 0.6 : 0.3,
  }));
  return {
    buildAssemblyRules: vi.fn().mockReturnValue({
      formatId: 'music-video',
      aspectRatio: '16:9',
      defaultTransition: 'fade',
      transitionDuration: 0.5,
      useBeatSync: true,
      beatMetadata: { bpm: 120, durationSeconds: 180, beats },
    }),
    generateBeatMetadata: vi.fn().mockReturnValue({
      bpm: 120,
      durationSeconds: 180,
      beats,
    }),
    alignTransitionsToBeat: vi.fn().mockReturnValue([0, 60, 120]),
  };
});

// ============================================================================
// Import pipeline after mocks
// ============================================================================

import { MusicVideoPipeline } from './musicVideo';
import { storyModeStore } from '../ai/production/store';

// ============================================================================
// Tests
// ============================================================================

describe('MusicVideoPipeline', () => {
  let pipeline: MusicVideoPipeline;

  const mockEngine = {
    execute: vi.fn().mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/mv-0.png' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/mv-1.png' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/mv-2.png' }, attempts: 1, duration: 1000 },
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
          { title: 'Verse 1', emotionalHook: 'longing', narrativeBeat: 'Set the scene' },
          { title: 'Chorus', emotionalHook: 'passion', narrativeBeat: 'Peak emotion' },
          { title: 'Verse 2', emotionalHook: 'tension', narrativeBeat: 'Rising stakes' },
        ],
      })
      .mockResolvedValueOnce({
        scenes: [
          { heading: 'VERSE 1 - DAWN', action: 'Slow pan over empty city streets', dialogue: [{ speaker: 'Vocalist', text: 'In the fading light of dawn' }] },
          { heading: 'CHORUS - PEAK', action: 'Dynamic jump cuts matching beat', dialogue: [{ speaker: 'Vocalist', text: 'We were never meant to fall apart' }] },
          { heading: 'VERSE 2 - NIGHT', action: 'Neon reflections in rain', dialogue: [{ speaker: 'Vocalist', text: 'The city speaks in silent rhymes' }] },
        ],
      });

    mockEngine.execute.mockResolvedValue([
      { taskId: 'visual_0', success: true, data: { sceneId: 'scene_0', imageUrl: 'https://example.com/mv-0.png' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_1', success: true, data: { sceneId: 'scene_1', imageUrl: 'https://example.com/mv-1.png' }, attempts: 1, duration: 1000 },
      { taskId: 'visual_2', success: true, data: { sceneId: 'scene_2', imageUrl: 'https://example.com/mv-2.png' }, attempts: 1, duration: 1000 },
    ]);

    pipeline = new MusicVideoPipeline(mockEngine as any);
  });

  describe('getMetadata', () => {
    it('should return music-video format metadata (Req 8.1)', () => {
      const metadata = pipeline.getMetadata();
      expect(metadata.id).toBe('music-video');
      expect(metadata.durationRange).toEqual({ min: 120, max: 480 });
      expect(metadata.aspectRatio).toBe('16:9');
      expect(metadata.checkpointCount).toBe(3);
      expect(metadata.requiresResearch).toBe(false);
    });
  });

  describe('validate', () => {
    it('should accept valid requests', async () => {
      const request: PipelineRequest = {
        formatId: 'music-video',
        idea: 'A love story told through city lights at night',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(true);
    });

    it('should reject empty ideas', async () => {
      const request: PipelineRequest = {
        formatId: 'music-video',
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
      formatId: 'music-video',
      idea: 'A melancholic journey through a city at night',
      genre: 'Pop',
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

    it('should generate lyrics from the idea (Req 8.2)', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.partialResults.lyrics).toBeDefined();
      expect(result.partialResults.lyrics.length).toBeGreaterThan(0);
      expect(result.partialResults.lyrics[0]).toHaveProperty('section');
      expect(result.partialResults.lyrics[0]).toHaveProperty('lines');
    });

    it('should generate beat metadata for music composition (Req 8.3)', async () => {
      const { generateBeatMetadata } = await import('../ffmpeg/formatAssembly');
      const result = await pipeline.execute(baseRequest);

      expect(generateBeatMetadata).toHaveBeenCalledWith(
        120,    // Pop BPM
        expect.any(Number),
      );
      expect(result.partialResults.beatMetadata).toBeDefined();
      expect(result.partialResults.beatMetadata.bpm).toBe(120);
      expect(result.partialResults.beatMetadata.beats.length).toBeGreaterThan(0);
    });

    it('should align visual transitions to beats (Req 8.6)', async () => {
      const { alignTransitionsToBeat } = await import('../ffmpeg/formatAssembly');
      const result = await pipeline.execute(baseRequest);

      expect(alignTransitionsToBeat).toHaveBeenCalled();
      expect(result.partialResults.beatAlignedTransitions).toBeDefined();
      expect(result.partialResults.beatAlignedTransitions.length).toBeGreaterThan(0);
    });

    it('should enable beat sync in assembly rules (Req 8.6)', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.partialResults.assemblyRules.useBeatSync).toBe(true);
    });

    it('should use genre-specific BPM for different genres', async () => {
      const hipHopRequest: PipelineRequest = {
        ...baseRequest,
        genre: 'Hip Hop',
      };

      const { generateBeatMetadata } = await import('../ffmpeg/formatAssembly');
      await pipeline.execute(hipHopRequest);

      expect(generateBeatMetadata).toHaveBeenCalledWith(
        95,   // Hip Hop BPM
        expect.any(Number),
      );
    });

    it('should persist session state with format metadata', async () => {
      const result = await pipeline.execute(baseRequest);
      const state = (storyModeStore as Map<string, any>).get(result.partialResults.sessionId);

      expect(state).toBeDefined();
      expect(state.formatId).toBe('music-video');
      expect(state.language).toBe('en');
    });

    it('should queue genre-styled visual tasks for parallel execution (Req 8.4)', async () => {
      // The parallel engine mock returns pre-built results without running tasks;
      // verify it is called with visual tasks for each screenplay scene
      await pipeline.execute(baseRequest);

      expect(mockEngine.execute).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'visual', retryable: true }),
        ]),
        expect.any(Object),
      );
    });

    it('should handle checkpoint rejection at lyrics stage (Req 8.5)', async () => {
      const { CheckpointSystem } = await import('../checkpointSystem');
      (CheckpointSystem as any).mockImplementationOnce(function (this: any) {
        this.createCheckpoint = vi.fn()
          .mockResolvedValueOnce({ approved: false })
          .mockResolvedValue({ approved: true });
        this.getAllCheckpoints = vi.fn().mockReturnValue([]);
        this.dispose = vi.fn();
      });

      const freshPipeline = new MusicVideoPipeline(mockEngine as any);
      const result = await freshPipeline.execute(baseRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lyrics rejected');
    });
  });
});
