/**
 * Media Types — Assets, images, videos, song data
 */

export interface WordTiming {
  word: string;
  startTime: number; // seconds
  endTime: number; // seconds
}

export interface SubtitleItem {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  translation?: string;
  words?: WordTiming[]; // Optional for backward-compat with word-level timing
}

/**
 * Asset generation type for each prompt card
 * - image: Generate a still image only
 * - video: Generate a video directly from prompt (Veo)
 * - video_with_image: Generate image first, then animate it (DeAPI style)
 */
export type AssetType = "image" | "video" | "video_with_image";

export interface ImagePrompt {
  id: string;
  text: string;
  mood: string;
  timestamp?: string; // Rough timestamp string (e.g. "00:01:30")
  timestampSeconds?: number; // Parsed seconds for sorting/display
  assetType?: AssetType; // Per-card generation type (defaults to global setting)
}

export interface GeneratedImage {
  promptId: string;
  imageUrl: string;
  type?: "image" | "video";
  /** URL to the generated video file if applicable */
  videoUrl?: string;
  /** Whether this is an animated version of an image */
  isAnimated?: boolean;
  /** Whether the video was generated using Veo 3.1 */
  generatedWithVeo?: boolean;
  /** If video_with_image, stores the base image separately */
  baseImageUrl?: string;
  /** Whether this is a placeholder image due to generation failure */
  isPlaceholder?: boolean;
  /** Cached blob URL for offline/re-export use (prevents expired URL issues) */
  cachedBlobUrl?: string;
}

export interface SongData {
  fileName: string;
  audioUrl: string; // Blob URL for playback
  srtContent: string;
  parsedSubtitles: SubtitleItem[];
  prompts: ImagePrompt[];
  generatedImages: GeneratedImage[];
}
