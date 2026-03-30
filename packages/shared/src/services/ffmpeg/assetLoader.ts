/**
 * Asset Loader Module
 *
 * Handles preloading of images and videos for video export rendering.
 * Provides async utilities for loading DOM elements from URLs.
 *
 * Enhanced with:
 * - Reliable video seeking with proper event handling
 * - Video dimension validation
 * - Video frame caching for performance
 * - Timeout handling for slow-loading assets
 */

import { SongData } from "../../types";
import { RenderAsset } from "./exportConfig";

// --- Constants ---

/** Timeout for loading assets (60 seconds - increased for large Veo video blobs) */
const ASSET_LOAD_TIMEOUT_MS = 60000;

/** Timeout for video seeking (2 seconds) */
const VIDEO_SEEK_TIMEOUT_MS = 2000;

// --- Video Frame Cache ---

/**
 * Cache for extracted video frames to avoid re-seeking
 * Key: `${videoSrc}:${frameIndex}` where frameIndex = Math.floor(time * FPS)
 */
type CachedFrameEntry = {
    bitmap: ImageBitmap;
    bytes: number;
    cachedAt: number;
};

const videoFrameCache = new Map<string, CachedFrameEntry>();

/** Maximum cache size in bytes to prevent memory issues */
const MAX_CACHE_BYTES = 384 * 1024 * 1024;

/** TTL for cached frames in milliseconds */
const FRAME_CACHE_TTL_MS = 30_000;

/** Approximate bytes per pixel for RGBA ImageBitmap memory estimates */
const BYTES_PER_PIXEL = 4;

/** FPS used for frame cache key calculation */
const CACHE_FPS = 24;

let cachedFrameBytes = 0;

// Run TTL eviction on a fixed interval instead of on every cache insert (avoids O(n) scan per write).
let _ttlEvictionTimer: ReturnType<typeof setInterval> | null = setInterval(evictExpiredEntries, 10_000);
// Prevent the timer from keeping non-browser runtimes alive.
if (typeof (_ttlEvictionTimer as unknown as { unref?: () => void }).unref === 'function') {
    (_ttlEvictionTimer as unknown as { unref: () => void }).unref();
}

/**
 * Stop the background TTL eviction timer.
 * Call this when the export UI unmounts to prevent the timer from firing indefinitely.
 */
export function stopFrameCacheTimer(): void {
    if (_ttlEvictionTimer !== null) {
        clearInterval(_ttlEvictionTimer);
        _ttlEvictionTimer = null;
    }
}

/**
 * Get cache key for a video frame
 */
function getFrameCacheKey(videoSrc: string, time: number): string {
    const frameIndex = Math.floor(time * CACHE_FPS);
    return `${videoSrc}:${frameIndex}`;
}

/**
 * Get cached frame if available
 */
export function getCachedFrame(videoSrc: string, time: number): ImageBitmap | null {
    const key = getFrameCacheKey(videoSrc, time);
    const entry = videoFrameCache.get(key);
    if (!entry) {
        return null;
    }

    // Move to the end of the insertion order to preserve LRU semantics.
    videoFrameCache.delete(key);
    videoFrameCache.set(key, entry);

    return entry.bitmap;
}

function estimateBitmapBytes(bitmap: ImageBitmap): number {
    return Math.max(1, bitmap.width) * Math.max(1, bitmap.height) * BYTES_PER_PIXEL;
}

function evictExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of videoFrameCache) {
        if (now - entry.cachedAt > FRAME_CACHE_TTL_MS) {
            videoFrameCache.delete(key);
            cachedFrameBytes -= entry.bytes;
            try {
                entry.bitmap.close();
            } catch (_e) {
                // ignore
            }
        }
    }
}

