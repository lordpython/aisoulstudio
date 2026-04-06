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
import { getServerRenderQuality, getFormatRenderQuality } from "./formatQuality";
import { initExportSession, uploadFrameBatch, finalizeAndDownload, type UploadFrame } from "./exportUpload";
import { persistExport } from "./exportPersistence";
import { ffmpegLogger } from '../infrastructure/logger';

const log = ffmpegLogger.child('Export');

const FPS = 30;
const BATCH_SIZE = 96;

async function deleteWasmFiles(ffmpeg: FFmpeg, fileNames: string[]): Promise<void> {
    for (const fileName of fileNames) {
        try {
            await ffmpeg.deleteFile(fileName);
        } catch (error) {
            log.warn(`WASM: Failed to delete ${fileName}`, error);
        }
    }
}

function getWasmEncodingProgress(frameNumber: number, totalFrames: number): number {
    if (totalFrames <= 0) {
        return 80;
    }

    const normalized = Math.max(0, Math.min(frameNumber / totalFrames, 1));
    return 80 + Math.round(normalized * 20);
}

export interface ExportOptions {
    cloudSessionId?: string;
    userId?: string;
    projectId?: string;
    /** Video format ID for format-aware render quality (e.g., 'documentary', 'shorts'). */
    videoFormat?: string;
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
    const { cloudSessionId, userId, projectId, videoFormat } = options;
    const mergedConfig = mergeExportConfig(config);
    const { width, height } = getExportDimensions(mergedConfig);
    const qualityValue = getExportQualityValue(mergedConfig.quality);

    // Apply format-aware quality when a videoFormat is specified
    const formatQuality = videoFormat ? getServerRenderQuality(videoFormat) : null;
    if (formatQuality) {
        log.info(`Using format quality preset for "${videoFormat}": ${formatQuality.frameFormat}, ${formatQuality.targetFps}fps`);
    }

    onProgress({ stage: "preparing", progress: 0, message: "Analyzing audio...", renderedAt: Date.now() });

    const prepared = await prepareAudio(songData, mergedConfig, (msg) =>
        onProgress({ stage: "preparing", progress: 0, message: msg, renderedAt: Date.now() })
    );
    const { audioBlob, frequencyDataArray, duration, totalFrames, audioContext } = prepared;

