/**
 * Narrator Service
 * 
 * Text-to-Speech generation for video narration using Gemini TTS.
 * Uses the gemini-2.5-flash-preview-tts model with audio response modality.
 * 
 * Responsibilities:
 * - Convert narration scripts to speech audio
 * - Match voice style to emotional tone
 * - Generate audio segments for each scene
 */

import { ai, API_KEY, MODELS, withRetry } from "./shared/apiClient";
import { Scene, NarrationSegment, EmotionalTone, InstructionTriplet, VideoFormat, ShotlistEntry, ScreenplayScene } from "../types";
import { ParallelExecutionEngine } from "./parallelExecutionEngine";
import { cleanForTTS } from "./textSanitizer";
import { VideoPurpose, type LanguageCode } from "../constants";
import { traceAsync } from "./tracing";
import { cloudAutosave } from "./cloudStorageService";
import { logAICall } from "./aiLogService";
import { getEffectiveTriplet, getEffectiveLegacyTone } from "./tripletUtils";
import { tripletToPromptFragments } from "./prompt/vibeLibrary";
import { convertMarkersToDirectorNote } from "./tts/deliveryMarkers";

// --- TTS Throttling (mutex-safe for parallel callers) ---
// Gemini TTS has rate limits; enforce minimum delay between calls via a promise-chain mutex.
// The old TOCTOU pattern (read lastTtsCallTime → check → set) allowed concurrent callers to
// both see "enough time has passed" and proceed simultaneously. The gate below serializes all
// TTS callers globally so only one call is in-flight at a time with a mandatory 2s cooldown.

const TTS_INTER_CALL_DELAY_MS = 2000;

// A promise chain that gates TTS calls sequentially with enforced spacing.
let _ttsGate: Promise<void> = Promise.resolve();

/**
 * Acquire a TTS slot — returns a release function that the caller MUST invoke
 * (in a finally block) after the API call completes.
 * The release function starts the 2-second cooldown timer for the next caller.
 */
async function acquireTtsSlot(): Promise<() => void> {
    let releaseCallback!: () => void;
    const thisSlot = new Promise<void>(resolve => { releaseCallback = resolve; });

    // Chain onto the existing gate so callers queue up in arrival order.
    const prevGate = _ttsGate;
    _ttsGate = prevGate.then(() => thisSlot);

    // Wait until all previous callers have finished AND their cooldown has elapsed.
    await prevGate;

    // Our turn. Return the release function — caller must invoke it in finally{}.
    // It starts TTS_INTER_CALL_DELAY_MS timer then unblocks the next caller.
    return () => {
        setTimeout(releaseCallback, TTS_INTER_CALL_DELAY_MS);
    };
}

// --- Voice Configuration ---

/**
 * Available Gemini TTS voices
 * See: https://cloud.google.com/text-to-speech/docs/voices
 */
export const TTS_VOICES = {
    // English voices with different characteristics
    KORE: "Kore",      // Warm, friendly female voice
    CHARON: "Charon",  // Deep, authoritative male voice  
    PUCK: "Puck",      // Energetic, youthful voice
    FENRIR: "Fenrir",  // Strong, dramatic voice
    AOEDE: "Aoede",    // Calm, soothing female voice
    LEDA: "Leda",      // Professional, clear female voice
    ORUS: "Orus",      // Balanced, neutral male voice
    ZEPHYR: "Zephyr",  // Light, airy voice
} as const;

export type TTSVoice = typeof TTS_VOICES[keyof typeof TTS_VOICES];

/**
 * Voice configuration for TTS
 */
export interface VoiceConfig {
    voiceName: TTSVoice;
    pitch?: number;      // -20.0 to 20.0, 0 is normal
    speakingRate?: number; // 0.25 to 4.0, 1.0 is normal
}

/**
 * Style prompt configuration for Gemini 2.5 TTS "Director's Notes"
 * These natural language instructions steer the voice performance.
 */
export interface StylePrompt {
    /** Character persona (e.g., "A wise old storyteller", "An excited sports commentator") */
    persona?: string;
    /** Emotional delivery (e.g., "warm and reassuring", "tense and suspenseful") */
    emotion?: string;
    /** Speaking pace (e.g., "slow and deliberate", "fast-paced and energetic") */
    pacing?: string;
    /** Accent or style (e.g., "British narrator", "casual conversational") */
    accent?: string;
    /** Custom director's note (overrides other style options if provided) */
    customDirectorNote?: string;
}

/**
 * Extended voice configuration with style prompts
 */
export interface ExtendedVoiceConfig extends VoiceConfig {
    stylePrompt?: StylePrompt;
}

/**
 * Maps emotional tone to recommended voice settings with style prompts
 */
