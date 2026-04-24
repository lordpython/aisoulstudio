/**
 * Narrator Service — Scene and shot narration orchestration
 */

import { Scene, NarrationSegment, EmotionalTone, ShotlistEntry, ScreenplayScene } from "@/types";
import { MODELS } from '../../shared/apiClient';
import { mediaLogger } from '../../infrastructure/logger';
import { ParallelExecutionEngine } from "../../orchestration/parallelExecutionEngine";
import { cleanForTTS } from "../../audio-processing/textSanitizer";
import { traceAsync } from "../../tracing";
import { cloudAutosave } from "../../cloud/cloudStorageService";
import { logAICall } from "../../infrastructure/aiLogService";
import { getEffectiveLegacyTone } from "../../content/tripletUtils";
import { TONE_VOICE_MAP, LANGUAGE_VOICE_MAP, CHARACTER_VOICE_MAP, ExtendedVoiceConfig, StylePrompt, TTSVoice } from "./voiceConfig";
import { NarratorConfig, DEFAULT_NARRATOR_CONFIG, NarratorError, synthesizeSpeech, synthesizeMultiSpeaker, SpeakerConfig, calculateAudioDuration, buildDirectorNote, buildTripletDirectorNote } from "./ttsCore";
import { getAutoStylePrompt } from "./voiceConfig";
import { detectDialogue, hasDialogue, DialogueSegment } from "./dialogueDetection";
import { buildShotNarrationFromVoiceovers } from "./voiceoverSplitter";

const log = mediaLogger.child('Narrator');

