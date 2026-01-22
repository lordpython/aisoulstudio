/**
 * useVideoVisuals Hook
 * 
 * Handles visual generation and management for video production.
 * Manages generated images and visual preferences.
 */

import { useState, useCallback, useMemo } from "react";
import { GeneratedImage } from "../types";
import { CAMERA_ANGLES, LIGHTING_MOODS } from "../constants/video";

export interface VideoVisualsState {
    visuals: GeneratedImage[];
    preferredCameraAngle: string | null;
    preferredLightingMood: string | null;
}

export function useVideoVisuals() {
    const [visuals, setVisuals] = useState<GeneratedImage[]>([]);
    const [preferredCameraAngle, setPreferredCameraAngle] = useState<string | null>(null);
    const [preferredLightingMood, setPreferredLightingMood] = useState<string | null>(null);

    /**
     * Get visuals map for SceneEditor (sceneId -> imageUrl)
     * Memoized to prevent unnecessary re-renders in consuming components
     */
    const visualsMap = useMemo((): Record<string, string> => {
        const map: Record<string, string> = {};
        visuals.forEach((visual) => {
            if (visual.imageUrl) {
                map[visual.promptId] = visual.imageUrl;
            }
        });
        return map;
    }, [visuals]);

    /**
     * Legacy getter for backward compatibility
     */
    const getVisualsMap = useCallback(() => visualsMap, [visualsMap]);

    /**
     * Get available camera angles
     */
    const getCameraAngles = useCallback(() => [...CAMERA_ANGLES], []);

    /**
     * Get available lighting moods
     */
    const getLightingMoods = useCallback(() => [...LIGHTING_MOODS], []);

    /**
     * Reset visuals state
     */
    const resetVisuals = useCallback(() => {
        setVisuals([]);
        setPreferredCameraAngle(null);
        setPreferredLightingMood(null);
    }, []);

    return {
        // State
        visuals,
        preferredCameraAngle,
        preferredLightingMood,
        visualsMap,

        // Setters
        setVisuals,
        setPreferredCameraAngle,
        setPreferredLightingMood,

        // Actions
        getVisualsMap,
        getCameraAngles,
        getLightingMoods,
        resetVisuals,
    };
}