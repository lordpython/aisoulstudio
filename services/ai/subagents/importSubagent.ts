/**
 * Import Subagent - YouTube/Audio Import and Transcription
 *
 * This subagent handles the first optional stage of the production pipeline:
 * extracting and transcribing content from external sources (YouTube videos or audio files).
 *
 * Responsibilities:
 * - Import audio from YouTube/X videos
 * - Transcribe uploaded audio files
 * - Return structured transcript for content planning
 *
 * Tools:
 * - import_youtube_content
 * - transcribe_audio_file
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { MODELS } from "../../shared/apiClient";
import {
  Subagent,
  SubagentName,
  SubagentContext,
  SubagentResult,
} from "./index";
import { importTools } from "../../agent/importTools";

/**
 * Import Subagent System Prompt
 *
 * Follows AI prompting best practices:
 * - Context-first: Explains role and dependencies
 * - Example-driven: Shows concrete input/output examples
 * - Constraint-explicit: Clear rules and requirements
 */
const IMPORT_SUBAGENT_PROMPT = `You are the Import Subagent. Your specialized role is to extract and transcribe content from external sources.

CONTEXT:
You are the first stage in a video production pipeline. Your output (transcript)
will be used by the Content Subagent to plan scenes and narration.

YOUR TOOLS:
1. import_youtube_content - Extract audio from YouTube/X videos
   - Input: URL (youtube.com, youtu.be, twitter.com, x.com)
   - Output: Audio file + metadata + transcript
   - Best for: Existing video content

2. transcribe_audio_file - Transcribe uploaded audio files
   - Input: File path (.mp3, .wav, .m4a, .ogg)
   - Output: Transcript with word-level timing
   - Best for: Custom audio recordings

WORKFLOW:
1. Identify source type (YouTube URL vs audio file)
2. Call appropriate tool
3. Verify transcript quality
4. Report success with transcript preview

CONSTRAINTS:
- Must return valid transcript (non-empty)
- YouTube videos must be accessible (not private/deleted)
- Audio files must be in supported format

QUALITY STANDARDS:
- Transcript should capture all spoken words
- Word-level timing required for lip sync
- Report any audio quality issues

When done, report: "Import complete. Transcript: [first 100 chars]..."
`;

/**
 * Create Import Subagent
 */
export function createImportSubagent(apiKey: string): Subagent {
  return {
    name: SubagentName.IMPORT,
    description: "Handles YouTube/audio import and transcription",
    tools: importTools,
    systemPrompt: IMPORT_SUBAGENT_PROMPT,
    maxIterations: 10,

    async invoke(context: SubagentContext): Promise<SubagentResult> {
      const startTime = Date.now();

      console.log(`[ImportSubagent] Starting import: ${context.instruction}`);
      context.onProgress?.({
        stage: "import_starting",
        message: "Starting import subagent...",
        isComplete: false,
      });

      // Initialize model with tools
      const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const modelWithTools = model.bindTools(importTools);

      // Initialize messages
      const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
        new SystemMessage(IMPORT_SUBAGENT_PROMPT),
        new HumanMessage(context.instruction),
      ];

      let iteration = 0;
      const MAX_ITERATIONS = this.maxIterations;

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        context.onProgress?.({
          stage: "import_processing",
          message: `Processing import (iteration ${iteration}/${MAX_ITERATIONS})...`,
          isComplete: false,
        });

        // Get response from model
        const response = await modelWithTools.invoke(messages);
        messages.push(response);

        // Check if model wants to use tools
        if (!response.tool_calls || response.tool_calls.length === 0) {
          // No tool calls - check if import is complete
          const content = response.content as string;

          if (content.includes("Import complete") || content.includes("Transcript:")) {
            const duration = Date.now() - startTime;

            context.onProgress?.({
              stage: "import_complete",
              message: "Import completed successfully",
              isComplete: false,
              success: true,
            });

            return {
              success: true,
              sessionId: context.sessionId || "unknown",
              completedStage: SubagentName.IMPORT,
              duration,
              message: content,
            };
          }

          // Model finished without completing import
          throw new Error("Import subagent finished without completing import task");
        }

        // Execute tool calls
        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.name;

          context.onProgress?.({
            stage: "import_tool_call",
            tool: toolName,
            message: `Executing ${toolName}...`,
            isComplete: false,
          });

          const tool = importTools.find(t => t.name === toolName);
          if (!tool) {
            throw new Error(`Tool ${toolName} not found`);
          }

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (tool as any).invoke(toolCall.args);

            // Add tool result to messages
            messages.push(
              new ToolMessage({
                content: typeof result === "string" ? result : JSON.stringify(result),
                tool_call_id: toolCall.id || "",
              })
            );

            context.onProgress?.({
              stage: "import_tool_result",
              tool: toolName,
              message: `✓ ${toolName} completed`,
              isComplete: false,
              success: true,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            context.onProgress?.({
              stage: "import_tool_error",
              tool: toolName,
              message: `✗ ${toolName} failed: ${errorMessage}`,
              isComplete: false,
              success: false,
            });

            // Add error message to context
            messages.push(
              new ToolMessage({
                content: JSON.stringify({ error: errorMessage }),
                tool_call_id: toolCall.id || "",
              })
            );
          }
        }
      }

      // Iteration limit reached
      throw new Error(`Import subagent exceeded maximum iterations (${MAX_ITERATIONS})`);
    },
  };
}
