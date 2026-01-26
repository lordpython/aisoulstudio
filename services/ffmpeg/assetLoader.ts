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

/** Timeout for loading assets (15 seconds) */
const ASSET_LOAD_TIMEOUT_MS = 15000;

/** Timeout for video seeking (2 seconds) */
const VIDEO_SEEK_TIMEOUT_MS = 2000;

// --- Video Frame Cache ---

/**
 * Cache for extracted video frames to avoid re-seeking
 * Key: `${videoSrc}:${frameIndex}` where frameIndex = Math.floor(time * FPS)
 */
const videoFrameCache = new Map<string, ImageBitmap>();

/** Maximum cache size (frames) to prevent memory issues */
const MAX_CACHE_SIZE = 500;

/** FPS used for frame cache key calculation */
const CACHE_FPS = 24;

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
    return videoFrameCache.get(key) || null;
}

/**
 * Cache a video frame
 */
export function cacheFrame(videoSrc: string, time: number, bitmap: ImageBitmap): void {
    // Evict oldest entries if cache is full
    if (videoFrameCache.size >= MAX_CACHE_SIZE) {
        const firstKey = videoFrameCache.keys().next().value;
        if (firstKey) {
            const oldBitmap = videoFrameCache.get(firstKey);
            oldBitmap?.close(); // Release ImageBitmap memory
            videoFrameCache.delete(firstKey);
        }
    }

    const key = getFrameCacheKey(videoSrc, time);
    videoFrameCache.set(key, bitmap);
}

/**
 * Clear all cached frames (call after export completes)
 */
export function clearFrameCache(): void {
    for (const bitmap of videoFrameCache.values()) {
        bitmap.close();
    }
    videoFrameCache.clear();
    console.log("[AssetLoader] Frame cache cleared");
}

/**
 * Get cache statistics for debugging
 */
export function getFrameCacheStats(): { size: number; maxSize: number } {
    return { size: videoFrameCache.size, maxSize: MAX_CACHE_SIZE };
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

/**
 * Preload all assets (images/videos) for a song
 * Returns sorted array of RenderAssets ready for frame rendering
 *
 * Enhanced with:
 * - Proper error handling with fallback placeholders
 * - Detailed progress reporting
 * - Video dimension validation
 */
export async function preloadAssets(
    songData: SongData,
    onProgress?: (progress: AssetLoadProgress) => void
): Promise<RenderAsset[]> {
    const assets: RenderAsset[] = [];

    // Sort prompts by timestamp
    const sortedPrompts = [...songData.prompts].sort(
        (a, b) => (a.timestampSeconds || 0) - (b.timestampSeconds || 0)
    );

    const total = sortedPrompts.length;
    let loaded = 0;

    for (const prompt of sortedPrompts) {
        const generated = songData.generatedImages.find(
            (g) => g.promptId === prompt.id
        );

        if (generated) {
            const isVideo = generated.type === "video";
            // Prefer cached blob URL over original URL (prevents expired URL issues)
            const assetUrl = generated.cachedBlobUrl || generated.imageUrl;

            onProgress?.({
                loaded,
                total,
                currentAsset: assetUrl,
                type: isVideo ? "video" : "image",
                success: true,
            });

            try {

                if (isVideo) {
                    const element = await loadVideoAsset(assetUrl);
                    assets.push({
                        time: prompt.timestampSeconds || 0,
                        type: "video",
                        element,
                    });
                    console.log(`[AssetLoader] ✓ Video asset loaded for scene ${prompt.id}${generated.cachedBlobUrl ? ' (from cache)' : ''}`);
                } else {
                    const element = await loadImageAsset(assetUrl);
                    assets.push({
                        time: prompt.timestampSeconds || 0,
                        type: "image",
                        element,
                    });
                }
            } catch (error) {
                console.warn(`[AssetLoader] ✗ Failed to load ${isVideo ? 'video' : 'image'} for prompt ${prompt.id}:`, error);

                // Create placeholder for failed assets
                const placeholder = createPlaceholderImage(1280, 720, `Scene ${prompt.id} unavailable`);
                assets.push({
                    time: prompt.timestampSeconds || 0,
                    type: "image", // Fallback to image type
                    element: placeholder as unknown as HTMLImageElement,
                });

                onProgress?.({
                    loaded,
                    total,
                    currentAsset: assetUrl,
                    type: isVideo ? "video" : "image",
                    success: false,
                });
            }
        }

        loaded++;
    }

    console.log(`[AssetLoader] Preloaded ${assets.length} assets (${assets.filter(a => a.type === 'video').length} videos)`);
    return assets;
}
