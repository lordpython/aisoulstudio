/**
 * Enhancement/Export Subagent - Post-Processing and Final Export
 *
 * This subagent handles the final stage of the production pipeline.
 * It emphasizes the critical auto-fetch parameter rules for export tools.
 *
 * Responsibilities:
 * - Optionally enhance visuals (background removal, style transfer)
 * - Mix all audio tracks (narration + music + SFX)
 * - Generate subtitles for accessibility
 * - Export final video
 * - Optionally upload to cloud storage (Node.js only)
 *
 * Tools:
 * - remove_background (optional)
 * - restyle_image (optional)
 * - mix_audio_tracks (required)
 * - generate_subtitles (optional)
 * - export_final_video (required)
 * - upload_production_to_cloud (optional, Node.js only)
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { MODELS } from "../../shared/apiClient";
import {
  Subagent,
  SubagentName,
  SubagentContext,
  SubagentResult,
} from "./index";
import { productionTools } from "../productionAgent";

// Environment detection - cloud upload only available in Node.js
const isNode = typeof window === 'undefined';

/**
 * Base Enhancement/Export Subagent System Prompt
 * Contains tools 1-5 (no cloud upload) and common sections
 */
const BASE_ENHANCEMENT_EXPORT_PROMPT = `You are the Enhancement/Export Subagent. Your role is to finalize and export the production.

## CRITICAL: SESSION ID USAGE
You will receive a sessionId in your instructions. You MUST use this EXACT sessionId as the contentPlanId parameter for ALL tool calls.

NEVER use placeholder values like "plan_123", "cp_01", "session_123", "current_production", or "content_plan_YYYYMMDD_HHMMSS".
ALWAYS use the ACTUAL sessionId provided in your instructions (format: prod_TIMESTAMP_HASH, e.g., prod_1768266562924_r3zdsyfgc).

CONTEXT:
You receive all assets from prior subagents (visuals, narration, music, SFX). Your output
is the final exported video file.

## YOUR TOOLS:

### Enhancement Tools (OPTIONAL):

1. remove_background - Remove image backgrounds
   - Use when: User wants transparent backgrounds or compositing
   - Input: contentPlanId (USE THE SESSIONID), sceneIndex
   - Fallback: Keep original if fails

2. restyle_image - Apply artistic style transfer
   - Use when: User wants specific art style (Anime, Watercolor, etc.)
   - Input: contentPlanId (USE THE SESSIONID), sceneIndex, style
   - Available styles: Anime, Watercolor, Oil Painting, Sketch, Pop Art, Cyberpunk, etc.
   - Fallback: Keep original if fails

### Export Tools (REQUIRED):

3. mix_audio_tracks - Combine audio sources
   - CRITICAL: Only provide contentPlanId (USE THE SESSIONID)
   - DO NOT provide narrationUrl (auto-fetched from narration segments)
   - DO NOT provide musicUrl (auto-fetched from session state)
   - IMPORTANT: Use dynamic mixing (duckingEnabled: true) - this automatically:
     * Lowers music volume when narration is present (auto-ducking)
     * Adjusts levels based on scene mood and content
     * Provides professional broadcast-quality audio mixing
   - DO NOT use static volume values like "0.3" or "0.2" for all scenes
   - Let the audioMixerService handle intelligent volume balancing

4. generate_subtitles - Create SRT/VTT subtitles
   - CRITICAL: Only provide contentPlanId (USE THE SESSIONID)
   - DO NOT provide narrationSegments (auto-fetched)
   - Supports RTL languages (Arabic, Hebrew)

5. export_final_video - Render final video
   - CRITICAL: Only provide contentPlanId (USE THE SESSIONID)
   - DO NOT provide visuals, narrationUrl, totalDuration (all auto-fetched)
   - Optional: format (mp4/webm), aspectRatio (16:9/9:16/1:1), quality (high/medium/low)
`;

/**
 * Cloud upload tool documentation (Node.js only)
 */
const CLOUD_UPLOAD_TOOL_DOCS = `
6. upload_production_to_cloud - Upload to GCS (OPTIONAL)
   - CRITICAL: Only provide contentPlanId (USE THE SESSIONID)
   - Creates date/time folder (YYYY-MM-DD_HH-mm-ss)
   - Uploads video, audio, visuals, subtitles, logs, metadata
   - Optional: makePublic (default: false)
`;

/**
 * Browser-specific note about cloud upload unavailability
 */
const BROWSER_CLOUD_NOTE = `
## IMPORTANT: BROWSER ENVIRONMENT
Cloud upload (upload_production_to_cloud) is NOT available in browser environment.
After export_final_video completes successfully, your work is DONE.
Do NOT attempt to call upload_production_to_cloud - it does not exist here.
`;

