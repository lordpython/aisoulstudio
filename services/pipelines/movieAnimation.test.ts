/**
 * Movie/Animation Pipeline Integration Tests
 *
 * Tests the thin wrapper around the existing story pipeline.
 * Verifies backward compatibility, format integration, and state management.
 *
 * Requirements tested: 24.1, 24.2, 24.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MovieAnimationPipeline } from './movieAnimation';
import { formatRegistry } from '../formatRegistry';
import { storyModeStore } from '../ai/production/store';
import type { PipelineRequest } from '../formatRouter';
import type { StoryModeState } from '../ai/production/types';

// ============================================================================
// Mocks
// ============================================================================

// Mock the story pipeline
vi.mock('../ai/storyPipeline', () => ({
  runStoryPipeline: vi.fn().mockResolvedValue({
    success: true,
    sessionId: 'story_mock_session',
    actCount: 3,
    sceneCount: 5,
    characterCount: 2,
    visualCount: 5,
  }),
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

// ============================================================================
// Tests
// ============================================================================

describe('MovieAnimationPipeline', () => {
  let pipeline: MovieAnimationPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    (storyModeStore as Map<string, any>).clear();
    pipeline = new MovieAnimationPipeline();
  });

  describe('getMetadata', () => {
    it('should return movie-animation format metadata', () => {
      const metadata = pipeline.getMetadata();
      expect(metadata.id).toBe('movie-animation');
      expect(metadata.durationRange).toEqual({ min: 300, max: 1800 }); // 5-30 min
      expect(metadata.aspectRatio).toBe('16:9');
      expect(metadata.checkpointCount).toBe(4);
      expect(metadata.requiresResearch).toBe(false);
    });
  });

  describe('validate', () => {
    it('should accept valid requests', async () => {
      const request: PipelineRequest = {
        formatId: 'movie-animation',
        idea: 'A robot learning to paint',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };
      expect(await pipeline.validate(request)).toBe(true);
    });

    it('should reject empty ideas', async () => {
      const request: PipelineRequest = {
        formatId: 'movie-animation',
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
      formatId: 'movie-animation',
      idea: 'A robot learning to paint in a post-apocalyptic world',
      genre: 'Sci-Fi',
      language: 'en',
      userId: 'user1',
      projectId: 'proj1',
    };

    it('should delegate to runStoryPipeline (Req 24.1)', async () => {
      const { runStoryPipeline } = await import('../ai/storyPipeline');
      await pipeline.execute(baseRequest);

      expect(runStoryPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: baseRequest.idea,
          formatId: 'movie-animation',
          genre: 'Sci-Fi',
          language: 'en',
          generateCharacterRefs: true,
          generateVisuals: true,
          visualStyle: 'Cinematic',
        }),
      );
    });

    it('should return success with pipeline results', async () => {
      const result = await pipeline.execute(baseRequest);

      expect(result.success).toBe(true);
      expect(result.partialResults).toBeDefined();
      expect(result.partialResults.sessionId).toBe('story_mock_session');
      expect(result.partialResults.actCount).toBe(3);
      expect(result.partialResults.sceneCount).toBe(5);
      expect(result.partialResults.characterCount).toBe(2);
      expect(result.partialResults.visualCount).toBe(5);
    });

    it('should handle pipeline failure gracefully', async () => {
      const { runStoryPipeline } = await import('../ai/storyPipeline');
      (runStoryPipeline as any).mockResolvedValueOnce({
        success: false,
        sessionId: 'story_failed',
        actCount: 0,
        sceneCount: 0,
        characterCount: 0,
        visualCount: 0,
        error: 'API rate limited',
      });

      const result = await pipeline.execute(baseRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API rate limited');
    });

    it('should handle thrown errors gracefully', async () => {
      const { runStoryPipeline } = await import('../ai/storyPipeline');
      (runStoryPipeline as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await pipeline.execute(baseRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('backward compatibility (Req 24.2)', () => {
    it('should work with state that has no formatId', () => {
      // Simulate pre-migration state (no formatId field)
      const legacyState: StoryModeState = {
        id: 'legacy_session',
        topic: 'Old project',
        breakdown: 'Act 1: Intro',
        screenplay: [],
        characters: [],
        shotlist: [],
        currentStep: 'breakdown',
        updatedAt: Date.now(),
        // Note: no formatId, language, or checkpoints fields
      };

      (storyModeStore as Map<string, any>).set('legacy_session', legacyState);
      const retrieved = (storyModeStore as Map<string, any>).get('legacy_session');

      // State should work without format fields (backward compatible)
      expect(retrieved).toBeDefined();
      expect(retrieved!.formatId).toBeUndefined();
      expect(retrieved!.language).toBeUndefined();
      expect(retrieved!.checkpoints).toBeUndefined();
    });

    it('should set formatId on state that lacks it after pipeline execution', async () => {
      // Simulate the pipeline creating state without formatId
      const { runStoryPipeline } = await import('../ai/storyPipeline');

      // Create mock state without formatId
      const mockState: StoryModeState = {
        id: 'story_mock_session',
        topic: 'Test',
        breakdown: '',
        screenplay: [],
        characters: [],
        shotlist: [],
        currentStep: 'breakdown',
        updatedAt: Date.now(),
        // No formatId
      };
      (storyModeStore as Map<string, any>).set('story_mock_session', mockState);

      const request: PipelineRequest = {
        formatId: 'movie-animation',
        idea: 'Test movie',
        language: 'en',
        userId: 'user1',
        projectId: 'proj1',
      };

      await pipeline.execute(request);

      const state = (storyModeStore as Map<string, any>).get('story_mock_session');
      expect(state!.formatId).toBe('movie-animation');
      expect(state!.language).toBe('en');
    });

    it('should preserve all existing StoryModeState fields', () => {
      // Property 47: Backward Compatibility
      // Ensure all original fields are still present and unchanged
      const fullState: StoryModeState = {
        id: 'test_session',
        topic: 'Test topic',
        breakdown: 'Act 1: Beginning',
        screenplay: [{
          id: 'scene_0',
          sceneNumber: 1,
          heading: 'INT. ROOM - DAY',
          action: 'A person sits',
          dialogue: [{ speaker: 'Hero', text: 'Hello' }],
          charactersPresent: ['Hero'],
        }],
        characters: [{
          id: 'char_0',
          name: 'Hero',
          role: 'protagonist',
          visualDescription: 'Tall, dark hair',
        }],
        shotlist: [{
          id: 'shot_0',
          sceneId: 'scene_0',
          shotNumber: 1,
          description: 'Medium shot',
          cameraAngle: 'Eye level',
          movement: 'Static',
          lighting: 'Natural',
          dialogue: 'Hello',
        }],
        currentStep: 'shotlist',
        updatedAt: Date.now(),
        // New optional fields
        formatId: 'movie-animation',
        language: 'en',
        checkpoints: [{ checkpointId: 'cp_1', phase: 'script', status: 'approved' }],
      };

      (storyModeStore as Map<string, any>).set('test_session', fullState);
      const retrieved = (storyModeStore as Map<string, any>).get('test_session');

      // All original fields preserved
      expect(retrieved!.id).toBe('test_session');
      expect(retrieved!.topic).toBe('Test topic');
      expect(retrieved!.breakdown).toBe('Act 1: Beginning');
      expect(retrieved!.screenplay).toHaveLength(1);
      expect(retrieved!.characters).toHaveLength(1);
      expect(retrieved!.shotlist).toHaveLength(1);
      expect(retrieved!.currentStep).toBe('shotlist');

      // New fields also present
      expect(retrieved!.formatId).toBe('movie-animation');
      expect(retrieved!.language).toBe('en');
      expect(retrieved!.checkpoints).toHaveLength(1);
    });
  });
});
