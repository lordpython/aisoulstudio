/**
 * Cloud Storage Tools - LangChain tools for uploading production outputs to GCS
 *
 * Provides tools for uploading complete production bundles to Google Cloud Storage:
 * - upload_production_to_cloud: Upload all production outputs to GCS bucket
 *
 * Requirements: Production asset storage and archival
 *
 * NOTE: These tools are only available in Node.js environment (server-side).
 * In browser builds, stub functions are used to prevent bundling GCS dependencies.
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import type { ProductionBundle } from "../cloudStorageService";

// Check if we're in Node.js environment
const isNode = typeof window === 'undefined';

// Conditional imports - only load GCS in Node.js
let uploadProductionBundle: any = null;
let generateProductionFolder: any = null;
let getMixedAudio: any = null;
let concatenateNarrationSegments: any = null;
let productionStore: any = null;

if (isNode) {
  try {
    const cloudStorage = require("../cloudStorageService");
    uploadProductionBundle = cloudStorage.uploadProductionBundle;
    generateProductionFolder = cloudStorage.generateProductionFolder;

    const audioMixing = require("./audioMixingTools");
    getMixedAudio = audioMixing.getMixedAudio;

    const audioUtils = require("./audioUtils");
    concatenateNarrationSegments = audioUtils.concatenateNarrationSegments;

    const prodAgent = require("../ai/productionAgent");
    productionStore = prodAgent.productionStore;
  } catch (error) {
    console.warn("[CloudStorageTools] Failed to load dependencies:", error);
  }
}

// --- Types ---

/**
 * Result of cloud storage upload operation
 */
export interface CloudUploadResult {
  /** GCS folder name (YYYY-MM-DD_HH-mm-ss format) */
  folderName: string;
  /** GCS bucket path */
  bucketPath: string;
  /** Number of files uploaded successfully */
  filesUploaded: number;
  /** Total number of files attempted */
  totalFiles: number;
  /** Total size uploaded in MB */
  totalSizeMB: number;
  /** Public URLs if makePublic was true */
  publicUrls?: Record<string, string>;
  /** Upload errors if any */
  errors?: string[];
}

// --- Tool Schema ---

/**
 * Schema for upload_production_to_cloud tool
 */
const UploadProductionSchema = z.object({
  contentPlanId: z.string().describe("Session ID containing the complete production to upload"),
  makePublic: z.boolean().default(false).describe("Whether to make uploaded files publicly accessible (default: false)"),
  includeNarrationAudio: z.boolean().default(true).describe("Include separate narration audio file (default: true)"),
  includeMixedAudio: z.boolean().default(true).describe("Include mixed audio file if available (default: true)"),
  includeVisuals: z.boolean().default(true).describe("Include scene visuals (default: true)"),
  includeSubtitles: z.boolean().default(true).describe("Include subtitle files (default: true)"),
});

// --- Helper Functions ---

/**
 * Generate SRT subtitle content from narration segments
 */
function generateSRTFromNarration(segments: any[]): string {
  let srtContent = '';
  let index = 1;
  let currentTime = 0;

  for (const segment of segments) {
    const startTime = currentTime;
    const endTime = currentTime + segment.audioDuration;

    // Format times as SRT format (HH:MM:SS,mmm)
    const formatTime = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const millis = Math.floor((seconds % 1) * 1000);

      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
    };

    srtContent += `${index}\n`;
    srtContent += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
    srtContent += `${segment.transcript}\n\n`;

    index++;
    currentTime = endTime;
  }

  return srtContent;
}

/**
 * Generate VTT subtitle content from narration segments
 */
function generateVTTFromNarration(segments: any[]): string {
  let vttContent = 'WEBVTT\n\n';
  let currentTime = 0;

  for (const segment of segments) {
    const startTime = currentTime;
    const endTime = currentTime + segment.audioDuration;

    // Format times as VTT format (HH:MM:SS.mmm)
    const formatTime = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const millis = Math.floor((seconds % 1) * 1000);

      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    };

    vttContent += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
    vttContent += `${segment.transcript}\n\n`;

    currentTime = endTime;
  }

  return vttContent;
}

// --- Tool Implementation ---

/**
 * Upload Production to Cloud Tool
 *
 * Uploads all production outputs to Google Cloud Storage bucket with organized structure.
 * Auto-fetches all assets from production session state.
 *
 * Creates folder structure:
 * gs://aisoul-studio-storage/YYYY-MM-DD_HH-mm-ss/
 *   ├── final-video.mp4 (or .webm)
 *   ├── narration.wav
 *   ├── mixed-audio.wav
 *   ├── background-music.mp3
 *   ├── visuals/scene-1.png
 *   ├── visuals/scene-2.png
 *   ├── subtitles.srt
 *   ├── subtitles.vtt
 *   ├── production.log
 *   └── metadata.json
 */
