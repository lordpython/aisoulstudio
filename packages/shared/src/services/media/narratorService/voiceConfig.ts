/**
 * Narrator Service — Voice configs, style maps, and voice selection helpers
 */

import { EmotionalTone, VideoFormat } from "@/types";
import { VideoPurpose, type LanguageCode } from "@/constants";

export type TTSProvider = 'gemini' | 'deapi_qwen';

export const TTS_VOICES = {
    ZEPHYR: "Zephyr",
    PUCK: "Puck",
    CHARON: "Charon",
    KORE: "Kore",
    FENRIR: "Fenrir",
    LEDA: "Leda",
    ORUS: "Orus",
    AOEDE: "Aoede",
    CALLIRRHOE: "Callirrhoe",
    AUTONOE: "Autonoe",
    ENCELADUS: "Enceladus",
    IAPETUS: "Iapetus",
    UMBRIEL: "Umbriel",
    ALGIEBA: "Algieba",
    DESPINA: "Despina",
    ERINOME: "Erinome",
    ALGENIB: "Algenib",
    RASALGETHI: "Rasalgethi",
    LAOMEDEIA: "Laomedeia",
    ACHERNAR: "Achernar",
    ALNILAM: "Alnilam",
    SCHEDAR: "Schedar",
    GACRUX: "Gacrux",
    PULCHERRIMA: "Pulcherrima",
    ACHIRD: "Achird",
    ZUBENELGENUBI: "Zubenelgenubi",
    VINDEMIATRIX: "Vindemiatrix",
    SADACHBIA: "Sadachbia",
    SADALTAGER: "Sadaltager",
    SULAFAT: "Sulafat",
} as const;

export const VOICE_PERSONALITIES: Record<TTSVoice, string> = {
    Zephyr: "Bright",
    Puck: "Upbeat",
    Charon: "Informative",
    Kore: "Firm",
    Fenrir: "Excitable",
    Leda: "Youthful",
    Orus: "Firm",
    Aoede: "Breezy",
    Callirrhoe: "Easy-going",
    Autonoe: "Bright",
    Enceladus: "Breathy",
    Iapetus: "Clear",
    Umbriel: "Easy-going",
    Algieba: "Smooth",
    Despina: "Smooth",
    Erinome: "Clear",
    Algenib: "Gravelly",
    Rasalgethi: "Informative",
    Laomedeia: "Upbeat",
    Achernar: "Soft",
    Alnilam: "Firm",
    Schedar: "Even",
    Gacrux: "Mature",
    Pulcherrima: "Forward",
    Achird: "Friendly",
    Zubenelgenubi: "Casual",
    Vindemiatrix: "Gentle",
    Sadachbia: "Lively",
    Sadaltager: "Knowledgeable",
    Sulafat: "Warm",
};

export type TTSVoice = typeof TTS_VOICES[keyof typeof TTS_VOICES];

export interface VoiceConfig {
    voiceName: TTSVoice;
    pitch?: number;
    speakingRate?: number;
}

export interface StylePrompt {
    persona?: string;
    emotion?: string;
    pacing?: string;
    accent?: string;
    customDirectorNote?: string;
}

export interface ExtendedVoiceConfig extends VoiceConfig {
    stylePrompt?: StylePrompt;
}

