/**
 * useVideoProductionRefactored Hook
 * 
 * Refactored version of useVideoProduction that combines focused hooks.
 * This replaces the massive 987-line hook with a clean composition pattern.
 * 
 * Flow: Topic Input → ContentPlanner → Narrator → Visuals → SFX → Editor → Export
 */

import { useCallback } from "react";
import { AppState } from "../types";
import {
    runProductionPipeline,
    ProductionConfig,
    stageToAppState
} from "../services/agentOrchestrator";
import {
    runProductionAgent,
    runProductionAgentWithSubagents,
    ProductionProgress as AgentProgress,
} from "../services/ai/productionAgent";
import { generateContentPlan, ContentPlannerConfig } from "../services/contentPlannerService";
import { NarratorConfig, createAudioUrl } from "../services/narratorService";

// Import focused hooks
import { useVideoProductionCore } from "./useVideoProductionCore";
import { useVideoNarration } from "./useVideoNarration";
import { useVideoVisuals } from "./useVideoVisuals";
import { useVideoQuality } from "./useVideoQuality";
import { useVideoSFX } from "./useVideoSFX";
import { useVideoPromptTools } from "./useVideoPromptTools";
import { useSunoMusic } from "./useSunoMusic";

// Toggle between monolithic and multi-agent system
const USE_MULTI_AGENT = import.meta.env.VITE_USE_MULTI_AGENT !== 'false';

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
    const startProduction = useCallback(async (config?: ProductionConfig, topicOverride?: string) => {
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
        const calculatedSceneCount = Math.max(3, Math.floor(effectiveDuration / 12));

        try {
            // Check if we should use AI Agent mode (default for complex automation)
            if (coreHook.useAgentMode) {
                console.log(`[useVideoProduction] Using AI Agent mode for ${effectiveDuration}s video`);
                coreHook.setAppState(AppState.CONTENT_PLANNING);

                // Build user request for the agent
                const userRequest = `Create a ${effectiveDuration} second ${coreHook.videoPurpose} video about: ${effectiveTopic}. 
Style: ${coreHook.visualStyle}. Language: ${coreHook.language === 'auto' ? 'detect from topic' : coreHook.language}.
Target audience: ${coreHook.targetAudience}.
${effectiveDuration > 300 ? 'This is a long video, use appropriate number of scenes.' : ''}
${config?.animateVisuals ? 'IMPORTANT: The user wants VIDEO, so you MUST use the animate_image tool for every scene.' : ''}
${coreHook.veoVideoCount > 0 ? `IMPORTANT: Use generate_visuals with veoVideoCount=${coreHook.veoVideoCount} to generate professional videos for the first ${coreHook.veoVideoCount} scenes.` : ''}`;

                // Choose which agent system to use
                const productionFunction = USE_MULTI_AGENT
                    ? runProductionAgentWithSubagents
                    : runProductionAgent;

                console.log(`[useVideoProduction] Using ${USE_MULTI_AGENT ? 'MULTI-AGENT' : 'MONOLITHIC'} system`);

                const agentResult = await productionFunction(
                    userRequest,
                    (agentProg: AgentProgress) => {
                        // Map agent progress to our progress format
                        coreHook.setProgress({
                            stage: agentProg.stage as any,
                            progress: agentProg.isComplete ? 100 : 50,
                            message: agentProg.message,
                        });

                        // Update app state based on tool being called
                        if (agentProg.tool === 'plan_video') {
                            coreHook.setAppState(AppState.CONTENT_PLANNING);
                        } else if (agentProg.tool === 'narrate_scenes') {
                            coreHook.setAppState(AppState.NARRATING);
                        } else if (agentProg.tool === 'generate_visuals' || agentProg.tool === 'animate_image') {
                            coreHook.setAppState(AppState.GENERATING_PROMPTS);
                        } else if (agentProg.tool === 'validate_plan') {
                            coreHook.setAppState(AppState.VALIDATING);
                        }
                    }
                );

                if (agentResult) {
                    coreHook.setContentPlan(agentResult.contentPlan);
                    narrationHook.setNarrationSegments(agentResult.narrationSegments);
                    visualsHook.setVisuals(agentResult.visuals);
                    sfxHook.setSfxPlan(agentResult.sfxPlan);

                    // Create audio URLs for playback from narration segments
                    agentResult.narrationSegments.forEach((segment) => {
                        if (segment.audioBlob) {
                            const url = createAudioUrl(segment);
                            // Note: This would need to be handled by the narration hook
                        }
                    });

                    // Generate quality report if we have a content plan
                    if (agentResult.contentPlan) {
                        // Convert ToolError[] to validation issues format
                        const errorMessages = (agentResult.errors || []).map(err => {
                            if (typeof err === 'string') {
                                return { scene: 'general', type: 'error' as const, message: err };
                            }
                            const sceneInfo = err.sceneIndex !== undefined ? `Scene ${err.sceneIndex}` : err.tool;
                            return {
                                scene: sceneInfo,
                                type: 'error' as const,
                                message: `${err.tool}: ${err.error}${err.fallbackApplied ? ` (fallback: ${err.fallbackApplied})` : ''}`
                            };
                        });

                        const partialReport = agentResult.partialSuccessReport;
                        const hasErrors = errorMessages.length > 0;
                        const score = partialReport?.isUsable
                            ? (partialReport.fallbackApplied > 0 ? 75 : 85)
                            : (hasErrors ? 60 : 85);

                        const validation = {
                            approved: !hasErrors || (partialReport?.isUsable ?? true),
                            score,
                            issues: errorMessages,
                            suggestions: partialReport ? [partialReport.summary] : []
                        };
                        coreHook.setValidation(validation);

                        const qualityReport = qualityHook.generateAndSaveQualityReport(
                            agentResult.contentPlan as any,
                            agentResult.narrationSegments,
                            agentResult.sfxPlan,
                            validation,
                            coreHook.videoPurpose
                        );
                        console.log(`[useVideoProduction] Agent Mode Quality Report: ${qualityReport.overallScore}/100`);
                    }

                    coreHook.setAppState(AppState.READY);
                } else {
                    throw new Error("Agent returned no result");
                }
            } else {
                // Fast mode - use direct orchestrator pipeline
                console.log(`[useVideoProduction] Using Fast mode (orchestrator) for ${effectiveDuration}s video`);

                const result = await runProductionPipeline(
                    effectiveTopic,
                    {
                        targetDuration: effectiveDuration,
                        sceneCount: calculatedSceneCount,
                        targetAudience: coreHook.targetAudience,
                        visualStyle: coreHook.visualStyle,
                        contentPlannerConfig: {
                            videoPurpose: coreHook.videoPurpose,
                            visualStyle: coreHook.visualStyle,
                            language: coreHook.language,
                        },
                        narratorConfig: {
                            videoPurpose: coreHook.videoPurpose,
                            language: coreHook.language,
                        },
                        veoVideoCount: coreHook.veoVideoCount,
                        ...config,
                    },
                    (prog) => {
                        coreHook.setProgress(prog);
                        coreHook.setAppState(stageToAppState(prog.stage));
                    }
                );

                coreHook.setContentPlan(result.contentPlan);
                narrationHook.setNarrationSegments(result.narrationSegments);
                visualsHook.setVisuals(result.visuals);
                sfxHook.setSfxPlan(result.sfxPlan);
                coreHook.setValidation(result.validation);

                // Generate quality report
                const report = qualityHook.generateAndSaveQualityReport(
                    result.contentPlan as any,
                    result.narrationSegments,
                    result.sfxPlan,
                    result.validation,
                    coreHook.videoPurpose
                );
                console.log(`[useVideoProduction] Fast Mode Quality Report: ${report.overallScore}/100`);

                if (!result.success) {
                    coreHook.setError(`Production completed with issues (score: ${result.validation.score})`);
                }

                coreHook.setAppState(AppState.READY);
            }
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