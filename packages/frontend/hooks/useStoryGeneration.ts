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
import { breakAllScenesIntoShots } from '@/services/ai/shotBreakdownAgent';
import { storyModeStore } from '@/services/ai/production/store';
import type { StoryModeState } from '@/services/ai/production/types';
import { narrateScene, narrateAllShots, createAudioUrl, type NarratorConfig } from '@/services/narratorService';
import { generateVideoFromPrompt } from '@/services/videoService';
import { animateImageWithDeApi, generateVideoWithDeApi, isDeApiConfigured, generateImageWithAspectRatio, generateImageBatch } from '@/services/deapiService';
import { exportVideoWithFFmpeg } from '@/services/ffmpeg/exporters';
import { generateCharacterReference, enrichCharactersWithCoreAnchors } from '@/services/characterService';
import { cloudAutosave } from '@/services/cloudStorageService';
import { createCombinedNarrationAudio } from '@/services/audioConcatService';
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
    type ExtractedStyleOverride,
} from '@/services/prompt/imageStyleGuide';
import { getSystemPersona } from '@/services/prompt/personaData';
import type { VideoPurpose } from '@/constants';
import {
    extractVisualStyle,
    type VisualStyle,
} from '@/services/visualConsistencyService';
import { getCharacterSeed } from '@/services/imageService';
import { cleanForTTS, cleanForSubtitles } from '@/services/textSanitizer';
import { generateVoiceoverScripts } from '@/services/ai/storyPipeline';
import { detectLanguage } from '@/services/languageDetector';

/**
 * Generate anti-style negative prompts based on chosen visual style.
 * Prevents style contamination (e.g., cinematic shots appearing as 3D renders).
 */
function generateNegativePromptsForStyle(style: string): string[] {
    const lower = style.toLowerCase();
    const base = ["watermark", "text overlay", "UI elements", "blurry", "low resolution"];

    const styleNegatives: Record<string, string[]> = {
        cinematic: ["3D render", "stock photo", "cartoon", "flat lighting", "anime", "pixel art"],
        "anime / manga": ["photorealistic", "3D render", "stock photo", "film grain"],
        cyberpunk: ["pastoral", "bright daylight", "cartoon", "watercolor"],
        watercolor: ["photorealistic", "3D render", "sharp edges", "neon"],
        "oil painting": ["photorealistic", "digital art", "flat colors", "anime"],
        "pixel art": ["photorealistic", "smooth gradients", "film grain"],
        photorealistic: ["cartoon", "anime", "pixel art", "painting", "illustration"],
        "dark fantasy": ["bright colors", "cartoon", "modern setting", "clean"],
        "comic book": ["photorealistic", "film grain", "watercolor", "muted colors"],
    };

    return [...base, ...(styleNegatives[lower] || styleNegatives["cinematic"]!)];
}

/** Motion strength configuration for DeAPI animation (Issue 4) */
type MotionStrength = 'subtle' | 'moderate' | 'dynamic';

const MOTION_CONFIGS: Record<MotionStrength, { frames: number; promptPrefix: string }> = {
    subtle: { frames: 60, promptPrefix: "Slow gentle camera movement. Minimal subject motion." },
    moderate: { frames: 90, promptPrefix: "Smooth camera movement. Subtle subject motion." },
    dynamic: { frames: 120, promptPrefix: "Dynamic camera movement." },
};

/** Auto-select motion strength based on shot type and camera movement (Issue 4) */
function selectMotionStrength(shotType: string, movement: string): MotionStrength {
    const type = shotType.toLowerCase();
    const mov = movement.toLowerCase();

    // Close-ups use subtle to prevent face distortion
    if (type.includes('close-up') || type.includes('extreme close')) return 'subtle';
    // Static shots use subtle
    if (mov === 'static') return 'subtle';
    // Tracking/handheld use dynamic
    if (mov === 'tracking' || mov === 'handheld') return 'dynamic';
    // Pan/tilt/dolly/zoom use moderate
    return 'moderate';
}