export const uploadProductionTool = tool(
  async ({
    contentPlanId,
    makePublic = false,
    includeNarrationAudio = true,
    includeMixedAudio = true,
    includeVisuals = true,
    includeSubtitles = true,
  }) => {
    console.log(`[CloudStorageTools] Starting upload for session: ${contentPlanId}`);

    // Check if running in browser
    if (typeof window !== 'undefined') {
      return JSON.stringify({
        success: false,
        error: "Cloud Storage upload is not supported in browser environment",
        suggestion: "This feature requires server-side execution. The production agent must run in a Node.js environment with proper GCS credentials configured.",
      });
    }

    // Get production state
    const state = productionStore.get(contentPlanId);
    if (!state) {
      return JSON.stringify({
        success: false,
        error: "Production session not found",
        suggestion: "Ensure the contentPlanId is correct and the production has been run",
      });
    }

    // Build production bundle
    const bundle: ProductionBundle = {
      metadata: {
        topic: state.contentPlan?.topic || "Unknown",
        duration: state.narrationSegments?.reduce((sum, seg) => sum + seg.audioDuration, 0) || 0,
        language: state.contentPlan?.language || "en",
        sceneCount: state.contentPlan?.scenes.length || 0,
        productionId: contentPlanId,
      },
    };

    const logs: string[] = [`Production upload started at ${new Date().toISOString()}`];

    // Add video if available
    if (state.exportedVideo) {
      bundle.video = state.exportedVideo;
      logs.push(`✓ Video ready for upload (${Math.round(state.exportedVideo.size / 1024 / 1024)}MB)`);
    } else {
      logs.push(`⚠ No exported video found - run export_final_video first`);
    }

    // Add narration audio (concatenated)
    if (includeNarrationAudio && state.narrationSegments && state.narrationSegments.length > 0) {
      try {
        const narrationBlob = await concatenateNarrationSegments(state.narrationSegments);
        bundle.narrationAudio = narrationBlob;
        logs.push(`✓ Narration audio ready (${Math.round(narrationBlob.size / 1024)}KB, ${state.narrationSegments.length} segments)`);
      } catch (error) {
        logs.push(`✗ Failed to concatenate narration: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Add mixed audio if available
    if (includeMixedAudio) {
      const mixedAudio = getMixedAudio(contentPlanId);
      if (mixedAudio) {
        bundle.mixedAudio = mixedAudio.audioBlob;
        logs.push(`✓ Mixed audio ready (${Math.round(mixedAudio.audioBlob.size / 1024)}KB)`);
      }
    }

    // Add background music if available
    if (state.sfxPlan?.backgroundMusic?.audioUrl) {
      try {
        const response = await fetch(state.sfxPlan.backgroundMusic.audioUrl);
        if (response.ok) {
          bundle.backgroundMusic = await response.blob();
          logs.push(`✓ Background music ready`);
        }
      } catch (error) {
        logs.push(`⚠ Could not fetch background music: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Add visuals
    if (includeVisuals && state.visuals && state.visuals.length > 0) {
      bundle.visuals = [];
      for (const visual of state.visuals) {
        try {
          const response = await fetch(visual.imageUrl);
          if (response.ok) {
            const blob = await response.blob();
            bundle.visuals.push({
              sceneId: visual.promptId,
              blob,
              type: visual.type === 'video' ? 'video' : 'image',
            });
          }
        } catch (error) {
          logs.push(`⚠ Could not fetch visual ${visual.promptId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      logs.push(`✓ ${bundle.visuals.length}/${state.visuals.length} visuals ready`);
    }

    // Add subtitles
    if (includeSubtitles && state.narrationSegments && state.narrationSegments.length > 0) {
      try {
        const srtContent = generateSRTFromNarration(state.narrationSegments);
        const vttContent = generateVTTFromNarration(state.narrationSegments);

        bundle.subtitles = [
          { format: 'srt', content: srtContent },
          { format: 'vtt', content: vttContent },
        ];
        logs.push(`✓ Subtitles generated (SRT and VTT)`);
      } catch (error) {
        logs.push(`⚠ Could not generate subtitles: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Add production logs
    bundle.logs = logs;

    try {
      // Upload to GCS
      logs.push(`Uploading to Google Cloud Storage...`);
      const uploadResult = await uploadProductionBundle(bundle, makePublic);

      const successCount = uploadResult.results.filter(r => r.success).length;
      const totalSize = uploadResult.results.reduce((sum, r) => sum + r.size, 0);

      const result: CloudUploadResult = {
        folderName: uploadResult.folderName,
        bucketPath: `gs://aisoul-studio-storage/${uploadResult.folderName}`,
        filesUploaded: successCount,
        totalFiles: uploadResult.results.length,
        totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
        publicUrls: makePublic ? uploadResult.publicUrls : undefined,
        errors: uploadResult.errors.length > 0 ? uploadResult.errors : undefined,
      };

      console.log(`[CloudStorageTools] Upload complete: ${successCount}/${uploadResult.results.length} files`);

      return JSON.stringify({
        success: true,
        ...result,
        message: `Successfully uploaded ${successCount}/${uploadResult.results.length} files (${result.totalSizeMB}MB) to ${result.bucketPath}`,
      });

    } catch (error) {
      console.error("[CloudStorageTools] Upload error:", error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      return JSON.stringify({
        success: false,
        error: errorMessage,
        suggestion: "Check GCS credentials and bucket permissions. Ensure GOOGLE_CLOUD_PROJECT env var is set or run 'gcloud auth application-default login'",
      });
    }
  },
  {
    name: "upload_production_to_cloud",
    description: "Upload all production outputs (video, audio, visuals, subtitles, logs) to Google Cloud Storage bucket. Creates organized folder with date/time naming (YYYY-MM-DD_HH-mm-ss). All assets are automatically fetched from session state - just provide contentPlanId. Use this after export_final_video to archive the complete production.",
    schema: UploadProductionSchema,
  }
);

// --- Export all cloud storage tools ---

// Only export tools in Node.js environment
// In browser, export empty array to prevent bundling errors
export const cloudStorageTools = isNode ? [
  uploadProductionTool,
] : [];