const TONE_VOICE_MAP: Record<EmotionalTone, ExtendedVoiceConfig> = {
    professional: {
        voiceName: TTS_VOICES.LEDA,
        pitch: 0,
        speakingRate: 1.1,
        stylePrompt: {
            persona: "A polished corporate presenter delivering a keynote",
            emotion: "clear, authoritative, confident, and composed",
            pacing: "measured and articulate with crisp enunciation"
        }
    },
    dramatic: {
        voiceName: TTS_VOICES.FENRIR,
        pitch: -2,
        speakingRate: 0.95,
        stylePrompt: {
            persona: "A legendary storyteller narrating an epic tale by firelight",
            emotion: "intense, powerful, gripping, with gravitas",
            pacing: "deliberate with dramatic pauses before key revelations"
        }
    },
    friendly: {
        voiceName: TTS_VOICES.PUCK,
        pitch: 2,
        speakingRate: 1.2,
        stylePrompt: {
            persona: "An enthusiastic best friend sharing an exciting story",
            emotion: "warm, cheerful, genuine, and inviting",
            pacing: "natural and conversational with energetic emphasis"
        }
    },
    urgent: {
        voiceName: TTS_VOICES.CHARON,
        pitch: -1,
        speakingRate: 1.3,
        stylePrompt: {
            persona: "A field correspondent reporting live from a crisis zone",
            emotion: "alert, compelling, serious, with controlled intensity",
            pacing: "rapid and purposeful, each word hitting with weight"
        }
    },
    calm: {
        voiceName: TTS_VOICES.AOEDE,
        pitch: -3,
        speakingRate: 0.9,
        stylePrompt: {
            persona: "A gentle guide leading a moonlit meditation",
            emotion: "serene, soothing, peaceful, like a warm breeze",
            pacing: "slow and flowing with long restful pauses between phrases"
        }
    },
};

// --- Configuration ---

export interface NarratorConfig {
    model?: string;
    defaultVoice?: TTSVoice;
    /** Video purpose for auto-selecting appropriate style prompts */
    videoPurpose?: VideoPurpose;
    /** Override style prompt (takes precedence over auto-selection) */
    styleOverride?: StylePrompt;
    /** Content language - affects voice selection for multilingual support */
    language?: LanguageCode;
}

/**
 * Language-to-voice mapping for multilingual TTS support.
 * Some voices work better for certain languages.
 */
const LANGUAGE_VOICE_MAP: Partial<Record<string, TTSVoice>> = {
    'ar': TTS_VOICES.AOEDE,   // Arabic - Aoede has better multilingual support
    'en': TTS_VOICES.KORE,    // English - Kore is the default English voice
    'es': TTS_VOICES.AOEDE,   // Spanish
    'fr': TTS_VOICES.AOEDE,   // French
    'de': TTS_VOICES.ORUS,    // German
    'ru': TTS_VOICES.CHARON,  // Russian
    'zh': TTS_VOICES.AOEDE,   // Chinese
    'ja': TTS_VOICES.AOEDE,   // Japanese
    'ko': TTS_VOICES.AOEDE,   // Korean
    'hi': TTS_VOICES.AOEDE,   // Hindi
    'tr': TTS_VOICES.AOEDE,   // Turkish
    'fa': TTS_VOICES.AOEDE,   // Persian
    'ur': TTS_VOICES.AOEDE,   // Urdu
    'he': TTS_VOICES.AOEDE,   // Hebrew
};

const DEFAULT_CONFIG: Required<Omit<NarratorConfig, 'styleOverride' | 'language'>> & { styleOverride?: StylePrompt; language?: LanguageCode } = {
    model: MODELS.TTS,
    defaultVoice: TTS_VOICES.KORE,
    videoPurpose: "documentary",
};

// --- Multi-Voice Dialogue Support ---

/**
 * Character voice mapping for dialogue scenes.
 * Different voices for narrator, male, and female characters.
 */
export const CHARACTER_VOICE_MAP = {
    narrator: TTS_VOICES.KORE,       // Default narrator voice
    male: TTS_VOICES.CHARON,         // Deep male voice for male characters
    female: TTS_VOICES.AOEDE,        // Soft female voice for female characters
    elder: TTS_VOICES.ORUS,          // Wise elder voice
    youth: TTS_VOICES.PUCK,          // Energetic young voice
    mysterious: TTS_VOICES.FENRIR,   // Dramatic mysterious voice
} as const;

/**
 * Represents a segment of dialogue with speaker identification
 */
export interface DialogueSegment {
    /** Type of speaker */
    speaker: 'narrator' | 'male' | 'female' | 'elder' | 'youth' | 'mysterious';
    /** The text spoken by this speaker */
    text: string;
    /** Whether this is quoted dialogue */
    isDialogue: boolean;
}

/**
 * Detects dialogue patterns in narration scripts and splits into segments.
 * Supports patterns like:
 * - "Hello," said John.
 * - John said, "Hello."
 * - "Hello!" (standalone dialogue)
 * 
 * @param script - The narration script to analyze
 * @returns Array of dialogue segments with speaker identification
 */
