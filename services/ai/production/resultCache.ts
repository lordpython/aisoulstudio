/**
 * Result Cache
 *
 * Checks for cached tool results to avoid re-execution.
 * Extracted from agentCore.ts for focused responsibility.
 *
 * Requirements: 10.2, 10.5 — Use cached results without re-execution
 */

import { ProductionState } from "./types";
import { GeneratedImage } from "../../../types";

/**
 * Check if results are already cached for a tool to avoid re-execution.
 */
export function checkResultCache(
    toolName: string,
    toolArgs: Record<string, unknown>,
    state: ProductionState | null
): { cached: boolean; result?: Record<string, unknown> } {
    if (!state) {
        return { cached: false };
    }

    switch (toolName) {
        case 'generate_visuals':
            if (state.visuals &&
                state.contentPlan &&
                state.visuals.length >= state.contentPlan.scenes.length &&
                state.visuals.every(v => v.imageUrl)) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        visualCount: state.visuals.length,
                        message: `Visuals already exist (${state.visuals.length}) - using cached results`,
                    }
                };
            }
            break;

        case 'narrate_scenes':
            if (state.narrationSegments &&
                state.contentPlan &&
                state.narrationSegments.length >= state.contentPlan.scenes.length &&
                state.narrationSegments.every(s => s.audioBlob)) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        segmentCount: state.narrationSegments.length,
                        totalDuration: state.contentPlan.totalDuration,
                        message: `Narration already exists (${state.narrationSegments.length} segments) - using cached results`,
                    }
                };
            }
            break;

        case 'plan_sfx':
            if (state.sfxPlan && state.sfxPlan.scenes.length > 0) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        sceneCount: state.sfxPlan.scenes.length,
                        message: `SFX plan already exists (${state.sfxPlan.scenes.length} scenes) - using cached results`,
                    }
                };
            }
            break;

        case 'mix_audio_tracks':
            if (state.mixedAudio && state.mixedAudio.audioBlob) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        duration: state.mixedAudio.duration,
                        message: `Audio already mixed - using cached results`,
                    }
                };
            }
            break;

        case 'generate_subtitles':
            if (state.subtitles && state.subtitles.content) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        format: state.subtitles.format,
                        segmentCount: state.subtitles.segmentCount,
                        message: `Subtitles already generated (${state.subtitles.format}) - using cached results`,
                    }
                };
            }
            break;

        case 'export_final_video':
            if (state.exportResult && state.exportResult.videoBlob) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        format: state.exportResult.format,
                        duration: state.exportResult.duration,
                        downloadUrl: state.exportResult.downloadUrl,
                        message: `Video already exported (${state.exportResult.format}) - using cached results`,
                    }
                };
            }
            break;

        case 'animate_image': {
            const sceneIndex = toolArgs.sceneIndex as number | undefined;
            if (sceneIndex !== undefined &&
                state.visuals &&
                state.visuals[sceneIndex] &&
                (state.visuals[sceneIndex] as GeneratedImage & { videoUrl?: string }).videoUrl) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        sceneIndex,
                        message: `Scene ${sceneIndex} already animated - using cached results`,
                    }
                };
            }
            break;
        }
    }

    return { cached: false };
}
