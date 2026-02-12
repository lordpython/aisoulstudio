/**
 * Agent Executor
 *
 * Main production agent execution loop with tool execution,
 * caching, progress reporting, and error recovery.
 * Extracted from agentCore.ts for focused responsibility.
 *
 * Requirements:
 * - 5.1-5.5: Intent-based tool selection
 * - 6.1-6.5: Error recovery and fallback
 * - 8.1-8.5: Progress reporting
 * - 10.1-10.5: Optimization (caching, duplicate prevention)
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { GEMINI_API_KEY } from "../../shared/apiClient";
import { agentLogger } from "../../logger";

import { ProductionState, ProductionProgress } from "./types";
import { productionStore } from "./store";
import { createStepIdentifier, isValidSessionId } from "./utils";
import { PRODUCTION_AGENT_PROMPT } from "./prompts";
import { productionTools, toolMap } from "./toolRegistration";
import { setGlobalProgressCallback } from "./tools/contentTools";
import { checkResultCache } from "./resultCache";
import { executeToolWithRecovery } from "./errorHandler";

import {
    analyzeIntent,
    generateIntentHint,
} from "../../agent/intentDetection";

import {
    type ToolError,
    ErrorTracker,
    classifyError,
} from "../../agent/errorRecovery";

const log = agentLogger.child('AgentExecutor');

/**
 * Run the production agent with intent-based tool selection.
 *
 * @param userRequest User's natural language request
 * @param onProgress Optional callback for progress updates
 * @returns Production state or null if failed
 */
