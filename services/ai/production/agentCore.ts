/**
 * Agent Core - Main Production Agent Execution Loop
 *
 * Contains the core agent execution logic including:
 * - Main agent loop with tool execution
 * - Result caching to avoid re-execution
 * - Error recovery with retry and fallback
 * - Progress reporting
 * - Multi-agent orchestration entry point
 *
 * Requirements:
 * - 6.1-6.5: Error recovery and fallback handling
 * - 8.1-8.5: Progress reporting
 * - 10.1-10.5: Optimization (caching, duplicate prevention)
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { GEMINI_API_KEY } from "../../shared/apiClient";
import { agentLogger } from "../../logger";

import { ProductionState, ProductionProgress } from "./types";
import { productionStore } from "./store";
import { createStepIdentifier } from "./utils";
import { PRODUCTION_AGENT_PROMPT } from "./prompts";
import { productionTools, toolMap } from "./toolRegistration";
import { GeneratedImage } from "../../../types";
import { setGlobalProgressCallback } from "./tools/contentTools";

import {
    analyzeIntent,
    generateIntentHint,
} from "../../agent/intentDetection";

import {
    type ToolError,
    ErrorTracker,
    getRecoveryStrategy,
    executeWithRetry,
    applyFallback,
    classifyError,
} from "../../agent/errorRecovery";

import {
    runSupervisorAgent,
    type SupervisorOptions,
    type SupervisorResult,
} from "../subagents/supervisorAgent";

const log = agentLogger.child('AgentCore');

// --- Result Caching ---

/**
 * Check if results are already cached for a tool to avoid re-execution.
 *
 * Requirements: 10.2, 10.5 - Use cached results without re-execution
 */
export function checkResultCache(
    toolName: string,
    toolArgs: Record<string, unknown>,
    state: ProductionState | null
): { cached: boolean; result?: Record<string, unknown> } {
    if (!state) {
        return { cached: false };
    }

    switch (toolName) {
        case 'generate_visuals':
            // Check if visuals already exist for all scenes (Requirement 10.2)
            if (state.visuals &&
                state.contentPlan &&
                state.visuals.length >= state.contentPlan.scenes.length &&
                state.visuals.every(v => v.imageUrl)) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        visualCount: state.visuals.length,
                        message: `Visuals already exist (${state.visuals.length}) - using cached results`,
                    }
                };
            }
            break;

        case 'narrate_scenes':
            // Check if narration already exists for all scenes
            if (state.narrationSegments &&
                state.contentPlan &&
                state.narrationSegments.length >= state.contentPlan.scenes.length &&
                state.narrationSegments.every(s => s.audioBlob)) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        segmentCount: state.narrationSegments.length,
                        totalDuration: state.contentPlan.totalDuration,
                        message: `Narration already exists (${state.narrationSegments.length} segments) - using cached results`,
                    }
                };
            }
            break;

        // NOTE: generate_music case removed - music generation is only available
        // in the dedicated "Generate Music" mode, not in video production

        case 'plan_sfx':
            // Check if SFX plan already exists
            if (state.sfxPlan && state.sfxPlan.scenes.length > 0) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        sceneCount: state.sfxPlan.scenes.length,
                        message: `SFX plan already exists (${state.sfxPlan.scenes.length} scenes) - using cached results`,
                    }
                };
            }
            break;

        case 'mix_audio_tracks':
            // Check if audio mixing already completed
            if (state.mixedAudio && state.mixedAudio.audioBlob) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        duration: state.mixedAudio.duration,
                        message: `Audio already mixed - using cached results`,
                    }
                };
            }
            break;

        case 'generate_subtitles':
            // Check if subtitles already generated
            if (state.subtitles && state.subtitles.content) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        format: state.subtitles.format,
                        segmentCount: state.subtitles.segmentCount,
                        message: `Subtitles already generated (${state.subtitles.format}) - using cached results`,
                    }
                };
            }
            break;

        case 'export_final_video':
            // Check if video already exported
            if (state.exportResult && state.exportResult.videoBlob) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        format: state.exportResult.format,
                        duration: state.exportResult.duration,
                        downloadUrl: state.exportResult.downloadUrl,
                        message: `Video already exported (${state.exportResult.format}) - using cached results`,
                    }
                };
            }
            break;

        case 'animate_image':
            // Check if specific scene is already animated
            const sceneIndex = toolArgs.sceneIndex as number | undefined;
            if (sceneIndex !== undefined &&
                state.visuals &&
                state.visuals[sceneIndex] &&
                (state.visuals[sceneIndex] as GeneratedImage & { videoUrl?: string }).videoUrl) {
                return {
                    cached: true,
                    result: {
                        success: true,
                        cached: true,
                        sceneIndex,
                        message: `Scene ${sceneIndex} already animated - using cached results`,
                    }
                };
            }
            break;
    }

    return { cached: false };
}