/**
 * Auto-fetch rules section (common)
 */
const AUTO_FETCH_RULES = `
## CRITICAL: AUTO-FETCH PARAMETER RULES

The following parameters are AUTOMATICALLY FETCHED from session state. DO NOT provide them:

| Tool | Auto-Fetched | Why |
|------|-------------|-----|
| mix_audio_tracks | narrationUrl | Concatenated from narration segments |
| export_final_video | visuals, narrationUrl, totalDuration | All in session state |
| generate_subtitles | narrationSegments | Already in session state |
`;

/**
 * Node.js auto-fetch rules (includes cloud upload)
 */
const NODE_AUTO_FETCH_RULES = AUTO_FETCH_RULES + `| upload_production_to_cloud | ALL assets | Everything auto-fetched |
`;

/**
 * Browser workflow section (no cloud upload)
 */
const BROWSER_WORKFLOW_SECTION = `
## WORKFLOW (Browser Environment):

### Standard Workflow:
1. Call mix_audio_tracks({ contentPlanId: "YOUR_SESSIONID" })
2. Call generate_subtitles({ contentPlanId: "YOUR_SESSIONID" })
3. Call export_final_video({ contentPlanId: "YOUR_SESSIONID" })
4. DONE - Report completion immediately

### Enhanced Workflow (With Post-Processing):
1. If user wants background removal: Call remove_background for each scene
2. If user wants style transfer: Call restyle_image for each scene
3. Call mix_audio_tracks
4. Call generate_subtitles
5. Call export_final_video
6. DONE - Report completion immediately

## EXAMPLES:

**Example 1**: Basic export with subtitles (sessionId="prod_1768266562924_r3zdsyfgc")
\`\`\`
1. mix_audio_tracks({ contentPlanId: "prod_1768266562924_r3zdsyfgc" })
2. generate_subtitles({ contentPlanId: "prod_1768266562924_r3zdsyfgc" })
3. export_final_video({ contentPlanId: "prod_1768266562924_r3zdsyfgc", format: "mp4" })
4. Report: "Export complete. Format: mp4. Size: X MB. Duration: Y s. Video available locally."
\`\`\`

**Example 2**: Export with custom aspect ratio (sessionId="prod_1768266562924_r3zdsyfgc")
\`\`\`
1. mix_audio_tracks({ contentPlanId: "prod_1768266562924_r3zdsyfgc" })
2. export_final_video({ contentPlanId: "prod_1768266562924_r3zdsyfgc", format: "mp4", aspectRatio: "9:16" })
3. Report: "Export complete. Format: mp4. Size: X MB. Duration: Y s. Video available locally."
\`\`\`
`;

/**
 * Node.js workflow section (includes cloud upload)
 */
const NODE_WORKFLOW_SECTION = `
## WORKFLOW:

### Standard Workflow (No Enhancements):
1. Call mix_audio_tracks({ contentPlanId: "YOUR_SESSIONID" })
2. Call generate_subtitles({ contentPlanId: "YOUR_SESSIONID" })
3. Call export_final_video({ contentPlanId: "YOUR_SESSIONID" })
4. Optionally: upload_production_to_cloud({ contentPlanId: "YOUR_SESSIONID" })

### Enhanced Workflow (With Post-Processing):
1. If user wants background removal: Call remove_background for each scene
2. If user wants style transfer: Call restyle_image for each scene
3. Call mix_audio_tracks
4. Call generate_subtitles
5. Call export_final_video
6. Optionally: upload_production_to_cloud

## EXAMPLES:

**Example 1**: Basic export with subtitles (sessionId="prod_1768266562924_r3zdsyfgc")
\`\`\`
1. mix_audio_tracks({ contentPlanId: "prod_1768266562924_r3zdsyfgc" })
2. generate_subtitles({ contentPlanId: "prod_1768266562924_r3zdsyfgc" })
3. export_final_video({ contentPlanId: "prod_1768266562924_r3zdsyfgc", format: "mp4" })
\`\`\`

**Example 2**: Export with custom aspect ratio and cloud upload (sessionId="prod_1768266562924_r3zdsyfgc")
\`\`\`
1. mix_audio_tracks({ contentPlanId: "prod_1768266562924_r3zdsyfgc" })
2. export_final_video({ contentPlanId: "prod_1768266562924_r3zdsyfgc", format: "mp4", aspectRatio: "9:16" })
3. upload_production_to_cloud({ contentPlanId: "prod_1768266562924_r3zdsyfgc" })
\`\`\`
`;

