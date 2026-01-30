/**
 * useStoryGeneration Hook
 *
 * Manages the state and transition logic for the Story Mode workflow.
 * Workflow: Idea (Topic) → Breakdown → Screenplay → Characters → Shotlist → Narration → Animation → Export
 */

import { useState, useCallback, useEffect } from 'react';
import type {
    StoryStep,
    StoryState,
    ScreenplayScene,
    CharacterProfile,
    ShotlistEntry,
    ConsistencyReport,
    StoryShot,
    Scene
} from '@/types';
import { runProductionAgent } from '@/services/ai/productionAgent';
import { breakAllScenesIntoShots, type Shot } from '@/services/ai/shotBreakdownAgent';
import { storyModeStore } from '@/services/ai/production/store';
import { narrateScene, createAudioUrl, type NarratorConfig } from '@/services/narratorService';
import { generateVideoFromPrompt } from '@/services/videoService';
import { animateImageWithDeApi, isDeApiConfigured } from '@/services/deapiService';
import { exportVideoWithFFmpeg } from '@/services/ffmpeg/exporters';

const STORAGE_KEY = 'lyriclens_story_state';
const SESSION_KEY = 'lyriclens_story_session';

/**
 * Strip base64 image/audio/video data from state before saving to localStorage.
 * Media is saved to cloud storage separately, so we only need metadata for recovery.
 * This prevents QuotaExceededError when state contains many generated assets.
 */
function stripImageDataForStorage(state: StoryState): StoryState {
    const isBase64 = (url?: string) => url?.startsWith('data:');
    const isBlobUrl = (url?: string) => url?.startsWith('blob:');
    const shouldStrip = (url?: string) => isBase64(url) || isBlobUrl(url);

    return {
        ...state,
        characters: state.characters.map(char => ({
            ...char,
            // Keep URL if it's a cloud/remote URL, remove if base64/blob
            referenceImageUrl: shouldStrip(char.referenceImageUrl) ? undefined : char.referenceImageUrl,
        })),
        shotlist: state.shotlist.map(shot => ({
            ...shot,
            imageUrl: shouldStrip(shot.imageUrl) ? undefined : shot.imageUrl,
        })),
        shots: state.shots?.map(shot => ({
            ...shot,
            imageUrl: shouldStrip(shot.imageUrl) ? undefined : shot.imageUrl,
        })),
        // Strip blob URLs from narration (audio)
        narrationSegments: state.narrationSegments?.map(seg => ({
            ...seg,
            audioUrl: shouldStrip(seg.audioUrl) ? '' : seg.audioUrl,
        })),
        // Strip blob URLs from animated shots (video)
        animatedShots: state.animatedShots?.map(shot => ({
            ...shot,
            videoUrl: shouldStrip(shot.videoUrl) ? '' : shot.videoUrl,
            thumbnailUrl: shouldStrip(shot.thumbnailUrl) ? undefined : shot.thumbnailUrl,
        })),
        // Don't save final video URL (too large)
        finalVideoUrl: undefined,
    };
}

/**
 * Parse AI-generated breakdown text into structured ScreenplayScene objects.
 * Handles various formats: "Act 1:", "Chapter 1:", "Scene 1:", numbered lists, etc.
 */