export function detectDialogue(script: string): DialogueSegment[] {
    const segments: DialogueSegment[] = [];

    // Pattern to match quoted dialogue with optional speaker tags
    // Matches: "text" [said/asked/replied etc] [name], or [name] [said etc] "text"
    const dialoguePattern = /"([^"]+)"/g;
    const speakerHintPattern = /\b(he|she|the man|the woman|the old man|the elder|the boy|the girl|grandfather|grandmother)\b/i;
    const maleSpeakerPattern = /\b(he|man|boy|father|grandfather|king|lord|sir|mr|uncle|brother|son)\b/i;
    const femaleSpeakerPattern = /\b(she|woman|girl|mother|grandmother|queen|lady|mrs|miss|aunt|sister|daughter)\b/i;
    const elderPattern = /\b(old|elder|grandfather|grandmother|ancient|wise|sage)\b/i;
    const youthPattern = /\b(young|boy|girl|child|kid|youth|teen)\b/i;

    let lastIndex = 0;
    let match;

    while ((match = dialoguePattern.exec(script)) !== null) {
        const dialogueText = match[1];
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Add narration before dialogue
        if (matchStart > lastIndex) {
            const narrationText = script.slice(lastIndex, matchStart).trim();
            if (narrationText) {
                segments.push({
                    speaker: 'narrator',
                    text: narrationText,
                    isDialogue: false,
                });
            }
        }

        // Determine speaker from context (look at surrounding text)
        const contextStart = Math.max(0, matchStart - 50);
        const contextEnd = Math.min(script.length, matchEnd + 50);
        const context = script.slice(contextStart, contextEnd);

        let speaker: DialogueSegment['speaker'] = 'narrator';

        if (elderPattern.test(context)) {
            speaker = 'elder';
        } else if (youthPattern.test(context)) {
            speaker = 'youth';
        } else if (femaleSpeakerPattern.test(context)) {
            speaker = 'female';
        } else if (maleSpeakerPattern.test(context)) {
            speaker = 'male';
        }

        segments.push({
            speaker,
            text: dialogueText || "",
            isDialogue: true,
        });

        lastIndex = matchEnd;
    }

    // Add remaining narration
    if (lastIndex < script.length) {
        const remainingText = script.slice(lastIndex).trim();
        if (remainingText) {
            segments.push({
                speaker: 'narrator',
                text: remainingText,
                isDialogue: false,
            });
        }
    }

    // If no dialogue found, return entire script as narrator
    if (segments.length === 0) {
        segments.push({
            speaker: 'narrator',
            text: script,
            isDialogue: false,
        });
    }

    return segments;
}

/**
 * Check if a script contains dialogue that would benefit from multi-voice
 */
export function hasDialogue(script: string): boolean {
    const dialoguePattern = /"[^"]+"/;
    return dialoguePattern.test(script);
}

/**
 * Maps video purpose to recommended style prompts.
 * These enhance the base emotional tone with purpose-specific delivery.
 */
