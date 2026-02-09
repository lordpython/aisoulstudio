/**
 * Triplet Utilities
 *
 * Bridge between the new InstructionTriplet system and the legacy EmotionalTone.
 * All downstream consumers that need EmotionalTone should use getEffectiveLegacyTone()
 * instead of accessing scene.emotionalTone directly.
 *
 * React-free — safe for Node.js usage.
 */

import type { EmotionalTone, InstructionTriplet, Scene } from "../types";

/**
 * Maps primary emotions (vibe terms) to the nearest legacy EmotionalTone.
 * Used when downstream systems (voice selection, SFX matching) still need
 * the 5-value enum.
 */
export const EMOTION_TO_LEGACY: Record<string, EmotionalTone> = {
  // dramatic bucket
  "visceral-dread": "dramatic",
  "melancholy": "dramatic",
  "seething-rage": "dramatic",
  "bittersweet-longing": "dramatic",
  "euphoric-wonder": "dramatic",
  "tension-drone": "dramatic",
  "heartbeat-pulse": "dramatic",
  "digital-distortion": "dramatic",
  "holographic-decay": "dramatic",

  // calm bucket
  "stoic-resignation": "calm",
  "cold-detachment": "calm",
  "nostalgic-warmth": "calm",
  "desert-silence": "calm",
  "ethereal-echo": "calm",
  "cathedral-reverb": "calm",
  "golden-hour-decay": "calm",
  "twilight-liminal": "calm",
  "whisper-static": "calm",
  "nordic-frost": "calm",

  // urgent bucket
  "quantum-shimmer": "urgent",
  "neural-lace": "urgent",
  "neon-rain": "urgent",
  "tokyo-neon-night": "urgent",

  // friendly bucket
  "liquid-glass": "friendly",
  "middle-eastern-dusk": "friendly",

  // professional bucket
  "server-room-hum": "professional",
  "midnight-blue": "professional",
};

/**
 * Default InstructionTriplets for each legacy EmotionalTone.
 * Used when upgrading old scenes that only have emotionalTone.
 */
export const DEFAULT_TRIPLETS: Record<EmotionalTone, InstructionTriplet> = {
  professional: {
    primaryEmotion: "cold-detachment",
    cinematicDirection: "static",
    environmentalAtmosphere: "server-room-hum",
  },
  dramatic: {
    primaryEmotion: "visceral-dread",
    cinematicDirection: "slow-push-in",
    environmentalAtmosphere: "tension-drone",
  },
  friendly: {
    primaryEmotion: "nostalgic-warmth",
    cinematicDirection: "handheld-float",
    environmentalAtmosphere: "golden-hour-decay",
  },
  urgent: {
    primaryEmotion: "seething-rage",
    cinematicDirection: "tracking-shot",
    environmentalAtmosphere: "neon-rain",
  },
  calm: {
    primaryEmotion: "stoic-resignation",
    cinematicDirection: "static",
    environmentalAtmosphere: "desert-silence",
  },
};

/**
 * Map an InstructionTriplet's primaryEmotion to the nearest EmotionalTone.
 * Falls back to "dramatic" if no mapping exists.
 */
export function tripletToLegacyTone(triplet: InstructionTriplet): EmotionalTone {
  return EMOTION_TO_LEGACY[triplet.primaryEmotion] ?? "dramatic";
}

/**
 * Upgrade a legacy EmotionalTone to a default InstructionTriplet.
 */
export function legacyToneToTriplet(tone: EmotionalTone): InstructionTriplet {
  return DEFAULT_TRIPLETS[tone] ?? DEFAULT_TRIPLETS.dramatic;
}

/**
 * Get the effective InstructionTriplet for a scene.
 * Prefers the new instructionTriplet field; falls back to upgrading emotionalTone.
 */
export function getEffectiveTriplet(scene: Scene): InstructionTriplet {
  if (scene.instructionTriplet) {
    return scene.instructionTriplet;
  }
  return legacyToneToTriplet(scene.emotionalTone ?? "dramatic");
}

/**
 * Get the effective EmotionalTone for a scene.
 * Prefers deriving from instructionTriplet; falls back to legacy field.
 * This is what downstream consumers (voice map, SFX, subtitles) should call
 * instead of accessing scene.emotionalTone directly.
 */
export function getEffectiveLegacyTone(scene: Scene): EmotionalTone {
  if (scene.instructionTriplet) {
    return tripletToLegacyTone(scene.instructionTriplet);
  }
  return scene.emotionalTone ?? "dramatic";
}
