/**
 * Production Agent - LangChain Agent for Video Production
 * 
 * An autonomous AI agent that can:
 * - Plan video content based on user request
 * - Decide scene count based on topic and duration
 * - Generate narration, visuals, and SFX
 * - Self-correct if results don't match requirements
 * 
 * NOTE: This uses a simple tool loop pattern instead of LangGraph
 * because LangGraph imports Node.js async_hooks which breaks in browser.
 */

import { z } from "zod";
import { tool, StructuredTool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { GEMINI_API_KEY, MODELS } from "../shared/apiClient";

import { ContentPlan, NarrationSegment, GeneratedImage, VideoSFXPlan, ScreenplayScene, CharacterProfile, ShotlistEntry } from "../../types";
import { generateContentPlan, ContentPlannerConfig } from "../contentPlannerService";
import { narrateAllScenes, NarratorConfig } from "../narratorService";
import { generateImageFromPrompt } from "../imageService";
import { generateMotionPrompt } from "../promptService";
import { generateVideoSFXPlanWithAudio, isSFXAudioAvailable } from "../sfxService";
import { validateContentPlan, syncDurationsToNarration } from "../editorService";
import { extractVisualStyle, injectStyleIntoPrompt, verifyCharacterConsistency, type VisualStyle } from "../visualConsistencyService";
import { animateImageWithDeApi, isDeApiConfigured } from "../deapiService";
import { generateMusic as sunoGenerateMusic, waitForCompletion as sunoWaitForCompletion, isSunoConfigured } from "../sunoService";
import { type VideoPurpose } from "../../constants";
import { importTools } from "../agent/importTools";
import { type ImportedContent } from "../agent/importUtils";
import { exportTools } from "../agent/exportTools";
import { subtitleTools } from "../agent/subtitleTools";
import { audioMixingTools } from "../agent/audioMixingTools";
import { enhancementTools } from "../agent/enhancementTools";
import { cloudStorageTools } from "../agent/cloudStorageTools";
import {
    toolRegistry,
    ToolGroup,
    createToolDefinition,
} from "../agent/toolRegistry";
import {
    analyzeIntent,
    generateIntentHint,
} from "../agent/intentDetection";
import { type MixedAudioResult } from "../agent/audioMixingTools";
import { type SubtitleResult } from "../agent/subtitleTools";
import { type ExportResult } from "../agent/exportTools";
import {
    type ToolError,
    type PartialSuccessReport,
    ErrorTracker,
    getRecoveryStrategy,
    executeWithRetry,
    applyFallback,
    classifyError,
} from "../agent/errorRecovery";
import { cloudAutosave } from "../cloudStorageService";

// --- Language Detection ---

/**
 * Detect language from text content using Unicode character analysis.
 * Used to auto-select the appropriate TTS voice for narration.
 * 
 * @param text - The text to analyze
 * @returns Language code (e.g., 'ar', 'en', 'he', 'zh')
 */
function detectLanguageFromText(text: string): string {
    if (!text || text.trim().length === 0) {
        return 'en';
    }

    // Count characters in different Unicode ranges
    let arabicCount = 0;
    let hebrewCount = 0;
    let chineseCount = 0;
    let japaneseCount = 0;
    let koreanCount = 0;
    let cyrillicCount = 0;
    let greekCount = 0;
    let latinCount = 0;
    let totalAlpha = 0;

    for (const char of text) {
        const code = char.charCodeAt(0);

        // Arabic: U+0600–U+06FF, U+0750–U+077F (Arabic Supplement)
        if ((code >= 0x0600 && code <= 0x06FF) || (code >= 0x0750 && code <= 0x077F)) {
            arabicCount++;
            totalAlpha++;
        }
        // Hebrew: U+0590–U+05FF
        else if (code >= 0x0590 && code <= 0x05FF) {
            hebrewCount++;
            totalAlpha++;
        }
        // CJK (Chinese): U+4E00–U+9FFF
        else if (code >= 0x4E00 && code <= 0x9FFF) {
            chineseCount++;
            totalAlpha++;
        }
        // Japanese (Hiragana + Katakana): U+3040–U+30FF
        else if (code >= 0x3040 && code <= 0x30FF) {
            japaneseCount++;
            totalAlpha++;
        }
        // Korean (Hangul): U+AC00–U+D7AF
        else if (code >= 0xAC00 && code <= 0xD7AF) {
            koreanCount++;
            totalAlpha++;
        }
        // Cyrillic (Russian, etc.): U+0400–U+04FF
        else if (code >= 0x0400 && code <= 0x04FF) {
            cyrillicCount++;
            totalAlpha++;
        }
        // Greek: U+0370–U+03FF
        else if (code >= 0x0370 && code <= 0x03FF) {
            greekCount++;
            totalAlpha++;
        }
        // Latin (A-Z, a-z, extended Latin)
        else if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x024F)) {
            latinCount++;
            totalAlpha++;
        }
    }

    // Determine majority language (need at least 20% of text to be in that script)
    const threshold = totalAlpha * 0.2;

    if (arabicCount > threshold && arabicCount >= Math.max(hebrewCount, chineseCount, japaneseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'ar';
    }
    if (hebrewCount > threshold && hebrewCount >= Math.max(arabicCount, chineseCount, japaneseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'he';
    }
    if (chineseCount > threshold && chineseCount >= Math.max(arabicCount, hebrewCount, japaneseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'zh';
    }
    if (japaneseCount > threshold && japaneseCount >= Math.max(arabicCount, hebrewCount, chineseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'ja';
    }
    if (koreanCount > threshold && koreanCount >= Math.max(arabicCount, hebrewCount, chineseCount, japaneseCount, cyrillicCount, latinCount)) {
        return 'ko';
    }
    if (cyrillicCount > threshold && cyrillicCount >= Math.max(arabicCount, hebrewCount, chineseCount, japaneseCount, koreanCount, latinCount)) {
        return 'ru';
    }
    if (greekCount > threshold && greekCount >= Math.max(arabicCount, hebrewCount, chineseCount, japaneseCount, koreanCount, cyrillicCount, latinCount)) {
        return 'el';
    }

    // Default to English for Latin script or mixed content
    return 'en';
}

// --- Global Progress Emitter ---

/**
 * Global progress callback for scene-level progress reporting.
 * Tools can emit scene progress by calling this function.
 * Set by runProductionAgent before execution.
 *
 * Requirement 8.2 - Scene progress tracking
 */
let globalProgressCallback: ((progress: ProductionProgress) => void) | null = null;

/**
 * Set the global progress callback for tools to use.
 */
export function setGlobalProgressCallback(callback: ((progress: ProductionProgress) => void) | null): void {
    globalProgressCallback = callback;
}

/**
 * Emit scene progress from within a tool.
 * Use this for multi-scene operations to report percentage completion.
 */
function emitSceneProgress(toolName: string, currentScene: number, totalScenes: number, message: string): void {
    if (globalProgressCallback) {
        const percentage = Math.round((currentScene / totalScenes) * 100);
        globalProgressCallback({
            stage: "scene_progress",
            tool: toolName,
            message,
            isComplete: false,
            currentScene,
            totalScenes,
            percentage,
        });
    }
}

// --- Tool Schemas ---

const PlanVideoSchema = z.object({
    topic: z.string().describe("The topic or subject for the video"),
    targetDuration: z.number().describe("Target duration in seconds (e.g., 60, 120, 180)"),
    style: z.string().optional().describe("Visual style (Cinematic, Anime, Watercolor, etc.)"),
    audience: z.string().optional().describe("Target audience (General, Educational, Professional)"),
    language: z.string().optional().describe("Language for narration (en, ar, es, etc.)"),
    videoPurpose: z.string().optional().describe("Purpose (documentary, educational, storytelling, etc.)"),
});

const NarrateScenesSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan to narrate"),
    language: z.string().optional().describe("Language code (e.g., 'en', 'ar')"),
    voiceStyle: z.string().optional().describe("Voice style (professional, friendly, dramatic)"),
});

const GenerateVisualsSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan"),
    style: z.string().optional().describe("Visual style override"),
    aspectRatio: z.string().optional().describe("Aspect ratio (16:9, 9:16, 1:1)"),
    veoVideoCount: z.number().optional().describe("Number of scenes to generate with Veo 3.1 professional video (0-5, default 1)"),
});

const PlanSFXSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan"),
    mood: z.string().optional().describe("Overall mood for SFX selection"),
});

const ValidatePlanSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan to validate"),
});

// --- Agent State ---

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
    musicTrack: Record<string, any> | null;
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

// Store for intermediate results (in-memory for now)
export const productionStore: Map<string, ProductionState> = new Map();

/**
 * Story Mode session store (in-memory) 
 */
export const storyModeStore: Map<string, StoryModeState> = new Map();