const PURPOSE_STYLE_MAP: Record<VideoPurpose, StylePrompt> = {
    music_video: {
        persona: "A cinematic music video narrator",
        emotion: "emotional, evocative, and artistic",
        pacing: "rhythmic, matching the musical flow"
    },
    social_short: {
        persona: "A trendy social media content creator",
        emotion: "energetic, punchy, and attention-grabbing",
        pacing: "fast and dynamic with quick delivery"
    },
    documentary: {
        persona: "A professional documentary narrator",
        emotion: "informative, engaging, and authoritative",
        pacing: "measured and thoughtful"
    },
    commercial: {
        persona: "A persuasive commercial voice-over artist",
        emotion: "confident, trustworthy, and compelling",
        pacing: "polished and well-articulated"
    },
    podcast_visual: {
        persona: "A conversational podcast host",
        emotion: "warm, relatable, and authentic",
        pacing: "natural and conversational"
    },
    lyric_video: {
        persona: "A poetic lyric narrator",
        emotion: "expressive, melodic, and heartfelt",
        pacing: "flowing and synchronized with the music"
    },
    storytelling: {
        persona: "A master storyteller weaving an epic tale",
        emotion: "dramatic, immersive, and captivating",
        pacing: "natural with occasional dramatic pauses"
    },
    educational: {
        persona: "A friendly and knowledgeable teacher",
        emotion: "clear, encouraging, and patient",
        pacing: "steady and easy to follow"
    },
    horror_mystery: {
        persona: "A mysterious narrator telling a chilling tale",
        emotion: "eerie, suspenseful, and unsettling",
        pacing: "steady with subtle tension, not too slow"
    },
    travel: {
        persona: "An adventurous travel documentary host",
        emotion: "wonder-filled, inspiring, and enthusiastic",
        pacing: "flowing and descriptive"
    },
    motivational: {
        persona: "An inspiring motivational speaker",
        emotion: "powerful, uplifting, and empowering",
        pacing: "building energy with impactful delivery"
    },
    news_report: {
        persona: "A professional news anchor",
        emotion: "objective, clear, and authoritative",
        pacing: "crisp and well-articulated"
    },
    story_drama: {
        persona: "A dramatic storyteller with emotional depth",
        emotion: "intense, moving, and deeply felt",
        pacing: "measured with emotional crescendos"
    },
    story_comedy: {
        persona: "A witty comedic narrator",
        emotion: "light-hearted, playful, and humorous",
        pacing: "upbeat with well-timed comedic beats"
    },
    story_thriller: {
        persona: "A tense thriller narrator",
        emotion: "suspenseful, gripping, and urgent",
        pacing: "tight and relentless with sudden shifts"
    },
    story_scifi: {
        persona: "A futuristic sci-fi narrator",
        emotion: "awe-inspiring, cerebral, and visionary",
        pacing: "steady with moments of wonder"
    },
    story_action: {
        persona: "A high-energy action narrator",
        emotion: "thrilling, explosive, and adrenaline-fueled",
        pacing: "fast and intense with punchy delivery"
    },
    story_fantasy: {
        persona: "An enchanting fantasy storyteller",
        emotion: "magical, wondrous, and mythical",
        pacing: "flowing and grand with epic moments"
    },
    story_romance: {
        persona: "A tender romantic narrator",
        emotion: "warm, passionate, and intimate",
        pacing: "gentle and heartfelt"
    },
    story_historical: {
        persona: "A distinguished historical narrator",
        emotion: "reverent, authoritative, and evocative",
        pacing: "stately and deliberate"
    },
    story_animation: {
        persona: "A lively animated story narrator",
        emotion: "colorful, expressive, and fun",
        pacing: "dynamic and energetic"
    },
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

// --- Main TTS Functions ---

/**
 * Build a natural language style prompt (Director's Note) for Gemini TTS.
 * This prepends instructions to the text to steer voice performance.
 * 
 * @param stylePrompt - Style configuration
 * @returns Formatted director's note string
 */
function buildDirectorNote(stylePrompt?: StylePrompt): string {
    if (!stylePrompt) return "";

    // If custom note provided, use it directly
    if (stylePrompt.customDirectorNote) {
        return stylePrompt.customDirectorNote;
    }

    const parts: string[] = [];

    if (stylePrompt.persona) {
        parts.push(`Speak as ${stylePrompt.persona}`);
    }

    if (stylePrompt.emotion) {
        parts.push(`with a ${stylePrompt.emotion} tone`);
    }

    if (stylePrompt.pacing) {
        parts.push(`at a ${stylePrompt.pacing} pace`);
    }

    if (stylePrompt.accent) {
        parts.push(`in a ${stylePrompt.accent} style`);
    }

    return parts.length > 0 ? parts.join(", ") : "";
}

/**
 * Merge multiple style prompts, with later ones taking precedence.
 * This allows layering: base tone style + purpose style + custom override.
 */
function mergeStylePrompts(...prompts: (StylePrompt | undefined)[]): StylePrompt {
    const merged: StylePrompt = {};

    for (const prompt of prompts) {
        if (!prompt) continue;

        // Custom director note overrides everything
        if (prompt.customDirectorNote) {
            return { customDirectorNote: prompt.customDirectorNote };
        }

        if (prompt.persona) merged.persona = prompt.persona;
        if (prompt.emotion) merged.emotion = prompt.emotion;
        if (prompt.pacing) merged.pacing = prompt.pacing;
        if (prompt.accent) merged.accent = prompt.accent;
    }

    return merged;
}

/**
 * Get the best style prompt for a given context.
 * Combines emotional tone, video purpose, and any custom overrides.
 * 
 * @param emotionalTone - The scene's emotional tone
 * @param videoPurpose - The video's purpose (optional)
 * @param styleOverride - Custom style override (optional)
 * @returns Merged style prompt
 */
export function getAutoStylePrompt(
    emotionalTone: EmotionalTone,
    videoPurpose?: VideoPurpose,
    styleOverride?: StylePrompt
): StylePrompt {
    const toneStyle = TONE_VOICE_MAP[emotionalTone]?.stylePrompt;
    const purposeStyle = videoPurpose ? PURPOSE_STYLE_MAP[videoPurpose] : undefined;

    // Layer: tone style (base) -> purpose style (context) -> override (custom)
    return mergeStylePrompts(toneStyle, purposeStyle, styleOverride);
}

/**
 * Build a Director's Note from an InstructionTriplet.
 * Looks up vibe term prompt fragments and assembles a rich voice direction.
 */
export function buildTripletDirectorNote(triplet: InstructionTriplet): string {
    const { emotionFragment, cinematicFragment, atmosphereFragment } = tripletToPromptFragments(triplet);

    return `Deliver this with ${emotionFragment}, matching the visual intensity of ${cinematicFragment}, as if speaking within ${atmosphereFragment}`;
}

/**
 * Format text with director's note for Gemini TTS.
 * Uses the natural language prompt format: "[Director's Note]: [Text]"
 * 
 * @param text - The text to speak
 * @param stylePrompt - Optional style configuration
 * @returns Formatted text with director's note
 */
function formatTextWithStyle(text: string, stylePrompt?: StylePrompt): string {
    // First, extract delivery markers from the text
    const { directorInstructions: markerInstructions, cleanText } = convertMarkersToDirectorNote(text);

    // Build the base director note from style prompt
    const baseNote = buildDirectorNote(stylePrompt);

    // Combine: base style note + marker-derived instructions
    const parts = [baseNote, markerInstructions].filter(Boolean);
    const combinedNote = parts.join(". ");

    if (!combinedNote) {
        return cleanText;
    }

    // Gemini 2.5 TTS format: prepend style instruction
    return `${combinedNote}: "${cleanText}"`;
}

/**
 * Create a WAV header for PCM audio data.
 * Gemini TTS returns raw PCM (L16) at 24kHz, 16-bit mono.
 * We need to add WAV headers for browser playback.
 * 
 * @param pcmDataLength - Length of PCM data in bytes
 * @param sampleRate - Sample rate (default 24000 for Gemini TTS)
 * @param numChannels - Number of channels (default 1 for mono)
 * @param bitsPerSample - Bits per sample (default 16)
 * @returns WAV header as Uint8Array
 */
function createWavHeader(
    pcmDataLength: number,
    sampleRate: number = 24000,
    numChannels: number = 1,
    bitsPerSample: number = 16
): Uint8Array {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmDataLength;
    const fileSize = 36 + dataSize;

    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    return new Uint8Array(header);
}

/**
 * Helper to write ASCII string to DataView
 */
function writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

/**
 * Convert raw PCM data to WAV format for browser playback.
 * 
 * @param pcmData - Raw PCM audio data (L16, 24kHz, mono)
 * @returns WAV blob that can be played in browser
 */
function pcmToWav(pcmData: Uint8Array): Blob {
    const wavHeader = createWavHeader(pcmData.length);
    const wavData = new Uint8Array(wavHeader.length + pcmData.length);
    wavData.set(wavHeader, 0);
    wavData.set(pcmData, wavHeader.length);
    return new Blob([wavData], { type: 'audio/wav' });
}

/**
 * Generate speech audio from text using Gemini TTS.
 * Supports Gemini 2.5 TTS "Director's Notes" for voice steering.
 * 
 * @param text - The text to convert to speech
 * @param voiceConfig - Voice configuration (or emotional tone)
 * @param config - Optional narrator config
 * @returns Audio blob as WAV (playable in browser)
 */
export const synthesizeSpeech = traceAsync(
    async function synthesizeSpeechImpl(
        text: string,
        voiceConfig: ExtendedVoiceConfig | EmotionalTone = "friendly",
        config?: NarratorConfig
    ): Promise<Blob> {
        if (!API_KEY) {
            throw new NarratorError(
                "Gemini API key is not configured",
                "NOT_CONFIGURED"
            );
        }

        if (!text?.trim()) {
            throw new NarratorError(
                "Text is required for speech synthesis",
                "INVALID_INPUT"
            );
        }

        // Resolve voice config from emotional tone if needed
        const resolvedConfig: ExtendedVoiceConfig = typeof voiceConfig === "string"
            ? TONE_VOICE_MAP[voiceConfig]
            : voiceConfig;

        const mergedConfig = { ...DEFAULT_CONFIG, ...config };

        // Format text with style prompt (Director's Note) for Gemini 2.5 TTS
        const styledText = formatTextWithStyle(text, resolvedConfig.stylePrompt);

        console.log(`[Narrator] Synthesizing speech: "${text.substring(0, 50)}..." with voice ${resolvedConfig.voiceName}`);
        if (resolvedConfig.stylePrompt) {
            console.log(`[Narrator] Using style prompt: ${buildDirectorNote(resolvedConfig.stylePrompt)}`);
        }

        // Acquire TTS slot (mutex) to prevent rate limiting.
        // MUST release in finally{} so the next caller can proceed after 2s cooldown.
        const releaseSlot = await acquireTtsSlot();

        // TTS is prone to transient 500 errors - use more aggressive retry settings
        // NarratorError wrapping is OUTSIDE withRetry so the raw API error (with .status)
        // reaches withRetry's isRetryable check instead of a wrapped NarratorError.
        try {
            return await withRetry(async () => {
                // Use the Gemini TTS model with audio response modality
                const response = await ai.models.generateContent({
                    model: mergedConfig.model,
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: styledText }],
                        },
                    ],
                    config: {
                        responseModalities: ["AUDIO"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: resolvedConfig.voiceName,
                                },
                            },
                        },
                    },
                });

                // Extract audio data from response
                const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;

                if (!audioData?.data || !audioData?.mimeType) {
                    throw new NarratorError(
                        "No audio data in response",
                        "API_FAILURE"
                    );
                }

                // Convert base64 to Uint8Array
                const binaryString = atob(audioData.data);
                const pcmData = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    pcmData[i] = binaryString.charCodeAt(i);
                }

                // Gemini TTS returns raw PCM (L16) at 24kHz, 16-bit mono
                // Convert to WAV format for browser playback
                console.log(`[Narrator] Received ${pcmData.length} bytes of PCM audio, converting to WAV`);
                return pcmToWav(pcmData);
            }, 5, 2000, 2); // 5 retries, starting at 2s delay, doubling each time (2s, 4s, 8s, 16s, 30s cap)
        } catch (error) {
            console.error("[Narrator] TTS synthesis failed:", error);
            throw new NarratorError(
                `Speech synthesis failed: ${error instanceof Error ? error.message : String(error)}`,
                "API_FAILURE",
                error instanceof Error ? error : undefined
            );
        } finally {
            releaseSlot(); // Starts 2s cooldown; next caller proceeds after it elapses.
        }
    },
    "synthesizeSpeech",
    {
        runType: "tool",
        metadata: { service: "narrator", operation: "tts" },
        tags: ["tts", "gemini", "audio"],
    }
);

