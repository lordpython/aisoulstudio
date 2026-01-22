/**
 * Export Tools - LangChain tools for video export
 * 
 * Provides tools for exporting final video:
 * - export_final_video: Render video with all available assets
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import {
  exportVideoWithFFmpeg,
  exportVideoClientSide,
  isClientSideExportAvailable,
  type ExportConfig,
  type ExportProgress,
} from "../ffmpeg";
import { SongData, GeneratedImage, NarrationSegment, VideoSFXPlan, SubtitleItem } from "../../types";
import { getSubtitles, type SubtitleResult } from "./subtitleTools";
import { getMixedAudio, type MixedAudioResult } from "./audioMixingTools";
import { productionStore } from "../ai/productionAgent";
import { concatenateNarrationSegments } from "./audioUtils";

// --- Types ---

/**
 * Result of video export operation
 */
export interface ExportResult {
  /** Exported video as a Blob */
  videoBlob: Blob;
  /** Video format (mp4 or webm) */
  format: "mp4" | "webm";
  /** Aspect ratio used */
  aspectRatio: string;
  /** Total duration in seconds */
  duration: number;
  /** File size in bytes */
  fileSize: number;
  /** Blob URL for download */
  downloadUrl: string;
  /** Whether subtitles were included */
  includesSubtitles: boolean;
  /** Assets included in the export */
  includedAssets: {
    visuals: number;
    narration: boolean;
    music: boolean;
    sfx: boolean;
    subtitles: boolean;
  };
}

/**
 * Asset bundle for fallback when export fails
 */
export interface AssetBundle {
  /** Visual assets with URLs */
  visuals: Array<{ sceneId: string; imageUrl: string; type: "image" | "video" }>;
  /** Narration audio URL */
  narrationUrl?: string;
  /** Music audio URL */
  musicUrl?: string;
  /** SFX plan */
  sfxPlan?: VideoSFXPlan;
  /** Subtitles content */
  subtitles?: SubtitleResult;
  /** Mixed audio URL */
  mixedAudioUrl?: string;
}

/**
 * Session storage for export results
 */
const exportStore = new Map<string, ExportResult>();

/**
 * Get export result for a session
 */
export function getExportResult(sessionId: string): ExportResult | undefined {
  return exportStore.get(sessionId);
}

/**
 * Store export result for a session
 */
export function setExportResult(sessionId: string, result: ExportResult): void {
  exportStore.set(sessionId, result);
}

/**
 * Clear export result for a session
 */
export function clearExportResult(sessionId: string): boolean {
  return exportStore.delete(sessionId);
}

// --- Tool Schema ---

/**
 * Schema for export_final_video tool
 */