// Generate unique ID for each production session
function generateSessionId(): string {
    return `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate that a contentPlanId is a real session ID, not a placeholder.
 * Returns an error response if invalid, null if valid.
 * 
 * This prevents the AI from using placeholder values like "plan_123" or "cp_01"
 * which would cause "Content plan not found" errors.
 */
function validateContentPlanId(contentPlanId: string): string | null {
    if (!contentPlanId) {
        return JSON.stringify({
            success: false,
            error: `Missing contentPlanId. You must provide the sessionId returned by plan_video.`
        });
    }

    // Check for common placeholder patterns
    if (contentPlanId.match(/^(plan_\d+|cp_\d+|session_\d+|plan_\w{3,8})$/)) {
        return JSON.stringify({
            success: false,
            error: `Invalid contentPlanId: "${contentPlanId}". You must use the ACTUAL sessionId returned by plan_video (format: prod_TIMESTAMP_HASH). Never use placeholder values.`
        });
    }

    // Check if it matches the expected format
    if (!contentPlanId.startsWith('prod_')) {
        return JSON.stringify({
            success: false,
            error: `Invalid contentPlanId format: "${contentPlanId}". Expected format: prod_TIMESTAMP_HASH. Make sure you are using the exact sessionId returned by plan_video.`
        });
    }

    return null; // Valid
}

// --- Tool Implementations ---

const planVideoTool = tool(
    async ({ topic, targetDuration, style, audience, language, videoPurpose }) => {
        console.log(`[ProductionAgent] Planning video: "${topic}" (${targetDuration}s)`);

        try {
            const config: ContentPlannerConfig = {
                videoPurpose: (videoPurpose || "documentary") as VideoPurpose,
                visualStyle: style || "Cinematic",
                language: language || "ar",
            };

            // Let the AI decide scene count - pass to content planner without hardcoding
            const contentPlan = await generateContentPlan(topic, {
                targetDuration,
                targetAudience: audience || "General audience",
                config,
                // Note: sceneCount is NOT passed - the content planner AI decides
            });

            // Store the result
            const sessionId = generateSessionId();
            productionStore.set(sessionId, {
                contentPlan,
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
            });

            // Initialize cloud autosave session (fire-and-forget, non-blocking)
            cloudAutosave.initSession(sessionId).catch(err => {
                console.warn('[ProductionAgent] Cloud autosave init failed (non-fatal):', err);
            });

            return JSON.stringify({
                success: true,
                sessionId,
                sceneCount: contentPlan.scenes.length,
                totalDuration: contentPlan.totalDuration,
                scenes: contentPlan.scenes.map(s => ({
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

const narrateScenesTool = tool(
    async ({ contentPlanId, language, voiceStyle: _voiceStyle }) => {
        console.log(`[ProductionAgent] Narrating scenes for ${contentPlanId}`);

        // Validate session ID
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({ success: false, error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` });
        }

        // Auto-detect language from narration scripts if not provided
        let detectedLanguage = language;
        if (!detectedLanguage || detectedLanguage === 'auto') {
            // Use first scene's narration to detect language
            const sampleText = state.contentPlan.scenes[0]?.narrationScript || '';
            detectedLanguage = detectLanguageFromText(sampleText);
            console.log(`[ProductionAgent] Auto-detected language: ${detectedLanguage} from narration text`);
        }

        try {
            const narratorConfig: NarratorConfig = {
                language: detectedLanguage || "en",
                videoPurpose: "documentary" as VideoPurpose,
            };

            // Narrate all scenes with progress tracking (Requirement 8.2)
            const segments = await narrateAllScenes(
                state.contentPlan.scenes,
                narratorConfig,
                (sceneIndex, totalScenes) => {
                    emitSceneProgress(
                        "narrate_scenes",
                        sceneIndex + 1,
                        totalScenes,
                        `Narrating scene ${sceneIndex + 1}/${totalScenes}`
                    );
                },
                contentPlanId  // sessionId for cloud autosave
            );

            // Sync durations to actual narration lengths
            const syncedPlan = syncDurationsToNarration(state.contentPlan, segments);


            // Update store (re-fetch)
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

const generatingPromises = new Map<string, Promise<string>>();

const generateVisualsTool = tool(
    async ({ contentPlanId, style, aspectRatio, veoVideoCount = 1 }) => {
        console.log(`[ProductionAgent] Generating visuals for ${contentPlanId} (veoVideoCount: ${veoVideoCount})`);

        // Validate session ID
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        // Join existing generation if in progress
        if (generatingPromises.has(contentPlanId)) {
            console.log(`[ProductionAgent] Joining existing generation for ${contentPlanId}`);
            return generatingPromises.get(contentPlanId)!;
        }

        const task = (async () => {
            const state = productionStore.get(contentPlanId);
            if (!state?.contentPlan) {
                return JSON.stringify({ success: false, error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` });
            }

            // Check if already generated (persistence check)
            // Note: This check is now handled by the central caching system
            // but kept here as a fallback for direct tool calls
            if (state.visuals && state.visuals.length >= state.contentPlan.scenes.length && state.visuals.every(v => v.imageUrl)) {
                console.log(`[ProductionAgent] Visuals already generated for ${contentPlanId}, skipping`);
                return JSON.stringify({
                    success: true,
                    visualCount: state.visuals.length,
                    message: `Visuals already exist (${state.visuals.length})`,
                });
            }

            try {
                // Initialize with existing visuals or empty array
                const visuals: GeneratedImage[] = state.visuals ? [...state.visuals] : [];
                const totalScenes = state.contentPlan.scenes.length;
                const BATCH_SIZE = 3; // Process 3 scenes concurrently to avoid rate limits

                // Clamp veoVideoCount to valid range (0-5, max scenes)
                const effectiveVeoCount = Math.min(Math.max(0, veoVideoCount), 5, totalScenes);

                // --- Veo Scenes: Use Veo 3.1 for first N scenes ---
                if (effectiveVeoCount > 0) {
                    const { generateProfessionalVideo } = await import("../videoService");

                    for (let sceneIdx = 0; sceneIdx < effectiveVeoCount; sceneIdx++) {
                        const scene = state.contentPlan.scenes[sceneIdx];
                        if (!scene || visuals[sceneIdx]?.imageUrl) continue; // Skip if exists

                        console.log(`[ProductionAgent] Generating scene ${sceneIdx + 1}/${effectiveVeoCount} with Veo 3.1`);
                        emitSceneProgress("generate_visuals", sceneIdx + 1, totalScenes, `Generating Veo video: ${scene.name}`);

                        let imageUrl: string;
                        let isVideoScene = false;

                        try {
                            imageUrl = await generateProfessionalVideo(
                                scene.visualDescription,
                                style || "Cinematic",
                                scene.emotionalTone || "dramatic",
                                "", "documentary",
                                (aspectRatio === "9:16" ? "9:16" : "16:9"),
                                8, true,
                                undefined,      // outputGcsUri
                                contentPlanId,  // sessionId for cloud autosave
                                sceneIdx        // sceneIndex
                            );
                            isVideoScene = true;
                            console.log(`[ProductionAgent] Veo 3.1 video generated for scene ${sceneIdx + 1}`);
                        } catch (veoError) {
                            console.warn(`[ProductionAgent] Veo 3.1 failed for scene ${sceneIdx + 1}, falling back to Imagen:`, veoError);
                            imageUrl = await generateImageFromPrompt(
                                scene.visualDescription,
                                style || "Cinematic",
                                "", aspectRatio || "16:9",
                                false,          // skipRefine
                                undefined,      // seed
                                contentPlanId,  // sessionId for cloud autosave
                                sceneIdx        // sceneIndex
                            );
                        }

                        visuals[sceneIdx] = {
                            promptId: scene.id,
                            imageUrl: imageUrl,
                            type: isVideoScene ? "video" : "image",
                        };

                        // Save progress after each Veo scene
                        const currentState = productionStore.get(contentPlanId) || state;
                        currentState.visuals = visuals;
                        productionStore.set(contentPlanId, currentState);
                    }
                }

                // --- Extract Visual Style from first scene for consistency ---
                let extractedStyle: VisualStyle | null = null;
                if (visuals[0]?.imageUrl) {
                    try {
                        console.log(`[ProductionAgent] Extracting visual style from first scene for consistency`);
                        extractedStyle = await extractVisualStyle(visuals[0].imageUrl, contentPlanId);
                        console.log(`[ProductionAgent] Style extracted: ${extractedStyle.colorPalette.join(", ")}`);
                    } catch (styleError) {
                        console.warn(`[ProductionAgent] Style extraction failed, using default prompts:`, styleError);
                    }
                }

                // --- Remaining Scenes: Parallel batch processing with style consistency ---
                const remainingScenes = state.contentPlan.scenes.slice(effectiveVeoCount);

                for (let batchStart = 0; batchStart < remainingScenes.length; batchStart += BATCH_SIZE) {
                    const batchEnd = Math.min(batchStart + BATCH_SIZE, remainingScenes.length);
                    const batchScenes = remainingScenes.slice(batchStart, batchEnd);

                    console.log(`[ProductionAgent] Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: scenes ${batchStart + effectiveVeoCount + 1}-${batchEnd + effectiveVeoCount}`);
                    emitSceneProgress(
                        "generate_visuals",
                        batchStart + effectiveVeoCount + 1,
                        totalScenes,
                        `Generating visuals batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (scenes ${batchStart + effectiveVeoCount + 1}-${batchEnd + effectiveVeoCount})`
                    );

                    // Generate batch in parallel
                    const batchPromises = batchScenes.map(async (scene, localIndex) => {
                        const globalIndex = batchStart + localIndex + effectiveVeoCount; // Skip Veo scenes

                        // Skip if already exists
                        if (visuals[globalIndex]?.imageUrl) {
                            console.log(`[ProductionAgent] Visual for scene ${globalIndex + 1} already exists, skipping.`);
                            return null;
                        }

                        // Apply visual consistency: inject extracted style into prompt
                        const enhancedPrompt = extractedStyle
                            ? injectStyleIntoPrompt(scene.visualDescription, extractedStyle)
                            : scene.visualDescription;

                        const imageUrl = await generateImageFromPrompt(
                            enhancedPrompt,
                            style || "Cinematic",
                            "", aspectRatio || "16:9",
                            false,          // skipRefine
                            undefined,      // seed
                            contentPlanId,  // sessionId for cloud autosave
                            globalIndex     // sceneIndex
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

                    // Wait for batch to complete
                    const batchResults = await Promise.allSettled(batchPromises);

                    // Process results
                    for (const result of batchResults) {
                        if (result.status === 'fulfilled' && result.value) {
                            visuals[result.value.index] = result.value.visual;
                        } else if (result.status === 'rejected') {
                            console.error(`[ProductionAgent] Batch visual generation failed:`, result.reason);
                        }
                    }

                    // Save after each batch
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

const planSFXTool = tool(
    async ({ contentPlanId, mood: _mood }) => {
        console.log(`[ProductionAgent] Planning SFX for ${contentPlanId}`);

        // Validate session ID
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({ success: false, error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` });
        }

        try {
            if (!isSFXAudioAvailable()) {
                return JSON.stringify({
                    success: false,
                    error: "SFX service not available (Freesound API key missing)",
                });
            }


            const sfxPlan = await generateVideoSFXPlanWithAudio(state.contentPlan.scenes, "documentary" as VideoPurpose);

            // Update store
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

const validatePlanTool = tool(
    async ({ contentPlanId }) => {
        console.log(`[ProductionAgent] Validating plan ${contentPlanId}`);

        // Validate session ID
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({ success: false, error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` });
        }

        try {
            const validation = await validateContentPlan(state.contentPlan);

            // Update quality score in state (Requirement 7.1)
            state.qualityScore = validation.score;

            // Track best quality score achieved (Requirement 7.5)
            if (validation.score > state.bestQualityScore) {
                state.bestQualityScore = validation.score;
            }

            productionStore.set(contentPlanId, state);

            // Check if quality is below threshold (Requirement 7.1)
            const needsImprovement = validation.score < 80;
            const canRetry = state.qualityIterations < 2; // Max 2 iterations (Requirement 7.3)

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

// Adjust timing tool for quality improvement (Requirement 7.2)
const AdjustTimingSchema = z.object({
    contentPlanId: z.string().describe("Reference ID of the content plan to adjust"),
});

const adjustTimingTool = tool(
    async ({ contentPlanId }) => {
        console.log(`[ProductionAgent] Adjusting timing for ${contentPlanId}`);

        // Validate session ID
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({ success: false, error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` });
        }

        if (!state.narrationSegments || state.narrationSegments.length === 0) {
            return JSON.stringify({
                success: false,
                error: "No narration segments found. Generate narration first."
            });
        }

        // Check iteration limit (Requirement 7.3)
        if (state.qualityIterations >= 2) {
            return JSON.stringify({
                success: false,
                error: `Maximum quality iterations (2) reached. Best score: ${state.bestQualityScore}/100`,
                bestScore: state.bestQualityScore,
            });
        }

        try {
            // Sync durations to narration to fix timing mismatches (Requirement 7.2)
            const syncedPlan = syncDurationsToNarration(state.contentPlan, state.narrationSegments);

            // Update state with synced plan and increment iteration counter
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

const getProductionStatusTool = tool(
    async ({ contentPlanId }) => {
        // Validate session ID
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state) {
            return JSON.stringify({ success: false, error: `Session not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` });
        }

        return JSON.stringify({
            success: true,
            hasContentPlan: !!state.contentPlan,
            sceneCount: state.contentPlan?.scenes.length || 0,
            totalDuration: state.contentPlan?.totalDuration || 0,
            hasNarration: state.narrationSegments.length > 0,
            narrationCount: state.narrationSegments.length,
            hasVisuals: state.visuals.length > 0,
            visualCount: state.visuals.length,
            hasSFX: !!state.sfxPlan,
            sfxSceneCount: state.sfxPlan?.scenes.length || 0,
            isComplete: state.isComplete,
            errors: state.errors,
        });
    },
    {
        name: "get_production_status",
        description: "Get the current status of a video production session.",
        schema: z.object({
            contentPlanId: z.string().describe("Session ID to check status for"),
        }),
    }
);

const markCompleteTool = tool(
    async ({ contentPlanId }) => {
        // Validate session ID
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state) {
            return JSON.stringify({ success: false, error: `Session not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` });
        }

        state.isComplete = true;
        productionStore.set(contentPlanId, state);

        return JSON.stringify({
            success: true,
            message: "Production marked as complete",
            summary: {
                scenes: state.contentPlan?.scenes.length || 0,
                duration: state.contentPlan?.totalDuration || 0,
                narrations: state.narrationSegments.length,
                visuals: state.visuals.length,
                sfxScenes: state.sfxPlan?.scenes.length || 0,
            },
        });
    },
    {
        name: "mark_complete",
        description: "Mark a production session as complete after all assets are generated.",
        schema: z.object({
            contentPlanId: z.string().describe("Session ID to mark as complete"),
        }),
    }
);

// --- All Tools ---

// Animate Image Tool (DeAPI) - converts still images to video loops
// Generate Video Tool (Veo 3.1) - text-to-video generation
const GenerateVideoSchema = z.object({
    contentPlanId: z.string().describe("Session ID of the production"),
    sceneIndex: z.number().describe("Index of the scene to generate video for (0-based)"),
    style: z.string().optional().describe("Visual style for the video (default: Cinematic)"),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional().describe("Aspect ratio for the video"),
    durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional().describe("Video duration: 4, 6, or 8 seconds (default: 8)"),
    useFastModel: z.boolean().optional().describe("Use Veo 3.1 Fast (40% faster) vs Standard (highest quality) - default true"),
});

const generateVideoTool = tool(
    async ({ contentPlanId, sceneIndex, style, aspectRatio, durationSeconds, useFastModel }) => {
        console.log(`[ProductionAgent] Generating video for scene ${sceneIndex} using Veo 3.1`);

        // Validate session ID
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({ success: false, error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` });
        }

        const scene = state.contentPlan.scenes[sceneIndex];
        if (!scene) {
            return JSON.stringify({
                success: false,
                error: `Scene at index ${sceneIndex} not found in content plan.`
            });
        }

        try {
            // Import professional video generation service
            const { generateProfessionalVideo } = await import("../videoService");

            // Generate video using Veo 3.1 with professional cinematographer prompts
            console.log(`[ProductionAgent] Generating professional Veo 3.1 video for scene ${sceneIndex}: ${scene.name}`);
            const videoUrl = await generateProfessionalVideo(
                scene.visualDescription,
                style || "Cinematic",
                scene.emotionalTone || "dramatic",
                "", // globalSubject
                "documentary", // videoPurpose - could be enhanced from content plan
                (aspectRatio === "9:16" ? "9:16" : "16:9"),
                durationSeconds || 8,
                useFastModel !== false // Default to fast model
            );

            // Update the visual with video URL
            const currentState = productionStore.get(contentPlanId) || state;

            // Ensure visuals array exists and has entry for this scene
            if (!currentState.visuals) {
                currentState.visuals = [];
            }

            // Create or update visual entry
            if (!currentState.visuals[sceneIndex]) {
                currentState.visuals[sceneIndex] = {
                    promptId: scene.id,
                    imageUrl: videoUrl, // Used by assetLoader as source
                };
            }

            currentState.visuals[sceneIndex].imageUrl = videoUrl;
            currentState.visuals[sceneIndex].videoUrl = videoUrl;
            currentState.visuals[sceneIndex].type = "video"; // CRITICAL: Tells assetLoader to use loadVideoAsset
            currentState.visuals[sceneIndex].isAnimated = true;
            currentState.visuals[sceneIndex].generatedWithVeo = true;
            productionStore.set(contentPlanId, currentState);

            return JSON.stringify({
                success: true,
                sceneIndex,
                duration: durationSeconds || 8,
                model: useFastModel !== false ? "veo-3.1-fast" : "veo-3.1-standard",
                message: `Generated professional cinematic video for scene ${sceneIndex} (${durationSeconds || 8}s) with AI-enhanced prompt`,
            });
        } catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    },
    {
        name: "generate_video",
        description: "Generate professional cinematic video using Veo 3.1 with AI-powered cinematographer prompts. Automatically transforms scene descriptions into detailed prompts with camera movements, lighting design, and motion choreography. Creates 4-8 second broadcast-quality videos. Use this for direct text-to-video generation. For image-to-video animation, use animate_image instead.",
        schema: GenerateVideoSchema,
    }
);

const AnimateImageSchema = z.object({
    contentPlanId: z.string().describe("Session ID of the production"),
    sceneIndex: z.number().describe("Index of the scene to animate (0-based)"),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional().describe("Aspect ratio for the video"),
});

const animateImageTool = tool(
    async ({ contentPlanId, sceneIndex, aspectRatio }) => {
        console.log(`[ProductionAgent] Animating image for scene ${sceneIndex}`);

        // Validate session ID
        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({ success: false, error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` });
        }

        const visual = state.visuals[sceneIndex];
        if (!visual) {
            return JSON.stringify({
                success: false,
                error: `No visual found for scene ${sceneIndex}. Generate visuals first.`
            });
        }

        const scene = state.contentPlan.scenes[sceneIndex];
        if (!scene) {
            return JSON.stringify({
                success: false,
                error: `Scene at index ${sceneIndex} not found in content plan.`
            });
        }

        // Helper function to try Veo as fallback with professional cinematographer prompts
        const tryVeoFallback = async (): Promise<string> => {
            console.log(`[ProductionAgent] Trying Veo 3.1 with professional prompt for scene ${sceneIndex}`);
            const { generateProfessionalVideo } = await import("../videoService");
            // Use professional video generation with AI-powered cinematographer prompt
            return generateProfessionalVideo(
                scene.visualDescription,
                "Cinematic",
                scene.emotionalTone || "dramatic",
                "", // globalSubject
                "documentary", // videoPurpose
                (aspectRatio === "9:16" ? "9:16" : "16:9"),
                6, // 6 seconds
                true // Use Veo 3.1 Fast
            );
        };

        // If DeAPI is not configured, try Veo with professional cinematographer prompts
        if (!isDeApiConfigured()) {
            console.log(`[ProductionAgent] DeAPI not configured, generating professional Veo 3.1 video for scene ${sceneIndex}`);
            try {
                const videoUrl = await tryVeoFallback();

                const currentState = productionStore.get(contentPlanId) || state;
                if (currentState.visuals && currentState.visuals[sceneIndex]) {
                    (currentState.visuals[sceneIndex] as any).videoUrl = videoUrl;
                    (currentState.visuals[sceneIndex] as any).isAnimated = true;
                    (currentState.visuals[sceneIndex] as any).generatedWithVeo = true;
                    productionStore.set(contentPlanId, currentState);
                }

                return JSON.stringify({
                    success: true,
                    sceneIndex,
                    message: `Generated professional cinematic video for scene ${sceneIndex} with AI-enhanced prompt (DeAPI not configured)`,
                    usedVeo: true
                });
            } catch (veoError) {
                return JSON.stringify({
                    success: false,
                    error: `Both DeAPI (not configured) and Veo fallback failed: ${veoError instanceof Error ? veoError.message : String(veoError)}`,
                });
            }
        }

        try {
            // Generate AI-powered motion prompt with camera movements and environmental effects
            console.log(`[ProductionAgent] Generating motion prompt for scene ${sceneIndex}`);
            const motionPrompt = await generateMotionPrompt(
                scene.visualDescription,
                scene.emotionalTone || "cinematic",
                "" // globalSubject - could be enhanced later with character tracking
            );
            console.log(`[ProductionAgent] Motion prompt: ${motionPrompt.substring(0, 100)}...`);

            const videoUrl = await animateImageWithDeApi(
                visual.imageUrl,
                motionPrompt,
                (aspectRatio as "16:9" | "9:16" | "1:1") || "16:9",
                contentPlanId,  // sessionId for cloud autosave
                sceneIndex      // scene index for file naming
            );


            // Update the visual with video URL (re-fetch)
            const currentState = productionStore.get(contentPlanId) || state;
            if (currentState.visuals && currentState.visuals[sceneIndex]) {
                (currentState.visuals[sceneIndex] as any).videoUrl = videoUrl;
                (currentState.visuals[sceneIndex] as any).isAnimated = true;
                productionStore.set(contentPlanId, currentState);
            }

            return JSON.stringify({
                success: true,
                sceneIndex,
                message: `Animated scene ${sceneIndex} successfully`,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Check if this is a Cloudflare blocking issue - try Veo as fallback
            const isCloudflareBlock = errorMessage.includes('Cloudflare') ||
                errorMessage.includes('blocked') ||
                errorMessage.includes('503');

            if (isCloudflareBlock) {
                console.log(`[ProductionAgent] DeAPI blocked by Cloudflare, generating professional Veo 3.1 video for scene ${sceneIndex}`);
                try {
                    const videoUrl = await tryVeoFallback();

                    const currentState = productionStore.get(contentPlanId) || state;
                    if (currentState.visuals && currentState.visuals[sceneIndex]) {
                        (currentState.visuals[sceneIndex] as any).videoUrl = videoUrl;
                        (currentState.visuals[sceneIndex] as any).isAnimated = true;
                        (currentState.visuals[sceneIndex] as any).generatedWithVeo = true;
                        productionStore.set(contentPlanId, currentState);
                    }

                    return JSON.stringify({
                        success: true,
                        sceneIndex,
                        message: `Generated professional cinematic video for scene ${sceneIndex} with AI-enhanced prompt (DeAPI blocked by Cloudflare)`,
                        usedVeo: true
                    });
                } catch (veoError) {
                    return JSON.stringify({
                        success: false,
                        error: `DeAPI blocked by Cloudflare, and Veo fallback also failed: ${veoError instanceof Error ? veoError.message : String(veoError)}`,
                    });
                }
            }

            return JSON.stringify({
                success: false,
                error: errorMessage,
            });
        }
    },
    {
        name: "animate_image",
        description: "Convert a still image to a short video loop. Uses DeAPI (image-to-video) with automatic Veo 3.1 fallback if DeAPI is blocked. Call AFTER generate_visuals. Only use if user wants animated scenes.",
        schema: AnimateImageSchema,
    }
);

// --- Generate Music Tool (Suno) ---

const GenerateMusicSchema = z.object({
    contentPlanId: z.string().describe("Session ID of the production"),
    style: z.string().describe("Music genre/style (Pop, Orchestral, Lo-Fi, Cinematic, etc.)"),
    mood: z.string().describe("Mood (upbeat, calm, dramatic, epic, melancholic)"),
    duration: z.number().optional().describe("Duration in seconds (defaults to video duration)"),
    instrumental: z.boolean().optional().describe("Instrumental only (no vocals) - default true for BGM"),
});

const generateMusicTool = tool(
    async ({ contentPlanId, style, mood, duration, instrumental }) => {
        console.log(`[ProductionAgent] Generating music: ${style} - ${mood}`);

        const state = productionStore.get(contentPlanId);

        if (!isSunoConfigured()) {
            return JSON.stringify({
                success: false,
                error: "Suno API not configured. Add VITE_SUNO_API_KEY to .env.local"
            });
        }

        try {
            // Use specified duration if provided
            const finalDuration = duration || state?.contentPlan?.totalDuration || 60;

            // Generate music with Suno
            const taskId = await sunoGenerateMusic({
                prompt: `Create ${mood} background music in ${style} style for a ${finalDuration} second video.`,
                style: style,
                title: `BGM - ${mood} ${style}`,
                instrumental: instrumental !== false, // Default to instrumental for BGM
                model: "V5",
            });

            // Wait for completion
            const tracks = await sunoWaitForCompletion(taskId);

            if (tracks.length > 0 && state && tracks[0]) {
                state.musicTaskId = taskId;
                (state as any).musicUrl = tracks[0].audio_url;
                (state as any).musicTrack = tracks[0];
                productionStore.set(contentPlanId, state);
            }

            return JSON.stringify({
                success: true,
                taskId,
                trackCount: tracks.length,
                musicUrl: tracks[0]?.audio_url,
                duration: tracks[0]?.duration,
                message: `Generated ${style} background music (${tracks[0]?.duration}s)`,
            });
        } catch (error) {
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    },
    {
        name: "generate_music",
        description: "Generate background music for the video using Suno AI. Creates instrumental BGM matching the video mood.",
        schema: GenerateMusicSchema,
    }
);

const StoryModeSchema = z.object({
    topic: z.string().describe("The story topic or initial premise"),
    sessionId: z.string().optional().describe("Existing story session ID"),
});

const generateBreakdownTool = tool(
    async ({ topic, sessionId }) => {
        const id = sessionId || `story_${Date.now()}`;
        console.log(`[ProductionAgent] Generating story breakdown for: ${topic}`);

        const model = new ChatGoogleGenerativeAI({
            model: MODELS.TEXT_EXP,
            apiKey: GEMINI_API_KEY,
            temperature: 0.7,
        });

        const prompt = `Create a narrative breakdown for a video story about: "${topic}".
Divide it into 3-5 distinct acts or chapters. For each act, provide:
1. Title
2. Emotional Hook
3. Key narrative beat

Format as a structured list.`;

        const response = await model.invoke(prompt);
        const breakdown = response.content as string;

        const state: StoryModeState = storyModeStore.get(id) || {
            id,
            topic,
            breakdown,
            screenplay: [],
            characters: [],
            shotlist: [],
            currentStep: 'breakdown',
            updatedAt: Date.now(),
        };

        state.breakdown = breakdown;
        state.currentStep = 'breakdown';
        state.updatedAt = Date.now();
        storyModeStore.set(id, state);

        return JSON.stringify({ success: true, sessionId: id, breakdown });
    },
    {
        name: "generate_breakdown",
        description: "Step 1: Generate a narrative breakdown/outline for the story topic.",
        schema: StoryModeSchema,
    }
);

const createScreenplayTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });

        console.log(`[ProductionAgent] Creating screenplay for: ${sessionId}`);

        const model = new ChatGoogleGenerativeAI({
            model: MODELS.TEXT_EXP,
            apiKey: GEMINI_API_KEY,
            temperature: 0.7,
        });

        const prompt = `Write a short cinematic screenplay based on this breakdown:
${state.breakdown}

Format each scene with:
- SCENE [Number]: [Heading]
- ACTION: [Description]
- DIALOGUE: [Character]: [Text]

Limit to 3-5 scenes.`;

        const response = await model.invoke(prompt);
        const scriptText = response.content as string;

        // Simple parser for the draft screenplay
        const scenes: ScreenplayScene[] = [];
        const sceneBlocks = scriptText.split(/SCENE\s+\d+:/i).filter(b => b.trim());

        sceneBlocks.forEach((block, i) => {
            const lines = block.split('\n').filter(l => l.trim());
            const heading = lines[0] || 'Untitled Scene';
            const actionLines = lines.filter(l => l.toUpperCase().startsWith('ACTION:'));
            const dialogueLines = lines.filter(l => l.includes(':') && !l.toUpperCase().startsWith('ACTION:'));

            scenes.push({
                id: `scene_${i}`,
                sceneNumber: i + 1,
                heading: heading.replace(/ACTION:|DIALOGUE:/gi, '').trim(),
                action: actionLines.map(l => l.replace('ACTION:', '').trim()).join(' '),
                dialogue: dialogueLines.map(l => {
                    const [speaker, ...text] = l.split(':');
                    return { speaker: (speaker || "").trim(), text: text.join(':').trim() };
                }),
                charactersPresent: [],
            });
        });

        state.screenplay = scenes;
        state.currentStep = 'screenplay';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        return JSON.stringify({ success: true, count: scenes.length, scriptText });
    },
    {
        name: "create_screenplay",
        description: "Step 2: Transform the breakdown into a formatted screenplay with dialogue.",
        schema: z.object({ sessionId: z.string() }),
    }
);

const generateCharactersTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });

        console.log(`[ProductionAgent] Extracting characters for: ${sessionId}`);
        const { extractCharacters, generateAllCharacterReferences } = await import("../characterService");

        const scriptText = state.screenplay.map(s => `${s.heading}\n${s.action}\n${s.dialogue.map(d => `${d.speaker}: ${d.text}`).join('\n')}`).join('\n\n');

        const characters = await extractCharacters(scriptText);
        const charactersWithRefs = await generateAllCharacterReferences(characters, sessionId);

        state.characters = charactersWithRefs;
        state.currentStep = 'characters';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        return JSON.stringify({ success: true, count: characters.length, characters: charactersWithRefs });
    },
    {
        name: "generate_characters",
        description: "Step 3: Extract characters from the screenplay and generate consistent visual reference sheets.",
        schema: z.object({ sessionId: z.string() }),
    }
);

