/**
 * useVideoProduction Hook
 * 
 * Manages the multi-agent video production pipeline workflow.
 * This is a separate hook from useLyricLens for topic-based video creation
 * (as opposed to audio-based visualization).
 * 
 * Flow: Topic Input → ContentPlanner → Narrator → Visuals → SFX → Editor → Export
 */

import { useState, useCallback, useRef, useMemo } from "react";
import {
    AppState,
    ContentPlan,
    Scene,
    NarrationSegment,
    GeneratedImage,
    ValidationResult
} from "../types";
import {
    runProductionPipeline,
    ProductionProgress,
    ProductionConfig,
    stageToAppState
} from "../services/agentOrchestrator";
import {
    runProductionAgent,
    runProductionAgentWithSubagents,
    ProductionProgress as AgentProgress,
} from "../services/ai/productionAgent";

// Toggle between monolithic and multi-agent system
// Can be controlled via environment variable or set directly
const USE_MULTI_AGENT =
    (import.meta as any).env?.VITE_USE_MULTI_AGENT === 'true' ||
    (import.meta as any).env?.VITE_USE_MULTI_AGENT === undefined; // Default to true if not set
import { generateContentPlan, ContentPlannerConfig } from "../services/contentPlannerService";
import { narrateScene, createAudioUrl, revokeAudioUrl, NarratorConfig } from "../services/narratorService";
import { validateContentPlan, syncDurationsToNarration } from "../services/editorService";
import { VideoSFXPlan } from "../services/sfxService";
import { VideoPurpose, LanguageCode } from "../constants";
import {
    generateQualityReport,
    saveReportToHistory,
    getQualityHistory,
    getHistoricalAverages,
    getQualitySummary,
    exportReportAsJson,
    ProductionQualityReport
} from "../services/qualityMonitorService";
import {
    SunoGenerationConfig,
    isSunoConfigured,
} from "../services/sunoService";
import { useSunoMusic, MusicGenerationState } from "./useSunoMusic";
// New imports for unused features
import {
    searchAmbientSound,
    getPreviewUrl,
    isFreesoundConfigured,
    AMBIENT_SEARCH_QUERIES,
    type FreesoundSound
} from "../services/freesoundService";
import {
    mixAudioWithSFX,
    canMixSFX,
    type MixConfig
} from "../services/audioMixerService";
import {
    lintPrompt,
    refineImagePrompt,
    type PromptLintIssue
} from "../services/promptService";
import { CAMERA_ANGLES, LIGHTING_MOODS } from "../constants/video";

export interface VideoProductionState {
    // Core state
    appState: AppState;
    topic: string;
    contentPlan: ContentPlan | null;
    narrationSegments: NarrationSegment[];
    visuals: GeneratedImage[];
    sfxPlan: VideoSFXPlan | null;
    validation: ValidationResult | null;

    // Progress
    progress: ProductionProgress | null;

    // Error
    error: string | null;

    // Audio playback
    playingSceneId: string | null;
    audioUrls: Map<string, string>;
}

// MusicGenerationState is now exported from useSunoMusic.ts
export type { MusicGenerationState };

