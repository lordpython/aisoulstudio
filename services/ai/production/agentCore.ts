/**
 * Agent Core - Production Agent Entry Points
 *
 * Re-exports from focused modules:
 * - resultCache.ts   — Cached result checking
 * - agentExecutor.ts — Main agent loop with tool execution
 * - errorHandler.ts  — Error recovery and fallback handling
 *
 * Also contains the multi-agent entry point and session management.
 */

import { GEMINI_API_KEY } from "../../shared/apiClient";
import { agentLogger } from "../../logger";
import { ProductionState, ProductionProgress } from "./types";
import { productionStore } from "./store";
import { setGlobalProgressCallback } from "./tools/contentTools";

import {
    runSupervisorAgent,
    type SupervisorOptions,
    type SupervisorResult,
} from "../subagents/supervisorAgent";

// --- Re-exports from focused modules ---

export { checkResultCache } from "./resultCache";
export { runProductionAgent } from "./agentExecutor";

const log = agentLogger.child('AgentCore');

// --- Multi-Agent Entry Point ---

/**
 * Run the production agent with multi-agent architecture (supervisor + subagents).
 *
 * This is the new multi-agent implementation that uses specialized subagents:
 * - IMPORT subagent: YouTube/audio import and transcription
 * - CONTENT subagent: Content planning, narration, quality validation
 * - MEDIA subagent: Visual and audio asset generation
 * - ENHANCEMENT/EXPORT subagent: Post-processing and final export
 *
 * @param userRequest User's natural language request
 * @param onProgress Optional callback for progress updates
 * @returns Production state or null if failed
 */
export async function runProductionAgentWithSubagents(
    userRequest: string,
    onProgress?: (progress: ProductionProgress) => void
): Promise<ProductionState | null> {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    setGlobalProgressCallback(onProgress || null);

    onProgress?.({
        stage: "starting",
        message: "Starting multi-agent video production...",
        isComplete: false
    });

    try {
        const supervisorOptions: SupervisorOptions = {
            apiKey: GEMINI_API_KEY,
            userRequest,
            onProgress: (progress) => {
                onProgress?.({
                    stage: progress.stage,
                    tool: progress.tool,
                    message: progress.message,
                    isComplete: progress.isComplete,
                    success: progress.success,
                });
            },
        };

        const result: SupervisorResult = await runSupervisorAgent(supervisorOptions);

        const finalState = result.sessionId ? productionStore.get(result.sessionId) : null;

        if (finalState) {
            const assetSummary = {
                scenes: finalState.contentPlan?.scenes.length || 0,
                narrations: finalState.narrationSegments.length,
                visuals: finalState.visuals.length,
                music: finalState.musicTaskId ? 1 : 0,
                sfx: finalState.sfxPlan?.scenes.length || 0,
                subtitles: finalState.subtitles ? 1 : 0,
            };

            onProgress?.({
                stage: "complete",
                message: `Multi-agent production complete! Generated ${assetSummary.scenes} scenes with ${assetSummary.narrations} narrations, ${assetSummary.visuals} visuals${assetSummary.music ? ', music' : ''}${assetSummary.sfx ? `, ${assetSummary.sfx} SFX` : ''}${assetSummary.subtitles ? ', and subtitles' : ''}.`,
                isComplete: true,
                assetSummary,
            });
        } else {
            onProgress?.({
                stage: "complete",
                message: result.message || "Multi-agent production complete!",
                isComplete: true,
            });
        }

        return finalState ?? null;
    } catch (error) {
        log.error(" Multi-agent error:", error);

        onProgress?.({
            stage: "error",
            message: error instanceof Error ? error.message : String(error),
            isComplete: true,
        });

        throw error;
    } finally {
        setGlobalProgressCallback(null);
    }
}

// --- Session Management ---

/**
 * Get a production session by ID.
 */
export function getProductionSession(sessionId: string): ProductionState | null {
    return productionStore.get(sessionId) || null;
}

/**
 * Clear a production session.
 */
export function clearProductionSession(sessionId: string): void {
    productionStore.delete(sessionId);
}
