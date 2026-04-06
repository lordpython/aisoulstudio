/**
 * Scene & Production Types — Scenes, content plans, narration, validation
 */

/**
 * Emotional tone for narration voice matching.
 * @deprecated Prefer using InstructionTriplet for richer creative direction.
 * Kept for backward compatibility with existing voice selection logic.
 */
export type EmotionalTone =
  | "professional"
  | "dramatic"
  | "friendly"
  | "urgent"
  | "calm";

/**
 * Instruction Triplet: 3-axis creative direction system.
 * Replaces the flat EmotionalTone with richer vibe-based control.
 *
 * - primaryEmotion: Core emotional state (e.g., "visceral-dread", "bittersweet-longing")
 * - cinematicDirection: Visual/camera style (e.g., "dutch-angle", "slow-push-in")
 * - environmentalAtmosphere: Ambient texture (e.g., "foggy-ruins", "neon-rain")
 */
export interface InstructionTriplet {
  primaryEmotion: string;
  cinematicDirection: string;
  environmentalAtmosphere: string;
}

/**
 * Camera shot type for cinematography
 */
export type ShotType =
  | "extreme-close-up"
  | "close-up"
  | "medium"
  | "full"
  | "wide"
  | "extreme-wide";

/**
 * Camera movement type for animations
 */
export type CameraMovement =
  | "static"
  | "zoom-in"
  | "zoom-out"
  | "pan"
  | "tracking"
  | "pull-back";

/**
 * Unified character type covering both video-mode (ContentPlan) and story-mode (StoryState) usage.
 *
 * Video-mode fields (from the former CharacterDefinition):
 *   - appearance, clothing, distinguishingFeatures, consistencyKey
 *
 * Story-mode fields (from the former CharacterProfile):
 *   - id, role, visualDescription, facialTags, referenceImageUrl, coreAnchors
 *
 * All video-mode-specific and story-mode-specific fields are optional so the
 * type is valid in both contexts.
 */
export interface Character {
  name: string;
  // Video-mode specific (ContentPlan / ContentPlanner agent)
  /** Detailed physical description (video mode) */
  appearance?: string;
  /** Specific garments and colors (video mode) */
  clothing?: string;
  /** Scars, tattoos, jewelry, etc. (video mode) */
  distinguishingFeatures?: string;
  /** Compact 5-word visual anchor for image prompts, e.g. "10yo wiry boy, messy black hair" (video mode) */
  consistencyKey?: string;
  // Story-mode specific (StoryState / story pipeline)
  /** Unique identifier (story mode) */
  id?: string;
  /** Character role in the story, e.g. "protagonist" (story mode) */
  role?: string;
  /** The "Golden Prompt" visual description for consistency (story mode) */
  visualDescription?: string;
  /** 5-keyword compact face/clothing tags for prompt anchoring (story mode) */
  facialTags?: string;
  /** Generated reference sheet image URL (story mode) */
  referenceImageUrl?: string;
  /**
   * 30-50 word structured visual identity anchor for prompt injection.
   * Format: "[name]: [first 2 sentences of visualDescription]. Face: [facialTags]. Rendered in [style] art style."
   * Built by enrichCharactersWithCoreAnchors() after character extraction.
   * Injected as "CHARACTERS IN FRAME:" prefix in image prompts for consistency.
   * (story mode)
   */
  coreAnchors?: string;
}

/** @deprecated Use {@link Character} directly. Kept for backwards compatibility. */
export type CharacterDefinition = Character;

/** @deprecated Use {@link Character} directly. Kept for backwards compatibility. */
export type CharacterProfile = Character;

/**
 * Transition effects between scenes during video export
 */
export type TransitionType =
  | "none"      // Hard cut
  | "fade"      // Fade through black
  | "dissolve"  // Cross-dissolve (blend)
  | "zoom"      // Zoom into next scene
  | "slide";    // Slide left/right

/**
 * Scene structure produced by ContentPlanner
 */
export interface Scene {
  id: string;
  name: string;
  duration: number; // seconds
  visualDescription: string;
  narrationScript: string;
  /**
   * @deprecated Prefer instructionTriplet for new scenes.
   * Still used by voice selection (TONE_VOICE_MAP) and SFX matching.
   * Use getEffectiveLegacyTone() from tripletUtils for safe access.
   */
  emotionalTone?: EmotionalTone;
  /** 3-axis creative direction (new system) */
  instructionTriplet?: InstructionTriplet;
  transitionTo?: TransitionType;
  /** AI-suggested ambient sound effect ID */
  ambientSfx?: string;
  /** Cinematography - shot type */
  shotType?: ShotType;
  /** Cinematography - camera movement */
  cameraMovement?: CameraMovement;
  /** Cinematography - lighting description */
  lighting?: string;
}

/**
 * Full content plan from ContentPlanner agent
 */
export interface ContentPlan {
  title: string;
  totalDuration: number; // seconds
  targetAudience: string;
  scenes: Scene[];
  overallTone: string;
  /** Character definitions for visual consistency */
  characters?: Character[];
}

/**
 * Narration output from Narrator agent
 */
export interface NarrationSegment {
  sceneId: string;
  audioBlob: Blob;
  audioDuration: number; // seconds
  transcript: string;
}

/**
 * Validation result from Editor/Critic agent
 */
export interface ValidationResult {
  approved: boolean;
  score: number; // 0-100
  issues: Array<{ scene: string; type: string; message: string }>;
  suggestions: string[];
}

export enum AppState {
  IDLE = "IDLE",
  CONFIGURING = "CONFIGURING",
  PROCESSING_AUDIO = "PROCESSING_AUDIO",
  TRANSCRIBING = "TRANSCRIBING",
  ANALYZING_LYRICS = "ANALYZING_LYRICS",
  GENERATING_PROMPTS = "GENERATING_PROMPTS",
  READY = "READY",
  ERROR = "ERROR",
  // Multi-agent production pipeline states
  CONTENT_PLANNING = "CONTENT_PLANNING",
  NARRATING = "NARRATING",
  EDITING = "EDITING",
  VALIDATING = "VALIDATING",
}