    try {
        onProgress({ stage: "preparing", progress: 10, message: "Initializing render session...", renderedAt: Date.now() });
        const sessionId = await initExportSession(audioBlob, FPS, width, height, qualityValue, totalFrames);

        onProgress({ stage: "preparing", progress: 20, message: "Loading high-res assets...", renderedAt: Date.now() });
        const assets = await preloadAssets(songData, { width, height }, (p) => {
            onProgress({
                stage: "preparing",
                progress: 20 + Math.round((p.loaded / p.total) * 10),
                message: `Loading asset ${p.loaded}/${p.total} (${p.type})...`,
                currentAssetIndex: p.loaded,
                totalAssets: p.total,
                currentAssetType: p.type,
                renderedAt: Date.now(),
            });
        });

        const videoCount = assets.filter((a) => a.type === "video").length;
        log.info(`Loaded ${assets.length} assets (${videoCount} videos, ${assets.length - videoCount} images)`);

        onProgress({
            stage: "rendering",
            progress: 0,
            message: videoCount > 0
                ? `Rendering ${totalFrames} frames (includes ${videoCount} video assets)...`
                : "Rendering cinematic frames...",
            totalFrames,
            totalAssets: assets.length,
            renderedAt: Date.now(),
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
            frameFormat: "png",
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
                    renderedAt: Date.now(),
                });
            },
        });

        // Flush remaining upload
        if (pendingUpload) await pendingUpload;
        if (uploadError) throw uploadError;
        if (frameBuffer.length > 0) {
            await uploadFrameBatch(sessionId, frameBuffer);
        }

        onProgress({ stage: "encoding", progress: 90, message: "Queuing video encoding...", renderedAt: Date.now() });

        const videoBlob = await finalizeAndDownload(
            sessionId, FPS, totalFrames, width, height, qualityValue, onProgress
        );

        onProgress({ stage: "complete", progress: 100, message: "Export complete!", renderedAt: Date.now() });

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

    onProgress({ stage: "loading", progress: 0, message: "Loading FFmpeg Core...", renderedAt: Date.now() });

    const ffmpeg = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

    try {
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
    } catch (e) {
        log.error('WASM load failed', e);
        throw new Error("Failed to load FFmpeg. Check browser compatibility.");
    }

    onProgress({ stage: "preparing", progress: 0, message: "Analyzing audio...", renderedAt: Date.now() });

    const prepared = await prepareAudio(songData, mergedConfig, (msg) =>
        onProgress({ stage: "preparing", progress: 5, message: msg, renderedAt: Date.now() })
    );
    const { audioBlob, frequencyDataArray, duration, totalFrames, audioContext } = prepared;

    try {
        await ffmpeg.writeFile("audio.wav", await fetchFile(audioBlob));

        onProgress({ stage: "preparing", progress: 20, message: "Loading high-res assets...", renderedAt: Date.now() });
        const assets = await preloadAssets(songData, { width, height }, (p) => {
            onProgress({
                stage: "preparing",
                progress: 20 + Math.round((p.loaded / p.total) * 10),
                message: `Loading asset ${p.loaded}/${p.total} (${p.type})...`,
                currentAssetIndex: p.loaded,
                totalAssets: p.total,
                currentAssetType: p.type,
                renderedAt: Date.now(),
            });
        });

        const videoCount = assets.filter((a) => a.type === "video").length;
        log.info(`WASM: Loaded ${assets.length} assets (${videoCount} videos, ${assets.length - videoCount} images)`);

        onProgress({
            stage: "rendering",
            progress: 0,
            message: videoCount > 0
                ? `Rendering ${totalFrames} frames (includes ${videoCount} video assets)...`
                : "Rendering frames...",
            totalFrames,
            totalAssets: assets.length,
            renderedAt: Date.now(),
        });

        let lastEncodingFrame = -1;
        ffmpeg.on("log", ({ message }) => {
            const match = message.match(/frame=\s*(\d+)/);
            if (!match) {
                return;
            }

            const frameNumber = Number(match[1]);
            if (!Number.isFinite(frameNumber) || frameNumber <= lastEncodingFrame) {
                return;
            }

            lastEncodingFrame = frameNumber;
            onProgress({
                stage: "encoding",
                progress: getWasmEncodingProgress(frameNumber, totalFrames),
                message: `Encoding MP4 (WASM): frame ${Math.min(frameNumber, totalFrames)}/${totalFrames}`,
                currentFrame: Math.min(frameNumber, totalFrames),
                totalFrames,
                renderedAt: Date.now(),
            });
        });

        const frameFileNames = Array.from(
            { length: totalFrames },
            (_unused, index) => `frame${index.toString().padStart(6, "0")}.jpg`
        );

        try {
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
                        renderedAt: Date.now(),
                    });
                },
            });

            onProgress({ stage: "encoding", progress: 85, message: "Encoding MP4 (WASM)...", renderedAt: Date.now() });

            await ffmpeg.exec([
                "-framerate", String(FPS),
                "-i", "frame%06d.jpg",
                "-i", "audio.wav",
                "-c:v", "libx264",
                "-c:a", "aac",
                "-b:a", "320k",
                "-pix_fmt", "yuv420p",
                "-vf", `scale=${width}:${height}:flags=lanczos,setsar=1`,
                "-shortest",
                "-preset", "medium",
                "-crf", String(qualityValue),
                "-movflags", "+faststart",
                "output.mp4",
            ]);

            const data = (await ffmpeg.readFile("output.mp4")) as Uint8Array;
            const videoBlob = new Blob([data.slice()], { type: "video/mp4" });

            onProgress({ stage: "complete", progress: 100, message: "Done!", renderedAt: Date.now() });

            const cloudUrl = await persistExport(
                cloudSessionId, videoBlob, mergedConfig, userId, projectId, duration, "[FFmpeg WASM]"
            );

            return { blob: videoBlob, cloudUrl };
        } finally {
            await deleteWasmFiles(ffmpeg, ["audio.wav", "output.mp4", ...frameFileNames]);
        }
    } finally {
        clearFrameCache();
        audioContext.close().catch(() => {});
    }
}
