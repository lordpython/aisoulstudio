/**
 * useVideoProductionRefactored Hook
 *
 * Refactored version of useVideoProduction that combines focused hooks.
 * This replaces the massive 987-line hook with a clean composition pattern.
 *
 * Flow: Topic Input → ContentPlanner → Narrator → Visuals → SFX → Editor → Export
 */

import { useState, useCallback } from "react";
import { AppState, ContentPlan, Scene, ValidationResult } from "@/types";
import { ProductionConfig, ProductionProgress } from "@/services/orchestration/agentOrchestrator";
import { generateContentPlan, ContentPlannerConfig } from "@/services/content/contentPlannerService";
import { initializeProductionSession } from "@/services/ai/production/store";
import { VideoPurpose, LanguageCode } from "@/constants";
import {
    getProductionSessionSnapshot,
    hydrateProductionSessionSnapshot,
    startProductionRun,
    subscribeToProductionRun,
    type ProductionEvent,
} from "@/services/orchestration/productionApi";

// Import focused hooks
import { useVideoNarration } from "./useVideoNarration";
import { useVideoVisuals } from "./useVideoVisuals";
import { useVideoQuality } from "./useVideoQuality";
import { useVideoSFX } from "./useVideoSFX";
import { useVideoPromptTools } from "./useVideoPromptTools";
import { useSunoMusic } from "./useSunoMusic";

type CoreStudioProductionConfig = ProductionConfig & {
    sessionId?: string;
    projectId?: string;
};

function mapProductionEventToAppState(event: ProductionEvent): AppState {
    if (event.tool === 'plan_video') {
        return AppState.CONTENT_PLANNING;
    }

    if (event.tool === 'narrate_scenes') {
        return AppState.NARRATING;
    }

    if (event.tool === 'generate_visuals' || event.tool === 'animate_image') {
        return AppState.GENERATING_PROMPTS;
    }

    if (event.tool === 'validate_plan') {
        return AppState.VALIDATING;
    }

    switch (event.stage) {
        case 'content_planning':
        case 'session_created':
            return AppState.CONTENT_PLANNING;
        case 'narrating':
            return AppState.NARRATING;
        case 'generating_visuals':
        case 'animating_visuals':
            return AppState.GENERATING_PROMPTS;
        case 'validating':
        case 'adjusting':
            return AppState.VALIDATING;
        case 'complete':
            return AppState.READY;
        case 'error':
            return AppState.ERROR;
        default:
            return AppState.IDLE;
    }
}