function parseBreakdownToScenes(breakdownText: string, topic: string): ScreenplayScene[] {
    const scenes: ScreenplayScene[] = [];

    // Try to split by common patterns: Act, Chapter, Scene, or numbered sections
    const patterns = [
        /(?:Act|Chapter|Scene|Part)\s*\d+[:\.]?\s*/gi,
        /(?:^\d+[\.\)]\s*)/gm,
        /(?:\n\n+)/g, // Double newlines as fallback
    ];

    let sections: string[] = [];

    // Try each pattern until we get reasonable sections
    for (const pattern of patterns) {
        sections = breakdownText.split(pattern).filter(s => s.trim().length > 20);
        if (sections.length >= 2 && sections.length <= 10) break;
    }

    // If no good split found, treat whole text as one section
    if (sections.length < 2) {
        sections = [breakdownText];
    }

    sections.forEach((section, index) => {
        const lines = section.trim().split('\n').filter(l => l.trim());
        if (lines.length === 0) return;

        // Extract title from first line or generate one
        let title = lines[0]?.replace(/^[\*\-\#\d\.\)]+\s*/, '').trim() || `Scene ${index + 1}`;
        // Clean up title - remove markdown, limit length
        title = title.replace(/[\*\_\#]/g, '').substring(0, 100);

        // Rest of lines become the action/description
        const actionLines = lines.slice(1).join(' ').trim();

        scenes.push({
            id: `scene_${index}`,
            sceneNumber: index + 1,
            heading: title,
            action: actionLines || `Scene from: ${topic}`,
            dialogue: [],
            charactersPresent: [],
        });
    });

    // Ensure we have at least one scene
    if (scenes.length === 0) {
        scenes.push({
            id: 'scene_0',
            sceneNumber: 1,
            heading: 'Opening',
            action: breakdownText.substring(0, 500),
            dialogue: [],
            charactersPresent: [],
        });
    }

    return scenes;
}

interface StoryAgentResult {
    sessionId?: string;
    scenes?: ScreenplayScene[];
    screenplay?: { title: string; scenes: ScreenplayScene[] };
    characters?: CharacterProfile[];
    shots?: ShotlistEntry[];
    report?: ConsistencyReport;
    [key: string]: unknown;
}

export function useStoryGeneration() {
    const [state, setState] = useState<StoryState>({
        currentStep: 'idea',
        breakdown: [],
        script: null,
        characters: [],
        shotlist: [],
    });

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ message: string; percent: number }>({
        message: '',
        percent: 0
    });

    // History for Undo/Redo
    const [past, setPast] = useState<StoryState[]>([]);
    const [future, setFuture] = useState<StoryState[]>([]);

    /**
     * Helper to push a new state to history
     */
    const pushState = useCallback((newState: StoryState) => {
        setPast(prev => {
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
        setFuture(prev => [state, ...prev]);
        setState(previous);
    }, [past, state]);

    const redo = useCallback(() => {
        if (future.length === 0) return;

        const next = future[0];
        if (!next) return;

        const newFuture = future.slice(1);

        setFuture(newFuture);
        setPast(prev => [...prev, state]);
        setState(next);
    }, [future, state]);

    // Load state from localStorage on mount
    useEffect(() => {
        const savedState = localStorage.getItem(STORAGE_KEY);
        const savedSession = localStorage.getItem(SESSION_KEY);

        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                setState(parsed);
                console.log('[useStoryGeneration] Recovered story state');
            } catch (e) {
                console.error('Failed to parse saved story state', e);
            }
        }

        if (savedSession) {
            setSessionId(savedSession);
        }
    }, []);

    // Save state to localStorage on change (strip base64 images to avoid quota errors)
    useEffect(() => {
        if (state.currentStep !== 'idea') {
            try {
                const stateForStorage = stripImageDataForStorage(state);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(stateForStorage));
            } catch (err) {
                // QuotaExceededError - log but don't crash
                console.warn('[useStoryGeneration] Failed to save state to localStorage:', err);
            }
        }
        if (sessionId) {
            localStorage.setItem(SESSION_KEY, sessionId);
        }
    }, [state, sessionId]);

    /**
     * Step 1: Generate Breakdown
     */
    const generateBreakdown = useCallback(async (topic: string, genre: string) => {
        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Generating story breakdown...', percent: 20 });

        try {
            const prompt = `Use the generate_breakdown tool to create a ${genre} story about ${topic}. Return exactly 6 scenes.`;
            await runProductionAgent(prompt, (progress) => {
                setProgress({ message: progress.message, percent: progress.isComplete ? 100 : 50 });
            });

            // Find the session from storyModeStore (the tool creates sessions with story_ prefix)
            let foundSessionId: string | null = null;
            let foundState = null;

            // Get the most recently created story session
            for (const [sid, storyState] of storyModeStore.entries()) {
                if (storyState.topic === topic || sid.startsWith('story_')) {
                    foundSessionId = sid;
                    foundState = storyState;
                }
            }

            if (foundSessionId && foundState && foundState.breakdown) {
                setSessionId(foundSessionId);

                // Parse the breakdown text into scenes
                const breakdownText = foundState.breakdown;
                const scenes: ScreenplayScene[] = parseBreakdownToScenes(breakdownText, topic);

                console.log('[useStoryGeneration] Breakdown parsed into scenes:', scenes.length);

                setState(prev => ({
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
            const prompt = `Using sessionId ${sessionId}, call regenerate_scene_breakdown for scene ${sceneNumber} with feedback: ${feedback}`;
            const result = await runProductionAgent(prompt, (p) => {
                setProgress({ message: p.message, percent: p.isComplete ? 100 : 50 });
            });

            if (result && (result as unknown as StoryAgentResult).scenes) {
                setState(prev => ({
                    ...prev,
                    breakdown: (result as unknown as StoryAgentResult).scenes || prev.breakdown
                }));
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
            const prompt = `Using sessionId ${sessionId}, call create_screenplay with the current breakdown.`;
            await runProductionAgent(prompt, (progress) => {
                setProgress({ message: progress.message, percent: progress.isComplete ? 100 : 60 });
            });

            // Fetch the screenplay from storyModeStore
            const storyState = storyModeStore.get(sessionId);
            if (storyState && storyState.screenplay && storyState.screenplay.length > 0) {
                console.log('[useStoryGeneration] Screenplay retrieved:', storyState.screenplay.length, 'scenes');

                // Build script object from screenplay scenes
                const script = {
                    title: state.breakdown[0]?.heading || 'Untitled Story',
                    scenes: storyState.screenplay,
                };

                setState(prev => ({
                    ...prev,
                    currentStep: 'script',
                    script,
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
        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Extracting and visualizing characters...', percent: 60 });

        try {
            const prompt = `Using sessionId ${sessionId}, call generate_characters for the current script.`;
            await runProductionAgent(prompt, (progress) => {
                setProgress({ message: progress.message, percent: progress.isComplete ? 100 : 75 });
            });

            // Fetch the characters from storyModeStore
            const storyState = storyModeStore.get(sessionId);
            if (storyState && storyState.characters && storyState.characters.length > 0) {
                console.log('[useStoryGeneration] Characters retrieved:', storyState.characters.length);

                setState(prev => ({
                    ...prev,
                    currentStep: 'characters',
                    characters: storyState.characters,
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
     * Step 4: Generate Shotlist
     */
    const generateShotlist = useCallback(async () => {
        if (!sessionId) return;
        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Creating technical shotlist/storyboard...', percent: 80 });

        try {
            const prompt = `Using sessionId ${sessionId}, call generate_shotlist for the current screenplay.`;
            await runProductionAgent(prompt, (progress) => {
                setProgress({ message: progress.message, percent: progress.isComplete ? 100 : 90 });
            });

            // Fetch the shotlist from storyModeStore
            const storyState = storyModeStore.get(sessionId);
            if (storyState && storyState.shotlist && storyState.shotlist.length > 0) {
                console.log('[useStoryGeneration] Shotlist retrieved:', storyState.shotlist.length, 'shots');

                setState(prev => ({
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
        setState(prev => ({ ...prev, currentStep: step }));
    };

    const updateBreakdown = (scenes: ScreenplayScene[]) => {
        pushState({ ...state, breakdown: scenes });
    };

    const updateScript = (script: { title: string; scenes: ScreenplayScene[] }) => {
        pushState({ ...state, script });
    };

    const resetStory = useCallback(() => {
        setState({
            currentStep: 'idea',
            breakdown: [],
            script: null,
            characters: [],
            shotlist: [],
        });
        setSessionId(null);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SESSION_KEY);
    }, []);

    const exportScreenplay = useCallback(() => {
        if (!state.script) return;

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
            const prompt = `Using sessionId ${sessionId}, verify consistency for character ${characterName}`;
            const result = await runProductionAgent(prompt, (p) => {
                setProgress({ message: p.message, percent: p.isComplete ? 100 : 95 });
            });

            if (result && (result as any).report) {
                const report = (result as any).report as ConsistencyReport;
                setState(prev => ({
                    ...prev,
                    consistencyReports: {
                        ...(prev.consistencyReports || {}),
                        [characterName]: report
                    }
                }));
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

            const newShots = await breakAllScenesIntoShots(
                scenesToProcess,
                genre,
                (sceneIdx, totalScenes) => {
                    const percent = 10 + ((sceneIdx + 1) / totalScenes) * 80;
                    setProgress({
                        message: `Processing scene ${sceneIdx + 1} of ${totalScenes}...`,
                        percent
                    });
                }
            );

            // Convert Shot[] to StoryShot[]
            const storyShots: StoryShot[] = newShots.map(shot => ({
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
                    scenesWithShots: state.breakdown.map(s => s.id),
                });
            }

            setProgress({ message: 'Complete!', percent: 100 });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [state, pushState]);

    /**
     * Update Visual Style
     */
    const updateVisualStyle = useCallback((style: string) => {
        setState(prev => ({
            ...prev,
            visualStyle: style,
        }));
    }, []);

    /**
     * Update Aspect Ratio
     */
    const updateAspectRatio = useCallback((ratio: string) => {
        setState(prev => ({
            ...prev,
            aspectRatio: ratio,
        }));
    }, []);

    /**
     * Update Genre
     */
    const updateGenre = useCallback((genre: string) => {
        setState(prev => ({
            ...prev,
            genre,
        }));
    }, []);

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

        setIsProcessing(true);
        setError(null);

        const isPerScene = sceneIndex !== undefined;
        const targetSceneId = isPerScene ? state.breakdown[sceneIndex]?.id : null;

        // Filter shots for the target scene(s)
        const shotsToProcess = isPerScene
            ? state.shots.filter(s => s.sceneId === targetSceneId)
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
            const { generateImageFromPrompt } = await import('@/services/imageService');

            const updatedShotlist: ShotlistEntry[] = [...state.shotlist];
            const style = state.visualStyle || 'Cinematic';

            for (let i = 0; i < shotsToProcess.length; i++) {
                const shot = shotsToProcess[i];
                if (!shot) continue;

                const percent = 10 + ((i + 1) / shotsToProcess.length) * 80;
                setProgress({
                    message: `Generating visual ${i + 1} of ${shotsToProcess.length}...`,
                    percent
                });

                try {
                    // Build prompt with shot details
                    const prompt = `${shot.description}. ${shot.shotType} shot, ${shot.cameraAngle} angle, ${shot.lighting} lighting. ${shot.emotion} mood. ${style} style.`;

                    const imageUrl = await generateImageFromPrompt(
                        prompt,
                        style,
                        '',
                        state.aspectRatio || '16:9',
                        false,
                        undefined,
                        sessionId || undefined,
                        i
                    );

                    // Find or create shotlist entry
                    const existingIdx = updatedShotlist.findIndex(s => s.id === shot.id);
                    const shotlistEntry: ShotlistEntry = {
                        id: shot.id,
                        sceneId: shot.sceneId,
                        shotNumber: shot.shotNumber,
                        description: shot.description,
                        cameraAngle: shot.cameraAngle,
                        movement: shot.movement,
                        lighting: shot.lighting,
                        dialogue: '',
                        imageUrl,
                    };

                    if (existingIdx >= 0) {
                        updatedShotlist[existingIdx] = shotlistEntry;
                    } else {
                        updatedShotlist.push(shotlistEntry);
                    }
                } catch (err) {
                    console.error(`Failed to generate visual for shot ${shot.shotNumber}:`, err);
                    // Continue with other shots
                }
            }

            setProgress({ message: 'Finalizing...', percent: 95 });

            // Update scenes with visuals tracking
            const newScenesWithVisuals = isPerScene && targetSceneId
                ? [...(state.scenesWithVisuals || []), targetSceneId].filter((v, i, a) => a.indexOf(v) === i)
                : state.breakdown.map(s => s.id);

            pushState({
                ...state,
                shotlist: updatedShotlist,
                currentStep: 'storyboard',
                scenesWithVisuals: newScenesWithVisuals,
            });

            setProgress({ message: 'Complete!', percent: 100 });
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
        return state.breakdown.every(s => state.scenesWithShots?.includes(s.id));
    }, [state.breakdown, state.scenesWithShots]);

    /**
     * Check if all scenes have visuals generated
     */
    const allScenesHaveVisuals = useCallback(() => {
        if (!state.scenesWithVisuals) return false;
        return state.breakdown.every(s => state.scenesWithVisuals?.includes(s.id));
    }, [state.breakdown, state.scenesWithVisuals]);

    /**
     * Get progress info for current stage
     */
    const getStageProgress = useCallback(() => {
        const totalScenes = state.breakdown.length;
        const scenesWithShots = state.scenesWithShots?.length || 0;
        const scenesWithVisuals = state.scenesWithVisuals?.length || 0;

        return {
            totalScenes,
            scenesWithShots,
            scenesWithVisuals,
            shotsComplete: scenesWithShots >= totalScenes,
            visualsComplete: scenesWithVisuals >= totalScenes,
        };
    }, [state.breakdown, state.scenesWithShots, state.scenesWithVisuals]);

    /**
     * Clear any error state
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    /**
     * Check if we have a recovered session (from page refresh)
     */
    const hasRecoveredSession = useCallback(() => {
        return state.currentStep !== 'idea' && state.breakdown.length > 0;
    }, [state.currentStep, state.breakdown.length]);

    /**
     * Retry the last failed operation based on current step
     */
    const retryLastOperation = useCallback(async () => {
        clearError();
        switch (state.currentStep) {
            case 'breakdown':
                // Cannot retry breakdown without topic
                break;
            case 'script':
                await generateScreenplay();
                break;
            case 'characters':
                await generateCharacters();
                break;
            case 'shots':
                await generateShots();
                break;
            case 'storyboard':
                await generateVisuals();
                break;
            default:
                break;
        }
    }, [state.currentStep, clearError, generateScreenplay, generateCharacters, generateShots, generateVisuals]);

    /**
     * Step 6: Generate narration (TTS) for all scenes
     * Uses Gemini TTS to create voiceover for each scene's action/dialogue
     */
    const generateNarration = useCallback(async () => {
        if (!state.shotlist || state.shotlist.length === 0) {
            setError('Visuals must be generated before creating narration');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Generating narration...', percent: 10 });

        try {
            const narrationSegments: NonNullable<StoryState['narrationSegments']> = [];

            // Convert screenplay scenes to Scene format for narrator
            const scenesForNarration: Scene[] = state.breakdown.map((scene) => ({
                id: scene.id,
                name: scene.heading,
                duration: 8, // Default duration, will be adjusted by TTS
                visualDescription: scene.action,
                narrationScript: scene.action,
                emotionalTone: 'dramatic' as const,
            }));

            const narratorConfig: NarratorConfig = {
                videoPurpose: 'storytelling',
                language: 'ar', // Arabic based on the story content
            };

            for (let i = 0; i < scenesForNarration.length; i++) {
                const scene = scenesForNarration[i];
                if (!scene) continue;

                setProgress({
                    message: `Generating narration ${i + 1}/${scenesForNarration.length}...`,
                    percent: 10 + ((i + 1) / scenesForNarration.length) * 60
                });

                try {
                    const segment = await narrateScene(scene, narratorConfig, sessionId || undefined);

                    if (segment && segment.audioBlob) {
                        const audioUrl = createAudioUrl(segment);
                        narrationSegments.push({
                            sceneId: scene.id,
                            audioUrl,
                            duration: segment.audioDuration,
                            text: segment.transcript,
                        });
                    }
                } catch (err) {
                    console.error(`Failed to generate narration for scene ${i + 1}:`, err);
                }
            }

            setProgress({ message: 'Finalizing narration...', percent: 95 });

            pushState({
                ...state,
                narrationSegments,
                scenesWithNarration: narrationSegments.map(s => s.sceneId),
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

        setIsProcessing(true);
        setError(null);

        const isPerShot = shotIndex !== undefined;
        const shotsToAnimate = isPerShot
            ? [state.shotlist[shotIndex]].filter(Boolean)
            : state.shotlist.filter(s => s.imageUrl);

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
            const animatedShots: StoryState['animatedShots'] = [
                ...(state.animatedShots || [])
            ];

            const useDeApi = isDeApiConfigured();

            for (let i = 0; i < shotsToAnimate.length; i++) {
                const shot = shotsToAnimate[i];
                if (!shot || !shot.imageUrl) continue;

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

                    if (useDeApi && shot.imageUrl.startsWith('data:')) {
                        // Use DeAPI to animate the image
                        const base64 = shot.imageUrl.split(',')[1] || shot.imageUrl;
                        videoUrl = await animateImageWithDeApi(
                            base64,
                            shot.description,
                            deapiAspectRatio
                        );
                    } else {
                        // Use Veo to generate video from description
                        videoUrl = await generateVideoFromPrompt(
                            `${shot.description}. ${shot.cameraAngle} shot, ${shot.movement} camera movement, ${shot.lighting} lighting.`,
                            state.visualStyle || 'Cinematic',
                            '',
                            aspectRatio,
                            6, // 6 second clips
                            true, // Use fast model
                            undefined,
                            sessionId || undefined,
                            i
                        );
                    }

                    // Find existing or add new
                    const existingIdx = animatedShots.findIndex(a => a.shotId === shot.id);
                    const animatedShot = {
                        shotId: shot.id,
                        videoUrl,
                        duration: 6,
                    };

                    if (existingIdx >= 0) {
                        animatedShots[existingIdx] = animatedShot;
                    } else {
                        animatedShots.push(animatedShot);
                    }
                } catch (err) {
                    console.error(`Failed to animate shot ${shot.id}:`, err);
                }
            }

            setProgress({ message: 'Finalizing animations...', percent: 95 });

            pushState({
                ...state,
                animatedShots,
                shotsWithAnimation: animatedShots.map(s => s.shotId),
                currentStep: 'animation',
            });

            setProgress({ message: 'Animation complete!', percent: 100 });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
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

        if (!state.animatedShots || state.animatedShots.length === 0) {
            // Fall back to static images if no animations
            console.warn('[useStoryGeneration] No animations, will use static images for export');
        }

        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Preparing video export...', percent: 5 });

        try {
            // Build SongData structure for FFmpeg exporter
            // Safely get narration segments (already validated above)
            const narrationSegs = state.narrationSegments || [];

            const songData = {
                id: sessionId || `story_${Date.now()}`,
                title: state.script?.title || 'Untitled Story',
                // Combine all narration audio (first segment for now, should be merged)
                audioUrl: narrationSegs[0]?.audioUrl || '',
                duration: narrationSegs.reduce((sum, s) => sum + s.duration, 0),
                // Map shots to images/videos
                images: state.shotlist.map((shot) => {
                    const animated = state.animatedShots?.find(a => a.shotId === shot.id);
                    return {
                        promptId: shot.id,
                        imageUrl: animated?.videoUrl || shot.imageUrl || '',
                        type: animated ? 'video' as const : 'image' as const,
                    };
                }),
                // Create subtitle segments from narration
                subtitles: narrationSegs.map((seg, idx) => ({
                    id: `sub_${idx}`,
                    text: seg.text,
                    startTime: narrationSegs.slice(0, idx).reduce((sum, s) => sum + s.duration, 0),
                    endTime: narrationSegs.slice(0, idx + 1).reduce((sum, s) => sum + s.duration, 0),
                })),
            };

            const exportConfig = {
                orientation: (state.aspectRatio === '9:16' ? 'portrait' : 'landscape') as 'portrait' | 'landscape',
                subtitlePosition: 'bottom' as const,
                subtitleSize: 'medium' as const,
            };

            const videoBlob = await exportVideoWithFFmpeg(
                songData as any,
                (progress) => {
                    setProgress({
                        message: progress.message || 'Rendering video...',
                        percent: progress.progress || 50
                    });
                },
                exportConfig,
                sessionId || undefined
            );

            // Create URL for the final video
            const finalVideoUrl = URL.createObjectURL(videoBlob);

            pushState({
                ...state,
                finalVideoUrl,
                currentStep: 'export',
            });

            setProgress({ message: 'Export complete!', percent: 100 });

            // Return the blob for download
            return videoBlob;
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
        return state.breakdown.every(s => state.scenesWithNarration?.includes(s.id));
    }, [state.breakdown, state.scenesWithNarration]);

    /**
     * Check if all shots have animation
     */
    const allShotsHaveAnimation = useCallback(() => {
        if (!state.shotsWithAnimation || !state.shotlist) return false;
        return state.shotlist.every(s => state.shotsWithAnimation?.includes(s.id));
    }, [state.shotlist, state.shotsWithAnimation]);

    return {
        state,
        sessionId,
        isProcessing,
        error,
        progress,
        generateBreakdown,
        generateScreenplay,
        generateCharacters,
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
        // Storyboarder.ai-style workflow functions
        lockStory,
        updateVisualStyle,
        updateAspectRatio,
        updateGenre,
        // New step-by-step generation methods
        generateShots,
        generateVisuals,
        // Narration, Animation, and Export methods
        generateNarration,
        animateShots,
        exportFinalVideo,
        downloadVideo,
        // Progress tracking helpers
        allScenesHaveShots,
        allScenesHaveVisuals,
        allScenesHaveNarration,
        allShotsHaveAnimation,
        getStageProgress,
        // Error handling
        clearError,
        retryLastOperation,
        hasRecoveredSession,
    };
}
