/**
 * useVideoSFX Hook
 * 
 * Handles sound effects and audio mixing for video production.
 * Manages SFX browsing, preview, and audio mixing capabilities.
 */

import { useState, useCallback } from "react";
import { ContentPlan, NarrationSegment } from "@/types";
import { VideoSFXPlan } from "@/services/sfxService";
import {
    searchAmbientSound,
    getPreviewUrl,
    isFreesoundConfigured,
    AMBIENT_SEARCH_QUERIES,
    type FreesoundSound
} from "@/services/freesoundService";
import {
    mixAudioWithSFX,
    canMixSFX,
    type MixConfig
} from "@/services/audioMixerService";
import { ProductionProgress } from "@/services/agentOrchestrator";

export interface VideoSFXState {
    sfxPlan: VideoSFXPlan | null;
}

export function useVideoSFX(
    onProgress?: (progress: ProductionProgress) => void,
    onError?: (error: string) => void
) {
    const [sfxPlan, setSfxPlan] = useState<VideoSFXPlan | null>(null);

    /**
     * Browse SFX from Freesound library
     */
    const browseSfx = useCallback(async (category: string): Promise<FreesoundSound | null> => {
        if (!isFreesoundConfigured()) {
            console.warn("[useVideoSFX] Freesound API not configured");
            onError?.("Freesound API key not configured. Add VITE_FREESOUND_API_KEY to .env.local");
            return null;
        }

        try {
            const sound = await searchAmbientSound(category);
            if (sound) {
                console.log(`[useVideoSFX] Found SFX: ${sound.name} (${sound.duration.toFixed(1)}s)`);
            }
            return sound;
        } catch (err) {
            console.error("[useVideoSFX] SFX browse failed:", err);
            onError?.(err instanceof Error ? err.message : String(err));
            return null;
        }
    }, [onError]);

    /**
     * Get available SFX categories
     */
    const getSfxCategories = useCallback(() => {
        return Object.keys(AMBIENT_SEARCH_QUERIES);
    }, []);

    /**
     * Preview an SFX sound
     */
    const previewSfx = useCallback((sound: FreesoundSound) => {
        const url = getPreviewUrl(sound);
        const audio = new Audio(url);
        audio.volume = 0.5;
        audio.play();
        return () => audio.pause();
    }, []);

    /**
     * Mix audio with SFX and background music
     */
    const mixAudio = useCallback(async (
        contentPlan: ContentPlan,
        narrationSegments: NarrationSegment[],
        options: {
            includeSfx?: boolean;
            includeMusic?: boolean;
        } = {}
    ): Promise<Blob | null> => {
        const { includeSfx = true, includeMusic = true } = options;

        if (!contentPlan || narrationSegments.length === 0) {
            onError?.("No content to mix - generate narration first");
            return null;
        }

        // Build merged narration URL first
        const orderedBlobs: Blob[] = [];
        for (const scene of contentPlan.scenes) {
            const narration = narrationSegments.find(n => n.sceneId === scene.id);
            if (narration?.audioBlob) orderedBlobs.push(narration.audioBlob);
        }

        if (orderedBlobs.length === 0) {
            onError?.("No narration audio available");
            return null;
        }

        try {
            // Merge narration blobs first
            const { mergeConsecutiveAudioBlobs } = await import("@/services/audioMixerService");
            const mergedNarration = await mergeConsecutiveAudioBlobs(orderedBlobs);
            const narrationUrl = URL.createObjectURL(mergedNarration);

            // Build scene timing info
            let currentTime = 0;
            const scenes = contentPlan.scenes.map(scene => {
                const narration = narrationSegments.find(n => n.sceneId === scene.id);
                const duration = narration?.audioDuration || scene.duration;
                const info = {
                    sceneId: scene.id,
                    startTime: currentTime,
                    duration
                };
                currentTime += duration;
                return info;
            });

            // Prepare mix config
            const mixConfig: MixConfig = {
                narrationUrl,
                sfxPlan: includeSfx ? sfxPlan : null,
                scenes,
                sfxMasterVolume: 0.3,
                musicMasterVolume: includeMusic ? 0.5 : 0,
            };

            // Check if we can actually mix SFX
            if (includeSfx && !canMixSFX(sfxPlan)) {
                console.warn("[useVideoSFX] SFX plan has no audio URLs - mixing narration only");
            }

            onProgress?.({
                stage: "validating",
                progress: 50,
                message: "Mixing audio tracks...",
            });

            const mixedBlob = await mixAudioWithSFX(mixConfig);

            // Cleanup temp URL
            URL.revokeObjectURL(narrationUrl);

            onProgress?.({
                stage: "validating",
                progress: 100,
                message: "Audio mix complete!",
            });

            return mixedBlob;
        } catch (err) {
            console.error("[useVideoSFX] Audio mixing failed:", err);
            onError?.(err instanceof Error ? err.message : String(err));
            return null;
        }
    }, [sfxPlan, onProgress, onError]);

    /**
     * Check if Freesound is configured
     */
    const isSfxAvailable = useCallback(() => isFreesoundConfigured(), []);

    /**
     * Reset SFX state
     */
    const resetSFX = useCallback(() => {
        setSfxPlan(null);
    }, []);

    return {
        // State
        sfxPlan,

        // Setters
        setSfxPlan,

        // Actions
        browseSfx,
        getSfxCategories,
        previewSfx,
        mixAudio,
        isSfxAvailable,
        resetSFX,
    };
}