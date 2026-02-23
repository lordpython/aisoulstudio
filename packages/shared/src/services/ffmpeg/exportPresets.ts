/**
 * Export Presets Module
 *
 * Provides pre-configured export settings for common video platforms and use cases.
 * Each preset optimizes settings for specific output targets.
 */

import { ExportConfig } from "./exportConfig";

/**
 * Export preset identifier
 */
export type ExportPresetId =
  | "youtube-landscape"
  | "youtube-shorts"
  | "tiktok"
  | "instagram-feed"
  | "instagram-reels"
  | "instagram-story"
  | "twitter"
  | "linkedin"
  | "draft-preview"
  | "high-quality"
  | "podcast-video";

/**
 * Export preset definition
 */
export interface ExportPreset {
  /** Preset identifier */
  id: ExportPresetId;
  /** Display name */
  name: string;
  /** Description of the preset */
  description: string;
  /** Target platform or use case */
  platform: string;
  /** Aspect ratio string */
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:5";
  /** Orientation derived from aspect ratio */
  orientation: "landscape" | "portrait";
  /** Recommended frame rate */
  fps: number;
  /** Quality preset */
  quality: "draft" | "standard" | "high";
  /** Partial ExportConfig overrides */
  config: Partial<ExportConfig>;
  /** Maximum recommended duration in seconds */
  maxDuration?: number;
  /** Minimum recommended duration in seconds */
  minDuration?: number;
}

/**
 * All available export presets
 */
export const EXPORT_PRESETS: Record<ExportPresetId, ExportPreset> = {
  "youtube-landscape": {
    id: "youtube-landscape",
    name: "YouTube (Landscape)",
    description: "Standard YouTube video format, optimized for desktop viewing",
    platform: "YouTube",
    aspectRatio: "16:9",
    orientation: "landscape",
    fps: 24,
    quality: "high",
    config: {
      orientation: "landscape",
      useModernEffects: true,
      transitionDuration: 1.5,
      contentMode: "story",
    },
    minDuration: 60,
  },

  "youtube-shorts": {
    id: "youtube-shorts",
    name: "YouTube Shorts",
    description: "Vertical video format for YouTube Shorts",
    platform: "YouTube Shorts",
    aspectRatio: "9:16",
    orientation: "portrait",
    fps: 30,
    quality: "high",
    config: {
      orientation: "portrait",
      useModernEffects: true,
      transitionDuration: 0.8,
      contentMode: "story",
    },
    maxDuration: 60,
    minDuration: 15,
  },

  "tiktok": {
    id: "tiktok",
    name: "TikTok",
    description: "Optimized for TikTok's vertical format",
    platform: "TikTok",
    aspectRatio: "9:16",
    orientation: "portrait",
    fps: 30,
    quality: "standard",
    config: {
      orientation: "portrait",
      useModernEffects: true,
      transitionDuration: 0.5,
      contentMode: "story",
    },
    maxDuration: 180,
    minDuration: 15,
  },

  "instagram-feed": {
    id: "instagram-feed",
    name: "Instagram Feed",
    description: "Square format for Instagram feed posts",
    platform: "Instagram",
    aspectRatio: "1:1",
    orientation: "landscape", // Square uses landscape rendering
    fps: 30,
    quality: "standard",
    config: {
      orientation: "landscape",
      useModernEffects: true,
      transitionDuration: 1.0,
      contentMode: "story",
    },
    maxDuration: 60,
  },

  "instagram-reels": {
    id: "instagram-reels",
    name: "Instagram Reels",
    description: "Vertical video for Instagram Reels",
    platform: "Instagram Reels",
    aspectRatio: "9:16",
    orientation: "portrait",
    fps: 30,
    quality: "high",
    config: {
      orientation: "portrait",
      useModernEffects: true,
      transitionDuration: 0.7,
      contentMode: "story",
    },
    maxDuration: 90,
    minDuration: 15,
  },

  "instagram-story": {
    id: "instagram-story",
    name: "Instagram Story",
    description: "Full-screen vertical format for Instagram Stories",
    platform: "Instagram Stories",
    aspectRatio: "9:16",
    orientation: "portrait",
    fps: 30,
    quality: "standard",
    config: {
      orientation: "portrait",
      useModernEffects: true,
      transitionDuration: 0.5,
      contentMode: "story",
    },
    maxDuration: 15,
  },

  "twitter": {
    id: "twitter",
    name: "Twitter/X",
    description: "Landscape video for Twitter/X posts",
    platform: "Twitter/X",
    aspectRatio: "16:9",
    orientation: "landscape",
    fps: 30,
    quality: "standard",
    config: {
      orientation: "landscape",
      useModernEffects: true,
      transitionDuration: 1.0,
      contentMode: "story",
    },
    maxDuration: 140,
  },

  "linkedin": {
    id: "linkedin",
    name: "LinkedIn",
    description: "Professional video format for LinkedIn",
    platform: "LinkedIn",
    aspectRatio: "16:9",
    orientation: "landscape",
    fps: 24,
    quality: "high",
    config: {
      orientation: "landscape",
      useModernEffects: true,
      transitionDuration: 1.5,
      contentMode: "story",
    },
    maxDuration: 600,
    minDuration: 30,
  },

  "draft-preview": {
    id: "draft-preview",
    name: "Draft Preview",
    description: "Fast, low-quality preview for quick iterations",
    platform: "Preview",
    aspectRatio: "16:9",
    orientation: "landscape",
    fps: 15,
    quality: "draft",
    config: {
      orientation: "landscape",
      useModernEffects: false,
      transitionDuration: 0.3,
      contentMode: "story",
    },
  },

  "high-quality": {
    id: "high-quality",
    name: "High Quality",
    description: "Maximum quality for archival or professional use",
    platform: "General",
    aspectRatio: "16:9",
    orientation: "landscape",
    fps: 30,
    quality: "high",
    config: {
      orientation: "landscape",
      useModernEffects: true,
      transitionDuration: 2.0,
      contentMode: "story",
    },
  },

  "podcast-video": {
    id: "podcast-video",
    name: "Podcast Video",
    description: "Long-form content optimized for podcast clips",
    platform: "Podcast",
    aspectRatio: "16:9",
    orientation: "landscape",
    fps: 24,
    quality: "standard",
    config: {
      orientation: "landscape",
      useModernEffects: false,
      transitionDuration: 1.0,
      contentMode: "story",
    },
    minDuration: 120,
  },
};

