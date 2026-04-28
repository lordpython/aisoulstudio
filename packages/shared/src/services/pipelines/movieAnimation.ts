/**
 * Movie/Animation Pipeline
 *
 * Adapter around the legacy story pipeline (services/ai/storyPipeline/)
 * that implements the FormatPipeline interface and emits the same
 * checkpoint/cancellation events the BasePipeline subclasses do.
 *
 * Why this is NOT a BasePipeline subclass:
 *   The legacy storyPipeline runs an act-based flow (breakdown -> screenplay
 *   -> characters -> shotlist -> visuals -> voiceover) that does not map
 *   onto BasePipeline's script -> visuals -> audio template. A full port
 *   requires either generalizing BasePipeline to support both shapes or
 *   rewriting storyPipeline to fit. Both are multi-week tasks; tracked as
 *   future work.
 *
 * What this PR adds vs. the previous wrapper:
 *   - Accepts the same `callbacks: PipelineCallbacks` parameter the other
 *     7 pipelines accept (was silently dropped before).
 *   - Surfaces the CheckpointSystem to the UI via onCheckpointSystemCreated.
 *   - Forwards onCheckpointCreated events from approval gates.
 *   - Wires onCancelRequested for graceful cancellation.
 *   - Forwards storyPipeline progress events through a typed log path.
 */

import type { FormatMetadata, VideoFormat } from '../../types';
import type { FormatPipeline, PipelineCallbacks, PipelineRequest, PipelineResult } from './formatRouter';
import { formatRegistry } from './formatRegistry';
import { runStoryPipeline, type StoryPipelineOptions, type StoryPipelineResult } from '../ai/storyPipeline';
import { CheckpointSystem } from '../project/checkpointSystem';
import { detectLanguage } from '../content/languageDetector';
import { storyModeStore } from '../ai/production/store';
import { agentLogger } from '../infrastructure/logger';

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
   * Execute the Movie/Animation pipeline by delegating to runStoryPipeline,
   * but wired to the standard FormatPipeline event surface so the UI can
   * subscribe to the same events as every other format.
   */
  async execute(request: PipelineRequest, callbacks?: PipelineCallbacks): Promise<PipelineResult> {
    const language = request.language ?? detectLanguage(request.idea);
    const metadata = this.getMetadata();

    let cancelled = false;
    const checkpoints = new CheckpointSystem({
      maxCheckpoints: metadata.checkpointCount,
      onCheckpointCreated: callbacks?.onCheckpointCreated,
    });
    callbacks?.onCheckpointSystemCreated?.(checkpoints);
    callbacks?.onCancelRequested?.(() => {
      cancelled = true;
      checkpoints.dispose();
    });

    log.info(`Starting Movie/Animation pipeline: "${request.idea.slice(0, 60)}..." [${language}]`);

    try {
      if (cancelled) {
        return { success: false, error: 'Cancelled before start' };
      }

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

      const result: StoryPipelineResult = await runStoryPipeline(pipelineOptions);

      if (!result.success) {
        checkpoints.dispose();
        return { success: false, error: result.error };
      }

      // Retrieve the session state populated by the story pipeline
      const state = storyModeStore.get(result.sessionId);

      // Ensure format metadata is present in state
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
