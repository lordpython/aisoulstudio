/**
 * Media Tools for Production Agent
 *
 * Tools for generating videos, animating images, and creating music.
 */

import { tool } from "@langchain/core/tools";
import { agentLogger } from "../../../logger";
import { GenerateVideoSchema, AnimateImageSchema, GenerateMusicSchema } from "../types";
import { productionStore } from "../store";
import { validateContentPlanId } from "../utils";
import { generateMotionPrompt } from "../../../promptService";
import { animateImageWithDeApi, isDeApiConfigured } from "../../../deapiService";
import {
    generateMusic as sunoGenerateMusic,
    waitForCompletion as sunoWaitForCompletion,
    isSunoConfigured
} from "../../../sunoService";
import { fetchAndCacheAsBlob } from "../../../videoService";
import { getEffectiveLegacyTone } from "../../../tripletUtils";

const log = agentLogger.child('Production');

// --- Generate Video Tool (Veo 3.1) ---

export const generateVideoTool = tool(
    async ({ contentPlanId, sceneIndex, style, aspectRatio, durationSeconds, useFastModel }) => {
        log.info(` Generating video for scene ${sceneIndex} using Veo 3.1`);

        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({ 
                success: false, 
                error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` 
            });
        }

        const scene = state.contentPlan.scenes[sceneIndex];
        if (!scene) {
            return JSON.stringify({
                success: false,
                error: `Scene at index ${sceneIndex} not found in content plan.`
            });
        }

        try {
            const { generateProfessionalVideo } = await import("../../../videoService");

            log.info(` Generating professional Veo 3.1 video for scene ${sceneIndex}: ${scene.name}`);
            const videoUrl = await generateProfessionalVideo(
                scene.visualDescription,
                style || "Cinematic",
                getEffectiveLegacyTone(scene),
                "",
                "documentary",
                (aspectRatio === "9:16" ? "9:16" : "16:9"),
                (durationSeconds as 4 | 6 | 8) || 8,
                useFastModel !== false
            );

            const currentState = productionStore.get(contentPlanId) || state;

            if (!currentState.visuals) {
                currentState.visuals = [];
            }

            if (!currentState.visuals[sceneIndex]) {
                currentState.visuals[sceneIndex] = {
                    promptId: scene.id,
                    imageUrl: videoUrl,
                };
            }

            // Cache video as blob URL immediately to prevent expired URL issues on re-export
            let cachedBlobUrl: string | undefined;
            try {
                cachedBlobUrl = await fetchAndCacheAsBlob(videoUrl);
                log.info(` Cached video as blob URL for scene ${sceneIndex}`);
            } catch (cacheError) {
                log.info(` Warning: Failed to cache video blob (will use URL): ${cacheError}`);
            }

            currentState.visuals[sceneIndex].imageUrl = cachedBlobUrl || videoUrl;
            currentState.visuals[sceneIndex].videoUrl = cachedBlobUrl || videoUrl;
            currentState.visuals[sceneIndex].type = "video";
            currentState.visuals[sceneIndex].isAnimated = true;
            currentState.visuals[sceneIndex].generatedWithVeo = true;
            currentState.visuals[sceneIndex].cachedBlobUrl = cachedBlobUrl;
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

// --- Animate Image Tool (DeAPI) ---

export const animateImageTool = tool(
    async ({ contentPlanId, sceneIndex, aspectRatio }) => {
        log.info(` Animating image for scene ${sceneIndex}`);

        const validationError = validateContentPlanId(contentPlanId);
        if (validationError) return validationError;

        const state = productionStore.get(contentPlanId);
        if (!state?.contentPlan) {
            return JSON.stringify({ 
                success: false, 
                error: `Content plan not found for sessionId: ${contentPlanId}. Make sure you are using the exact sessionId returned by plan_video.` 
            });
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

        const tryVeoFallback = async (): Promise<string> => {
            log.info(` Trying Veo 3.1 with professional prompt for scene ${sceneIndex}`);
            const { generateProfessionalVideo } = await import("../../../videoService");
            return generateProfessionalVideo(
                scene.visualDescription,
                "Cinematic",
                getEffectiveLegacyTone(scene),
                "",
                "documentary",
                (aspectRatio === "9:16" ? "9:16" : "16:9"),
                6,
                true
            );
        };

        if (!isDeApiConfigured()) {
            log.info(` DeAPI not configured, generating professional Veo 3.1 video for scene ${sceneIndex}`);
            try {
                const videoUrl = await tryVeoFallback();

                // Cache video as blob URL immediately
                let cachedBlobUrl: string | undefined;
                try {
                    cachedBlobUrl = await fetchAndCacheAsBlob(videoUrl);
                    log.info(` Cached video as blob URL for scene ${sceneIndex}`);
                } catch (cacheError) {
                    log.info(` Warning: Failed to cache video blob: ${cacheError}`);
                }

                const currentState = productionStore.get(contentPlanId) || state;
                if (currentState.visuals && currentState.visuals[sceneIndex]) {
                    (currentState.visuals[sceneIndex] as any).imageUrl = cachedBlobUrl || videoUrl;
                    (currentState.visuals[sceneIndex] as any).videoUrl = cachedBlobUrl || videoUrl;
                    (currentState.visuals[sceneIndex] as any).isAnimated = true;
                    (currentState.visuals[sceneIndex] as any).generatedWithVeo = true;
                    (currentState.visuals[sceneIndex] as any).cachedBlobUrl = cachedBlobUrl;
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
            log.info(` Generating motion prompt for scene ${sceneIndex}`);
            const motionPrompt = await generateMotionPrompt(
                scene.visualDescription,
                getEffectiveLegacyTone(scene),
                ""
            );
            log.info(` Motion prompt: ${motionPrompt.substring(0, 100)}...`);

            const videoUrl = await animateImageWithDeApi(
                visual.imageUrl,
                motionPrompt,
                (aspectRatio as "16:9" | "9:16" | "1:1") || "16:9",
                contentPlanId,
                sceneIndex
            );

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

            const isCloudflareBlock = errorMessage.includes('Cloudflare') ||
                errorMessage.includes('blocked') ||
                errorMessage.includes('503');

            if (isCloudflareBlock) {
                log.info(` DeAPI blocked by Cloudflare, generating professional Veo 3.1 video for scene ${sceneIndex}`);
                try {
                    const videoUrl = await tryVeoFallback();

                    // Cache video as blob URL immediately
                    let cachedBlobUrl: string | undefined;
                    try {
                        cachedBlobUrl = await fetchAndCacheAsBlob(videoUrl);
                        log.info(` Cached video as blob URL for scene ${sceneIndex}`);
                    } catch (cacheError) {
                        log.info(` Warning: Failed to cache video blob: ${cacheError}`);
                    }

                    const currentState = productionStore.get(contentPlanId) || state;
                    if (currentState.visuals && currentState.visuals[sceneIndex]) {
                        (currentState.visuals[sceneIndex] as any).imageUrl = cachedBlobUrl || videoUrl;
                        (currentState.visuals[sceneIndex] as any).videoUrl = cachedBlobUrl || videoUrl;
                        (currentState.visuals[sceneIndex] as any).isAnimated = true;
                        (currentState.visuals[sceneIndex] as any).generatedWithVeo = true;
                        (currentState.visuals[sceneIndex] as any).cachedBlobUrl = cachedBlobUrl;
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

export const generateMusicTool = tool(
    async ({ contentPlanId, style, mood, duration, instrumental }) => {
        log.info(` Generating music: ${style} - ${mood}`);

        const state = productionStore.get(contentPlanId);

        if (!isSunoConfigured()) {
            return JSON.stringify({
                success: false,
                error: "Suno API not configured. Add VITE_SUNO_API_KEY to .env.local"
            });
        }

        try {
            const finalDuration = duration || state?.contentPlan?.totalDuration || 60;

            const taskId = await sunoGenerateMusic({
                prompt: `Create ${mood} background music in ${style} style for a ${finalDuration} second video.`,
                style: style,
                title: `BGM - ${mood} ${style}`,
                instrumental: instrumental !== false,
                model: "V5",
            });

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