export async function runProductionAgent(
    userRequest: string,
    onProgress?: (progress: ProductionProgress) => void
): Promise<ProductionState | null> {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    // Analyze user intent for tool selection
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
        // Relax safety filters to allow creative content (horror, thriller, etc.)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ] as any,
    });

    const modelWithTools = model.bindTools(productionTools);

    const enhancedUserMessage = intentHint
        ? `${intentHint}\n\nUser Request: ${userRequest}`
        : userRequest;

    const messages: Array<SystemMessage | HumanMessage | AIMessage | ToolMessage> = [
        new SystemMessage(PRODUCTION_AGENT_PROMPT),
        new HumanMessage(enhancedUserMessage),
    ];

    setGlobalProgressCallback(onProgress || null);

    onProgress?.({
        stage: "starting",
        message: "Starting video production agent...",
        isComplete: false
    });

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
    const MAX_ITERATIONS = 20;
    let iteration = 0;

    const errorTracker = new ErrorTracker();
    const executedTools = new Set<string>();
    const executedToolsPerStep = new Map<string, Set<string>>();

    try {
        while (iteration < MAX_ITERATIONS) {
            iteration++;

            if (iteration >= MAX_ITERATIONS - 2) {
                onProgress?.({
                    stage: "warning",
                    message: `Approaching iteration limit (${iteration}/${MAX_ITERATIONS}). Production will stop soon if not completed.`,
                    isComplete: false,
                });
            }

            let response;
            try {
                response = await modelWithTools.invoke(messages as Parameters<typeof modelWithTools.invoke>[0]);
            } catch (invokeError: unknown) {
                // LangChain crashes with "chatGeneration is undefined" when Gemini
                // safety filters block the response (zero candidates returned).
                const msg = invokeError instanceof Error ? invokeError.message : String(invokeError);
                if (msg.includes("chatGeneration is undefined") || msg.includes("can't access property")) {
                    log.error(" Model response blocked (likely safety filter). Retrying with simplified prompt.");
                    onProgress?.({
                        stage: "warning",
                        message: "Response blocked by safety filters. Retrying...",
                        isComplete: false,
                    });
                    // Remove the last user/tool message and add a nudge to continue
                    messages.push(new HumanMessage("Please continue with the production. Use appropriate creative language."));
                    continue;
                }
                throw invokeError;
            }
            messages.push(response as unknown as AIMessage);

            const toolCalls = response.tool_calls;
            if (!toolCalls || toolCalls.length === 0) {
                // No more tool calls — agent is done
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
                        onProgress?.({ stage: "complete", message: "Production complete!", isComplete: true });
                    }
                } else {
                    onProgress?.({ stage: "complete", message: "Production complete!", isComplete: true });
                }
                break;
            }

            for (const toolCall of toolCalls) {
                const toolName = toolCall.name;
                const toolArgs = toolCall.args as Record<string, unknown>;

                const stepId = createStepIdentifier(toolName, toolArgs);

                if (!executedToolsPerStep.has(stepId)) {
                    executedToolsPerStep.set(stepId, new Set());
                }

                const stepTools = executedToolsPerStep.get(stepId)!;
                if (stepTools.has(toolName)) {
                    log.info(` Skipping duplicate tool call: ${toolName} for step ${stepId}`);
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

                // Check cache
                const currentState = sessionId ? productionStore.get(sessionId) ?? null : null;
                const cacheCheck = checkResultCache(toolName, toolArgs, currentState);

                if (cacheCheck.cached) {
                    log.info(` Using cached results for ${toolName}`);
                    const result = JSON.stringify(cacheCheck.result);

                    onProgress?.({
                        stage: "tool_result",
                        tool: toolName,
                        message: `\u2713 ${cacheCheck.result!.message}`,
                        isComplete: false,
                        success: true,
                    });

                    messages.push(new ToolMessage({
                        content: result,
                        tool_call_id: toolCall.id || toolName,
                    }));
                    continue;
                }

                // Find and execute tool
                const targetTool = toolMap[toolName];
                if (!targetTool) {
                    log.error(` Tool not found: ${toolName}`);
                    continue;
                }

                const { result, fallbackApplied } = await executeToolWithRecovery(
                    toolName,
                    toolArgs,
                    targetTool,
                    sessionId,
                    errorTracker,
                    executedTools,
                    onProgress
                );

                // Mark successful logical executions to prevent duplicates
                if (!fallbackApplied) {
                    try {
                        const parsed = JSON.parse(result);
                        if (parsed.success !== false) {
                            const currentStepId = createStepIdentifier(toolName, toolArgs);
                            const currentStepTools = executedToolsPerStep.get(currentStepId) || new Set();
                            currentStepTools.add(toolName);
                            executedToolsPerStep.set(currentStepId, currentStepTools);
                        }
                    } catch { /* Not JSON */ }
                }

                // Parse result for session ID and emit progress
                try {
                    const parsed = JSON.parse(result);
                    if (!sessionId && (toolName === 'plan_video' || toolName === 'create_storyboard' || toolName === 'generate_breakdown')) {
                        if (parsed.sessionId && isValidSessionId(parsed.sessionId)) {
                            sessionId = parsed.sessionId;
                            // Emit sessionId to the progress callback so UI can capture it
                            onProgress?.({
                                stage: "session_created",
                                message: `Session created: ${sessionId}`,
                                isComplete: false,
                                sessionId: sessionId ?? undefined,
                            });
                        } else if (parsed.sessionId) {
                            log.warn(`Invalid sessionId format from ${toolName}: ${parsed.sessionId}`);
                        }
                    }
                    if (parsed.message) {
                        const statusPrefix = fallbackApplied ? '\u26a0\ufe0f ' : '';
                        onProgress?.({
                            stage: "tool_result",
                            tool: toolName,
                            message: statusPrefix + parsed.message,
                            isComplete: false,
                            success: parsed.success !== false,
                        });
                    }
                } catch { /* Not JSON */ }

                messages.push(new ToolMessage({
                    content: result,
                    tool_call_id: toolCall.id || toolName,
                }));
            }
        }

        // Check iteration limit
        if (iteration >= MAX_ITERATIONS) {
            log.warn(` Iteration limit reached (${MAX_ITERATIONS}). Stopping execution.`);
            onProgress?.({
                stage: "limit_reached",
                message: `Production stopped: iteration limit (${MAX_ITERATIONS}) reached. Partial results may be available.`,
                isComplete: false,
            });

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

        // Generate partial success report
        const report = errorTracker.generateReport();

        if (sessionId) {
            const state = productionStore.get(sessionId);
            if (state) {
                state.partialSuccessReport = report;
                productionStore.set(sessionId, state);
            }

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

        const toolError: ToolError = {
            tool: 'production_agent',
            error: error instanceof Error ? error.message : String(error),
            category: classifyError(error instanceof Error ? error : new Error(String(error))),
            timestamp: Date.now(),
            retryCount: 0,
            recoverable: false,
        };
        errorTracker.recordError(toolError, false);

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
        setGlobalProgressCallback(null);
    }
}