const generateShotlistTool = tool(
    async ({ sessionId }) => {
        if (!sessionId) return JSON.stringify({ success: false, error: "sessionId required" });
        const state = storyModeStore.get(sessionId);
        if (!state) return JSON.stringify({ success: false, error: "Session not found" });

        console.log(`[ProductionAgent] Generating shotlist for: ${sessionId}`);

        const model = new ChatGoogleGenerativeAI({
            model: MODELS.TEXT_EXP,
            apiKey: GEMINI_API_KEY,
            temperature: 0.5,
        });

        const prompt = `Based on this screenplay and character list, create a professional shotlist for a storyboard.
For each scene, provide 1-2 key camera shots.

Screenplay:
${JSON.stringify(state.screenplay)}

Characters:
${JSON.stringify(state.characters)}

For each shot, provide:
1. Shot Type (Wide, Close-up, etc.)
2. Visual description including character movements and lighting.
3. Audio/Dialogue for that shot.`;

        const response = await model.invoke(prompt);
        const shotlistText = response.content as string;

        // Basic mock shotlist for now, ideally parsed from AI response
        const shots: ShotlistEntry[] = state.screenplay.map((s, i) => ({
            id: `shot_${i}`,
            sceneId: s.id,
            shotNumber: i + 1,
            description: `Visualizing: ${s.action}`,
            cameraAngle: "Medium",
            movement: "Static",
            lighting: "Cinematic",
            dialogue: s.dialogue[0]?.text || "",
        }));

        state.shotlist = shots;
        state.currentStep = 'shotlist';
        state.updatedAt = Date.now();
        storyModeStore.set(sessionId, state);

        return JSON.stringify({ success: true, count: shots.length, shotlistText });
    },
    {
        name: "generate_shotlist",
        description: "Step 4: Create a detailed shotlist/storyboard from the screenplay and characters.",
        schema: z.object({ sessionId: z.string() }),
    }
);

