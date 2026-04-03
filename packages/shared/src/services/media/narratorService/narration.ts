/**
 * Narrator Service — Scene and shot narration orchestration
 */

import { Scene, NarrationSegment, EmotionalTone, ShotlistEntry, ScreenplayScene } from "../../types";
import { MODELS } from '../../shared/apiClient';
import { ParallelExecutionEngine } from "../../orchestration/parallelExecutionEngine";
import { cleanForTTS } from "../../audio-processing/textSanitizer";
import { traceAsync } from "../../tracing";
import { cloudAutosave } from "../../cloud/cloudStorageService";
import { logAICall } from "../../infrastructure/aiLogService";
import { getEffectiveLegacyTone } from "../../content/tripletUtils";
import { TONE_VOICE_MAP, LANGUAGE_VOICE_MAP, ExtendedVoiceConfig, StylePrompt, TTSVoice } from "./voiceConfig";
import { NarratorConfig, DEFAULT_NARRATOR_CONFIG, NarratorError, synthesizeSpeech, calculateAudioDuration, buildDirectorNote, buildTripletDirectorNote } from "./ttsCore";
import { getAutoStylePrompt } from "./voiceConfig";

export async function narrateScene(
    scene: Scene,
    config?: NarratorConfig,
    sessionId?: string
): Promise<NarrationSegment> {
    console.log(`[Narrator] Narrating scene: ${scene.name}`);

    const effectiveTone = getEffectiveLegacyTone(scene);
    const baseVoiceConfig = TONE_VOICE_MAP[effectiveTone];

    const languageVoice = config?.language && config.language !== 'auto'
        ? LANGUAGE_VOICE_MAP[config.language]
        : undefined;

    let stylePrompt: StylePrompt;

    if (scene.instructionTriplet) {
        const tripletNote = buildTripletDirectorNote(scene.instructionTriplet);
        stylePrompt = { customDirectorNote: tripletNote };
        console.log(`[Narrator] Using triplet-based director note for "${scene.name}"`);
    } else {
        stylePrompt = getAutoStylePrompt(effectiveTone, config?.videoPurpose, config?.styleOverride);
    }

    const enhancedVoiceConfig: ExtendedVoiceConfig = {
        ...baseVoiceConfig,
        ...(languageVoice && { voiceName: languageVoice }),
        stylePrompt,
    };

    if (languageVoice) {
        console.log(`[Narrator] Using language-specific voice "${languageVoice}" for ${config?.language}`);
    }

    const ttsStart = Date.now();
    let audioBlob: Blob;
    try {
        audioBlob = await synthesizeSpeech(scene.narrationScript, enhancedVoiceConfig, config);
    } catch (err) {
        if (sessionId) {
            logAICall({
                sessionId,
                step: 'tts',
                model: MODELS.TTS,
                input: scene.narrationScript,
                output: '',
                durationMs: Date.now() - ttsStart,
                status: 'error',
                error: err instanceof Error ? err.message : String(err),
                metadata: { sceneName: scene.name, voice: enhancedVoiceConfig.voiceName },
            });
        }
        throw err;
    }

    const audioDuration = calculateAudioDuration(audioBlob);

    if (sessionId) {
        logAICall({
            sessionId,
            step: 'tts',
            model: MODELS.TTS,
            input: scene.narrationScript,
            output: `audio: ${audioDuration.toFixed(1)}s, ${audioBlob.size} bytes`,
            durationMs: Date.now() - ttsStart,
            status: 'success',
            metadata: { sceneName: scene.name, voice: enhancedVoiceConfig.voiceName, audioDurationSec: audioDuration, audioSizeBytes: audioBlob.size },
        });
    }

    const wordCount = scene.narrationScript.split(/\s+/).filter(w => w.length > 0).length;
    console.log(`[Narrator] Scene "${scene.name}" audio: ${audioDuration.toFixed(1)}s (${wordCount} words, ${audioBlob.size} bytes)`);

    if (sessionId) {
        cloudAutosave.saveNarration(sessionId, audioBlob, scene.id).catch(err => {
            console.warn('[Narrator] Cloud autosave failed (non-fatal):', err);
        });
    }

    return { sceneId: scene.id, audioBlob, audioDuration, transcript: scene.narrationScript };
}

export const narrateAllScenes = traceAsync(
    async function narrateAllScenesImpl(
        scenes: Scene[],
        config?: NarratorConfig,
        onProgress?: (sceneIndex: number, totalScenes: number) => void,
        sessionId?: string
    ): Promise<NarrationSegment[]> {
        console.log(`[Narrator] Starting narration for ${scenes.length} scenes`);

        const segments: NarrationSegment[] = [];

        for (let i = 0; i < scenes.length; i++) {
            onProgress?.(i, scenes.length);

            const scene = scenes[i];
            if (!scene) {
                console.warn(`[Narrator] Scene at index ${i} is undefined, skipping`);
                continue;
            }

            try {
                const segment = await narrateScene(scene, config, sessionId);
                segments.push(segment);
                console.log(`[Narrator] Completed scene ${i + 1}/${scenes.length}`);
            } catch (error) {
                console.error(`[Narrator] Failed to narrate scene ${scene.id}:`, error);
                throw error;
            }
        }

        onProgress?.(scenes.length, scenes.length);
        console.log(`[Narrator] All ${segments.length} scenes narrated`);
        return segments;
    },
    "narrateAllScenes",
    { runType: "chain", metadata: { service: "narrator" }, tags: ["tts", "narration"] }
);