function evictFrameEntries(bytesNeeded: number): void {
    // TTL eviction runs on a periodic timer; only LRU pressure eviction happens here.
    while (videoFrameCache.size > 0 && cachedFrameBytes + bytesNeeded > MAX_CACHE_BYTES) {
        const oldestKey = videoFrameCache.keys().next().value as string | undefined;
        if (!oldestKey) {
            break;
        }

        const oldest = videoFrameCache.get(oldestKey);
        videoFrameCache.delete(oldestKey);

        if (oldest) {
            cachedFrameBytes -= oldest.bytes;
            try {
                oldest.bitmap.close();
            } catch (error) {
                console.warn(`[AssetLoader] Failed to close cached bitmap for ${oldestKey}:`, error);
            }
        }
    }
}

/**
 * Cache a video frame
 */
export function cacheFrame(videoSrc: string, time: number, bitmap: ImageBitmap): void {
    const key = getFrameCacheKey(videoSrc, time);
    const bytes = estimateBitmapBytes(bitmap);

    // If this frame is larger than the entire cache budget, let the caller use it
    // directly without retaining a cached copy.
    if (bytes > MAX_CACHE_BYTES) {
        return;
    }

    const existing = videoFrameCache.get(key);
    if (existing) {
        videoFrameCache.delete(key);
        cachedFrameBytes -= existing.bytes;
        try {
            existing.bitmap.close();
        } catch (error) {
            console.warn(`[AssetLoader] Failed to replace cached bitmap for ${key}:`, error);
        }
    }

    evictFrameEntries(bytes);

    if (cachedFrameBytes + bytes > MAX_CACHE_BYTES) {
        return;
    }

    videoFrameCache.set(key, { bitmap, bytes, cachedAt: Date.now() });
    cachedFrameBytes += bytes;
}

/**
 * Clear all cached frames and stop the TTL eviction timer.
 * Call after export completes to release memory and prevent the interval from running indefinitely.
 */
export function clearFrameCache(): void {
    stopFrameCacheTimer();
    for (const entry of videoFrameCache.values()) {
        try {
            entry.bitmap.close();
        } catch (error) {
            console.warn("[AssetLoader] Failed to close cached bitmap during clear:", error);
        }
    }
    videoFrameCache.clear();
    cachedFrameBytes = 0;
    console.log("[AssetLoader] Frame cache cleared");
}

/**
 * Get cache statistics for debugging
 */
export function getFrameCacheStats(): { size: number; bytes: number; maxBytes: number; maxSize: number } {
    return { size: videoFrameCache.size, bytes: cachedFrameBytes, maxBytes: MAX_CACHE_BYTES, maxSize: MAX_CACHE_BYTES };
}

// --- Image Loading ---

/**
 * Load an image from URL and return the HTMLImageElement
 * @param url - URL to load image from
 * @param timeoutMs - Optional timeout in milliseconds (default: 15000)
 */
export async function loadImageAsset(url: string, timeoutMs = ASSET_LOAD_TIMEOUT_MS): Promise<HTMLImageElement> {
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Image load timeout after ${timeoutMs}ms: ${url}`));
        }, timeoutMs);

        img.onload = () => {
            clearTimeout(timeout);
            if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                reject(new Error(`Invalid image dimensions (${img.naturalWidth}x${img.naturalHeight}): ${url}`));
                return;
            }
            resolve();
        };
        img.onerror = (e) => {
            clearTimeout(timeout);
            reject(new Error(`Failed to load image: ${url} - ${e}`));
        };
        img.src = url;
    });

    return img;
}

// --- Video Loading ---

/**
 * Video asset result with additional metadata
 */
export interface VideoAssetResult {
    element: HTMLVideoElement;
    width: number;
    height: number;
    duration: number;
    hasAudio: boolean;
}

/**
 * Load a video from URL with proper validation and metadata extraction
 * @param url - URL to load video from
 * @param timeoutMs - Optional timeout in milliseconds (default: 15000)
 * @throws Error if video fails to load or has invalid dimensions
 */
export async function loadVideoAsset(url: string, timeoutMs = ASSET_LOAD_TIMEOUT_MS): Promise<HTMLVideoElement> {
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.preload = "metadata"; // Load metadata first, then switch to auto
    vid.playsInline = true;
    vid.muted = true; // Muted for export (audio handled separately)

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Video metadata load timeout after ${timeoutMs}ms: ${url}`));
        }, timeoutMs);

        vid.onloadedmetadata = () => {
            clearTimeout(timeout);

            // Validate dimensions
            if (vid.videoWidth === 0 || vid.videoHeight === 0) {
                reject(new Error(`Invalid video dimensions (${vid.videoWidth}x${vid.videoHeight}): ${url}`));
                return;
            }

            // Validate duration
            if (!vid.duration || !isFinite(vid.duration) || vid.duration <= 0) {
                reject(new Error(`Invalid video duration (${vid.duration}): ${url}`));
                return;
            }

            console.log(`[AssetLoader] Video loaded: ${vid.videoWidth}x${vid.videoHeight}, ${vid.duration.toFixed(2)}s - ${url}`);
            resolve();
        };

        vid.onerror = (e) => {
            clearTimeout(timeout);
            const errorMessage = vid.error?.message || "Unknown error";
            reject(new Error(`Failed to load video: ${url} - ${errorMessage}`));
        };

        vid.src = url;
    });

    // Switch to full preload and ensure video is ready for seeking
    vid.preload = "auto";

    // Prime the video for seeking by playing and immediately pausing
    // This ensures the video decoder is initialized
    try {
        await vid.play();
        vid.pause();
        vid.currentTime = 0;
    } catch (e) {
        // Play might fail due to autoplay policies, but that's ok for export
        console.warn(`[AssetLoader] Video play/pause init warning (non-fatal): ${e}`);
    }

    return vid;
}

