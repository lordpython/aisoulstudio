/**
 * Content Tools for Production Agent
 * 
 * Tools for content planning, narration, validation, and quality control.
 */

import { tool } from "@langchain/core/tools";
import { agentLogger } from "../../../logger";
import {
    PlanVideoSchema,
    NarrateScenesSchema,
    GenerateVisualsSchema,
    PlanSFXSchema,
    ValidatePlanSchema,
    AdjustTimingSchema,
} from "../types";
import { productionStore } from "../store";
import {
    detectLanguageFromText,
    generateSessionId,
    validateContentPlanId
} from "../utils";
import { generateContentPlan, ContentPlannerConfig } from "../../../contentPlannerService";
import { narrateAllScenes, NarratorConfig } from "../../../narratorService";
import { generateImageFromPrompt } from "../../../imageService";
import { generateVideoSFXPlanWithAudio, isSFXAudioAvailable } from "../../../sfxService";
import { validateContentPlan, syncDurationsToNarration } from "../../../editorService";
import {
    extractVisualStyle,
    injectStyleIntoPrompt,
    type VisualStyle
} from "../../../visualConsistencyService";
import { type VideoPurpose } from "../../../../constants";
import { type GeneratedImage } from "../../../../types";
import { cloudAutosave } from "../../../cloudStorageService";
import { getEffectiveLegacyTone } from "../../../tripletUtils";
import { type ProductionProgress, createInitialState } from "../types";

const log = agentLogger.child('Production');

/**
 * Global progress callback for scene-level progress reporting.
 * Set by the main agent before execution.
 */
let globalProgressCallback: ((progress: ProductionProgress) => void) | null = null;

export function setGlobalProgressCallback(callback: ((progress: ProductionProgress) => void) | null): void {
    globalProgressCallback = callback;
}

export function getGlobalProgressCallback(): ((progress: ProductionProgress) => void) | null {
    return globalProgressCallback;
}

function emitSceneProgress(toolName: string, currentScene: number, totalScenes: number, message: string): void {
    if (globalProgressCallback) {
        const progress = Math.round((currentScene / totalScenes) * 100);
        globalProgressCallback({
            stage: "scene_progress",
            tool: toolName,
            message,
            isComplete: false,
            currentScene,
            totalScenes,
            progress,
            percentage: progress, // Keep for backward compatibility
        });
    }
}

// --- Plan Video Tool ---

export const planVideoTool = tool(
    async ({ topic, targetDuration, style, audience, language, videoPurpose }) => {
        log.info(` Planning video: "${topic}" (${targetDuration}s)`);

        try {
            const config: ContentPlannerConfig = {
                videoPurpose: (videoPurpose || "documentary") as VideoPurpose,
                visualStyle: style || "Cinematic",
                language: language || "ar",
            };

            const contentPlan = await generateContentPlan(topic, {
                targetDuration,
                targetAudience: audience || "General audience",
                config,
            });

            const sessionId = generateSessionId();
            const initialState = createInitialState();
            initialState.contentPlan = contentPlan;

            productionStore.set(sessionId, initialState);

            // Initialize cloud autosave session (fire-and-forget, non-blocking)
            cloudAutosave.initSession(sessionId).catch(err => {
                log.warn('Cloud autosave init failed (non-fatal):', err);
            });

            return JSON.stringify({
                success: true,
                sessionId,
                sceneCount: contentPlan.scenes.length,
                totalDuration: contentPlan.totalDuration,
                scenes: contentPlan.scenes.map((s: { name: string; duration: number }) => ({
                    name: s.name,
                    duration: s.duration,
                })),
                message: `Created content plan with ${contentPlan.scenes.length} scenes (~${contentPlan.totalDuration}s total). IMPORTANT: Use sessionId="${sessionId}" as contentPlanId for all subsequent tool calls (narrate_scenes, generate_visuals, validate_plan, etc.)`,
            });
        } catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    },
    {
        name: "plan_video",
        description: "Generate a video content plan with scenes. The AI decides the optimal number of scenes based on topic, duration, and content requirements. Do NOT specify sceneCount - let the planner decide.",
        schema: PlanVideoSchema,
    }
);

// --- Narrate Scenes Tool ---