// --- Main Agent Loop ---

/**
 * Run the production agent with intent-based tool selection.
 *
 * The agent analyzes user input to detect:
 * - YouTube URLs → routes to import_youtube_content first (Requirement 5.4)
 * - Audio file paths → routes to transcribe_audio_file first
 * - Animation keywords → includes animate_image (Requirement 5.2)
 * - Music keywords → includes generate_music (Requirement 5.3)
 * - Style keywords → uses detected style (Requirement 5.5)
 *
 * @param userRequest User's natural language request
 * @param onProgress Optional callback for progress updates
 * @returns Production state or null if failed
 */
export async function runProductionAgent(
    userRequest: string,
    onProgress?: (progress: ProductionProgress) => void
): Promise<ProductionState | null> {
    // Use centralized API key from apiClient
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    // Analyze user intent for tool selection (Requirements 5.1-5.5)
    const intentResult = analyzeIntent(userRequest);
    const intentHint = generateIntentHint(intentResult);

    log.info(' Intent analysis:', {
        firstTool: intentResult.firstTool,
        hasYouTubeUrl: intentResult.hasYouTubeUrl,
        wantsAnimation: intentResult.wantsAnimation,
        wantsMusic: intentResult.wantsMusic,
        detectedStyle: intentResult.detectedStyle,
        optionalTools: intentResult.optionalTools,
    });

    const model = new ChatGoogleGenerativeAI({
        model: "gemini-3-flash-preview",
        apiKey: GEMINI_API_KEY,
        temperature: 0.3,
    });

    // Bind tools to model
    const modelWithTools = model.bindTools(productionTools);

    // Build the user message with intent hints prepended
    const enhancedUserMessage = intentHint
        ? `${intentHint}\n\nUser Request: ${userRequest}`
        : userRequest;

    // Initialize messages
    const messages: Array<SystemMessage | HumanMessage | AIMessage | ToolMessage> = [
        new SystemMessage(PRODUCTION_AGENT_PROMPT),
        new HumanMessage(enhancedUserMessage),
    ];

    // Set global progress callback for tools to use (Requirement 8.2)
    setGlobalProgressCallback(onProgress || null);

    onProgress?.({
        stage: "starting",
        message: "Starting video production agent...",
        isComplete: false
    });

    // Log detected intent for debugging
    if (intentResult.hasYouTubeUrl) {
        onProgress?.({
            stage: "intent_detected",
            message: `Detected YouTube URL: ${intentResult.youtubeUrl}`,
            isComplete: false
        });
    } else if (intentResult.hasAudioFile) {
        onProgress?.({
            stage: "intent_detected",
            message: `Detected audio file: ${intentResult.audioFilePath}`,
            isComplete: false
        });
    }

    let sessionId: string | null = null;
    const MAX_ITERATIONS = 20; // Safety limit (Requirement 10.4)
    let iteration = 0;

    // Initialize error tracker for partial success reporting (Requirement 6.4)
    const errorTracker = new ErrorTracker();

    // Track executed tools to prevent redundant calls (Requirement 10.1)
    const executedTools = new Set<string>();
    const executedToolsPerStep = new Map<string, Set<string>>();

    try {
        while (iteration < MAX_ITERATIONS) {
            iteration++;

            // Check if approaching iteration limit (Requirement 10.4)
            if (iteration >= MAX_ITERATIONS - 2) {
                onProgress?.({
                    stage: "warning",
                    message: `Approaching iteration limit (${iteration}/${MAX_ITERATIONS}). Production will stop soon if not completed.`,
                    isComplete: false,
                });
            }

            // Get response from model
            const response = await modelWithTools.invoke(messages as unknown[]);
            messages.push(response as unknown as AIMessage);

            // Check if there are tool calls
            const toolCalls = response.tool_calls;
            if (!toolCalls || toolCalls.length === 0) {
                // No more tool calls - agent is done
                // Generate completion summary (Requirement 8.5)
                if (sessionId) {
                    const state = productionStore.get(sessionId);
                    if (state) {
                        const assetSummary = {
                            scenes: state.contentPlan?.scenes.length || 0,
                            narrations: state.narrationSegments.length,
                            visuals: state.visuals.length,
                            music: state.musicTaskId ? 1 : 0,
                            sfx: state.sfxPlan?.scenes.length || 0,
                            subtitles: state.subtitles ? 1 : 0,
                        };

                        onProgress?.({
                            stage: "complete",
                            message: `Production complete! Generated ${assetSummary.scenes} scenes with ${assetSummary.narrations} narrations, ${assetSummary.visuals} visuals${assetSummary.music ? ', music' : ''}${assetSummary.sfx ? `, ${assetSummary.sfx} SFX` : ''}${assetSummary.subtitles ? ', and subtitles' : ''}.`,
                            isComplete: true,
                            assetSummary,
                        });
                    } else {
                        onProgress?.({
                            stage: "complete",
                            message: "Production complete!",
                            isComplete: true,
                        });
                    }
                } else {
                    onProgress?.({
                        stage: "complete",
                        message: "Production complete!",
                        isComplete: true,
                    });
                }
                break;
            }

            // Execute each tool call
            for (const toolCall of toolCalls) {
                const toolName = toolCall.name;
                const toolArgs = toolCall.args as Record<string, unknown>;

                // Create a step identifier based on tool name and key arguments
                const stepId = createStepIdentifier(toolName, toolArgs);

                // Check for duplicate tool call prevention (Requirement 10.1)
                if (!executedToolsPerStep.has(stepId)) {
                    executedToolsPerStep.set(stepId, new Set());
                }

                const stepTools = executedToolsPerStep.get(stepId)!;
                if (stepTools.has(toolName)) {
                    log.info(` Skipping duplicate tool call: ${toolName} for step ${stepId}`);

                    // Add a tool message indicating the skip
                    messages.push(new ToolMessage({
                        content: JSON.stringify({
                            success: true,
                            skipped: true,
                            message: `Skipped duplicate ${toolName} call - already executed for this step`,
                        }),
                        tool_call_id: toolCall.id || toolName,
                    }));
                    continue;
                }

                onProgress?.({
                    stage: "tool_call",
                    tool: toolName,
                    message: `Executing ${toolName}...`,
                    isComplete: false,
                });

                // Check for cached results (Requirements 10.2, 10.5)
                const currentState = sessionId ? productionStore.get(sessionId) ?? null : null;
                const cacheCheck = checkResultCache(toolName, toolArgs, currentState);

                if (cacheCheck.cached) {
                    log.info(` Using cached results for ${toolName}`);

                    const result = JSON.stringify(cacheCheck.result);

                    // Emit tool result for cached response
                    onProgress?.({
                        stage: "tool_result",
                        tool: toolName,
                        message: `✓ ${cacheCheck.result!.message}`,
                        isComplete: false,
                        success: true,
                    });

                    // Add tool result to messages
                    messages.push(new ToolMessage({
                        content: result,
                        tool_call_id: toolCall.id || toolName,
                    }));

                    continue;
                }

                // Find and execute the tool
                const targetTool = toolMap[toolName];
                if (!targetTool) {
                    log.error(` Tool not found: ${toolName}`);
                    continue;
                }

                // Get recovery strategy for this tool
                const strategy = getRecoveryStrategy(toolName);

                // Get context for potential fallbacks
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

                // Execute with retry logic (Requirement 6.5)
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
                    // Tool execution succeeded (no exception thrown)
                    result = executionResult.data as string;

                    // Check for logical success in the JSON response
                    let logicalSuccess = true;
                    try {
                        const parsed = JSON.parse(result);
                        if (parsed.success === false) {
                            logicalSuccess = false;
                        }
                    } catch {
                        // Not JSON or parse error - assume success if execution didn't throw
                    }

                    if (logicalSuccess) {
                        errorTracker.recordSuccess();
                        executedTools.add(toolName);

                        // Mark tool as executed for this step (Requirement 10.1)
                        // ONLY if it was logically successful. If it returned success: false,
                        // we want to allow the agent to retry it in the next iteration.
                        const currentStepId = createStepIdentifier(toolName, toolArgs);
                        const currentStepTools = executedToolsPerStep.get(currentStepId) || new Set();
                        currentStepTools.add(toolName);
                        executedToolsPerStep.set(currentStepId, currentStepTools);
                    } else {
                        // Logically failed (e.g. API error handled by tool)
                        // Don't mark as executed so it can be retried
                        log.warn(` Tool ${toolName} returned logical failure, allowing retry.`);

                        // Record the error in the state so it's reported
                        try {
                            const parsed = JSON.parse(result);
                            if (parsed.error && sessionId) {
                                const toolError: ToolError = {
                                    tool: toolName,
                                    error: parsed.error,
                                    category: 'recoverable', // Assume recoverable since tool handled it
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
                        } catch { /* Ignore error storage failures */ }
                    }
                } else {
                    // Tool failed with exception - try fallback (Requirements 6.1, 6.2, 6.3)
                    const toolError = executionResult.error!;
                    log.error(` Tool ${toolName} failed after ${executionResult.retryCount} retries:`, toolError.error);

                    // Try to apply fallback if available
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
                            // SPECIAL HANDLING: If fallback provided data that should be in store
                            // This ensures state consistency when tools fail but provide a fallback result
                            if (toolName === 'generate_visuals' && sessionId) {
                                // Populate store with placeholders if generate_visuals failed
                                const state = productionStore.get(sessionId);
                                if (state && state.contentPlan) {
                                    log.info(` Applying fallback visuals to state for ${sessionId}`);

                                    // Create placeholders for all scenes that don't have visuals
                                    const currentVisuals = state.visuals ? [...state.visuals] : [];
                                    const placeholders: GeneratedImage[] = [];

                                    for (let i = 0; i < state.contentPlan.scenes.length; i++) {
                                        const scene = state.contentPlan.scenes[i];
                                        if (!scene) {
                                            log.warn(` Scene at index ${i} not found, skipping placeholder.`);
                                            continue;
                                        }
                                        // Use existing visual if available, otherwise create placeholder
                                        if (currentVisuals[i]?.imageUrl) {
                                            placeholders.push(currentVisuals[i]!);
                                        } else {
                                            placeholders.push({
                                                promptId: scene.id,
                                                imageUrl: "", // Empty string indicates placeholder/missing
                                                isPlaceholder: true
                                            });
                                        }
                                    }

                                    state.visuals = placeholders;
                                    productionStore.set(sessionId, state);
                                }
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
                            // Fallback also failed
                            result = JSON.stringify({
                                success: false,
                                error: toolError.error,
                                retryCount: executionResult.retryCount,
                            });
                            errorTracker.recordError(toolError, false);
                        }
                    } else {
                        // No fallback available
                        result = JSON.stringify({
                            success: false,
                            error: toolError.error,
                            retryCount: executionResult.retryCount,
                            continueOnFailure: strategy.continueOnFailure,
                        });
                        errorTracker.recordError(toolError, false);
                    }

                    // Store error in session state (Requirement 6.4)
                    if (sessionId) {
                        const state = productionStore.get(sessionId);
                        if (state) {
                            state.errors.push(toolError);
                            productionStore.set(sessionId, state);
                        }
                    }
                }

                // Parse result for session ID and message
                try {
                    const parsed = JSON.parse(result);
                    if (!sessionId && (toolName === 'plan_video' || toolName === 'create_storyboard')) {
                        if (parsed.sessionId) {
                            sessionId = parsed.sessionId;
                        }
                    }
                    if (parsed.message) {
                        const statusPrefix = fallbackApplied ? '⚠️ ' : '';
                        // Emit tool result with success status (Requirement 8.3)
                        onProgress?.({
                            stage: "tool_result",
                            tool: toolName,
                            message: statusPrefix + parsed.message,
                            isComplete: false,
                            success: parsed.success !== false, // Default to true if not specified
                        });
                    }
                } catch {
                    // Not JSON, that's fine
                }

                // Add tool result to messages
                messages.push(new ToolMessage({
                    content: result,
                    tool_call_id: toolCall.id || toolName,
                }));
            }
        }

        // Check if iteration limit was reached (Requirement 10.4)
        if (iteration >= MAX_ITERATIONS) {
            log.warn(` Iteration limit reached (${MAX_ITERATIONS}). Stopping execution.`);

            onProgress?.({
                stage: "limit_reached",
                message: `Production stopped: iteration limit (${MAX_ITERATIONS}) reached. Partial results may be available.`,
                isComplete: false,
            });

            // Generate partial success report for limit reached case
            const report = errorTracker.generateReport();
            report.summary += ` Production stopped due to iteration limit (${MAX_ITERATIONS}).`;

            if (sessionId) {
                const state = productionStore.get(sessionId);
                if (state) {
                    state.partialSuccessReport = report;
                    productionStore.set(sessionId, state);
                }
            }
        }

        // Generate partial success report (Requirement 6.4)
        const report = errorTracker.generateReport();

        if (sessionId) {
            const state = productionStore.get(sessionId);
            if (state) {
                state.partialSuccessReport = report;
                productionStore.set(sessionId, state);
            }

            // Log summary if there were errors
            if (report.errors.length > 0) {
                log.info(` Partial success report:`, report.summary);
                onProgress?.({
                    stage: "summary",
                    message: report.summary,
                    isComplete: false,
                });
            }

            return productionStore.get(sessionId) || null;
        }

        return null;
    } catch (error) {
        log.error(" Error:", error);

        // Record fatal error
        const toolError: ToolError = {
            tool: 'production_agent',
            error: error instanceof Error ? error.message : String(error),
            category: classifyError(error instanceof Error ? error : new Error(String(error))),
            timestamp: Date.now(),
            retryCount: 0,
            recoverable: false,
        };
        errorTracker.recordError(toolError, false);

        // Store error in session if available
        if (sessionId) {
            const state = productionStore.get(sessionId);
            if (state) {
                state.errors.push(toolError);
                state.partialSuccessReport = errorTracker.generateReport();
                productionStore.set(sessionId, state);
            }
        }

        onProgress?.({
            stage: "error",
            message: error instanceof Error ? error.message : String(error),
            isComplete: true,
        });
        throw error;
    } finally {
        // Clear global progress callback to prevent memory leaks
        setGlobalProgressCallback(null);
    }
}

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
 * Benefits over monolithic agent:
 * - Smaller context per subagent (2-6 tools vs 20+)
 * - Faster inference (isolated contexts)
 * - Specialized prompts per stage
 * - Better error isolation and recovery
 * - Easier to test and debug
 *
 * @param userRequest User's natural language request
 * @param onProgress Optional callback for progress updates
 * @returns Production state or null if failed
 */
export async function runProductionAgentWithSubagents(
    userRequest: string,
    onProgress?: (progress: ProductionProgress) => void
): Promise<ProductionState | null> {
    // Use centralized API key from apiClient
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    // Set global progress callback for tools to use
    setGlobalProgressCallback(onProgress || null);

    onProgress?.({
        stage: "starting",
        message: "Starting multi-agent video production...",
        isComplete: false
    });

    try {
        // Run supervisor agent with subagents
        const supervisorOptions: SupervisorOptions = {
            apiKey: GEMINI_API_KEY,
            userRequest,
            onProgress: (progress) => {
                // Convert supervisor progress to production progress format
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

        // Get final state from production store
        const finalState = result.sessionId ? productionStore.get(result.sessionId) : null;

        if (finalState) {
            // Generate completion summary
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
        // Clear global progress callback to prevent memory leaks
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
