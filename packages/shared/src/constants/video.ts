/**
 * Video purpose options for the sidebar selector.
 * Each purpose affects visual style and pacing of generated content.
 */
export interface VideoPurposeOption {
  value: string;
  label: string;
  description: string;
  icon?: string;
}

export const VIDEO_PURPOSES: VideoPurposeOption[] = [
  {
    value: "music_video",
    label: "Music Video",
    description: "Cinematic, emotional, dramatic scenes",
    icon: "🎵",
  },
  {
    value: "social_short",
    label: "Social Short",
    description: "TikTok/Reels - bold, fast-paced",
    icon: "📱",
  },
  {
    value: "documentary",
    label: "Documentary",
    description: "Realistic, informative visuals",
    icon: "🎬",
  },
  {
    value: "commercial",
    label: "Commercial/Ad",
    description: "Clean, product-focused, persuasive",
    icon: "📺",
  },
  {
    value: "podcast_visual",
    label: "Podcast Visual",
    description: "Ambient, non-distracting backgrounds",
    icon: "🎙️",
  },
  {
    value: "lyric_video",
    label: "Lyric Video",
    description: "Space for text overlays",
    icon: "🎤",
  },
  {
    value: "storytelling",
    label: "Storytelling",
    description: "Narrative-driven, folklore, tales",
    icon: "📖",
  },
  {
    value: "educational",
    label: "Educational",
    description: "Clear explanations, diagrams, tutorials",
    icon: "🎓",
  },
  {
    value: "horror_mystery",
    label: "Horror/Mystery",
    description: "Dark, suspenseful, atmospheric",
    icon: "👻",
  },
  {
    value: "travel",
    label: "Travel/Nature",
    description: "Scenic landscapes, exploration",
    icon: "🌍",
  },
  {
    value: "motivational",
    label: "Motivational",
    description: "Inspiring, uplifting, empowering",
    icon: "💪",
  },
  {
    value: "news_report",
    label: "News Report",
    description: "Factual, journalistic, current events",
    icon: "📰",
  },
];

/**
 * Video purpose type for type-safe usage.
 */
export type VideoPurpose =
  | "music_video"
  | "social_short"
  | "documentary"
  | "commercial"
  | "podcast_visual"
  | "lyric_video"
  | "storytelling"
  | "educational"
  | "horror_mystery"
  | "travel"
  | "motivational"
  | "news_report"
  // Story Mode genre-specific purposes
  | "story_drama"
  | "story_comedy"
  | "story_thriller"
  | "story_scifi"
  | "story_action"
  | "story_fantasy"
  | "story_romance"
  | "story_historical"
  | "story_animation";

/**
 * Camera angles for visual variety in prompt generation.
 * Used to ensure diverse compositions across scenes.
 */
export const CAMERA_ANGLES = [
  "wide establishing shot",
  "medium shot",
  "close-up",
  "extreme close-up on details",
  "low angle looking up",
  "high angle looking down",
  "over-the-shoulder",
  "dutch angle",
  "tracking shot",
  "aerial/drone view",
] as const;

export type CameraAngle = (typeof CAMERA_ANGLES)[number];

/**
 * Lighting moods for emotional progression in scenes.
 * Used to create visual variety and emotional arc.
 */
export const LIGHTING_MOODS = [
  "golden hour warm lighting",
  "cool blue moonlight",
  "dramatic chiaroscuro shadows",
  "soft diffused overcast",
  "neon-lit urban glow",
  "harsh midday sun",
  "candlelit intimate warmth",
  "silhouette backlighting",
  "foggy atmospheric haze",
  "studio three-point lighting",
] as const;

export type LightingMood = (typeof LIGHTING_MOODS)[number];

/**
 * Default negative constraints for image/video generation.
 * These are appended to prompts to avoid common generation issues.
 * Enhanced with aggressive artifact filtering for cinematic quality.
 */
export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "no text",
  "no subtitles",
  "no watermark",
  "no logo",
  "no brand names",
  "no split-screen",
  "no collage",
  "no UI elements",
  "no distorted anatomy",
  "no extra limbs",
  "no deformed hands",
  "no blurry face",
  "no melted faces",
  // Enhanced quality filters
  "no blurry backgrounds",
  "no low resolution",
  "no jpeg artifacts",
  "no cartoon style (unless specified)",
  "no illustration style (unless specified)",
  "no generic stock photo look",
  "no dull lighting",
  "no flat composition",
] as const;

export type NegativeConstraint = (typeof DEFAULT_NEGATIVE_CONSTRAINTS)[number];
