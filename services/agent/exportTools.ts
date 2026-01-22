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
  EXPORT_PRESETS,
  getExportPreset,
  getAllPresetIds,
  type ExportPresetId,
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
  // Platform preset - overrides format, aspectRatio, and quality if provided
  preset: z.enum([
    "youtube-landscape", "youtube-shorts", "tiktok",
    "instagram-feed", "instagram-reels", "instagram-story",
    "twitter", "linkedin", "draft-preview", "high-quality", "podcast-video"
  ]).optional().describe("Platform preset (e.g., 'tiktok', 'youtube-shorts', 'instagram-reels'). Overrides format, aspectRatio, and quality settings."),
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
    preset,
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
    // Apply preset if provided
    let finalFormat = format;
    let finalAspectRatio = aspectRatio;
    let finalQuality = quality;
    let presetConfig: Partial<ExportConfig> = {};

    if (preset) {
      const presetData = getExportPreset(preset as ExportPresetId);
      if (presetData) {
        finalAspectRatio = presetData.aspectRatio === "4:5" ? "1:1" : presetData.aspectRatio; // 4:5 not supported, fallback to 1:1
        finalQuality = presetData.quality;
        presetConfig = presetData.config;
        console.log(`[ExportTools] Using preset: ${preset} (${presetData.name})`);
      }
    }

    console.log(`[ExportTools] Exporting video for session: ${contentPlanId}`);
    console.log(`[ExportTools] Format: ${finalFormat}, Aspect: ${finalAspectRatio}, Quality: ${finalQuality}${preset ? `, Preset: ${preset}` : ""}`);

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

    // Build export config with preset overrides
    const baseExportConfig = buildExportConfig(
      finalAspectRatio,
      finalQuality,
      finalSfxPlan as VideoSFXPlan | null,
      sceneTimings
    );

    // Merge preset config if using a preset
    const exportConfig = preset ? { ...baseExportConfig, ...presetConfig } : baseExportConfig;

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
        format: finalFormat,
        aspectRatio: finalAspectRatio,
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
        format: finalFormat,
        aspectRatio: finalAspectRatio,
        quality: finalQuality,
        preset: preset || undefined,
        duration: Math.round(finalDuration * 100) / 100,
        fileSizeMB: Math.round(videoBlob.size / (1024 * 1024) * 100) / 100,
        includedAssets: result.includedAssets,
        message: `Successfully exported ${finalFormat.toUpperCase()} video (${Math.round(finalDuration)}s, ${Math.round(videoBlob.size / (1024 * 1024) * 10) / 10}MB)${preset ? ` using ${preset} preset` : ""}`,
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
    description: "Export the final video with all available assets. All assets (visuals, narration, SFX) are automatically fetched from the session - you only need to provide contentPlanId. Use 'preset' to apply platform-optimized settings (e.g., 'tiktok', 'youtube-shorts', 'instagram-reels'). Or manually specify format (mp4/webm), aspectRatio (16:9/9:16/1:1), quality (draft/standard/high). Presets automatically configure aspect ratio, quality, orientation, and transitions for the target platform. If export fails, provides an asset bundle as fallback for manual assembly.",
    schema: ExportFinalVideoSchema,
  }
);

// --- Validate Export Tool ---

/**
 * Schema for validate_export tool
 */
const ValidateExportSchema = z.object({
  contentPlanId: z.string().describe("Session ID to validate export readiness for"),
});

/**
 * Export validation result
 */
export interface ExportValidationResult {
  /** Whether export is ready to proceed */
  isReady: boolean;
  /** Estimated duration in seconds */
  estimatedDuration: number;
  /** Estimated file size in MB */
  estimatedFileSizeMB: number;
  /** Asset validation results */
  assets: {
    visuals: {
      ready: boolean;
      count: number;
      videoCount: number;
      imageCount: number;
      missingScenes: string[];
    };
    narration: {
      ready: boolean;
      segmentCount: number;
      totalDuration: number;
    };
    sfx: {
      ready: boolean;
      sceneCount: number;
    };
    subtitles: {
      ready: boolean;
    };
    mixedAudio: {
      ready: boolean;
      duration: number;
    };
  };
  /** Warnings that won't prevent export but should be noted */
  warnings: string[];
  /** Errors that will prevent export */
  errors: string[];
  /** Suggestions for fixing issues */
  suggestions: string[];
}

/**
 * Validate Export Tool
 *
 * Validates export readiness without actually rendering.
 * Checks all assets are present, valid, and consistent.
 */
