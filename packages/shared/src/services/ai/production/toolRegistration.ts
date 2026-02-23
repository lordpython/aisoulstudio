/**
 * Tool Registration - Register Production Tools with Tool Registry
 *
 * Handles registration of all production agent tools with the centralized
 * tool registry, organizing them by group with proper dependencies.
 *
 * Requirements: 12.1, 12.3 - Tool group organization and dependency tracking
 */

import { StructuredTool } from "@langchain/core/tools";
import {
    toolRegistry,
    ToolGroup,
    createToolDefinition,
} from "../../agent/toolRegistry";
import { agentLogger } from "../../logger";

const log = agentLogger.child('ToolRegistration');

// Import tool arrays from their respective modules
import { importTools } from "../../agent/importTools";
import { exportTools } from "../../agent/exportTools";
import { subtitleTools } from "../../agent/subtitleTools";
import { audioMixingTools } from "../../agent/audioMixingTools";
import { enhancementTools } from "../../agent/enhancementTools";
import { cloudStorageTools } from "../../agent/cloudStorageTools";

// Import individual tools from production modules
import {
    planVideoTool,
    narrateScenesTool,
    validatePlanTool,
    adjustTimingTool,
    generateVisualsTool,
    planSFXTool,
} from "./tools/contentTools";

import {
    generateVideoTool,
    animateImageTool,
    generateMusicTool,
} from "./tools/mediaTools";

import {
    getProductionStatusTool,
    markCompleteTool,
} from "./tools/statusTools";

import {
    generateBreakdownTool,
    createScreenplayTool,
    generateCharactersTool,
    generateShotlistTool,
    verifyCharacterConsistencyTool,
} from "./tools/storyTools";

// --- Combined Tool Array ---

/**
 * All production tools combined for model binding.
 * Organized by group for clarity.
 */
export const productionTools: StructuredTool[] = [
    // Import tools (IMPORT group)
    ...importTools,
    // Content tools (CONTENT group)
    planVideoTool,
    narrateScenesTool,
    validatePlanTool,
    adjustTimingTool,
    // Media tools (MEDIA group)
    generateMusicTool,
    generateVisualsTool,
    generateVideoTool, // Veo 3.1 text-to-video generation
    animateImageTool, // DeAPI image-to-video animation
    planSFXTool,
    // Enhancement tools (ENHANCEMENT group)
    verifyCharacterConsistencyTool,
    ...enhancementTools,
    ...audioMixingTools,
    // Export tools (EXPORT group)
    ...subtitleTools,
    ...exportTools,
    ...cloudStorageTools,
    // Utility tools
    getProductionStatusTool,
    markCompleteTool,
    // Story Mode tools (step-by-step, user-driven workflow)
    generateBreakdownTool,
    createScreenplayTool,
    generateCharactersTool,
    generateShotlistTool,
];

/**
 * Story mode specific tools for screenplay workflow.
 */
export const storyModeTools: StructuredTool[] = [
    generateBreakdownTool,
    createScreenplayTool,
    generateCharactersTool,
    generateShotlistTool,
];

// --- Tool Map for Execution ---

/**
 * Map of tool names to tool instances for quick lookup during execution.
 */
export const toolMap: Record<string, StructuredTool> = {};
productionTools.forEach(t => {
    toolMap[t.name] = t;
});

// --- Tool Registry Registration ---

/**
 * Register all production tools with the tool registry.
 * This enables tool group management and dependency validation.
 *
 * Requirements: 12.1, 12.3
 */
