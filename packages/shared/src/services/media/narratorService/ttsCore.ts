/**
 * Narrator Service — TTS synthesis core (Gemini + DeAPI routing, PCM/WAV, throttle gate)
 */

import { ai, API_KEY, MODELS, withRetry } from '../../shared/apiClient';
import { EmotionalTone, InstructionTriplet } from "../../types";
import { VideoPurpose, type LanguageCode } from "../../constants";
import { traceAsync } from "../../tracing";
import { logAICall } from "../../infrastructure/aiLogService";
import { getEffectiveLegacyTone } from "../../content/tripletUtils";
import { tripletToPromptFragments } from "../../prompt/vibeLibrary";
import { convertMarkersToDirectorNote } from "../../tts/deliveryMarkers";
import { generateDeapiQwenTTS, mapLanguageToDeApiFormat, DEAPI_TTS_MODELS, type DeApiTtsModel } from "../deapiService";
import {
    TTSProvider,
    TTSVoice,
    TTS_VOICES,
    StylePrompt,
    ExtendedVoiceConfig,
    TONE_VOICE_MAP,
} from "./voiceConfig";

// --- TTS Throttling (mutex-safe for parallel callers) ---

const TTS_INTER_CALL_DELAY_MS = 2000;
let _ttsGate: Promise<void> = Promise.resolve();

async function acquireTtsSlot(): Promise<() => void> {
    let releaseCallback!: () => void;
    const thisSlot = new Promise<void>(resolve => { releaseCallback = resolve; });
    const prevGate = _ttsGate;
    _ttsGate = prevGate.then(() => thisSlot);
    await prevGate;
    return () => { setTimeout(releaseCallback, TTS_INTER_CALL_DELAY_MS); };
}

// --- NarratorConfig ---

export interface NarratorConfig {
    model?: string;
    defaultVoice?: TTSVoice;
    videoPurpose?: VideoPurpose;
    styleOverride?: StylePrompt;
    language?: LanguageCode;
    provider?: TTSProvider;
    deapiModel?: DeApiTtsModel;
}

export const DEFAULT_NARRATOR_CONFIG: Required<Omit<NarratorConfig, 'styleOverride' | 'language' | 'provider' | 'deapiModel'>> & {
    styleOverride?: StylePrompt;
    language?: LanguageCode;
    provider?: TTSProvider;
    deapiModel?: DeApiTtsModel;
} = {
    model: MODELS.TTS,
    defaultVoice: TTS_VOICES.KORE,
    videoPurpose: "documentary",
    provider: "gemini",
    deapiModel: DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN,
};

// --- Error Types ---

export class NarratorError extends Error {
    constructor(
        message: string,
        public readonly code: "API_FAILURE" | "INVALID_INPUT" | "AUDIO_ERROR" | "NOT_CONFIGURED",
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = "NarratorError";
    }
}

// --- Director Note Helpers ---

export function buildDirectorNote(stylePrompt?: StylePrompt): string {
    if (!stylePrompt) return "";
    if (stylePrompt.customDirectorNote) return stylePrompt.customDirectorNote;

    const parts: string[] = [];
    if (stylePrompt.persona) parts.push(`Speak as ${stylePrompt.persona}`);
    if (stylePrompt.emotion) parts.push(`with a ${stylePrompt.emotion} tone`);
    if (stylePrompt.pacing) parts.push(`at a ${stylePrompt.pacing} pace`);
    if (stylePrompt.accent) parts.push(`in a ${stylePrompt.accent} style`);
    return parts.join(", ");
}

export function buildTripletDirectorNote(triplet: InstructionTriplet): string {
    const { emotionFragment, cinematicFragment, atmosphereFragment } = tripletToPromptFragments(triplet);
    return `Deliver this with ${emotionFragment}, matching the visual intensity of ${cinematicFragment}, as if speaking within ${atmosphereFragment}`;
}

// --- PCM/WAV Utilities ---

function createWavHeader(pcmDataLength: number, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Uint8Array {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const fileSize = 36 + pcmDataLength;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    const writeStr = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, fileSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, pcmDataLength, true);

    return new Uint8Array(header);
}