/**
 * Calculate actual audio duration from WAV blob.
 * Since we convert to WAV with known parameters (24kHz, 16-bit, mono),
 * we can calculate duration precisely.
 * 
 * @param audioBlob - The WAV audio blob
 * @returns Duration in seconds
 */
export function calculateAudioDuration(audioBlob: Blob): number {
    // WAV header is 44 bytes, rest is PCM data
    // PCM at 24kHz, 16-bit (2 bytes), mono = 48000 bytes per second
    const WAV_HEADER_SIZE = 44;
    const BYTES_PER_SECOND = 24000 * 2 * 1; // sampleRate * bytesPerSample * channels

    const pcmDataSize = audioBlob.size - WAV_HEADER_SIZE;
    return pcmDataSize / BYTES_PER_SECOND;
}

/**
 * Generate narration for a single scene.
 * Automatically applies style prompts based on emotional tone and video purpose.
 *
 * @param scene - The scene to narrate
 * @param config - Optional narrator config (includes videoPurpose for auto-styling)
 * @param sessionId - Optional session ID for cloud autosave
 * @returns Narration segment with audio blob
 */
export async function narrateScene(
    scene: Scene,
    config?: NarratorConfig,
    sessionId?: string
): Promise<NarrationSegment> {
    console.log(`[Narrator] Narrating scene: ${scene.name}`);

    // Resolve tone via triplet bridge (backward compatible)
    const effectiveTone = getEffectiveLegacyTone(scene);

    // Get base voice config from effective emotional tone
    const baseVoiceConfig = TONE_VOICE_MAP[effectiveTone];

    // Check if language-specific voice should be used
    const languageVoice = config?.language && config.language !== 'auto'
        ? LANGUAGE_VOICE_MAP[config.language]
        : undefined;

    // Build style prompt: triplet-based if available, else legacy auto-style
    let stylePrompt: StylePrompt;

    if (scene.instructionTriplet) {
        // New system: rich Director's Note from InstructionTriplet
        const tripletNote = buildTripletDirectorNote(scene.instructionTriplet);
        stylePrompt = { customDirectorNote: tripletNote };
        console.log(`[Narrator] Using triplet-based director note for "${scene.name}"`);
    } else {
        // Legacy: auto-generate from tone + purpose + override
        stylePrompt = getAutoStylePrompt(
            effectiveTone,
            config?.videoPurpose,
            config?.styleOverride
        );
    }

    // Create enhanced voice config with auto-generated style
    // Language-specific voice takes precedence if set
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
        audioBlob = await synthesizeSpeech(
            scene.narrationScript,
            enhancedVoiceConfig,
            config
        );
    } catch (err) {
        // Log the failed TTS call
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

    // Calculate duration from WAV blob (precise since we know the format)
    const audioDuration = calculateAudioDuration(audioBlob);

    // Log the successful TTS call (fire-and-forget)
    if (sessionId) {
        logAICall({
            sessionId,
            step: 'tts',
            model: MODELS.TTS,
            input: scene.narrationScript,
            output: `audio: ${audioDuration.toFixed(1)}s, ${audioBlob.size} bytes`,
            durationMs: Date.now() - ttsStart,
            status: 'success',
            metadata: {
                sceneName: scene.name,
                voice: enhancedVoiceConfig.voiceName,
                audioDurationSec: audioDuration,
                audioSizeBytes: audioBlob.size,
            },
        });
    }

    const wordCount = scene.narrationScript.split(/\s+/).filter(w => w.length > 0).length;
    console.log(`[Narrator] Scene "${scene.name}" audio: ${audioDuration.toFixed(1)}s (${wordCount} words, ${audioBlob.size} bytes)`);

    // Cloud autosave trigger (fire-and-forget, non-blocking)
    if (sessionId) {
        cloudAutosave.saveNarration(sessionId, audioBlob, scene.id).catch(err => {
            console.warn('[Narrator] Cloud autosave failed (non-fatal):', err);
        });
    }

    return {
        sceneId: scene.id,
        audioBlob,
        audioDuration,
        transcript: scene.narrationScript,
    };
}

