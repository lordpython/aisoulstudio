/**
 * useVideoNarration Hook
 * 
 * Handles narration generation and audio playback for video production.
 * Manages audio URLs and cleanup to prevent memory leaks.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { ContentPlan, NarrationSegment } from "@/types";
import { narrateScene, createAudioUrl, revokeAudioUrl, NarratorConfig } from "@/services/narratorService";
import { syncDurationsToNarration } from "@/services/editorService";
import { VideoPurpose } from "@/constants";
import { ProductionProgress } from "@/services/agentOrchestrator";

export interface VideoNarrationState {
    narrationSegments: NarrationSegment[];
    playingSceneId: string | null;
}

export function useVideoNarration(
    contentPlan: ContentPlan | null,
    videoPurpose: VideoPurpose,
    onProgress?: (progress: ProductionProgress) => void,
    onError?: (error: string) => void,
    onContentPlanUpdate?: (plan: ContentPlan) => void
) {
    const [narrationSegments, setNarrationSegments] = useState<NarrationSegment[]>([]);
    const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
    
    const audioUrlsRef = useRef<Map<string, string>>(new Map());
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Cleanup effect for audio URLs to prevent memory leaks
    useEffect(() => {
        return () => {
            // Cleanup all blob URLs on unmount
            audioUrlsRef.current.forEach(url => revokeAudioUrl(url));
            audioUrlsRef.current.clear();
            
            // Stop and cleanup audio element
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    /**
     * Generate narration for all scenes
     */
    const generateNarration = useCallback(async () => {
        if (!contentPlan) {
            onError?.("No content plan to narrate");
            return;
        }

        const segments: NarrationSegment[] = [];

        for (let i = 0; i < contentPlan.scenes.length; i++) {
            const scene = contentPlan.scenes[i];
            
            // TypeScript strict mode: ensure scene exists
            if (!scene) {
                console.error(`[useVideoNarration] Scene at index ${i} is undefined`);
                continue;
            }

            onProgress?.({
                stage: "narrating",
                progress: Math.round((i / contentPlan.scenes.length) * 100),
                message: `Narrating: ${scene.name}`,
                currentScene: i + 1,
                totalScenes: contentPlan.scenes.length,
            });

            try {
                const narratorConfig: NarratorConfig = { videoPurpose };
                const segment = await narrateScene(scene, narratorConfig);
                segments.push(segment);

                // Create audio URL for playback
                const url = createAudioUrl(segment);
                audioUrlsRef.current.set(scene.id, url);
            } catch (err) {
                console.error(`[useVideoNarration] Narration failed for scene ${scene.id}:`, err);
                onError?.(`Narration failed for "${scene.name}"`);
                return;
            }
        }

        setNarrationSegments(segments);

        // Sync durations
        if (contentPlan && onContentPlanUpdate) {
            const synced = syncDurationsToNarration(contentPlan, segments);
            onContentPlanUpdate(synced);
        }

        onProgress?.({
            stage: "narrating",
            progress: 100,
            message: `${segments.length} narrations complete`,
        });
    }, [contentPlan, videoPurpose, onProgress, onError, onContentPlanUpdate]);

    /**
     * Regenerate narration for a single scene after script edit
     */
    const regenerateSceneNarration = useCallback(async (sceneId: string) => {
        if (!contentPlan) {
            onError?.("No content plan available");
            return;
        }

        const scene = contentPlan.scenes.find(s => s.id === sceneId);
        if (!scene) {
            onError?.(`Scene ${sceneId} not found`);
            return;
        }

        // TypeScript type narrowing: scene is guaranteed to be defined here
        const currentScene = scene;

        onProgress?.({
            stage: "narrating",
            progress: 0,
            message: `Regenerating narration for: ${currentScene.name}`,
            currentScene: 1,
            totalScenes: 1,
        });

        try {
            // Revoke old audio URL if exists
            const oldUrl = audioUrlsRef.current.get(sceneId);
            if (oldUrl) {
                revokeAudioUrl(oldUrl);
                audioUrlsRef.current.delete(sceneId);
            }

            // Generate new narration
            const narratorConfig: NarratorConfig = { videoPurpose };
            const segment = await narrateScene(currentScene, narratorConfig);

            // Create new audio URL
            const url = createAudioUrl(segment);
            audioUrlsRef.current.set(sceneId, url);

            // Update narration segments
            setNarrationSegments(prev => {
                const existing = prev.findIndex(s => s.sceneId === sceneId);
                if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = segment;
                    return updated;
                }
                return [...prev, segment];
            });

            // Sync duration for this scene
            if (contentPlan && onContentPlanUpdate) {
                const updatedScenes = contentPlan.scenes.map(s =>
                    s.id === sceneId ? { ...s, duration: Math.ceil(segment.audioDuration) } : s
                );
                const totalDuration = updatedScenes.reduce((sum, s) => sum + s.duration, 0);
                onContentPlanUpdate({
                    ...contentPlan,
                    scenes: updatedScenes,
                    totalDuration,
                });
            }

            onProgress?.({
                stage: "narrating",
                progress: 100,
                message: `Narration updated for: ${currentScene.name}`,
            });

            console.log(`[useVideoNarration] Regenerated narration for scene ${sceneId}, duration: ${segment.audioDuration}s`);
        } catch (err) {
            console.error(`[useVideoNarration] Failed to regenerate narration for scene ${sceneId}:`, err);
            onError?.(err instanceof Error ? err.message : String(err));
        }
    }, [contentPlan, videoPurpose, onProgress, onError, onContentPlanUpdate]);

    /**
     * Play narration for a scene
     */
    const playNarration = useCallback((sceneId: string) => {
        // Stop current playback
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        if (playingSceneId === sceneId) {
            setPlayingSceneId(null);
            return;
        }

        const url = audioUrlsRef.current.get(sceneId);
        if (!url) {
            console.warn(`No audio URL for scene ${sceneId}`);
            return;
        }

        const audio = new Audio(url);
        audio.onended = () => setPlayingSceneId(null);
        audio.play();
        audioRef.current = audio;
        setPlayingSceneId(sceneId);
    }, [playingSceneId]);

    /**
     * Get audio URLs map for SceneEditor
     */
    const getAudioUrlMap = useCallback((): Record<string, string> => {
        const map: Record<string, string> = {};
        audioUrlsRef.current.forEach((url, sceneId) => {
            map[sceneId] = url;
        });
        return map;
    }, []);

    /**
     * Reset narration state
     */
    const resetNarration = useCallback(() => {
        // Cleanup audio URLs
        audioUrlsRef.current.forEach((url) => revokeAudioUrl(url));
        audioUrlsRef.current.clear();

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        setNarrationSegments([]);
        setPlayingSceneId(null);
    }, []);

    return {
        // State
        narrationSegments,
        playingSceneId,

        // Actions
        generateNarration,
        regenerateSceneNarration,
        playNarration,
        getAudioUrlMap,
        resetNarration,
        setNarrationSegments,
    };
}