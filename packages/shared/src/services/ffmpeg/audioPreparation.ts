/**
 * Audio Preparation Module
 *
 * Fetch, optionally mix with SFX, decode, and extract frequency data.
 * Shared by both the server-FFmpeg and WASM export paths.
 *
 * IMPORTANT: Callers must call `audioContext.close()` in a `finally` block
 * to prevent AudioContext leaks.
 */

import { SongData } from "../../types";
import { extractFrequencyData } from "../../utils/audioAnalysis";
import { mixAudioWithSFX, canMixSFX } from "../audio-processing/audioMixerService";
import { ExportConfig } from "./exportConfig";

const FPS = 24;

export interface PreparedAudio {
    audioBlob: Blob;
    audioBuffer: AudioBuffer;
    frequencyDataArray: Uint8Array[];
    duration: number;
    totalFrames: number;
    /** Must be closed by the caller in a finally block */
    audioContext: AudioContext;
}

/**
 * Prepare audio for export:
 * 1. Fetch narration (with optional SFX mix fallback)
 * 2. Validate
 * 3. Decode to AudioBuffer
 * 4. Extract per-frame frequency data
 */
export async function prepareAudio(
    songData: SongData,
    config: ExportConfig,
    onProgress?: (message: string) => void
): Promise<PreparedAudio> {
    if (!songData.audioUrl) {
        throw new Error("No audio URL provided. Cannot export video without audio.");
    }

    const shouldMixSFX =
        config.sfxPlan != null &&
        canMixSFX(config.sfxPlan) &&
        config.sceneTimings != null &&
        config.sceneTimings.length > 0;

    let audioBlob: Blob;

    if (shouldMixSFX) {
        onProgress?.("Mixing audio with SFX...");
        console.log("[AudioPrep] Mixing narration with SFX...");
        try {
            audioBlob = await mixAudioWithSFX({
                narrationUrl: songData.audioUrl,
                sfxPlan: config.sfxPlan!,
                scenes: config.sceneTimings!,
                sfxMasterVolume: config.sfxMasterVolume,
                musicMasterVolume: config.musicMasterVolume,
            });
            console.log(`[AudioPrep] Mixed audio: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`);
        } catch (err) {
            console.warn("[AudioPrep] SFX mixing failed, falling back to original audio:", err);
            audioBlob = await fetchAudioBlob(songData.audioUrl);
        }
    } else {
        onProgress?.("Analyzing audio...");
        audioBlob = await fetchAudioBlob(songData.audioUrl);
    }

    if (audioBlob.size === 0) {
        throw new Error("Audio file is empty. Please ensure audio has been generated.");
    }

    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    let audioBuffer: AudioBuffer;
    try {
        // .slice(0) because decodeAudioData transfers ownership of the buffer
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    } catch (decodeError: any) {
        await audioContext.close().catch(() => {});
        throw new Error(
            `Unable to decode audio data. The audio file may be corrupted or in an unsupported format. (${decodeError.message || "Unknown error"})`
        );
    }

    const frequencyDataArray = await extractFrequencyData(audioBuffer, FPS);
    const duration = audioBuffer.duration;
    const totalFrames = Math.ceil(duration * FPS);

    return { audioBlob, audioBuffer, frequencyDataArray, duration, totalFrames, audioContext };
}

async function fetchAudioBlob(audioUrl: string): Promise<Blob> {
    const res = await fetch(audioUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch audio: ${res.status} ${res.statusText}`);
    }
    return res.blob();
}
