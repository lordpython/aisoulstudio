/**
 * Story Mode Types — Screenplay, shots, storyboard workflow state
 */

import type { Character, TransitionType } from './scene';

/**
 * Screenplay scene in standard format
 */
export interface ScreenplayScene {
  id: string;
  sceneNumber: number;
  heading: string; // INT. BEDROOM - DAY
  action: string;
  dialogue: Array<{ speaker: string; text: string }>;
  charactersPresent: string[];
}

/**
 * Shotlist entry for storyboard generation
 */
export interface ShotlistEntry {
  id: string;
  sceneId: string;
  shotNumber: number;
  description: string;
  cameraAngle: string; // "Wide", "Close-up"
  movement: string; // "Pan", "Static"
  lighting?: string; // "Cinematic", "Natural", etc.
  dialogue?: string; // Associated dialogue for the shot
  scriptSegment?: string; // 1-3 sentences of narration mapped to this shot
  imageUrl?: string; // The final generated image
  durationEst?: number; // Estimated duration in seconds
  // Extended cinematography metadata (Shot Editor)
  shotType?: string; // "Wide", "Medium", "Close-up", etc.
  equipment?: string; // Camera equipment, e.g. "Tripod", "Steadicam"
  focalLength?: string; // e.g. "35mm", "85mm"
  aspectRatio?: string; // e.g. "16:9", "9:16", "1:1"
  notes?: string; // Production notes
}

/**
 * Story Mode workflow step
 */
export type StoryStep = 'idea' | 'breakdown' | 'script' | 'characters' | 'shots' | 'style' | 'storyboard' | 'narration' | 'animation' | 'export';

/**
 * Shot type for shot-level breakdown (Storyboarder.ai style)
 */
export type StoryShotType = 'Wide' | 'Medium' | 'Close-up' | 'Extreme Close-up' | 'POV' | 'Over-the-shoulder';
export type StoryCameraAngle = 'Eye-level' | 'High' | 'Low' | 'Dutch' | "Bird's-eye" | "Worm's-eye";
export type StoryCameraMovement = 'Static' | 'Pan' | 'Tilt' | 'Zoom' | 'Dolly' | 'Tracking' | 'Handheld';

/**
 * Individual shot within a scene for storyboard workflow
 */
export interface StoryShot {
  id: string;
  sceneId: string;
  shotNumber: number;
  shotType: StoryShotType;
  cameraAngle: StoryCameraAngle;
  movement: StoryCameraMovement;
  duration: number;
  description: string;
  emotion: string;
  lighting: string;
  scriptSegment?: string; // 1-3 sentences of narration mapped to this shot
  imageUrl?: string; // Generated image for this shot
  // Extended cinematography metadata (matches ShotlistEntry for shot-table display)
  equipment?: string; // Camera equipment, e.g. "Tripod", "Steadicam"
  focalLength?: string; // e.g. "35mm", "85mm"
  aspectRatio?: string; // e.g. "16:9", "9:16", "1:1"
  notes?: string; // Production notes
}

/**
 * Result of a character consistency check
 */
export interface ConsistencyReport {
  score: number;
  isConsistent: boolean;
  issues: string[];
  suggestions: string[];
  details: string;
}

export type StoryNarrationSegment = {
  sceneId: string;
  audioUrl: string;
  duration: number;
  text: string;
};

export type AnimatedShot = {
  shotId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
};

/**
 * Story Mode complete state
 */
export interface StoryState {
  currentStep: StoryStep;
  breakdown: ScreenplayScene[];
  script: { title: string; scenes: ScreenplayScene[] } | null;
  characters: Character[];
  shotlist: ShotlistEntry[];
  consistencyReports?: Record<string, ConsistencyReport>; // characterId -> report

  // Storyboarder.ai-style workflow fields
  isLocked?: boolean;
  lockedAt?: string;
  version?: 'draft' | 'locked_v1';
  shots?: StoryShot[];
  visualStyle?: string;
  aspectRatio?: string;
  genre?: string;
  imageProvider?: 'gemini' | 'deapi';  // Image generation provider for storyboard visuals
  deapiImageModel?: string;  // DeAPI model slug (e.g. 'Flux1schnell', 'Flux_2_Klein_4B_BF16', 'ZImageTurbo_INT8')
  applyStyleConsistency?: boolean;  // DeAPI: img2img style consistency pass after visual generation
  animateWithBgRemoval?: boolean;   // DeAPI: remove background before animation
  ttsProvider?: 'gemini' | 'deapi_qwen';
  ttsModel?: string;
  /** Target output video duration in seconds (e.g. 30, 60, 90, 120, 180, 300). Controls scene/shot count and narration pacing. */
  targetDurationSeconds?: number;

  // Per-scene generation progress tracking
  scenesWithShots?: string[]; // scene IDs that have shots generated
  scenesWithVisuals?: string[]; // scene IDs that have storyboard visuals generated

  // Narration (TTS) state
  narrationSegments?: StoryNarrationSegment[];
  scenesWithNarration?: string[]; // scene IDs that have narration generated

  // Animation (Veo/DeAPI) state
  animatedShots?: AnimatedShot[];
  shotsWithAnimation?: string[]; // shot IDs that have animation generated

  // Visual style DNA extracted from first generated shot (Issue 3)
  masterStyle?: {
    colorPalette: string[];
    lighting: string;
    texture: string;
    moodKeywords: string[];
  };

  // Final export state
  finalVideoUrl?: string;
  exportProgress?: number;

  // Error tracking for specific stages
  stageErrors?: Record<StoryStep, string | null>;

  /**
   * Per-shot image generation status for error recovery and resume.
   * Key is shot.id, value is 'pending' | 'success' | 'failed'.
   * Populated/updated during generateVisuals().
   */
  storyboardStatus?: Record<string, 'pending' | 'success' | 'failed'>;

  /**
   * Per-shot narration generation status for error recovery and resume.
   * Key is shot.id, value is 'pending' | 'success' | 'failed'.
   * Populated/updated during generateNarration().
   */
  narrationStatus?: Record<string, 'pending' | 'success' | 'failed'>;

  /**
   * Per-shot narration audio segments.
   * Enables exact timing alignment: each shot's audio maps directly to its visual.
   * Coexists with narrationSegments (scene-level) for backward compatibility.
   */
  shotNarrationSegments?: Array<{
    shotId: string;
    sceneId: string;
    audioUrl: string;
    duration: number;
    text: string;
  }>;
}
