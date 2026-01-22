/**
 * FFmpeg Module Index
 *
 * Re-exports all FFmpeg-related modules for convenient imports.
 */

// Types and configuration
export {
    SERVER_URL,
    getServerUrl,
    DEFAULT_EXPORT_CONFIG,
    mergeExportConfig,
    type ExportConfig,
    type ExportProgress,
    type ProgressCallback,
    type RenderAsset,
} from "./exportConfig";

// Platform utilities
export {
    isClientSideExportAvailable,
    getDefaultExportEngine,
} from "./envUtils";

// Export functions (main API)
export {
    exportVideoWithFFmpeg,
    exportVideoClientSide,
} from "./exporters";

// Rendering components (for advanced usage)
export { renderFrameToCanvas } from "./frameRenderer";
export { renderVisualizerLayer } from "./visualizer";
export { renderTextWithWipe, calculateWordRevealProgress } from "./textRenderer";
export { drawAsset, applyTransition } from "./transitions";
export { preloadAssets, loadImageAsset, loadVideoAsset } from "./assetLoader";