/**
 * Quality checks and error recovery section (common)
 */
const QUALITY_AND_ERROR_SECTION = `
## QUALITY CHECKS:

Before export:
- ✓ All scenes have visuals (check session state)
- ✓ Narration audio exists and matches scene count
- ✓ If using music: Music URL is valid
- ✓ Total duration matches ContentPlan.totalDuration

After export:
- ✓ Video file size reasonable (not 0 bytes)
- ✓ Duration matches expected length
- ✓ Format is correct (mp4/webm)

## ERROR RECOVERY:

If export_final_video fails:
- Check that all prior stages completed successfully
- Verify assets exist in session state
- Try with lower quality setting
- If still fails: Return asset bundle for manual assembly
`;

/**
 * Browser completion instruction
 */
const BROWSER_COMPLETION = `
## COMPLETION:
When export_final_video succeeds, immediately report:
"Export complete. Format: [format]. Size: [size] MB. Duration: [duration] s. Video available locally (cloud upload not available in browser)."

Do NOT attempt any cloud upload operations after this.
`;

/**
 * Node.js completion instruction
 */
const NODE_COMPLETION = `
## COMPLETION:
When done, report: "Export complete. Format: X. Size: Y MB. Duration: Z s."
If cloud upload was performed, include the GCS path in your report.
`;


/**
 * Generate environment-specific system prompt
 */
function getSystemPrompt(): string {
  if (isNode) {
    return BASE_ENHANCEMENT_EXPORT_PROMPT +
      CLOUD_UPLOAD_TOOL_DOCS +
      NODE_AUTO_FETCH_RULES +
      NODE_WORKFLOW_SECTION +
      QUALITY_AND_ERROR_SECTION +
      NODE_COMPLETION;
  } else {
    return BASE_ENHANCEMENT_EXPORT_PROMPT +
      BROWSER_CLOUD_NOTE +
      AUTO_FETCH_RULES +
      BROWSER_WORKFLOW_SECTION +
      QUALITY_AND_ERROR_SECTION +
      BROWSER_COMPLETION;
  }
}

/**
 * Get enhancement/export tools - filters to only include tools that exist in productionTools
 */
function getEnhancementExportTools(): StructuredTool[] {
  const desiredTools = [
    "remove_background",
    "restyle_image",
    "mix_audio_tracks",
    "generate_subtitles",
    "export_final_video",
    "upload_production_to_cloud", // Will be filtered out if not in productionTools (browser)
  ];

  const availableTools = productionTools.filter((tool: StructuredTool) =>
    desiredTools.includes(tool.name)
  );

  console.log(`[EnhancementExportSubagent] Environment: ${isNode ? 'Node.js' : 'Browser'}`);
  console.log(`[EnhancementExportSubagent] Available tools: ${availableTools.map(t => t.name).join(', ')}`);

  return availableTools;
}

/**
 * Create Enhancement/Export Subagent
 */