export const narrateScenesTool = tool(
    async ({ contentPlanId, language, voiceStyle: _voiceStyle }) => {
        log.info(` Narrating scenes for ${contentPlanId}`);

        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({
                success: false,
                error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.`
            });
        }

        // Auto-detect language from narration scripts if not provided
        let detectedLanguage = language;
        if (!detectedLanguage || detectedLanguage === 'auto') {
            const sampleText = state.contentPlan.scenes[0]?.narrationScript || '';
            detectedLanguage = detectLanguageFromText(sampleText);
            log.info(` Auto-detected language: ${detectedLanguage} from narration text`);
        }

        try {
            const narratorConfig: NarratorConfig = {
                language: detectedLanguage || "en",
                videoPurpose: "documentary" as VideoPurpose,
            };

            const segments = await narrateAllScenes(
                state.contentPlan.scenes,
                narratorConfig,
                (sceneIndex: number, totalScenes: number) => {
                    emitSceneProgress(
                        "narrate_scenes",
                        sceneIndex + 1,
                        totalScenes,
                        `Narrating scene ${sceneIndex + 1}/${totalScenes}`
                    );
                },
                contentPlanId
            );

            const syncedPlan = syncDurationsToNarration(state.contentPlan, segments);

            const currentState = productionStore.get(contentPlanId) || state;
            currentState.contentPlan = syncedPlan;
            currentState.narrationSegments = segments;
            productionStore.set(contentPlanId, currentState);

            return JSON.stringify({
                success: true,
                segmentCount: segments.length,
                totalDuration: syncedPlan.totalDuration,
                message: `Generated ${segments.length} narration segments (~${syncedPlan.totalDuration}s total)`,
            });
        } catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    },
    {
        name: "narrate_scenes",
        description: "Generate voice narration for all scenes in a content plan. Returns audio segments synced to scene timings.",
        schema: NarrateScenesSchema,
    }
);

// --- Generate Visuals Tool ---

const generatingPromises = new Map<string, Promise<string>>();

export const generateVisualsTool = tool(
    async ({ contentPlanId, style, aspectRatio, veoVideoCount = 1 }) => {
        log.info(` Generating visuals for ${contentPlanId} (veoVideoCount: ${veoVideoCount})`);

        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        // Join existing generation if in progress
        if (generatingPromises.has(contentPlanId)) {
            log.info(` Joining existing generation for ${contentPlanId}`);
            return generatingPromises.get(contentPlanId)!;
        }

        const task = (async () => {
            const state = productionStore.get(contentPlanId);
            if (!state?.contentPlan) {
                return JSON.stringify({
                    success: false,
                    error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.`
                });
            }

            // Check if already generated
            if (state.visuals && state.visuals.length >= state.contentPlan.scenes.length && state.visuals.every(v => v.imageUrl)) {
                log.info(` Visuals already generated for ${contentPlanId}, skipping`);
                return JSON.stringify({
                    success: true,
                    visualCount: state.visuals.length,
                    message: `Visuals already exist (${state.visuals.length})`,
                });
            }

            try {
                const visuals: GeneratedImage[] = state.visuals ? [...state.visuals] : [];
                const totalScenes = state.contentPlan.scenes.length;
                const BATCH_SIZE = 3;

                const effectiveVeoCount = Math.min(Math.max(0, veoVideoCount), 5, totalScenes);

                // --- Veo Scenes: Use Veo 3.1 for first N scenes ---
                if (effectiveVeoCount > 0) {
                    const { generateProfessionalVideo } = await import("../../../videoService");

                    for (let sceneIdx = 0; sceneIdx < effectiveVeoCount; sceneIdx++) {
                        const scene = state.contentPlan.scenes[sceneIdx];
                        if (!scene || visuals[sceneIdx]?.imageUrl) continue;

                        log.info(` Generating scene ${sceneIdx + 1}/${effectiveVeoCount} with Veo 3.1`);
                        emitSceneProgress("generate_visuals", sceneIdx + 1, totalScenes, `Generating Veo video: ${scene.name}`);

                        let imageUrl: string;
                        let isVideoScene = false;

                        try {
                            imageUrl = await generateProfessionalVideo(
                                scene.visualDescription,
                                style || "Cinematic",
                                getEffectiveLegacyTone(scene),
                                "", "documentary",
                                (aspectRatio === "9:16" ? "9:16" : "16:9"),
                                8, true,
                                undefined,
                                contentPlanId,
                                sceneIdx
                            );
                            isVideoScene = true;
                            log.info(` Veo 3.1 video generated for scene ${sceneIdx + 1}`);
                        } catch (veoError) {
                            log.warn(` Veo 3.1 failed for scene ${sceneIdx + 1}, falling back to Imagen:`, veoError);
                            imageUrl = await generateImageFromPrompt(
                                scene.visualDescription,
                                style || "Cinematic",
                                "", aspectRatio || "16:9",
                                false,
                                undefined,
                                contentPlanId,
                                sceneIdx
                            );
                        }

                        visuals[sceneIdx] = {
                            promptId: scene.id,
                            imageUrl: imageUrl,
                            type: isVideoScene ? "video" : "image",
                        };

                        const currentState = productionStore.get(contentPlanId) || state;
                        currentState.visuals = visuals;
                        productionStore.set(contentPlanId, currentState);
                    }
                }

                // --- Extract Visual Style from first scene for consistency ---
                let extractedStyle: VisualStyle | null = null;
                if (visuals[0]?.imageUrl) {
                    try {
                        log.info(` Extracting visual style from first scene for consistency`);
                        extractedStyle = await extractVisualStyle(visuals[0].imageUrl, contentPlanId);
                        log.info(` Style extracted: ${extractedStyle.colorPalette.join(", ")}`);
                    } catch (styleError) {
                        log.warn(` Style extraction failed, using default prompts:`, styleError);
                    }
                }

                // --- Remaining Scenes: Parallel batch processing ---
                const remainingScenes = state.contentPlan.scenes.slice(effectiveVeoCount);

                for (let batchStart = 0; batchStart < remainingScenes.length; batchStart += BATCH_SIZE) {
                    const batchEnd = Math.min(batchStart + BATCH_SIZE, remainingScenes.length);
                    const batchScenes = remainingScenes.slice(batchStart, batchEnd);

                    log.info(` Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: scenes ${batchStart + effectiveVeoCount + 1}-${batchEnd + effectiveVeoCount}`);
                    emitSceneProgress(
                        "generate_visuals",
                        batchStart + effectiveVeoCount + 1,
                        totalScenes,
                        `Generating visuals batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (scenes ${batchStart + effectiveVeoCount + 1}-${batchEnd + effectiveVeoCount})`
                    );

                    const batchPromises = batchScenes.map(async (scene, localIndex) => {
                        const globalIndex = batchStart + localIndex + effectiveVeoCount;

                        if (visuals[globalIndex]?.imageUrl) {
                            log.info(` Visual for scene ${globalIndex + 1} already exists, skipping.`);
                            return null;
                        }

                        const enhancedPrompt = extractedStyle
                            ? injectStyleIntoPrompt(scene.visualDescription, extractedStyle)
                            : scene.visualDescription;

                        const imageUrl = await generateImageFromPrompt(
                            enhancedPrompt,
                            style || "Cinematic",
                            "", aspectRatio || "16:9",
                            false,
                            undefined,
                            contentPlanId,
                            globalIndex
                        );

                        return {
                            index: globalIndex,
                            visual: {
                                promptId: scene.id,
                                imageUrl: imageUrl,
                                type: "image" as const,
                            },
                        };
                    });

                    const batchResults = await Promise.allSettled(batchPromises);

                    for (const result of batchResults) {
                        if (result.status === 'fulfilled' && result.value) {
                            visuals[result.value.index] = result.value.visual;
                        } else if (result.status === 'rejected') {
                            log.error(` Batch visual generation failed:`, result.reason);
                        }
                    }

                    const currentState = productionStore.get(contentPlanId) || state;
                    currentState.visuals = visuals;
                    productionStore.set(contentPlanId, currentState);
                }

                const successCount = visuals.filter(v => v?.imageUrl).length;

                return JSON.stringify({
                    success: true,
                    visualCount: successCount,
                    message: `Generated ${successCount}/${totalScenes} visuals using parallel batching`,
                });
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            } finally {
                generatingPromises.delete(contentPlanId);
            }
        })();

        generatingPromises.set(contentPlanId, task);
        return task;
    },
    {
        name: "generate_visuals",
        description: "Generate images/visuals for all scenes in the content plan. This can take a few minutes.",
        schema: GenerateVisualsSchema,
    }
);