// --- Character Consistency Check Tool ---

const VerifyCharacterConsistencySchema = z.object({
    sessionId: z.string().describe("Session ID of the production"),
    characterName: z.string().describe("Name of the character to verify"),
});

const verifyCharacterConsistencyTool = tool(
    async ({ sessionId, characterName }) => {
        console.log(`[ProductionAgent] Verifying consistency for ${characterName} in session ${sessionId}`);

        // Try storyModeStore first (Requirements for Phase 5)
        const storyState = storyModeStore.get(sessionId);
        let profileFound: any = storyState?.characters?.find((c: any) => c.name === characterName);
        let imageUrls: string[] = [];

        if (storyState) {
            // In Story Mode, shotlist entries have imageUrls
            imageUrls = storyState.shotlist
                .filter((s: any) => s.imageUrl)
                .map((s: any) => s.imageUrl);
        } else {
            // Fallback to productionStore
            const pState = productionStore.get(sessionId);
            if (pState) {
                profileFound = pState.contentPlan?.characters?.find(c => c.name === characterName);
                if (!profileFound) {
                    // Try to find in characters list if it exists in state
                    profileFound = (pState as any).characters?.find((c: any) => c.name === characterName);
                }
                imageUrls = pState.visuals
                    .filter(v => !v.isPlaceholder)
                    .map(v => v.imageUrl);
            }
        }

        if (!profileFound) {
            const availableChars = storyState?.characters?.map((c: any) => c.name).join(", ") ||
                productionStore.get(sessionId)?.contentPlan?.characters?.map(c => c.name).join(", ") || "None";
            return JSON.stringify({
                success: false,
                error: `Character "${characterName}" not found in session ${sessionId}. Available: ${availableChars}`
            });
        }

        if (imageUrls.length === 0) {
            return JSON.stringify({ success: false, error: "No generated images found for verification. Generate visuals first." });
        }

        // Map internal structure to CharacterProfile expected by service
        const characterToVerify: CharacterProfile = {
            id: profileFound.id || "unknown",
            name: profileFound.name,
            role: profileFound.role || "Character",
            visualDescription: profileFound.visualDescription ||
                `${profileFound.appearance || ""} ${profileFound.clothing || ""}`
        };

        // Detect language for report
        const isArabic = /[\u0600-\u06FF]/.test(characterToVerify.visualDescription + characterToVerify.name);
        const language = isArabic ? 'ar' : 'en';

        const report = await verifyCharacterConsistency(imageUrls, characterToVerify, language);

        return JSON.stringify({
            success: true,
            report
        });
    },
    {
        name: "verify_character_consistency",
        description: "Verifies visual consistency of a character across all generated shots. Returns a report with a score and suggestions.",
        schema: VerifyCharacterConsistencySchema,
    }
);

