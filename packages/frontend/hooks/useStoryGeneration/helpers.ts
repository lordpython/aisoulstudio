/**
 * useStoryGeneration — Pure helper functions and constants
 */

import type { StoryStep, StoryState, ScreenplayScene, CharacterProfile, ShotlistEntry, ConsistencyReport } from '@/types';
import type { StoryModeState } from '@/services/ai/production/types';
import { cleanForTTS } from '@/services/audio-processing/textSanitizer';

export type { StoryStep, StoryState, ScreenplayScene, CharacterProfile, ShotlistEntry, ConsistencyReport };

/**
 * Generate anti-style negative prompts based on chosen visual style.
 * Prevents style contamination (e.g., cinematic shots appearing as 3D renders).
 */
export function generateNegativePromptsForStyle(style: string): string[] {
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

/** Motion strength configuration for DeAPI animation */
export type MotionStrength = 'subtle' | 'moderate' | 'dynamic';

export const MOTION_CONFIGS: Record<MotionStrength, { frames: number; promptPrefix: string }> = {
    subtle: { frames: 60, promptPrefix: "Slow gentle camera movement. Minimal subject motion." },
    moderate: { frames: 90, promptPrefix: "Smooth camera movement. Subtle subject motion." },
    dynamic: { frames: 120, promptPrefix: "Dynamic camera movement." },
};

/** Auto-select motion strength based on shot type and camera movement */
export function selectMotionStrength(shotType: string, movement: string): MotionStrength {
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

/** Build camera-focused animation prompt instead of raw narrative description */
export function buildAnimationPrompt(movement: string, description: string): string {
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

export const STORAGE_KEY = 'ai_soul_studio_story_state';
export const SESSION_KEY = 'ai_soul_studio_story_session';
export const USER_ID_KEY = 'ai_soul_studio_story_user_id';
export const PROJECT_ID_KEY = 'ai_soul_studio_story_project_id';

/**
 * Number of consecutive animation failures that triggers the circuit breaker
 * and aborts the remaining batch.
 */
export const ANIMATION_CIRCUIT_BREAKER_THRESHOLD = 3;

/**
 * Strip markdown and metadata artifacts from narration text.
 */
export function cleanNarrationText(text: string): string {
    return cleanForTTS(text);
}

/**
 * Infer emotional tone and instruction triplet for a scene based on its content
 * and position in the narrative arc.
 */
export function inferSceneEmotion(scene: ScreenplayScene, index: number, total: number): {
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
 */
export function stripImageDataForStorage(state: StoryState): StoryState {
    const isBase64 = (url?: string) => url?.startsWith('data:');
    const isBlobUrl = (url?: string) => url?.startsWith('blob:');
    const shouldStrip = (url?: string) => isBase64(url) || isBlobUrl(url);

    return {
        ...state,
        characters: state.characters.map(char => ({
            ...char,
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
        narrationSegments: state.narrationSegments?.map(seg => ({
            ...seg,
            audioUrl: shouldStrip(seg.audioUrl) ? '' : seg.audioUrl,
        })),
        shotNarrationSegments: state.shotNarrationSegments?.map(seg => ({
            ...seg,
            audioUrl: shouldStrip(seg.audioUrl) ? '' : seg.audioUrl,
        })),
        animatedShots: state.animatedShots?.map(shot => ({
            ...shot,
            videoUrl: shouldStrip(shot.videoUrl) ? '' : shot.videoUrl,
            thumbnailUrl: shouldStrip(shot.thumbnailUrl) ? undefined : shot.thumbnailUrl,
        })),
        finalVideoUrl: undefined,
    };
}

export function mapStoryStepToStoryModeStep(step: StoryStep): StoryModeState['currentStep'] {
    if (step === 'idea' || step === 'breakdown') return 'breakdown';
    if (step === 'script') return 'screenplay';
    if (step === 'characters') return 'characters';
    if (step === 'narration' || step === 'animation' || step === 'export') return 'production';
    return 'shotlist';
}

export function buildStoryModeState(sessionId: string, state: StoryState, topic?: string | null): StoryModeState {
    return {
        id: sessionId,
        topic: topic || state.script?.title || state.breakdown[0]?.heading || 'Story Session',
        breakdown: state.breakdown
            .map((scene: ScreenplayScene) => `${scene.heading}: ${scene.action}`)
            .join('\n'),
        screenplay: state.script?.scenes || state.breakdown,
        characters: state.characters || [],
        shotlist: state.shotlist || [],
        currentStep: mapStoryStepToStoryModeStep(state.currentStep),
        updatedAt: Date.now(),
    };
}

/** Matches ASCII digits (0-9), Arabic-Indic (٠-٩), and Extended Arabic-Indic (۰-۹) */
export const DIGITS = '(?:[0-9\u0660-\u0669\u06F0-\u06F9])';

/**
 * Strip LLM preamble text that appears before the first scene/act/chapter marker.
 */
export function stripLLMPreamble(text: string): string {
    const markerPattern = new RegExp(`(?:Act|Chapter|Scene|Part|فصل|مشهد)\\s*${DIGITS}+`, 'i');
    const match = text.match(markerPattern);

    if (match && match.index !== undefined && match.index > 0) {
        const preamble = text.substring(0, match.index).trim();
        const newlineCount = (preamble.match(/\n/g) || []).length;
        if (preamble.length < 300 || newlineCount < 3) {
            console.log(`[parseBreakdown] Stripped LLM preamble (${preamble.length} chars): "${preamble.substring(0, 80)}..."`);
            return text.substring(match.index);
        }
    }

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
 */
export function parseBreakdownToScenes(breakdownText: string, topic: string): ScreenplayScene[] {
    const scenes: ScreenplayScene[] = [];

    const cleanedText = stripLLMPreamble(breakdownText);

    const patterns = [
        new RegExp(`(?:Act|Chapter|Scene|Part|فصل|مشهد|المشهد)\\s*${DIGITS}+[:.]?\\s*`, 'gi'),
        new RegExp(`(?:^${DIGITS}+[.)]\\s*)`, 'gm'),
        /(?:\n\n+)/g,
    ];

    let sections: string[] = [];

    for (const pattern of patterns) {
        sections = cleanedText.split(pattern).filter(s => s.trim().length > 20);
        if (sections.length >= 2 && sections.length <= 10) break;
    }

    if (sections.length < 2) {
        sections = [cleanedText];
    }

    sections.forEach((section, index) => {
        const lines = section.trim().split('\n').filter(l => l.trim());
        if (lines.length === 0) return;

        let title = lines[0]?.replace(/^[*\-#\d.)]+\s*/, '').trim() || `Scene ${index + 1}`;
        title = title.replace(/[*_#]/g, '').substring(0, 100);

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

export interface StoryAgentResult {
    sessionId?: string;
    scenes?: ScreenplayScene[];
    screenplay?: { title: string; scenes: ScreenplayScene[] };
    characters?: CharacterProfile[];
    shots?: ShotlistEntry[];
    report?: ConsistencyReport;
    [key: string]: unknown;
}