/**
 * Generate narration for all scenes in a content plan.
 * 
 * @param scenes - Array of scenes to narrate
 * @param config - Optional narrator config
 * @param onProgress - Progress callback (sceneIndex, totalScenes)
 * @returns Array of narration segments
 */
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
    {
        runType: "chain",
        metadata: { service: "narrator" },
        tags: ["tts", "narration"],
    }
);

/**
 * Generate narration for all shots using per-shot scriptSegment text.
 * Falls back to scene action text when scriptSegment is absent.
 * Uses ParallelExecutionEngine with concurrency 2 (effectively serialized by acquireTtsSlot).
 *
 * @param shots - ShotlistEntry array with optional scriptSegment for per-shot narration text
 * @param screenplayScenes - ScreenplayScene[] for fallback action text
 * @param config - NarratorConfig (voice, language, etc.)
 * @param onProgress - Progress callback (completedCount, totalCount)
 * @param sessionId - For cloud autosave
 * @param existingStatus - Per-shot narration status map (skip shots already marked 'success')
 * @param existingShotNarrations - Already narrated shots (to skip on resume)
 * @returns Array of per-shot narration results (only successful ones)
 */
export async function narrateAllShots(
    shots: ShotlistEntry[],
    screenplayScenes: ScreenplayScene[],
    config: NarratorConfig | undefined,
    onProgress: ((completed: number, total: number) => void) | undefined,
    sessionId: string | undefined,
    existingStatus?: Record<string, 'pending' | 'success' | 'failed'>,
    existingShotNarrations?: Array<{ shotId: string; sceneId: string; audioUrl: string; duration: number; text: string }>,
): Promise<Array<{ shotId: string; sceneId: string; audioBlob: Blob; duration: number; text: string }>> {
    // Build scene action map for fallback text
    const sceneActionMap = new Map<string, string>();
    for (const scene of screenplayScenes) {
        sceneActionMap.set(scene.id, scene.action);
    }

    // Set of shot IDs already successfully narrated (for resume)
    const existingNarrationMap = new Map<string, NonNullable<typeof existingShotNarrations>[number]>(
        (existingShotNarrations || []).filter(n => n.audioUrl).map(n => [n.shotId, n])
    );

    // Filter to only shots that still need narration
    const shotsToProcess = shots.filter(shot => {
        if (existingStatus?.[shot.id] === 'success' && existingNarrationMap.has(shot.id)) {
            return false; // Already done
        }
        return true;
    });

    if (shotsToProcess.length === 0) {
        console.log('[Narrator] narrateAllShots: all shots already narrated, skipping');
        return [];
    }

    console.log(`[Narrator] narrateAllShots: narrating ${shotsToProcess.length}/${shots.length} shots`);

    // Default voice for shot-level narration (uses dramatic/storytelling profile)
    const defaultVoiceConfig: ExtendedVoiceConfig = TONE_VOICE_MAP['dramatic'];

    // Build tasks for the ParallelExecutionEngine
    const tasks = shotsToProcess
        .map(shot => {
            // Build narration text with fallback chain
            const rawText = shot.scriptSegment
                ?? sceneActionMap.get(shot.sceneId)
                ?? shot.description;
            const narrationText = cleanForTTS(rawText || '');

            // Skip shots with empty narration text (synthesizeSpeech throws on empty input)
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
        concurrencyLimit: 2, // 2 slots — effectively 1 due to acquireTtsSlot gate
        retryAttempts: 3,
        retryDelay: 3000,
        exponentialBackoff: true,
        onProgress: (p) => onProgress?.(p.completedTasks, p.totalTasks),
        onTaskFail: (taskId, error) => {
            console.error(`[Narrator] Shot narration failed for ${taskId}:`, error.message);
        },
    });

    // Collect only successful results
    const results: Array<{ shotId: string; sceneId: string; audioBlob: Blob; duration: number; text: string }> = [];
    for (const result of taskResults) {
        if (result.success && result.data) {
            results.push(result.data);
        }
    }

    const failedCount = taskResults.filter(r => !r.success).length;
    if (failedCount > 0) {
        console.warn(`[Narrator] narrateAllShots: ${failedCount} shots failed (non-fatal)`);
    }

    console.log(`[Narrator] narrateAllShots: completed ${results.length}/${tasks.length} shots`);
    return results;
}

