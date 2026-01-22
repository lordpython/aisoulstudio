/**
 * Media Subagent - Visual and Audio Asset Generation
 *
 * This subagent handles the media generation stage of the production pipeline.
 * It decides which optional features to include based on user intent.
 *
 * Responsibilities:
 * - Generate visual images for all scenes
 * - Optionally animate images to video
 * - Optionally generate background music
 * - Optionally create sound effects plan
 *
 * Tools:
 * - generate_visuals (required)
 * - animate_image (optional)
 * - generate_music (optional)
 * - plan_sfx (optional)
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import {
  Subagent,
  SubagentName,
  SubagentContext,
  SubagentResult,
} from "./index";
import { productionTools } from "../productionAgent";

/**
 * Media Subagent System Prompt
 *
 * Enhanced with:
 * - Constraint-explicit pattern: Clear decision tree for optional tools
 * - Example-driven pattern: Concrete examples of workflow decisions
 * - Validation-oriented pattern: Quality tips for consistency
 * - Session ID pattern: Explicit instructions to use provided sessionId
 */
const MEDIA_SUBAGENT_PROMPT = `You are the Media Subagent. Your role is to generate visual assets.

## CRITICAL: SESSION ID USAGE
You will receive a sessionId in your instructions. You MUST use this EXACT sessionId as the contentPlanId parameter for ALL tool calls.

NEVER use placeholder values like "plan_123", "cp_01", "session_123", "prod_video_plan", or "content_plan_YYYYMMDD_HHMMSS".
ALWAYS use the ACTUAL sessionId provided in your instructions (format: prod_TIMESTAMP_HASH, e.g., prod_1768266562924_r3zdsyfgc).

CONTEXT:
You receive a ContentPlan from the Content Subagent. Your output (images/videos + SFX)
will be combined by the Enhancement/Export Subagent into the final video.

NOTE: Background music generation is NOT available in video production mode.
Music generation is only available in the dedicated "Generate Music" mode.

## YOUR TOOLS:

1. generate_visuals (REQUIRED - Always call first)
   - Generates images for ALL scenes simultaneously
   - Input: contentPlanId (USE THE SESSIONID FROM YOUR INSTRUCTIONS)
   - Output: GeneratedImage[] (one per scene)
   - IMPORTANT: Only call ONCE (don't retry to "improve")

2. animate_image (OPTIONAL - Call if user wants motion)
   - Converts still images to video loops
   - Input: contentPlanId (USE THE SESSIONID), sceneIndex (0-based)
   - Must call for EACH scene individually
   - Example: For 5 scenes, call 5 times (index 0, 1, 2, 3, 4)

3. plan_sfx (OPTIONAL - Call if user wants sound effects)
   - Creates ambient sound plan
   - Input: contentPlanId (USE THE SESSIONID)
   - Output: SFX plan with mood-based sounds

## DECISION TREE:

### Step 1: Detect User Intent (from supervisor instructions)
- Animation keywords: "animated", "motion", "video", "moving", "dynamic"
- SFX keywords: "sound effects", "ambient sounds", "sfx"

### Step 2: Execute Required Tools
Always execute:
- generate_visuals (required for all videos)

### Step 3: Execute Optional Tools
If user wants animation:
- Call animate_image for each scene (0 to sceneCount-1)

If user wants SFX:
- Call plan_sfx

## EXAMPLES:

**Example 1**: "Create a cinematic video about space exploration" with sessionId="prod_1768266562924_r3zdsyfgc"
- Animation: Not mentioned → Skip animate_image
- SFX: Not mentioned → Skip plan_sfx
- Workflow: generate_visuals({ contentPlanId: "prod_1768266562924_r3zdsyfgc" })

**Example 2**: "Make an animated tutorial" with sessionId="prod_1768266562924_r3zdsyfgc"
- Animation: "Animated" mentioned → Call animate_image for all scenes
- SFX: Not mentioned → Skip plan_sfx
- Workflow: 
  1. generate_visuals({ contentPlanId: "prod_1768266562924_r3zdsyfgc" })
  2. animate_image({ contentPlanId: "prod_1768266562924_r3zdsyfgc", sceneIndex: 0 })
  3. animate_image({ contentPlanId: "prod_1768266562924_r3zdsyfgc", sceneIndex: 1 })
  ... etc

## CONSTRAINTS:

- generate_visuals: Must have ContentPlan with scene visualDescriptions
- animate_image: Must have generated visuals first
- plan_sfx: Must have ContentPlan with scene emotionalTone

## QUALITY TIPS:

- Visual consistency: Ensure all scenes follow same style/theme
- Animation pacing: Don't over-animate (subtle motion is better)
- SFX balance: Ambient sounds should complement, not overpower

When done, report: "Media complete. Visuals: N scenes. Animation: Yes/No."
`;

