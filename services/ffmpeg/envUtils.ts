/**
 * Platform Utilities Module
 *
 * Platform detection and export engine recommendations.
 * Extracted from ffmpegService.ts for modularity.
 */

import { isNative, isFFmpegWasmSupported, getRecommendedExportEngine } from "../../utils/platformUtils";

/**
 * Check if client-side FFmpeg WASM export is available on this platform
 * Returns false on mobile (Capacitor) as SharedArrayBuffer is not supported in WebViews
 */
export function isClientSideExportAvailable(): boolean {
    return isFFmpegWasmSupported();
}

/**
 * Get the recommended export engine for current platform
 * Mobile apps should use 'cloud' rendering, web can use 'browser' if supported
 */
export function getDefaultExportEngine(): "cloud" | "browser" {
    return getRecommendedExportEngine();
}