/**
 * Get voice config for an emotional tone.
 */
export function getVoiceForTone(tone: EmotionalTone): ExtendedVoiceConfig {
    return TONE_VOICE_MAP[tone];
}

/**
 * Get list of available voices.
 */
export function getAvailableVoices(): TTSVoice[] {
    return Object.values(TTS_VOICES);
}

/**
 * Estimate narration duration from text.
 * Based on average speaking rate of 150 words per minute.
 * 
 * @param text - The narration text
 * @param speakingRate - Speaking rate multiplier (1.0 = normal)
 * @returns Estimated duration in seconds
 */
export function estimateNarrationDuration(
    text: string,
    speakingRate: number = 1.0
): number {
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const wordsPerSecond = (150 / 60) * speakingRate; // 2.5 words/sec at normal speed
    return Math.ceil(wordCount / wordsPerSecond);
}

/**
 * Create audio URL from narration segment for playback.
 */
export function createAudioUrl(segment: NarrationSegment): string {
    return URL.createObjectURL(segment.audioBlob);
}

/**
 * Revoke audio URL to free memory.
 */
export function revokeAudioUrl(url: string): void {
    URL.revokeObjectURL(url);
}

/**
 * Create a custom voice configuration with style prompt.
 * Use this for advanced voice steering beyond the preset emotional tones.
 * 
 * @example
 * // Create a spooky narrator voice
 * const spookyVoice = createCustomVoice({
 *     voiceName: "Charon",
 *     stylePrompt: {
 *         persona: "A mysterious storyteller from a haunted mansion",
 *         emotion: "eerie, whispering, and unsettling",
 *         pacing: "slow with long, suspenseful pauses"
 *     }
 * });
 * 
 * @example
 * // Create an excited sports commentator
 * const sportsVoice = createCustomVoice({
 *     voiceName: "Puck",
 *     stylePrompt: {
 *         customDirectorNote: "Speak like an excited sports commentator calling a winning goal, with rising energy and enthusiasm"
 *     }
 * });
 */
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

/**
 * Preset style prompts for common use cases.
 * Combine with any voice for quick styling.
 */
export const STYLE_PRESETS: Record<string, StylePrompt> = {
    // Narration styles
    DOCUMENTARY: {
        persona: "A documentary narrator",
        emotion: "informative, engaging, and thoughtful",
        pacing: "measured with natural pauses"
    },
    MOVIE_TRAILER: {
        persona: "An epic movie trailer voice",
        emotion: "dramatic, powerful, and intense",
        pacing: "slow and deliberate with dramatic pauses"
    },
    AUDIOBOOK: {
        persona: "A skilled audiobook narrator",
        emotion: "expressive, immersive, and captivating",
        pacing: "varied to match the story's rhythm"
    },

    // Character styles
    WISE_MENTOR: {
        persona: "A wise old mentor sharing ancient wisdom",
        emotion: "warm, knowing, and gentle",
        pacing: "slow and contemplative"
    },
    EXCITED_HOST: {
        persona: "An enthusiastic TV show host",
        emotion: "energetic, upbeat, and engaging",
        pacing: "fast and lively"
    },
    MYSTERIOUS: {
        persona: "A mysterious figure revealing secrets",
        emotion: "intriguing, hushed, and suspenseful",
        pacing: "slow with pregnant pauses"
    },

    // Functional styles
    TUTORIAL: {
        persona: "A patient teacher",
        emotion: "clear, helpful, and encouraging",
        pacing: "steady and easy to follow"
    },
    ANNOUNCEMENT: {
        persona: "A professional announcer",
        emotion: "clear, confident, and attention-grabbing",
        pacing: "crisp and well-articulated"
    },
    MEDITATION: {
        persona: "A calming meditation guide",
        emotion: "peaceful, soothing, and tranquil",
        pacing: "very slow with long, restful pauses"
    },
};

// --- Format-Specific Voice Profiles (Task 9.1) ---

