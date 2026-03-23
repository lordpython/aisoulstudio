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
import { renderFrameToCanvas } from "./frameRenderer";

const FPS = 24;
const JPEG_QUALITY = 0.98;

export interface RenderPipelineOptions {
    width: number;
    height: number;
    totalFrames: number;
    duration: number;
    assets: RenderAsset[];
    subtitles: SongData["parsedSubtitles"];
    frequencyDataArray: Uint8Array[];
    config: ExportConfig;
    /**
     * Called for every rendered frame.
     * May be async — the pipeline awaits it before proceeding to the next frame.
     * name follows the pattern `frame000000.jpg`.
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
        onFrame,
        onProgress,
    } = options;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    applyPolyfills(ctx);

    let previousFreqData: Uint8Array | null = null;

    for (let frame = 0; frame < totalFrames; frame++) {
        const currentTime = frame / FPS;
        const freqData = frequencyDataArray[frame] || new Uint8Array(128).fill(0);

        await renderFrameToCanvas(
            ctx,
            width,
            height,
            currentTime,
            assets,
            subtitles,
            freqData,
            previousFreqData,
            config
        );

        previousFreqData = freqData;

        const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), "image/jpeg", JPEG_QUALITY);
        });

        const frameName = `frame${frame.toString().padStart(6, "0")}.jpg`;
        await onFrame(blob, frame, frameName);

        if (frame % FPS === 0) {
            onProgress(frame, totalFrames, duration, findActiveAsset(assets, currentTime));
        }
    }
}
