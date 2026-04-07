/**
 * useStoryGeneration Hook
 *
 * Manages the state and transition logic for the Story Mode workflow.
 * Workflow: Idea (Topic) → Breakdown → Screenplay → Characters → Shotlist → Narration → Animation → Export
 */

import { useState, useCallback, useEffect } from 'react';
import { storyLogger } from '@/services/infrastructure/logger';
const log = storyLogger.child('Generation');
import type {
    StoryStep,
    StoryState,
    ScreenplayScene,
    CharacterProfile,
    ShotlistEntry,
    ConsistencyReport,
    StoryShot,
    Scene,
    StoryNarrationSegment,
    AnimatedShot,
} from '@/types';
import {
    invokeGenerateBreakdown,
    invokeCreateScreenplay,
    invokeGenerateCharacters,
    invokeGenerateShotlist,
    invokeVerifyCharacterConsistency,
    invokeRegenerateScene,
} from '@/services/ai/production';
import { breakAllScenesIntoShots } from '@/services/ai/shotBreakdownAgent';
import { storyModeStore } from '@/services/ai/production/store';
import type { StoryModeState } from '@/services/ai/production/types';
import {
    narrateScene,
    narrateAllShots,
    createAudioUrl,
    DEAPI_TTS_MODELS,
    type NarratorConfig,
    type TTSProvider,
    type DeApiTtsModel,
} from '@/services/media/narratorService';
import { generateVideoFromPrompt } from '@/services/media/videoService';
import { animateImageWithDeApi, generateVideoWithDeApi, isDeApiConfigured, generateImageWithAspectRatio, generateImageBatch, applyStyleConsistency, type DeApiImageModel } from '@/services/media/deapiService';
import { DEAPI_DEFAULTS } from '@/services/media/deapiService/models';
import { exportVideoWithFFmpeg } from '@/services/ffmpeg/exporters';
import { generateCharacterReference, enrichCharactersWithCoreAnchors } from '@/services/media/characterService';
import { cloudAutosave } from '@/services/cloud/cloudStorageService';
import { createCombinedNarrationAudio } from '@/services/audio-processing/audioConcatService';
import {
    debouncedSaveToCloud,
    loadStoryFromCloud,
    isSyncAvailable,
    flushPendingSave,
    getCurrentUser,
    onAuthChange,
} from '@/services/firebase';
import {
    fromShotBreakdown,
    serializeStyleGuideAsText,
    toCharacterInputs,
    type ExtractedStyleOverride,
} from '@/services/prompt/imageStyleGuide';
import { getSystemPersona } from '@/services/prompt/personaData';
import type { VideoPurpose } from '@/constants';
import {
    extractVisualStyle,
    type VisualStyle,
} from '@/services/media/visualConsistencyService';
import { getCharacterSeed } from '@/services/media/imageService';
import { cleanForSubtitles } from '@/services/audio-processing/textSanitizer';
import { generateVoiceoverScripts } from '@/services/ai/storyPipeline';
import { detectLanguage } from '@/services/content/languageDetector';

import {
    generateNegativePromptsForStyle,
    MOTION_CONFIGS,
    type MotionStrength,
    selectMotionStrength,
    buildAnimationPrompt,
    STORAGE_KEY,
    SESSION_KEY,
    USER_ID_KEY,
    PROJECT_ID_KEY,
    ANIMATION_CIRCUIT_BREAKER_THRESHOLD,
    cleanNarrationText,
    inferSceneEmotion,
    stripImageDataForStorage,
    mapStoryStepToStoryModeStep,
    buildStoryModeState,
    DIGITS,
    stripLLMPreamble,
    parseBreakdownToScenes,
    type StoryAgentResult,
} from './helpers';
import { useStorySettings } from './useStorySettings';

