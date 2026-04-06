/**
 * Orchestrator Types — Production configuration and progress types
 *
 * These types are used by frontend hooks and server routes for the
 * production pipeline configuration and progress reporting.
 *
 * Note: ProductionProgress/ProductionStage here are the simpler
 * orchestrator-flavored versions. For agent-mode code, prefer the richer
 * ProductionProgress from ai/production/types.ts which has isComplete,
 * tool, success, assetSummary, and sessionId fields.
 */

import type { ContentPlan, NarrationSegment, GeneratedImage, VideoSFXPlan, ValidationResult } from '../../types';
import type { ContentPlannerConfig } from '../content/contentPlannerService';
import type { NarratorConfig } from '../media/narratorService';
import type { EditorConfig } from '../content/editorService';

// --- Configuration ---

export interface ProductionConfig {
    sessionId?: string;
    // Target settings
    targetDuration?: number;
    sceneCount?: number;
    targetAudience?: string;

    // Visual settings
    visualStyle?: string; // Art style (Cinematic, Anime, etc.)
    aspectRatio?: string; // 16:9, 9:16, 1:1
    globalSubject?: string; // Subject to keep consistent

    // Agent configs
    contentPlannerConfig?: ContentPlannerConfig;
    narratorConfig?: NarratorConfig;
    editorConfig?: EditorConfig;

    // Options
    skipNarration?: boolean; // Skip TTS synthesis
    skipVisuals?: boolean; // Skip image generation
    skipValidation?: boolean; // Skip editor validation
    animateVisuals?: boolean; // Animate images to video with DeAPI
    applyStyleConsistency?: boolean; // Apply img2img consistency pass after visuals (DeAPI)
    animateWithBgRemoval?: boolean; // Remove backgrounds before animation (DeAPI)
    veoVideoCount?: number; // Number of scenes to generate as professional videos
    maxRetries?: number; // Max feedback loop iterations
}

// --- Progress Tracking ---

export type ProductionStage =
    | "content_planning"
    | "narrating"
    | "generating_visuals"
    | "applying_style_consistency"
    | "animating_visuals"
    | "validating"
    | "adjusting"
    | "complete";

export interface ProductionProgress {
    stage: ProductionStage;
    progress: number; // 0-100
    message: string;
    currentScene?: number;
    totalScenes?: number;
}

export type ProgressCallback = (progress: ProductionProgress) => void;

// --- Result Type ---

export interface ProductionResult {
    contentPlan: ContentPlan;
    narrationSegments: NarrationSegment[];
    visuals: GeneratedImage[];
    sfxPlan: VideoSFXPlan | null;
    validation: ValidationResult;
    success: boolean;
    errors?: string[];
}
