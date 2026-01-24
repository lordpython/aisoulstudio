import { z } from "zod";

/**
 * Schema for YouTube import tool
 */
export const ImportYouTubeSchema = z.object({
    url: z.string().describe("YouTube or X (Twitter) video URL to import audio from"),
});

export type ImportYouTubeInput = z.infer<typeof ImportYouTubeSchema>;

/**
 * Schema for audio transcription tool
 */
export const TranscribeAudioSchema = z.object({
    contentPlanId: z.string().describe("Session ID where audio is stored"),
    language: z.string().optional().describe("Language code for transcription (e.g., 'en', 'ar'). Auto-detected if omitted."),
});

export type TranscribeAudioInput = z.infer<typeof TranscribeAudioSchema>;