export function useStoryGeneration(projectId?: string | null) {
    const initialState: StoryState = {
        currentStep: 'idea',
        breakdown: [],
        script: null,
        characters: [],
        shotlist: [],
        ttsProvider: 'gemini',
        ttsModel: DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN,
    };

    const [state, setState] = useState<StoryState>(initialState);

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [topic, setTopic] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ message: string; percent: number }>({
        message: '',
        percent: 0
    });

    // Batch animation progress tracking (Feature 4)
    const [processingShots, setProcessingShots] = useState<Map<string, { progress: number; preview?: string }>>(new Map());

    // History for Undo/Redo
    const [past, setPast] = useState<StoryState[]>([]);
    const [future, setFuture] = useState<StoryState[]>([]);

    /**
     * Helper to push a new state to history
     */
    const pushState = useCallback((newState: StoryState) => {
        setPast((prev: StoryState[]) => {
            // Limit history size to 50
            const nextPast = [...prev, state];
            if (nextPast.length > 50) return nextPast.slice(nextPast.length - 50);
            return nextPast;
        });
        setFuture([]); // Clear redo stack on new action
        setState(newState);
    }, [state]);

    const undo = useCallback(() => {
        if (past.length === 0) return;

        const previous = past[past.length - 1];
        if (!previous) return;

        const newPast = past.slice(0, past.length - 1);

        setPast(newPast);
        setFuture((prev: StoryState[]) => [state, ...prev]);
        setState(previous);
    }, [past, state]);

    const redo = useCallback(() => {
        if (future.length === 0) return;

        const next = future[0];
        if (!next) return;

        const newFuture = future.slice(1);

        setFuture(newFuture);
        setPast((prev: StoryState[]) => [...prev, state]);
        setState(next);
    }, [future, state]);

    // Load state from localStorage on mount / project change (with ownership validation)
    useEffect(() => {
        const savedState = localStorage.getItem(STORAGE_KEY);
        const savedSession = localStorage.getItem(SESSION_KEY);
        const savedUserId = localStorage.getItem(USER_ID_KEY);
        const savedProjectId = localStorage.getItem(PROJECT_ID_KEY);

        // Get current user to validate ownership
        const currentUser = getCurrentUser();

        // Clear stale session if user mismatch (prevents Firebase permission errors)
        if (savedUserId && currentUser && savedUserId !== currentUser.uid) {
            log.debug('Session belongs to different user, clearing');
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(USER_ID_KEY);
            localStorage.removeItem(PROJECT_ID_KEY);
            return;
        }

        // If a projectId is provided and it differs from the saved one,
        // this is a different/new project — start fresh instead of loading old state
        if (projectId && savedProjectId && projectId !== savedProjectId) {
            log.debug('Different project detected, resetting state', {
                current: projectId,
                saved: savedProjectId,
            });
            setState(initialState);
            setSessionId(null);
            setTopic(null);
            setPast([]);
            setFuture([]);
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(SESSION_KEY);
            // Update the stored projectId to the new one
            localStorage.setItem(PROJECT_ID_KEY, projectId);
            return;
        }

        // If projectId is provided but nothing was saved yet, store it
        if (projectId && !savedProjectId) {
            localStorage.setItem(PROJECT_ID_KEY, projectId);
        }

        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                setState(parsed);
                log.debug('Recovered story state');
            } catch (e) {
                log.error('Failed to parse saved story state', e);
            }
        }

        if (savedSession) {
            setSessionId(savedSession);
            // Re-initialize cloud storage for the restored session
            cloudAutosave.initSession(savedSession).then(success => {
                if (success) {
                    log.debug('Cloud storage re-initialized for restored session');
                }
            });

            // Re-populate storyModeStore with restored state so tools can find the session
            if (savedState) {
                try {
                    const parsed = JSON.parse(savedState);
                    storyModeStore.set(savedSession, buildStoryModeState(savedSession, parsed));
                    log.debug('Restored storyModeStore for session:', savedSession);
                } catch (e) {
                    log.error('Failed to restore storyModeStore:', e);
                }
            }
        }
    }, [projectId]);

    // Save state to localStorage and Firestore on change
    useEffect(() => {
        if (state.currentStep !== 'idea') {
            try {
                const stateForStorage = stripImageDataForStorage(state);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(stateForStorage));

                // Also sync to Firestore if user is authenticated
                if (sessionId && isSyncAvailable()) {
                    debouncedSaveToCloud(sessionId, state, topic || undefined);
                }
            } catch (err) {
                // QuotaExceededError - log but don't crash
                log.warn('Failed to save state to localStorage:', err);
            }
        }
        if (sessionId) {
            localStorage.setItem(SESSION_KEY, sessionId);
        }
        // Keep projectId in sync
        if (projectId) {
            localStorage.setItem(PROJECT_ID_KEY, projectId);
        }
    }, [state, sessionId, topic, projectId]);

    // Clear stale sessions on auth state change (sign-out or user switch)
    useEffect(() => {
        const unsubscribe = onAuthChange((user) => {
            const savedUserId = localStorage.getItem(USER_ID_KEY);

            if (!user) {
                // User signed out - clear session data
                log.debug('User signed out, clearing session');
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(USER_ID_KEY);
                localStorage.removeItem(PROJECT_ID_KEY);
            } else if (savedUserId && savedUserId !== user.uid) {
                // Different user signed in - clear stale session
                log.debug('Different user signed in, clearing stale session');
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(USER_ID_KEY);
                localStorage.removeItem(PROJECT_ID_KEY);
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    /**
     * Step 1: Generate Breakdown
     */
    const generateBreakdown = useCallback(async (inputTopic: string, genre: string) => {
        setIsProcessing(true);
        setError(null);
        setTopic(inputTopic);
        setProgress({ message: 'Generating story breakdown...', percent: 20 });

        try {
            const result = await invokeGenerateBreakdown(inputTopic);

            if (!result.success) {
                setError(result.error || 'Breakdown generation failed');
                return;
            }

            // The tool returns the sessionId directly
            let foundSessionId: string | null = (result.sessionId as string) || null;
            let foundState = foundSessionId ? storyModeStore.get(foundSessionId) : null;

            if (!foundSessionId) {
                // Fallback: Find the best matching story session
                // Priority: exact topic match > most recent story session
                let bestMatch: { sid: string; state: StoryModeState; updatedAt: number } | null = null;
                for (const [sid, storyState] of storyModeStore.entries()) {
                    if (storyState.topic === inputTopic) {
                        // Exact topic match — use immediately
                        foundSessionId = sid;
                        foundState = storyState;
                        break;
                    }
                    if (sid.startsWith('story_')) {
                        const ts = storyState.updatedAt || 0;
                        if (!bestMatch || ts > bestMatch.updatedAt) {
                            bestMatch = { sid, state: storyState, updatedAt: ts };
                        }
                    }
                }
                if (!foundSessionId && bestMatch) {
                    foundSessionId = bestMatch.sid;
                    foundState = bestMatch.state;
                }
            }

            if (foundSessionId && foundState && foundState.breakdown) {
                setSessionId(foundSessionId);

                // Save userId with session to prevent cross-user sync issues
                const user = getCurrentUser();
                if (user) {
                    localStorage.setItem(USER_ID_KEY, user.uid);
                }

                // Initialize cloud storage session for media persistence
                cloudAutosave.initSession(foundSessionId).then(success => {
                    if (success) {
                        log.debug('Cloud storage initialized for session');
                    } else {
                        log.warn('Cloud storage unavailable, using local storage only');
                    }
                });

                // Parse the breakdown text into scenes
                const breakdownText = foundState.breakdown;
                const scenes: ScreenplayScene[] = parseBreakdownToScenes(breakdownText, inputTopic);

                log.debug('Breakdown parsed into scenes:', scenes.length);

                setState((prev: StoryState) => ({
                    ...prev,
                    currentStep: 'breakdown',
                    breakdown: scenes,
                    genre,
                }));
            } else {
                setError('Story breakdown was generated but could not be retrieved. Please try again.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, []);

    /**
     * Step 1.5: Regenerate Specific Scene
     */
    const regenerateScene = useCallback(async (sceneNumber: number, feedback: string) => {
        if (!sessionId) return;
        setIsProcessing(true);
        setError(null);
        setProgress({ message: `Regenerating scene ${sceneNumber}...`, percent: 30 });

        try {
            setProgress({ message: `Regenerating scene ${sceneNumber}...`, percent: 40 });
            const result = await invokeRegenerateScene(sessionId, sceneNumber, feedback);

            if (result.success) {
                // Re-fetch state from storyModeStore after regeneration
                const updatedState = storyModeStore.get(sessionId);
                if (updatedState && updatedState.breakdown) {
                    const scenes = parseBreakdownToScenes(updatedState.breakdown, topic || '');
                    setState((prev: StoryState) => ({
                        ...prev,
                        breakdown: scenes,
                    }));
                }
            } else {
                setError(result.error || 'Scene regeneration failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [sessionId]);

    /**
     * Step 2: Create Screenplay
     */
    const generateScreenplay = useCallback(async () => {
        if (!sessionId) return;
        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Expanding breakdown into full screenplay...', percent: 40 });

        try {
            setProgress({ message: 'Creating screenplay...', percent: 45 });
            const result = await invokeCreateScreenplay(sessionId);

            if (!result.success) {
                setError(result.error || 'Screenplay generation failed');
                return;
            }

            // Fetch the screenplay from storyModeStore
            const storyState = storyModeStore.get(sessionId);
            if (storyState && storyState.screenplay && storyState.screenplay.length > 0) {
                log.debug(`Screenplay retrieved: ${storyState.screenplay.length} scenes`);

                // Reconcile scene count: if screenplay has fewer scenes than breakdown,
                // align breakdown to match screenplay to prevent downstream misalignment
                // (e.g., narration iterating over more scenes than the screenplay covers).
                const screenplayScenes = storyState.screenplay;
                let reconciledBreakdown = state.breakdown;

                if (screenplayScenes.length !== state.breakdown.length) {
                    log.warn(
                        `Scene count mismatch: breakdown=${state.breakdown.length}, screenplay=${screenplayScenes.length}. Reconciling...`
                    );
                    // Use screenplay as source of truth — trim or pad breakdown to match
                    reconciledBreakdown = screenplayScenes.map((sp, idx) => {
                        // Try to match with existing breakdown scene by index
                        const existing = state.breakdown[idx];
                        return {
                            ...sp,
                            // Preserve breakdown's id scheme for consistency
                            id: existing?.id || `scene_${idx}`,
                            sceneNumber: idx + 1,
                            // Use screenplay's richer action text if available
                            action: sp.action || existing?.action || '',
                            heading: sp.heading || existing?.heading || `Scene ${idx + 1}`,
                        };
                    });
                    log.debug(`Reconciled to ${reconciledBreakdown.length} scenes`);
                }

                // Build script object from screenplay scenes
                const script = {
                    title: reconciledBreakdown[0]?.heading || 'Untitled Story',
                    scenes: screenplayScenes,
                };

                setState((prev: StoryState) => ({
                    ...prev,
                    currentStep: 'script',
                    script,
                    breakdown: reconciledBreakdown,
                }));
            } else {
                setError('Screenplay was generated but could not be retrieved. Please try again.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [sessionId, state.breakdown]);

    /**
     * Step 3: Extract Characters
     */
    const generateCharacters = useCallback(async () => {
        if (!sessionId) return;
        if (!state.visualStyle) {
            setError('Please select a visual style before generating characters');
            return;
        }
        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Extracting and visualizing characters...', percent: 60 });

        try {
            setProgress({ message: 'Extracting characters...', percent: 65 });
            const result = await invokeGenerateCharacters(sessionId);

            if (!result.success) {
                setError(result.error || 'Character generation failed');
                return;
            }

            // Fetch the characters from storyModeStore
            const storyState = storyModeStore.get(sessionId);
            if (storyState && storyState.characters && storyState.characters.length > 0) {
                log.debug('Characters retrieved:', storyState.characters.length);

                // Enrich with coreAnchors for stronger prompt anchoring in image generation
                const enrichedCharacters = enrichCharactersWithCoreAnchors(
                    storyState.characters,
                    state.visualStyle || 'Cinematic'
                );

                setState((prev: StoryState) => ({
                    ...prev,
                    currentStep: 'characters',
                    characters: enrichedCharacters,
                }));
            } else {
                setError('Characters were generated but could not be retrieved. Please try again.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [sessionId]);

    /**
     * Generate (or regenerate) a single character's reference image via DeAPI.
     */
    const generateCharacterImage = useCallback(async (characterId: string) => {
        if (!sessionId) return;

        const char = state.characters.find((c: CharacterProfile) => c.id === characterId);
        if (!char) {
            setError(`Character not found: ${characterId}`);
            return;
        }

        if (!state.visualStyle) {
            setError('Please select a visual style before generating character portraits');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProgress({ message: `Generating portrait for ${char.name}...`, percent: 50 });

        try {
            const referenceUrl = await generateCharacterReference(
                char.name,
                char.visualDescription ?? '',
                sessionId,
                state.visualStyle || 'Cinematic',
            );

            setState((prev: StoryState) => ({
                ...prev,
                characters: prev.characters.map((c: CharacterProfile) =>
                    c.id === characterId
                        ? { ...c, referenceImageUrl: referenceUrl }
                        : c
                ),
            }));

            setProgress({ message: `Portrait for ${char.name} ready!`, percent: 100 });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [sessionId, state.characters]);

    /**
     * Step 4: Generate Shotlist
     */
    const generateShotlist = useCallback(async () => {
        if (!sessionId) return;
        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Creating technical shotlist/storyboard...', percent: 80 });

        try {
            setProgress({ message: 'Generating shotlist...', percent: 82 });
            const result = await invokeGenerateShotlist(sessionId);

            if (!result.success) {
                setError(result.error || 'Shotlist generation failed');
                return;
            }

            // Fetch the shotlist from storyModeStore
            const storyState = storyModeStore.get(sessionId);
            if (storyState && storyState.shotlist && storyState.shotlist.length > 0) {
                log.debug(`Shotlist retrieved: ${storyState.shotlist.length} shots`);

                setState((prev: StoryState) => ({
                    ...prev,
                    currentStep: 'storyboard',
                    shotlist: storyState.shotlist,
                }));
            } else {
                setError('Shotlist was generated but could not be retrieved. Please try again.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [sessionId]);

    /**
     * Navigation actions
     */
    const setStep = (step: StoryStep) => {
        setState((prev: StoryState) => ({ ...prev, currentStep: step }));
    };

    const updateBreakdown = (scenes: ScreenplayScene[]) => {
        pushState({ ...state, breakdown: scenes });
    };

    const updateScript = (script: { title: string; scenes: ScreenplayScene[] }) => {
        pushState({ ...state, script });
    };

    /**
     * Update a single shot's metadata (from Shot Editor Modal saves).
     * Merges `updates` into the matching ShotlistEntry without regenerating visuals.
     */
    const updateShot = useCallback((shotId: string, updates: Partial<ShotlistEntry>) => {
        const updatedShotlist = state.shotlist.map((s: ShotlistEntry) =>
            s.id === shotId ? { ...s, ...updates } : s
        );
        pushState({ ...state, shotlist: updatedShotlist });
    }, [state, pushState]);

    /**
     * Reorder shots by dragging from one index to another.
     * Uses pushState for undo support. Re-numbers shots after reordering.
     * 
     * @param fromIndex - The current index of the shot being dragged
     * @param toIndex - The target index where the shot should be dropped
     */
    const reorderShots = useCallback((fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= state.shotlist.length || toIndex >= state.shotlist.length) return;

        const newShotlist = [...state.shotlist];
        const [movedShot] = newShotlist.splice(fromIndex, 1);
        newShotlist.splice(toIndex, 0, movedShot!);

        // Re-number shots after reordering
        const renumberedShotlist = newShotlist.map((shot, idx) => ({
            ...shot,
            shotNumber: idx + 1,
        }));

        pushState({ ...state, shotlist: renumberedShotlist });
    }, [state, pushState]);

    const resetStory = useCallback(() => {
        setState(initialState);
        setSessionId(null);
        setTopic(null);
        setPast([]);
        setFuture([]);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(PROJECT_ID_KEY);
    }, []);

    const exportScreenplay = useCallback((format: 'txt' | 'pdf' = 'txt') => {
        if (!state.script) return;

        if (format === 'pdf') {
            // PDF export using browser print API (industry-standard screenplay format)
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                setError('Please allow popups to export PDF');
                return;
            }

            // Build HTML with proper screenplay formatting (Courier 12pt, specific margins)
            let html = `<!DOCTYPE html>
<html>
<head>
    <title>${state.script.title} - Screenplay</title>
    <style>
        @page { size: letter; margin: 1in 1.5in 1in 1.5in; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 12pt; line-height: 1; }
        .title { text-align: center; margin-bottom: 3in; margin-top: 2in; }
        .title h1 { font-size: 12pt; text-transform: uppercase; }
        .scene-heading { text-transform: uppercase; margin-top: 24pt; margin-bottom: 12pt; }
        .action { margin-bottom: 12pt; }
        .character { text-transform: uppercase; margin-left: 2.2in; margin-bottom: 0; }
        .dialogue { margin-left: 1in; margin-right: 1.5in; margin-bottom: 12pt; }
        .parenthetical { margin-left: 1.6in; margin-right: 2in; font-style: italic; }
        .transition { text-align: right; text-transform: uppercase; margin-top: 12pt; }
        .page-break { page-break-after: always; }
    </style>
</head>
<body>
    <div class="title">
        <h1>${state.script.title}</h1>
        <p>Written by AI Soul Studio</p>
    </div>
    <div class="page-break"></div>
`;

            state.script.scenes.forEach((scene: ScreenplayScene) => {
                html += `<div class="scene-heading">${scene.heading}</div>\n`;
                html += `<div class="action">${scene.action}</div>\n`;

                scene.dialogue.forEach((line) => {
                    html += `<div class="character">${line.speaker}</div>\n`;
                    html += `<div class="dialogue">${line.text}</div>\n`;
                });
            });

            html += `</body></html>`;

            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.print();
            };
            return;
        }

        // Text export (original behavior)
        let content = `${state.script.title.toUpperCase()}\n\n`;

        state.script.scenes.forEach((scene: ScreenplayScene) => {
            content += `SCENE ${scene.sceneNumber}: ${scene.heading.toUpperCase()}\n\n`;
            content += `${scene.action.toUpperCase()}\n\n`;

            scene.dialogue.forEach((line) => {
                content += `\t\t${line.speaker.toUpperCase()}\n`;
                content += `\t${line.text}\n\n`;
            });

            content += `\n${'-'.repeat(40)}\n\n`;
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.script.title.replace(/\s+/g, '_')}_Screenplay.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [state.script]);

    /**
     * Step 5: Verify Character Consistency
     */
    const verifyConsistency = useCallback(async (characterName: string) => {
        if (!sessionId) return;
        setIsProcessing(true);
        setError(null);
        setProgress({ message: `Verifying consistency for ${characterName}...`, percent: 90 });

        try {
            setProgress({ message: `Verifying consistency for ${characterName}...`, percent: 92 });
            const result = await invokeVerifyCharacterConsistency(sessionId, characterName);

            if (result.success && result.report) {
                const report = result.report as ConsistencyReport;
                setState((prev: StoryState) => ({
                    ...prev,
                    consistencyReports: {
                        ...(prev.consistencyReports || {}),
                        [characterName]: report
                    }
                }));
            } else if (!result.success) {
                setError(result.error || 'Consistency verification failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [sessionId]);

    /**
     * Lock Story - Only locks the screenplay for editing, does NOT auto-generate shots.
     * Shot generation is now a separate step triggered by generateShots().
     */
    const lockStory = useCallback(() => {
        if (state.isLocked) return;

        // Only lock the story - no async generation here
        const lockedState: StoryState = {
            ...state,
            isLocked: true,
            lockedAt: new Date().toISOString(),
            version: 'locked_v1' as const,
        };

        pushState(lockedState);
    }, [state, pushState]);

    /**
     * Generate shot breakdown for all scenes (or a specific scene).
     * This is now a separate step from locking.
     *
     * @param sceneIndex - Optional specific scene to generate shots for (for per-scene control)
     */
    const generateShots = useCallback(async (sceneIndex?: number) => {
        if (!state.isLocked) {
            setError('Story must be locked before generating shots');
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            // Get scenes to process, filtering out undefined
            const scenesToProcess: ScreenplayScene[] = sceneIndex !== undefined
                ? [state.breakdown[sceneIndex]].filter((s): s is ScreenplayScene => s !== undefined)
                : state.breakdown;

            if (scenesToProcess.length === 0) {
                setError('No scenes to process');
                setIsProcessing(false);
                return;
            }

            const genre = state.genre || 'Drama';
            const isPerScene = sceneIndex !== undefined;

            setProgress({
                message: isPerScene
                    ? `Generating shots for scene ${sceneIndex + 1}...`
                    : 'Generating shot breakdown...',
                percent: 10
            });

            const shotBreakdownResult = await breakAllScenesIntoShots(
                scenesToProcess,
                genre,
                (sceneIdx, totalScenes) => {
                    const percent = 10 + ((sceneIdx + 1) / totalScenes) * 80;
                    setProgress({
                        message: `Processing scene ${sceneIdx + 1} of ${totalScenes}...`,
                        percent
                    });
                },
                sessionId || undefined,
            );

            // Convert Shot[] to StoryShot[]
            const storyShots: StoryShot[] = shotBreakdownResult.shots.map((shot) => ({
                ...shot,
            }));

            setProgress({ message: 'Finalizing...', percent: 95 });

            // If generating for a specific scene, merge with existing shots
            if (isPerScene && state.shots) {
                const existingShotsFromOtherScenes = state.shots.filter(
                    s => s.sceneId !== state.breakdown[sceneIndex]?.id
                );
                const sceneId = state.breakdown[sceneIndex]?.id;
                pushState({
                    ...state,
                    shots: [...existingShotsFromOtherScenes, ...storyShots],
                    currentStep: 'shots',
                    // Track which scenes have shots generated
                    scenesWithShots: [
                        ...(state.scenesWithShots || []),
                        ...(sceneId ? [sceneId] : [])
                    ].filter((v, i, a) => a.indexOf(v) === i), // dedupe
                });
            } else {
                // Generating all shots
                pushState({
                    ...state,
                    shots: storyShots,
                    currentStep: 'shots',
                    scenesWithShots: state.breakdown.map((s: ScreenplayScene) => s.id),
                });
            }

            setProgress({ message: 'Complete!', percent: 100 });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [state, pushState]);

    // Settings updaters — stable callbacks that live in their own focused hook
    const {
        updateVisualStyle,
        updateAspectRatio,
        updateGenre,
        updateImageProvider,
        updateDeapiImageModel,
        updateStyleConsistency,
        updateBgRemoval,
        updateTtsSettings,
    } = useStorySettings(setState);

    /**
     * Generate storyboard visuals for all scenes or a specific scene.
     * This enables per-scene control over visual generation.
     *
     * @param sceneIndex - Optional specific scene to generate visuals for
     */
    const generateVisuals = useCallback(async (sceneIndex?: number) => {
        if (!state.shots || state.shots.length === 0) {
            setError('Shots must be generated before creating visuals');
            return;
        }
        if (!state.visualStyle) {
            setError('Please select a visual style before generating visuals');
            return;
        }

        setIsProcessing(true);
        setError(null);

        const isPerScene = sceneIndex !== undefined;
        const targetSceneId = isPerScene ? state.breakdown[sceneIndex]?.id : null;

        // Filter shots for the target scene(s)
        const shotsToProcess = isPerScene
            ? state.shots.filter((s: StoryShot) => s.sceneId === targetSceneId)
            : state.shots;

        if (shotsToProcess.length === 0) {
            setError('No shots to process for this scene');
            setIsProcessing(false);
            return;
        }

        setProgress({
            message: isPerScene
                ? `Generating visuals for scene ${sceneIndex + 1}...`
                : 'Generating storyboard visuals...',
            percent: 10
        });

        try {
            // Import the image generation service dynamically
            const { generateImageFromPrompt } = await import('@/services/media/imageService');

            const updatedShotlist: ShotlistEntry[] = [...state.shotlist];
            const style = state.visualStyle || 'Cinematic';

            // Build character input list for structured prompt builder
            const characterInputs = toCharacterInputs(state.characters);

            // Extract visual style from first generated shot for consistency (Issue 3)
            let extractedStyleOverride: ExtractedStyleOverride | undefined;

            // Resolve persona from story genre for persona-aware negative injection
            const genreToPurpose: Record<string, VideoPurpose> = {
                'Drama': 'story_drama',
                'Comedy': 'story_comedy',
                'Thriller': 'story_thriller',
                'Sci-Fi': 'story_scifi',
                'Action': 'story_action',
                'Fantasy': 'story_fantasy',
                'Romance': 'story_romance',
                'Historical': 'story_historical',
                'Animation': 'story_animation',
            };
            const storyPurpose: VideoPurpose = genreToPurpose[state.genre || ''] ?? 'storytelling';
            const storyPersona = getSystemPersona(storyPurpose);

            // Helper: build structured prompt for a shot (Issues 1, 2, 3)
            const buildShotPrompt = (shot: NonNullable<typeof shotsToProcess[0]>) => {
                const guide = fromShotBreakdown(
                    {
                        description: shot.description,
                        shotType: shot.shotType,
                        cameraAngle: shot.cameraAngle,
                        movement: shot.movement,
                        lighting: shot.lighting,
                        emotion: shot.emotion,
                    },
                    characterInputs,
                    style,
                    extractedStyleOverride,
                    storyPersona,
                );
                const serialized = serializeStyleGuideAsText(guide);

                // Inject CHARACTERS IN FRAME section from coreAnchors for stronger consistency
                const shotDescLower = shot.description.toLowerCase();
                const presentChars = state.characters.filter(c =>
                    shotDescLower.includes(c.name.toLowerCase()) && c.coreAnchors
                );
                if (presentChars.length > 0) {
                    const charSection = "CHARACTERS IN FRAME:\n" +
                        presentChars.map(c => `- ${c.coreAnchors}`).join('\n');
                    return `${charSection}\n\nSCENE:\n${serialized}`;
                }
                return serialized;
            };

            // Helper: get seed for the primary character in a shot (Issue 1)
            const getShotSeed = (shot: NonNullable<typeof shotsToProcess[0]>): number | undefined => {
                const shotDescLower = shot.description.toLowerCase();
                const primaryChar = characterInputs.find((c: { name: string; visualDescription: string; facialTags?: string }) =>
                    shotDescLower.includes(c.name.toLowerCase())
                );
                if (primaryChar) {
                    return getCharacterSeed(primaryChar.visualDescription);
                }
                return undefined;
            };

            // Helper: upload to cloud and create shotlist entry
            const processShotResult = async (shot: NonNullable<typeof shotsToProcess[0]>, imageUrl: string) => {
                let finalUrl = imageUrl;
                if (sessionId && finalUrl && (finalUrl.startsWith('data:') || finalUrl.startsWith('blob:'))) {
                    const cloudUrl = await cloudAutosave.saveImageWithUrl(sessionId, finalUrl, shot.id);
                    if (cloudUrl) {
                        log.debug(`Image uploaded to cloud: ${shot.id}`);
                        finalUrl = cloudUrl;
                    }
                }
                const existingIdx = updatedShotlist.findIndex((s: ShotlistEntry) => s.id === shot.id);
                const shotlistEntry: ShotlistEntry = {
                    id: shot.id,
                    sceneId: shot.sceneId,
                    shotNumber: shot.shotNumber,
                    description: shot.description,
                    cameraAngle: shot.cameraAngle,
                    movement: shot.movement,
                    lighting: shot.lighting,
                    dialogue: '',
                    imageUrl: finalUrl,
                };
                if (existingIdx >= 0) {
                    updatedShotlist[existingIdx] = shotlistEntry;
                } else {
                    updatedShotlist.push(shotlistEntry);
                }
            };

            // --- Resume logic: build storyboard status and filter already-done shots ---
            const alreadyDoneShots = state.shotlist.filter(s => s.imageUrl);
            const alreadyDoneStatus: Record<string, 'pending' | 'success' | 'failed'> = {};
            alreadyDoneShots.forEach(s => { alreadyDoneStatus[s.id] = 'success'; });
            const storyboardStatus: Record<string, 'pending' | 'success' | 'failed'> = {
                ...(state.storyboardStatus || {}),
                ...alreadyDoneStatus,
            };
            // Only process shots that don't already have an imageUrl
            const shotsNeedingVisuals = shotsToProcess.filter(s => !s?.imageUrl);

            if (state.imageProvider === 'deapi') {
                // Sequential-first for shot #1 (extract style), then parallel for rest
                const validShots = shotsNeedingVisuals.filter((s): s is NonNullable<typeof s> => s != null);

                // Generate shot #1 first to extract visual style (Issue 3)
                if (validShots.length > 0) {
                    const firstShot = validShots[0]!;
                    setProgress({ message: 'Generating reference image (shot 1)...', percent: 12 });
                    const firstSeed = getShotSeed(firstShot);
                    const firstResult = await generateImageWithAspectRatio(
                        buildShotPrompt(firstShot),
                        (state.aspectRatio || '16:9') as '16:9' | '9:16' | '1:1',
                        (state.deapiImageModel || DEAPI_DEFAULTS.IMG2IMG_MODEL) as DeApiImageModel,
                        undefined, // negativePrompt — style guide handles avoid
                    );
                    await processShotResult(firstShot, firstResult);

                    // Extract visual DNA from first image for consistency
                    try {
                        const visualStyle = await extractVisualStyle(firstResult, sessionId || undefined);
                        extractedStyleOverride = {
                            colorPalette: visualStyle.colorPalette,
                            lighting: visualStyle.lighting,
                            texture: visualStyle.texture,
                            moodKeywords: visualStyle.moodKeywords,
                            negativePrompts: generateNegativePromptsForStyle(style),
                        };
                        // Store master style on state for persistence
                        log.debug('Extracted master style:', extractedStyleOverride.colorPalette?.join(', '));
                    } catch (styleErr) {
                        log.warn('Style extraction failed, continuing without:', styleErr);
                    }
                }

                // Generate remaining shots in parallel with extracted style
                const remainingShots = validShots.slice(1);
                if (remainingShots.length > 0) {
                    const batchItems = remainingShots.map((shot) => ({
                        id: shot.id,
                        prompt: buildShotPrompt(shot), // Now includes extractedStyleOverride
                        aspectRatio: (state.aspectRatio || '16:9') as '16:9' | '9:16' | '1:1',
                        model: (state.deapiImageModel || DEAPI_DEFAULTS.IMG2IMG_MODEL) as DeApiImageModel,
                        seed: getShotSeed(shot),
                    }));

                    const batchResults = await generateImageBatch(
                        batchItems,
                        5, // concurrency
                        (prog) => {
                            const percent = 20 + (prog.completed / prog.total) * 70;
                            setProgress({
                                message: `Generating visuals ${prog.completed + 1}/${validShots.length} (parallel)...`,
                                percent,
                            });
                        },
                    );

                    for (const result of batchResults) {
                        const shot = remainingShots.find((s: StoryShot) => s.id === result.id);
                        if (!shot) continue;
                        if (result.success && result.imageUrl) {
                            await processShotResult(shot, result.imageUrl);
                        } else {
                            log.error(`Failed to generate visual for shot ${shot.shotNumber}:`, result.error);
                        }
                    }
                }
            } else {
                // Parallel generation via Gemini Imagen using ParallelExecutionEngine
                const { ParallelExecutionEngine } = await import('@/services/orchestration/parallelExecutionEngine');
                const engine = new ParallelExecutionEngine();

                // If we have existing images, extract style from the first one for consistency
                const firstExistingImage = state.shotlist.find(s => s.imageUrl)?.imageUrl;
                if (firstExistingImage && !extractedStyleOverride) {
                    try {
                        const visualStyleData = await extractVisualStyle(firstExistingImage, sessionId || undefined);
                        extractedStyleOverride = {
                            colorPalette: visualStyleData.colorPalette,
                            lighting: visualStyleData.lighting,
                            texture: visualStyleData.texture,
                            moodKeywords: visualStyleData.moodKeywords,
                            negativePrompts: generateNegativePromptsForStyle(style),
                        };
                    } catch (e) { /* non-fatal */ }
                }

                // Style extraction guard — only the first completed task triggers it
                let styleExtractionDone = !!extractedStyleOverride;

                const tasks = shotsNeedingVisuals
                    .filter((s): s is NonNullable<typeof s> => s != null)
                    .map((shot, idx) => ({
                        id: shot.id,
                        type: 'visual' as const,
                        priority: shot.shotNumber,
                        retryable: true,
                        timeout: 90_000,
                        execute: async () => {
                            const prompt = buildShotPrompt(shot);
                            const imageUrl = await generateImageFromPrompt(
                                prompt,
                                style,
                                '',
                                state.aspectRatio || '16:9',
                                false,
                                undefined,
                                sessionId || undefined,
                                idx
                            );
                            return { shotId: shot.id, imageUrl };
                        },
                    }));

                let completedCount = alreadyDoneShots.length;
                const geminiResults = await engine.execute(tasks, {
                    concurrencyLimit: 4,
                    retryAttempts: 2,
                    retryDelay: 3000,
                    exponentialBackoff: true,
                    onProgress: (p) => {
                        completedCount = alreadyDoneShots.length + p.completedTasks;
                        setProgress({
                            message: `Generating visual ${completedCount + 1}/${shotsToProcess.length}...`,
                            percent: 10 + (completedCount / shotsToProcess.length) * 80,
                        });
                    },
                    onTaskFail: (taskId, error) => {
                        log.error(`[generateVisuals] Shot ${taskId} failed:`, error.message);
                        storyboardStatus[taskId] = 'failed';
                    },
                    onTaskComplete: (taskId) => {
                        storyboardStatus[taskId] = 'success';
                    },
                });

                // Process results in post-execution loop (cloud upload + shotlist mutation NOT inside execute())
                for (const result of geminiResults) {
                    if (!result.success || !result.data) continue;
                    const shot = shotsNeedingVisuals.find((s: StoryShot) => s.id === result.taskId);
                    if (!shot) continue;
                    await processShotResult(shot, result.data.imageUrl);
                    storyboardStatus[result.taskId] = 'success';

                    // Extract visual style from first successfully generated image
                    if (!styleExtractionDone) {
                        styleExtractionDone = true;
                        try {
                            const vs = await extractVisualStyle(result.data.imageUrl, sessionId || undefined);
                            extractedStyleOverride = {
                                colorPalette: vs.colorPalette,
                                lighting: vs.lighting,
                                texture: vs.texture,
                                moodKeywords: vs.moodKeywords,
                                negativePrompts: generateNegativePromptsForStyle(style),
                            };
                        } catch (styleErr) {
                            log.warn('Style extraction failed:', styleErr);
                        }
                    }
                }
            }

            setProgress({ message: 'Finalizing...', percent: 95 });

            // Update scenes with visuals tracking
            const newScenesWithVisuals = isPerScene && targetSceneId
                ? [...(state.scenesWithVisuals || []), targetSceneId].filter((v, i, a) => a.indexOf(v) === i)
                : state.breakdown.map((s: ScreenplayScene) => s.id);

            pushState({
                ...state,
                shotlist: updatedShotlist,
                currentStep: 'storyboard',
                scenesWithVisuals: newScenesWithVisuals,
                storyboardStatus,
            });

            setProgress({ message: 'Complete!', percent: 100 });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [state, sessionId, pushState]);

    /**
     * Regenerate visual for a single shot (Storyboarder.ai-style per-shot refresh)
     * Allows users to regenerate any individual shot without affecting others.
     * 
     * @param shotId - The ID of the shot to regenerate
     * @param customPrompt - Optional custom prompt override (for user edits)
     */
    const regenerateShotVisual = useCallback(async (shotId: string, customPrompt?: string) => {
        const shot = state.shots?.find((s: StoryShot) => s.id === shotId);
        const existingEntry = state.shotlist.find((s: ShotlistEntry) => s.id === shotId);

        if (!shot && !existingEntry) {
            setError(`Shot ${shotId} not found`);
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProgress({ message: `Regenerating shot...`, percent: 20 });

        try {
            const { generateImageFromPrompt } = await import('@/services/media/imageService');
            const style = state.visualStyle || 'Cinematic';

            // Build prompt from shot details or use custom prompt
            const baseDescription = customPrompt || shot?.description || existingEntry?.description || '';
            const shotType = shot?.shotType || existingEntry?.cameraAngle || 'Medium';
            const cameraAngle = shot?.cameraAngle || 'Eye-level';
            const lighting = shot?.lighting || existingEntry?.lighting || 'Natural';
            const emotion = shot?.emotion || 'neutral';

            setProgress({ message: 'Generating new image...', percent: 50 });

            // Build a structured style guide for consistent prompts across providers
            const { buildImageStyleGuide, serializeStyleGuideAsText } = await import('@/services/prompt/imageStyleGuide');
            const regenGenreToPurpose: Record<string, VideoPurpose> = {
                'Drama': 'story_drama',
                'Comedy': 'story_comedy',
                'Thriller': 'story_thriller',
                'Sci-Fi': 'story_scifi',
                'Action': 'story_action',
                'Fantasy': 'story_fantasy',
                'Romance': 'story_romance',
                'Historical': 'story_historical',
                'Animation': 'story_animation',
            };
            const regenPurpose: VideoPurpose = regenGenreToPurpose[state.genre || ''] ?? 'storytelling';
            const regenPersona = getSystemPersona(regenPurpose);
            const guide = buildImageStyleGuide({
                scene: customPrompt || baseDescription,
                style,
                mood: emotion,
                composition: { shot_type: shotType, camera_angle: cameraAngle, framing: 'rule of thirds' },
                lighting: { source: lighting, quality: 'natural' },
                personaNegatives: regenPersona.negative_constraints,
            });

            let imageUrl: string;
            if (state.imageProvider === 'deapi') {
                const guidePrompt = serializeStyleGuideAsText(guide);
                const negativePrompt = guide.avoid.map(item => `no ${item}`).join(', ');
                imageUrl = await generateImageWithAspectRatio(
                    guidePrompt,
                    (state.aspectRatio || '16:9') as '16:9' | '9:16' | '1:1',
                    (state.deapiImageModel || DEAPI_DEFAULTS.IMG2IMG_MODEL) as DeApiImageModel,
                    negativePrompt,
                );
            } else {
                imageUrl = await generateImageFromPrompt(
                    baseDescription,
                    style,
                    '',
                    state.aspectRatio || '16:9',
                    true,            // skipRefine — guide is already complete
                    undefined,       // New seed for variation
                    sessionId || undefined,
                    undefined,
                    guide,           // prebuiltGuide
                );
            }

            // Upload to cloud storage for persistence
            if (sessionId && imageUrl && (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:'))) {
                const cloudUrl = await cloudAutosave.saveImageWithUrl(sessionId, imageUrl, shotId);
                if (cloudUrl) {
                    log.debug(`Regenerated image uploaded to cloud: ${shotId}`);
                    imageUrl = cloudUrl;
                }
            }

            setProgress({ message: 'Updating storyboard...', percent: 90 });

            // Update the shotlist with new image
            const updatedShotlist = state.shotlist.map(entry =>
                entry.id === shotId
                    ? { ...entry, imageUrl, description: customPrompt || entry.description }
                    : entry
            );

            // If shot wasn't in shotlist yet, add it
            if (!state.shotlist.find((s: ShotlistEntry) => s.id === shotId) && shot) {
                updatedShotlist.push({
                    id: shot.id,
                    sceneId: shot.sceneId,
                    shotNumber: shot.shotNumber,
                    description: customPrompt || shot.description,
                    cameraAngle: shot.cameraAngle,
                    movement: shot.movement,
                    lighting: shot.lighting,
                    dialogue: '',
                    imageUrl,
                });
            }

            pushState({
                ...state,
                shotlist: updatedShotlist,
            });

            setProgress({ message: 'Shot regenerated!', percent: 100 });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [state, sessionId, pushState]);

    /**
     * Check if all scenes have shots generated
     */
    const allScenesHaveShots = useCallback(() => {
        if (!state.scenesWithShots) return false;
        return state.breakdown.every((s: ScreenplayScene) => state.scenesWithShots?.includes(s.id));
    }, [state.breakdown, state.scenesWithShots]);

    /**
     * Check if all scenes have visuals generated
     */
    const allScenesHaveVisuals = useCallback(() => {
        if (!state.scenesWithVisuals) return false;
        return state.breakdown.every((s: ScreenplayScene) => state.scenesWithVisuals?.includes(s.id));
    }, [state.breakdown, state.scenesWithVisuals]);

    /**
     * Step 6: Generate per-shot narration (TTS).
     * Uses narrateAllShots() for per-shot audio segments, with resume logic to skip
     * already-narrated shots. Falls back to voiceover scripts → scene action → description.
     */
    const generateNarration = useCallback(async () => {
        if (!state.shotlist || state.shotlist.length === 0) {
            setError('Visuals must be generated before creating narration');
            return;
        }
        const allShotsHaveImages = state.shotlist.every((s: ShotlistEntry) => s.imageUrl);
        if (!allShotsHaveImages) {
            setError('All shots must have visuals before generating narration');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Rewriting scripts for voiceover...', percent: 5 });

        try {
            const screenplayScenes = state.script?.scenes || [];
            const totalScenes = state.breakdown.length;

            // Step A: Generate voiceover scripts from screenplay action text.
            // This rewrites camera directions into spoken narration with delivery markers.
            setProgress({ message: 'Rewriting scripts for voiceover...', percent: 12 });
            const breakdownHooks = state.breakdown.map((s: ScreenplayScene) => {
                // Extract emotional hook from breakdown metadata if available
                const action = s.action || '';
                return action.length > 100 ? action.slice(0, 100) : action;
            });
            const voiceoverMap = await generateVoiceoverScripts(screenplayScenes, breakdownHooks);

            const scenesForNarration: Scene[] = state.breakdown.map((scene, idx) => {
                const screenplayScene = screenplayScenes.find((s: ScreenplayScene) => s.id === scene.id) || screenplayScenes[idx];
                const rawAction = screenplayScene?.action || scene.action;
                // Use voiceover script if available (has delivery markers), else fall back to cleaned action
                const narrationText = voiceoverMap.get(scene.id) || rawAction;
                const { emotionalTone, instructionTriplet } = inferSceneEmotion(scene, idx, totalScenes);
                return {
                    id: scene.id,
                    name: scene.heading,
                    duration: 8, // Default duration, will be adjusted by TTS
                    visualDescription: scene.action,
                    narrationScript: cleanNarrationText(narrationText),
                    emotionalTone,
                    instructionTriplet,
                };
            });

            // Detect language from multiple sources for robust Arabic detection
            const sampleSources = [
                state.breakdown[0]?.action || '',
                state.breakdown[0]?.heading || '',
                screenplayScenes[0]?.action || '',
                screenplayScenes[0]?.heading || '',
            ].join(' ');
            const detectedLang = detectLanguage(sampleSources);

            // Load TTS settings from state
            // Arabic text requires DeAPI Qwen TTS — Gemini TTS voices don't support Arabic
            const isArabic = detectedLang === 'ar';
            const narratorConfig: NarratorConfig = {
                videoPurpose: 'storytelling',
                ...(isArabic ? { language: 'ar' as const } : {}),
                provider: state.ttsProvider || (isArabic ? 'deapi_qwen' : 'gemini'),
                ...(state.ttsModel && { deapiModel: state.ttsModel as DeApiTtsModel }),
            };

            // Resume logic: identify shots already narrated
            const existingNarrations = state.shotNarrationSegments || [];
            const narrationStatus: Record<string, 'pending' | 'success' | 'failed'> = {
                ...(state.narrationStatus || {}),
            };
            const successfulIds = new Set(
                existingNarrations.filter(s => s.audioUrl).map(s => s.shotId)
            );
            const shotsToNarrate = state.shotlist.filter(s => !successfulIds.has(s.id));

            setProgress({ message: 'Generating narration...', percent: 15 });

            // Call narrateAllShots for parallel per-shot TTS (serialized via acquireTtsSlot mutex)
            const newSegments = await narrateAllShots(
                shotsToNarrate,
                screenplayScenes,
                narratorConfig,
                (completed, total) => {
                    setProgress({
                        message: `Narrating shot ${completed}/${total}...`,
                        percent: 15 + (total > 0 ? (completed / total) * 70 : 0),
                    });
                },
                sessionId || undefined,
                state.narrationStatus,
                existingNarrations,
            );

            setProgress({ message: 'Uploading audio...', percent: 88 });

            // Process results: create object URLs, optionally upload to cloud
            const updatedShotNarrations: NonNullable<StoryState['shotNarrationSegments']> = [];
            for (const seg of newSegments) {
                let audioUrl = URL.createObjectURL(seg.audioBlob);
                if (sessionId) {
                    const cloudUrl = await cloudAutosave.saveNarrationWithUrl(
                        sessionId,
                        seg.audioBlob,
                        seg.shotId
                    );
                    if (cloudUrl) {
                        log.debug(`Shot narration uploaded to cloud: ${seg.shotId}`);
                        audioUrl = cloudUrl;
                    }
                }
                narrationStatus[seg.shotId] = 'success';
                updatedShotNarrations.push({
                    shotId: seg.shotId,
                    sceneId: seg.sceneId,
                    audioUrl,
                    duration: seg.duration,
                    text: seg.text,
                });
            }

            // Mark failed shots
            const newShotIds = new Set(updatedShotNarrations.map(s => s.shotId));
            for (const shot of shotsToNarrate) {
                if (!newShotIds.has(shot.id)) {
                    narrationStatus[shot.id] = 'failed';
                }
            }

            // Merge with existing (keep previously narrated, replace updated ones)
            const allShotNarrations: NonNullable<StoryState['shotNarrationSegments']> = [
                ...existingNarrations.filter(n => !newShotIds.has(n.shotId)),
                ...updatedShotNarrations,
            ];

            // Build legacy scene-level narrationSegments for backward compat with animateShots()
            const sceneNarrationMap = new Map<string, { audioUrl: string; duration: number; text: string }>();
            for (const seg of allShotNarrations) {
                const existing = sceneNarrationMap.get(seg.sceneId);
                if (existing) {
                    existing.duration += seg.duration;
                    existing.text += ' ' + seg.text;
                } else {
                    sceneNarrationMap.set(seg.sceneId, {
                        audioUrl: seg.audioUrl, // Use first shot's audio for legacy compat
                        duration: seg.duration,
                        text: seg.text,
                    });
                }
            }
            const narrationSegments: NonNullable<StoryState['narrationSegments']> = Array.from(
                sceneNarrationMap.entries()
            ).map(([sceneId, data]) => ({ sceneId, ...data }));

            setProgress({ message: 'Finalizing narration...', percent: 95 });

            pushState({
                ...state,
                shotNarrationSegments: allShotNarrations,
                narrationStatus,
                narrationSegments, // Legacy: for animateShots() fallback
                scenesWithNarration: [...new Set(allShotNarrations.map(n => n.sceneId))],
                currentStep: 'narration',
            });

            setProgress({ message: 'Narration complete!', percent: 100 });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [state, sessionId, pushState]);

    /**
     * Step 7: Animate shots using Veo or DeAPI
     * Converts static storyboard images into animated video clips
     */
    const animateShots = useCallback(async (shotIndex?: number) => {
        if (!state.shotlist || state.shotlist.length === 0) {
            setError('Visuals must be generated before animation');
            return;
        }
        if (!state.narrationSegments || state.narrationSegments.length === 0) {
            setError('Narration must be generated before animating shots');
            return;
        }

        setIsProcessing(true);
        setError(null);

        const isPerShot = shotIndex !== undefined;
        const shotsToAnimate = isPerShot
            ? [state.shotlist[shotIndex]].filter(Boolean)
            : state.shotlist.filter((s: ShotlistEntry) => s.imageUrl);

        if (shotsToAnimate.length === 0) {
            setError('No shots with images to animate');
            setIsProcessing(false);
            return;
        }

        setProgress({
            message: isPerShot
                ? `Animating shot ${shotIndex + 1}...`
                : 'Animating storyboard shots...',
            percent: 10
        });

        try {
            // Build a Map keyed by shotId for O(1) upsert — converted to array before pushState.
            // Using a Map avoids in-place mutation of the accumulated array.
            const animatedShotsMap = new Map<string, AnimatedShot>(
                (state.animatedShots || []).map((a: AnimatedShot) => [a.shotId, a])
            );

            const useDeApi = isDeApiConfigured();

            // Pre-compute per-shot target durations from narration
            const shotTargetDurations = new Map<string, number>();
            if (state.shotNarrationSegments && state.shotNarrationSegments.length > 0) {
                // Exact per-shot durations from per-shot narration (new system)
                state.shotNarrationSegments.forEach(seg => {
                    shotTargetDurations.set(seg.shotId, seg.duration);
                });
            } else if (state.narrationSegments && state.narrationSegments.length > 0) {
                // Legacy fallback: divide scene duration evenly across shots in that scene
                const sceneIds = [...new Set(state.shotlist.map((s: ShotlistEntry) => s.sceneId))];
                for (const sceneId of sceneIds) {
                    const sceneShotIds = state.shotlist.filter((s: ShotlistEntry) => s.sceneId === sceneId).map((s: ShotlistEntry) => s.id);
                    const sceneNarration = state.narrationSegments.find((n: StoryNarrationSegment) => n.sceneId === sceneId);
                    const sceneDur = sceneNarration?.duration || 5;
                    const perShot = sceneDur / Math.max(sceneShotIds.length, 1);
                    for (const sid of sceneShotIds) {
                        shotTargetDurations.set(sid, perShot);
                    }
                }
            }

            let consecutiveFailures = 0;
            const completedShotIds = new Set<string>();

            for (let i = 0; i < shotsToAnimate.length; i++) {
                const shot = shotsToAnimate[i];
                if (!shot || !shot.imageUrl) continue;

                const updateShotProgress = (rawProgress: number, preview?: string) => {
                    const normalized = Number.isFinite(rawProgress)
                        ? Math.max(0, Math.min(1, rawProgress > 1 ? rawProgress / 100 : rawProgress))
                        : 0;

                    setProcessingShots(prev => {
                        const next = new Map(prev);
                        const existing = next.get(shot.id);
                        next.set(shot.id, {
                            progress: normalized,
                            preview: preview ?? existing?.preview,
                        });
                        return next;
                    });
                };

                // Set per-shot progress (Feature 4)
                setProcessingShots(prev => {
                    const next = new Map(prev);
                    next.set(shot.id, { progress: 0 });
                    return next;
                });

                const percent = 10 + ((i + 1) / shotsToAnimate.length) * 80;
                setProgress({
                    message: `Animating shot ${i + 1}/${shotsToAnimate.length}...`,
                    percent
                });

                try {
                    let videoUrl: string;

                    // Normalize aspect ratio to valid values
                    const aspectRatio = (state.aspectRatio === '9:16' ? '9:16' : '16:9') as '16:9' | '9:16';
                    const deapiAspectRatio = (state.aspectRatio === '9:16' ? '9:16' : state.aspectRatio === '1:1' ? '1:1' : '16:9') as '16:9' | '9:16' | '1:1';

                    // Get the StoryShot data for motion strength selection (Issue 4)
                    const storyShot = state.shots?.find((s: StoryShot) => s.id === shot.id);
                    const shotType = storyShot?.shotType || '';
                    const movement = storyShot?.movement || shot.movement || 'Static';

                    // Auto-select motion strength based on shot type (Issue 4)
                    const motionStrength = selectMotionStrength(shotType, movement);
                    const motionConfig = MOTION_CONFIGS[motionStrength];

                    // Build camera-focused animation prompt (Issue 4)
                    const animationPrompt = buildAnimationPrompt(movement, shot.description);

                    if (useDeApi && shot.imageUrl) {
                        // img2video requires a data: URL — convert remote URLs
                        let imageDataUrl = shot.imageUrl;
                        if (!imageDataUrl.startsWith('data:')) {
                            try {
                                const resp = await fetch(imageDataUrl);
                                const blob = await resp.blob();
                                imageDataUrl = await new Promise<string>((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result as string);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(blob);
                                });
                            } catch (fetchErr) {
                                log.warn(`[useStoryGeneration] Failed to fetch image for img2video, falling back to txt2video:`, fetchErr);
                                imageDataUrl = '';
                            }
                        }

                        if (imageDataUrl.startsWith('data:')) {
                            // Optional: Apply style consistency pass (img2img) before animation
                            if (state.applyStyleConsistency) {
                                try {
                                    log.debug(`Applying style consistency pass for shot ${shot.id}...`);
                                    imageDataUrl = await applyStyleConsistency(
                                        imageDataUrl,
                                        animationPrompt,
                                        deapiAspectRatio,
                                    );
                                    log.debug(`Style consistency pass complete for shot ${shot.id}`);
                                } catch (styleErr) {
                                    log.warn(`[useStoryGeneration] Style consistency pass failed (non-fatal), using original image:`, styleErr);
                                }
                            }

                            videoUrl = await animateImageWithDeApi(
                                imageDataUrl,
                                animationPrompt,
                                deapiAspectRatio,
                                sessionId || undefined,
                                i,
                                {
                                    motionStrength,
                                    removeBackground: state.animateWithBgRemoval,
                                    onProgress: updateShotProgress,
                                },
                            );
                        } else {
                            // Fallback to txt2video only if image conversion failed
                            videoUrl = await generateVideoWithDeApi(
                                {
                                    prompt: animationPrompt,
                                    frames: motionConfig.frames,
                                },
                                deapiAspectRatio,
                                sessionId || undefined,
                                i,
                                updateShotProgress,
                            );
                        }
                    } else {
                        videoUrl = await generateVideoFromPrompt(
                            animationPrompt,
                            state.visualStyle || 'Cinematic',
                            '',
                            aspectRatio,
                            6,
                            true,
                            undefined,
                            sessionId || undefined,
                            i
                        );
                    }

                    // Upload to cloud storage for persistence
                    if (sessionId && videoUrl && (videoUrl.startsWith('data:') || videoUrl.startsWith('blob:'))) {
                        const cloudUrl = await cloudAutosave.saveAnimatedVideoWithUrl(sessionId, videoUrl, shot.id);
                        if (cloudUrl) {
                            log.debug(`Animated video uploaded to cloud: ${shot.id}`);
                            videoUrl = cloudUrl;
                        }
                    }

                    // Store with target duration from narration (Issue 6)
                    const targetDuration = shotTargetDurations.get(shot.id) || motionConfig.frames / 30;
                    const animatedShot = {
                        shotId: shot.id,
                        videoUrl,
                        duration: targetDuration,
                    };
                    // Immutable upsert via Map — no array mutation
                    animatedShotsMap.set(shot.id, animatedShot);

                    // Accumulate completed shot ID for batch cleanup (Fix #4)
                    completedShotIds.add(shot.id);
                    consecutiveFailures = 0;
                } catch (err) {
                    log.error(`Failed to animate shot ${shot.id}:`, err);
                    // Accumulate failed shot ID for batch cleanup (Fix #4)
                    completedShotIds.add(shot.id);
                    consecutiveFailures++;
                    if (consecutiveFailures >= ANIMATION_CIRCUIT_BREAKER_THRESHOLD) {
                        log.error('Circuit breaker triggered, aborting animation batch');
                        break;
                    }
                }
            }

            // Batch-clear all completed/failed shot progress in a single setState (Fix #4)
            if (completedShotIds.size > 0) {
                setProcessingShots(prev => {
                    const next = new Map(prev);
                    for (const id of completedShotIds) {
                        next.delete(id);
                    }
                    return next;
                });
            }

            // Materialise the immutable array from the Map accumulator
            const animatedShots = Array.from(animatedShotsMap.values());

            setProgress({ message: 'Finalizing animations...', percent: 95 });

            pushState({
                ...state,
                animatedShots,
                shotsWithAnimation: animatedShots.map((s: AnimatedShot) => s.shotId),
                currentStep: 'animation',
            });

            setProgress({ message: 'Animation complete!', percent: 100 });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
            // Clear all per-shot progress (Feature 4)
            setProcessingShots(new Map());
        }
    }, [state, sessionId, pushState]);

    /**
     * Step 8: Export final video using FFmpeg
     * Combines narration audio, animated shots, and renders final MP4
     */
    const exportFinalVideo = useCallback(async () => {
        if (!state.narrationSegments || state.narrationSegments.length === 0) {
            setError('Narration must be generated before export');
            return;
        }
        const allShotsHaveImages = state.shotlist?.every((s: ShotlistEntry) => s.imageUrl) ?? false;
        if (!allShotsHaveImages) {
            setError('Cannot export: some shots are missing visuals');
            return;
        }

        if (!state.animatedShots || state.animatedShots.length === 0) {
            // Fall back to static images if no animations
            log.warn('No animations, will use static images for export');
        }

        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Preparing video export...', percent: 5 });

        try {
            // Build SongData structure for FFmpeg exporter
            // Safely get narration segments (already validated above)
            const narrationSegs = state.narrationSegments || [];

            // Calculate total duration with fallback for undefined/NaN values
            const totalDuration = narrationSegs.reduce((sum, s) => sum + (s.duration || 0), 0);

            log.debug('Export stats:', {
                narrationSegments: narrationSegs.length,
                totalDuration,
                shotlistLength: state.shotlist.length,
                segmentDurations: narrationSegs.map((s: StoryNarrationSegment) => s.duration),
            });

            // Combine all narration audio segments into a single audio track
            let combinedAudioUrl: string;

            try {
                combinedAudioUrl = await createCombinedNarrationAudio(
                    narrationSegs,
                    (message, percent) => setProgress({ message, percent })
                );
                log.debug(`Combined ${narrationSegs.length} narration segments`);
            } catch (audioErr) {
                log.warn('Failed to combine audio, using first segment:', audioErr);
                combinedAudioUrl = narrationSegs[0]?.audioUrl || '';
            }

            // Narration-aware timestamps: distribute shots proportionally across scenes
            // Each scene's narration duration determines its shots' time slots
            const effectiveDuration = totalDuration > 0 ? totalDuration : state.shotlist.length * 5;

            // Build scene → shots mapping and scene → narration duration mapping
            const sceneIds = [...new Set(state.shotlist.map((s: ShotlistEntry) => s.sceneId))];
            const prompts: Array<{
                id: string;
                text: string;
                mood: string;
                timestamp: string;
                timestampSeconds: number;
            }> = [];
            let accumulatedTime = 0;

            for (const sceneId of sceneIds) {
                const sceneShotlist = state.shotlist.filter((s: ShotlistEntry) => s.sceneId === sceneId);
                // Find narration segment for this scene
                const sceneNarration = narrationSegs.find((n: StoryNarrationSegment) => n.sceneId === sceneId);
                const sceneDuration = sceneNarration?.duration || (effectiveDuration / sceneIds.length);
                const perShotDuration = sceneDuration / Math.max(sceneShotlist.length, 1);

                for (let i = 0; i < sceneShotlist.length; i++) {
                    const shot = sceneShotlist[i]!;
                    const shotTimestamp = accumulatedTime + i * perShotDuration;
                    prompts.push({
                        id: shot.id,
                        text: shot.description,
                        mood: 'cinematic',
                        timestamp: `${Math.floor(shotTimestamp / 60)}:${Math.floor(shotTimestamp % 60).toString().padStart(2, '0')}`,
                        timestampSeconds: shotTimestamp,
                    });
                }
                accumulatedTime += sceneDuration;
            }

            log.debug('Narration-aware shot timing:', {
                effectiveDuration,
                sceneCount: sceneIds.length,
                totalShots: state.shotlist.length,
                firstTs: prompts[0]?.timestampSeconds,
                lastTs: prompts[prompts.length - 1]?.timestampSeconds,
            });

            // Build generatedImages array
            const generatedImages = state.shotlist.map((shot) => {
                const animated = state.animatedShots?.find(a => a.shotId === shot.id);
                return {
                    promptId: shot.id,
                    imageUrl: animated?.videoUrl || shot.imageUrl || '',
                    type: (animated ? 'video' : 'image') as 'video' | 'image',
                };
            });

            // Validate generatedImages have URLs
            const validImages = generatedImages.filter(g => g.imageUrl);
            log.debug('Generated images:', {
                total: generatedImages.length,
                withUrl: validImages.length,
                sample: generatedImages.slice(0, 3).map(g => ({ id: g.promptId, hasUrl: !!g.imageUrl, type: g.type })),
            });

            // Build subtitle items from narration using textSanitizer service
            const parsedSubtitles: { id: string; text: string; startTime: number; endTime: number }[] = [];

            for (let idx = 0; idx < narrationSegs.length; idx++) {
                const seg = narrationSegs[idx]!;
                const segStart = narrationSegs.slice(0, idx).reduce((sum, s) => sum + (s.duration || 0), 0);
                const segDuration = seg.duration || 0;

                const { chunks, minDisplayTime } = cleanForSubtitles(seg.text || '', 80);
                if (chunks.length === 0) continue;

                // Distribute segment duration across chunks, respecting minimum display time
                const rawChunkDuration = chunks.length > 0 ? segDuration / chunks.length : segDuration;
                const chunkDuration = Math.max(rawChunkDuration, minDisplayTime);

                for (let c = 0; c < chunks.length; c++) {
                    parsedSubtitles.push({
                        id: `sub_${idx}_${c}`,
                        text: chunks[c]!,
                        startTime: segStart + c * chunkDuration,
                        endTime: segStart + (c + 1) * chunkDuration,
                    });
                }
            }

            setProgress({ message: 'Building video timeline...', percent: 20 });

            // Build SongData structure matching the expected interface
            const songData = {
                fileName: `${state.script?.title || 'story'}.mp4`,
                audioUrl: combinedAudioUrl,
                srtContent: '', // Not used for story mode
                parsedSubtitles,
                prompts,
                generatedImages,
                durationSeconds: effectiveDuration,
            };

            log.debug('SongData built:', {
                promptCount: prompts.length,
                generatedImagesCount: generatedImages.length,
                durationSeconds: effectiveDuration,
                firstPromptTs: prompts[0]?.timestampSeconds,
                lastPromptTs: prompts[prompts.length - 1]?.timestampSeconds,
            });

            const exportConfig = {
                orientation: (state.aspectRatio === '9:16' ? 'portrait' : 'landscape') as 'portrait' | 'landscape',
                subtitlePosition: 'bottom' as const,
                subtitleSize: 'medium' as const,
                contentMode: 'story' as const,
            };

            const exportResult = await exportVideoWithFFmpeg(
                songData as any,
                (progress) => {
                    setProgress({
                        message: progress.message || 'Rendering video...',
                        percent: progress.progress || 50
                    });
                },
                exportConfig,
                { cloudSessionId: sessionId || undefined }
            );

            // Always use local blob URL for immediate playback reliability in the current session.
            // Cloud URLs can be stored/uploaded for persistence, but preview should not wait on remote availability.
            if (state.finalVideoUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(state.finalVideoUrl);
            }
            const finalVideoUrl = URL.createObjectURL(exportResult.blob);

            pushState({
                ...state,
                finalVideoUrl,
                currentStep: 'export',
            });

            setProgress({ message: 'Export complete!', percent: 100 });

            // Return the blob for download
            return exportResult.blob;
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            return null;
        } finally {
            setIsProcessing(false);
        }
    }, [state, sessionId, pushState]);

    /**
     * Download the final exported video
     */
    const downloadVideo = useCallback(() => {
        if (!state.finalVideoUrl) {
            setError('No video to download. Please export first.');
            return;
        }

        const a = document.createElement('a');
        a.href = state.finalVideoUrl;
        a.download = `${state.script?.title || 'story'}_video.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, [state.finalVideoUrl, state.script?.title]);

    /**
     * Check if all scenes have narration
     */
    const allScenesHaveNarration = useCallback(() => {
        if (!state.scenesWithNarration) return false;
        return state.breakdown.every((s: ScreenplayScene) => state.scenesWithNarration?.includes(s.id));
    }, [state.breakdown, state.scenesWithNarration]);

    /**
     * Check if all shots have animation
     */
    const allShotsHaveAnimation = useCallback(() => {
        if (!state.shotsWithAnimation || !state.shotlist) return false;
        return state.shotlist.every((s: ShotlistEntry) => state.shotsWithAnimation?.includes(s.id));
    }, [state.shotlist, state.shotsWithAnimation]);

    const getStageProgress = useCallback(() => {
        const totalScenes = state.breakdown.length;
        const scenesWithShots = state.scenesWithShots?.length || 0;
        const scenesWithVisuals = state.scenesWithVisuals?.length || 0;

        return {
            totalScenes,
            scenesWithShots,
            scenesWithVisuals,
            shotsComplete: totalScenes > 0 && scenesWithShots >= totalScenes,
            visualsComplete: totalScenes > 0 && scenesWithVisuals >= totalScenes,
        };
    }, [state.breakdown.length, state.scenesWithShots, state.scenesWithVisuals]);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const retryLastOperation = useCallback(() => {
        setError(null);
    }, []);

    const hasRecoveredSession = Boolean(sessionId);

    /**
     * Load a story from Firestore by session ID
     */
    const loadFromCloud = useCallback(async (cloudSessionId: string): Promise<boolean> => {
        setIsProcessing(true);
        setProgress({ message: 'Loading story from cloud...', percent: 50 });

        try {
            const cloudState = await loadStoryFromCloud(cloudSessionId);
            if (!cloudState) {
                setError('Story not found in cloud');
                return false;
            }

            setSessionId(cloudSessionId);
            await cloudAutosave.initSession(cloudSessionId);

            pushState(cloudState);
            setProgress({ message: 'Story loaded', percent: 100 });
            log.debug(`Loaded story ${cloudSessionId} from cloud`);
            return true;
        } catch (err) {
            log.error('Failed to load from cloud:', err);
            setError('Failed to load story from cloud');
            return false;
        } finally {
            setIsProcessing(false);
        }
    }, [pushState]);

    /**
     * Save current state to cloud immediately (flush pending debounced saves)
     */
    const saveToCloud = useCallback(async (): Promise<boolean> => {
        if (!sessionId || !isSyncAvailable()) {
            return false;
        }
        await flushPendingSave(sessionId, state, topic || undefined);
        return true;
    }, [sessionId, state, topic]);

    /**
     * Apply a template to the current story state
     */
    const applyTemplate = useCallback((templateState: Partial<StoryState>) => {
        log.debug('Applying template:', templateState);
        pushState({
            ...state,
            ...templateState,
        });
    }, [state, pushState]);

    /**
     * Import a complete project state (e.g., from JSON file or version history)
     */
    const importProject = useCallback((importedState: StoryState, options?: {
        sessionId?: string | null;
        topic?: string | null;
    }) => {
        log.debug('Importing project state');
        setPast([]);
        setFuture([]);
        setError(null);
        setState(importedState);

        const nextTopic = options?.topic ?? topic;
        setTopic(nextTopic ?? null);

        if (options?.sessionId !== undefined) {
            if (options.sessionId) {
                setSessionId(options.sessionId);
                const currentUser = getCurrentUser();
                if (currentUser) {
                    localStorage.setItem(USER_ID_KEY, currentUser.uid);
                }
                cloudAutosave.initSession(options.sessionId, currentUser?.uid).then(success => {
                    if (success) {
                        log.debug('Cloud storage initialized for imported session');
                    }
                });
                storyModeStore.set(options.sessionId, buildStoryModeState(options.sessionId, importedState, nextTopic));
            } else {
                setSessionId(null);
                localStorage.removeItem(SESSION_KEY);
            }
        } else if (sessionId) {
            storyModeStore.set(sessionId, buildStoryModeState(sessionId, importedState, nextTopic));
        }
    }, [sessionId, topic]);

    return {
        state,
        sessionId,
        isProcessing,
        error,
        progress,
        processingShots,
        generateBreakdown,
        generateScreenplay,
        generateCharacters,
        generateCharacterImage,
        generateShotlist,
        verifyConsistency,
        regenerateScene,
        setStep,
        updateBreakdown,
        updateScript,
        resetStory,
        exportScreenplay,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        lockStory,
        updateVisualStyle,
        updateAspectRatio,
        updateGenre,
        updateImageProvider,
        updateDeapiImageModel,
        updateStyleConsistency,
        updateBgRemoval,
        updateTtsSettings,
        generateShots,
        generateVisuals,
        regenerateShotVisual,
        updateShot,
        reorderShots,
        generateNarration,
        animateShots,
        exportFinalVideo,
        downloadVideo,
        allScenesHaveShots,
        allScenesHaveVisuals,
        allScenesHaveNarration,
        allShotsHaveAnimation,
        getStageProgress,
        clearError,
        retryLastOperation,
        hasRecoveredSession,
        loadFromCloud,
        saveToCloud,
        isSyncAvailable: isSyncAvailable(),
        applyTemplate,
        importProject,
    };
}