export function createEnhancementExportSubagent(apiKey: string): Subagent {
  const enhancementExportTools = getEnhancementExportTools();
  const systemPrompt = getSystemPrompt();

  return {
    name: SubagentName.ENHANCEMENT_EXPORT,
    description: isNode
      ? "Post-processes visuals, mixes audio, exports video, uploads to cloud"
      : "Post-processes visuals, mixes audio, exports video (cloud upload unavailable in browser)",
    tools: enhancementExportTools,
    systemPrompt: systemPrompt,
    maxIterations: 20, // Needs iterations for per-scene enhancement + export

    async invoke(context: SubagentContext): Promise<SubagentResult> {
      const startTime = Date.now();

      // CRITICAL: Validate that we have a sessionId
      if (!context.sessionId) {
        throw new Error("EnhancementExportSubagent requires a sessionId from prior stages. Cannot proceed without it.");
      }

      console.log(`[EnhancementExportSubagent] Starting enhancement/export with sessionId: ${context.sessionId}`);
      console.log(`[EnhancementExportSubagent] Environment: ${isNode ? 'Node.js' : 'Browser'}`);
      context.onProgress?.({
        stage: "export_starting",
        message: "Starting enhancement/export subagent...",
        isComplete: false,
      });

      // Track completed tools to prevent duplicate executions
      const completedTools = new Set<string>();

      // Initialize model with tools
      const model = new ChatGoogleGenerativeAI({
        model: MODELS.TEXT,
        apiKey,
        temperature: 0.2, // Low temperature for precise export
      });

      const modelWithTools = model.bindTools(enhancementExportTools);

      // CRITICAL: Inject sessionId into the instruction so the AI knows what to use
      // Also remind about cloud upload availability based on environment
      const cloudUploadReminder = isNode
        ? "upload_production_to_cloud is available if you want to upload to cloud."
        : "NOTE: Cloud upload is NOT available in browser. After export_final_video, you are DONE.";

      const enhancedInstruction = `IMPORTANT: Your sessionId is "${context.sessionId}". Use this EXACT value as contentPlanId for ALL tool calls.

${context.instruction}

REMINDER: contentPlanId = "${context.sessionId}" for all tools.
${cloudUploadReminder}`;

      // Initialize messages
      const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
        new SystemMessage(systemPrompt),
        new HumanMessage(enhancedInstruction),
      ];

      let iteration = 0;
      const MAX_ITERATIONS = this.maxIterations;

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        context.onProgress?.({
          stage: "export_processing",
          message: `Processing export (iteration ${iteration}/${MAX_ITERATIONS})...`,
          isComplete: false,
        });

        // Get response from model
        const response = await modelWithTools.invoke(messages);
        messages.push(response);

        // Check if model wants to use tools
        if (!response.tool_calls || response.tool_calls.length === 0) {
          // No tool calls - check if export is complete
          const content = response.content as string;

          // Accept multiple completion patterns
          const isComplete = content.includes("Export complete") &&
            (content.includes("Format:") || content.includes("available locally"));

          if (isComplete) {
            const duration = Date.now() - startTime;

            context.onProgress?.({
              stage: "export_complete",
              message: "Export completed successfully",
              isComplete: false,
              success: true,
            });

            return {
              success: true,
              sessionId: context.sessionId || "unknown",
              completedStage: SubagentName.ENHANCEMENT_EXPORT,
              duration,
              message: content,
            };
          }

          // Model finished without completing export
          console.warn("[EnhancementExportSubagent] Model finished without completion signal:", content);
          continue; // Give model another chance
        }

        // Execute tool calls
        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.name;

          // Check if tool was already completed (prevent duplicate expensive operations)
          if (completedTools.has(toolName)) {
            console.log(`[EnhancementExportSubagent] Tool ${toolName} already completed, returning cached result`);
            messages.push(
              new ToolMessage({
                content: JSON.stringify({
                  success: true,
                  cached: true,
                  message: `${toolName} was already executed successfully in this session. Skipping duplicate execution.`
                }),
                tool_call_id: toolCall.id || "",
              })
            );
            continue;
          }

          context.onProgress?.({
            stage: "export_tool_call",
            tool: toolName,
            message: `Executing ${toolName}...`,
            isComplete: false,
          });

          const tool = enhancementExportTools.find(t => t.name === toolName);

          // Graceful handling for missing tools (instead of throwing)
          if (!tool) {
            const isCloudUpload = toolName === 'upload_production_to_cloud';
            const errorMessage = isCloudUpload
              ? `Tool "${toolName}" is not available in browser environment. Cloud upload requires server-side execution. Your video export is complete and available locally.`
              : `Tool "${toolName}" is not available in the current environment.`;

            console.warn(`[EnhancementExportSubagent] ${errorMessage}`);

            context.onProgress?.({
              stage: "export_tool_error",
              tool: toolName,
              message: `⚠ ${toolName} unavailable: ${isCloudUpload ? 'browser environment' : 'not found'}`,
              isComplete: false,
              success: false,
            });

            messages.push(
              new ToolMessage({
                content: JSON.stringify({
                  success: false,
                  error: errorMessage,
                  suggestion: isCloudUpload
                    ? "The export workflow is complete. Report completion with the video details. Say: Export complete. Format: [format]. Size: [size] MB. Duration: [duration] s. Video available locally."
                    : "Check tool availability and try an alternative approach."
                }),
                tool_call_id: toolCall.id || "",
              })
            );
            continue; // Continue to next tool call, don't throw
          }

          try {
            const result = await tool.invoke(toolCall.args);

            // Track successful completion
            completedTools.add(toolName);

            // Add tool result to messages
            messages.push(
              new ToolMessage({
                content: typeof result === "string" ? result : JSON.stringify(result),
                tool_call_id: toolCall.id || "",
              })
            );

            context.onProgress?.({
              stage: "export_tool_result",
              tool: toolName,
              message: `✓ ${toolName} completed`,
              isComplete: false,
              success: true,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            context.onProgress?.({
              stage: "export_tool_error",
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
      throw new Error(`Enhancement/Export subagent exceeded maximum iterations (${MAX_ITERATIONS})`);
    },
  };
}
