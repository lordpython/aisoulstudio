/**
 * Video Exporters Module
 *
 * Cloud rendering (server-side FFmpeg) and browser rendering (FFmpeg WASM) export functions.
 */

import { SongData } from "../../types";
import { extractFrequencyData } from "../../utils/audioAnalysis";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { applyPolyfills } from "../../lib/utils";
import { mixAudioWithSFX, canMixSFX } from "../audioMixerService";
import {
    ExportConfig,
    ExportProgress,
    ProgressCallback,
    RenderAsset,
    SERVER_URL,
    DEFAULT_EXPORT_CONFIG,
    mergeExportConfig,
} from "./exportConfig";
import { preloadAssets, clearFrameCache, type AssetLoadProgress } from "./assetLoader";
import { renderFrameToCanvas } from "./frameRenderer";
import { cloudAutosave } from "../cloudStorageService";
import { saveExportRecord } from "../projectService";
import { subscribeToJob, isSSESupported, JobProgress } from "./sseClient";
import { generateBatchChecksums, isChecksumSupported, FrameChecksum } from "./checksumGenerator";

// Rendering constants
const RENDER_WIDTH_LANDSCAPE = 1920;
const RENDER_HEIGHT_LANDSCAPE = 1080;
const RENDER_WIDTH_PORTRAIT = 1080;
const RENDER_HEIGHT_PORTRAIT = 1920;
const FPS = 24;
const JPEG_QUALITY = 0.92;      // Slightly reduced for faster uploads (still excellent quality)
const BATCH_SIZE = 96;          // Doubled batch size for fewer HTTP round-trips
const PARALLEL_RENDERS = 4;     // Number of frames to render in parallel (where possible)

/**
 * Export options for user project tracking
 */
export interface ExportOptions {
    cloudSessionId?: string;
    userId?: string;
    projectId?: string;
}

/**
 * Export result with optional cloud URL
 */
export interface ExportResult {
    blob: Blob;
    cloudUrl?: string;
}

/**
 * Export video using cloud rendering (server-side FFmpeg)
 */
