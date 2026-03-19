/**
 * useVideoProductionRefactored Hook
 * 
 * Refactored version of useVideoProduction that combines focused hooks.
 * This replaces the massive 987-line hook with a clean composition pattern.
 * 
 * Flow: Topic Input → ContentPlanner → Narrator → Visuals → SFX → Editor → Export
 */

import { useCallback } from "react";
import { AppState } from "@/types";
import { ProductionConfig } from "@/services/agentOrchestrator";
import { generateContentPlan, ContentPlannerConfig } from "@/services/contentPlannerService";
import { initializeProductionSession } from "@/services/ai/production/store";
import {
    getProductionSessionSnapshot,
    hydrateProductionSessionSnapshot,
    startProductionRun,
    subscribeToProductionRun,
    type ProductionEvent,
} from "@/services/productionApi";

// Import focused hooks
import { useVideoProductionCore } from "./useVideoProductionCore";
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
    // Core state and configuration
    const coreHook = useVideoProductionCore();

    // Narration management with proper callbacks
    const narrationHook = useVideoNarration(
        coreHook.contentPlan,
        coreHook.videoPurpose,
        coreHook.setProgress,
        coreHook.setError,
        coreHook.setContentPlan
    );

    // Visual generation and management
    const visualsHook = useVideoVisuals();

    // Quality monitoring with proper callbacks
    const qualityHook = useVideoQuality(
        coreHook.setProgress,
        coreHook.setError
    );

    // SFX and audio mixing with proper callbacks
    const sfxHook = useVideoSFX(
        coreHook.setProgress,
        coreHook.setError
    );

    // Prompt quality tools
    const promptToolsHook = useVideoPromptTools(
        coreHook.contentPlan,
        coreHook.visualStyle,
        coreHook.topic
    );

    // Music generation (Suno API)
    const musicHook = useSunoMusic();

    /**
     * Start the full production pipeline
     */
    const startProduction = useCallback(async (config?: CoreStudioProductionConfig, topicOverride?: string) => {
        const effectiveTopic = topicOverride || coreHook.topic;

        if (!effectiveTopic.trim()) {
            coreHook.setError("Please enter a topic");
            return;
        }

        // Update topic state if override provided
        if (topicOverride) {
            coreHook.setTopic(topicOverride);
        }

        coreHook.setError(null);
        coreHook.setProgress(null);

        // Calculate scene count from duration (1 scene per ~12 seconds, min 3)
        const effectiveDuration = config?.targetDuration ?? coreHook.targetDuration;
        const requestSessionId = config?.sessionId;

        try {
            if (requestSessionId) {
                await initializeProductionSession(requestSessionId, {
                    contentPlan: coreHook.contentPlan,
                    validation: coreHook.validation,
                    narrationSegments: narrationHook.narrationSegments,
                    visuals: visualsHook.visuals,
                    sfxPlan: sfxHook.sfxPlan,
                    isComplete: false,
                });
            }

            coreHook.setAppState(AppState.CONTENT_PLANNING);

            const mode = coreHook.useAgentMode ? 'agent' : 'orchestrator';
            const { runId, sessionId } = await startProductionRun({
                sessionId: requestSessionId,
                projectId: config?.projectId,
                topic: effectiveTopic,
                targetDuration: effectiveDuration,
                targetAudience: coreHook.targetAudience,
                visualStyle: config?.visualStyle ?? coreHook.visualStyle,
                videoPurpose: coreHook.videoPurpose,
                language: coreHook.language,
                veoVideoCount: coreHook.veoVideoCount,
                animateVisuals: config?.animateVisuals,
                mode,
            });

            await new Promise<void>((resolve, reject) => {
                let unsubscribe = () => {};

                unsubscribe = subscribeToProductionRun(
                    runId,
                    (event) => {
                        coreHook.setProgress({
                            stage: event.stage as any,
                            progress: event.progress ?? (event.isComplete ? 100 : 0),
                            message: event.message,
                            currentScene: event.currentScene,
                            totalScenes: event.totalScenes,
                        });
                        coreHook.setAppState(mapProductionEventToAppState(event));

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

            coreHook.setContentPlan(hydratedState.contentPlan);
            narrationHook.setNarrationSegments(hydratedState.narrationSegments);
            visualsHook.setVisuals(hydratedState.visuals);
            sfxHook.setSfxPlan(hydratedState.sfxPlan);
            coreHook.setValidation(snapshot.validation);

            if (hydratedState.contentPlan && snapshot.validation) {
                const report = qualityHook.generateAndSaveQualityReport(
                    hydratedState.contentPlan as any,
                    hydratedState.narrationSegments,
                    hydratedState.sfxPlan,
                    snapshot.validation,
                    coreHook.videoPurpose
                );
                console.log(`[useVideoProduction] Backend Mode Quality Report: ${report.overallScore}/100`);
            }

            if (!snapshot.isComplete || snapshot.errors.length > 0) {
                coreHook.setError(`Production completed with issues (score: ${snapshot.qualityScore || snapshot.validation?.score || 0})`);
            }

            coreHook.setProgress({
                stage: "complete",
                progress: 100,
                message: "Production complete!",
            });
            coreHook.setAppState(AppState.READY);
        } catch (err) {
            console.error("[useVideoProduction] Pipeline failed:", err);
            coreHook.setError(err instanceof Error ? err.message : String(err));
            coreHook.setAppState(AppState.ERROR);
        }
    }, [coreHook, narrationHook, visualsHook, sfxHook, qualityHook]);

    /**
     * Generate content plan only (without narration)
     */
    const generatePlan = useCallback(async (config?: Partial<ContentPlannerConfig>) => {
        if (!coreHook.topic.trim()) {
            coreHook.setError("Please enter a topic");
            return;
        }

        coreHook.setError(null);
        coreHook.setAppState(AppState.CONTENT_PLANNING);
        coreHook.setProgress({
            stage: "content_planning",
            progress: 0,
            message: "Generating video plan...",
        });

        try {
            const effectiveDuration = config?.targetDuration ?? coreHook.targetDuration;
            const plan = await generateContentPlan(coreHook.topic, {
                targetDuration: effectiveDuration,
                sceneCount: Math.max(3, Math.floor(effectiveDuration / 12)),
                targetAudience: coreHook.targetAudience,
                config: {
                    videoPurpose: coreHook.videoPurpose,
                    visualStyle: coreHook.visualStyle,
                },
            });

            coreHook.setContentPlan(plan);
            coreHook.setProgress({
                stage: "content_planning",
                progress: 100,
                message: `Created ${plan.scenes.length} scenes`,
            });
            coreHook.setAppState(AppState.READY);
        } catch (err) {
            console.error("[useVideoProduction] Plan generation failed:", err);
            coreHook.setError(err instanceof Error ? err.message : String(err));
            coreHook.setAppState(AppState.ERROR);
        }
    }, [coreHook]);

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
            const basePlan = prev || {
                scenes: [],
                backgroundMusic: null,
                masterVolume: 1.0,
            };

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
        coreHook.resetCore();
        narrationHook.resetNarration();
        visualsHook.resetVisuals();
        qualityHook.resetQuality();
        sfxHook.resetSFX();
        musicHook.resetMusicState();
    }, [coreHook, narrationHook, visualsHook, qualityHook, sfxHook, musicHook]);

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
        appState: coreHook.appState,
        topic: coreHook.topic,
        contentPlan: coreHook.contentPlan,
        narrationSegments: narrationHook.narrationSegments,
        visuals: visualsHook.visuals,
        sfxPlan: sfxHook.sfxPlan,
        validation: coreHook.validation,
        qualityReport: qualityHook.qualityReport,
        progress: coreHook.progress,
        error: coreHook.error,
        playingSceneId: narrationHook.playingSceneId,

        // Config
        targetDuration: coreHook.targetDuration,
        targetAudience: coreHook.targetAudience,
        videoPurpose: coreHook.videoPurpose,
        visualStyle: coreHook.visualStyle,
        language: coreHook.language,
        useAgentMode: coreHook.useAgentMode,
        setTargetDuration: coreHook.setTargetDuration,
        setTargetAudience: coreHook.setTargetAudience,
        setVideoPurpose: coreHook.setVideoPurpose,
        setVisualStyle: coreHook.setVisualStyle,
        setLanguage: coreHook.setLanguage,
        setUseAgentMode: coreHook.setUseAgentMode,
        veoVideoCount: coreHook.veoVideoCount,
        setVeoVideoCount: coreHook.setVeoVideoCount,

        // Actions
        setTopic: coreHook.setTopic,
        startProduction,
        generatePlan,
        generateNarration: narrationHook.generateNarration,
        regenerateSceneNarration: narrationHook.regenerateSceneNarration,
        runValidation: () => qualityHook.runValidation(
            coreHook.contentPlan as any,
            narrationHook.narrationSegments,
            visualsHook.visuals
        ),
        addMusicToTimeline,
        updateScenes: coreHook.updateScenes,
        playNarration: narrationHook.playNarration,
        reset,

        // Utilities
        getAudioUrlMap: narrationHook.getAudioUrlMap,
        getVisualsMap: visualsHook.getVisualsMap,
        visualsMap: visualsHook.visualsMap,

        // Test/Debug setters (for loading saved sessions)
        setVisuals: visualsHook.setVisuals,
        setContentPlan: coreHook.setContentPlan,
        setNarrationSegments: narrationHook.setNarrationSegments,
        setSfxPlan: sfxHook.setSfxPlan,
        setValidation: coreHook.setValidation,
        setAppState: coreHook.setAppState,

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
