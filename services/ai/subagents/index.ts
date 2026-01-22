/**
 * Subagent System - Base Types and Interfaces
 *
 * This module provides the foundational types and interfaces for the multi-agent
 * production system based on the supervisor + subagent pattern from LangChain.
 *
 * Architecture:
 * - Supervisor Agent: Orchestrates workflow and routes to specialized subagents
 * - Import Subagent: Handles YouTube/audio import and transcription
 * - Content Subagent: Creates content plan, generates narration, validates quality
 * - Media Subagent: Generates visuals, animation, music, and SFX
 * - Enhancement/Export Subagent: Post-processes, mixes audio, exports video
 */

import { StructuredTool } from "@langchain/core/tools";
import { ToolError } from "../../agent/errorRecovery";
import { ProductionProgress } from "../productionAgent";

/**
 * Subagent names enum
 */
export enum SubagentName {
  IMPORT = "import",
  CONTENT = "content",
  MEDIA = "media",
  ENHANCEMENT_EXPORT = "enhancement_export",
}

/**
 * Completed stage information
 */
export interface CompletedStage {
  /** Name of the subagent that completed */
  subagent: SubagentName;
  /** When the stage completed */
  completedAt: number;
  /** Duration in milliseconds */
  duration: number;
  /** Whether the stage succeeded */
  success: boolean;
}

/**
 * User preferences for production
 */
export interface UserPreferences {
  /** Visual style (cinematic, anime, watercolor, etc.) */
  style?: string;
  /** Whether user wants animation */
  animation?: boolean;
  /** Whether user wants background music */
  music?: boolean;
  /** Whether user wants sound effects */
  sfx?: boolean;
  /** Whether user wants subtitles */
  subtitles?: boolean;
  /** Aspect ratio (16:9, 9:16, 1:1) */
  aspectRatio?: string;
  /** Export format (mp4, webm) */
  format?: string;
  /** Whether to upload to cloud */
  uploadToCloud?: boolean;
  /** Make cloud files public */
  makePublic?: boolean;
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: ProductionProgress) => void;

/**
 * Context passed to each subagent invocation
 */
export interface SubagentContext {
  /** Session ID for state management */
  sessionId: string | null;
  /** Instruction/task for the subagent */
  instruction: string;
  /** Stages that have already completed */
  priorStages: CompletedStage[];
  /** User preferences for this production */
  userPreferences: UserPreferences;
  /** Optional progress callback */
  onProgress?: ProgressCallback;
}

/**
 * Result returned by a subagent
 */
export interface SubagentResult {
  /** Whether the subagent succeeded */
  success: boolean;
  /** Session ID (created if null was passed in) */
  sessionId: string;
  /** Stage that was completed */
  completedStage: SubagentName;
  /** Errors encountered (if any) */
  errors?: ToolError[];
  /** Duration in milliseconds */
  duration: number;
  /** Human-readable message */
  message: string;
  /** Whether a fallback was applied */
  fallbackApplied?: boolean;
}

/**
 * Subagent interface
 *
 * Each specialized subagent implements this interface.
 */
export interface Subagent {
  /** Unique name of the subagent */
  name: SubagentName;
  /** Description of the subagent's capabilities */
  description: string;
  /** Tools available to this subagent */
  tools: StructuredTool[];
  /** System prompt for this subagent */
  systemPrompt: string;
  /** Maximum iterations for the subagent loop */
  maxIterations: number;
  /** Invoke the subagent with a context */
  invoke: (context: SubagentContext) => Promise<SubagentResult>;
}

/**
 * Subagent factory function type
 */
export type SubagentFactory = (apiKey: string) => Subagent;

/**
 * Recovery strategy for handling subagent failures
 */
export interface RecoveryStrategy {
  /** Whether to continue production if this subagent fails */
  continueOnFailure: boolean;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  initialDelayMs: number;
  /** Fallback action to take if retries fail */
  fallbackAction?: string;
}

/**
 * Get recovery strategy for a subagent
 */
