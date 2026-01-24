/**
 * useStoryGeneration Hook
 * 
 * Manages the state and transition logic for the Story Mode workflow.
 * Workflow: Idea (Topic) → Breakdown → Screenplay → Characters → Shotlist → Production
 */

import { useState, useCallback, useEffect } from 'react';
import type {
    StoryStep,
    StoryState,
    ScreenplayScene,
    CharacterProfile,
    ShotlistEntry,
    ConsistencyReport
} from '@/types';
import { runProductionAgent } from '@/services/ai/productionAgent';

const STORAGE_KEY = 'lyriclens_story_state';
const SESSION_KEY = 'lyriclens_story_session';

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

    // Save state to localStorage on change
    useEffect(() => {
        if (state.currentStep !== 'idea') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
            const result = await runProductionAgent(prompt, (progress) => {
                setProgress({ message: progress.message, percent: progress.isComplete ? 100 : 50 });
            });

            if (result) {
                // We need to get the sessionId from the agent's tool call result
                // For now, we'll assume the agent tells us the sessionId in the message or we extract it
                const sid = (result as unknown as StoryAgentResult).sessionId || `story_${Date.now()}`;
                setSessionId(sid);

                // In a real implementation, we'd fetch the breakdown from the store
                // For this demo/first pass, we'll use the result if returned, or placeholder
                setState(prev => ({
                    ...prev,
                    currentStep: 'breakdown',
                    breakdown: (result as unknown as StoryAgentResult).scenes || []
                }));
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
            const result = await runProductionAgent(prompt, (progress) => {
                setProgress({ message: progress.message, percent: progress.isComplete ? 100 : 60 });
            });

            if (result) {
                setState(prev => ({
                    ...prev,
                    currentStep: 'script',
                    script: (result as unknown as StoryAgentResult).screenplay || null
                }));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [sessionId]);

    /**
     * Step 3: Extract Characters
     */
    const generateCharacters = useCallback(async () => {
        if (!sessionId || !state.script) return;
        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Extracting and visualizing characters...', percent: 60 });

        try {
            const prompt = `Using sessionId ${sessionId}, call generate_characters for the current script.`;
            const result = await runProductionAgent(prompt, (progress) => {
                setProgress({ message: progress.message, percent: progress.isComplete ? 100 : 75 });
            });

            if (result) {
                setState(prev => ({
                    ...prev,
                    currentStep: 'characters',
                    characters: (result as unknown as StoryAgentResult).characters || []
                }));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [sessionId, state.script]);

    /**
     * Step 4: Generate Shotlist
     */
    const generateShotlist = useCallback(async () => {
        if (!sessionId || !state.script) return;
        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Creating technical shotlist/storyboard...', percent: 80 });

        try {
            const prompt = `Using sessionId ${sessionId}, call generate_shotlist for the current screenplay.`;
            const result = await runProductionAgent(prompt, (progress) => {
                setProgress({ message: progress.message, percent: progress.isComplete ? 100 : 90 });
            });

            if (result) {
                setState(prev => ({
                    ...prev,
                    currentStep: 'storyboard',
                    shotlist: (result as unknown as StoryAgentResult).shots || []
                }));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsProcessing(false);
        }
    }, [sessionId, state.script]);

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
    };
}