export function registerProductionTools(): void {
    // Clear any existing registrations
    toolRegistry.clear();

    // Register IMPORT group tools
    for (const tool of importTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.IMPORT,
            tool
        ));
    }

    // Register CONTENT group tools
    toolRegistry.register(createToolDefinition(
        planVideoTool.name,
        ToolGroup.CONTENT,
        planVideoTool
    ));
    toolRegistry.register(createToolDefinition(
        narrateScenesTool.name,
        ToolGroup.CONTENT,
        narrateScenesTool,
        ["plan_video"] // Depends on plan_video
    ));
    toolRegistry.register(createToolDefinition(
        validatePlanTool.name,
        ToolGroup.CONTENT,
        validatePlanTool,
        ["plan_video"] // Depends on plan_video
    ));
    toolRegistry.register(createToolDefinition(
        adjustTimingTool.name,
        ToolGroup.CONTENT,
        adjustTimingTool,
        ["narrate_scenes"] // Depends on narration for timing sync
    ));

    // Register MEDIA group tools
    toolRegistry.register(createToolDefinition(
        generateVisualsTool.name,
        ToolGroup.MEDIA,
        generateVisualsTool,
        ["plan_video"] // Depends on content plan
    ));
    toolRegistry.register(createToolDefinition(
        generateVideoTool.name,
        ToolGroup.MEDIA,
        generateVideoTool,
        ["plan_video"] // Depends on content plan for scene descriptions
    ));
    toolRegistry.register(createToolDefinition(
        animateImageTool.name,
        ToolGroup.MEDIA,
        animateImageTool,
        ["generate_visuals"] // Depends on visuals
    ));
    // NOTE: generateMusicTool is not registered - music generation is only
    // available in the dedicated "Generate Music" mode, not in video production
    toolRegistry.register(createToolDefinition(
        planSFXTool.name,
        ToolGroup.MEDIA,
        planSFXTool,
        ["plan_video"] // Depends on content plan
    ));

    // Register ENHANCEMENT group tools
    toolRegistry.register(createToolDefinition(
        verifyCharacterConsistencyTool.name,
        ToolGroup.ENHANCEMENT,
        verifyCharacterConsistencyTool
    ));
    for (const tool of enhancementTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.ENHANCEMENT,
            tool,
            ["generate_visuals"] // Enhancement tools depend on visuals
        ));
    }
    for (const tool of audioMixingTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.ENHANCEMENT,
            tool,
            ["narrate_scenes"] // Audio mixing depends on narration
        ));
    }

    // Register EXPORT group tools
    for (const tool of subtitleTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.EXPORT,
            tool,
            ["narrate_scenes"] // Subtitles depend on narration
        ));
    }
    for (const tool of exportTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.EXPORT,
            tool,
            ["generate_visuals", "narrate_scenes"] // Export depends on visuals and narration
        ));
    }

    // Register CLOUD tools
    for (const tool of cloudStorageTools) {
        toolRegistry.register(createToolDefinition(
            tool.name,
            ToolGroup.EXPORT,
            tool,
            ["export_final_video"] // Cloud storage usually after export
        ));
    }

    // Register STORY group tools (mapping to CONTENT for dependency flow)
    toolRegistry.register(createToolDefinition(
        generateBreakdownTool.name,
        ToolGroup.CONTENT,
        generateBreakdownTool
    ));
    toolRegistry.register(createToolDefinition(
        createScreenplayTool.name,
        ToolGroup.CONTENT,
        createScreenplayTool,
        ["generate_breakdown"]
    ));
    toolRegistry.register(createToolDefinition(
        generateCharactersTool.name,
        ToolGroup.CONTENT,
        generateCharactersTool,
        ["create_screenplay"]
    ));
    toolRegistry.register(createToolDefinition(
        generateShotlistTool.name,
        ToolGroup.CONTENT,
        generateShotlistTool,
        ["create_screenplay", "generate_characters"]
    ));

    // Note: Utility tools (get_production_status, mark_complete) are not registered
    // as they don't belong to a specific group and can be called at any time

    log.info("Registered tools with registry:", toolRegistry.getSummary());
}

// --- Initialization ---

// Initialize tool registry on module load
registerProductionTools();

// --- Re-exports for convenience ---

export {
    toolRegistry,
    ToolGroup,
    createToolDefinition,
} from "../../agent/toolRegistry";