export const validateExportTool = tool(
  async ({ contentPlanId }) => {
    console.log(`[ExportTools] Validating export readiness for session: ${contentPlanId}`);

    const result: ExportValidationResult = {
      isReady: true,
      estimatedDuration: 0,
      estimatedFileSizeMB: 0,
      assets: {
        visuals: { ready: false, count: 0, videoCount: 0, imageCount: 0, missingScenes: [] },
        narration: { ready: false, segmentCount: 0, totalDuration: 0 },
        sfx: { ready: false, sceneCount: 0 },
        subtitles: { ready: false },
        mixedAudio: { ready: false, duration: 0 },
      },
      warnings: [],
      errors: [],
      suggestions: [],
    };

    // Get session state
    const state = productionStore.get(contentPlanId);
    if (!state) {
      result.isReady = false;
      result.errors.push("Production session not found");
      result.suggestions.push("Run plan_video first to create a production session");
      return JSON.stringify({ success: false, validation: result });
    }

    // Validate content plan
    if (!state.contentPlan) {
      result.isReady = false;
      result.errors.push("No content plan found");
      result.suggestions.push("Run plan_video to create a content plan");
    } else {
      result.estimatedDuration = state.contentPlan.totalDuration || 0;
    }

    const expectedSceneCount = state.contentPlan?.scenes.length || 0;

    // Validate visuals
    if (state.visuals && state.visuals.length > 0) {
      result.assets.visuals.count = state.visuals.length;
      result.assets.visuals.videoCount = state.visuals.filter(v => v.type === "video").length;
      result.assets.visuals.imageCount = state.visuals.filter(v => v.type !== "video").length;

      // Check for missing scenes
      if (state.contentPlan?.scenes) {
        const visualSceneIds = new Set(state.visuals.map(v => v.promptId));
        for (const scene of state.contentPlan.scenes) {
          if (!visualSceneIds.has(scene.id)) {
            result.assets.visuals.missingScenes.push(scene.id);
          }
        }
      }

      if (result.assets.visuals.missingScenes.length > 0) {
        result.warnings.push(`Missing visuals for ${result.assets.visuals.missingScenes.length} scenes`);
      }

      if (result.assets.visuals.count >= expectedSceneCount) {
        result.assets.visuals.ready = true;
      } else {
        result.assets.visuals.ready = result.assets.visuals.count > 0; // Partial is ok
        result.warnings.push(`Only ${result.assets.visuals.count}/${expectedSceneCount} scenes have visuals`);
      }

      // Check video assets for validity
      for (const visual of state.visuals) {
        if (visual.type === "video" && !visual.imageUrl) {
          result.warnings.push(`Video asset ${visual.promptId} has no URL`);
        }
      }

      // Log video asset info
      if (result.assets.visuals.videoCount > 0) {
        console.log(`[ExportTools] Found ${result.assets.visuals.videoCount} Veo video assets`);
      }
    } else {
      result.isReady = false;
      result.errors.push("No visual assets found");
      result.suggestions.push("Run generate_visuals to create visual assets");
    }

    // Validate narration
    if (state.narrationSegments && state.narrationSegments.length > 0) {
      result.assets.narration.segmentCount = state.narrationSegments.length;
      result.assets.narration.totalDuration = state.narrationSegments.reduce(
        (sum, seg) => sum + (seg.audioDuration || 0),
        0
      );
      result.assets.narration.ready = true;

      // Check for segments without audio
      const segmentsWithoutAudio = state.narrationSegments.filter(seg => !seg.audioBlob);
      if (segmentsWithoutAudio.length > 0) {
        result.warnings.push(`${segmentsWithoutAudio.length} narration segments missing audio`);
      }

      // Check duration consistency
      if (Math.abs(result.assets.narration.totalDuration - result.estimatedDuration) > 5) {
        result.warnings.push(
          `Narration duration (${result.assets.narration.totalDuration.toFixed(1)}s) differs from plan duration (${result.estimatedDuration.toFixed(1)}s)`
        );
      }
    } else {
      result.isReady = false;
      result.errors.push("No narration segments found");
      result.suggestions.push("Run narrate_scenes to generate narration");
    }

    // Validate SFX
    if (state.sfxPlan) {
      result.assets.sfx.sceneCount = state.sfxPlan.scenes?.length || 0;
      result.assets.sfx.ready = true;

      // Check for scenes with SFX URLs
      const scenesWithAudio = state.sfxPlan.scenes?.filter(s => s.ambientTrack?.audioUrl) || [];
      if (scenesWithAudio.length < result.assets.sfx.sceneCount) {
        result.warnings.push(
          `Only ${scenesWithAudio.length}/${result.assets.sfx.sceneCount} SFX scenes have audio URLs`
        );
      }
    }

    // Validate subtitles
    const subtitles = getSubtitles(contentPlanId);
    if (subtitles) {
      result.assets.subtitles.ready = true;
    }

    // Validate mixed audio
    const mixedAudio = getMixedAudio(contentPlanId);
    if (mixedAudio) {
      result.assets.mixedAudio.ready = true;
      result.assets.mixedAudio.duration = mixedAudio.duration;
    }

    // Estimate file size (rough estimate: ~1MB per 10 seconds at standard quality)
    result.estimatedFileSizeMB = Math.round(result.estimatedDuration * 0.1 * 10) / 10;
    if (result.assets.visuals.videoCount > 0) {
      // Videos typically result in larger files
      result.estimatedFileSizeMB *= 1.5;
    }

    // Final readiness check
    result.isReady = result.errors.length === 0 && result.assets.visuals.ready && result.assets.narration.ready;

    // Add general suggestions
    if (!result.assets.mixedAudio.ready && result.assets.sfx.ready) {
      result.suggestions.push("Consider running mix_audio_tracks to include SFX in the export");
    }
    if (!result.assets.subtitles.ready) {
      result.suggestions.push("Consider running generate_subtitles for accessibility");
    }

    console.log(`[ExportTools] Validation complete: ${result.isReady ? '✓ Ready' : '✗ Not ready'}`);
    console.log(`[ExportTools] Estimated: ${result.estimatedDuration}s, ~${result.estimatedFileSizeMB}MB`);

    return JSON.stringify({
      success: true,
      validation: result,
      message: result.isReady
        ? `Export ready! ${result.assets.visuals.count} visuals (${result.assets.visuals.videoCount} videos), ${result.assets.narration.segmentCount} narration segments, ~${result.estimatedDuration}s duration`
        : `Export not ready: ${result.errors.join(", ")}`,
    });
  },
  {
    name: "validate_export",
    description:
      "Validate export readiness without rendering. Checks all assets are present, valid, and consistent. Returns detailed validation results including asset counts, warnings, errors, and suggestions. Use before export_final_video to catch issues early.",
    schema: ValidateExportSchema,
  }
);

