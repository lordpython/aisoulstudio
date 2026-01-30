/**
 * Production Agent Types and Schemas
 *
 * Shared types, interfaces, and Zod schemas for the production agent system.
 */

import { z } from "zod";
import { ContentPlan, NarrationSegment, GeneratedImage, VideoSFXPlan, ScreenplayScene, CharacterProfile, ShotlistEntry } from "../../../types";
import { type ImportedContent } from "../../agent/importUtils";
import { type MixedAudioResult } from "../../agent/audioMixingTools";
import { type SubtitleResult } from "../../agent/subtitleTools";
import { type ExportResult } from "../../agent/exportTools";
import { type ToolError, type PartialSuccessReport } from "../../agent/errorRecovery";

// --- Zod Schemas for Tool Inputs ---

export const PlanVideoSchema = z.object({
    topic: z.string().describe("Main topic or subject for the video"),
    targetDuration: z.number().min(10).max(600).describe("Target video duration in seconds (10-600)"),
    style: z.string().optional().describe("Visual style (e.g., 'Cinematic', 'Documentary')"),
    mood: z.string().optional().describe("Mood/tone (e.g., 'dramatic', 'upbeat')"),
    videoPurpose: z.string().optional().describe("Purpose (e.g., 'educational', 'entertainment')"),
    audience: z.string().optional().describe("Target audience (e.g., 'children', 'professionals')"),
    language: z.string().optional().describe("Target language (e.g., 'en', 'ar')"),
});

export const NarrateScenesSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan to narrate"),
    voice: z.string().optional().describe("Voice ID to use for narration"),
    language: z.string().optional().describe("Language code for narration (e.g., 'en', 'ar', 'es')"),
    voiceStyle: z.string().optional().describe("Voice style (e.g., 'calm', 'energetic')"),
});

export const GenerateVisualsSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan"),
    veoVideoCount: z.number().min(0).max(10).default(0).describe("Number of scenes to generate with Veo 3.1 video instead of images (0-10, optional)"),
    style: z.string().optional().describe("Visual style (e.g., 'Cinematic', 'Anime')"),
    aspectRatio: z.string().optional().describe("Aspect ratio (16:9, 9:16, 1:1)"),
});

export const PlanSFXSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan"),
    skipAudioDownload: z.boolean().optional().describe("If true, skip downloading SFX audio"),
    mood: z.string().optional().describe("Overall mood for SFX selection"),
});

export const ValidatePlanSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan to validate"),
});

export const AdjustTimingSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan to adjust timing for"),
});

export const GenerateVideoSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan"),
    sceneIndex: z.number().min(0).describe("Zero-based scene index to generate video for"),
    aspectRatio: z.string().optional().default("16:9").describe("Video aspect ratio (e.g., '16:9', '9:16')"),
    duration: z.number().min(4).max(8).optional().default(6).describe("Duration in seconds (4-8)"),
    useFastModel: z.boolean().optional().default(true).describe("Use fast generation model"),
});

export const AnimateImageSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan"),
    sceneIndex: z.number().min(0).describe("Zero-based scene index to animate"),
    customPrompt: z.string().optional().describe("Custom animation prompt (optional, uses scene visual prompt if not provided)"),
});

export const GenerateMusicSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan"),
    style: z.string().optional().describe("Music style (e.g., 'ambient', 'epic')"),
    mood: z.string().optional().describe("Music mood (e.g., 'dramatic', 'peaceful')"),
    instrumental: z.boolean().optional().default(true).describe("Whether to generate instrumental only"),
});

export const StoryModeSchema = z.object({
    topic: z.string().describe("The main topic or idea for the video story"),
    sessionId: z.string().optional().describe("Optional session ID to continue an existing story"),
    targetDuration: z.number().min(30).max(900).optional().describe("Target duration in seconds"),
});

export const VerifyCharacterConsistencySchema = z.object({
    sessionId: z.string().describe("Session ID of the story mode session"),
    characterName: z.string().describe("Name of the character to verify"),
});

// --- Agent State Interfaces ---

/**
 * Production session state containing all intermediate results.
 *
 * Requirements: 1.3, 3.5, 4.1, 9.1, 6.4
 */
export interface ProductionState {
    /** Content plan with scenes and narration scripts */
    contentPlan: ContentPlan | null;
    /** Generated narration audio segments */
    narrationSegments: NarrationSegment[];
    /** Generated visual assets for each scene */
    visuals: GeneratedImage[];
    /** Sound effects plan */
    sfxPlan: VideoSFXPlan | null;
    /** Suno music generation task ID */
    musicTaskId: string | null;
    /** Suno music URL */
    musicUrl: string | null;
    /** Suno music track object */
    musicTrack: Record<string, unknown> | null;
    /** Structured errors encountered during production (Requirement 6.4) */
    errors: ToolError[];
    /** Whether production is complete */
    isComplete: boolean;
    /** Imported content from YouTube or audio file (Requirement 1.3) */
    importedContent: ImportedContent | null;
    /** Quality validation score 0-100 (Requirement 7.1) */
    qualityScore: number;
    /** Number of quality improvement iterations performed (Requirement 7.3) */
    qualityIterations: number;
    /** Best quality score achieved across all validation attempts (Requirement 7.5) */
    bestQualityScore: number;
    /** Mixed audio result combining narration, music, SFX (Requirement 3.5) */
    mixedAudio: MixedAudioResult | null;
    /** Generated subtitles in SRT/VTT format (Requirement 4.1) */
    subtitles: SubtitleResult | null;
    /** Final video export result (Requirement 9.1) */
    exportResult: ExportResult | null;
    /** Exported video blob for easy access */
    exportedVideo: Blob | null;
    /** Partial success report for the production run */
    partialSuccessReport?: PartialSuccessReport;
}

/**
 * Story Mode State
 * Manages the step-by-step generation workflow
 */
export interface StoryModeState {
    id: string;
    topic: string;
    breakdown: string;
    screenplay: ScreenplayScene[];
    characters: CharacterProfile[];
    shotlist: ShotlistEntry[];
    currentStep: 'breakdown' | 'screenplay' | 'characters' | 'shotlist' | 'production';
    updatedAt: number;
}

/**
 * Progress update for production agent
 */
export interface ProductionProgress {
    /** Current stage label */
    stage: string;
    /** Human-readable status message */
    message: string;
    /** Whether the production is complete */
    isComplete: boolean;
    /** Overall percentage complete (0-100) */
    progress?: number;
    /** Current tool being executed */
    tool?: string;
    /** Whether the current tool/stage was successful */
    success?: boolean;
    /** Error details if any */
    error?: string;
    /** Current iteration number */
    iteration?: number;
    /** Maximum iterations allowed */
    maxIterations?: number;
    /** Current scene index (1-based) */
    currentScene?: number;
    /** Total number of scenes */
    totalScenes?: number;
    /** Summary of assets generated (only on completion) */
    assetSummary?: {
        scenes: number;
        narrations: number;
        visuals: number;
        music: number;
        sfx: number;
        subtitles: number;
    };
    /** @deprecated Use progress */
    percentage?: number;
}

/**
 * Create initial production state
 */
export function createInitialState(): ProductionState {
    return {
        contentPlan: null,
        narrationSegments: [],
        visuals: [],
        sfxPlan: null,
        musicTaskId: null,
        musicUrl: null,
        musicTrack: null,
        errors: [],
        isComplete: false,
        importedContent: null,
        qualityScore: 0,
        qualityIterations: 0,
        bestQualityScore: 0,
        mixedAudio: null,
        subtitles: null,
        exportResult: null,
        exportedVideo: null,
    };
}
