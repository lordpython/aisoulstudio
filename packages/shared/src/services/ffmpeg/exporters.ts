/**
 * Video Exporters Module
 *
 * Thin coordinators for the two export paths:
 *   - exportVideoWithFFmpeg   → server-side FFmpeg (primary / professional)
 *   - exportVideoClientSide   → browser-side FFmpeg WASM (fallback)
 *
 * Shared logic lives in:
 *   audioPreparation.ts  – fetch, SFX mix, decode, frequency extraction
 *   renderPipeline.ts    – canvas + frame render loop
 *   exportUpload.ts      – server session init, batch upload, finalize/download
 *   exportPersistence.ts – cloud upload + Firestore record
 */

import { SongData } from "../../types";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import {
    ExportConfig,
    ProgressCallback,
    mergeExportConfig,
    getExportDimensions,
    getExportQualityValue,
} from "./exportConfig";
import { preloadAssets, clearFrameCache } from "./assetLoader";
import { prepareAudio } from "./audioPreparation";
import { runRenderPipeline } from "./renderPipeline";
import { initExportSession, uploadFrameBatch, finalizeAndDownload, type UploadFrame } from "./exportUpload";
import { persistExport } from "./exportPersistence";

const FPS = 24;
const BATCH_SIZE = 96;

export interface ExportOptions {
    cloudSessionId?: string;
    userId?: string;
    projectId?: string;
}

export interface ExportResult {
    blob: Blob;
    cloudUrl?: string;
}

// ---------------------------------------------------------------------------
// Server-side FFmpeg export (primary path)
// ---------------------------------------------------------------------------

