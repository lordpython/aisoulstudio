/**
 * Agent Module Index
 * 
 * Re-exports all agent-related modules for convenient imports.
 */

export { agentDirectorLogger, LogLevel, type LogEntry } from './agentLogger';
export { agentMetrics, type AgentDirectorMetrics } from './agentMetrics';
export {
    allTools,
    executeToolCall,
    sanitizeJsonString,
    getVisualReferences,
    critiqueStoryboard,
    jsonExtractor,
    fallbackProcessor,
    analyzeContentTool,
    searchVisualReferencesTool,
    analyzeAndGenerateStoryboardTool,
    generateStoryboardTool,
    refinePromptTool,
    critiqueStoryboardTool,
} from './agentTools';

// Tool Registry exports
export {
    ToolGroup,
    TOOL_GROUP_ORDER,
    toolRegistry,
    isValidGroupTransition,
    getNextGroup,
    getGroupDependencyDescription,
    createToolDefinition,
    type ToolDefinition,
} from './toolRegistry';

// Import Tools exports
export {
    importYouTubeTool,
    transcribeAudioTool,
    importTools,
    getImportedContent,
    setImportedContent,
    clearImportedContent,
    type ImportedContent,
    type TranscriptResult,
    type TranscriptSegment,
    type WordTimingInfo,
} from './importTools';

// Audio Mixing Tools exports
export {
    mixAudioTracksTool,
    audioMixingTools,
    getMixedAudio,
    setMixedAudio,
    clearMixedAudio,
    type MixedAudioResult,
} from './audioMixingTools';

// Subtitle Tools exports
export {
    generateSubtitlesTool,
    subtitleTools,
    getSubtitles,
    setSubtitles,
    clearSubtitles,
    isRTLLanguage,
    addRTLMarkers,
    processNarrationToSubtitles,
    type SubtitleResult,
    type NarrationInput,
} from './subtitleTools';

// Enhancement Tools exports
export {
    removeBackgroundTool,
    restyleImageTool,
    enhancementTools,
    getEnhancedImages,
    addEnhancedImage,
    clearEnhancedImages,
    AVAILABLE_STYLES,
    isRecognizedStyle,
    findClosestStyle,
    getStyleSuggestions,
    type BackgroundRemovalResult,
    type StyleTransferResult,
    type EnhancedImage,
    type StyleOption,
} from './enhancementTools';

// Export Tools exports
export {
    exportFinalVideoTool,
    validateExportTool,
    listExportPresetsTool,
    exportTools,
    getExportResult,
    setExportResult,
    clearExportResult,
    type ExportResult,
    type AssetBundle,
    type ExportValidationResult,
} from './exportTools';

// Intent Detection exports
export {
    detectYouTubeUrl,
    detectAudioFile,
    shouldAnimate,
    shouldGenerateMusic,
    extractStyle,
    shouldRemoveBackground,
    shouldGenerateSubtitles,
    analyzeIntent,
    getAvailableStyles,
    generateIntentHint,
    type IntentDetectionResult,
} from './intentDetection';