export const productionTools = [
    // Import tools (IMPORT group)
    ...importTools,
    // Content tools (CONTENT group)
    planVideoTool,
    narrateScenesTool,
    validatePlanTool,
    adjustTimingTool,
    // Media tools (MEDIA group)
    generateMusicTool,
    generateVisualsTool,
    generateVideoTool, // Veo 3.1 text-to-video generation
    animateImageTool, // DeAPI image-to-video animation
    planSFXTool,
    // Enhancement tools (ENHANCEMENT group)
    verifyCharacterConsistencyTool,
    ...enhancementTools,
    ...audioMixingTools,
    // Export tools (EXPORT group)
    ...subtitleTools,
    ...exportTools,
    ...cloudStorageTools,
    // Utility tools
    getProductionStatusTool,
    markCompleteTool,
    // Story Mode tools
    generateBreakdownTool,
    createScreenplayTool,
    generateCharactersTool,
    generateShotlistTool,
];

// --- Tool Registry Registration ---

/**
 * Register all production tools with the tool registry.
 * This enables tool group management and dependency validation.
 * 
 * Requirements: 12.1, 12.3
 */
export function registerProductionTools(): void {
    // Clear any existing registrations
    toolRegistry.clear();

    // Register IMPORT group tools
    for (const tool of importTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.IMPORT,
            tool
        ));
    }

    // Register CONTENT group tools
    toolRegistry.register(createToolDefinition(
        planVideoTool.name,
        ToolGroup.CONTENT,
        planVideoTool
    ));
    toolRegistry.register(createToolDefinition(
        narrateScenesTool.name,
        ToolGroup.CONTENT,
        narrateScenesTool,
        ["plan_video"] // Depends on plan_video
    ));
    toolRegistry.register(createToolDefinition(
        validatePlanTool.name,
        ToolGroup.CONTENT,
        validatePlanTool,
        ["plan_video"] // Depends on plan_video
    ));
    toolRegistry.register(createToolDefinition(
        adjustTimingTool.name,
        ToolGroup.CONTENT,
        adjustTimingTool,
        ["narrate_scenes"] // Depends on narration for timing sync
    ));

    // Register MEDIA group tools
    toolRegistry.register(createToolDefinition(
        generateVisualsTool.name,
        ToolGroup.MEDIA,
        generateVisualsTool,
        ["plan_video"] // Depends on content plan
    ));
    toolRegistry.register(createToolDefinition(
        generateVideoTool.name,
        ToolGroup.MEDIA,
        generateVideoTool,
        ["plan_video"] // Depends on content plan for scene descriptions
    ));
    toolRegistry.register(createToolDefinition(
        animateImageTool.name,
        ToolGroup.MEDIA,
        animateImageTool,
        ["generate_visuals"] // Depends on visuals
    ));
    // NOTE: generateMusicTool is not registered - music generation is only
    // available in the dedicated "Generate Music" mode, not in video production
    toolRegistry.register(createToolDefinition(
        planSFXTool.name,
        ToolGroup.MEDIA,
        planSFXTool,
        ["plan_video"] // Depends on content plan
    ));

    // Register ENHANCEMENT group tools
    toolRegistry.register(createToolDefinition(
        verifyCharacterConsistencyTool.name,
        ToolGroup.ENHANCEMENT,
        verifyCharacterConsistencyTool
    ));
    for (const tool of enhancementTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.ENHANCEMENT,
            tool,
            ["generate_visuals"] // Enhancement tools depend on visuals
        ));
    }
    for (const tool of audioMixingTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.ENHANCEMENT,
            tool,
            ["narrate_scenes"] // Audio mixing depends on narration
        ));
    }

    // Register EXPORT group tools
    for (const tool of subtitleTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.EXPORT,
            tool,
            ["narrate_scenes"] // Subtitles depend on narration
        ));
    }
    for (const tool of exportTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.EXPORT,
            tool,
            ["generate_visuals", "narrate_scenes"] // Export depends on visuals and narration
        ));
    }

    // Register CLOUD tools
    for (const tool of cloudStorageTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.EXPORT,
            tool,
            ["export_final_video"] // Cloud storage usually after export
        ));
    }

    // Register STORY group tools (mapping to CONTENT for dependency flow)
    toolRegistry.register(createToolDefinition(
        generateBreakdownTool.name,
        ToolGroup.CONTENT,
        generateBreakdownTool
    ));
    toolRegistry.register(createToolDefinition(
        createScreenplayTool.name,
        ToolGroup.CONTENT,
        createScreenplayTool,
        ["generate_breakdown"]
    ));
    toolRegistry.register(createToolDefinition(
        generateCharactersTool.name,
        ToolGroup.CONTENT,
        generateCharactersTool,
        ["create_screenplay"]
    ));
    toolRegistry.register(createToolDefinition(
        generateShotlistTool.name,
        ToolGroup.CONTENT,
        generateShotlistTool,
        ["create_screenplay", "generate_characters"]
    ));

    // Note: Utility tools (get_production_status, mark_complete) are not registered
    // as they don't belong to a specific group and can be called at any time

    console.log("[ProductionAgent] Registered tools with registry:", toolRegistry.getSummary());
}

// Initialize tool registry on module load
registerProductionTools();

// --- Agent System Prompt ---

