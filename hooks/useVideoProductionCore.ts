/**
 * useVideoProductionCore Hook
 * 
 * Core pipeline state and configuration for video production.
 * Handles the main workflow orchestration and state management.
 */

import { useState, useCallback } from "react";
import { AppState, ContentPlan, Scene, ValidationResult } from "../types";
import { ProductionProgress, ProductionConfig } from "../services/agentOrchestrator";
import { VideoPurpose, LanguageCode } from "../constants";

export interface VideoProductionCoreState {
    // Core state
    appState: AppState;
    topic: string;
    contentPlan: ContentPlan | null;
    validation: ValidationResult | null;
    progress: ProductionProgress | null;
    error: string | null;

    // Config
    targetDuration: number;
    targetAudience: string;
    videoPurpose: VideoPurpose;
    visualStyle: string;
    language: LanguageCode;
    useAgentMode: boolean;
}

export function useVideoProductionCore() {
    // Core state
    const [appState, setAppState] = useState<AppState>(AppState.IDLE);
    const [topic, setTopic] = useState("");
    const [contentPlan, setContentPlan] = useState<ContentPlan | null>(null);
    const [validation, setValidation] = useState<ValidationResult | null>(null);
    const [progress, setProgress] = useState<ProductionProgress | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Config state
    const [targetDuration, setTargetDuration] = useState(60);
    const [targetAudience, setTargetAudience] = useState("General audience");
    const [videoPurpose, setVideoPurpose] = useState<VideoPurpose>("documentary");
    const [visualStyle, setVisualStyle] = useState("Cinematic");
    const [language, setLanguage] = useState<LanguageCode>("auto");
    const [useAgentMode, setUseAgentMode] = useState(true);

    /**
     * Update scenes (from SceneEditor)
     */
    const updateScenes = useCallback((scenes: Scene[]) => {
        if (!contentPlan) return;

        const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
        setContentPlan({
            ...contentPlan,
            scenes,
            totalDuration,
        });
    }, [contentPlan]);

    /**
     * Reset core state
     */
    const resetCore = useCallback(() => {
        setAppState(AppState.IDLE);
        setTopic("");
        setContentPlan(null);
        setValidation(null);
        setProgress(null);
        setError(null);
    }, []);

    return {
        // State
        appState,
        topic,
        contentPlan,
        validation,
        progress,
        error,
        targetDuration,
        targetAudience,
        videoPurpose,
        visualStyle,
        language,
        useAgentMode,

        // Setters
        setAppState,
        setTopic,
        setContentPlan,
        setValidation,
        setProgress,
        setError,
        setTargetDuration,
        setTargetAudience,
        setVideoPurpose,
        setVisualStyle,
        setLanguage,
        setUseAgentMode,

        // Actions
        updateScenes,
        resetCore,
    };
}