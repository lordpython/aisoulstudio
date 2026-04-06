/**
 * Format-Aware Render Quality Presets
 *
 * Provides per-VideoFormat quality configuration for the render pipeline.
 * Short-form formats (shorts, ads) use lower cache budgets and JPEG encoding.
 * Long-form formats (documentary, youtube-narrator) use PNG for server
 * re-encode quality and larger cache budgets.
 */

import type { VideoFormat } from '../../types';
import type { FrameFormat } from './renderPipeline';

export interface FormatRenderQuality {
    /** Frame encoding format — PNG for server (lossless), JPEG for WASM (smaller) */
    frameFormat: FrameFormat;
    /** JPEG quality (0-1). Ignored when frameFormat is 'png'. */
    jpegQuality: number;
    /** Max frame cache size in bytes for this format */
    maxCacheBytes: number;
    /** Target frames per second */
    targetFps: number;
    /** Canvas resolution width */
    width: number;
    /** Canvas resolution height */
    height: number;
}

/**
 * Default quality presets per video format.
 *
 * Rationale:
 * - Shorts/Ads: Small cache, JPEG encoding, 9:16 or 16:9 at 1080p
 * - YouTube/Educational: Medium cache, JPEG for WASM / PNG for server
 * - Documentary/Movie: Large cache, PNG for maximum re-encode quality
 * - Music Video: Medium cache, 30fps for beat sync fidelity
 */
export const FORMAT_RENDER_QUALITY: Record<VideoFormat, FormatRenderQuality> = {
    'shorts': {
        frameFormat: 'jpeg',
        jpegQuality: 0.95,
        maxCacheBytes: 128 * 1024 * 1024,  // 128 MB
        targetFps: 30,
        width: 1080,
        height: 1920,
    },
    'advertisement': {
        frameFormat: 'jpeg',
        jpegQuality: 0.96,
        maxCacheBytes: 128 * 1024 * 1024,  // 128 MB
        targetFps: 30,
        width: 1920,
        height: 1080,
    },
    'youtube-narrator': {
        frameFormat: 'jpeg',
        jpegQuality: 0.97,
        maxCacheBytes: 256 * 1024 * 1024,  // 256 MB
        targetFps: 24,
        width: 1920,
        height: 1080,
    },
    'educational': {
        frameFormat: 'jpeg',
        jpegQuality: 0.97,
        maxCacheBytes: 256 * 1024 * 1024,  // 256 MB
        targetFps: 24,
        width: 1920,
        height: 1080,
    },
    'documentary': {
        frameFormat: 'png',
        jpegQuality: 1.0,
        maxCacheBytes: 512 * 1024 * 1024,  // 512 MB
        targetFps: 24,
        width: 1920,
        height: 1080,
    },
    'movie-animation': {
        frameFormat: 'png',
        jpegQuality: 1.0,
        maxCacheBytes: 512 * 1024 * 1024,  // 512 MB
        targetFps: 24,
        width: 1920,
        height: 1080,
    },
    'music-video': {
        frameFormat: 'jpeg',
        jpegQuality: 0.97,
        maxCacheBytes: 256 * 1024 * 1024,  // 256 MB
        targetFps: 30,  // Higher FPS for beat-sync fidelity
        width: 1920,
        height: 1080,
    },
    'news-politics': {
        frameFormat: 'jpeg',
        jpegQuality: 0.96,
        maxCacheBytes: 256 * 1024 * 1024,  // 256 MB
        targetFps: 24,
        width: 1920,
        height: 1080,
    },
};

/**
 * Get the render quality preset for a given format.
 * Falls back to a sensible default for unknown formats.
 */
export function getFormatRenderQuality(formatId: string): FormatRenderQuality {
    return FORMAT_RENDER_QUALITY[formatId as VideoFormat] ?? {
        frameFormat: 'jpeg',
        jpegQuality: 0.97,
        maxCacheBytes: 256 * 1024 * 1024,
        targetFps: 30,
        width: 1920,
        height: 1080,
    };
}

/**
 * Get the render quality for server-side rendering.
 * Always uses PNG for lossless frames that FFmpeg will re-encode.
 */
export function getServerRenderQuality(formatId: string): FormatRenderQuality {
    const base = getFormatRenderQuality(formatId);
    return {
        ...base,
        frameFormat: 'png',
        jpegQuality: 1.0,
    };
}