export function useVideoProductionRefactored() {
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
    const [veoVideoCount, setVeoVideoCount] = useState(1);

    const updateScenes = useCallback((scenes: Scene[]) => {
        if (!contentPlan) return;
        const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
        setContentPlan({ ...contentPlan, scenes, totalDuration });
    }, [contentPlan]);

    // Narration management with proper callbacks
    const narrationHook = useVideoNarration(
        contentPlan,
        videoPurpose,
        setProgress,
        setError,
        setContentPlan
    );

    // Visual generation and management
    const visualsHook = useVideoVisuals();

    // Quality monitoring with proper callbacks
    const qualityHook = useVideoQuality(setProgress, setError);

    // SFX and audio mixing with proper callbacks
    const sfxHook = useVideoSFX(setProgress, setError);

    // Prompt quality tools
    const promptToolsHook = useVideoPromptTools(contentPlan, visualStyle, topic);

    // Music generation (Suno API)
    const musicHook = useSunoMusic();

    /**
     * Start the full production pipeline
     */
    const startProduction = useCallback(async (config?: CoreStudioProductionConfig, topicOverride?: string) => {
        const effectiveTopic = topicOverride || topic;

        if (!effectiveTopic.trim()) {
            setError("Please enter a topic");
            return;
        }

        if (topicOverride) {
            setTopic(topicOverride);
        }

        setError(null);
        setProgress(null);

        const effectiveDuration = config?.targetDuration ?? targetDuration;
        const requestSessionId = config?.sessionId;

        try {
            if (requestSessionId) {
                await initializeProductionSession(requestSessionId, {
                    contentPlan,
                    validation,
                    narrationSegments: narrationHook.narrationSegments,
                    visuals: visualsHook.visuals,
                    sfxPlan: sfxHook.sfxPlan,
                    isComplete: false,
                });
            }

            setAppState(AppState.CONTENT_PLANNING);

            const mode = useAgentMode ? 'agent' : 'orchestrator';
            const { runId, sessionId } = await startProductionRun({
                sessionId: requestSessionId,
                projectId: config?.projectId,
                topic: effectiveTopic,
                targetDuration: effectiveDuration,
                targetAudience,
                visualStyle: config?.visualStyle ?? visualStyle,
                videoPurpose,
                language,
                veoVideoCount,
                animateVisuals: config?.animateVisuals,
                mode,
            });

            await new Promise<void>((resolve, reject) => {
                let unsubscribe = () => {};

                unsubscribe = subscribeToProductionRun(
                    runId,
                    (event) => {
                        setProgress({
                            stage: event.stage as any,
                            progress: event.progress ?? (event.isComplete ? 100 : 0),
                            message: event.message,
                            currentScene: event.currentScene,
                            totalScenes: event.totalScenes,
                        });
                        setAppState(mapProductionEventToAppState(event));

                        if (!event.isComplete) {
                            return;
                        }

                        unsubscribe();
                        if (event.success === false) {
                            reject(new Error(event.error || event.message));
                            return;
                        }

                        resolve();
                    },
                    (streamError) => {
                        unsubscribe();
                        reject(streamError);
                    }
                );
            });

            const snapshot = await getProductionSessionSnapshot(sessionId);
            const hydratedState = await hydrateProductionSessionSnapshot(snapshot);

            await initializeProductionSession(sessionId, hydratedState);

            setContentPlan(hydratedState.contentPlan);
            narrationHook.setNarrationSegments(hydratedState.narrationSegments);
            visualsHook.setVisuals(hydratedState.visuals);
            sfxHook.setSfxPlan(hydratedState.sfxPlan);
            setValidation(snapshot.validation);

            if (hydratedState.contentPlan && snapshot.validation) {
                const report = qualityHook.generateAndSaveQualityReport(
                    hydratedState.contentPlan as any,
                    hydratedState.narrationSegments,
                    hydratedState.sfxPlan,
                    snapshot.validation,
                    videoPurpose
                );
                console.log(`[useVideoProduction] Backend Mode Quality Report: ${report.overallScore}/100`);
            }

            if (!snapshot.isComplete || snapshot.errors.length > 0) {
                setError(`Production completed with issues (score: ${snapshot.qualityScore || snapshot.validation?.score || 0})`);
            }

            setProgress({ stage: "complete", progress: 100, message: "Production complete!" });
            setAppState(AppState.READY);
        } catch (err) {
            console.error("[useVideoProduction] Pipeline failed:", err);
            setError(err instanceof Error ? err.message : String(err));
            setAppState(AppState.ERROR);
        }
    }, [topic, contentPlan, validation, targetDuration, targetAudience, visualStyle, videoPurpose, language, veoVideoCount, useAgentMode, narrationHook, visualsHook, sfxHook, qualityHook]);

    /**
     * Generate content plan only (without narration)
     */
    const generatePlan = useCallback(async (config?: Partial<ContentPlannerConfig>) => {
        if (!topic.trim()) {
            setError("Please enter a topic");
            return;
        }

        setError(null);
        setAppState(AppState.CONTENT_PLANNING);
        setProgress({ stage: "content_planning", progress: 0, message: "Generating video plan..." });

        try {
            const effectiveDuration = config?.targetDuration ?? targetDuration;
            const plan = await generateContentPlan(topic, {
                targetDuration: effectiveDuration,
                sceneCount: Math.max(3, Math.floor(effectiveDuration / 12)),
                targetAudience,
                config: { videoPurpose, visualStyle },
            });

            setContentPlan(plan);
            setProgress({ stage: "content_planning", progress: 100, message: `Created ${plan.scenes.length} scenes` });
            setAppState(AppState.READY);
        } catch (err) {
            console.error("[useVideoProduction] Plan generation failed:", err);
            setError(err instanceof Error ? err.message : String(err));
            setAppState(AppState.ERROR);
        }
    }, [topic, targetDuration, targetAudience, videoPurpose, visualStyle]);

    /**
     * Add the selected music track to the timeline
     */
    const addMusicToTimeline = useCallback(() => {
        const selectedTrack = musicHook.getSelectedTrack();

        if (!selectedTrack) {
            console.warn("[useVideoProduction] No track selected to add to timeline");
            return;
        }

        console.log(`[useVideoProduction] Adding track "${selectedTrack.title}" to timeline`);

        sfxHook.setSfxPlan(prev => {
            const basePlan = prev || { scenes: [], backgroundMusic: null, masterVolume: 1.0 };

            return {
                ...basePlan,
                generatedMusic: {
                    trackId: selectedTrack.id,
                    audioUrl: selectedTrack.audio_url,
                    duration: selectedTrack.duration,
                    title: selectedTrack.title,
                },
            };
        });
    }, [musicHook.getSelectedTrack, sfxHook.setSfxPlan]);

    /**
     * Reset all state
     */
    const reset = useCallback(() => {
        setAppState(AppState.IDLE);
        setTopic("");
        setContentPlan(null);
        setValidation(null);
        setProgress(null);
        setError(null);
        narrationHook.resetNarration();
        visualsHook.resetVisuals();
        qualityHook.resetQuality();
        sfxHook.resetSFX();
        musicHook.resetMusicState();
    }, [narrationHook, visualsHook, qualityHook, sfxHook, musicHook]);

    return {
        // Music generation state (Prioritized)
        musicState: musicHook.musicState,
        generateMusic: musicHook.generateMusic,
        generateLyrics: musicHook.generateLyrics,
        selectTrack: musicHook.selectTrack,
        refreshCredits: musicHook.refreshCredits,
        createMusicVideo: musicHook.createMusicVideo,
        generateCover: musicHook.generateCover,
        addVocals: musicHook.addVocals,
        addInstrumental: musicHook.addInstrumental,
        uploadAndCover: musicHook.uploadAndCover,
        uploadAudio: musicHook.uploadAudio,

        // Core State
        appState,
        topic,
        contentPlan,
        narrationSegments: narrationHook.narrationSegments,
        visuals: visualsHook.visuals,
        sfxPlan: sfxHook.sfxPlan,
        validation,
        qualityReport: qualityHook.qualityReport,
        progress,
        error,
        playingSceneId: narrationHook.playingSceneId,

        // Config
        targetDuration,
        targetAudience,
        videoPurpose,
        visualStyle,
        language,
        useAgentMode,
        setTargetDuration,
        setTargetAudience,
        setVideoPurpose,
        setVisualStyle,
        setLanguage,
        setUseAgentMode,
        veoVideoCount,
        setVeoVideoCount,

        // Actions
        setTopic,
        startProduction,
        generatePlan,
        generateNarration: narrationHook.generateNarration,
        regenerateSceneNarration: narrationHook.regenerateSceneNarration,
        runValidation: () => qualityHook.runValidation(
            contentPlan as any,
            narrationHook.narrationSegments,
            visualsHook.visuals
        ),
        addMusicToTimeline,
        updateScenes,
        playNarration: narrationHook.playNarration,
        reset,

        // Utilities
        getAudioUrlMap: narrationHook.getAudioUrlMap,
        getVisualsMap: visualsHook.getVisualsMap,
        visualsMap: visualsHook.visualsMap,

        // Test/Debug setters (for loading saved sessions)
        setVisuals: visualsHook.setVisuals,
        setContentPlan,
        setNarrationSegments: narrationHook.setNarrationSegments,
        setSfxPlan: sfxHook.setSfxPlan,
        setValidation,
        setAppState,

        // SFX & Freesound
        browseSfx: sfxHook.browseSfx,
        getSfxCategories: sfxHook.getSfxCategories,
        previewSfx: sfxHook.previewSfx,
        isSfxAvailable: sfxHook.isSfxAvailable,
        mixAudio: sfxHook.mixAudio,

        // Prompt Quality Tools
        checkPromptQuality: promptToolsHook.checkPromptQuality,
        improvePrompt: promptToolsHook.improvePrompt,
        getCameraAngles: visualsHook.getCameraAngles,
        getLightingMoods: visualsHook.getLightingMoods,
        setPreferredCameraAngle: visualsHook.setPreferredCameraAngle,
        setPreferredLightingMood: visualsHook.setPreferredLightingMood,

        // Quality Functions
        getQualityHistoryData: qualityHook.getQualityHistoryData,
        getQualityTrend: qualityHook.getQualityTrend,
        exportQualityReport: qualityHook.exportQualityReport,
        getQualitySummaryText: qualityHook.getQualitySummaryText,

        // Camera & Lighting Preferences
        preferredCameraAngle: visualsHook.preferredCameraAngle,
        preferredLightingMood: visualsHook.preferredLightingMood,
    };
}

export default useVideoProductionRefactored;