const PRODUCTION_AGENT_PROMPT = `You are an advanced Video Production Agent for LyricLens. Your job is to autonomously create complete video productions from 30 seconds to 15 minutes based on user requests.

## CRITICAL: SESSION ID USAGE
When you call plan_video, it returns a sessionId. You MUST use this EXACT sessionId as the contentPlanId parameter for ALL subsequent tool calls:
- narrate_scenes: contentPlanId = sessionId from plan_video
- generate_visuals: contentPlanId = sessionId from plan_video
- validate_plan: contentPlanId = sessionId from plan_video
- plan_sfx: contentPlanId = sessionId from plan_video
- ALL other tools that require contentPlanId

NEVER use placeholder values like "plan_123", "cp_01", or "session_12345". ALWAYS use the ACTUAL sessionId returned by plan_video.

## TOOL GROUPS AND DEPENDENCIES

Tools are organized into groups that must be executed in order. Each group depends on the previous group completing first.

### IMPORT (Run First if Applicable)
**Dependencies: None - this is the starting point for import workflows**
- import_youtube_content: Extract audio and transcribe from YouTube/X videos. Returns sessionId for use with other tools.
- transcribe_audio_file: Transcribe audio with word-level timing. Use after importing content.

### CONTENT (Core Planning)
**Dependencies: IMPORT (if importing) or None (if topic-based)**
- plan_video: Create a content plan with scenes (YOU decide scene count based on topic and duration)
- narrate_scenes: Generate voice narration for all scenes. Requires plan_video first.
- validate_plan: Check content quality (score 0-100). Requires plan_video first. Returns needsImprovement and canRetry flags.
- adjust_timing: Fix timing mismatches between scenes and narration. Use when validate_plan returns score < 80. Limited to 2 iterations.

### MEDIA (Asset Generation)
**Dependencies: CONTENT group must complete first**
- generate_visuals: Create images for each scene. Requires plan_video first.
- generate_video: Generate video directly from text using Veo 3.1 (Google's latest model). Creates 4-8 second videos with native audio. Use for direct text-to-video generation. Requires plan_video first.
- animate_image: Convert still images to video loops (optional, uses DeAPI). Requires generate_visuals first. Use for image-to-video animation.
- plan_sfx: Add ambient sound effects (optional). Requires plan_video first.
NOTE: Music generation is NOT available in video production mode. Use the "Generate Music" mode for Suno music generation.

### ENHANCEMENT (Post-Processing)
**Dependencies: MEDIA group must complete first**
- verify_character_consistency: Verifies visual consistency of a character across all generated shots. Returns a report with a score and suggestions. Use this for story-driven content or when consistency is critical. Requires generated visuals first.
- remove_background: Remove background from images for compositing. Requires generate_visuals first.
- restyle_image: Apply style transfer to images (Anime, Watercolor, Oil Painting, etc.). Requires generate_visuals first.
- mix_audio_tracks: Combine narration, music, SFX, and Veo video native audio. **IMPORTANT: Only provide contentPlanId - all audio assets are auto-fetched.** Veo video audio is automatically extracted and mixed when includeVideoAudio=true (default).

### STORY (Creative Workflow)
**Dependencies: None - this is an alternative starting point for complex stories**
- generate_breakdown: Step 1: Create a narrative breakdown (3-5 acts) from a topic. Returns sessionId.
- create_screenplay: Step 2: Create a detailed screenplay from the breakdown. Includes dialogue and actions.
- generate_characters: Step 3: Extract characters from the screenplay and create visual profiles for consistency.
- generate_shotlist: Step 4: Create a detailed shotlist/storyboard from the screenplay and characters.

### EXPORT (Final Output)
**Dependencies: ENHANCEMENT group must complete first (or MEDIA if no enhancements)**
- list_export_presets: Query available platform presets (youtube-shorts, tiktok, instagram-reels, etc.). Use when user asks about export options or to recommend appropriate settings.
- validate_export: Check export readiness before rendering. Returns detailed validation with asset counts, warnings, errors. Use before export_final_video to catch issues early.
- generate_subtitles: Create SRT/VTT subtitles from narration transcripts (supports RTL languages). Requires narrate_scenes first.
- export_final_video: Render final video. **IMPORTANT: Only provide contentPlanId - all assets (visuals, narration, SFX) are auto-fetched.** Use 'preset' param for platform-optimized settings (e.g., preset='tiktok'). Supports mixed image/video assets (Veo videos handled automatically).
- upload_production_to_cloud: Upload all production outputs to Google Cloud Storage. **IMPORTANT: Only provide contentPlanId - all assets are auto-fetched.** Creates organized folder with date/time naming.

### UTILITY (Can be called anytime)
- get_production_status: Check what's done
- list_export_presets: Query export presets anytime (can help user choose format early)
- validate_export: Validate export readiness (can call before EXPORT stage)
- mark_complete: Finalize the production

## DECISION TREE

### Step 1: Detect Input Type
- Does user provide a YouTube/X URL (youtube.com, youtu.be, twitter.com, x.com)?
  → YES: Start with import_youtube_content
  → NO: Continue to Step 2

- Does user provide an audio file path (.mp3, .wav, .m4a, .ogg)?
  → YES: Start with transcribe_audio_file
  → NO: Continue to Step 2

### Step 2: Content Planning
- Start with plan_video using topic/transcript
- YOU decide the optimal scene count based on duration and complexity

### Step 3: Detect Video Generation Method
- Does user want high-quality video with native audio?
  → YES: Use generate_video (Veo 3.1) for direct text-to-video generation
  → NO: Continue to next check

- Does user mention "animated", "motion", "moving", or "dynamic" with existing images?
  → YES: Use generate_visuals first, then animate_image (DeAPI) for image-to-video
  → NO: Use static images only

**Recommendation**: Use generate_video (Veo 3.1) for best quality and native audio. Use animate_image (DeAPI) only when you need to animate existing images.

### Step 4: Detect Style Request
- Does user mention a specific style (cinematic, anime, watercolor, documentary, realistic)?
  → YES: Use that style for generate_visuals and optionally restyle_image
  → NO: Use default "Cinematic" style

### Step 5: Detect Enhancement Requests
- Does user want background removal?
  → YES: Call remove_background after generate_visuals
- Does user want style transfer?
  → YES: Call restyle_image with the specified style

### Step 7: Quality Control (Always Execute - Requirement 7)
- Call validate_plan to check content quality
- If score < 80 AND iterations < 2:
  - Call adjust_timing to fix timing mismatches
  - Call validate_plan again
  - Repeat until score >= 80 OR iterations >= 2
- Report final score and best score achieved

### Step 8: Final Steps (Always Execute)
- If multiple audio sources exist: Call mix_audio_tracks
- If subtitles requested or accessibility needed: Call generate_subtitles
- Call export_final_video to render the final output
- Call mark_complete when satisfied

## SCENE COUNT GUIDELINES (based on ~10-12 seconds per scene)
YOU must decide scene count based on duration and content complexity:
- Ultra-short (30s): 3-4 scenes
- Short (60s): 5-6 scenes  
- Standard (90-120s): 8-12 scenes
- Medium (2-3 min): 12-18 scenes
- Long (3-5 min): 18-30 scenes
- Extended (5-10 min): 30-60 scenes
- Feature (10-15 min): 60-90 scenes

For complex topics (history, science, tutorials), use MORE scenes.
For simple topics (quotes, moods, abstract), use FEWER scenes.

## WORKFLOW

### Standard Topic-Based Workflow
1. **PLAN**: Call plan_video with topic and duration. Decide optimal scene count.
2. **NARRATE**: Call narrate_scenes to generate voice audio for all scenes.
3. **VISUALIZE**: Choose ONE of these methods:
   - **Option A (Recommended)**: Call generate_video for each scene to create videos directly with Veo 3.1 (best quality, native audio)
   - **Option B**: Call generate_visuals to create images, then optionally animate_image for each scene (image-to-video with DeAPI)
4. **SFX** (optional): Call plan_sfx for ambient sounds.
5. **QUALITY CONTROL** (required):
   - Call validate_plan
   - If score < 80 AND iterations < 2: call adjust_timing, then validate_plan again
   - Repeat until score >= 80 OR max iterations reached
6. **MIX** (optional): Call mix_audio_tracks({ contentPlanId }) - DO NOT provide narrationUrl, it's auto-fetched. Veo video audio is automatically extracted and included.
7. **SUBTITLES** (optional): Call generate_subtitles for accessibility.
8. **VALIDATE** (recommended): Call validate_export({ contentPlanId }) to check all assets are ready before rendering.
9. **EXPORT**: Call export_final_video({ contentPlanId }) - DO NOT provide visuals/narrationUrl/totalDuration, they're auto-fetched.
10. **UPLOAD** (recommended): Call upload_production_to_cloud({ contentPlanId }) to save all outputs to Google Cloud Storage.
11. **COMPLETE**: Call mark_complete when satisfied.

### YouTube Import Workflow
1. **IMPORT**: Call import_youtube_content with the URL. This extracts audio and transcribes it.
2. **PLAN**: Call plan_video using the transcript content as the topic.
3. Continue with steps 2-11 from standard workflow.

## ERROR RECOVERY AND RESILIENCE

### Retry Logic
- Transient failures (network, API rate limits): Retry up to 3 times with exponential backoff
- Track retry count for each tool call
- After 3 retries, record as permanent failure and continue

### Fallback Behaviors by Tool
| Tool | Fallback Action |
|------|-----------------|
| generate_visuals | Use placeholder image, continue with other scenes |
| generate_video | Fall back to generate_visuals + animate_image, or use static images |
| animate_image | Keep static image for that scene |
| plan_sfx | Continue without sound effects |
| remove_background | Keep original image |
| restyle_image | Keep original image |
| export_final_video | Provide asset bundle for manual assembly |

### Partial Success Handling
- If a tool fails for specific scenes, log the error and continue with remaining scenes
- Track all errors in session state
- Report partial success with details of what succeeded and what failed
- Always try to deliver a working production, even if incomplete

### Error Reporting
When errors occur:
1. Log the error with tool name and scene index (if applicable)
2. Apply the appropriate fallback behavior
3. Continue with the next step in the workflow
4. Include error summary in final response

## QUALITY CONTROL LOOP (Requirements 7.1-7.5)

### Validation Process - MANDATORY WORKFLOW
After generating narration and visuals, you MUST follow this quality control workflow:

1. **Initial Validation**: Call validate_plan to check content quality
   - Returns score (0-100), needsImprovement flag, and canRetry flag

2. **Quality Improvement** (if score < 80 AND iterations < 2):
   - Call adjust_timing to fix timing mismatches between scenes and narration
   - This increments the iteration counter automatically
   - After adjust_timing completes, ALWAYS call validate_plan again

3. **Re-validation Loop**:
   - If score still < 80 AND iterations < 2: repeat step 2
   - If score >= 80 OR iterations >= 2: proceed to mark_complete

4. **Final Reporting**:
   - Report the final score and best score achieved
   - If max iterations reached without approval, report best score
   - Proceed to export/complete

### Quality Standards
- Target score: 80/100 or higher for approval
- Maximum improvement iterations: 2 (initial validation + up to 2 adjustments = 3 total validation calls)
- Each adjust_timing call syncs scene durations to actual narration lengths
- Track best score achieved across all iterations
- Ensure scene transitions are logical and visual descriptions are specific

### Example Quality Workflow
\`\`\`
1. narrate_scenes → generates audio
2. validate_plan → returns score: 65, needsImprovement: true, canRetry: true
3. adjust_timing → iteration 1/2, syncs timing
4. validate_plan → returns score: 78, needsImprovement: true, canRetry: true
5. adjust_timing → iteration 2/2, syncs timing
6. validate_plan → returns score: 85, needsImprovement: false
7. mark_complete → finalize production
\`\`\`

## IMPORTANT RULES

### Asset Auto-Fetching (CRITICAL)
**NEVER provide these parameters - they are automatically fetched from session state:**
- mix_audio_tracks: DO NOT provide narrationUrl (auto-fetched from narration segments)
- export_final_video: DO NOT provide visuals, narrationUrl, or totalDuration (all auto-fetched)
- generate_subtitles: DO NOT provide narration data (auto-fetched from narration segments)

**Correct usage examples:**
\`\`\`
mix_audio_tracks({ contentPlanId: "prod_xxx" })
export_final_video({ contentPlanId: "prod_xxx", format: "mp4" })
generate_subtitles({ contentPlanId: "prod_xxx" })
\`\`\`

### Efficiency
- DO NOT call the same tool multiple times for the same step (e.g., do NOT call 'generate_visuals' twice)
- One call to generate_visuals handles ALL scenes
- Process scenes in batches for long videos (10-15 at a time for visuals/animation)
- Track progress and report percentage complete
- Be efficient - don't call unnecessary tools

### Tool Group Order
- Always respect tool group dependencies
- IMPORT → CONTENT → MEDIA → ENHANCEMENT → EXPORT
- Don't skip ahead to later groups before completing earlier ones

### Animation
- For animation, animate each scene individually using its sceneIndex (0-based)
- Call animate_image once per scene that needs animation

### Import Workflows
- When importing from YouTube, use the transcript to inform the content plan
- The sessionId from import_youtube_content should be used for subsequent tools`;


// --- Tool Map for Execution ---

const toolMap: Record<string, StructuredTool> = {};
productionTools.forEach(t => {
    toolMap[t.name] = t;
});

// --- Invoke Agent with Streaming Progress ---

/**
 * Progress reporting interface for production agent.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.5
 */
export interface ProductionProgress {
    /** Current stage of production (starting, tool_call, tool_result, complete, etc.) */
    stage: string;
    /** Name of the tool being executed (Requirement 8.1) */
    tool?: string;
    /** Human-readable progress message */
    message: string;
    /** Whether production is complete */
    isComplete: boolean;
    /** Current scene being processed (for multi-scene operations) (Requirement 8.2) */
    currentScene?: number;
    /** Total number of scenes (for percentage calculation) (Requirement 8.2) */
    totalScenes?: number;
    /** Percentage completion (0-100) (Requirement 8.2) */
    percentage?: number;
    /** Success status for tool_result events (Requirement 8.3) */
    success?: boolean;
    /** Summary of generated assets (for completion event) (Requirement 8.5) */
    assetSummary?: {
        scenes: number;
        narrations: number;
        visuals: number;
        music: number;
        sfx: number;
        subtitles: number;
    };
}

/**
 * Check if results are already cached for a tool to avoid re-execution.
 * 
 * Requirements: 10.2, 10.5 - Use cached results without re-execution
 */
function checkResultCache(toolName: string, toolArgs: any, state: ProductionState | null): { cached: boolean; result?: any } {
    if (!state) {
        return { cached: false };
    }

    switch (toolName) {
        case 'generate_visuals':
            // Check if visuals already exist for all scenes (Requirement 10.2)
            if (state.visuals &&
                state.contentPlan &&
                state.visuals.length >= state.contentPlan.scenes.length &&
                state.visuals.every(v => v.imageUrl)) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        visualCount: state.visuals.length,
                        message: `Visuals already exist (${state.visuals.length}) - using cached results`,
                    }
                };
            }
            break;

        case 'narrate_scenes':
            // Check if narration already exists for all scenes
            if (state.narrationSegments &&
                state.contentPlan &&
                state.narrationSegments.length >= state.contentPlan.scenes.length &&
                state.narrationSegments.every(s => s.audioBlob)) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        segmentCount: state.narrationSegments.length,
                        totalDuration: state.contentPlan.totalDuration,
                        message: `Narration already exists (${state.narrationSegments.length} segments) - using cached results`,
                    }
                };
            }
            break;

        // NOTE: generate_music case removed - music generation is only available
        // in the dedicated "Generate Music" mode, not in video production

        case 'plan_sfx':
            // Check if SFX plan already exists
            if (state.sfxPlan && state.sfxPlan.scenes.length > 0) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        sceneCount: state.sfxPlan.scenes.length,
                        message: `SFX plan already exists (${state.sfxPlan.scenes.length} scenes) - using cached results`,
                    }
                };
            }
            break;

        case 'mix_audio_tracks':
            // Check if audio mixing already completed
            if (state.mixedAudio && state.mixedAudio.audioBlob) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        duration: state.mixedAudio.duration,
                        message: `Audio already mixed - using cached results`,
                    }
                };
            }
            break;

        case 'generate_subtitles':
            // Check if subtitles already generated
            if (state.subtitles && state.subtitles.content) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        format: state.subtitles.format,
                        segmentCount: state.subtitles.segmentCount,
                        message: `Subtitles already generated (${state.subtitles.format}) - using cached results`,
                    }
                };
            }
            break;

        case 'export_final_video':
            // Check if video already exported
            if (state.exportResult && state.exportResult.videoBlob) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        format: state.exportResult.format,
                        duration: state.exportResult.duration,
                        downloadUrl: state.exportResult.downloadUrl,
                        message: `Video already exported (${state.exportResult.format}) - using cached results`,
                    }
                };
            }
            break;

        case 'animate_image':
            // Check if specific scene is already animated
            const sceneIndex = toolArgs.sceneIndex;
            if (sceneIndex !== undefined &&
                state.visuals &&
                state.visuals[sceneIndex] &&
                (state.visuals[sceneIndex] as any).videoUrl) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        sceneIndex,
                        message: `Scene ${sceneIndex} already animated - using cached results`,
                    }
                };
            }
            break;
    }

    return { cached: false };
}