export async function exportVideoWithFFmpeg(
    songData: SongData,
    onProgress: ProgressCallback,
    config: Partial<ExportConfig> = {},
    options: ExportOptions = {}
): Promise<ExportResult> {
    const { cloudSessionId, userId, projectId } = options;
    const mergedConfig = mergeExportConfig(config);
    const WIDTH = mergedConfig.orientation === "landscape" ? RENDER_WIDTH_LANDSCAPE : RENDER_WIDTH_PORTRAIT;
    const HEIGHT = mergedConfig.orientation === "landscape" ? RENDER_HEIGHT_LANDSCAPE : RENDER_HEIGHT_PORTRAIT;

    onProgress({
        stage: "preparing",
        progress: 0,
        message: "Analyzing audio...",
    });

    // 1. Fetch and Decode Audio
    if (!songData.audioUrl) {
        throw new Error("No audio URL provided. Cannot export video without audio.");
    }

    const audioResponse = await fetch(songData.audioUrl);
    if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    const audioBlob = await audioResponse.blob();
    if (audioBlob.size === 0) {
        throw new Error("Audio file is empty. Please ensure audio has been generated.");
    }
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    let audioBuffer: AudioBuffer;
    try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (decodeError: any) {
        throw new Error(`Unable to decode audio data. The audio file may be corrupted or in an unsupported format. (${decodeError.message || 'Unknown error'})`);
    }

    // 2. Extract Frequency Data
    const frequencyDataArray = await extractFrequencyData(audioBuffer, FPS);

    onProgress({
        stage: "preparing",
        progress: 10,
        message: "Initializing render session...",
    });

    // 3. Initialize Session
    const initFormData = new FormData();
    initFormData.append("audio", audioBlob, "audio.mp3");

    const initRes = await fetch(`${SERVER_URL}/api/export/init`, {
        method: "POST",
        body: initFormData,
    });

    if (!initRes.ok) {
        throw new Error("Failed to initialize export session");
    }

    const { sessionId } = await initRes.json();

    onProgress({
        stage: "preparing",
        progress: 20,
        message: "Loading high-res assets...",
    });

    // 4. Preload assets with progress tracking
    const assets = await preloadAssets(songData, (progress) => {
        onProgress({
            stage: "preparing",
            progress: 20 + Math.round((progress.loaded / progress.total) * 10),
            message: `Loading asset ${progress.loaded}/${progress.total} (${progress.type})...`,
            currentAssetIndex: progress.loaded,
            totalAssets: progress.total,
            currentAssetType: progress.type,
        });
    });

    // Count video assets for logging
    const videoAssetCount = assets.filter(a => a.type === "video").length;
    const imageAssetCount = assets.filter(a => a.type === "image").length;
    console.log(`[FFmpeg] Loaded ${assets.length} assets (${videoAssetCount} videos, ${imageAssetCount} images)`);

    const duration = audioBuffer.duration;
    const totalFrames = Math.ceil(duration * FPS);

    onProgress({
        stage: "rendering",
        progress: 0,
        message: videoAssetCount > 0
            ? `Rendering ${totalFrames} frames (includes ${videoAssetCount} video assets)...`
            : "Rendering cinematic frames...",
        totalFrames,
        totalAssets: assets.length,
    });

    // 5. Create canvas
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    applyPolyfills(ctx);

    // 6. Render Loop with Parallel Upload
    // Upload batches asynchronously while rendering continues
    let previousFreqData: Uint8Array | null = null;
    let frameBuffer: { blob: Blob; name: string }[] = [];
    let pendingUpload: Promise<void> | null = null;
    let uploadErrors: Error[] = [];

    // Helper to upload a batch asynchronously
    const uploadBatch = async (batch: { blob: Blob; name: string }[]) => {
        const chunkFormData = new FormData();
        batch.forEach((f) => chunkFormData.append("frames", f.blob, f.name));
        const chunkRes = await fetch(
            `${SERVER_URL}/api/export/chunk?sessionId=${sessionId}`,
            { method: "POST", body: chunkFormData }
        );
        if (!chunkRes.ok) {
            uploadErrors.push(new Error("Failed to upload video chunk"));
        }
    };

    for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame / FPS;
        const freqData = frequencyDataArray[frame] || new Uint8Array(128).fill(0);

        await renderFrameToCanvas(
            ctx,
            WIDTH,
            HEIGHT,
            currentTime,
            assets,
            songData.parsedSubtitles,
            freqData,
            previousFreqData,
            mergedConfig
        );

        previousFreqData = freqData;

        const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), "image/jpeg", JPEG_QUALITY);
        });

        frameBuffer.push({
            blob,
            name: `frame${frame.toString().padStart(6, "0")}.jpg`,
        });

        // Upload batch asynchronously (don't wait, continue rendering)
        if (frameBuffer.length >= BATCH_SIZE) {
            // Wait for previous upload to complete before starting new one
            if (pendingUpload) {
                await pendingUpload;
            }
            // Check for errors
            if (uploadErrors.length > 0) {
                throw uploadErrors[0];
            }
            // Start new upload (don't await - continue rendering)
            const batchToUpload = [...frameBuffer];
            pendingUpload = uploadBatch(batchToUpload);
            frameBuffer = [];
        }

        // Update progress with detailed frame info
        if (frame % FPS === 0) {
            const progress = Math.round((frame / totalFrames) * 90);

            // Determine current asset type
            const currentAsset = assets.find((a, i) => {
                const nextAsset = assets[i + 1];
                return currentTime >= a.time && (!nextAsset || currentTime < nextAsset.time);
            });

            onProgress({
                stage: "rendering",
                progress,
                message: `Rendering ${Math.floor(frame / FPS)}s / ${Math.floor(duration)}s`,
                currentFrame: frame,
                totalFrames,
                currentAssetType: currentAsset?.type,
                isSeekingVideo: currentAsset?.type === "video",
            });
        }
    }

    // Wait for any pending upload
    if (pendingUpload) {
        await pendingUpload;
    }

    // Check for upload errors
    if (uploadErrors.length > 0) {
        throw uploadErrors[0];
    }

    // Upload remaining frames
    if (frameBuffer.length > 0) {
        const chunkFormData = new FormData();
        frameBuffer.forEach((f) => chunkFormData.append("frames", f.blob, f.name));
        await fetch(`${SERVER_URL}/api/export/chunk?sessionId=${sessionId}`, {
            method: "POST",
            body: chunkFormData,
        });
    }

    onProgress({
        stage: "encoding",
        progress: 90,
        message: "Queuing video encoding...",
    });

    // Determine encoding mode: async (SSE) or sync (legacy)
    const useAsyncEncoding = isSSESupported();

    const finalizeRes = await fetch(`${SERVER_URL}/api/export/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            sessionId,
            fps: FPS,
            totalFrames,
            sync: !useAsyncEncoding,
        }),
    });

    if (!finalizeRes.ok) {
        const errorData = await finalizeRes.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(errorData.error || "Export failed");
    }

    let videoBlob: Blob;

    if (useAsyncEncoding) {
        // Async mode: response is JSON with jobId
        const finalizeData = await finalizeRes.json();
        const jobId = finalizeData.jobId;
        console.log(`[FFmpeg] Job ${jobId} queued, subscribing to SSE progress`);

        onProgress({
            stage: "encoding",
            progress: 90,
            message: "Server encoding started...",
        });

        // Wait for job completion via SSE
        videoBlob = await new Promise<Blob>((resolve, reject) => {
            const unsubscribe = subscribeToJob(
                jobId,
                (progress: JobProgress) => {
                    // Map server progress (0-100) to UI progress (90-99)
                    const uiProgress = 90 + Math.round(progress.progress * 0.09);

                    onProgress({
                        stage: "encoding",
                        progress: uiProgress,
                        message: progress.message,
                        currentFrame: progress.currentFrame,
                        totalFrames: progress.totalFrames,
                    });

                    if (progress.status === 'complete') {
                        unsubscribe();
                        // Download the completed video
                        fetch(`${SERVER_URL}/api/export/download/${jobId}`)
                            .then(res => {
                                if (!res.ok) throw new Error('Failed to download video');
                                return res.blob();
                            })
                            .then(resolve)
                            .catch(reject);
                    } else if (progress.status === 'failed') {
                        unsubscribe();
                        reject(new Error(progress.error || 'Export failed'));
                    }
                },
                (error) => {
                    unsubscribe();
                    reject(error);
                }
            );

            // Timeout after 30 minutes
            setTimeout(() => {
                unsubscribe();
                reject(new Error('Export timed out'));
            }, 30 * 60 * 1000);
        });
    } else {
        // Sync mode: response IS the video blob (single request, no duplicate)
        onProgress({ stage: "encoding", progress: 99, message: "Downloading..." });
        videoBlob = await finalizeRes.blob();
    }

    onProgress({ stage: "complete", progress: 100, message: "Export complete!" });

    // Clear frame cache to free memory
    clearFrameCache();

    let cloudUrl: string | undefined;

    // Upload final video to cloud storage if session context provided
    if (cloudSessionId) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `export_${timestamp}.mp4`;
            const result = await cloudAutosave.saveAsset(
                cloudSessionId,
                videoBlob,
                filename,
                'exports',
                true, // waitForUpload
                true  // makePublic
            );
            if (result.publicUrl) {
                cloudUrl = result.publicUrl;
                console.log('[FFmpeg] ✓ Final video uploaded to cloud:', cloudUrl);

                // Save export record if user is authenticated
                if (userId && projectId) {
                    const aspectRatio = mergedConfig.orientation === 'landscape' ? '16:9' : '9:16';
                    await saveExportRecord(projectId, {
                        format: 'mp4',
                        quality: 'high',
                        aspectRatio: aspectRatio as '16:9' | '9:16' | '1:1',
                        cloudUrl,
                        fileSize: videoBlob.size,
                        duration,
                    });
                    console.log('[FFmpeg] ✓ Export record saved to Firestore');
                }
            }
        } catch (err) {
            console.warn('[FFmpeg] Cloud upload/record failed (non-fatal):', err);
        }
    }

    return { blob: videoBlob, cloudUrl };
}

/**
 * Export video using browser-side FFmpeg WASM
 */
export async function exportVideoClientSide(
    songData: SongData,
    onProgress: ProgressCallback,
    config: Partial<ExportConfig> = {},
    options: ExportOptions = {}
): Promise<ExportResult> {
    const { cloudSessionId, userId, projectId } = options;
    const mergedConfig = mergeExportConfig(config);
    const WIDTH = mergedConfig.orientation === "landscape" ? RENDER_WIDTH_LANDSCAPE : RENDER_WIDTH_PORTRAIT;
    const HEIGHT = mergedConfig.orientation === "landscape" ? RENDER_HEIGHT_LANDSCAPE : RENDER_HEIGHT_PORTRAIT;

    onProgress({
        stage: "loading",
        progress: 0,
        message: "Loading FFmpeg Core...",
    });

    const ffmpeg = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

    try {
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
    } catch (e) {
        console.error("FFmpeg load failed", e);
        throw new Error("Failed to load FFmpeg. Check browser compatibility.");
    }

    onProgress({
        stage: "preparing",
        progress: 0,
        message: "Analyzing audio...",
    });

    // Validate audio URL
    if (!songData.audioUrl) {
        throw new Error("No audio URL provided. Cannot export video without audio.");
    }

    // 1. Fetch and potentially mix audio with SFX
    let audioBlob: Blob;
    let audioBuffer: AudioBuffer;

    const shouldMixSFX =
        mergedConfig.sfxPlan &&
        canMixSFX(mergedConfig.sfxPlan) &&
        mergedConfig.sceneTimings &&
        mergedConfig.sceneTimings.length > 0;

    if (shouldMixSFX) {
        onProgress({
            stage: "preparing",
            progress: 5,
            message: "Mixing audio with SFX...",
        });

        console.log("[FFmpeg] Mixing narration with SFX...");

        try {
            audioBlob = await mixAudioWithSFX({
                narrationUrl: songData.audioUrl,
                sfxPlan: mergedConfig.sfxPlan!,
                scenes: mergedConfig.sceneTimings!,
                sfxMasterVolume: mergedConfig.sfxMasterVolume,
                musicMasterVolume: mergedConfig.musicMasterVolume,
            });
            console.log(`[FFmpeg] Mixed audio size: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`);
        } catch (error) {
            console.warn("[FFmpeg] SFX mixing failed, using original audio:", error);
            const audioResponse = await fetch(songData.audioUrl);
            if (!audioResponse.ok) {
                throw new Error(`Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
            }
            audioBlob = await audioResponse.blob();
        }
    } else {
        const audioResponse = await fetch(songData.audioUrl);
        if (!audioResponse.ok) {
            throw new Error(`Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }
        audioBlob = await audioResponse.blob();
    }

    if (audioBlob.size === 0) {
        throw new Error("Audio file is empty. Please ensure audio has been generated.");
    }

    // Decode audio for visualization
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    } catch (decodeError: any) {
        throw new Error(`Unable to decode audio data. The audio file may be corrupted or in an unsupported format. (${decodeError.message || 'Unknown error'})`);
    }

    await ffmpeg.writeFile("audio.wav", await fetchFile(audioBlob));

    // 2. Extract Frequency Data
    const frequencyDataArray = await extractFrequencyData(audioBuffer, FPS);

    onProgress({
        stage: "preparing",
        progress: 20,
        message: "Loading high-res assets...",
    });

    // 3. Preload assets with progress tracking
    const assets = await preloadAssets(songData, (progress) => {
        onProgress({
            stage: "preparing",
            progress: 20 + Math.round((progress.loaded / progress.total) * 10),
            message: `Loading asset ${progress.loaded}/${progress.total} (${progress.type})...`,
            currentAssetIndex: progress.loaded,
            totalAssets: progress.total,
            currentAssetType: progress.type,
        });
    });

    // Count video assets for logging
    const videoAssetCount = assets.filter(a => a.type === "video").length;
    const imageAssetCount = assets.filter(a => a.type === "image").length;
    console.log(`[FFmpeg WASM] Loaded ${assets.length} assets (${videoAssetCount} videos, ${imageAssetCount} images)`);

    const duration = audioBuffer.duration;
    const totalFrames = Math.ceil(duration * FPS);

    onProgress({
        stage: "rendering",
        progress: 0,
        message: videoAssetCount > 0
            ? `Rendering ${totalFrames} frames (includes ${videoAssetCount} video assets)...`
            : "Rendering frames...",
        totalFrames,
        totalAssets: assets.length,
    });

    // 4. Create canvas
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    applyPolyfills(ctx);

    // 5. Render Loop
    let previousFreqData: Uint8Array | null = null;

    for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame / FPS;
        const freqData = frequencyDataArray[frame] || new Uint8Array(128).fill(0);

        await renderFrameToCanvas(
            ctx,
            WIDTH,
            HEIGHT,
            currentTime,
            assets,
            songData.parsedSubtitles,
            freqData,
            previousFreqData,
            mergedConfig
        );

        previousFreqData = freqData;

        const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), "image/jpeg", JPEG_QUALITY);
        });

        const frameName = `frame${frame.toString().padStart(6, "0")}.jpg`;
        await ffmpeg.writeFile(frameName, await fetchFile(blob));

        // Update progress with detailed frame info
        if (frame % FPS === 0) {
            const progress = Math.round((frame / totalFrames) * 80);

            // Determine current asset type
            const currentAsset = assets.find((a, i) => {
                const nextAsset = assets[i + 1];
                return currentTime >= a.time && (!nextAsset || currentTime < nextAsset.time);
            });

            onProgress({
                stage: "rendering",
                progress,
                message: `Rendering ${Math.floor(frame / FPS)}s / ${Math.floor(duration)}s`,
                currentFrame: frame,
                totalFrames,
                currentAssetType: currentAsset?.type,
                isSeekingVideo: currentAsset?.type === "video",
            });
        }
    }

    onProgress({
        stage: "encoding",
        progress: 85,
        message: "Encoding MP4 (WASM)...",
    });

    // 6. Run FFmpeg
    await ffmpeg.exec([
        "-framerate",
        String(FPS),
        "-i",
        "frame%06d.jpg",
        "-i",
        "audio.wav",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        "-pix_fmt",
        "yuv420p",
        "-vf", `scale=${WIDTH}:${HEIGHT}:flags=lanczos,setsar=1`,
        "-shortest",
        "-preset", "medium",
        "-crf", "21",
        "output.mp4",
    ]);

    onProgress({ stage: "complete", progress: 100, message: "Done!" });

    // 7. Read output
    const data = (await ffmpeg.readFile("output.mp4")) as Uint8Array;
    const videoBlob = new Blob([data.slice()], { type: "video/mp4" });

    // Clear frame cache to free memory
    clearFrameCache();

    let cloudUrl: string | undefined;

    // Upload final video to cloud storage if session context provided
    if (cloudSessionId) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `export_${timestamp}.mp4`;
            const result = await cloudAutosave.saveAsset(
                cloudSessionId,
                videoBlob,
                filename,
                'exports',
                true, // waitForUpload
                true  // makePublic
            );
            if (result.publicUrl) {
                cloudUrl = result.publicUrl;
                console.log('[FFmpeg WASM] ✓ Final video uploaded to cloud:', cloudUrl);

                // Save export record if user is authenticated
                if (userId && projectId) {
                    const aspectRatio = mergedConfig.orientation === 'landscape' ? '16:9' : '9:16';
                    await saveExportRecord(projectId, {
                        format: 'mp4',
                        quality: 'high',
                        aspectRatio: aspectRatio as '16:9' | '9:16' | '1:1',
                        cloudUrl,
                        fileSize: videoBlob.size,
                        duration,
                    });
                    console.log('[FFmpeg WASM] ✓ Export record saved to Firestore');
                }
            }
        } catch (err) {
            console.warn('[FFmpeg WASM] Cloud upload/record failed (non-fatal):', err);
        }
    }

    return { blob: videoBlob, cloudUrl };
}