function pcmToWav(pcmData: Uint8Array): Blob {
    const wavHeader = createWavHeader(pcmData.length);
    const wavData = new Uint8Array(wavHeader.length + pcmData.length);
    wavData.set(wavHeader, 0);
    wavData.set(pcmData, wavHeader.length);
    return new Blob([wavData], { type: 'audio/wav' });
}

function formatTextWithStyle(text: string, stylePrompt?: StylePrompt): string {
    const { directorInstructions: markerInstructions, cleanText } = convertMarkersToDirectorNote(text);
    const baseNote = buildDirectorNote(stylePrompt);
    const combinedNote = [baseNote, markerInstructions].filter(Boolean).join(". ");
    return combinedNote ? `${combinedNote}: "${cleanText}"` : cleanText;
}

// --- Core TTS ---

export const synthesizeSpeech = traceAsync(
    async function synthesizeSpeechImpl(
        text: string,
        voiceConfig: ExtendedVoiceConfig | EmotionalTone = "friendly",
        config?: NarratorConfig
    ): Promise<Blob> {
        if (!API_KEY) {
            throw new NarratorError("Gemini API key is not configured", "NOT_CONFIGURED");
        }

        if (!text?.trim()) {
            throw new NarratorError("Text is required for speech synthesis", "INVALID_INPUT");
        }

        const resolvedConfig: ExtendedVoiceConfig = typeof voiceConfig === "string"
            ? TONE_VOICE_MAP[voiceConfig]
            : voiceConfig;

        const mergedConfig = { ...DEFAULT_NARRATOR_CONFIG, ...config };
        const directorNote = buildDirectorNote(resolvedConfig.stylePrompt);

        if (mergedConfig.provider === 'deapi_qwen') {
            console.log(`[Narrator] Routing to DeAPI Qwen3 TTS...`);
            const qwenLang = mapLanguageToDeApiFormat(mergedConfig.language);
            return await withRetry(() =>
                generateDeapiQwenTTS(text, directorNote, qwenLang, mergedConfig.deapiModel)
            , 3, 2000, 2);
        }

        const styledText = formatTextWithStyle(text, resolvedConfig.stylePrompt);

        console.log(`[Narrator] Synthesizing speech: "${text.substring(0, 50)}..." with voice ${resolvedConfig.voiceName}`);
        if (resolvedConfig.stylePrompt) {
            console.log(`[Narrator] Using style prompt: ${buildDirectorNote(resolvedConfig.stylePrompt)}`);
        }

        const releaseSlot = await acquireTtsSlot();

        try {
            return await withRetry(async () => {
                const response = await ai.models.generateContent({
                    model: mergedConfig.model,
                    contents: [{ role: "user", parts: [{ text: styledText }] }],
                    config: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: resolvedConfig.voiceName },
                            },
                        },
                    },
                });

                const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;

                if (!audioData?.data || !audioData?.mimeType) {
                    throw new NarratorError("No audio data in response", "API_FAILURE");
                }

                const binaryString = atob(audioData.data);
                const pcmData = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    pcmData[i] = binaryString.charCodeAt(i);
                }

                console.log(`[Narrator] Received ${pcmData.length} bytes of PCM audio, converting to WAV`);
                return pcmToWav(pcmData);
            }, 5, 2000, 2);
        } catch (error) {
            console.error("[Narrator] TTS synthesis failed:", error);
            throw new NarratorError(
                `Speech synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
                "API_FAILURE",
                error instanceof Error ? error : undefined
            );
        } finally {
            releaseSlot();
        }
    },
    "synthesizeSpeech",
    { runType: "tool", metadata: { service: "narrator", operation: "tts" }, tags: ["tts", "gemini", "audio"] }
);

export function calculateAudioDuration(audioBlob: Blob): number {
    const WAV_HEADER_SIZE = 44;
    const BYTES_PER_SECOND = 24000 * 2 * 1;
    return (audioBlob.size - WAV_HEADER_SIZE) / BYTES_PER_SECOND;
}
