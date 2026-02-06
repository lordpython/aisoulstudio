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

// Asset loading (enhanced with video support)
export {
    preloadAssets,
    loadImageAsset,
    loadVideoAsset,
    loadVideoAssetWithMetadata,
    seekVideoToTime,
    getVideoFrameAtTime,
    getCachedFrame,
    cacheFrame,
    clearFrameCache,
    getFrameCacheStats,
    createPlaceholderImage,
    type VideoAssetResult,
    type AssetLoadProgress,
} from "./assetLoader";

// Video audio extraction (for Veo native audio)
export {
    extractAudioFromVideo,
    extractAudioFromVideos,
    mixVideoAudioWithNarration,
    type ExtractedVideoAudio,
    type VideoAudioExtractionResult,
} from "./videoAudioExtractor";

// Export presets for different platforms
export {
    EXPORT_PRESETS,
    getExportPreset,
    getPresetsForPlatform,
    getPresetsForAspectRatio,
    getRecommendedPreset,
    getAllPresetIds,
    getPresetSummary,
    type ExportPresetId,
    type ExportPreset,
} from "./exportPresets";

// SSE progress client for real-time updates
export {
    subscribeToJob,
    pollJobStatus,
    waitForJobCompletion,
    isSSESupported,
    type JobProgress,
} from "./sseClient";

// Checksum generator for frame validation
export {
    generateBlobChecksum,
    generateBatchChecksums,
    isChecksumSupported,
    verifyChecksum,
    createFrameManifest,
    type FrameChecksum,
} from "./checksumGenerator";

// Export options type
export type { ExportOptions, ExportResult } from "./exporters";