export const TONE_VOICE_MAP: Record<EmotionalTone, ExtendedVoiceConfig> = {
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

export const LANGUAGE_VOICE_MAP: Partial<Record<string, TTSVoice>> = {
    'ar': TTS_VOICES.AOEDE,
    'en': TTS_VOICES.KORE,
    'es': TTS_VOICES.AOEDE,
    'fr': TTS_VOICES.AOEDE,
    'de': TTS_VOICES.ORUS,
    'ru': TTS_VOICES.CHARON,
    'zh': TTS_VOICES.AOEDE,
    'ja': TTS_VOICES.AOEDE,
    'ko': TTS_VOICES.AOEDE,
    'hi': TTS_VOICES.AOEDE,
    'tr': TTS_VOICES.AOEDE,
    'fa': TTS_VOICES.AOEDE,
    'ur': TTS_VOICES.AOEDE,
    'he': TTS_VOICES.AOEDE,
};

export const CHARACTER_VOICE_MAP = {
    narrator: TTS_VOICES.KORE,
    male: TTS_VOICES.CHARON,
    female: TTS_VOICES.AOEDE,
    elder: TTS_VOICES.ORUS,
    youth: TTS_VOICES.PUCK,
    mysterious: TTS_VOICES.FENRIR,
} as const;

export const PURPOSE_STYLE_MAP: Record<VideoPurpose, StylePrompt> = {
    music_video: { persona: "A cinematic music video narrator", emotion: "emotional, evocative, and artistic", pacing: "rhythmic, matching the musical flow" },
    social_short: { persona: "A trendy social media content creator", emotion: "energetic, punchy, and attention-grabbing", pacing: "fast and dynamic with quick delivery" },
    documentary: { persona: "A professional documentary narrator", emotion: "informative, engaging, and authoritative", pacing: "measured and thoughtful" },
    commercial: { persona: "A persuasive commercial voice-over artist", emotion: "confident, trustworthy, and compelling", pacing: "polished and well-articulated" },
    podcast_visual: { persona: "A conversational podcast host", emotion: "warm, relatable, and authentic", pacing: "natural and conversational" },
    lyric_video: { persona: "A poetic lyric narrator", emotion: "expressive, melodic, and heartfelt", pacing: "flowing and synchronized with the music" },
    storytelling: { persona: "A master storyteller weaving an epic tale", emotion: "dramatic, immersive, and captivating", pacing: "natural with occasional dramatic pauses" },
    educational: { persona: "A friendly and knowledgeable teacher", emotion: "clear, encouraging, and patient", pacing: "steady and easy to follow" },
    horror_mystery: { persona: "A mysterious narrator telling a chilling tale", emotion: "eerie, suspenseful, and unsettling", pacing: "steady with subtle tension, not too slow" },
    travel: { persona: "An adventurous travel documentary host", emotion: "wonder-filled, inspiring, and enthusiastic", pacing: "flowing and descriptive" },
    motivational: { persona: "An inspiring motivational speaker", emotion: "powerful, uplifting, and empowering", pacing: "building energy with impactful delivery" },
    news_report: { persona: "A professional news anchor", emotion: "objective, clear, and authoritative", pacing: "crisp and well-articulated" },
    story_drama: { persona: "A dramatic storyteller with emotional depth", emotion: "intense, moving, and deeply felt", pacing: "measured with emotional crescendos" },
    story_comedy: { persona: "A witty comedic narrator", emotion: "light-hearted, playful, and humorous", pacing: "upbeat with well-timed comedic beats" },
    story_thriller: { persona: "A tense thriller narrator", emotion: "suspenseful, gripping, and urgent", pacing: "tight and relentless with sudden shifts" },
    story_scifi: { persona: "A futuristic sci-fi narrator", emotion: "awe-inspiring, cerebral, and visionary", pacing: "steady with moments of wonder" },
    story_action: { persona: "A high-energy action narrator", emotion: "thrilling, explosive, and adrenaline-fueled", pacing: "fast and intense with punchy delivery" },
    story_fantasy: { persona: "An enchanting fantasy storyteller", emotion: "magical, wondrous, and mythical", pacing: "flowing and grand with epic moments" },
    story_romance: { persona: "A tender romantic narrator", emotion: "warm, passionate, and intimate", pacing: "gentle and heartfelt" },
    story_historical: { persona: "A distinguished historical narrator", emotion: "reverent, authoritative, and evocative", pacing: "stately and deliberate" },
    story_animation: { persona: "A lively animated story narrator", emotion: "colorful, expressive, and fun", pacing: "dynamic and energetic" },
};

export const STYLE_PRESETS: Record<string, StylePrompt> = {
    DOCUMENTARY: { persona: "A documentary narrator", emotion: "informative, engaging, and thoughtful", pacing: "measured with natural pauses" },
    MOVIE_TRAILER: { persona: "An epic movie trailer voice", emotion: "dramatic, powerful, and intense", pacing: "slow and deliberate with dramatic pauses" },
    AUDIOBOOK: { persona: "A skilled audiobook narrator", emotion: "expressive, immersive, and captivating", pacing: "varied to match the story's rhythm" },
    WISE_MENTOR: { persona: "A wise old mentor sharing ancient wisdom", emotion: "warm, knowing, and gentle", pacing: "slow and contemplative" },
    EXCITED_HOST: { persona: "An enthusiastic TV show host", emotion: "energetic, upbeat, and engaging", pacing: "fast and lively" },
    MYSTERIOUS: { persona: "A mysterious figure revealing secrets", emotion: "intriguing, hushed, and suspenseful", pacing: "slow with pregnant pauses" },
    TUTORIAL: { persona: "A patient teacher", emotion: "clear, helpful, and encouraging", pacing: "steady and easy to follow" },
    ANNOUNCEMENT: { persona: "A professional announcer", emotion: "clear, confident, and attention-grabbing", pacing: "crisp and well-articulated" },
    MEDITATION: { persona: "A calming meditation guide", emotion: "peaceful, soothing, and tranquil", pacing: "very slow with long, restful pauses" },
};

export interface FormatVoiceProfile {
    label: string;
    voice: ExtendedVoiceConfig;
    videoPurpose: VideoPurpose;
}

export const FORMAT_VOICE_PROFILE_MAP: Record<VideoFormat, FormatVoiceProfile> = {
    'youtube-narrator': {
        label: 'Conversational',
        voice: { voiceName: TTS_VOICES.KORE, pitch: 1, speakingRate: 1.1, stylePrompt: { persona: "A popular YouTube host sharing fascinating insights", emotion: "warm, engaging, and conversational", pacing: "natural and flowing with well-placed pauses for emphasis" } },
        videoPurpose: 'documentary',
    },
    'advertisement': {
        label: 'Energetic',
        voice: { voiceName: TTS_VOICES.PUCK, pitch: 2, speakingRate: 1.25, stylePrompt: { persona: "A high-energy commercial voice-over artist", emotion: "confident, persuasive, and attention-grabbing", pacing: "punchy and dynamic with crisp delivery" } },
        videoPurpose: 'commercial',
    },
    'movie-animation': {
        label: 'Dramatic',
        voice: { voiceName: TTS_VOICES.FENRIR, pitch: -2, speakingRate: 0.95, stylePrompt: { persona: "A legendary storyteller narrating an epic tale", emotion: "dramatic, immersive, and emotionally charged", pacing: "deliberate with dramatic pauses at key revelations" } },
        videoPurpose: 'storytelling',
    },
    'educational': {
        label: 'Professional',
        voice: { voiceName: TTS_VOICES.LEDA, pitch: 0, speakingRate: 1.0, stylePrompt: { persona: "A friendly and knowledgeable teacher", emotion: "clear, encouraging, patient, and authoritative", pacing: "steady and easy to follow with pauses between concepts" } },
        videoPurpose: 'educational',
    },
    'shorts': {
        label: 'Energetic',
        voice: { voiceName: TTS_VOICES.PUCK, pitch: 3, speakingRate: 1.3, stylePrompt: { persona: "A trendy social media content creator", emotion: "energetic, punchy, and scroll-stopping", pacing: "fast and dynamic with rapid-fire delivery" } },
        videoPurpose: 'social_short',
    },
    'documentary': {
        label: 'Professional',
        voice: { voiceName: TTS_VOICES.CHARON, pitch: -1, speakingRate: 0.95, stylePrompt: { persona: "A distinguished documentary narrator", emotion: "informative, measured, and authoritative", pacing: "thoughtful and deliberate with gravitas" } },
        videoPurpose: 'documentary',
    },
    'music-video': {
        label: 'Dramatic',
        voice: { voiceName: TTS_VOICES.AOEDE, pitch: -1, speakingRate: 0.9, stylePrompt: { persona: "A cinematic music video narrator", emotion: "evocative, artistic, and emotionally rich", pacing: "rhythmic and flowing, matching musical energy" } },
        videoPurpose: 'music_video',
    },
    'news-politics': {
        label: 'Neutral',
        voice: { voiceName: TTS_VOICES.ORUS, pitch: 0, speakingRate: 1.1, stylePrompt: { persona: "A professional news anchor delivering a report", emotion: "objective, clear, balanced, and authoritative", pacing: "crisp and well-articulated with neutral delivery" } },
        videoPurpose: 'news_report',
    },
};

export function getVoiceForTone(tone: EmotionalTone): ExtendedVoiceConfig {
    return TONE_VOICE_MAP[tone];
}

export function getAvailableVoices(): TTSVoice[] {
    return Object.values(TTS_VOICES);
}

export function getAutoStylePrompt(
    emotionalTone: EmotionalTone,
    videoPurpose?: VideoPurpose,
    styleOverride?: StylePrompt
): StylePrompt {
    const toneStyle = TONE_VOICE_MAP[emotionalTone]?.stylePrompt;
    const purposeStyle = videoPurpose ? PURPOSE_STYLE_MAP[videoPurpose] : undefined;
    return mergeStylePrompts(toneStyle, purposeStyle, styleOverride);
}

export function mergeStylePrompts(...prompts: (StylePrompt | undefined)[]): StylePrompt {
    const merged: StylePrompt = {};
    for (const prompt of prompts) {
        if (!prompt) continue;
        if (prompt.customDirectorNote) return { customDirectorNote: prompt.customDirectorNote };
        if (prompt.persona) merged.persona = prompt.persona;
        if (prompt.emotion) merged.emotion = prompt.emotion;
        if (prompt.pacing) merged.pacing = prompt.pacing;
        if (prompt.accent) merged.accent = prompt.accent;
    }
    return merged;
}

export function getVoiceProfileForFormat(formatId: VideoFormat): FormatVoiceProfile {
    return FORMAT_VOICE_PROFILE_MAP[formatId] ?? FORMAT_VOICE_PROFILE_MAP['movie-animation'];
}

export function getFormatVoiceForLanguage(
    formatId: VideoFormat,
    language: LanguageCode | 'ar' | 'en'
): ExtendedVoiceConfig {
    const profile = getVoiceProfileForFormat(formatId);
    const langVoice = language !== 'en' && language !== 'auto'
        ? LANGUAGE_VOICE_MAP[language]
        : undefined;
    return { ...profile.voice, ...(langVoice && { voiceName: langVoice }) };
}
