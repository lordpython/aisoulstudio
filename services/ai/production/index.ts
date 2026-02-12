/**
 * Production Agent - Modular Entry Point
 *
 * This module re-exports all production agent functionality from the modular
 * structure. Import from this file instead of individual modules for cleaner imports.
 *
 * @example
 * import {
 *   runProductionAgent,
 *   ProductionState,
 *   productionTools
 * } from './production';
 */

// --- Types ---
export {
    // Schemas (PascalCase as defined)
    PlanVideoSchema,
    NarrateScenesSchema,
    GenerateVisualsSchema,
    PlanSFXSchema,
    ValidatePlanSchema,
    AdjustTimingSchema,
    GenerateVideoSchema,
    AnimateImageSchema,
    GenerateMusicSchema,
    StoryModeSchema,
    VerifyCharacterConsistencySchema,

    // Interfaces
    type ProductionState,
    type ProductionProgress,
    type StoryModeState,

    // Helper functions
    createInitialState,
} from "./types";

// --- Store ---
export {
    productionStore,
    storyModeStore,
    getProductionSession as getProductionSessionFromStore,
    clearProductionSession as clearProductionSessionFromStore,
    initializeProductionSession,
    updateProductionSession,
} from "./store";

// --- Utilities ---
export {
    detectLanguageFromText,
    generateSessionId,
    validateContentPlanId,
    isValidSessionId,
    createStepIdentifier,
} from "./utils";

// --- Prompts ---
export { PRODUCTION_AGENT_PROMPT } from "./prompts";

// --- Tools ---
export {
    // Content Tools
    planVideoTool,
    narrateScenesTool,
    validatePlanTool,
    adjustTimingTool,
    generateVisualsTool,
    planSFXTool,
    // Progress callback (used by tools)
    setGlobalProgressCallback,
    getGlobalProgressCallback,
} from "./tools/contentTools";

export {
    // Media Tools
    generateVideoTool,
    animateImageTool,
    generateMusicTool,
} from "./tools/mediaTools";

export {
    // Status Tools
    getProductionStatusTool,
    markCompleteTool,
} from "./tools/statusTools";

export {
    // Story Tools
    generateBreakdownTool,
    createScreenplayTool,
    generateCharactersTool,
    generateShotlistTool,
    verifyCharacterConsistencyTool,
} from "./tools/storyTools";

// --- Tool Registration ---
export {
    productionTools,
    storyModeTools,
    toolMap,
    registerProductionTools,
    toolRegistry,
    ToolGroup,
    createToolDefinition,
} from "./toolRegistration";

// --- Agent Core ---
export {
    runProductionAgent,
    runProductionAgentWithSubagents,
    getProductionSession,
    clearProductionSession,
    checkResultCache,
} from "./agentCore";

// --- Re-exports from external modules ---
export {
    analyzeIntent,
    generateIntentHint,
    detectYouTubeUrl,
    shouldAnimate,
    shouldGenerateMusic,
    extractStyle,
    type IntentDetectionResult,
} from "../../agent/intentDetection";

export {
    type ToolError,
    type PartialSuccessReport,
    type RecoveryStrategy,
    type ErrorCategory,
    ErrorTracker,
    formatErrorsForResponse,
    getRecoveryStrategy,
    classifyError,
} from "../../agent/errorRecovery";
