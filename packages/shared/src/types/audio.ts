/**
 * Audio Types — SFX, beat metadata, music generation
 */

import type { EmotionalTone } from './scene';

// --- SFX Types ---

export type SFXCategory =
  | "ambient"      // Background atmosphere
  | "nature"       // Natural sounds
  | "urban"        // City/industrial sounds
  | "weather"      // Weather effects
  | "transition"   // Scene transition sounds
  | "musical"      // Musical stingers/beds
  | "supernatural" // Eerie/mystical sounds
  | "action";      // Impact/movement sounds

export interface AmbientSFX {
  id: string;
  name: string;
  description: string;
  category: SFXCategory;
  moods: EmotionalTone[];
  keywords: string[];
  /** Duration in seconds (0 = loopable) */
  duration: number;
  /** Volume level 0-1 (relative to narration) */
  suggestedVolume: number;
  /** URL to audio file (if available) */
  audioUrl?: string;
  /** Base64 audio data (if generated) */
  audioData?: string;
}

export interface SceneSFXPlan {
  sceneId: string;
  ambientTrack: AmbientSFX | null;
  transitionIn: AmbientSFX | null;
  transitionOut: AmbientSFX | null;
  accentSounds: AmbientSFX[];
}

export interface VideoSFXPlan {
  scenes: SceneSFXPlan[];
  backgroundMusic: AmbientSFX | null;
  masterVolume: number;
  /** AI-generated music track from Suno API */
  generatedMusic?: {
    trackId: string;
    audioUrl: string;
    duration: number;
    title: string;
  };
}

// --- Music / Beat Metadata Types (Task 9.3) ---

/**
 * A single beat event within a music track.
 * Used for beat-synchronized visual transitions.
 *
 * Requirements: 8.4, 8.6, 15.3
 */
export interface BeatEvent {
  /** Beat timestamp in seconds */
  timestamp: number;
  /** Beat intensity 0–1 (0 = weak, 1 = strong downbeat) */
  intensity: number;
}

/**
 * Beat metadata extracted from or generated alongside a music track.
 */
export interface BeatMetadata {
  /** Beats per minute */
  bpm: number;
  /** Total track duration in seconds */
  durationSeconds: number;
  /** Ordered list of beat events */
  beats: BeatEvent[];
}

/**
 * Configuration for AI music generation (Music Video format).
 *
 * Requirements: 8.3, 14.2
 */
export interface MusicGenerationConfig {
  genre: string;
  mood: string;
  tempo?: number;
  durationSeconds: number;
  instrumental?: boolean;
}
