/**
 * Asset Loader Module
 *
 * Handles preloading of images and videos for video export rendering.
 * Provides async utilities for loading DOM elements from URLs.
 */

import { SongData } from "../../types";
import { RenderAsset } from "./exportConfig";

/**
 * Load an image from URL and return the HTMLImageElement
 */
export async function loadImageAsset(url: string): Promise<HTMLImageElement> {
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
    });

    return img;
}

/**
 * Load a video from URL and return the HTMLVideoElement
 */
export async function loadVideoAsset(url: string): Promise<HTMLVideoElement> {
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.src = url;
    vid.muted = true;
    vid.preload = "auto";

    await new Promise<void>((resolve) => {
        vid.onloadeddata = () => resolve();
        vid.onerror = () => resolve(); // fallback - don't fail if video fails
    });

    return vid;
}

/**
 * Preload all assets (images/videos) for a song
 * Returns sorted array of RenderAssets ready for frame rendering
 */
export async function preloadAssets(
    songData: SongData,
    onProgress?: (loaded: number, total: number) => void
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
            try {
                if (generated.type === "video") {
                    const element = await loadVideoAsset(generated.imageUrl);
                    assets.push({
                        time: prompt.timestampSeconds || 0,
                        type: "video",
                        element,
                    });
                } else {
                    const element = await loadImageAsset(generated.imageUrl);
                    assets.push({
                        time: prompt.timestampSeconds || 0,
                        type: "image",
                        element,
                    });
                }
            } catch (error) {
                console.warn(`Failed to load asset for prompt ${prompt.id}:`, error);
            }
        }

        loaded++;
        onProgress?.(loaded, total);
    }

    return assets;
}
