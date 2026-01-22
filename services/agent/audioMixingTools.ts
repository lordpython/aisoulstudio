/**
 * Audio Mixing Tools - LangChain tools for audio mixing
 * 
 * Provides tools for mixing multiple audio tracks:
 * - mix_audio_tracks: Combine narration, music, and SFX with volume control and ducking
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { mixAudioWithSFX, MixConfig, SceneAudioInfo } from "../audioMixerService";
import { VideoSFXPlan } from "../sfxService";
import { productionStore } from "../ai/productionAgent";
import { concatenateNarrationSegments } from "./audioUtils";

// --- Types ---

/**
 * Result of audio mixing operation
 */
export interface MixedAudioResult {
  /** Mixed audio as a Blob */
  audioBlob: Blob;
  /** Total duration in seconds */
  duration: number;
  /** Track presence and volume information */
  tracks: {
    narration: { volume: number; present: boolean };
    music: { volume: number; present: boolean };
    sfx: { volume: number; present: boolean };
  };
  /** Whether ducking was applied to background music */
  duckingApplied: boolean;
}

/**
 * Session storage for mixed audio results
 */
const mixedAudioStore = new Map<string, MixedAudioResult>();

/**
 * Get mixed audio result for a session
 */
export function getMixedAudio(sessionId: string): MixedAudioResult | undefined {
  return mixedAudioStore.get(sessionId);
}

/**
 * Store mixed audio result for a session
 */
export function setMixedAudio(sessionId: string, result: MixedAudioResult): void {
  mixedAudioStore.set(sessionId, result);
}

/**
 * Clear mixed audio for a session
 */
export function clearMixedAudio(sessionId: string): boolean {
  return mixedAudioStore.delete(sessionId);
}

// --- Tool Schema ---

/**
 * Schema for mix_audio_tracks tool
 */
const MixAudioTracksSchema = z.object({
  contentPlanId: z.string().describe("Session ID containing the content plan and audio assets"),
  narrationUrl: z.string().optional().describe("Optional URL to the narration audio file. If not provided, will be automatically retrieved from session narration segments."),
  narrationVolume: z.number().min(0).max(1).default(1.0).describe("Volume level for narration (0-1, default 1.0)"),
  musicVolume: z.number().min(0).max(1).default(0.3).describe("Volume level for background music (0-1, default 0.3)"),
  sfxVolume: z.number().min(0).max(1).default(0.5).describe("Volume level for sound effects (0-1, default 0.5)"),
  duckingEnabled: z.boolean().default(true).describe("Whether to duck background music during narration (default true)"),
  sfxPlan: z.any().optional().describe("Optional SFX plan with audio URLs for ambient sounds and music"),
  scenes: z.array(z.object({
    sceneId: z.string(),
    startTime: z.number(),
    duration: z.number(),
  })).optional().describe("Optional scene timing information for SFX placement"),
});

// --- Helper Functions ---

/**
 * Validate that a URL is accessible
 * Note: Blob URLs don't support HEAD requests, so we skip validation for them
 */
