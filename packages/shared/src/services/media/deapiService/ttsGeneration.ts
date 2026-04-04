/**
 * DeAPI TTS (text-to-speech) generation using Qwen3 VoiceDesign
 */

import { DEAPI_DIRECT_BASE, isBrowser, API_KEY, withExponentialBackoff } from './config';
import { isDeApiConfigured } from './apiConfig';
import { DEAPI_TTS_MODELS } from './types';
import { mediaLogger } from '../../infrastructure/logger';

const log = mediaLogger.child('DeAPI:TTS');

export async function generateDeapiQwenTTS(
    text: string,
    directorNote: string,
    language: string = "English",
    model: string = "Qwen3_TTS_12Hz_1_7B_VoiceDesign"
): Promise<Blob> {
    if (!isDeApiConfigured()) {
        throw new Error(
            "DeAPI API key is not configured on the server.\n\n" +
            "To use DeAPI TTS:\n" +
            "1. Get an API key from https://deapi.ai\n" +
            "2. Add VITE_DEAPI_API_KEY=your_key to your .env.local file\n" +
            "3. Restart the development server (npm run dev:all)"
        );
    }

    const safeText = text.length < 10 ? text.padEnd(10, ' ') : text.slice(0, 5000);

    const payload = {
        model: model,
        task_type: "txt2audio",
        input: {
            text: safeText,
            voice_prompt: directorNote
        },
        config: {
            lang: language,
            speed: 1,
            format: "mp3",
            sample_rate: 24000
        }
    };

    log.info(`Generating speech with model ${model}: "${safeText.substring(0, 50)}..."`);
    log.debug(`Voice prompt: "${directorNote}"`);

    const response = await withExponentialBackoff(async () => {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (!isBrowser) {
            headers.Authorization = `Bearer ${API_KEY}`;
            headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AISoulStudio/1.0";
        }

        const apiEndpoint = isBrowser ? '/api/deapi/proxy/predict' : `${DEAPI_DIRECT_BASE}/predict`;

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `DeAPI TTS request failed (${response.status})`;

            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.message) errorMessage = `DeAPI TTS: ${errorJson.message}`;
                else if (errorJson.error) errorMessage = `DeAPI TTS: ${errorJson.error}`;
            } catch {
                if (errorText) errorMessage = `DeAPI TTS: ${errorText.substring(0, 200)}`;
            }

            throw new Error(errorMessage);
        }

        return response;
    });

    const arrayBuffer = await response.arrayBuffer();
    log.info(`Received ${arrayBuffer.byteLength} bytes of MP3 audio`);
    return new Blob([arrayBuffer], { type: 'audio/mpeg' });
}

export const getDeApiTtsModels = () => ({
    [DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN]: {
        name: "Qwen3 VoiceDesign",
        description: "12Hz 1.7B model with voice design capabilities",
        supportsVoiceDesign: true,
        maxChars: 5000,
        minChars: 10,
        languages: ["English", "Arabic", "Chinese", "Spanish", "French", "German", "Russian", "Japanese", "Korean"],
        sampleRate: 24000,
        format: "mp3"
    },
});

export const mapLanguageToDeApiFormat = (languageCode?: string): string => {
    if (!languageCode || languageCode === 'auto') return "English";

    const langMap: Record<string, string> = {
        'en': 'English',
        'ar': 'Arabic',
        'zh': 'Chinese',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'ru': 'Russian',
        'ja': 'Japanese',
        'ko': 'Korean',
        'hi': 'Hindi',
        'tr': 'Turkish',
        'fa': 'Persian',
        'ur': 'Urdu',
        'he': 'Hebrew'
    };

    return langMap[languageCode] || "English";
};
