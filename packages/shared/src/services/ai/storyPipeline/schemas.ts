/**
 * Story Pipeline — Zod schemas and shared type definitions
 */

import { z } from "zod";
import type { ScreenplayScene, CharacterProfile, FormatMetadata, VideoFormat } from "@/types";

export { type ScreenplayScene, type CharacterProfile, type FormatMetadata, type VideoFormat };

export const BreakdownSchema = z.object({
    acts: z.array(z.object({
        title: z.string(),
        emotionalHook: z.string(),
        narrativeBeat: z.string(),
    })).min(3).max(5),
});

export type BreakdownActs = z.infer<typeof BreakdownSchema>['acts'];

export const ScreenplaySchema = z.object({
    scenes: z.array(z.object({
        heading: z.string(),
        action: z.string(),
        dialogue: z.array(z.object({
            // Hard cap: a character name is never more than 4 words / 30 chars.
            // This rejects paragraphs mistakenly placed in the speaker field.
            speaker: z.string().max(30).describe(
                "Character name ONLY (1-4 words, e.g. 'Faisal', 'Maya', 'Narrator'). " +
                "NEVER put scene descriptions, emotions, or visual directions here."
            ).refine(
                val => val.trim().split(/\s+/).length <= 4,
                { message: "Speaker must be a character name (≤4 words), not a description" }
            ),
            text: z.string().min(1).describe(
                "The spoken dialogue line. Must not be empty."
            ),
        })),
    })).min(3).max(8),
});

// Internal schemas (not exported — used only within this module group)
export const CharacterSchema = z.object({
    characters: z.array(z.object({
        name: z.string(),
        role: z.string(),
        visualDescription: z.string(),
        facialTags: z.string().optional(),
    })),
});

export const VoiceoverSchema = z.object({
    voiceovers: z.array(z.object({
        sceneId: z.string(),
        script: z.string().describe(
            "The voiceover narration rewritten for spoken delivery. " +
            "Include delivery markers: [pause: short|medium|long|beat], " +
            "[emphasis]word[/emphasis], [whisper]text[/whisper], " +
            "[rising-tension]text[/rising-tension], [slow]text[/slow], [breath]."
        ),
    })),
});

export interface StoryProgress {
    stage: 'breakdown' | 'screenplay' | 'characters' | 'voiceover' | 'visuals' | 'complete' | 'error';
    message: string;
    progress?: number; // 0-100
    currentStep?: number;
    totalSteps?: number;
}

/**
 * Options for format-specific narrative generation.
 * All fields are optional; when omitted the pipeline falls back to 'movie-animation' defaults.
 */
export interface FormatAwareGenerationOptions {
    /** Video format identifier — defaults to 'movie-animation' */
    formatId?: VideoFormat;
    /** Genre style modifier (e.g., 'Drama', 'Comedy') */
    genre?: string;
    /** Explicit language override — auto-detected from topic if omitted */
    language?: 'ar' | 'en';
    /** Research summary to incorporate in the prompt (from ResearchService) */
    researchSummary?: string;
    /** Formatted citation list to include alongside the research summary */
    researchCitations?: string;
    /** Raw reference document content to treat as primary source material */
    referenceContent?: string;
    /** User-selected target video duration in seconds — overrides format-registry defaults */
    targetDurationSeconds?: number;
    /** Target audience (AI-inferred or user-provided) — reshapes tone/vocabulary */
    audience?: string;
    /** Overall tonal register (AI-inferred or user-provided) */
    tone?: string;
    /** JSON-serialized brief.narrative — threaded so LLM sees character + arc context */
    narrativeContext?: string;
}