// --- List Export Presets Tool ---

/**
 * Schema for list_export_presets tool
 */
const ListExportPresetsSchema = z.object({
  platform: z.string().optional().describe("Optional platform filter (e.g., 'youtube', 'instagram', 'tiktok')"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:5"]).optional().describe("Optional aspect ratio filter"),
});

/**
 * List Export Presets Tool
 *
 * Returns available export presets with their configurations.
 * Useful for helping users choose appropriate export settings.
 */
export const listExportPresetsTool = tool(
  async ({ platform, aspectRatio }) => {
    console.log(`[ExportTools] Listing export presets${platform ? ` for platform: ${platform}` : ""}${aspectRatio ? ` with aspect ratio: ${aspectRatio}` : ""}`);

    let presets = Object.values(EXPORT_PRESETS);

    // Filter by platform if specified
    if (platform) {
      presets = presets.filter(p =>
        p.platform.toLowerCase().includes(platform.toLowerCase()) ||
        p.id.toLowerCase().includes(platform.toLowerCase())
      );
    }

    // Filter by aspect ratio if specified
    if (aspectRatio) {
      presets = presets.filter(p => p.aspectRatio === aspectRatio);
    }

    // Format presets for output
    const formattedPresets = presets.map(p => ({
      id: p.id,
      name: p.name,
      platform: p.platform,
      description: p.description,
      aspectRatio: p.aspectRatio,
      orientation: p.orientation,
      fps: p.fps,
      quality: p.quality,
      maxDuration: p.maxDuration,
      minDuration: p.minDuration,
    }));

    return JSON.stringify({
      success: true,
      presets: formattedPresets,
      count: formattedPresets.length,
      allPresetIds: getAllPresetIds(),
      message: formattedPresets.length > 0
        ? `Found ${formattedPresets.length} export preset(s)${platform ? ` for ${platform}` : ""}${aspectRatio ? ` with ${aspectRatio} aspect ratio` : ""}`
        : "No presets match the specified filters",
    });
  },
  {
    name: "list_export_presets",
    description:
      "List available export presets for different platforms. Presets provide optimized settings for platforms like YouTube, TikTok, Instagram, etc. Optionally filter by platform name or aspect ratio. Use this when the user asks about export options or to recommend appropriate settings.",
    schema: ListExportPresetsSchema,
  }
);

// --- Export all export tools ---

export const exportTools = [
  exportFinalVideoTool,
  validateExportTool,
  listExportPresetsTool,
];