/**
 * Voice profile configuration for a specific video format.
 * Combines a base voice, style prompt, and optional speaking rate adjustments.
 *
 * Requirements: 3.4, 4.4, 9.6, 14.1
 */
export interface FormatVoiceProfile {
    /** Human-readable profile label (e.g., "Conversational", "Energetic") */
    label: string;
    /** Base voice configuration */
    voice: ExtendedVoiceConfig;
    /** Corresponding VideoPurpose for legacy integration */
    videoPurpose: VideoPurpose;
}

/**
 * Maps each VideoFormat to a recommended voice profile.
 *
 * Requirements: 3.4 (YouTube conversational), 4.4 (Ad energetic),
 * 9.6 (News neutral), 14.1 (format-specific voice profiles)
 */
export const FORMAT_VOICE_PROFILE_MAP: Record<VideoFormat, FormatVoiceProfile> = {
    'youtube-narrator': {
        label: 'Conversational',
        voice: {
            voiceName: TTS_VOICES.KORE,
            pitch: 1,
            speakingRate: 1.1,
            stylePrompt: {
                persona: "A popular YouTube host sharing fascinating insights",
                emotion: "warm, engaging, and conversational",
                pacing: "natural and flowing with well-placed pauses for emphasis",
            },
        },
        videoPurpose: 'documentary',
    },
    'advertisement': {
        label: 'Energetic',
        voice: {
            voiceName: TTS_VOICES.PUCK,
            pitch: 2,
            speakingRate: 1.25,
            stylePrompt: {
                persona: "A high-energy commercial voice-over artist",
                emotion: "confident, persuasive, and attention-grabbing",
                pacing: "punchy and dynamic with crisp delivery",
            },
        },
        videoPurpose: 'commercial',
    },
    'movie-animation': {
        label: 'Dramatic',
        voice: {
            voiceName: TTS_VOICES.FENRIR,
            pitch: -2,
            speakingRate: 0.95,
            stylePrompt: {
                persona: "A legendary storyteller narrating an epic tale",
                emotion: "dramatic, immersive, and emotionally charged",
                pacing: "deliberate with dramatic pauses at key revelations",
            },
        },
        videoPurpose: 'storytelling',
    },
    'educational': {
        label: 'Professional',
        voice: {
            voiceName: TTS_VOICES.LEDA,
            pitch: 0,
            speakingRate: 1.0,
            stylePrompt: {
                persona: "A friendly and knowledgeable teacher",
                emotion: "clear, encouraging, patient, and authoritative",
                pacing: "steady and easy to follow with pauses between concepts",
            },
        },
        videoPurpose: 'educational',
    },
    'shorts': {
        label: 'Energetic',
        voice: {
            voiceName: TTS_VOICES.PUCK,
            pitch: 3,
            speakingRate: 1.3,
            stylePrompt: {
                persona: "A trendy social media content creator",
                emotion: "energetic, punchy, and scroll-stopping",
                pacing: "fast and dynamic with rapid-fire delivery",
            },
        },
        videoPurpose: 'social_short',
    },
    'documentary': {
        label: 'Professional',
        voice: {
            voiceName: TTS_VOICES.CHARON,
            pitch: -1,
            speakingRate: 0.95,
            stylePrompt: {
                persona: "A distinguished documentary narrator",
                emotion: "informative, measured, and authoritative",
                pacing: "thoughtful and deliberate with gravitas",
            },
        },
        videoPurpose: 'documentary',
    },
    'music-video': {
        label: 'Dramatic',
        voice: {
            voiceName: TTS_VOICES.AOEDE,
            pitch: -1,
            speakingRate: 0.9,
            stylePrompt: {
                persona: "A cinematic music video narrator",
                emotion: "evocative, artistic, and emotionally rich",
                pacing: "rhythmic and flowing, matching musical energy",
            },
        },
        videoPurpose: 'music_video',
    },
    'news-politics': {
        label: 'Neutral',
        voice: {
            voiceName: TTS_VOICES.ORUS,
            pitch: 0,
            speakingRate: 1.1,
            stylePrompt: {
                persona: "A professional news anchor delivering a report",
                emotion: "objective, clear, balanced, and authoritative",
                pacing: "crisp and well-articulated with neutral delivery",
            },
        },
        videoPurpose: 'news_report',
    },
};

/**
 * Get the recommended voice profile for a video format.
 * Falls back to 'movie-animation' profile for unknown formats.
 *
 * @param formatId - Video format identifier
 * @returns Format-specific voice profile
 */
export function getVoiceProfileForFormat(formatId: VideoFormat): FormatVoiceProfile {
    return FORMAT_VOICE_PROFILE_MAP[formatId] ?? FORMAT_VOICE_PROFILE_MAP['movie-animation'];
}

/**
 * Get language-aware voice config for a format.
 * Applies the format's voice profile, then overrides with a language-specific
 * voice if the content language differs from English.
 *
 * Requirements: 14.3, 19.3
 *
 * @param formatId - Video format identifier
 * @param language - Content language code
 * @returns Extended voice config with language-appropriate voice
 */
export function getFormatVoiceForLanguage(
    formatId: VideoFormat,
    language: LanguageCode | 'ar' | 'en'
): ExtendedVoiceConfig {
    const profile = getVoiceProfileForFormat(formatId);
    const langVoice = language !== 'en' && language !== 'auto'
        ? LANGUAGE_VOICE_MAP[language]
        : undefined;

    return {
        ...profile.voice,
        ...(langVoice && { voiceName: langVoice }),
    };
}