export function getRecoveryStrategy(subagent: SubagentName): RecoveryStrategy {
  switch (subagent) {
    case SubagentName.IMPORT:
      // Import is optional - can continue without it
      return {
        continueOnFailure: true,
        maxRetries: 2,
        initialDelayMs: 1000,
        fallbackAction: "Use topic-based workflow instead of import",
      };

    case SubagentName.CONTENT:
      // Content is critical - cannot continue without it
      return {
        continueOnFailure: false,
        maxRetries: 2,
        initialDelayMs: 1000,
        fallbackAction: undefined,
      };

    case SubagentName.MEDIA:
      // Media is critical but can use placeholders
      return {
        continueOnFailure: true,
        maxRetries: 2,
        initialDelayMs: 1000,
        fallbackAction: "Use placeholder visuals",
      };

    case SubagentName.ENHANCEMENT_EXPORT:
      // Export is critical but can return asset bundle
      return {
        continueOnFailure: true,
        maxRetries: 2,
        initialDelayMs: 1000,
        fallbackAction: "Return asset bundle for manual assembly",
      };

    default:
      return {
        continueOnFailure: false,
        maxRetries: 1,
        initialDelayMs: 1000,
      };
  }
}

/**
 * Execute a subagent with error handling and retry logic
 */
export async function executeSubagent(
  subagent: Subagent,
  context: SubagentContext
): Promise<SubagentResult> {
  const strategy = getRecoveryStrategy(subagent.name);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= strategy.maxRetries + 1; attempt++) {
    try {
      const result = await subagent.invoke(context);
      return result;
    } catch (error) {
      lastError = error as Error;
      console.error(`[Subagent:${subagent.name}] Attempt ${attempt} failed:`, error);

      if (attempt <= strategy.maxRetries) {
        const delay = strategy.initialDelayMs * Math.pow(2, attempt - 1);
        console.log(`[Subagent:${subagent.name}] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  if (strategy.continueOnFailure && strategy.fallbackAction) {
    console.warn(
      `[Subagent:${subagent.name}] All retries failed. Applying fallback: ${strategy.fallbackAction}`
    );

    return {
      success: false,
      sessionId: context.sessionId || "",
      completedStage: subagent.name,
      errors: [
        {
          tool: subagent.name,
          error: lastError?.message || "Unknown error",
          category: "transient" as const,
          timestamp: Date.now(),
          retryCount: strategy.maxRetries,
          recoverable: false,
          fallbackApplied: strategy.fallbackAction,
        },
      ],
      duration: 0,
      message: `Fallback applied: ${strategy.fallbackAction}`,
      fallbackApplied: true,
    };
  }

  // Critical failure - throw error
  throw lastError || new Error(`Subagent ${subagent.name} failed after ${strategy.maxRetries} retries`);
}

/**
 * Calculate overall progress percentage based on subagent stage
 */
export function calculateOverallPercentage(
  subagent: SubagentName,
  subagentPercentage: number
): number {
  // Weight each stage (total should be 100%)
  const stageWeights = {
    [SubagentName.IMPORT]: 10, // Optional, quick
    [SubagentName.CONTENT]: 30, // Critical, complex
    [SubagentName.MEDIA]: 40, // Critical, slow
    [SubagentName.ENHANCEMENT_EXPORT]: 20, // Critical, medium
  };

  const stageOffsets = {
    [SubagentName.IMPORT]: 0,
    [SubagentName.CONTENT]: 10,
    [SubagentName.MEDIA]: 40,
    [SubagentName.ENHANCEMENT_EXPORT]: 80,
  };

  const weight = stageWeights[subagent];
  const offset = stageOffsets[subagent];

  return offset + (subagentPercentage / 100) * weight;
}

// Export subagent factory functions
export { createImportSubagent } from "./importSubagent";
export { createContentSubagent } from "./contentSubagent";
export { createMediaSubagent } from "./mediaSubagent";
export { createEnhancementExportSubagent } from "./enhancementExportSubagent";
export { runSupervisorAgent, type SupervisorOptions, type SupervisorResult } from "./supervisorAgent";
