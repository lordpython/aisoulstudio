/**
 * Agent Orchestrator Service
 *
 * Unified service that runs the complete video production pipeline:
 * 1. ContentPlanner -> generates video plan with scenes
 * 2. Narrator -> generates audio narration for each scene
 * 3. (Visual Generation) -> generates images/videos for each scene (existing)
 * 4. SFX Planning -> generates mood-based ambient sound plan
 * 5. Editor/Critic -> validates and provides feedback
 * 6. FFmpeg -> final assembly
 *
 * ROBUST PATTERNS IMPLEMENTED:
 * - Per-stage timeout protection (prevents hung operations)
 * - Retry with exponential backoff for transient failures
 * - Graceful degradation with fallback visuals/audio
 * - Comprehensive error logging with stage context
 * - AbortController support for cancellation
 * - Concurrent visual generation with rate limiting
 */

import { ContentPlan, NarrationSegment, GeneratedImage, ValidationResult, AppState, VideoSFXPlan, Scene } from "../types";
import { generateContentPlan, ContentPlannerConfig } from "./contentPlannerService";
import { narrateAllScenes, NarratorConfig } from "./narratorService";
import { validateContentPlan, syncDurationsToNarration, EditorConfig } from "./editorService";
import { generateImageFromPrompt } from "./imageService";
import { animateImageWithDeApi, isDeApiConfigured, applyStyleConsistency } from "./deapiService";
import { enhanceVideoPrompt } from "./deapiPromptService";
import { generateProfessionalVideo } from "./videoService";
import { generateMotionPrompt } from "./promptService";
import { generateVideoSFXPlan, generateVideoSFXPlanWithAudio, isSFXAudioAvailable } from "./sfxService";
import { getEffectiveLegacyTone } from "./tripletUtils";
import { traceAsync, isTracingEnabled } from "./tracing";
import {
    withTimeout,
    withRetryBackoff,
    runWithConcurrency,
    createServiceLogger,
} from "./shared/robustUtils";

// Create a service-specific logger
const log = createServiceLogger("Orchestrator");

// --- Timeout Configuration ---
// These timeouts protect against hung operations and enable graceful recovery

const STAGE_TIMEOUTS = {
    /** Content planning stage timeout (2 minutes) */
    CONTENT_PLANNING: 120_000,
    /** Per-scene narration timeout (60 seconds per scene) */
    NARRATION_PER_SCENE: 60_000,
    /** Total narration timeout (10 minutes max) */
    NARRATION_TOTAL: 600_000,
    /** Per-image generation timeout (90 seconds) */
    VISUAL_PER_IMAGE: 90_000,
    /** Per-video animation timeout (3 minutes - video gen is slow) */
    ANIMATION_PER_VIDEO: 180_000,
    /** SFX planning timeout (60 seconds) */
    SFX_PLANNING: 60_000,
    /** Validation timeout (90 seconds) */
    VALIDATION: 90_000,
} as const;

const RETRY_CONFIG = {
    /** Max retries for content planning (critical stage) */
    CONTENT_PLANNING: 3,
    /** Max retries for narration per scene */
    NARRATION: 2,
    /** Max retries for visual generation per image */
    VISUAL: 2,
    /** Max retries for animation per video */
    ANIMATION: 1,
    /** Max retries for SFX planning */
    SFX: 2,
    /** Max retries for validation */
    VALIDATION: 2,
} as const;

// --- Configuration ---