export async function narrateAllShots(
    shots: ShotlistEntry[],
    screenplayScenes: ScreenplayScene[],
    config: NarratorConfig | undefined,
    onProgress: ((completed: number, total: number) => void) | undefined,
    sessionId: string | undefined,
    existingStatus?: Record<string, 'pending' | 'success' | 'failed'>,
    existingShotNarrations?: Array<{ shotId: string; sceneId: string; audioUrl: string; duration: number; text: string }>,
): Promise<Array<{ shotId: string; sceneId: string; audioBlob: Blob; duration: number; text: string }>> {
    const sceneActionMap = new Map<string, string>();
    for (const scene of screenplayScenes) {
        sceneActionMap.set(scene.id, scene.action);
    }

    const existingNarrationMap = new Map<string, NonNullable<typeof existingShotNarrations>[number]>(
        (existingShotNarrations || []).filter(n => n.audioUrl).map(n => [n.shotId, n])
    );

    const shotsToProcess = shots.filter(shot => {
        if (existingStatus?.[shot.id] === 'success' && existingNarrationMap.has(shot.id)) return false;
        return true;
    });

    if (shotsToProcess.length === 0) {
        console.log('[Narrator] narrateAllShots: all shots already narrated, skipping');
        return [];
    }

    console.log(`[Narrator] narrateAllShots: narrating ${shotsToProcess.length}/${shots.length} shots`);

    const defaultVoiceConfig: ExtendedVoiceConfig = TONE_VOICE_MAP['dramatic'];

    const tasks = shotsToProcess
        .map(shot => {
            const rawText = shot.scriptSegment ?? sceneActionMap.get(shot.sceneId) ?? shot.description;
            const narrationText = cleanForTTS(rawText || '');

            if (!narrationText.trim()) {
                console.warn(`[Narrator] Skipping shot ${shot.id}: empty narration text after cleaning`);
                return null;
            }

            return {
                id: shot.id,
                type: 'audio' as const,
                priority: shot.shotNumber,
                retryable: true,
                timeout: 45_000,
                execute: async (): Promise<{ shotId: string; sceneId: string; audioBlob: Blob; duration: number; text: string }> => {
                    console.log(`[Narrator] Narrating shot ${shot.shotNumber} (${shot.id}): "${narrationText.substring(0, 50)}..."`);
                    const audioBlob = await synthesizeSpeech(narrationText, defaultVoiceConfig, config);
                    const duration = calculateAudioDuration(audioBlob);
                    return { shotId: shot.id, sceneId: shot.sceneId, audioBlob, duration, text: narrationText };
                },
            };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);

    if (tasks.length === 0) {
        console.warn('[Narrator] narrateAllShots: no tasks after filtering empty text');
        return [];
    }

    const engine = new ParallelExecutionEngine();
    const taskResults = await engine.execute(tasks, {
        concurrencyLimit: 2,
        retryAttempts: 3,
        retryDelay: 3000,
        exponentialBackoff: true,
        onProgress: (p) => onProgress?.(p.completedTasks, p.totalTasks),
        onTaskFail: (taskId, error) => { console.error(`[Narrator] Shot narration failed for ${taskId}:`, error.message); },
    });

    const results: Array<{ shotId: string; sceneId: string; audioBlob: Blob; duration: number; text: string }> = [];
    for (const result of taskResults) {
        if (result.success && result.data) results.push(result.data);
    }

    const failedCount = taskResults.filter(r => !r.success).length;
    if (failedCount > 0) console.warn(`[Narrator] narrateAllShots: ${failedCount} shots failed (non-fatal)`);

    console.log(`[Narrator] narrateAllShots: completed ${results.length}/${tasks.length} shots`);
    return results;
}

export function estimateNarrationDuration(text: string, speakingRate = 1.0): number {
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const wordsPerSecond = (150 / 60) * speakingRate;
    return Math.ceil(wordCount / wordsPerSecond);
}

export function createAudioUrl(segment: NarrationSegment): string {
    return URL.createObjectURL(segment.audioBlob);
}

export function revokeAudioUrl(url: string): void {
    URL.revokeObjectURL(url);
}

export function createCustomVoice(config: {
    voiceName: TTSVoice;
    stylePrompt?: StylePrompt;
    pitch?: number;
    speakingRate?: number;
}): ExtendedVoiceConfig {
    return {
        voiceName: config.voiceName,
        pitch: config.pitch ?? 0,
        speakingRate: config.speakingRate ?? 1.0,
        stylePrompt: config.stylePrompt,
    };
}