// --- Plan SFX Tool ---

export const planSFXTool = tool(
    async ({ contentPlanId, mood: _mood }) => {
        log.info(` Planning SFX for ${contentPlanId}`);

        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({
                success: false,
                error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.`
            });
        }

        try {
            if (!isSFXAudioAvailable()) {
                return JSON.stringify({
                    success: false,
                    error: "SFX service not available (Freesound API key missing)",
                });
            }

            const sfxPlan = await generateVideoSFXPlanWithAudio(state.contentPlan.scenes, "documentary" as VideoPurpose);

            state.sfxPlan = sfxPlan;
            productionStore.set(contentPlanId, state);

            return JSON.stringify({
                success: true,
                sceneCount: sfxPlan.scenes.length,
                message: `Created SFX plan with ${sfxPlan.scenes.length} scene sound effects`,
            });
        } catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    },
    {
        name: "plan_sfx",
        description: "Generate ambient sound effects plan for the video based on scene content and mood.",
        schema: PlanSFXSchema,
    }
);

// --- Validate Plan Tool ---

export const validatePlanTool = tool(
    async ({ contentPlanId }) => {
        log.info(` Validating plan ${contentPlanId}`);

        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({
                success: false,
                error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.`
            });
        }

        try {
            const validation = await validateContentPlan(state.contentPlan);

            state.qualityScore = validation.score;

            if (validation.score > state.bestQualityScore) {
                state.bestQualityScore = validation.score;
            }

            productionStore.set(contentPlanId, state);

            const needsImprovement = validation.score < 80;
            const canRetry = state.qualityIterations < 2;

            return JSON.stringify({
                success: true,
                approved: validation.approved,
                score: validation.score,
                bestScore: state.bestQualityScore,
                iterations: state.qualityIterations,
                needsImprovement,
                canRetry,
                issues: validation.issues,
                suggestions: validation.suggestions,
                message: validation.approved
                    ? `Plan approved with score ${validation.score}/100 (best: ${state.bestQualityScore}/100)`
                    : `Plan needs improvement. Score: ${validation.score}/100 (best: ${state.bestQualityScore}/100). ${canRetry ? 'Can retry quality improvement.' : 'Max retries reached.'}`,
            });
        } catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    },
    {
        name: "validate_plan",
        description: "Validate the content plan quality. Returns approval status, score, and suggestions. If score < 80 and iterations < 2, you should call adjust_timing next.",
        schema: ValidatePlanSchema,
    }
);