export interface ProductionConfig {
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

const DEFAULT_CONFIG: Required<Pick<ProductionConfig, "targetDuration" | "sceneCount" | "targetAudience" | "visualStyle" | "aspectRatio" | "skipNarration" | "skipVisuals" | "skipValidation" | "animateVisuals" | "applyStyleConsistency" | "animateWithBgRemoval" | "maxRetries">> = {
    targetDuration: 60,
    sceneCount: 5,
    targetAudience: "General audience",
    visualStyle: "Cinematic",
    aspectRatio: "16:9",
    skipNarration: false,
    skipVisuals: false,
    skipValidation: false,
    animateVisuals: false, // Default off - requires DeAPI key
    applyStyleConsistency: false, // Default off - requires DeAPI key
    animateWithBgRemoval: false, // Default off - requires DeAPI key
    maxRetries: 2,
};

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

// --- Error Types ---

export class OrchestratorError extends Error {
    constructor(
        message: string,
        public readonly stage: ProductionStage,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = "OrchestratorError";
    }
}

// --- Main Pipeline ---

/**
 * Run the complete video production pipeline.
 * 
 * @param input - Either a topic string or existing content
 * @param config - Production configuration
 * @param onProgress - Progress callback
 * @returns Production result with all assets
 */
export const runProductionPipeline = traceAsync(
    async function runProductionPipelineImpl(
        input: string | { topic: string },
        config: ProductionConfig = {},
        onProgress?: ProgressCallback,
        signal?: AbortSignal
    ): Promise<ProductionResult> {
        const topic = typeof input === "string" ? input : input.topic;

        const mergedConfig = { ...DEFAULT_CONFIG, ...config };

        log.info("Starting production pipeline");
        log.info(`Topic: "${topic.substring(0, 50)}..."`);
        if (isTracingEnabled()) {
            log.info("LangSmith tracing is active");
        }

        const result: ProductionResult = {
            contentPlan: null as any,
            narrationSegments: [],
            visuals: [],
            sfxPlan: null,
            validation: { approved: false, score: 0, issues: [], suggestions: [] },
            success: false,
            errors: [],
        };

        // Helper to check abort signal and throw if aborted
        const checkAbort = () => {
            if (signal?.aborted) {
                throw new Error("Production pipeline was cancelled");
            }
        };

        try {
            // --- Stage 1: Content Planning ---
            checkAbort();
            onProgress?.({
                stage: "content_planning",
                progress: 0,
                message: "Analyzing content and creating video plan...",
            });

            log.info("Stage 1: Content Planning (with timeout and retry)");

            // Wrap content planning with timeout and retry for robustness
            result.contentPlan = await withRetryBackoff(
                async () => withTimeout(
                    generateContentPlan(topic, {
                        targetDuration: mergedConfig.targetDuration,
                        sceneCount: mergedConfig.sceneCount,
                        targetAudience: mergedConfig.targetAudience,
                        config: mergedConfig.contentPlannerConfig,
                    }),
                    STAGE_TIMEOUTS.CONTENT_PLANNING,
                    "Content planning timed out"
                ),
                {
                    maxRetries: RETRY_CONFIG.CONTENT_PLANNING,
                    baseDelay: 2000,
                    onRetry: (attempt, error) => {
                        log.warn(`Content planning retry ${attempt}: ${error.message}`);
                        onProgress?.({
                            stage: "content_planning",
                            progress: 10,
                            message: `Retrying content planning (attempt ${attempt + 1})...`,
                        });
                    },
                    signal,
                }
            );

            onProgress?.({
                stage: "content_planning",
                progress: 100,
                message: `Created plan with ${result.contentPlan.scenes.length} scenes`,
            });

            // --- Stage 2: Narration ---
            if (!mergedConfig.skipNarration) {
                checkAbort();
                onProgress?.({
                    stage: "narrating",
                    progress: 0,
                    message: "Generating voice narration...",
                });

                log.info("Stage 2: Narration (with per-scene timeout and retry)");

                // Pass video purpose to narrator for auto-styling
                const narratorConfigWithPurpose: NarratorConfig = {
                    ...mergedConfig.narratorConfig,
                    videoPurpose: mergedConfig.contentPlannerConfig?.videoPurpose,
                };

                // Calculate total timeout based on scene count
                const totalNarrationTimeout = Math.min(
                    STAGE_TIMEOUTS.NARRATION_PER_SCENE * result.contentPlan.scenes.length,
                    STAGE_TIMEOUTS.NARRATION_TOTAL
                );

                try {
                    result.narrationSegments = await withTimeout(
                        narrateAllScenes(
                            result.contentPlan.scenes,
                            narratorConfigWithPurpose,
                            (sceneIndex, totalScenes) => {
                                checkAbort();
                                onProgress?.({
                                    stage: "narrating",
                                    progress: Math.round((sceneIndex / totalScenes) * 100),
                                    message: `Narrating scene ${sceneIndex + 1} of ${totalScenes}`,
                                    currentScene: sceneIndex + 1,
                                    totalScenes,
                                });
                            }
                        ),
                        totalNarrationTimeout,
                        "Narration timed out"
                    );

                    onProgress?.({
                        stage: "narrating",
                        progress: 100,
                        message: `Generated ${result.narrationSegments.length} audio segments`,
                    });
                } catch (narrationError) {
                    log.error("Narration failed, continuing with empty segments", narrationError);
                    result.errors?.push(`Narration failed: ${narrationError instanceof Error ? narrationError.message : String(narrationError)}`);
                    // Continue without narration - graceful degradation
                    result.narrationSegments = [];
                }

                // Sync scene durations to actual narration lengths immediately
                // This prevents timing mismatches from causing validation failures
                if (result.narrationSegments.length > 0) {
                    result.contentPlan = syncDurationsToNarration(
                        result.contentPlan,
                        result.narrationSegments
                    );
                    log.info(`Synced durations to narration. New total: ${result.contentPlan.totalDuration}s`);
                }
            }

            // --- Stage 3: Visual Generation ---
            if (!mergedConfig.skipVisuals) {
                checkAbort();
                onProgress?.({
                    stage: "generating_visuals",
                    progress: 0,
                    message: "Generating visuals for scenes...",
                });

                log.info("Stage 3: Visual Generation (with timeout and retry per image)");

                const totalScenes = result.contentPlan!.scenes.length;
                let completedCount = 0;

                // Generate visuals with concurrency limit to avoid API rate limits
                const visualResults = await runWithConcurrency(
                    result.contentPlan!.scenes,
                    async (scene: Scene, index: number) => {
                        checkAbort();

                        onProgress?.({
                            stage: "generating_visuals",
                            progress: Math.round((completedCount / totalScenes) * 100),
                            message: `Generating visual ${index + 1}/${totalScenes}: ${scene.name}`,
                            currentScene: index + 1,
                            totalScenes,
                        });

                        log.info(`Generating image for scene: ${scene.name}`);

                        try {
                            // Wrap each image generation with timeout and retry
                            const imageUrl = await withRetryBackoff(
                                async () => withTimeout(
                                    generateImageFromPrompt(
                                        scene.visualDescription,
                                        mergedConfig.visualStyle,
                                        config.globalSubject || "",
                                        mergedConfig.aspectRatio,
                                        false // Don't skip refinement
                                    ),
                                    STAGE_TIMEOUTS.VISUAL_PER_IMAGE,
                                    `Image generation for "${scene.name}" timed out`
                                ),
                                {
                                    maxRetries: RETRY_CONFIG.VISUAL,
                                    baseDelay: 1500,
                                    onRetry: (attempt, error) => {
                                        log.warn(`Image retry for "${scene.name}" (attempt ${attempt}): ${error.message}`);
                                    },
                                    signal,
                                }
                            );

                            completedCount++;
                            log.info(`Generated image for scene ${index + 1}`);

                            return {
                                promptId: scene.id,
                                imageUrl,
                                type: "image" as const,
                            };
                        } catch (error) {
                            completedCount++;
                            log.error(`Failed to generate image for scene ${scene.id}:`, error);
                            result.errors?.push(`Visual generation failed for "${scene.name}": ${error instanceof Error ? error.message : String(error)}`);

                            // Return placeholder - graceful degradation
                            return {
                                promptId: scene.id,
                                imageUrl: "", // Empty = placeholder
                                type: "image" as const,
                            };
                        }
                    },
                    2 // Concurrency limit of 2 to avoid rate limits
                );

                // Collect results (filter out errors that were already handled)
                result.visuals = (visualResults as any[])
                    .filter((r): r is GeneratedImage => !(r instanceof Error) && r !== undefined)
                    .sort((a, b) => {
                        // Maintain scene order
                        const aIdx = result.contentPlan!.scenes.findIndex(s => s.id === a.promptId);
                        const bIdx = result.contentPlan!.scenes.findIndex(s => s.id === b.promptId);
                        return aIdx - bIdx;
                    });

                const successCount = result.visuals.filter(v => v.imageUrl).length;
                onProgress?.({
                    stage: "generating_visuals",
                    progress: 100,
                    message: `Generated ${successCount}/${totalScenes} visuals`,
                });
            } else {
                log.info("Stage 3: Visual Generation (skipped)");
                // Create placeholder visuals
                result.visuals = result.contentPlan.scenes.map((scene) => ({
                    promptId: scene.id,
                    prompt: scene.visualDescription,
                    imageUrl: "",
                    type: "image" as const,
                }));
            }

            // --- Stage 2.5: Style Consistency Pass (Optional, DeAPI img2img) ---
            if (mergedConfig.applyStyleConsistency && isDeApiConfigured() && result.visuals.length > 1) {
                const referenceVisual = result.visuals.find(v => v.imageUrl);
                if (referenceVisual) {
                    checkAbort();
                    log.info("Stage 2.5: Applying style consistency via DeAPI img2img");
                    onProgress?.({
                        stage: "applying_style_consistency",
                        progress: 0,
                        message: "Applying visual style consistency across scenes...",
                    });

                    const visualsToProcess = result.visuals.filter(
                        v => v.imageUrl && v.promptId !== referenceVisual.promptId
                    );
                    const totalToProcess = visualsToProcess.length;
                    let processedCount = 0;

                    await runWithConcurrency(
                        visualsToProcess,
                        async (visual) => {
                            const scene = result.contentPlan!.scenes.find(s => s.id === visual.promptId);
                            if (!scene) return;

                            try {
                                const consistentImage = await applyStyleConsistency(
                                    referenceVisual.imageUrl,
                                    scene.visualDescription,
                                    (mergedConfig.aspectRatio as "16:9" | "9:16" | "1:1") || "16:9",
                                );
                                const idx = result.visuals.findIndex(v => v.promptId === visual.promptId);
                                if (idx !== -1) {
                                    result.visuals[idx]!.imageUrl = consistentImage;
                                    processedCount++;
                                }
                            } catch (err) {
                                log.warn(`Style consistency failed for "${scene.name}" (non-fatal):`, err);
                            }
                            onProgress?.({
                                stage: "applying_style_consistency",
                                progress: Math.round((processedCount / totalToProcess) * 100),
                                message: `Consistency pass: ${processedCount}/${totalToProcess} scenes`,
                            });
                        },
                        3
                    );

                    log.info(`Stage 2.5: Applied consistency to ${processedCount}/${totalToProcess} scenes`);
                    onProgress?.({
                        stage: "applying_style_consistency",
                        progress: 100,
                        message: `Style consistency applied to ${processedCount}/${totalToProcess} scenes`,
                    });
                }
            }

            // --- Stage 3.5: Video Animation (Optional) ---
            if (mergedConfig.animateVisuals && isDeApiConfigured()) {
                checkAbort();
                onProgress?.({
                    stage: "animating_visuals",
                    progress: 0,
                    message: "Animating visuals with AI motion...",
                });

                log.info("Stage 3.5: Video Animation with DeAPI (with timeout per video)");

                const visualsToAnimate = result.visuals.filter(v => v.imageUrl);
                const totalToAnimate = visualsToAnimate.length;
                let animatedCount = 0;

                await runWithConcurrency(
                    visualsToAnimate,
                    async (visual) => {
                    checkAbort();
                    const scene = result.contentPlan!.scenes.find(s => s.id === visual.promptId);

                    if (!scene || !visual.imageUrl) return;

                    try {
                        log.info(`Generating motion prompt for: ${scene.name}`);

                        // Generate AI-powered motion prompt with timeout
                        const motionResult = await withTimeout(
                            generateMotionPrompt(
                                scene.visualDescription,
                                getEffectiveLegacyTone(scene),
                                config.globalSubject || ""
                            ),
                            30_000,
                            `Motion prompt generation for "${scene.name}" timed out`
                        );

                        // DeAPI video prompt enhancement (non-fatal polish pass)
                        const enhancedMotion = await enhanceVideoPrompt(motionResult.combined);
                        log.info(`Animating with prompt: ${enhancedMotion.substring(0, 80)}...`);

                        // Animate the image with timeout and retry
                        const videoUrl = await withRetryBackoff(
                            async () => withTimeout(
                                animateImageWithDeApi(
                                    visual.imageUrl,
                                    enhancedMotion,
                                    (mergedConfig.aspectRatio as "16:9" | "9:16" | "1:1") || "16:9",
                                    undefined,
                                    undefined,
                                    { removeBackground: mergedConfig.animateWithBgRemoval }
                                ),
                                STAGE_TIMEOUTS.ANIMATION_PER_VIDEO,
                                `Animation for "${scene.name}" timed out`
                            ),
                            {
                                maxRetries: RETRY_CONFIG.ANIMATION,
                                baseDelay: 3000,
                                onRetry: (attempt, error) => {
                                    log.warn(`Animation retry for "${scene.name}" (attempt ${attempt}): ${error.message}`);
                                },
                                signal,
                            }
                        );

                        // Update the visual with video URL
                        const visualIndex = result.visuals.findIndex(v => v.promptId === visual.promptId);
                        if (visualIndex !== -1) {
                            (result.visuals[visualIndex] as any).videoUrl = videoUrl;
                            (result.visuals[visualIndex] as any).type = "video";
                            animatedCount++;
                        }

                        log.info(`Animated scene ${animatedCount} successfully`);
                        onProgress?.({
                            stage: "animating_visuals",
                            progress: Math.round((animatedCount / totalToAnimate) * 100),
                            message: `Animated ${animatedCount}/${totalToAnimate} visuals`,
                            currentScene: animatedCount,
                            totalScenes: totalToAnimate,
                        });
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        log.error(`Failed to animate scene ${scene.id} with DeAPI:`, error);

                        // Check if this is a Cloudflare blocking issue - try Veo as fallback
                        const isCloudflareBlock = errorMessage.includes('Cloudflare') ||
                            errorMessage.includes('blocked') ||
                            errorMessage.includes('503');

                        if (isCloudflareBlock) {
                            log.info(`DeAPI blocked by Cloudflare for "${scene.name}", trying Veo 3.1 with professional prompt...`);

                            try {
                                // Use Veo 3.1 with professional cinematographer-level prompt
                                const videoPurpose = mergedConfig.contentPlannerConfig?.videoPurpose || "documentary";
                                const veoVideoUrl = await withTimeout(
                                    generateProfessionalVideo(
                                        scene.visualDescription,
                                        mergedConfig.visualStyle || "Cinematic",
                                        getEffectiveLegacyTone(scene),
                                        config.globalSubject || "",
                                        videoPurpose,
                                        (mergedConfig.aspectRatio as "16:9" | "9:16") || "16:9",
                                        6, // 6 seconds
                                        true // Use Veo 3.1 Fast
                                    ),
                                    STAGE_TIMEOUTS.ANIMATION_PER_VIDEO,
                                    `Veo fallback for "${scene.name}" timed out`
                                );

                                // Update the visual with Veo video URL
                                const visualIndex = result.visuals.findIndex(v => v.promptId === visual.promptId);
                                if (visualIndex !== -1) {
                                    (result.visuals[visualIndex] as any).videoUrl = veoVideoUrl;
                                    (result.visuals[visualIndex] as any).type = "video";
                                    (result.visuals[visualIndex] as any).generatedWithVeo = true;
                                    animatedCount++;
                                }
                                log.info(`Veo 3.1 fallback succeeded for scene ${animatedCount}`);
                            } catch (veoError) {
                                log.error(`Veo fallback also failed for scene ${scene.id}:`, veoError);
                                result.errors?.push(`Animation failed (DeAPI + Veo) for "${scene.name}": ${errorMessage}`);
                                // Continue with static image - graceful degradation
                            }
                        } else {
                            result.errors?.push(`Animation failed for "${scene.name}": ${errorMessage}`);
                            // Continue with static image - graceful degradation
                        }
                    }
                    },
                    3 // Run up to 3 animations in parallel
                );

                onProgress?.({
                    stage: "animating_visuals",
                    progress: 100,
                    message: `Animated ${animatedCount}/${totalToAnimate} visuals`,
                });
            } else if (mergedConfig.animateVisuals && !isDeApiConfigured()) {
                log.info("Stage 3.5: DeAPI not configured - generating professional Veo 3.1 videos...");

                // If DeAPI is not configured, use Veo 3.1 with professional prompt generation
                onProgress?.({
                    stage: "animating_visuals",
                    progress: 0,
                    message: "Generating professional cinematic videos with Veo 3.1...",
                });

                const totalScenes = result.contentPlan!.scenes.length;
                const videoPurpose = mergedConfig.contentPlannerConfig?.videoPurpose || "documentary";
                let videoCount = 0;

                await runWithConcurrency(
                    result.contentPlan!.scenes.map((scene, i) => ({ scene, i })),
                    async ({ scene, i }) => {
                    checkAbort();
                    const visual = result.visuals[i];

                    if (!scene || !visual) return;

                    try {
                        // Generate professional video with AI-powered cinematographer prompt
                        const videoUrl = await withTimeout(
                            generateProfessionalVideo(
                                scene.visualDescription,
                                mergedConfig.visualStyle || "Cinematic",
                                getEffectiveLegacyTone(scene),
                                config.globalSubject || "",
                                videoPurpose,
                                (mergedConfig.aspectRatio as "16:9" | "9:16") || "16:9",
                                6, // 6 seconds
                                true // Use Veo 3.1 Fast
                            ),
                            STAGE_TIMEOUTS.ANIMATION_PER_VIDEO,
                            `Veo video generation for "${scene.name}" timed out`
                        );

                        if (visual) {
                            (visual as any).videoUrl = videoUrl;
                            (visual as any).type = "video";
                            (visual as any).generatedWithVeo = true;
                            videoCount++;
                        }
                        log.info(`Generated Veo 3.1 video for scene ${i + 1}`);
                        onProgress?.({
                            stage: "animating_visuals",
                            progress: Math.round((videoCount / totalScenes) * 100),
                            message: `Generated ${videoCount}/${totalScenes} Veo 3.1 videos`,
                            currentScene: videoCount,
                            totalScenes,
                        });
                    } catch (error) {
                        log.error(`Failed to generate Veo video for scene ${scene.id}:`, error);
                        result.errors?.push(`Veo video failed for "${scene.name}": ${error instanceof Error ? error.message : String(error)}`);
                        // Continue with static image
                    }
                    },
                    3 // Run up to 3 Veo generations in parallel
                );

                onProgress?.({
                    stage: "animating_visuals",
                    progress: 100,
                    message: `Generated ${videoCount}/${totalScenes} videos with Veo 3.1`,
                });
            }

            // --- Stage 4: SFX Planning ---
            checkAbort();
            log.info("Stage 4: SFX Planning (with timeout)");
            const videoPurpose = mergedConfig.contentPlannerConfig?.videoPurpose || "documentary";

            // Log AI-suggested SFX from content plan
            const aiSuggestedSfx = result.contentPlan!.scenes
                .filter(s => s.ambientSfx)
                .map(s => `${s.name}: ${s.ambientSfx}`);
            if (aiSuggestedSfx.length > 0) {
                log.info(`AI-suggested SFX: ${aiSuggestedSfx.join(", ")}`);
            }

            try {
                // Use async version with Freesound if available
                if (isSFXAudioAvailable()) {
                    log.info("Fetching real audio from Freesound...");
                    result.sfxPlan = await withRetryBackoff(
                        async () => withTimeout(
                            generateVideoSFXPlanWithAudio(result.contentPlan.scenes, videoPurpose),
                            STAGE_TIMEOUTS.SFX_PLANNING,
                            "SFX planning with audio timed out"
                        ),
                        {
                            maxRetries: RETRY_CONFIG.SFX,
                            baseDelay: 1000,
                            signal,
                        }
                    );
                } else {
                    result.sfxPlan = generateVideoSFXPlan(result.contentPlan.scenes, videoPurpose);
                }

                log.info(`Generated SFX plan with ${result.sfxPlan.scenes.length} scene plans`);
                if (result.sfxPlan.backgroundMusic) {
                    log.info(`Background music: ${result.sfxPlan.backgroundMusic.name}`);
                    if (result.sfxPlan.backgroundMusic.audioUrl) {
                        log.info(`Audio URL: ${result.sfxPlan.backgroundMusic.audioUrl.substring(0, 50)}...`);
                    }
                }
            } catch (sfxError) {
                log.error("SFX planning failed, using empty plan", sfxError);
                result.errors?.push(`SFX planning failed: ${sfxError instanceof Error ? sfxError.message : String(sfxError)}`);
                // Graceful degradation: create minimal SFX plan
                result.sfxPlan = {
                    scenes: [],
                    backgroundMusic: null,
                    masterVolume: 1.0,
                };
            }

            // --- Stage 5: Validation ---
            if (!mergedConfig.skipValidation) {
                checkAbort();
                onProgress?.({
                    stage: "validating",
                    progress: 0,
                    message: "Validating production quality...",
                });

                log.info("Stage 5: Validation (with timeout)");

                try {
                    result.validation = await withRetryBackoff(
                        async () => withTimeout(
                            validateContentPlan(result.contentPlan, {
                                narrationSegments: result.narrationSegments,
                                visuals: result.visuals,
                                useAICritique: true,
                                config: mergedConfig.editorConfig,
                            }),
                            STAGE_TIMEOUTS.VALIDATION,
                            "Validation timed out"
                        ),
                        {
                            maxRetries: RETRY_CONFIG.VALIDATION,
                            baseDelay: 1500,
                            signal,
                        }
                    );

                    onProgress?.({
                        stage: "validating",
                        progress: 100,
                        message: `Validation score: ${result.validation.score}/100`,
                    });

                    // Log validation result but don't retry - we already synced durations
                    if (!result.validation.approved) {
                        log.info(`Validation score: ${result.validation.score} (below threshold, but continuing)`);
                        log.info(`Issues: ${result.validation.issues.length}, Suggestions: ${result.validation.suggestions.length}`);
                    }
                } catch (validationError) {
                    log.error("Validation failed, using default approval", validationError);
                    result.errors?.push(`Validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
                    // Graceful degradation: assume content is acceptable
                    result.validation = {
                        approved: true,
                        score: 70, // Conservative score since we couldn't validate
                        issues: [{ scene: "general", type: "warning", message: "Validation was skipped due to an error" }],
                        suggestions: [],
                    };
                }
            } else {
                result.validation = { approved: true, score: 100, issues: [], suggestions: [] };
            }

            // --- Success Determination ---
            // Consider it successful if we have content, narration, and visuals
            // Even if validation score is below threshold, the content is usable
            const hasContent = result.contentPlan && result.contentPlan.scenes.length > 0;
            const hasNarration = mergedConfig.skipNarration || result.narrationSegments.length > 0;
            const hasVisuals = mergedConfig.skipVisuals || result.visuals.some(v => v.imageUrl);

            result.success = hasContent && hasNarration && hasVisuals;

            // Log summary of any errors that occurred
            if (result.errors && result.errors.length > 0) {
                log.warn(`Pipeline completed with ${result.errors.length} non-fatal errors:`);
                result.errors.forEach((err, i) => log.warn(`  ${i + 1}. ${err}`));
            }

            onProgress?.({
                stage: "complete",
                progress: 100,
                message: result.success
                    ? `Production complete! Quality: ${result.validation.score}/100`
                    : `Completed with issues (score: ${result.validation.score})`,
            });

            log.info(`Pipeline complete. Success: ${result.success}, Quality: ${result.validation.score}/100`);
            return result;

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            log.error("Pipeline error:", error);

            result.errors?.push(errorMsg);

            // Check if this was an abort
            if (signal?.aborted || errorMsg.includes("cancelled") || errorMsg.includes("aborted")) {
                throw new OrchestratorError(
                    "Production pipeline was cancelled by user",
                    "content_planning",
                    error instanceof Error ? error : undefined
                );
            }

            throw new OrchestratorError(
                `Production pipeline failed: ${errorMsg}`,
                "content_planning",
                error instanceof Error ? error : undefined
            );
        }
    },
    "runProductionPipeline",
    {
        runType: "chain",
        metadata: { service: "agentOrchestrator" },
        tags: ["pipeline", "orchestrator"],
    }
);

/**
 * Map production stage to AppState for UI integration.
 */
export function stageToAppState(stage: ProductionStage): AppState {
    switch (stage) {
        case "content_planning":
            return AppState.CONTENT_PLANNING;
        case "narrating":
            return AppState.NARRATING;
        case "generating_visuals":
        case "animating_visuals":
            return AppState.GENERATING_PROMPTS;
        case "validating":
        case "adjusting":
            return AppState.VALIDATING;
        case "complete":
            return AppState.READY;
        default:
            return AppState.IDLE;
    }
}