export async function exportVideoWithFFmpeg(
    songData: SongData,
    onProgress: ProgressCallback,
    config: Partial<ExportConfig> = {},
    options: ExportOptions = {}
): Promise<ExportResult> {
    const { cloudSessionId, userId, projectId } = options;
    const mergedConfig = mergeExportConfig(config);
    const { width, height } = getExportDimensions(mergedConfig);
    const qualityValue = getExportQualityValue(mergedConfig.quality);

    onProgress({ stage: "preparing", progress: 0, message: "Analyzing audio..." });

    const prepared = await prepareAudio(songData, mergedConfig, (msg) =>
        onProgress({ stage: "preparing", progress: 0, message: msg })
    );
    const { audioBlob, frequencyDataArray, duration, totalFrames, audioContext } = prepared;

    try {
        onProgress({ stage: "preparing", progress: 10, message: "Initializing render session..." });
        const sessionId = await initExportSession(audioBlob, FPS, width, height, qualityValue, totalFrames);

        onProgress({ stage: "preparing", progress: 20, message: "Loading high-res assets..." });
        const assets = await preloadAssets(songData, (p) => {
            onProgress({
                stage: "preparing",
                progress: 20 + Math.round((p.loaded / p.total) * 10),
                message: `Loading asset ${p.loaded}/${p.total} (${p.type})...`,
                currentAssetIndex: p.loaded,
                totalAssets: p.total,
                currentAssetType: p.type,
            });
        });

        const videoCount = assets.filter((a) => a.type === "video").length;
        console.log(`[FFmpeg] Loaded ${assets.length} assets (${videoCount} videos, ${assets.length - videoCount} images)`);

        onProgress({
            stage: "rendering",
            progress: 0,
            message: videoCount > 0
                ? `Rendering ${totalFrames} frames (includes ${videoCount} video assets)...`
                : "Rendering cinematic frames...",
            totalFrames,
            totalAssets: assets.length,
        });

        // Render + upload pipeline: render frames while concurrently uploading batches
        let frameBuffer: UploadFrame[] = [];
        let pendingUpload: Promise<void> | null = null;
        let uploadError: Error | null = null;

        await runRenderPipeline({
            width,
            height,
            totalFrames,
            duration,
            assets,
            subtitles: songData.parsedSubtitles,
            frequencyDataArray,
            config: mergedConfig,
            async onFrame(blob, _frame, name) {
                if (uploadError) throw uploadError;

                frameBuffer.push({ blob, name });

                if (frameBuffer.length >= BATCH_SIZE) {
                    if (pendingUpload) await pendingUpload;
                    if (uploadError) throw uploadError;
                    const batch = frameBuffer;
                    frameBuffer = [];
                    pendingUpload = uploadFrameBatch(sessionId, batch).catch((e: Error) => {
                        uploadError = e;
                    });
                }
            },
            onProgress(frame, total, dur, currentAsset) {
                onProgress({
                    stage: "rendering",
                    progress: Math.round((frame / total) * 90),
                    message: `Rendering ${Math.floor(frame / FPS)}s / ${Math.floor(dur)}s`,
                    currentFrame: frame,
                    totalFrames: total,
                    currentAssetType: currentAsset?.type,
                    isSeekingVideo: currentAsset?.type === "video",
                });
            },
        });

        // Flush remaining upload
        if (pendingUpload) await pendingUpload;
        if (uploadError) throw uploadError;
        if (frameBuffer.length > 0) {
            await uploadFrameBatch(sessionId, frameBuffer);
        }

        onProgress({ stage: "encoding", progress: 90, message: "Queuing video encoding..." });

        const videoBlob = await finalizeAndDownload(
            sessionId, FPS, totalFrames, width, height, qualityValue, onProgress
        );

        onProgress({ stage: "complete", progress: 100, message: "Export complete!" });

        const cloudUrl = await persistExport(
            cloudSessionId, videoBlob, mergedConfig, userId, projectId, duration, "[FFmpeg]"
        );

        return { blob: videoBlob, cloudUrl };
    } finally {
        clearFrameCache();
        audioContext.close().catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Browser-side WASM export (fallback path)
// ---------------------------------------------------------------------------

export async function exportVideoClientSide(
    songData: SongData,
    onProgress: ProgressCallback,
    config: Partial<ExportConfig> = {},
    options: ExportOptions = {}
): Promise<ExportResult> {
    const { cloudSessionId, userId, projectId } = options;
    const mergedConfig = mergeExportConfig(config);
    const { width, height } = getExportDimensions(mergedConfig);
    const qualityValue = getExportQualityValue(mergedConfig.quality);

    onProgress({ stage: "loading", progress: 0, message: "Loading FFmpeg Core..." });

    const ffmpeg = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

    try {
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
    } catch (e) {
        console.error("FFmpeg WASM load failed", e);
        throw new Error("Failed to load FFmpeg. Check browser compatibility.");
    }

    onProgress({ stage: "preparing", progress: 0, message: "Analyzing audio..." });

    const prepared = await prepareAudio(songData, mergedConfig, (msg) =>
        onProgress({ stage: "preparing", progress: 5, message: msg })
    );
    const { audioBlob, frequencyDataArray, duration, totalFrames, audioContext } = prepared;

    try {
        await ffmpeg.writeFile("audio.wav", await fetchFile(audioBlob));

        onProgress({ stage: "preparing", progress: 20, message: "Loading high-res assets..." });
        const assets = await preloadAssets(songData, (p) => {
            onProgress({
                stage: "preparing",
                progress: 20 + Math.round((p.loaded / p.total) * 10),
                message: `Loading asset ${p.loaded}/${p.total} (${p.type})...`,
                currentAssetIndex: p.loaded,
                totalAssets: p.total,
                currentAssetType: p.type,
            });
        });

        const videoCount = assets.filter((a) => a.type === "video").length;
        console.log(`[FFmpeg WASM] Loaded ${assets.length} assets (${videoCount} videos, ${assets.length - videoCount} images)`);

        onProgress({
            stage: "rendering",
            progress: 0,
            message: videoCount > 0
                ? `Rendering ${totalFrames} frames (includes ${videoCount} video assets)...`
                : "Rendering frames...",
            totalFrames,
            totalAssets: assets.length,
        });

        await runRenderPipeline({
            width,
            height,
            totalFrames,
            duration,
            assets,
            subtitles: songData.parsedSubtitles,
            frequencyDataArray,
            config: mergedConfig,
            async onFrame(blob, _frame, name) {
                await ffmpeg.writeFile(name, await fetchFile(blob));
            },
            onProgress(frame, total, dur, currentAsset) {
                onProgress({
                    stage: "rendering",
                    progress: Math.round((frame / total) * 80),
                    message: `Rendering ${Math.floor(frame / FPS)}s / ${Math.floor(dur)}s`,
                    currentFrame: frame,
                    totalFrames: total,
                    currentAssetType: currentAsset?.type,
                    isSeekingVideo: currentAsset?.type === "video",
                });
            },
        });

        onProgress({ stage: "encoding", progress: 85, message: "Encoding MP4 (WASM)..." });

        await ffmpeg.exec([
            "-framerate", String(FPS),
            "-i", "frame%06d.jpg",
            "-i", "audio.wav",
            "-c:v", "libx264",
            "-c:a", "aac",
            "-b:a", "256k",
            "-pix_fmt", "yuv420p",
            "-vf", `scale=${width}:${height}:flags=lanczos,setsar=1`,
            "-shortest",
            "-preset", "medium",
            "-crf", String(qualityValue),
            "output.mp4",
        ]);

        onProgress({ stage: "complete", progress: 100, message: "Done!" });

        const data = (await ffmpeg.readFile("output.mp4")) as Uint8Array;
        const videoBlob = new Blob([data.slice()], { type: "video/mp4" });

        const cloudUrl = await persistExport(
            cloudSessionId, videoBlob, mergedConfig, userId, projectId, duration, "[FFmpeg WASM]"
        );

        return { blob: videoBlob, cloudUrl };
    } finally {
        clearFrameCache();
        audioContext.close().catch(() => {});
    }
}