/** Build camera-focused animation prompt instead of raw narrative description (Issue 4) */
function buildAnimationPrompt(movement: string, description: string): string {
    const movLower = movement.toLowerCase();
    let cameraDirection = '';
    if (movLower === 'pan') cameraDirection = 'slow horizontal pan';
    else if (movLower === 'tilt') cameraDirection = 'gentle vertical tilt';
    else if (movLower === 'zoom') cameraDirection = 'slow zoom in';
    else if (movLower === 'dolly') cameraDirection = 'smooth dolly forward';
    else if (movLower === 'tracking') cameraDirection = 'tracking camera movement';
    else if (movLower === 'handheld') cameraDirection = 'subtle handheld sway';
    else cameraDirection = 'slow gentle camera drift';

    // Truncate description to 200 chars to leave room for camera instruction
    const shortDesc = description.length > 200 ? description.substring(0, 197) + '...' : description;
    return `${cameraDirection}. ${shortDesc}. Atmospheric, minimal character motion.`;
}

const STORAGE_KEY = 'ai_soul_studio_story_state';
const SESSION_KEY = 'ai_soul_studio_story_session';
const USER_ID_KEY = 'ai_soul_studio_story_user_id';
const PROJECT_ID_KEY = 'ai_soul_studio_story_project_id';

/**
 * Strip markdown and metadata artifacts from narration text.
 * Delegates to the extracted textSanitizer service for comprehensive cleaning.
 */
function cleanNarrationText(text: string): string {
    return cleanForTTS(text);
}

/**
 * Infer emotional tone and instruction triplet for a scene based on its content
 * and position in the narrative arc. Replaces hardcoded 'dramatic' for all scenes.
 */
