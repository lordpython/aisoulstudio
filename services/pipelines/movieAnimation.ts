/**
 * Movie/Animation Pipeline
 *
 * Thin wrapper around the existing story pipeline (services/ai/storyPipeline.ts)
 * that implements the FormatPipeline interface for the format router.
 *
 * Design:
 * - Keeps existing 2-layer architecture intact:
 *   - services/ai/storyPipeline.ts (core functions)
 *   - services/ai/production/tools/storyTools.ts (LangChain tool wrappers)
 * - Adds format metadata and FormatPipeline interface compliance
 * - Integrates with CheckpointSystem and ParallelExecutionEngine where possible
 *
 * Requirements: 24.1, 24.2, 24.3
 */

import type { FormatMetadata, VideoFormat } from '../../types';
import type { FormatPipeline, PipelineRequest, PipelineResult } from '../formatRouter';
import { formatRegistry } from '../formatRegistry';
import { runStoryPipeline, type StoryPipelineOptions, type StoryPipelineResult } from '../ai/storyPipeline';
import { CheckpointSystem } from '../checkpointSystem';
import { detectLanguage } from '../languageDetector';
import { storyModeStore } from '../ai/production/store';
import { agentLogger } from '../logger';

const FORMAT_ID: VideoFormat = 'movie-animation';
const log = agentLogger.child('MovieAnimationPipeline');

// ============================================================================
// Pipeline Implementation
// ============================================================================

export class MovieAnimationPipeline implements FormatPipeline {
  getMetadata(): FormatMetadata {
    return formatRegistry.getFormat(FORMAT_ID)!;
  }

  async validate(request: PipelineRequest): Promise<boolean> {
    return !!request.idea && request.idea.trim().length > 0;
  }

  /**
   * Execute the Movie/Animation pipeline by delegating to the existing
   * runStoryPipeline function. This ensures backward compatibility while
   * providing a consistent FormatPipeline interface.
   *
   * Requirements: 24.1 (use existing pipeline), 24.3 (format integration)
   */
  async execute(request: PipelineRequest): Promise<PipelineResult> {
    const language = request.language ?? detectLanguage(request.idea);
    const metadata = this.getMetadata();

    const checkpoints = new CheckpointSystem({ maxCheckpoints: metadata.checkpointCount });

    log.info(`Starting Movie/Animation pipeline: "${request.idea.slice(0, 60)}..." [${language}]`);

    try {
      // Build options compatible with the existing pipeline
      const pipelineOptions: StoryPipelineOptions = {
        topic: request.idea,
        generateCharacterRefs: true,
        generateVisuals: true,
        visualStyle: 'Cinematic',
        formatId: FORMAT_ID,
        genre: request.genre,
        language,
        onProgress: (progress) => {
          log.info(`[${progress.stage}] ${progress.message} (${progress.progress ?? 0}%)`);
        },
      };

      // Delegate to existing pipeline
      const result: StoryPipelineResult = await runStoryPipeline(pipelineOptions);

      if (!result.success) {
        checkpoints.dispose();
        return { success: false, error: result.error };
      }

      // Retrieve the session state populated by the story pipeline
      const state = storyModeStore.get(result.sessionId);

      // Ensure format metadata is present in state (Requirement 24.2)
      if (state && !state.formatId) {
        state.formatId = FORMAT_ID;
        state.language = language;
        state.updatedAt = Date.now();
        storyModeStore.set(result.sessionId, state);
      }

      checkpoints.dispose();

      log.info(`Movie/Animation pipeline complete: ${result.actCount} acts, ${result.sceneCount} scenes, ${result.characterCount} characters, ${result.visualCount} visuals`);

      return {
        success: true,
        partialResults: {
          sessionId: result.sessionId,
          actCount: result.actCount,
          sceneCount: result.sceneCount,
          characterCount: result.characterCount,
          visualCount: result.visualCount,
          state,
        },
      };

    } catch (error) {
      checkpoints.dispose();
      const msg = error instanceof Error ? error.message : String(error);
      log.error('Movie/Animation pipeline failed:', msg);
      return { success: false, error: msg };
    }
  }
}
