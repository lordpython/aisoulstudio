/**
 * Render Pipeline Module
 *
 * Shared frame render loop used by both the server-FFmpeg and WASM export paths.
 * Callers provide an `onFrame` callback that decides what to do with each blob
 * (upload to server, write to WASM FS, etc.).
 */

import { SongData } from "../../types";
import { applyPolyfills } from "../../lib/utils";
import { ExportConfig, RenderAsset } from "./exportConfig";
import { renderFrameToCanvas, type RenderFrameState } from "./frameRenderer";

const FPS = 30;
const JPEG_QUALITY = 0.98;

export type FrameFormat = "jpeg" | "png";

export interface RenderPipelineOptions {
    width: number;
    height: number;
    totalFrames: number;
    duration: number;
    assets: RenderAsset[];
    subtitles: SongData["parsedSubtitles"];
    frequencyDataArray: Uint8Array[];
    config: ExportConfig;
    /** Frame image format. PNG is lossless (better for server re-encode), JPEG is smaller (better for WASM). Default: "jpeg". */
    frameFormat?: FrameFormat;
    /**
     * Called for every rendered frame.
     * May be async — the pipeline awaits it before proceeding to the next frame.
     * name follows the pattern `frame000000.jpg` or `frame000000.png`.
     */
    onFrame: (blob: Blob, frameIndex: number, frameName: string) => Promise<void>;
    /**
     * Called once per second of rendered video for progress updates.
     * Receives the current frame index, totals, duration, and active asset.
     */
    onProgress: (
        frame: number,
        totalFrames: number,
        duration: number,
        currentAsset: RenderAsset | undefined
    ) => void;
}

type RenderSurface = {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    ctx: CanvasRenderingContext2D;
};

function createRenderSurface(width: number, height: number): RenderSurface {
    const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    applyPolyfills(ctx);

    return { canvas, ctx };
}

async function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, format: FrameFormat = "jpeg"): Promise<Blob> {
    const mimeType = format === "png" ? "image/png" : "image/jpeg";

    if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
        return canvas.convertToBlob(
            format === "png"
                ? { type: mimeType }
                : { type: mimeType, quality: JPEG_QUALITY }
        );
    }

    return new Promise<Blob>((resolve, reject) => {
        (canvas as HTMLCanvasElement).toBlob((blob) => {
            if (!blob) {
                reject(new Error("Failed to encode frame blob"));
                return;
            }

            resolve(blob);
        }, mimeType, format === "png" ? undefined : JPEG_QUALITY);
    });
}

/**
 * Find the active asset at `currentTime` using an early-break linear scan.
 * Assets must be sorted ascending by `time`.
 */
export function findActiveAsset(assets: RenderAsset[], currentTime: number): RenderAsset | undefined {
    let currentIndex = 0;
    for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        if (asset && currentTime >= asset.time) {
            currentIndex = i;
        } else {
            break;
        }
    }
    return assets[currentIndex];
}

/**
 * Run the frame render loop.
 * Creates its own canvas; does NOT call clearFrameCache (caller's responsibility).
 */
export async function runRenderPipeline(options: RenderPipelineOptions): Promise<void> {
    const {
        width,
        height,
        totalFrames,
        duration,
        assets,
        subtitles,
        frequencyDataArray,
        config,
        frameFormat = "jpeg",
        onFrame,
        onProgress,
    } = options;

    const ext = frameFormat === "png" ? "png" : "jpg";
    const surfaces = [createRenderSurface(width, height), createRenderSurface(width, height)];
    const renderState: RenderFrameState = { assetIndex: 0, subtitleIndex: 0 };

    let previousFreqData: Uint8Array | null = null;
    let pendingEncode: Promise<Blob> | null = null;
    let pendingFrameIndex = -1;
    let pendingFrameName = "";

    for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame / FPS;
        const freqData = frequencyDataArray[frame] || new Uint8Array(128).fill(0);
        const surfaceIndex = frame % 2;
        const surface = surfaces[surfaceIndex]!;

        if (frame > 0) {
            const previousSurface = surfaces[1 - surfaceIndex]!;
            pendingEncode = canvasToBlob(previousSurface.canvas, frameFormat);
            pendingFrameIndex = frame - 1;
            pendingFrameName = `frame${pendingFrameIndex.toString().padStart(6, "0")}.${ext}`;
        }

        await renderFrameToCanvas(
            surface.ctx,
            width,
            height,
            currentTime,
            assets,
            subtitles,
            freqData,
            previousFreqData,
            config,
            renderState
        );

        previousFreqData = freqData;

        if (pendingEncode) {
            const blob = await pendingEncode;
            await onFrame(blob, pendingFrameIndex, pendingFrameName);
            pendingEncode = null;
        }

        if (frame % FPS === 0) {
            onProgress(frame, totalFrames, duration, assets[renderState.assetIndex]);
        }
    }

    if (totalFrames > 0) {
        const finalFrameIndex = totalFrames - 1;
        const finalSurface = surfaces[finalFrameIndex % 2]!;
        const finalBlob = await canvasToBlob(finalSurface.canvas, frameFormat);
        await onFrame(finalBlob, finalFrameIndex, `frame${finalFrameIndex.toString().padStart(6, "0")}.${ext}`);
    }
}