/**
 * Load video with extended metadata
 */
export async function loadVideoAssetWithMetadata(url: string, timeoutMs = ASSET_LOAD_TIMEOUT_MS): Promise<VideoAssetResult> {
    const vid = await loadVideoAsset(url, timeoutMs);

    // Check if video has audio tracks
    // Note: This may not be accurate in all browsers
    const hasAudio = (vid as any).mozHasAudio !== undefined
        ? (vid as any).mozHasAudio
        : (vid as any).webkitAudioDecodedByteCount !== undefined
            ? (vid as any).webkitAudioDecodedByteCount > 0
            : true; // Assume audio present if we can't detect

    return {
        element: vid,
        width: vid.videoWidth,
        height: vid.videoHeight,
        duration: vid.duration,
        hasAudio,
    };
}

// --- Video Seeking ---

/**
 * Seek video to specific time with proper event handling
 * This ensures the video frame is actually available before returning
 *
 * @param vid - Video element to seek
 * @param time - Time in seconds to seek to
 * @param timeoutMs - Optional timeout in milliseconds (default: 2000)
 * @returns Promise that resolves when seek is complete
 */
export async function seekVideoToTime(
    vid: HTMLVideoElement,
    time: number,
    timeoutMs = VIDEO_SEEK_TIMEOUT_MS
): Promise<void> {
    // Clamp time to valid range
    const targetTime = Math.max(0, Math.min(time, vid.duration - 0.001));

    // If already at target time (within 1 frame tolerance), skip seeking
    const frameDuration = 1 / CACHE_FPS;
    if (Math.abs(vid.currentTime - targetTime) < frameDuration) {
        return;
    }

    return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            vid.removeEventListener('seeked', onSeeked);
            vid.removeEventListener('error', onError);
            // Don't reject, just warn and resolve - allows export to continue
            console.warn(`[AssetLoader] Video seek timeout at ${targetTime.toFixed(2)}s, using current frame`);
            resolve();
        }, timeoutMs);

        const onSeeked = () => {
            clearTimeout(timeout);
            vid.removeEventListener('seeked', onSeeked);
            vid.removeEventListener('error', onError);
            resolve();
        };

        const onError = () => {
            clearTimeout(timeout);
            vid.removeEventListener('seeked', onSeeked);
            vid.removeEventListener('error', onError);
            console.warn(`[AssetLoader] Video seek error at ${targetTime.toFixed(2)}s`);
            resolve(); // Don't reject, allow export to continue
        };

        vid.addEventListener('seeked', onSeeked);
        vid.addEventListener('error', onError);
        vid.currentTime = targetTime;
    });
}