/**
 * Create a step identifier for duplicate tool call prevention.
 * This combines tool name with key arguments to identify unique execution steps.
 * 
 * Requirement 10.1 - Track executed tools per step
 */
function createStepIdentifier(toolName: string, toolArgs: any): string {
    // For scene-specific tools, include scene index first (before contentPlanId check)
    if (toolArgs.sceneIndex !== undefined) {
        return `${toolName}_${toolArgs.contentPlanId || 'default'}_scene_${toolArgs.sceneIndex}`;
    }

    // For most tools, the contentPlanId is the key identifier
    if (toolArgs.contentPlanId) {
        return `${toolName}_${toolArgs.contentPlanId}`;
    }

    // For import tools, use URL or path as identifier
    if (toolArgs.url) {
        return `${toolName}_${toolArgs.url}`;
    }
    if (toolArgs.audioPath) {
        return `${toolName}_${toolArgs.audioPath}`;
    }

    // For tools without specific identifiers, use tool name only
    return toolName;
}

/**
 * Run the production agent with intent-based tool selection.
 * 
 * The agent analyzes user input to detect:
 * - YouTube URLs → routes to import_youtube_content first (Requirement 5.4)
 * - Audio file paths → routes to transcribe_audio_file first
 * - Animation keywords → includes animate_image (Requirement 5.2)
 * - Music keywords → includes generate_music (Requirement 5.3)
 * - Style keywords → uses detected style (Requirement 5.5)
 * 
 * @param userRequest User's natural language request
 * @param onProgress Optional callback for progress updates
 * @returns Production state or null if failed
 */
export async function runProductionAgent(
    userRequest: string,
    onProgress?: (progress: ProductionProgress) => void
): Promise<ProductionState | null> {
    // Use centralized API key from apiClient
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    // Analyze user intent for tool selection (Requirements 5.1-5.5)
    const intentResult = analyzeIntent(userRequest);
    const intentHint = generateIntentHint(intentResult);

    console.log('[ProductionAgent] Intent analysis:', {
        firstTool: intentResult.firstTool,
        hasYouTubeUrl: intentResult.hasYouTubeUrl,
        wantsAnimation: intentResult.wantsAnimation,
        wantsMusic: intentResult.wantsMusic,
        detectedStyle: intentResult.detectedStyle,
        optionalTools: intentResult.optionalTools,
    });

    const model = new ChatGoogleGenerativeAI({
        model: "gemini-3-flash-preview",
        apiKey: GEMINI_API_KEY,
        temperature: 0.3,
    });

    // Bind tools to model
    const modelWithTools = model.bindTools(productionTools);

    // Build the user message with intent hints prepended
    const enhancedUserMessage = intentHint
        ? `${intentHint}\n\nUser Request: ${userRequest}`
        : userRequest;

    // Initialize messages
    const messages: Array<SystemMessage | HumanMessage | AIMessage | ToolMessage> = [
        new SystemMessage(PRODUCTION_AGENT_PROMPT),
        new HumanMessage(enhancedUserMessage),
    ];

    // Set global progress callback for tools to use (Requirement 8.2)
    setGlobalProgressCallback(onProgress || null);

    onProgress?.({
        stage: "starting",
        message: "Starting video production agent...",
        isComplete: false
    });

    // Log detected intent for debugging
    if (intentResult.hasYouTubeUrl) {
        onProgress?.({
            stage: "intent_detected",
            message: `Detected YouTube URL: ${intentResult.youtubeUrl}`,
            isComplete: false
        });
    } else if (intentResult.hasAudioFile) {
        onProgress?.({
            stage: "intent_detected",
            message: `Detected audio file: ${intentResult.audioFilePath}`,
            isComplete: false
        });
    }

    let sessionId: string | null = null;
    const MAX_ITERATIONS = 20; // Safety limit (Requirement 10.4)
    let iteration = 0;

    // Initialize error tracker for partial success reporting (Requirement 6.4)
    const errorTracker = new ErrorTracker();

    // Track executed tools to prevent redundant calls (Requirement 10.1)
    const executedTools = new Set<string>();
    const executedToolsPerStep = new Map<string, Set<string>>();

    try {
        while (iteration < MAX_ITERATIONS) {
            iteration++;

            // Check if approaching iteration limit (Requirement 10.4)
            if (iteration >= MAX_ITERATIONS - 2) {
                onProgress?.({
                    stage: "warning",
                    message: `Approaching iteration limit (${iteration}/${MAX_ITERATIONS}). Production will stop soon if not completed.`,
                    isComplete: false,
                });
            }

            // Get response from model
            const response = await modelWithTools.invoke(messages as any);
            messages.push(response as unknown as AIMessage);

            // Check if there are tool calls
            const toolCalls = response.tool_calls;
            if (!toolCalls || toolCalls.length === 0) {
                // No more tool calls - agent is done
                // Generate completion summary (Requirement 8.5)
                if (sessionId) {
                    const state = productionStore.get(sessionId);
                    if (state) {
                        const assetSummary = {
                            scenes: state.contentPlan?.scenes.length || 0,
                            narrations: state.narrationSegments.length,
                            visuals: state.visuals.length,
                            music: state.musicTaskId ? 1 : 0,
                            sfx: state.sfxPlan?.scenes.length || 0,
                            subtitles: state.subtitles ? 1 : 0,
                        };

                        onProgress?.({
                            stage: "complete",
                            message: `Production complete! Generated ${assetSummary.scenes} scenes with ${assetSummary.narrations} narrations, ${assetSummary.visuals} visuals${assetSummary.music ? ', music' : ''}${assetSummary.sfx ? `, ${assetSummary.sfx} SFX` : ''}${assetSummary.subtitles ? ', and subtitles' : ''}.`,
                            isComplete: true,
                            assetSummary,
                        });
                    } else {
                        onProgress?.({
                            stage: "complete",
                            message: "Production complete!",
                            isComplete: true,
                        });
                    }
                } else {
                    onProgress?.({
                        stage: "complete",
                        message: "Production complete!",
                        isComplete: true,
                    });
                }
                break;
            }

            // Execute each tool call
            for (const toolCall of toolCalls) {
                const toolName = toolCall.name;
                const toolArgs = toolCall.args;

                // Create a step identifier based on tool name and key arguments
                const stepId = createStepIdentifier(toolName, toolArgs);

                // Check for duplicate tool call prevention (Requirement 10.1)
                if (!executedToolsPerStep.has(stepId)) {
                    executedToolsPerStep.set(stepId, new Set());
                }

                const stepTools = executedToolsPerStep.get(stepId)!;
                if (stepTools.has(toolName)) {
                    console.log(`[ProductionAgent] Skipping duplicate tool call: ${toolName} for step ${stepId}`);

                    // Add a tool message indicating the skip
                    messages.push(new ToolMessage({
                        content: JSON.stringify({
                            success: true,
                            skipped: true,
                            message: `Skipped duplicate ${toolName} call - already executed for this step`,
                        }),
                        tool_call_id: toolCall.id || toolName,
                    }));
                    continue;
                }

                onProgress?.({
                    stage: "tool_call",
                    tool: toolName,
                    message: `Executing ${toolName}...`,
                    isComplete: false,
                });

                // Check for cached results (Requirements 10.2, 10.5)
                const currentState = sessionId ? productionStore.get(sessionId) ?? null : null;
                const cacheCheck = checkResultCache(toolName, toolArgs, currentState);

                if (cacheCheck.cached) {
                    console.log(`[ProductionAgent] Using cached results for ${toolName}`);

                    const result = JSON.stringify(cacheCheck.result);

                    // Emit tool result for cached response
                    onProgress?.({
                        stage: "tool_result",
                        tool: toolName,
                        message: `✓ ${cacheCheck.result.message}`,
                        isComplete: false,
                        success: true,
                    });

                    // Add tool result to messages
                    messages.push(new ToolMessage({
                        content: result,
                        tool_call_id: toolCall.id || toolName,
                    }));

                    continue;
                }

                // Find and execute the tool
                const targetTool = toolMap[toolName];
                if (!targetTool) {
                    console.error(`[ProductionAgent] Tool not found: ${toolName}`);
                    continue;
                }

                // Get recovery strategy for this tool
                const strategy = getRecoveryStrategy(toolName);

                // Get context for potential fallbacks
                const getToolContext = () => {
                    if (sessionId) {
                        const state = productionStore.get(sessionId);
                        return {
                            ...toolArgs,
                            visuals: state?.visuals,
                            narrationSegments: state?.narrationSegments,
                            musicUrl: (state as any)?.musicUrl,
                            sfxPlan: state?.sfxPlan,
                            subtitles: state?.subtitles,
                        };
                    }
                    return toolArgs;
                };

                // Execute with retry logic (Requirement 6.5)
                const executionResult = await executeWithRetry(
                    () => targetTool.invoke(toolArgs),
                    strategy,
                    (attempt, err, delay) => {
                        onProgress?.({
                            stage: "retry",
                            tool: toolName,
                            message: `${toolName} failed (attempt ${attempt}/${strategy.maxRetries}). Retrying in ${Math.round(delay / 1000)}s...`,
                            isComplete: false,
                        });
                    }
                );

                let result: string;
                let fallbackApplied = false;

                if (executionResult.success) {
                    // Tool execution succeeded (no exception thrown)
                    result = executionResult.data as string;

                    // Check for logical success in the JSON response
                    let logicalSuccess = true;
                    try {
                        const parsed = JSON.parse(result);
                        if (parsed.success === false) {
                            logicalSuccess = false;
                        }
                    } catch {
                        // Not JSON or parse error - assume success if execution didn't throw
                    }

                    if (logicalSuccess) {
                        errorTracker.recordSuccess();
                        executedTools.add(toolName);

                        // Mark tool as executed for this step (Requirement 10.1)
                        // ONLY if it was logically successful. If it returned success: false,
                        // we want to allow the agent to retry it in the next iteration.
                        const stepId = createStepIdentifier(toolName, toolArgs);
                        const stepTools = executedToolsPerStep.get(stepId) || new Set();
                        stepTools.add(toolName);
                        executedToolsPerStep.set(stepId, stepTools);
                    } else {
                        // Logically failed (e.g. API error handled by tool)
                        // Don't mark as executed so it can be retried
                        console.warn(`[ProductionAgent] Tool ${toolName} returned logical failure, allowing retry.`);

                        // Record the error in the state so it's reported
                        try {
                            const parsed = JSON.parse(result);
                            if (parsed.error && sessionId) {
                                const toolError: ToolError = {
                                    tool: toolName,
                                    error: parsed.error,
                                    category: 'recoverable', // Assume recoverable since tool handled it
                                    timestamp: Date.now(),
                                    retryCount: 0,
                                    recoverable: true,
                                };

                                const state = productionStore.get(sessionId);
                                if (state) {
                                    state.errors.push(toolError);
                                    productionStore.set(sessionId, state);
                                }
                            }
                        } catch { /* Ignore error storage failures */ }
                    }
                } else {
                    // Tool failed with exception - try fallback (Requirements 6.1, 6.2, 6.3)
                    const toolError = executionResult.error!;
                    console.error(`[ProductionAgent] Tool ${toolName} failed after ${executionResult.retryCount} retries:`, toolError.error);

                    // Try to apply fallback if available
                    if (strategy.fallbackAction && strategy.continueOnFailure) {
                        onProgress?.({
                            stage: "fallback",
                            tool: toolName,
                            message: `${toolName} failed. Applying fallback: ${strategy.fallbackAction}`,
                            isComplete: false,
                        });

                        const fallbackResult = await applyFallback(
                            strategy.fallbackAction,
                            toolError,
                            getToolContext()
                        );

                        if (fallbackResult) {
                            // SPECIAL HANDLING: If fallback provided data that should be in store
                            // This ensures state consistency when tools fail but provide a fallback result
                            if (toolName === 'generate_visuals' && sessionId) {
                                // Populate store with placeholders if generate_visuals failed
                                const state = productionStore.get(sessionId);
                                if (state && state.contentPlan) {
                                    console.log(`[ProductionAgent] Applying fallback visuals to state for ${sessionId}`);

                                    // Create placeholders for all scenes that don't have visuals
                                    const currentVisuals = state.visuals ? [...state.visuals] : [];
                                    const placeholders: GeneratedImage[] = [];

                                    for (let i = 0; i < state.contentPlan.scenes.length; i++) {
                                        const scene = state.contentPlan.scenes[i];
                                        if (!scene) {
                                            console.warn(`[ProductionAgent] Scene at index ${i} not found, skipping placeholder.`);
                                            continue;
                                        }
                                        // Use existing visual if available, otherwise create placeholder
                                        if (currentVisuals[i]?.imageUrl) {
                                            placeholders.push(currentVisuals[i]!);
                                        } else {
                                            placeholders.push({
                                                promptId: scene.id,
                                                imageUrl: "", // Empty string indicates placeholder/missing
                                                isPlaceholder: true
                                            });
                                        }
                                    }

                                    state.visuals = placeholders;
                                    productionStore.set(sessionId, state);
                                }
                            }

                            result = JSON.stringify({
                                success: true,
                                fallback: true,
                                fallbackAction: strategy.fallbackAction,
                                ...fallbackResult,
                            });
                            toolError.fallbackApplied = strategy.fallbackAction;
                            errorTracker.recordError(toolError, true);
                            fallbackApplied = true;
                        } else {
                            // Fallback also failed
                            result = JSON.stringify({
                                success: false,
                                error: toolError.error,
                                retryCount: executionResult.retryCount,
                            });
                            errorTracker.recordError(toolError, false);
                        }
                    } else {
                        // No fallback available
                        result = JSON.stringify({
                            success: false,
                            error: toolError.error,
                            retryCount: executionResult.retryCount,
                            continueOnFailure: strategy.continueOnFailure,
                        });
                        errorTracker.recordError(toolError, false);
                    }

                    // Store error in session state (Requirement 6.4)
                    if (sessionId) {
                        const state = productionStore.get(sessionId);
                        if (state) {
                            state.errors.push(toolError);
                            productionStore.set(sessionId, state);
                        }
                    }
                }

                // Parse result for session ID and message
                try {
                    const parsed = JSON.parse(result);
                    if (!sessionId && (toolName === 'plan_video' || toolName === 'create_storyboard')) {
                        if (parsed.sessionId) {
                            sessionId = parsed.sessionId;
                        }
                    }
                    if (parsed.message) {
                        const statusPrefix = fallbackApplied ? '⚠️ ' : '';
                        // Emit tool result with success status (Requirement 8.3)
                        onProgress?.({
                            stage: "tool_result",
                            tool: toolName,
                            message: statusPrefix + parsed.message,
                            isComplete: false,
                            success: parsed.success !== false, // Default to true if not specified
                        });
                    }
                } catch {
                    // Not JSON, that's fine
                }

                // Add tool result to messages
                messages.push(new ToolMessage({
                    content: result,
                    tool_call_id: toolCall.id || toolName,
                }));
            }
        }

        // Check if iteration limit was reached (Requirement 10.4)
        if (iteration >= MAX_ITERATIONS) {
            console.warn(`[ProductionAgent] Iteration limit reached (${MAX_ITERATIONS}). Stopping execution.`);

            onProgress?.({
                stage: "limit_reached",
                message: `Production stopped: iteration limit (${MAX_ITERATIONS}) reached. Partial results may be available.`,
                isComplete: false,
            });

            // Generate partial success report for limit reached case
            const report = errorTracker.generateReport();
            report.summary += ` Production stopped due to iteration limit (${MAX_ITERATIONS}).`;

            if (sessionId) {
                const state = productionStore.get(sessionId);
                if (state) {
                    state.partialSuccessReport = report;
                    productionStore.set(sessionId, state);
                }
            }
        }

        // Generate partial success report (Requirement 6.4)
        const report = errorTracker.generateReport();

        if (sessionId) {
            const state = productionStore.get(sessionId);
            if (state) {
                state.partialSuccessReport = report;
                productionStore.set(sessionId, state);
            }

            // Log summary if there were errors
            if (report.errors.length > 0) {
                console.log(`[ProductionAgent] Partial success report:`, report.summary);
                onProgress?.({
                    stage: "summary",
                    message: report.summary,
                    isComplete: false,
                });
            }

            return productionStore.get(sessionId) || null;
        }

        return null;
    } catch (error) {
        console.error("[ProductionAgent] Error:", error);

        // Record fatal error
        const toolError: ToolError = {
            tool: 'production_agent',
            error: error instanceof Error ? error.message : String(error),
            category: classifyError(error instanceof Error ? error : new Error(String(error))),
            timestamp: Date.now(),
            retryCount: 0,
            recoverable: false,
        };
        errorTracker.recordError(toolError, false);

        // Store error in session if available
        if (sessionId) {
            const state = productionStore.get(sessionId);
            if (state) {
                state.errors.push(toolError);
                state.partialSuccessReport = errorTracker.generateReport();
                productionStore.set(sessionId, state);
            }
        }

        onProgress?.({
            stage: "error",
            message: error instanceof Error ? error.message : String(error),
            isComplete: true,
        });
        throw error;
    } finally {
        // Clear global progress callback to prevent memory leaks
        setGlobalProgressCallback(null);
    }
}