/**
 * Get a preset by ID
 */
export function getExportPreset(id: ExportPresetId): ExportPreset {
  return EXPORT_PRESETS[id];
}

/**
 * Get all presets for a specific platform
 */
export function getPresetsForPlatform(platform: string): ExportPreset[] {
  return Object.values(EXPORT_PRESETS).filter(
    (preset) => preset.platform.toLowerCase().includes(platform.toLowerCase())
  );
}

/**
 * Get all presets matching an aspect ratio
 */
export function getPresetsForAspectRatio(
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:5"
): ExportPreset[] {
  return Object.values(EXPORT_PRESETS).filter(
    (preset) => preset.aspectRatio === aspectRatio
  );
}

/**
 * Get the recommended preset based on duration and orientation
 */
export function getRecommendedPreset(
  duration: number,
  orientation: "landscape" | "portrait" = "landscape"
): ExportPreset {
  const presets = Object.values(EXPORT_PRESETS).filter(
    (p) => p.orientation === orientation
  );

  // Find presets that match the duration range
  const matchingPresets = presets.filter((p) => {
    const minOk = !p.minDuration || duration >= p.minDuration;
    const maxOk = !p.maxDuration || duration <= p.maxDuration;
    return minOk && maxOk;
  });

  // Return the first matching preset, or default to youtube-landscape/shorts
  if (matchingPresets.length > 0) {
    // Prefer high quality presets
    const highQuality = matchingPresets.find((p) => p.quality === "high");
    return (highQuality || matchingPresets[0])!;
  }

  return orientation === "portrait"
    ? EXPORT_PRESETS["youtube-shorts"]
    : EXPORT_PRESETS["youtube-landscape"];
}

/**
 * Get all preset IDs
 */
export function getAllPresetIds(): ExportPresetId[] {
  return Object.keys(EXPORT_PRESETS) as ExportPresetId[];
}

/**
 * Get preset summary for display
 */
export function getPresetSummary(preset: ExportPreset): string {
  return `${preset.name} (${preset.aspectRatio}, ${preset.quality} quality)`;
}
