/**
 * Video Audio Extractor Module
 *
 * Extracts audio tracks from video files (e.g., Veo-generated videos)
 * for mixing into the final production audio.
 *
 * This allows Veo's native audio to be preserved and mixed with narration.
 */

// --- Types ---

export interface ExtractedVideoAudio {
    /** Scene ID this audio belongs to */
    sceneId: string;
    /** Audio blob extracted from video */
    audioBlob: Blob;
    /** Duration in seconds */
    duration: number;
    /** Start time in the video timeline */
    startTime: number;
    /** Sample rate of extracted audio */
    sampleRate: number;
    /** Whether audio was successfully extracted */
    hasAudio: boolean;
}

export interface VideoAudioExtractionResult {
    /** Successfully extracted audio tracks */
    audioTracks: ExtractedVideoAudio[];
    /** Scene IDs that had no audio or failed extraction */
    failedScenes: string[];
    /** Total duration of all extracted audio */
    totalDuration: number;
}

// --- Audio Extraction ---

/**
 * Extract audio from a video URL using Web Audio API
 *
 * @param videoUrl - URL of the video to extract audio from
 * @param sceneId - Scene identifier for tracking
 * @param startTime - Start time in the video timeline
 * @returns Extracted audio information
 */
export async function extractAudioFromVideo(
    videoUrl: string,
    sceneId: string,
    startTime: number
): Promise<ExtractedVideoAudio> {
    console.log(`[VideoAudioExtractor] Extracting audio from video: ${sceneId}`);

    try {
        // Fetch the video file
        const response = await fetch(videoUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch video: ${response.status}`);
        }

        const videoBlob = await response.blob();
        const arrayBuffer = await videoBlob.arrayBuffer();

        // Create audio context for decoding
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Try to decode the video as audio
        let audioBuffer: AudioBuffer;
        try {
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        } catch (decodeError) {
            console.warn(`[VideoAudioExtractor] Video ${sceneId} has no audio track or unsupported format`);
            await audioContext.close();
            return {
                sceneId,
                audioBlob: new Blob([], { type: 'audio/wav' }),
                duration: 0,
                startTime,
                sampleRate: 44100,
                hasAudio: false,
            };
        }

        // Convert AudioBuffer to WAV Blob
        const wavBlob = audioBufferToWav(audioBuffer);

        await audioContext.close();

        console.log(`[VideoAudioExtractor] ✓ Extracted ${audioBuffer.duration.toFixed(2)}s audio from ${sceneId}`);

        return {
            sceneId,
            audioBlob: wavBlob,
            duration: audioBuffer.duration,
            startTime,
            sampleRate: audioBuffer.sampleRate,
            hasAudio: true,
        };
    } catch (error) {
        console.error(`[VideoAudioExtractor] Failed to extract audio from ${sceneId}:`, error);
        return {
            sceneId,
            audioBlob: new Blob([], { type: 'audio/wav' }),
            duration: 0,
            startTime,
            sampleRate: 44100,
            hasAudio: false,
        };
    }
}

/**
 * Extract audio from multiple video scenes
 *
 * @param videos - Array of video information
 * @returns Extraction results with all audio tracks
 */
export async function extractAudioFromVideos(
    videos: Array<{
        sceneId: string;
        videoUrl: string;
        startTime: number;
    }>
): Promise<VideoAudioExtractionResult> {
    const audioTracks: ExtractedVideoAudio[] = [];
    const failedScenes: string[] = [];
    let totalDuration = 0;

    console.log(`[VideoAudioExtractor] Extracting audio from ${videos.length} videos`);

    for (const video of videos) {
        const result = await extractAudioFromVideo(
            video.videoUrl,
            video.sceneId,
            video.startTime
        );

        if (result.hasAudio) {
            audioTracks.push(result);
            totalDuration += result.duration;
        } else {
            failedScenes.push(video.sceneId);
        }
    }

    console.log(`[VideoAudioExtractor] Extracted audio from ${audioTracks.length}/${videos.length} videos`);

    return {
        audioTracks,
        failedScenes,
        totalDuration,
    };
}

// --- WAV Encoding ---

/**
 * Convert AudioBuffer to WAV Blob
 * Uses standard PCM encoding
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    // Interleave channels
    const interleaved = interleaveChannels(buffer);

    // Create WAV file
    const dataLength = interleaved.length * 2; // 16-bit = 2 bytes
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // WAV Header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); // ByteRate
    view.setUint16(32, numChannels * (bitDepth / 8), true); // BlockAlign
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Write PCM samples
    const offset = 44;
    for (let i = 0; i < interleaved.length; i++) {
        const sample = Math.max(-1, Math.min(1, interleaved[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset + i * 2, intSample, true);
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Interleave audio channels for WAV encoding
 */
function interleaveChannels(buffer: AudioBuffer): Float32Array {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const result = new Float32Array(length * numChannels);

    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            result[i * numChannels + channel] = buffer.getChannelData(channel)[i];
        }
    }

    return result;
}

/**
 * Write string to DataView
 */
function writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

// --- Audio Mixing Helpers ---

/**
 * Mix extracted video audio with narration at appropriate times
 * Creates a combined audio track with video audio layered under narration
 *
 * @param narrationBlob - Main narration audio
 * @param videoAudioTracks - Extracted video audio tracks
 * @param videoAudioVolume - Volume for video audio (0-1, default 0.3)
 * @returns Mixed audio blob
 */
export async function mixVideoAudioWithNarration(
    narrationBlob: Blob,
    videoAudioTracks: ExtractedVideoAudio[],
    videoAudioVolume = 0.3
): Promise<Blob> {
    if (videoAudioTracks.length === 0 || !videoAudioTracks.some(t => t.hasAudio)) {
        console.log("[VideoAudioExtractor] No video audio to mix, returning narration only");
        return narrationBlob;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    try {
        // Decode narration
        const narrationBuffer = await audioContext.decodeAudioData(
            await narrationBlob.arrayBuffer()
        );

        // Find total duration (max of narration or video audio end times)
        let maxEndTime = narrationBuffer.duration;
        for (const track of videoAudioTracks) {
            if (track.hasAudio) {
                const trackEnd = track.startTime + track.duration;
                maxEndTime = Math.max(maxEndTime, trackEnd);
            }
        }

        // Create output buffer
        const outputLength = Math.ceil(maxEndTime * audioContext.sampleRate);
        const outputBuffer = audioContext.createBuffer(
            2, // Stereo output
            outputLength,
            audioContext.sampleRate
        );

        // Copy narration to output (full volume)
        for (let channel = 0; channel < Math.min(2, narrationBuffer.numberOfChannels); channel++) {
            const outputData = outputBuffer.getChannelData(channel);
            const narrationData = narrationBuffer.getChannelData(
                channel < narrationBuffer.numberOfChannels ? channel : 0
            );
            for (let i = 0; i < narrationData.length && i < outputData.length; i++) {
                outputData[i] = narrationData[i];
            }
        }

        // Mix in video audio tracks at their start times
        for (const track of videoAudioTracks) {
            if (!track.hasAudio || track.audioBlob.size === 0) continue;

            try {
                const trackBuffer = await audioContext.decodeAudioData(
                    await track.audioBlob.arrayBuffer()
                );

                const startSample = Math.floor(track.startTime * audioContext.sampleRate);

                for (let channel = 0; channel < 2; channel++) {
                    const outputData = outputBuffer.getChannelData(channel);
                    const trackData = trackBuffer.getChannelData(
                        channel < trackBuffer.numberOfChannels ? channel : 0
                    );

                    for (let i = 0; i < trackData.length; i++) {
                        const outputIndex = startSample + i;
                        if (outputIndex < outputData.length) {
                            // Mix video audio at specified volume
                            outputData[outputIndex] += trackData[i] * videoAudioVolume;
                            // Soft clip to prevent distortion
                            outputData[outputIndex] = Math.max(-1, Math.min(1, outputData[outputIndex]));
                        }
                    }
                }

                console.log(`[VideoAudioExtractor] Mixed video audio from ${track.sceneId} at ${track.startTime}s`);
            } catch (e) {
                console.warn(`[VideoAudioExtractor] Failed to mix track ${track.sceneId}:`, e);
            }
        }

        // Convert to WAV
        const mixedWav = audioBufferToWav(outputBuffer);

        await audioContext.close();

        console.log(`[VideoAudioExtractor] ✓ Mixed audio complete: ${maxEndTime.toFixed(2)}s`);
        return mixedWav;
    } catch (error) {
        console.error("[VideoAudioExtractor] Mix failed:", error);
        await audioContext.close();
        return narrationBlob; // Return original on failure
    }
}