export async function narrateScene(
    scene: Scene,
    config?: NarratorConfig,
    sessionId?: string
): Promise<NarrationSegment> {
    log.info(`Narrating scene: ${scene.name}`);

    const effectiveTone = getEffectiveLegacyTone(scene);
    const baseVoiceConfig = TONE_VOICE_MAP[effectiveTone] ?? TONE_VOICE_MAP['dramatic']!;

    const languageVoice = config?.language && config.language !== 'auto'
        ? LANGUAGE_VOICE_MAP[config.language]
        : undefined;

    let stylePrompt: StylePrompt;

    if (scene.instructionTriplet) {
        const tripletNote = buildTripletDirectorNote(scene.instructionTriplet);
        stylePrompt = { customDirectorNote: tripletNote };
        log.debug(`Using triplet-based director note for "${scene.name}"`);
    } else {
        stylePrompt = getAutoStylePrompt(effectiveTone, config?.videoPurpose, config?.styleOverride);
    }

    const enhancedVoiceConfig: ExtendedVoiceConfig = {
        ...baseVoiceConfig,
        ...(languageVoice && { voiceName: languageVoice }),
        stylePrompt,
    };

    if (languageVoice) {
        log.info(`Using language-specific voice "${languageVoice}" for ${config?.language}`);
    }

    const ttsStart = Date.now();
    let audioBlob: Blob;
    try {
        const dialoguePlan = config?.multiSpeaker
            ? planDialogueSpeakers(scene.narrationScript, enhancedVoiceConfig.voiceName)
            : null;

        if (dialoguePlan) {
            log.info(`Scene "${scene.name}" routed to multi-speaker (${dialoguePlan.speakers.length} speakers)`);
            audioBlob = await synthesizeMultiSpeaker(dialoguePlan.transcript, dialoguePlan.speakers, {
                model: config?.model,
                directorNote: buildDirectorNote(stylePrompt),
            });
        } else {
            audioBlob = await synthesizeSpeech(scene.narrationScript, enhancedVoiceConfig, config);
        }
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
    log.info(`Scene "${scene.name}" audio: ${audioDuration.toFixed(1)}s (${wordCount} words, ${audioBlob.size} bytes)`);

    if (sessionId) {
        cloudAutosave.saveNarration(sessionId, audioBlob, scene.id).catch(err => {
            log.warn('Cloud autosave failed (non-fatal)', err);
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
        log.info(`Starting narration for ${scenes.length} scenes`);

        const segments: NarrationSegment[] = [];

        for (let i = 0; i < scenes.length; i++) {
            onProgress?.(i, scenes.length);

            const scene = scenes[i];
            if (!scene) {
                log.warn(`Scene at index ${i} is undefined, skipping`);
                continue;
            }

            try {
                const segment = await narrateScene(scene, config, sessionId);
                segments.push(segment);
                log.info(`Completed scene ${i + 1}/${scenes.length}`);
            } catch (error) {
                log.error(`Failed to narrate scene ${scene.id}`, error);
                throw error;
            }
        }

        onProgress?.(scenes.length, scenes.length);
        log.info(`All ${segments.length} scenes narrated`);
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
    voiceoversByScene?: ReadonlyMap<string, string>,
): Promise<Array<{ shotId: string; sceneId: string; audioBlob: Blob; duration: number; text: string }>> {
    const sceneActionMap = new Map<string, string>();
    for (const scene of screenplayScenes) {
        sceneActionMap.set(scene.id, scene.action);
    }

    // When a scene-level voiceover map is provided, distribute each scene's
    // voiceover across its shots proportionally by durationEst. Produces unique
    // per-shot narration and avoids the "all 12 shots narrate the same text"
    // failure mode from scene.action fallback.
    const shotNarrationFromVO = voiceoversByScene && voiceoversByScene.size > 0
        ? buildShotNarrationFromVoiceovers(voiceoversByScene, shots)
        : null;

    const existingNarrationMap = new Map<string, NonNullable<typeof existingShotNarrations>[number]>(
        (existingShotNarrations || []).filter(n => n.audioUrl).map(n => [n.shotId, n])
    );

    const shotsToProcess = shots.filter(shot => {
        if (existingStatus?.[shot.id] === 'success' && existingNarrationMap.has(shot.id)) return false;
        return true;
    });

    if (shotsToProcess.length === 0) {
        log.info('narrateAllShots: all shots already narrated, skipping');
        return [];
    }

    log.info(`narrateAllShots: narrating ${shotsToProcess.length}/${shots.length} shots`);

    const defaultVoiceConfig: ExtendedVoiceConfig = TONE_VOICE_MAP['dramatic']!;

    const tasks = shotsToProcess
        .map(shot => {
            // Prefer distributed voiceover chunk (scene VO sliced across shots) →
            // then LLM-generated per-shot scriptSegment (often empty in practice) →
            // then scene action (last-resort, produces duplicate narration across shots).
            const rawText = shotNarrationFromVO?.get(shot.id)
                ?? shot.scriptSegment
                ?? sceneActionMap.get(shot.sceneId)
                ?? shot.description;
            const narrationText = cleanForTTS(rawText || '');

            if (!narrationText.trim()) {
                log.warn(`Skipping shot ${shot.id}: empty narration text after cleaning`);
                return null;
            }

            return {
                id: shot.id,
                type: 'audio' as const,
                priority: shot.shotNumber,
                retryable: true,
                timeout: 45_000,
                execute: async (): Promise<{ shotId: string; sceneId: string; audioBlob: Blob; duration: number; text: string }> => {
                    log.debug(`Narrating shot ${shot.shotNumber} (${shot.id}): "${narrationText.substring(0, 50)}..."`);
                    const audioBlob = await synthesizeSpeech(narrationText, defaultVoiceConfig, config);
                    const duration = calculateAudioDuration(audioBlob);
                    return { shotId: shot.id, sceneId: shot.sceneId, audioBlob, duration, text: narrationText };
                },
            };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);

    if (tasks.length === 0) {
        log.warn('narrateAllShots: no tasks after filtering empty text');
        return [];
    }

    const engine = new ParallelExecutionEngine();
    const taskResults = await engine.execute(tasks, {
        concurrencyLimit: 2,
        retryAttempts: 3,
        retryDelay: 3000,
        exponentialBackoff: true,
        onProgress: (p) => onProgress?.(p.completedTasks, p.totalTasks),
        onTaskFail: (taskId, error) => { log.error(`Shot narration failed for ${taskId}: ${error.message}`); },
    });

    const results: Array<{ shotId: string; sceneId: string; audioBlob: Blob; duration: number; text: string }> = [];
    for (const result of taskResults) {
        if (result.success && result.data) results.push(result.data);
    }

    const failedCount = taskResults.filter(r => !r.success).length;
    if (failedCount > 0) log.warn(`narrateAllShots: ${failedCount} shots failed (non-fatal)`);

    log.info(`narrateAllShots: completed ${results.length}/${tasks.length} shots`);
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

interface DialoguePlan {
    transcript: string;
    speakers: SpeakerConfig[];
}

/**
 * Analyzes a script for dialogue and returns a multi-speaker plan when Gemini's
 * 2-speaker cap can be satisfied. Returns null to signal single-speaker fallback.
 *
 * Speaker label mapping: dialogue detection's generic roles ('narrator', 'male',
 * 'female', etc.) are given human first names Gemini handles more naturally.
 */
function planDialogueSpeakers(script: string, narratorVoice: TTSVoice): DialoguePlan | null {
    if (!hasDialogue(script)) return null;

    const segments = detectDialogue(script);
    const uniqueRoles = Array.from(new Set(segments.map(s => s.speaker)));

    if (uniqueRoles.length < 2 || uniqueRoles.length > 2) return null;

    const roleToName: Record<DialogueSegment['speaker'], string> = {
        narrator: 'Narrator',
        male: 'Alex',
        female: 'Maya',
        elder: 'Victor',
        youth: 'Riley',
        mysterious: 'Shadow',
    };

    const roleToVoice = (role: DialogueSegment['speaker']): TTSVoice =>
        role === 'narrator' ? narratorVoice : CHARACTER_VOICE_MAP[role];

    const speakers: SpeakerConfig[] = uniqueRoles.map(role => ({
        name: roleToName[role],
        voiceName: roleToVoice(role),
    }));

    const transcript = segments
        .map(seg => `${roleToName[seg.speaker]}: ${seg.text.trim()}`)
        .filter(line => line.split(': ')[1]?.length)
        .join('\n');

    if (!transcript.trim()) return null;

    return { transcript, speakers };
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