export function useVideoProduction() {
    // Core state
    const [appState, setAppState] = useState<AppState>(AppState.IDLE);
    const [topic, setTopic] = useState("");
    const [contentPlan, setContentPlan] = useState<ContentPlan | null>(null);
    const [narrationSegments, setNarrationSegments] = useState<NarrationSegment[]>([]);
    const [visuals, setVisuals] = useState<GeneratedImage[]>([]);
    const [sfxPlan, setSfxPlan] = useState<VideoSFXPlan | null>(null);
    const [validation, setValidation] = useState<ValidationResult | null>(null);

    // Progress
    const [progress, setProgress] = useState<ProductionProgress | null>(null);

    // Error
    const [error, setError] = useState<string | null>(null);

    // Audio playback
    const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
    const audioUrlsRef = useRef<Map<string, string>>(new Map());
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Config state
    const [targetDuration, setTargetDuration] = useState(60);
    const [targetAudience, setTargetAudience] = useState("General audience");
    const [videoPurpose, setVideoPurpose] = useState<VideoPurpose>("documentary");
    const [visualStyle, setVisualStyle] = useState("Cinematic");
    const [language, setLanguage] = useState<LanguageCode>("auto");
    const [useAgentMode, setUseAgentMode] = useState(true); // Default to AI agent for complex automation

    // Quality monitoring
    const [qualityReport, setQualityReport] = useState<ProductionQualityReport | null>(null);

    // Music generation (Suno API) - now uses extracted hook
    const {
        musicState,
        generateMusic,
        generateLyrics,
        selectTrack,
        refreshCredits,
        resetMusicState,
        getSelectedTrack,
        createMusicVideo,
        generateCover,
        addVocals,
        addInstrumental,
        uploadAndCover,
        uploadAudio,
    } = useSunoMusic();

    /**
     * Start the full production pipeline
     * @param config - Optional production config overrides
     * @param topicOverride - Optional topic to use instead of state (useful for immediate calls)
     */
    const startProduction = useCallback(async (config?: ProductionConfig, topicOverride?: string) => {
        const effectiveTopic = topicOverride || topic;

        if (!effectiveTopic.trim()) {
            setError("Please enter a topic");
            return;
        }

        // Update topic state if override provided
        if (topicOverride) {
            setTopic(topicOverride);
        }

        setError(null);
        setProgress(null);

        // Calculate scene count from duration (1 scene per ~12 seconds, min 3)
        const effectiveDuration = config?.targetDuration ?? targetDuration;
        const calculatedSceneCount = Math.max(3, Math.floor(effectiveDuration / 12));

        try {
            // Check if we should use AI Agent mode (default for complex automation)
            if (useAgentMode) {
                console.log(`[useVideoProduction] Using AI Agent mode for ${effectiveDuration}s video`);
                setAppState(AppState.CONTENT_PLANNING);

                // Build user request for the agent
                const userRequest = `Create a ${effectiveDuration} second ${videoPurpose} video about: ${effectiveTopic}. 
Style: ${visualStyle}. Language: ${language === 'auto' ? 'detect from topic' : language}.
Target audience: ${targetAudience}.
${effectiveDuration > 300 ? 'This is a long video, use appropriate number of scenes.' : ''}
${config?.animateVisuals ? 'IMPORTANT: The user wants VIDEO, so you MUST use the animate_image tool for every scene.' : ''}`;

                // Choose which agent system to use
                const productionFunction = USE_MULTI_AGENT
                    ? runProductionAgentWithSubagents
                    : runProductionAgent;

                console.log(`[useVideoProduction] Using ${USE_MULTI_AGENT ? 'MULTI-AGENT' : 'MONOLITHIC'} system`);

                const agentResult = await productionFunction(
                    userRequest,
                    (agentProg: AgentProgress) => {
                        // Map agent progress to our progress format
                        setProgress({
                            stage: agentProg.stage as any,
                            progress: agentProg.isComplete ? 100 : 50,
                            message: agentProg.message,
                        });

                        // Update app state based on tool being called
                        if (agentProg.tool === 'plan_video') {
                            setAppState(AppState.CONTENT_PLANNING);
                        } else if (agentProg.tool === 'narrate_scenes') {
                            setAppState(AppState.NARRATING);
                        } else if (agentProg.tool === 'generate_visuals' || agentProg.tool === 'animate_image') {
                            setAppState(AppState.GENERATING_PROMPTS);
                        } else if (agentProg.tool === 'validate_plan') {
                            setAppState(AppState.VALIDATING);
                        }
                    }
                );

                if (agentResult) {
                    setContentPlan(agentResult.contentPlan);
                    setNarrationSegments(agentResult.narrationSegments);
                    setVisuals(agentResult.visuals);
                    setSfxPlan(agentResult.sfxPlan);

                    // Create audio URLs for playback from narration segments
                    agentResult.narrationSegments.forEach((segment) => {
                        if (segment.audioBlob) {
                            const url = createAudioUrl(segment);
                            audioUrlsRef.current.set(segment.sceneId, url);
                        }
                    });

                    // Generate quality report if we have a content plan
                    if (agentResult.contentPlan) {
                        // Convert ToolError[] to validation issues format
                        const errorMessages = (agentResult.errors || []).map(err => {
                            // Handle both ToolError objects and legacy string errors
                            if (typeof err === 'string') {
                                return { scene: 'general', type: 'error' as const, message: err };
                            }
                            // ToolError object
                            const sceneInfo = err.sceneIndex !== undefined ? `Scene ${err.sceneIndex}` : err.tool;
                            return {
                                scene: sceneInfo,
                                type: 'error' as const,
                                message: `${err.tool}: ${err.error}${err.fallbackApplied ? ` (fallback: ${err.fallbackApplied})` : ''}`
                            };
                        });

                        // Use partial success report if available
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
                        setValidation(validation);

                        const qualityReport = generateQualityReport(
                            agentResult.contentPlan,
                            agentResult.narrationSegments,
                            agentResult.sfxPlan,
                            validation,
                            videoPurpose
                        );
                        setQualityReport(qualityReport);
                        saveReportToHistory(qualityReport);
                        console.log(`[useVideoProduction] Agent Mode Quality Report: ${qualityReport.overallScore}/100`);
                    }

                    setAppState(AppState.READY);
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
                        targetAudience,
                        visualStyle,
                        contentPlannerConfig: {
                            videoPurpose,
                            visualStyle,
                            language,
                        },
                        narratorConfig: {
                            videoPurpose,
                            language,
                        },
                        ...config,
                    },
                    (prog) => {
                        setProgress(prog);
                        setAppState(stageToAppState(prog.stage));
                    }
                );

                setContentPlan(result.contentPlan);
                setNarrationSegments(result.narrationSegments);
                setVisuals(result.visuals);
                setSfxPlan(result.sfxPlan);
                setValidation(result.validation);

                // Create audio URLs for playback from narration segments
                result.narrationSegments.forEach((segment) => {
                    if (segment.audioBlob) {
                        const url = createAudioUrl(segment);
                        audioUrlsRef.current.set(segment.sceneId, url);
                    }
                });

                // Generate quality report
                const report = generateQualityReport(
                    result.contentPlan,
                    result.narrationSegments,
                    result.sfxPlan,
                    result.validation,
                    videoPurpose
                );
                setQualityReport(report);
                saveReportToHistory(report);
                console.log(`[useVideoProduction] Fast Mode Quality Report: ${report.overallScore}/100`);

                if (!result.success) {
                    setError(`Production completed with issues (score: ${result.validation.score})`);
                }

                setAppState(AppState.READY);
            }
        } catch (err) {
            console.error("[useVideoProduction] Pipeline failed:", err);
            setError(err instanceof Error ? err.message : String(err));
            setAppState(AppState.ERROR);
        }
    }, [topic, targetDuration, targetAudience, videoPurpose, visualStyle, language, useAgentMode]);

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
        setProgress({
            stage: "content_planning",
            progress: 0,
            message: "Generating video plan...",
        });

        try {
            const effectiveDuration = config?.targetDuration ?? targetDuration;
            const plan = await generateContentPlan(topic, {
                targetDuration: effectiveDuration,
                sceneCount: Math.max(3, Math.floor(effectiveDuration / 12)),
                targetAudience,
                config: {
                    videoPurpose,
                    visualStyle,
                },
            });

            setContentPlan(plan);
            setProgress({
                stage: "content_planning",
                progress: 100,
                message: `Created ${plan.scenes.length} scenes`,
            });
            setAppState(AppState.READY);
        } catch (err) {
            console.error("[useVideoProduction] Plan generation failed:", err);
            setError(err instanceof Error ? err.message : String(err));
            setAppState(AppState.ERROR);
        }
    }, [topic, targetDuration, targetAudience]);

    /**
     * Generate narration for all scenes
     */
    const generateNarration = useCallback(async () => {
        if (!contentPlan) {
            setError("No content plan to narrate");
            return;
        }

        setError(null);
        setAppState(AppState.NARRATING);

        const segments: NarrationSegment[] = [];

        for (let i = 0; i < contentPlan.scenes.length; i++) {
            const scene = contentPlan.scenes[i];

            setProgress({
                stage: "narrating",
                progress: Math.round((i / contentPlan.scenes.length) * 100),
                message: `Narrating: ${scene.name}`,
                currentScene: i + 1,
                totalScenes: contentPlan.scenes.length,
            });

            try {
                // Pass video purpose for auto-styling
                const narratorConfig: NarratorConfig = { videoPurpose };
                const segment = await narrateScene(scene, narratorConfig);
                segments.push(segment);

                // Create audio URL for playback
                const url = createAudioUrl(segment);
                audioUrlsRef.current.set(scene.id, url);
            } catch (err) {
                console.error(`[useVideoProduction] Narration failed for scene ${scene.id}:`, err);
                setError(`Narration failed for "${scene.name}"`);
                setAppState(AppState.ERROR);
                return;
            }
        }

        setNarrationSegments(segments);

        // Sync durations
        if (contentPlan) {
            const synced = syncDurationsToNarration(contentPlan, segments);
            setContentPlan(synced);
        }

        setProgress({
            stage: "narrating",
            progress: 100,
            message: `${segments.length} narrations complete`,
        });
        setAppState(AppState.READY);
    }, [contentPlan]);

    /**
     * Validate the current plan
     */
    const runValidation = useCallback(async () => {
        if (!contentPlan) {
            setError("No content plan to validate");
            return;
        }

        setAppState(AppState.VALIDATING);
        setProgress({
            stage: "validating",
            progress: 0,
            message: "Validating production...",
        });

        try {
            const result = await validateContentPlan(contentPlan, {
                narrationSegments,
                visuals,
                useAICritique: true,
            });

            setValidation(result);
            setProgress({
                stage: "validating",
                progress: 100,
                message: `Validation score: ${result.score}/100`,
            });
            setAppState(AppState.READY);
        } catch (err) {
            console.error("[useVideoProduction] Validation failed:", err);
            setError(err instanceof Error ? err.message : String(err));
            setAppState(AppState.ERROR);
        }
    }, [contentPlan, narrationSegments, visuals]);

    /**
     * Add the selected music track to the timeline.
     * Updates the sfxPlan with the generated music.
     */
    const addMusicToTimeline = useCallback(() => {
        const selectedTrack = getSelectedTrack();

        if (!selectedTrack) {
            console.warn("[useVideoProduction] No track selected to add to timeline");
            return;
        }

        console.log(`[useVideoProduction] Adding track "${selectedTrack.title}" to timeline`);

        setSfxPlan(prev => {
            const basePlan: VideoSFXPlan = prev || {
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
    }, [getSelectedTrack]);

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
     * Regenerate narration for a single scene after script edit
     */
    const regenerateSceneNarration = useCallback(async (sceneId: string) => {
        if (!contentPlan) {
            setError("No content plan available");
            return;
        }

        const scene = contentPlan.scenes.find(s => s.id === sceneId);
        if (!scene) {
            setError(`Scene ${sceneId} not found`);
            return;
        }

        setError(null);
        setProgress({
            stage: "narrating",
            progress: 0,
            message: `Regenerating narration for: ${scene.name}`,
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
            const segment = await narrateScene(scene, narratorConfig);

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
            if (contentPlan) {
                const updatedScenes = contentPlan.scenes.map(s =>
                    s.id === sceneId ? { ...s, duration: Math.ceil(segment.audioDuration) } : s
                );
                const totalDuration = updatedScenes.reduce((sum, s) => sum + s.duration, 0);
                setContentPlan({
                    ...contentPlan,
                    scenes: updatedScenes,
                    totalDuration,
                });
            }

            setProgress({
                stage: "narrating",
                progress: 100,
                message: `Narration updated for: ${scene.name}`,
            });

            console.log(`[useVideoProduction] Regenerated narration for scene ${sceneId}, duration: ${segment.audioDuration}s`);
        } catch (err) {
            console.error(`[useVideoProduction] Failed to regenerate narration for scene ${sceneId}:`, err);
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [contentPlan, videoPurpose]);

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
     * Reset all state
     */
    const reset = useCallback(() => {
        // Cleanup audio URLs
        audioUrlsRef.current.forEach((url) => revokeAudioUrl(url));
        audioUrlsRef.current.clear();

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        setAppState(AppState.IDLE);
        setTopic("");
        setContentPlan(null);
        setNarrationSegments([]);
        setVisuals([]);
        setSfxPlan(null);
        setValidation(null);
        setQualityReport(null);
        setProgress(null);
        setError(null);
        setPlayingSceneId(null);

        // Reset music generation state
        resetMusicState();
    }, []);

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

    // Legacy getter for backward compatibility
    const getVisualsMap = useCallback(() => visualsMap, [visualsMap]);

    // =============================================
    // NEW FEATURES: Freesound SFX, Audio Mixing, Prompt Tools
    // =============================================

    // Camera and lighting preferences
    const [preferredCameraAngle, setPreferredCameraAngle] = useState<string | null>(null);
    const [preferredLightingMood, setPreferredLightingMood] = useState<string | null>(null);

    /**
     * Browse SFX from Freesound library
     */
    const browseSfx = useCallback(async (category: string): Promise<FreesoundSound | null> => {
        if (!isFreesoundConfigured()) {
            console.warn("[useVideoProduction] Freesound API not configured");
            setError("Freesound API key not configured. Add VITE_FREESOUND_API_KEY to .env.local");
            return null;
        }

        try {
            const sound = await searchAmbientSound(category);
            if (sound) {
                console.log(`[useVideoProduction] Found SFX: ${sound.name} (${sound.duration.toFixed(1)}s)`);
            }
            return sound;
        } catch (err) {
            console.error("[useVideoProduction] SFX browse failed:", err);
            setError(err instanceof Error ? err.message : String(err));
            return null;
        }
    }, []);

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
    const mixAudio = useCallback(async (options: {
        includeSfx?: boolean;
        includeMusic?: boolean;
    } = {}): Promise<Blob | null> => {
        const { includeSfx = true, includeMusic = true } = options;

        if (!contentPlan || narrationSegments.length === 0) {
            setError("No content to mix - generate narration first");
            return null;
        }

        // Build merged narration URL first
        const orderedBlobs: Blob[] = [];
        for (const scene of contentPlan.scenes) {
            const narration = narrationSegments.find(n => n.sceneId === scene.id);
            if (narration?.audioBlob) orderedBlobs.push(narration.audioBlob);
        }

        if (orderedBlobs.length === 0) {
            setError("No narration audio available");
            return null;
        }

        try {
            // Merge narration blobs first
            const { mergeConsecutiveAudioBlobs } = await import("../services/audioMixerService");
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
                console.warn("[useVideoProduction] SFX plan has no audio URLs - mixing narration only");
            }

            setProgress({
                stage: "validating",
                progress: 50,
                message: "Mixing audio tracks...",
            });

            const mixedBlob = await mixAudioWithSFX(mixConfig);

            // Cleanup temp URL
            URL.revokeObjectURL(narrationUrl);

            setProgress({
                stage: "validating",
                progress: 100,
                message: "Audio mix complete!",
            });

            return mixedBlob;
        } catch (err) {
            console.error("[useVideoProduction] Audio mixing failed:", err);
            setError(err instanceof Error ? err.message : String(err));
            return null;
        }
    }, [contentPlan, narrationSegments, sfxPlan]);

    /**
     * Lint a prompt for quality issues
     */
    const checkPromptQuality = useCallback((promptText: string, globalSubject?: string): PromptLintIssue[] => {
        return lintPrompt({
            promptText,
            globalSubject,
            previousPrompts: contentPlan?.scenes.map(s => s.visualDescription) || []
        });
    }, [contentPlan]);

    /**
     * Refine a prompt using AI
     */
    const improvePrompt = useCallback(async (
        promptText: string,
        intent: "auto" | "more_detailed" | "more_cinematic" | "shorten" = "auto"
    ): Promise<{ refinedPrompt: string; issues: PromptLintIssue[] }> => {
        return refineImagePrompt({
            promptText,
            style: visualStyle,
            globalSubject: topic,
            intent,
            previousPrompts: contentPlan?.scenes.map(s => s.visualDescription) || []
        });
    }, [visualStyle, topic, contentPlan]);

    /**
     * Get quality history from localStorage
     */
    const getQualityHistoryData = useCallback(() => {
        return getQualityHistory();
    }, []);

    /**
     * Get historical quality averages and trend
     */
    const getQualityTrend = useCallback(() => {
        return getHistoricalAverages();
    }, []);

    /**
     * Export current quality report as JSON
     */
    const exportQualityReport = useCallback(() => {
        if (!qualityReport) return null;
        return exportReportAsJson(qualityReport);
    }, [qualityReport]);

    /**
     * Get quality summary string
     */
    const getQualitySummaryText = useCallback(() => {
        if (!qualityReport) return null;
        return getQualitySummary(qualityReport);
    }, [qualityReport]);

    /**
     * Get available camera angles
     */
    const getCameraAngles = useCallback(() => [...CAMERA_ANGLES], []);

    /**
     * Get available lighting moods
     */
    const getLightingMoods = useCallback(() => [...LIGHTING_MOODS], []);

    /**
     * Check if Freesound is configured
     */
    const isSfxAvailable = useCallback(() => isFreesoundConfigured(), []);

    return {
        // Music generation state (Prioritized)
        musicState,
        generateMusic,
        generateLyrics,
        selectTrack,
        refreshCredits,
        createMusicVideo,
        generateCover,
        addVocals,
        addInstrumental,
        uploadAndCover,
        uploadAudio,

        // Core State
        appState,
        topic,
        contentPlan,
        narrationSegments,
        visuals,
        sfxPlan,
        validation,
        qualityReport,
        progress,
        error,
        playingSceneId,

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

        // Actions
        setTopic,
        startProduction,
        generatePlan,
        generateNarration,
        regenerateSceneNarration,
        runValidation,
        addMusicToTimeline,
        updateScenes,
        playNarration,
        reset,

        // Utilities
        getAudioUrlMap,
        getVisualsMap,
        visualsMap, // Direct access to memoized visuals map

        // NEW: SFX & Freesound
        browseSfx,
        getSfxCategories,
        previewSfx,
        isSfxAvailable,

        // NEW: Audio Mixing
        mixAudio,

        // NEW: Prompt Quality Tools
        checkPromptQuality,
        improvePrompt,

        // NEW: Quality History
        getQualityHistoryData,
        getQualityTrend,
        exportQualityReport,
        getQualitySummaryText,

        // NEW: Camera & Lighting Preferences
        preferredCameraAngle,
        preferredLightingMood,
        setPreferredCameraAngle,
        setPreferredLightingMood,
        getCameraAngles,
        getLightingMoods,
    };
}

export default useVideoProduction;