function inferSceneEmotion(scene: ScreenplayScene, index: number, total: number): {
    emotionalTone: 'professional' | 'dramatic' | 'friendly' | 'urgent' | 'calm';
    instructionTriplet: { primaryEmotion: string; cinematicDirection: string; environmentalAtmosphere: string };
} {
    const text = `${scene.heading} ${scene.action}`.toLowerCase();

    // Keyword-based emotion detection (English + Arabic)
    const urgentWords = /\b(run|escape|chase|hurry|danger|attack|fight|scream|crash|explode|fire|flood|storm)\b|يركض|يهرب|خطر|هجوم|يهاجم|يصرخ|صراخ|ينفجر|حريق|فيضان|عاصفة|خنق|يخنق|رعب|فزع|هلع|يطارد/;
    const calmWords = /\b(peace|serene|quiet|gentle|soft|still|dawn|morning|garden|rest|sleep|dream)\b|سلام|هدوء|سكون|صباح|حديقة|راحة|نوم|حلم|فجر|طمأنينة|أمان/;
    const friendlyWords = /\b(smile|laugh|friend|welcome|warm|celebrate|joy|happy|festival|feast|gift)\b|ابتسامة|ضحك|صديق|ترحيب|فرح|احتفال|سعادة|عيد|هدية/;
    const dramaticWords = /\b(reveal|secret|truth|betray|lost|dark|shadow|death|ancient|fate|destiny|mystery)\b|سر|حقيقة|خيانة|ظلام|ظل|موت|قديم|مصير|قدر|غموض|لغز|شبح|جن|لعنة|مهجور|مخيف|غامض/;

    // Narrative arc position
    const position = total > 1 ? index / (total - 1) : 0.5;
    const isOpening = index === 0;
    const isClimax = position >= 0.6 && position <= 0.8;
    const isEnding = index === total - 1;

    let tone: 'professional' | 'dramatic' | 'friendly' | 'urgent' | 'calm' = 'dramatic';
    let emotion = 'cinematic-wonder';
    let cinematic = 'slow-push-in';
    let atmosphere = 'golden-hour-decay';

    if (urgentWords.test(text)) {
        tone = 'urgent';
        emotion = 'visceral-dread';
        cinematic = 'handheld-float';
        atmosphere = 'tension-drone';
    } else if (calmWords.test(text)) {
        tone = 'calm';
        emotion = 'nostalgic-warmth';
        cinematic = 'slow-pull-back';
        atmosphere = 'golden-hour-decay';
    } else if (friendlyWords.test(text)) {
        tone = 'friendly';
        emotion = 'bittersweet-longing';
        cinematic = 'tracking-shot';
        atmosphere = 'hopeful-pad';
    } else if (dramaticWords.test(text)) {
        tone = 'dramatic';
        emotion = 'visceral-dread';
        cinematic = 'dutch-angle';
        atmosphere = 'foggy-ruins';
    }

    // Narrative arc overrides
    if (isOpening) {
        cinematic = 'slow-push-in';
        if (tone === 'dramatic') atmosphere = 'foggy-ruins';
    }
    if (isClimax) {
        tone = urgentWords.test(text) ? 'urgent' : 'dramatic';
        cinematic = 'dutch-angle';
        emotion = 'visceral-dread';
    }
    if (isEnding) {
        cinematic = 'slow-pull-back';
        if (!urgentWords.test(text)) {
            tone = 'calm';
            emotion = 'nostalgic-warmth';
            atmosphere = 'golden-hour-decay';
        }
    }

    return {
        emotionalTone: tone,
        instructionTriplet: {
            primaryEmotion: emotion,
            cinematicDirection: cinematic,
            environmentalAtmosphere: atmosphere,
        },
    };
}

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
        // Strip blob URLs from per-shot narration segments
        shotNarrationSegments: state.shotNarrationSegments?.map(seg => ({
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

/** Matches ASCII digits (0-9), Arabic-Indic (٠-٩), and Extended Arabic-Indic (۰-۹) */
const DIGITS = '(?:[0-9\u0660-\u0669\u06F0-\u06F9])';

/**
 * Strip LLM preamble text that appears before the first scene/act/chapter marker.
 * LLMs often prepend conversational text like "Here is a narrative breakdown..."
 * or Arabic equivalents like "إليك تفصيل سردي..." which pollutes scene data.
 */
function stripLLMPreamble(text: string): string {
    // Find the first occurrence of a scene/act/chapter marker
    const markerPattern = new RegExp(`(?:Act|Chapter|Scene|Part|فصل|مشهد)\\s*${DIGITS}+`, 'i');
    const match = text.match(markerPattern);

    if (match && match.index !== undefined && match.index > 0) {
        const preamble = text.substring(0, match.index).trim();
        // Only strip if the preamble looks like conversational text (not actual content)
        // Heuristic: preamble is short-ish (< 300 chars) and doesn't contain multiple newlines
        // (which would suggest it's actual structured content)
        const newlineCount = (preamble.match(/\n/g) || []).length;
        if (preamble.length < 300 || newlineCount < 3) {
            console.log(`[parseBreakdown] Stripped LLM preamble (${preamble.length} chars): "${preamble.substring(0, 80)}..."`);
            return text.substring(match.index);
        }
    }

    // Also try numbered list markers (e.g., "1." or "1)" or "١.")
    const numberedMatch = text.match(new RegExp(`^\\s*${DIGITS}[.)]\\s`, 'm'));
    if (numberedMatch && numberedMatch.index !== undefined && numberedMatch.index > 0) {
        const preamble = text.substring(0, numberedMatch.index).trim();
        const newlineCount = (preamble.match(/\n/g) || []).length;
        if (preamble.length < 300 || newlineCount < 3) {
            console.log(`[parseBreakdown] Stripped LLM preamble before numbered list (${preamble.length} chars)`);
            return text.substring(numberedMatch.index);
        }
    }

    return text;
}

/**
 * Parse AI-generated breakdown text into structured ScreenplayScene objects.
 * Handles various formats: "Act 1:", "Chapter 1:", "Scene 1:", numbered lists, etc.
 */
function parseBreakdownToScenes(breakdownText: string, topic: string): ScreenplayScene[] {
    const scenes: ScreenplayScene[] = [];

    // Strip LLM preamble before parsing to prevent it from becoming scene_0
    const cleanedText = stripLLMPreamble(breakdownText);

    // Try to split by common patterns: Act, Chapter, Scene, or numbered sections
    // Supports ASCII digits (0-9), Arabic-Indic (٠-٩), and Extended Arabic-Indic (۰-۹)
    const patterns = [
        new RegExp(`(?:Act|Chapter|Scene|Part|فصل|مشهد|المشهد)\\s*${DIGITS}+[:.]?\\s*`, 'gi'),
        new RegExp(`(?:^${DIGITS}+[.)]\\s*)`, 'gm'),
        /(?:\n\n+)/g, // Double newlines as fallback
    ];

    let sections: string[] = [];

    // Try each pattern until we get reasonable sections
    for (const pattern of patterns) {
        sections = cleanedText.split(pattern).filter(s => s.trim().length > 20);
        if (sections.length >= 2 && sections.length <= 10) break;
    }

    // If no good split found, treat whole text as one section
    if (sections.length < 2) {
        sections = [cleanedText];
    }

    sections.forEach((section, index) => {
        const lines = section.trim().split('\n').filter(l => l.trim());
        if (lines.length === 0) return;

        // Extract title from first line or generate one
        let title = lines[0]?.replace(/^[*\-#\d.)]+\s*/, '').trim() || `Scene ${index + 1}`;
        // Clean up title - remove markdown, limit length
        title = title.replace(/[*_#]/g, '').substring(0, 100);

        // Rest of lines become the action/description
        // Strip trailing scene number artifacts (e.g., "٢. **" or "3. **") that leak
        // from the next section's numbering during split, and clean leftover markdown.
        const actionLines = lines.slice(1).join(' ').trim()
            .replace(/\s*[0-9\u0660-\u0669\u06F0-\u06F9]+\.\s*\*{0,2}\s*$/, '')
            .replace(/\*{2,}/g, '')
            .trim();

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

export function useStoryGeneration(projectId?: string | null) {
    const initialState: StoryState = {
        currentStep: 'idea',
        breakdown: [],
        script: null,
        characters: [],
        shotlist: [],
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
            console.log('[useStoryGeneration] Session belongs to different user, clearing');
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(USER_ID_KEY);
            localStorage.removeItem(PROJECT_ID_KEY);
            return;
        }

        // If a projectId is provided and it differs from the saved one,
        // this is a different/new project — start fresh instead of loading old state
        if (projectId && savedProjectId && projectId !== savedProjectId) {
            console.log('[useStoryGeneration] Different project detected, resetting state', {
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
                console.log('[useStoryGeneration] Recovered story state');
            } catch (e) {
                console.error('Failed to parse saved story state', e);
            }
        }

        if (savedSession) {
            setSessionId(savedSession);
            // Re-initialize cloud storage for the restored session
            cloudAutosave.initSession(savedSession).then(success => {
                if (success) {
                    console.log('[useStoryGeneration] Cloud storage re-initialized for restored session');
                }
            });

            // Re-populate storyModeStore with restored state so tools can find the session
            if (savedState) {
                try {
                    const parsed = JSON.parse(savedState);
                    // Convert React state format to StoryModeState format
                    const storyModeState = {
                        id: savedSession,
                        topic: parsed.breakdown?.[0]?.heading || 'Restored Story',
                        breakdown: parsed.breakdown?.map((s: ScreenplayScene) =>
                            `${s.heading}: ${s.action}`
                        ).join('\n') || '',
                        screenplay: parsed.script?.scenes || [],
                        characters: parsed.characters || [],
                        shotlist: parsed.shotlist || [],
                        currentStep: parsed.currentStep === 'script' ? 'screenplay' : parsed.currentStep,
                        updatedAt: Date.now(),
                    };
                    storyModeStore.set(savedSession, storyModeState);
                    console.log('[useStoryGeneration] Restored storyModeStore for session:', savedSession);
                } catch (e) {
                    console.error('[useStoryGeneration] Failed to restore storyModeStore:', e);
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
                console.warn('[useStoryGeneration] Failed to save state to localStorage:', err);
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
                console.log('[useStoryGeneration] User signed out, clearing session');
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(USER_ID_KEY);
                localStorage.removeItem(PROJECT_ID_KEY);
            } else if (savedUserId && savedUserId !== user.uid) {
                // Different user signed in - clear stale session
                console.log('[useStoryGeneration] Different user signed in, clearing stale session');
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
            const prompt = `Use the generate_breakdown tool to create a ${genre} story about ${inputTopic}. Return 3-5 scenes.`;
            let capturedSessionId: string | null = null;
            
            await runProductionAgent(prompt, (progress) => {
                setProgress({ message: progress.message, percent: progress.isComplete ? 100 : 50 });
                // Capture sessionId from the progress callback
                if (progress.sessionId) {
                    capturedSessionId = progress.sessionId;
                }
            });

            // Use the captured sessionId, or fall back to searching storyModeStore
            let foundSessionId: string | null = capturedSessionId;
            let foundState = null;

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
            } else {
                // Get the state from storyModeStore using the captured sessionId
                foundState = storyModeStore.get(foundSessionId);
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
                        console.log('[useStoryGeneration] Cloud storage initialized for session');
                    } else {
                        console.warn('[useStoryGeneration] Cloud storage unavailable, using local storage only');
                    }
                });

                // Parse the breakdown text into scenes
                const breakdownText = foundState.breakdown;
                const scenes: ScreenplayScene[] = parseBreakdownToScenes(breakdownText, inputTopic);

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

                // Reconcile scene count: if screenplay has fewer scenes than breakdown,
                // align breakdown to match screenplay to prevent downstream misalignment
                // (e.g., narration iterating over more scenes than the screenplay covers).
                const screenplayScenes = storyState.screenplay;
                let reconciledBreakdown = state.breakdown;

                if (screenplayScenes.length !== state.breakdown.length) {
                    console.warn(
                        `[useStoryGeneration] Scene count mismatch: breakdown=${state.breakdown.length}, screenplay=${screenplayScenes.length}. Reconciling...`
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
                    console.log(`[useStoryGeneration] Reconciled to ${reconciledBreakdown.length} scenes`);
                }

                // Build script object from screenplay scenes
                const script = {
                    title: reconciledBreakdown[0]?.heading || 'Untitled Story',
                    scenes: screenplayScenes,
                };

                setState(prev => ({
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

                // Enrich with coreAnchors for stronger prompt anchoring in image generation
                const enrichedCharacters = enrichCharactersWithCoreAnchors(
                    storyState.characters,
                    state.visualStyle || 'Cinematic'
                );

                setState(prev => ({
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

        const char = state.characters.find(c => c.id === characterId);
        if (!char) {
            setError(`Character not found: ${characterId}`);
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProgress({ message: `Generating portrait for ${char.name}...`, percent: 50 });

        try {
            const referenceUrl = await generateCharacterReference(
                char.name,
                char.visualDescription,
                sessionId,
                state.visualStyle || 'Cinematic',
            );

            setState(prev => ({
                ...prev,
                characters: prev.characters.map(c =>
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

    /**
     * Update a single shot's metadata (from Shot Editor Modal saves).
     * Merges `updates` into the matching ShotlistEntry without regenerating visuals.
     */
    const updateShot = useCallback((shotId: string, updates: Partial<ShotlistEntry>) => {
        const updatedShotlist = state.shotlist.map(s =>
            s.id === shotId ? { ...s, ...updates } : s
        );
        pushState({ ...state, shotlist: updatedShotlist });
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
                },
                sessionId || undefined,
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
     * Update Image Provider (gemini or deapi)
     */
    const updateImageProvider = useCallback((provider: 'gemini' | 'deapi') => {
        setState(prev => ({
            ...prev,
            imageProvider: provider,
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

            // Build character input list for structured prompt builder
            const characterInputs = state.characters
                .filter(c => c.visualDescription)
                .map(c => ({ name: c.name, visualDescription: c.visualDescription, facialTags: c.facialTags }));

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
                const primaryChar = characterInputs.find(c =>
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
                        console.log(`[useStoryGeneration] Image uploaded to cloud: ${shot.id}`);
                        finalUrl = cloudUrl;
                    }
                }
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
                        'Flux_2_Klein_4B_BF16',
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
                        console.log('[useStoryGeneration] Extracted master style:', extractedStyleOverride.colorPalette?.join(', '));
                    } catch (styleErr) {
                        console.warn('[useStoryGeneration] Style extraction failed, continuing without:', styleErr);
                    }
                }

                // Generate remaining shots in parallel with extracted style
                const remainingShots = validShots.slice(1);
                if (remainingShots.length > 0) {
                    const batchItems = remainingShots.map((shot) => ({
                        id: shot.id,
                        prompt: buildShotPrompt(shot), // Now includes extractedStyleOverride
                        aspectRatio: (state.aspectRatio || '16:9') as '16:9' | '9:16' | '1:1',
                        model: 'Flux_2_Klein_4B_BF16' as const,
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
                        const shot = remainingShots.find(s => s.id === result.id);
                        if (!shot) continue;
                        if (result.success && result.imageUrl) {
                            await processShotResult(shot, result.imageUrl);
                        } else {
                            console.error(`Failed to generate visual for shot ${shot.shotNumber}:`, result.error);
                        }
                    }
                }
            } else {
                // Parallel generation via Gemini Imagen using ParallelExecutionEngine
                const { ParallelExecutionEngine } = await import('@/services/parallelExecutionEngine');
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
                        console.error(`[generateVisuals] Shot ${taskId} failed:`, error.message);
                        storyboardStatus[taskId] = 'failed';
                    },
                    onTaskComplete: (taskId) => {
                        storyboardStatus[taskId] = 'success';
                    },
                });

                // Process results in post-execution loop (cloud upload + shotlist mutation NOT inside execute())
                for (const result of geminiResults) {
                    if (!result.success || !result.data) continue;
                    const shot = shotsNeedingVisuals.find(s => s?.id === result.taskId);
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
                            console.warn('[useStoryGeneration] Style extraction failed:', styleErr);
                        }
                    }
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
        const shot = state.shots?.find(s => s.id === shotId);
        const existingEntry = state.shotlist.find(s => s.id === shotId);

        if (!shot && !existingEntry) {
            setError(`Shot ${shotId} not found`);
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProgress({ message: `Regenerating shot...`, percent: 20 });

        try {
            const { generateImageFromPrompt } = await import('@/services/imageService');
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
                    'Flux_2_Klein_4B_BF16',
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
                    console.log(`[useStoryGeneration] Regenerated image uploaded to cloud: ${shotId}`);
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
            if (!state.shotlist.find(s => s.id === shotId) && shot) {
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
     * Step 6: Generate per-shot narration (TTS).
     * Uses narrateAllShots() for per-shot audio segments, with resume logic to skip
     * already-narrated shots. Falls back to voiceover scripts → scene action → description.
     */
    const generateNarration = useCallback(async () => {
        if (!state.shotlist || state.shotlist.length === 0) {
            setError('Visuals must be generated before creating narration');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setProgress({ message: 'Rewriting scripts for voiceover...', percent: 5 });

        try {
            const screenplayScenes = state.script?.scenes || [];

            // Step A: Generate voiceover scripts from screenplay action text (delivery markers)
            const breakdownHooks = state.breakdown.map(s => {
                const action = s.action || '';
                return action.length > 100 ? action.slice(0, 100) : action;
            });
            const voiceoverMap = await generateVoiceoverScripts(screenplayScenes, breakdownHooks);

            // Detect language for voice selection
            const sampleSources = [
                state.breakdown[0]?.action || '',
                state.breakdown[0]?.heading || '',
                screenplayScenes[0]?.action || '',
                screenplayScenes[0]?.heading || '',
            ].join(' ');
            const detectedLang = detectLanguage(sampleSources);
            const narratorConfig: NarratorConfig = {
                videoPurpose: 'storytelling',
                ...(detectedLang === 'ar' ? { language: 'ar' as const } : {}),
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
                        console.log(`[useStoryGeneration] Shot narration uploaded to cloud: ${seg.shotId}`);
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

            // Pre-compute per-shot target durations from narration
            const shotTargetDurations = new Map<string, number>();
            if (state.shotNarrationSegments && state.shotNarrationSegments.length > 0) {
                // Exact per-shot durations from per-shot narration (new system)
                state.shotNarrationSegments.forEach(seg => {
                    shotTargetDurations.set(seg.shotId, seg.duration);
                });
            } else if (state.narrationSegments && state.narrationSegments.length > 0) {
                // Legacy fallback: divide scene duration evenly across shots in that scene
                const sceneIds = [...new Set(state.shotlist.map(s => s.sceneId))];
                for (const sceneId of sceneIds) {
                    const sceneShotIds = state.shotlist.filter(s => s.sceneId === sceneId).map(s => s.id);
                    const sceneNarration = state.narrationSegments.find(n => n.sceneId === sceneId);
                    const sceneDur = sceneNarration?.duration || 5;
                    const perShot = sceneDur / Math.max(sceneShotIds.length, 1);
                    for (const sid of sceneShotIds) {
                        shotTargetDurations.set(sid, perShot);
                    }
                }
            }

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

                    // Get the StoryShot data for motion strength selection (Issue 4)
                    const storyShot = state.shots?.find(s => s.id === shot.id);
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
                                console.warn(`[useStoryGeneration] Failed to fetch image for img2video, falling back to txt2video:`, fetchErr);
                                imageDataUrl = '';
                            }
                        }

                        if (imageDataUrl.startsWith('data:')) {
                            videoUrl = await animateImageWithDeApi(
                                imageDataUrl,
                                animationPrompt,
                                deapiAspectRatio,
                                sessionId || undefined,
                                i,
                                { motionStrength },
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
                                i
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
                            console.log(`[useStoryGeneration] Animated video uploaded to cloud: ${shot.id}`);
                            videoUrl = cloudUrl;
                        }
                    }

                    // Store with target duration from narration (Issue 6)
                    const targetDuration = shotTargetDurations.get(shot.id) || motionConfig.frames / 30;
                    const existingIdx = animatedShots.findIndex(a => a.shotId === shot.id);
                    const animatedShot = {
                        shotId: shot.id,
                        videoUrl,
                        duration: targetDuration,
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

            // Calculate total duration with fallback for undefined/NaN values
            const totalDuration = narrationSegs.reduce((sum, s) => sum + (s.duration || 0), 0);

            console.log('[useStoryGeneration] Export stats:', {
                narrationSegments: narrationSegs.length,
                totalDuration,
                shotlistLength: state.shotlist.length,
                segmentDurations: narrationSegs.map(s => s.duration),
            });

            // Combine all narration audio segments into a single audio track
            let combinedAudioUrl: string;

            try {
                combinedAudioUrl = await createCombinedNarrationAudio(
                    narrationSegs,
                    (message, percent) => setProgress({ message, percent })
                );
                console.log('[useStoryGeneration] Combined', narrationSegs.length, 'narration segments');
            } catch (audioErr) {
                console.warn('[useStoryGeneration] Failed to combine audio, using first segment:', audioErr);
                combinedAudioUrl = narrationSegs[0]?.audioUrl || '';
            }

            // Narration-aware timestamps: distribute shots proportionally across scenes
            // Each scene's narration duration determines its shots' time slots
            const effectiveDuration = totalDuration > 0 ? totalDuration : state.shotlist.length * 5;

            // Build scene → shots mapping and scene → narration duration mapping
            const sceneIds = [...new Set(state.shotlist.map(s => s.sceneId))];
            const prompts: Array<{
                id: string;
                text: string;
                mood: string;
                timestamp: string;
                timestampSeconds: number;
            }> = [];
            let accumulatedTime = 0;

            for (const sceneId of sceneIds) {
                const sceneShotlist = state.shotlist.filter(s => s.sceneId === sceneId);
                // Find narration segment for this scene
                const sceneNarration = narrationSegs.find(n => n.sceneId === sceneId);
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

            console.log('[useStoryGeneration] Narration-aware shot timing:', {
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
            console.log('[useStoryGeneration] Generated images:', {
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

            console.log('[useStoryGeneration] SongData built:', {
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

            // Create URL for the final video (use cloud URL if available, otherwise create blob URL)
            const finalVideoUrl = exportResult.cloudUrl || URL.createObjectURL(exportResult.blob);

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
        return state.breakdown.every(s => state.scenesWithNarration?.includes(s.id));
    }, [state.breakdown, state.scenesWithNarration]);

    /**
     * Check if all shots have animation
     */
    const allShotsHaveAnimation = useCallback(() => {
        if (!state.shotsWithAnimation || !state.shotlist) return false;
        return state.shotlist.every(s => state.shotsWithAnimation?.includes(s.id));
    }, [state.shotlist, state.shotsWithAnimation]);

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

            // Initialize cloud storage for media
            setSessionId(cloudSessionId);
            await cloudAutosave.initSession(cloudSessionId);

            // Apply the loaded state
            pushState(cloudState);
            setProgress({ message: 'Story loaded', percent: 100 });
            console.log(`[useStoryGeneration] Loaded story ${cloudSessionId} from cloud`);
            return true;
        } catch (err) {
            console.error('[useStoryGeneration] Failed to load from cloud:', err);
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
        console.log('[useStoryGeneration] Applying template:', templateState);
        pushState({
            ...state,
            ...templateState,
        });
    }, [state, pushState]);

    /**
     * Import a complete project state (e.g., from JSON file or version history)
     */
    const importProject = useCallback((importedState: StoryState) => {
        console.log('[useStoryGeneration] Importing project state');
        pushState(importedState);
    }, [pushState]);

    return {
        state,
        sessionId,
        isProcessing,
        error,
        progress,
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
        // Storyboarder.ai-style workflow functions
        lockStory,
        updateVisualStyle,
        updateAspectRatio,
        updateGenre,
        updateImageProvider,
        // New step-by-step generation methods
        generateShots,
        generateVisuals,
        regenerateShotVisual, // Storyboarder.ai-style per-shot refresh
        updateShot,           // Merge metadata edits from Shot Editor Modal
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
        // Cloud sync
        loadFromCloud,
        saveToCloud,
        isSyncAvailable: isSyncAvailable(),
        // Template and project management
        applyTemplate,
        importProject,
    };
}