const ExportFinalVideoSchema = z.object({
  contentPlanId: z.string().describe("Session ID containing all production assets"),
  format: z.enum(["mp4", "webm"]).default("mp4").describe("Output video format (default: mp4)"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9").describe("Video aspect ratio (default: 16:9)"),
  includeSubtitles: z.boolean().default(true).describe("Whether to include subtitles in the video (default: true)"),
  quality: z.enum(["draft", "standard", "high"]).default("standard").describe("Export quality preset (default: standard)"),
  // Asset inputs - all optional, will be auto-fetched from session if not provided
  visuals: z.array(z.object({
    sceneId: z.string().describe("Scene ID"),
    imageUrl: z.string().describe("URL to the visual asset"),
    type: z.enum(["image", "video"]).default("image").describe("Asset type"),
    startTime: z.number().optional().describe("Start time in seconds"),
    duration: z.number().optional().describe("Duration in seconds"),
  })).optional().describe("Optional array of visual assets. If not provided, will be auto-fetched from session visuals."),
  narrationUrl: z.string().optional().describe("Optional URL to the narration audio file. If not provided, will be auto-fetched from session narration."),
  musicUrl: z.string().optional().describe("URL to the background music file"),
  sfxPlan: z.any().optional().describe("SFX plan with audio URLs"),
  totalDuration: z.number().optional().describe("Total video duration in seconds. If not provided, will be calculated from content plan."),
  // Optional: use pre-mixed audio instead of individual tracks
  useMixedAudio: z.boolean().default(false).describe("Use pre-mixed audio from mix_audio_tracks instead of individual tracks"),
});

// --- Helper Functions ---

/**
 * Map aspect ratio string to orientation
 */
function getOrientation(aspectRatio: string): "landscape" | "portrait" {
  if (aspectRatio === "9:16") return "portrait";
  return "landscape";
}

/**
 * Build SongData structure from export inputs
 */
function buildSongData(
  visuals: Array<{ sceneId: string; imageUrl: string; type: "image" | "video"; startTime?: number; duration?: number }>,
  narrationUrl: string | undefined,
  mixedAudioUrl: string | undefined,
  subtitles: SubtitleResult | undefined,
  useMixedAudio: boolean
): SongData {
  // Determine audio URL - prefer mixed audio if available and requested
  const audioUrl = useMixedAudio && mixedAudioUrl ? mixedAudioUrl : narrationUrl || "";

  // Build generated images array
  const generatedImages: GeneratedImage[] = visuals.map(v => ({
    promptId: v.sceneId,
    imageUrl: v.imageUrl,
    type: v.type,
  }));

  // Build parsed subtitles from subtitle result
  const parsedSubtitles: SubtitleItem[] = subtitles?.items || [];

  return {
    fileName: "production_export",
    audioUrl,
    srtContent: subtitles?.content || "",
    parsedSubtitles,
    prompts: visuals.map(v => ({
      id: v.sceneId,
      text: "",
      mood: "",
      timestampSeconds: v.startTime || 0,
    })),
    generatedImages,
  };
}

/**
 * Build export configuration
 */
function buildExportConfig(
  aspectRatio: string,
  quality: string,
  sfxPlan: VideoSFXPlan | null,
  sceneTimings: Array<{ sceneId: string; startTime: number; duration: number }>
): Partial<ExportConfig> {
  const orientation = getOrientation(aspectRatio);
  
  // Quality presets
  const qualitySettings: Record<string, Partial<ExportConfig>> = {
    draft: {
      useModernEffects: false,
      transitionDuration: 0.5,
    },
    standard: {
      useModernEffects: true,
      transitionDuration: 1.0,
    },
    high: {
      useModernEffects: true,
      transitionDuration: 1.5,
    },
  };

  return {
    orientation,
    ...qualitySettings[quality] || qualitySettings.standard,
    sfxPlan,
    sceneTimings: sceneTimings.map(s => ({
      sceneId: s.sceneId,
      startTime: s.startTime,
      duration: s.duration,
    })),
    contentMode: "story",
  };
}

/**
 * Create asset bundle for fallback
 */
function createAssetBundle(
  visuals: Array<{ sceneId: string; imageUrl: string; type: "image" | "video" }>,
  narrationUrl: string | undefined,
  musicUrl: string | undefined,
  sfxPlan: VideoSFXPlan | undefined,
  subtitles: SubtitleResult | undefined,
  mixedAudioUrl: string | undefined
): AssetBundle {
  return {
    visuals: visuals.map(v => ({
      sceneId: v.sceneId,
      imageUrl: v.imageUrl,
      type: v.type as "image" | "video",
    })),
    narrationUrl,
    musicUrl,
    sfxPlan,
    subtitles,
    mixedAudioUrl,
  };
}

// --- Tool Implementation ---

/**
 * Export Final Video Tool
 * 
 * Renders the final video with all available assets including visuals,
 * narration, music, SFX, and subtitles.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export const exportFinalVideoTool = tool(
  async ({
    contentPlanId,
    format = "mp4",
    aspectRatio = "16:9",
    includeSubtitles = true,
    quality = "standard",
    visuals,
    narrationUrl,
    musicUrl,
    sfxPlan,
    totalDuration,
    useMixedAudio = false,
  }) => {
    console.log(`[ExportTools] Exporting video for session: ${contentPlanId}`);
    console.log(`[ExportTools] Format: ${format}, Aspect: ${aspectRatio}, Quality: ${quality}`);

    // Get session state for auto-fetching missing data
    const state = productionStore.get(contentPlanId);
    if (!state) {
      return JSON.stringify({
        success: false,
        error: "Production session not found",
        suggestion: "Run plan_video first to create a production session",
      });
    }

    // Auto-fetch visuals from session if not provided
    let finalVisuals = visuals;
    if (!finalVisuals || finalVisuals.length === 0) {
      if (!state.visuals || state.visuals.length === 0) {
        return JSON.stringify({
          success: false,
          error: "No visuals found in session and none provided",
          suggestion: "Run generate_visuals first to create visual assets",
        });
      }

      // Build visuals array from session state
      // Calculate startTime from cumulative scene durations (Scene type doesn't have startTime)
      const scenes = state.contentPlan?.scenes || [];
      finalVisuals = state.visuals.map((visual, index) => {
        // Calculate start time by summing durations of all previous scenes
        let startTime = 0;
        for (let i = 0; i < index && i < scenes.length; i++) {
          startTime += scenes[i].duration || 0;
        }
        return {
          sceneId: visual.promptId,
          imageUrl: visual.imageUrl,
          type: visual.type || "image" as "image" | "video",
          startTime,
          duration: scenes[index]?.duration,
        };
      });
      console.log(`[ExportTools] Auto-fetched ${finalVisuals.length} visuals from session`);
    }

    // Auto-fetch narration URL from session if not provided
    let finalNarrationUrl = narrationUrl;
    if (!finalNarrationUrl && !useMixedAudio) {
      if (!state.narrationSegments || state.narrationSegments.length === 0) {
        return JSON.stringify({
          success: false,
          error: "No narration found in session and no narration URL provided",
          suggestion: "Run narrate_scenes first or set useMixedAudio=true if audio was pre-mixed",
        });
      }

      // Concatenate all narration segments into a single audio blob
      try {
        console.log(`[ExportTools] Concatenating ${state.narrationSegments.length} narration segments`);
        const concatenatedBlob = await concatenateNarrationSegments(state.narrationSegments);
        finalNarrationUrl = URL.createObjectURL(concatenatedBlob);
        console.log(`[ExportTools] Auto-fetched narration URL from concatenated audio (${Math.round(concatenatedBlob.size / 1024)}KB)`);
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to concatenate narration segments: ${error instanceof Error ? error.message : String(error)}`,
          suggestion: "Check that all narration segments have valid audio blobs",
        });
      }
    }

    // Auto-fetch total duration from content plan if not provided
    let finalDuration = totalDuration;
    if (!finalDuration && state.contentPlan) {
      finalDuration = state.contentPlan.totalDuration;
      console.log(`[ExportTools] Auto-fetched duration from content plan: ${finalDuration}s`);
    }

    if (!finalDuration) {
      return JSON.stringify({
        success: false,
        error: "No duration provided and content plan has no duration",
        suggestion: "Provide totalDuration parameter or ensure content plan has a valid duration",
      });
    }

    // Auto-fetch SFX plan if not provided
    let finalSfxPlan = sfxPlan;
    if (!finalSfxPlan && state.sfxPlan) {
      finalSfxPlan = state.sfxPlan;
      console.log(`[ExportTools] Auto-fetched SFX plan from session`);
    }

    console.log(`[ExportTools] Visuals: ${finalVisuals.length}, Duration: ${finalDuration}s`);

    // Get subtitles if requested
    let subtitles: SubtitleResult | undefined;
    if (includeSubtitles) {
      subtitles = getSubtitles(contentPlanId);
      if (!subtitles) {
        console.log(`[ExportTools] No subtitles found for session, continuing without`);
      }
    }

    // Get mixed audio if requested
    let mixedAudio: MixedAudioResult | undefined;
    let mixedAudioUrl: string | undefined;
    if (useMixedAudio) {
      mixedAudio = getMixedAudio(contentPlanId);
      if (mixedAudio) {
        mixedAudioUrl = URL.createObjectURL(mixedAudio.audioBlob);
        console.log(`[ExportTools] Using pre-mixed audio (${Math.round(mixedAudio.duration)}s)`);
      } else {
        console.log(`[ExportTools] No mixed audio found, falling back to narration`);
        // FALLBACK: If mixed audio requested but not found, try to get narration
        if (!finalNarrationUrl && state.narrationSegments && state.narrationSegments.length > 0) {
          try {
            console.log(`[ExportTools] Fallback: Concatenating ${state.narrationSegments.length} narration segments`);
            const concatenatedBlob = await concatenateNarrationSegments(state.narrationSegments);
            finalNarrationUrl = URL.createObjectURL(concatenatedBlob);
            console.log(`[ExportTools] Fallback: Created narration URL (${Math.round(concatenatedBlob.size / 1024)}KB)`);
          } catch (error) {
            console.error(`[ExportTools] Fallback narration concatenation failed:`, error);
          }
        }
      }
    }

    // Build scene timings from visuals
    const sceneTimings = finalVisuals.map((v, index) => {
      const startTime = v.startTime ?? (index * (finalDuration / finalVisuals.length));
      const duration = v.duration ?? (finalDuration / finalVisuals.length);
      return {
        sceneId: v.sceneId,
        startTime,
        duration,
      };
    });

    // Build SongData for export
    const songData = buildSongData(
      finalVisuals,
      finalNarrationUrl,
      mixedAudioUrl,
      includeSubtitles ? subtitles : undefined,
      useMixedAudio && !!mixedAudioUrl
    );

    // Build export config
    const exportConfig = buildExportConfig(
      aspectRatio,
      quality,
      finalSfxPlan as VideoSFXPlan | null,
      sceneTimings
    );

    // Track progress
    let lastProgress: ExportProgress | null = null;
    const onProgress = (progress: ExportProgress) => {
      lastProgress = progress;
      console.log(`[ExportTools] Progress: ${progress.stage} - ${progress.progress}% - ${progress.message}`);
    };

    try {
      // Determine export method
      const useClientSide = isClientSideExportAvailable();
      console.log(`[ExportTools] Using ${useClientSide ? 'client-side' : 'server-side'} export`);

      let videoBlob: Blob;
      
      if (useClientSide) {
        videoBlob = await exportVideoClientSide(songData, onProgress, exportConfig);
      } else {
        videoBlob = await exportVideoWithFFmpeg(songData, onProgress, exportConfig);
      }

      // Create download URL
      const downloadUrl = URL.createObjectURL(videoBlob);

      // Build result
      const result: ExportResult = {
        videoBlob,
        format,
        aspectRatio,
        duration: finalDuration,
        fileSize: videoBlob.size,
        downloadUrl,
        includesSubtitles: includeSubtitles && !!subtitles,
        includedAssets: {
          visuals: finalVisuals.length,
          narration: !!finalNarrationUrl || (useMixedAudio && !!mixedAudio),
          music: !!musicUrl || (useMixedAudio && mixedAudio?.tracks.music.present) || false,
          sfx: !!finalSfxPlan || (useMixedAudio && mixedAudio?.tracks.sfx.present) || false,
          subtitles: includeSubtitles && !!subtitles,
        },
      };

      // Store result
      setExportResult(contentPlanId, result);

      // Also store video blob in production state for cloud upload
      const state = productionStore.get(contentPlanId);
      if (state) {
        state.exportedVideo = videoBlob;
        state.exportResult = result;
        productionStore.set(contentPlanId, state);
      }

      return JSON.stringify({
        success: true,
        sessionId: contentPlanId,
        downloadUrl,
        format,
        aspectRatio,
        duration: Math.round(finalDuration * 100) / 100,
        fileSizeMB: Math.round(videoBlob.size / (1024 * 1024) * 100) / 100,
        includedAssets: result.includedAssets,
        message: `Successfully exported ${format.toUpperCase()} video (${Math.round(finalDuration)}s, ${Math.round(videoBlob.size / (1024 * 1024) * 10) / 10}MB)`,
      });

    } catch (error) {
      console.error("[ExportTools] Export error:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Create asset bundle as fallback
      const assetBundle = createAssetBundle(
        finalVisuals,
        finalNarrationUrl,
        musicUrl,
        finalSfxPlan as VideoSFXPlan | undefined,
        subtitles,
        mixedAudioUrl
      );

      // Generate asset bundle download info
      const assetBundleInfo = {
        visualCount: assetBundle.visuals.length,
        hasNarration: !!assetBundle.narrationUrl,
        hasMusic: !!assetBundle.musicUrl,
        hasSfx: !!assetBundle.sfxPlan,
        hasSubtitles: !!assetBundle.subtitles,
        hasMixedAudio: !!assetBundle.mixedAudioUrl,
      };

      return JSON.stringify({
        success: false,
        error: errorMessage,
        fallback: "asset_bundle",
        assetBundle: assetBundleInfo,
        assetBundleData: assetBundle,
        suggestion: "Export failed. An asset bundle has been provided as fallback. You can download individual assets and assemble them manually, or retry the export.",
        message: `Export failed: ${errorMessage}. Asset bundle available with ${assetBundle.visuals.length} visuals.`,
      });
    }
  },
  {
    name: "export_final_video",
    description: "Export the final video with all available assets. All assets (visuals, narration, SFX) are automatically fetched from the session - you only need to provide contentPlanId. Optionally specify format (mp4/webm), aspectRatio (16:9/9:16/1:1), quality (draft/standard/high), or includeSubtitles. If export fails, provides an asset bundle as fallback for manual assembly.",
    schema: ExportFinalVideoSchema,
  }
);

// --- Export all export tools ---

export const exportTools = [
  exportFinalVideoTool,
];