// --- Adjust Timing Tool ---

export const adjustTimingTool = tool(
    async ({ contentPlanId }) => {
        log.info(` Adjusting timing for ${contentPlanId}`);

        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({
                success: false,
                error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.`
            });
        }

        if (!state.narrationSegments || state.narrationSegments.length === 0) {
            return JSON.stringify({
                success: false,
                error: "No narration segments found. Generate narration first."
            });
        }

        if (state.qualityIterations >= 2) {
            return JSON.stringify({
                success: false,
                error: `Maximum quality iterations (2) reached. Best score: ${state.bestQualityScore}/100`,
                bestScore: state.bestQualityScore,
            });
        }

        try {
            const syncedPlan = syncDurationsToNarration(state.contentPlan, state.narrationSegments);

            state.contentPlan = syncedPlan;
            state.qualityIterations++;
            productionStore.set(contentPlanId, state);

            return JSON.stringify({
                success: true,
                iteration: state.qualityIterations,
                totalDuration: syncedPlan.totalDuration,
                sceneCount: syncedPlan.scenes.length,
                message: `Adjusted timing to match narration (iteration ${state.qualityIterations}/2). Total duration: ${syncedPlan.totalDuration}s. Call validate_plan again to check improvement.`,
            });
        } catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    },
    {
        name: "adjust_timing",
        description: "Adjust scene timings to match narration audio lengths. Use this when validate_plan returns score < 80 to fix timing mismatches. After calling this, always call validate_plan again. Limited to 2 iterations.",
        schema: AdjustTimingSchema,
    }
);