/**
 * Get video frame at specific time, using cache if available
 * Creates an ImageBitmap for efficient canvas drawing
 *
 * @param vid - Video element
 * @param time - Time in seconds
 * @param useCache - Whether to use/populate frame cache (default: true)
 * @returns ImageBitmap of the video frame
 */
export async function getVideoFrameAtTime(
    vid: HTMLVideoElement,
    time: number,
    useCache = true
): Promise<ImageBitmap> {
    const videoSrc = vid.src;

    // Check cache first
    if (useCache) {
        const cached = getCachedFrame(videoSrc, time);
        if (cached) {
            return cached;
        }
    }

    // Seek to the requested time
    await seekVideoToTime(vid, time);

    // Create ImageBitmap from current frame
    const bitmap = await createImageBitmap(vid);

    // Cache the frame
    if (useCache) {
        cacheFrame(videoSrc, time, bitmap);
    }

    return bitmap;
}

// --- Placeholder Generation ---

/**
 * Create a placeholder image for failed video loads
 */
export function createPlaceholderImage(
    width: number,
    height: number,
    message = "Video unavailable"
): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width || 1280;
    canvas.height = height || 720;
    const ctx = canvas.getContext("2d")!;

    // Dark background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Warning icon (simple triangle)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2 - 30;
    const iconSize = 60;

    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - iconSize / 2);
    ctx.lineTo(centerX + iconSize / 2, centerY + iconSize / 2);
    ctx.lineTo(centerX - iconSize / 2, centerY + iconSize / 2);
    ctx.closePath();
    ctx.fill();

    // Exclamation mark
    ctx.fillStyle = "#1a1a2e";
    ctx.font = "bold 36px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", centerX, centerY + 10);

    // Message
    ctx.fillStyle = "#ffffff";
    ctx.font = "24px Arial";
    ctx.fillText(message, centerX, centerY + iconSize + 20);

    return canvas;
}

// --- Asset Preloading ---

/**
 * Progress callback for asset loading
 */
export interface AssetLoadProgress {
    loaded: number;
    total: number;
    currentAsset: string;
    type: "image" | "video";
    success: boolean;
}

/** Maximum concurrent asset loads during preload */
const PRELOAD_CONCURRENCY = 4;

/**
 * Run tasks with bounded concurrency, preserving result order.
 */
async function withBoundedConcurrency<T>(
    tasks: Array<() => Promise<T>>,
    limit: number
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let next = 0;

    async function worker(): Promise<void> {
        while (next < tasks.length) {
            const i = next++;
            results[i] = await tasks[i]!();
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limit, tasks.length) }, worker)
    );
    return results;
}

/**
 * Preload all assets (images/videos) for a song.
 * Returns sorted array of RenderAssets ready for frame rendering.
 *
 * Improvements over the sequential version:
 * - Pre-indexes generatedImages by promptId for O(1) lookup
 * - Loads up to PRELOAD_CONCURRENCY assets in parallel
 */