// --- Get Session ---

export function getProductionSession(sessionId: string): ProductionState | null {
    return productionStore.get(sessionId) || null;
}

// --- Clear Session ---

export function clearProductionSession(sessionId: string): void {
    productionStore.delete(sessionId);
}

// --- Re-export Intent Detection for external use ---

export {
    analyzeIntent,
    generateIntentHint,
    detectYouTubeUrl,
    shouldAnimate,
    shouldGenerateMusic,
    extractStyle,
    type IntentDetectionResult,
} from "../agent/intentDetection";

// --- Re-export Error Recovery for external use ---

export {
    type ToolError,
    type PartialSuccessReport,
    type RecoveryStrategy,
    type ErrorCategory,
    ErrorTracker,
    formatErrorsForResponse,
    getRecoveryStrategy,
    classifyError,
} from "../agent/errorRecovery";

// --- Multi-Agent Entry Point ---

import {
    runSupervisorAgent,
    type SupervisorOptions,
    type SupervisorResult,
} from "./subagents/supervisorAgent";

/**
 * Run the production agent with multi-agent architecture (supervisor + subagents).
 *
 * This is the new multi-agent implementation that uses specialized subagents:
 * - IMPORT subagent: YouTube/audio import and transcription
 * - CONTENT subagent: Content planning, narration, quality validation
 * - MEDIA subagent: Visual and audio asset generation
 * - ENHANCEMENT/EXPORT subagent: Post-processing and final export
 *
 * Benefits over monolithic agent:
 * - Smaller context per subagent (2-6 tools vs 20+)
 * - Faster inference (isolated contexts)
 * - Specialized prompts per stage
 * - Better error isolation and recovery
 * - Easier to test and debug
 *
 * @param userRequest User's natural language request
 * @param onProgress Optional callback for progress updates
 * @returns Production state or null if failed
 */
export async function runProductionAgentWithSubagents(
    userRequest: string,
    onProgress?: (progress: ProductionProgress) => void
): Promise<ProductionState | null> {
    // Use centralized API key from apiClient
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    // Set global progress callback for tools to use
    setGlobalProgressCallback(onProgress || null);

    onProgress?.({
        stage: "starting",
        message: "Starting multi-agent video production...",
        isComplete: false
    });

    try {
        // Run supervisor agent with subagents
        const supervisorOptions: SupervisorOptions = {
            apiKey: GEMINI_API_KEY,
            userRequest,
            onProgress: (progress) => {
                // Convert supervisor progress to production progress format
                onProgress?.({
                    stage: progress.stage,
                    tool: progress.tool,
                    message: progress.message,
                    isComplete: progress.isComplete,
                    success: progress.success,
                });
            },
        };

        const result: SupervisorResult = await runSupervisorAgent(supervisorOptions);

        // Get final state from production store
        const finalState = result.sessionId ? productionStore.get(result.sessionId) : null;

        if (finalState) {
            // Generate completion summary
            const assetSummary = {
                scenes: finalState.contentPlan?.scenes.length || 0,
                narrations: finalState.narrationSegments.length,
                visuals: finalState.visuals.length,
                music: finalState.musicTaskId ? 1 : 0,
                sfx: finalState.sfxPlan?.scenes.length || 0,
                subtitles: finalState.subtitles ? 1 : 0,
            };

            onProgress?.({
                stage: "complete",
                message: `Multi-agent production complete! Generated ${assetSummary.scenes} scenes with ${assetSummary.narrations} narrations, ${assetSummary.visuals} visuals${assetSummary.music ? ', music' : ''}${assetSummary.sfx ? `, ${assetSummary.sfx} SFX` : ''}${assetSummary.subtitles ? ', and subtitles' : ''}.`,
                isComplete: true,
                assetSummary,
            });
        } else {
            onProgress?.({
                stage: "complete",
                message: result.message || "Multi-agent production complete!",
                isComplete: true,
            });
        }

        return finalState ?? null;
    } catch (error) {
        console.error("[ProductionAgent] Multi-agent error:", error);

        onProgress?.({
            stage: "error",
            message: error instanceof Error ? error.message : String(error),
            isComplete: true,
        });

        throw error;
    } finally {
        // Clear global progress callback to prevent memory leaks
        setGlobalProgressCallback(null);
    }
}
