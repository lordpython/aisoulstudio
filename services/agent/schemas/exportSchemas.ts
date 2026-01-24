import { z } from "zod";

/**
 * Schema for export_final_video tool
 */
export const ExportFinalVideoSchema = z.object({
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

export type ExportFinalVideoInput = z.infer<typeof ExportFinalVideoSchema>;

/**
 * Schema for validate_export tool
 */
export const ValidateExportSchema = z.object({
    contentPlanId: z.string().describe("Session ID to validate export readiness for"),
});

export type ValidateExportInput = z.infer<typeof ValidateExportSchema>;

/**
 * Schema for list_export_presets tool
 */
export const ListExportPresetsSchema = z.object({
    platform: z.string().optional().describe("Optional platform filter (e.g., 'youtube', 'instagram', 'tiktok')"),
    aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:5"]).optional().describe("Optional aspect ratio filter"),
});

export type ListExportPresetsInput = z.infer<typeof ListExportPresetsSchema>;