export async function preloadAssets(
    songData: SongData,
    renderDimensions?: { width: number; height: number },
    onProgress?: (progress: AssetLoadProgress) => void
): Promise<RenderAsset[]> {
    // Sort prompts by timestamp
    const sortedPrompts = [...songData.prompts].sort(
        (a, b) => (a.timestampSeconds || 0) - (b.timestampSeconds || 0)
    );

    // Debug: log timestamp distribution
    const timestamps = sortedPrompts.map(p => p.timestampSeconds || 0);
    const uniqueTimestamps = new Set(timestamps);
    console.log(`[AssetLoader] Prompt timestamps: ${sortedPrompts.length} prompts, ${uniqueTimestamps.size} unique times`);
    if (sortedPrompts.length > 0) {
        console.log(`[AssetLoader] Time range: ${timestamps[0]}s - ${timestamps[timestamps.length - 1]}s`);
        if (uniqueTimestamps.size === 1) {
            console.warn(`[AssetLoader] WARNING: All prompts have same timestamp (${timestamps[0]}s) - video will show only last image!`);
        }
    }

    // Pre-index generatedImages by promptId for O(1) lookup
    const generatedByPromptId = new Map(
        songData.generatedImages.map((g) => [g.promptId, g])
    );

    const total = sortedPrompts.length;
    let loaded = 0;

    // Build one task per prompt that has a generated asset
    type SlotResult = RenderAsset | null;
    const tasks: Array<() => Promise<SlotResult>> = sortedPrompts.map((prompt) => async (): Promise<SlotResult> => {
        const generated = generatedByPromptId.get(prompt.id);
        if (!generated) {
            loaded++;
            return null;
        }

        const isVideo = generated.type === "video";
        const assetUrl = generated.cachedBlobUrl || generated.imageUrl;

        onProgress?.({
            loaded,
            total,
            currentAsset: assetUrl,
            type: isVideo ? "video" : "image",
            success: true,
        });

        let result: SlotResult = null;
        try {
            if (isVideo) {
                const element = await loadVideoAsset(assetUrl);
                const nativeDuration =
                    element.duration && isFinite(element.duration) ? element.duration : undefined;
                const naturalWidth = element.videoWidth;
                const naturalHeight = element.videoHeight;
                const baseScale = renderDimensions
                    ? Math.max(renderDimensions.width / naturalWidth, renderDimensions.height / naturalHeight)
                    : 0;
                result = {
                    id: prompt.id,
                    time: prompt.timestampSeconds || 0,
                    type: "video",
                    element,
                    naturalWidth,
                    naturalHeight,
                    baseScale,
                    nativeDuration,
                };
                console.log(
                    `[AssetLoader] ✓ Video loaded for scene ${prompt.id} (${nativeDuration?.toFixed(1) ?? "unknown"}s)` +
                    `${generated.cachedBlobUrl ? " (from cache)" : ""}`
                );
            } else {
                const element = await loadImageAsset(assetUrl);
                const naturalWidth = element.naturalWidth || element.width;
                const naturalHeight = element.naturalHeight || element.height;
                const baseScale = renderDimensions
                    ? Math.max(renderDimensions.width / naturalWidth, renderDimensions.height / naturalHeight)
                    : 0;
                result = {
                    id: prompt.id,
                    time: prompt.timestampSeconds || 0,
                    type: "image",
                    element,
                    naturalWidth,
                    naturalHeight,
                    baseScale,
                };
            }
        } catch (error) {
            console.warn(
                `[AssetLoader] ✗ Failed to load ${isVideo ? "video" : "image"} for prompt ${prompt.id}:`,
                error
            );
            const placeholder = createPlaceholderImage(1280, 720, `Scene ${prompt.id} unavailable`);
            result = {
                id: prompt.id,
                time: prompt.timestampSeconds || 0,
                type: "image",
                element: placeholder as unknown as HTMLImageElement,
                naturalWidth: placeholder.width,
                naturalHeight: placeholder.height,
                baseScale: renderDimensions
                    ? Math.max(renderDimensions.width / placeholder.width, renderDimensions.height / placeholder.height)
                    : 0,
            };
            onProgress?.({
                loaded,
                total,
                currentAsset: assetUrl,
                type: isVideo ? "video" : "image",
                success: false,
            });
        }

        loaded++;
        return result;
    });

    const slots = await withBoundedConcurrency(tasks, PRELOAD_CONCURRENCY);
    const assets = slots.filter((s): s is RenderAsset => s !== null);

    // Log final distribution
    const assetTimes = assets.map(a => a.time);
    const uniqueAssetTimes = new Set(assetTimes);
    console.log(`[AssetLoader] Preloaded ${assets.length} assets (${assets.filter(a => a.type === "video").length} videos)`);
    if (assetTimes.length > 0) {
        console.log(`[AssetLoader] Asset time distribution: ${uniqueAssetTimes.size} unique times, range: ${Math.min(...assetTimes)}s - ${Math.max(...assetTimes)}s`);
        if (uniqueAssetTimes.size === 1 && assets.length > 1) {
            console.error(`[AssetLoader] BUG: All ${assets.length} assets have same time (${assetTimes[0]}s)! Check timestampSeconds calculation.`);
        }
    }

    return assets;
}
