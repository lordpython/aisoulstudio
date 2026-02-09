/**
 * Error Handler
 *
 * Handles tool execution failures, fallback application, and error state management.
 * Extracted from agentCore.ts for focused responsibility.
 *
 * Requirements: 6.1-6.5 — Error recovery and fallback handling
 */

import { agentLogger } from "../../logger";
import { ProductionState, ProductionProgress } from "./types";
import { productionStore } from "./store";
import { GeneratedImage } from "../../../types";
import {
    type ToolError,
    ErrorTracker,
    getRecoveryStrategy,
    executeWithRetry,
    applyFallback,
} from "../../agent/errorRecovery";

const log = agentLogger.child('ErrorHandler');

export interface ToolExecutionResult {
    result: string;
    fallbackApplied: boolean;
}

/**
 * Execute a tool with retry logic and fallback handling.
 */
export async function executeToolWithRecovery(
    toolName: string,
    toolArgs: Record<string, unknown>,
    targetTool: { invoke: (args: Record<string, unknown>) => Promise<unknown> },
    sessionId: string | null,
    errorTracker: ErrorTracker,
    executedTools: Set<string>,
    onProgress?: (progress: ProductionProgress) => void
): Promise<ToolExecutionResult> {
    const strategy = getRecoveryStrategy(toolName);

    const getToolContext = () => {
        if (sessionId) {
            const state = productionStore.get(sessionId);
            return {
                ...toolArgs,
                visuals: state?.visuals,
                narrationSegments: state?.narrationSegments,
                musicUrl: (state as ProductionState & { musicUrl?: string })?.musicUrl,
                sfxPlan: state?.sfxPlan,
                subtitles: state?.subtitles,
            };
        }
        return toolArgs;
    };

    const executionResult = await executeWithRetry(
        () => targetTool.invoke(toolArgs),
        strategy,
        (attempt, _err, delay) => {
            onProgress?.({
                stage: "retry",
                tool: toolName,
                message: `${toolName} failed (attempt ${attempt}/${strategy.maxRetries}). Retrying in ${Math.round(delay / 1000)}s...`,
                isComplete: false,
            });
        }
    );

    let result: string;
    let fallbackApplied = false;

    if (executionResult.success) {
        result = executionResult.data as string;

        let logicalSuccess = true;
        try {
            const parsed = JSON.parse(result);
            if (parsed.success === false) {
                logicalSuccess = false;
            }
        } catch {
            // Not JSON — assume success
        }

        if (logicalSuccess) {
            errorTracker.recordSuccess();
            executedTools.add(toolName);
        } else {
            log.warn(` Tool ${toolName} returned logical failure, allowing retry.`);
            try {
                const parsed = JSON.parse(result);
                if (parsed.error && sessionId) {
                    const toolError: ToolError = {
                        tool: toolName,
                        error: parsed.error,
                        category: 'recoverable',
                        timestamp: Date.now(),
                        retryCount: 0,
                        recoverable: true,
                    };
                    const state = productionStore.get(sessionId);
                    if (state) {
                        state.errors.push(toolError);
                        productionStore.set(sessionId, state);
                    }
                }
            } catch { /* Ignore */ }
        }
    } else {
        const toolError = executionResult.error!;
        log.error(` Tool ${toolName} failed after ${executionResult.retryCount} retries:`, toolError.error);

        if (strategy.fallbackAction && strategy.continueOnFailure) {
            onProgress?.({
                stage: "fallback",
                tool: toolName,
                message: `${toolName} failed. Applying fallback: ${strategy.fallbackAction}`,
                isComplete: false,
            });

            const fallbackResult = await applyFallback(
                strategy.fallbackAction,
                toolError,
                getToolContext()
            );

            if (fallbackResult) {
                // Special handling for generate_visuals fallback
                if (toolName === 'generate_visuals' && sessionId) {
                    applyVisualsFallback(sessionId);
                }

                result = JSON.stringify({
                    success: true,
                    fallback: true,
                    fallbackAction: strategy.fallbackAction,
                    ...fallbackResult,
                });
                toolError.fallbackApplied = strategy.fallbackAction;
                errorTracker.recordError(toolError, true);
                fallbackApplied = true;
            } else {
                result = JSON.stringify({
                    success: false,
                    error: toolError.error,
                    retryCount: executionResult.retryCount,
                });
                errorTracker.recordError(toolError, false);
            }
        } else {
            result = JSON.stringify({
                success: false,
                error: toolError.error,
                retryCount: executionResult.retryCount,
                continueOnFailure: strategy.continueOnFailure,
            });
            errorTracker.recordError(toolError, false);
        }

        // Store error in session state
        if (sessionId) {
            const state = productionStore.get(sessionId);
            if (state) {
                state.errors.push(toolError);
                productionStore.set(sessionId, state);
            }
        }
    }

    return { result, fallbackApplied };
}

/**
 * Apply visual placeholders when generate_visuals fails.
 */
function applyVisualsFallback(sessionId: string): void {
    const state = productionStore.get(sessionId);
    if (state && state.contentPlan) {
        log.info(` Applying fallback visuals to state for ${sessionId}`);

        const currentVisuals = state.visuals ? [...state.visuals] : [];
        const placeholders: GeneratedImage[] = [];

        for (let i = 0; i < state.contentPlan.scenes.length; i++) {
            const scene = state.contentPlan.scenes[i];
            if (!scene) {
                log.warn(` Scene at index ${i} not found, skipping placeholder.`);
                continue;
            }
            if (currentVisuals[i]?.imageUrl) {
                placeholders.push(currentVisuals[i]!);
            } else {
                placeholders.push({
                    promptId: scene.id,
                    imageUrl: "",
                    isPlaceholder: true
                });
            }
        }

        state.visuals = placeholders;
        productionStore.set(sessionId, state);
    }
}