/**
 * Get media tools (generate_visuals, animate_image, plan_sfx)
 * NOTE: generate_music is excluded - Suno music generation is only available
 * in the dedicated "Generate Music" mode, not in video production
 */
function getMediaTools(): StructuredTool[] {
  return productionTools.filter((tool: StructuredTool) =>
    ["generate_visuals", "animate_image", "plan_sfx"].includes(tool.name)
  );
}

/**
 * Create Media Subagent
 */
export function createMediaSubagent(apiKey: string): Subagent {
  const mediaTools = getMediaTools();

  return {
    name: SubagentName.MEDIA,
    description: "Generates visual and audio assets (images, animation, music, SFX)",
    tools: mediaTools,
    systemPrompt: MEDIA_SUBAGENT_PROMPT,
    maxIterations: 20, // Needs many iterations for per-scene animation

    async invoke(context: SubagentContext): Promise<SubagentResult> {
      const startTime = Date.now();

      // CRITICAL: Validate that we have a sessionId
      if (!context.sessionId) {
        throw new Error("MediaSubagent requires a sessionId from the Content stage. Cannot proceed without it.");
      }

      console.log(`[MediaSubagent] Starting media generation with sessionId: ${context.sessionId}`);
      context.onProgress?.({
        stage: "media_starting",
        message: "Starting media subagent...",
        isComplete: false,
      });

      // Initialize model with tools
      const model = new ChatGoogleGenerativeAI({
        model: "gemini-3-flash-preview",
        apiKey,
        temperature: 0.4, // Higher for creative visual generation
      });

      const modelWithTools = model.bindTools(mediaTools);

      // CRITICAL: Inject sessionId into the instruction so the AI knows what to use
      const enhancedInstruction = `IMPORTANT: Your sessionId is "${context.sessionId}". Use this EXACT value as contentPlanId for ALL tool calls.

${context.instruction}

REMINDER: contentPlanId = "${context.sessionId}" for all tools (generate_visuals, animate_image, plan_sfx)`;

      // Initialize messages
      const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
        new SystemMessage(MEDIA_SUBAGENT_PROMPT),
        new HumanMessage(enhancedInstruction),
      ];

      let iteration = 0;
      const MAX_ITERATIONS = this.maxIterations;

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        context.onProgress?.({
          stage: "media_processing",
          message: `Generating media assets (iteration ${iteration}/${MAX_ITERATIONS})...`,
          isComplete: false,
        });

        // Get response from model
        const response = await modelWithTools.invoke(messages);
        messages.push(response);

        // Check if model wants to use tools
        if (!response.tool_calls || response.tool_calls.length === 0) {
          // No tool calls - check if media is complete
          const content = response.content as string;

          if (content.includes("Media complete") && content.includes("Visuals:")) {
            const duration = Date.now() - startTime;

            context.onProgress?.({
              stage: "media_complete",
              message: "Media generation completed successfully",
              isComplete: false,
              success: true,
            });

            return {
              success: true,
              sessionId: context.sessionId || "unknown",
              completedStage: SubagentName.MEDIA,
              duration,
              message: content,
            };
          }

          // Model finished without completing media
          console.warn("[MediaSubagent] Model finished without completion signal:", content);
          continue; // Give model another chance
        }

        // Execute tool calls
        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.name;

          context.onProgress?.({
            stage: "media_tool_call",
            tool: toolName,
            message: `Executing ${toolName}...`,
            isComplete: false,
          });

          const tool = mediaTools.find(t => t.name === toolName);
          if (!tool) {
            throw new Error(`Tool ${toolName} not found`);
          }

          try {
            const result = await tool.invoke(toolCall.args);

            // Add tool result to messages
            messages.push(
              new ToolMessage({
                content: typeof result === "string" ? result : JSON.stringify(result),
                tool_call_id: toolCall.id || "",
              })
            );

            context.onProgress?.({
              stage: "media_tool_result",
              tool: toolName,
              message: `✓ ${toolName} completed`,
              isComplete: false,
              success: true,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            context.onProgress?.({
              stage: "media_tool_error",
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
      throw new Error(`Media subagent exceeded maximum iterations (${MAX_ITERATIONS})`);
    },
  };
}
