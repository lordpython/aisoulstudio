/**
 * Export Upload Module
 *
 * Server session lifecycle for the server-FFmpeg export path:
 * init → batch upload frames → finalize/download (SSE or sync).
 */

import { SERVER_URL, ProgressCallback } from "./exportConfig";
import { subscribeToJob, isSSESupported, JobProgress } from "./sseClient";

export interface UploadFrame {
    blob: Blob;
    name: string;
}

/**
 * Initialize a server-side export session.
 * Returns the sessionId for subsequent chunk uploads and finalize.
 */
export async function initExportSession(
    audioBlob: Blob,
    fps: number,
    width: number,
    height: number,
    quality: number,
    totalFrames: number
): Promise<string> {
    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.mp3");
    formData.append("fps", String(fps));
    formData.append("width", String(width));
    formData.append("height", String(height));
    formData.append("quality", String(quality));
    formData.append("totalFrames", String(totalFrames));

    const res = await fetch(`${SERVER_URL}/api/export/init`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        throw new Error("Failed to initialize export session");
    }

    const { sessionId } = await res.json();
    return sessionId as string;
}

/**
 * Upload a batch of rendered frame blobs to the server.
 */
export async function uploadFrameBatch(sessionId: string, batch: UploadFrame[]): Promise<void> {
    const formData = new FormData();
    batch.forEach((f) => formData.append("frames", f.blob, f.name));

    const res = await fetch(`${SERVER_URL}/api/export/chunk?sessionId=${sessionId}`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        throw new Error("Failed to upload video chunk");
    }
}

/**
 * Finalize the export session and download the encoded video blob.
 * Automatically chooses async (SSE) or sync mode based on environment support.
 */
export async function finalizeAndDownload(
    sessionId: string,
    fps: number,
    totalFrames: number,
    width: number,
    height: number,
    quality: number,
    onProgress: ProgressCallback
): Promise<Blob> {
    const useAsync = isSSESupported();

    const finalizeRes = await fetch(`${SERVER_URL}/api/export/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, fps, totalFrames, width, height, quality, sync: !useAsync }),
    });

    if (!finalizeRes.ok) {
        const errorData = await finalizeRes.json().catch(() => ({ error: "Export failed" }));
        throw new Error((errorData as any).error || "Export failed");
    }

    if (!useAsync) {
        onProgress({ stage: "encoding", progress: 99, message: "Downloading..." });
        return finalizeRes.blob();
    }

    const { jobId } = await finalizeRes.json() as { jobId: string };
    console.log(`[ExportUpload] Job ${jobId} queued, subscribing to SSE`);
    onProgress({ stage: "encoding", progress: 90, message: "Server encoding started..." });

    return new Promise<Blob>((resolve, reject) => {
        let sseTimeout: ReturnType<typeof setTimeout>;

        const unsubscribe = subscribeToJob(
            jobId,
            (progress: JobProgress) => {
                const uiProgress = 90 + Math.round(progress.progress * 0.09);
                onProgress({
                    stage: "encoding",
                    progress: uiProgress,
                    message: progress.message,
                    currentFrame: progress.currentFrame,
                    totalFrames: progress.totalFrames,
                });

                if (progress.status === "complete") {
                    clearTimeout(sseTimeout);
                    unsubscribe();
                    fetch(`${SERVER_URL}/api/export/download/${jobId}`)
                        .then((res) => {
                            if (!res.ok) throw new Error("Failed to download video");
                            return res.blob();
                        })
                        .then(resolve)
                        .catch(reject);
                } else if (progress.status === "failed") {
                    clearTimeout(sseTimeout);
                    unsubscribe();
                    reject(new Error(progress.error || "Export failed"));
                }
            },
            (error) => {
                clearTimeout(sseTimeout);
                unsubscribe();
                reject(error);
            }
        );

        // 30-minute hard timeout
        sseTimeout = setTimeout(() => {
            unsubscribe();
            reject(new Error("Export timed out"));
        }, 30 * 60 * 1000);
    });
}