async function validateAudioUrl(url: string): Promise<boolean> {
  // Blob URLs are always valid if they exist - HEAD requests don't work on them
  if (url.startsWith('blob:')) {
    return true;
  }
  
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if SFX plan has any audio content
 */
function hasSFXContent(sfxPlan: VideoSFXPlan | null | undefined): boolean {
  if (!sfxPlan) return false;
  
  // Check for background music
  if (sfxPlan.backgroundMusic?.audioUrl) return true;
  
  // Check for scene ambient tracks
  if (sfxPlan.scenes?.some(s => s.ambientTrack?.audioUrl)) return true;
  
  return false;
}

/**
 * Check if SFX plan has background music
 */
function hasBackgroundMusic(sfxPlan: VideoSFXPlan | null | undefined): boolean {
  return !!(sfxPlan?.backgroundMusic?.audioUrl);
}

// --- Tool Implementation ---

/**
 * Mix Audio Tracks Tool
 * 
 * Combines narration, background music, and SFX into a single audio output.
 * Supports volume control for each track type and automatic ducking.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export const mixAudioTracksTool = tool(
  async ({
    contentPlanId,
    narrationUrl,
    narrationVolume = 1.0,
    musicVolume = 0.3,
    sfxVolume = 0.5,
    duckingEnabled = true,
    sfxPlan,
    scenes,
  }) => {
    console.log(`[AudioMixingTools] Mixing audio for session: ${contentPlanId}`);
    console.log(`[AudioMixingTools] Volumes - Narration: ${narrationVolume}, Music: ${musicVolume}, SFX: ${sfxVolume}`);
    console.log(`[AudioMixingTools] Ducking enabled: ${duckingEnabled}`);

    // Get narration URL from session if not provided
    let finalNarrationUrl = narrationUrl;
    if (!finalNarrationUrl) {
      const state = productionStore.get(contentPlanId);
      if (!state || !state.narrationSegments || state.narrationSegments.length === 0) {
        return JSON.stringify({
          success: false,
          error: "No narration found in session and no narration URL provided",
          suggestion: "Run narrate_scenes first or provide a narrationUrl parameter",
        });
      }

      // Concatenate all narration segments into a single audio blob
      try {
        console.log(`[AudioMixingTools] Concatenating ${state.narrationSegments.length} narration segments`);
        const concatenatedBlob = await concatenateNarrationSegments(state.narrationSegments);
        finalNarrationUrl = URL.createObjectURL(concatenatedBlob);
        console.log(`[AudioMixingTools] Created narration URL from concatenated audio (${Math.round(concatenatedBlob.size / 1024)}KB)`);
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to concatenate narration segments: ${error instanceof Error ? error.message : String(error)}`,
          suggestion: "Check that all narration segments have valid audio blobs",
        });
      }
    }

    // Check if narration is accessible
    const narrationValid = await validateAudioUrl(finalNarrationUrl);
    if (!narrationValid) {
      return JSON.stringify({
        success: false,
        error: "Narration audio URL is not accessible",
        suggestion: "Check that the narration URL is valid and the audio format is supported",
      });
    }

    // Determine what tracks are present
    const hasNarration = true; // Required
    const hasMusic = hasBackgroundMusic(sfxPlan as VideoSFXPlan | null);
    const hasSfx = hasSFXContent(sfxPlan as VideoSFXPlan | null);

    console.log(`[AudioMixingTools] Tracks present - Narration: ${hasNarration}, Music: ${hasMusic}, SFX: ${hasSfx}`);

    // Build scene audio info if scenes provided
    const sceneAudioInfo: SceneAudioInfo[] = scenes?.map(s => ({
      sceneId: s.sceneId,
      startTime: s.startTime,
      duration: s.duration,
    })) || [];

    try {
      // Build mix config
      const mixConfig: MixConfig = {
        narrationUrl: finalNarrationUrl,
        sfxPlan: sfxPlan as VideoSFXPlan | null,
        scenes: sceneAudioInfo,
        sfxMasterVolume: sfxVolume,
        musicMasterVolume: musicVolume,
        sampleRate: 44100,
      };

      // Perform the mix
      const audioBlob = await mixAudioWithSFX(mixConfig);

      // Calculate duration from blob (approximate based on WAV format)
      // WAV header is 44 bytes, 16-bit mono at 44100 Hz
      const duration = (audioBlob.size - 44) / (44100 * 2);

      // Create result object
      const result: MixedAudioResult = {
        audioBlob,
        duration,
        tracks: {
          narration: { volume: narrationVolume, present: hasNarration },
          music: { volume: musicVolume, present: hasMusic },
          sfx: { volume: sfxVolume, present: hasSfx },
        },
        duckingApplied: duckingEnabled && hasMusic,
      };

      // Store the result
      setMixedAudio(contentPlanId, result);

      // Create a blob URL for the mixed audio
      const audioUrl = URL.createObjectURL(audioBlob);

      return JSON.stringify({
        success: true,
        sessionId: contentPlanId,
        audioUrl,
        duration: Math.round(duration * 100) / 100,
        fileSizeKB: Math.round(audioBlob.size / 1024),
        tracks: {
          narration: { volume: narrationVolume, present: hasNarration },
          music: { volume: musicVolume, present: hasMusic },
          sfx: { volume: sfxVolume, present: hasSfx },
        },
        duckingApplied: duckingEnabled && hasMusic,
        message: `Successfully mixed audio (${Math.round(duration)}s, ${Math.round(audioBlob.size / 1024)}KB)`,
      });

    } catch (error) {
      console.error("[AudioMixingTools] Mix error:", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for specific error types
      if (errorMessage.includes("Failed to load narration")) {
        return JSON.stringify({
          success: false,
          error: "Failed to load narration audio",
          suggestion: "Check that the narration URL is valid and the audio format is supported (MP3, WAV, OGG)",
        });
      }

      return JSON.stringify({
        success: false,
        error: errorMessage,
        suggestion: "Check that all audio URLs are valid and accessible",
      });
    }
  },
  {
    name: "mix_audio_tracks",
    description: "Mix multiple audio tracks (narration, background music, SFX) into a single audio output. Narration is automatically fetched from the session - you only need to provide contentPlanId. Optionally specify volume levels (narrationVolume, musicVolume, sfxVolume) or duckingEnabled. Missing tracks are handled gracefully - the mix will proceed with available tracks.",
    schema: MixAudioTracksSchema,
  }
);

// --- Export all audio mixing tools ---

export const audioMixingTools = [
  mixAudioTracksTool,
];
