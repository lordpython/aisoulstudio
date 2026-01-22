/**
 * Content Subagent - Content Planning, Narration, and Quality Validation
 *
 * This subagent handles the critical content creation stage of the production pipeline.
 * It's responsible for making key decisions about scene count, narrative flow, and quality.
 *
 * Responsibilities:
 * - Create detailed content plan with scenes
 * - Decide optimal scene count based on topic complexity
 * - Generate voice narration for each scene
 * - Validate content quality with iterative improvement
 * - Sync timing between scenes and narration
 *
 * Tools:
 * - plan_video
 * - narrate_scenes
 * - validate_plan
 * - adjust_timing
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
import { productionStore, productionTools } from "../productionAgent";

/**
 * Content Subagent System Prompt
 *
 * Enhanced with AI prompting best practices:
 * - Context-first pattern: Explains critical role in pipeline
 * - Example-driven pattern: Concrete examples with reasoning
 * - Constraint-explicit pattern: Clear decision framework
 * - Validation-oriented pattern: Quality scoring rubric
 * - Session ID pattern: Explicit instructions about session ID handling
 */
const CONTENT_SUBAGENT_PROMPT = `You are the Content Subagent. Your role is to create a comprehensive content plan with narration.

## CRITICAL: SESSION ID HANDLING
When you call plan_video, it returns a sessionId (format: prod_TIMESTAMP_HASH, e.g., prod_1768266562924_r3zdsyfgc).
You MUST use this EXACT sessionId as the contentPlanId parameter for ALL subsequent tool calls:
- narrate_scenes: contentPlanId = sessionId from plan_video
- validate_plan: contentPlanId = sessionId from plan_video
- adjust_timing: contentPlanId = sessionId from plan_video

NEVER use placeholder values like "plan_123", "cp_01", or "session_12345".
ALWAYS use the ACTUAL sessionId returned by plan_video.

CONTEXT:
You receive a topic/transcript and target duration. Your output (ContentPlan + narration audio)
will drive the entire production. Visual assets, music, and timing all depend on YOUR decisions.

## SCENE COUNT DECISION FRAMEWORK (CRITICAL)

YOU decide the optimal scene count. Follow this decision process:

### Step 1: Assess Topic Complexity (Primary Factor)
- **High Complexity** (history, tutorials, multi-step processes):
  Example: "History of Ancient Rome" → Many eras/events → MORE scenes (15-25 for 2min)

- **Medium Complexity** (stories, explanations, demonstrations):
  Example: "How Coffee is Made" → Process steps → MEDIUM scenes (8-12 for 2min)

- **Low Complexity** (quotes, moods, abstract concepts):
  Example: "Motivational quote about success" → Single idea → FEWER scenes (3-5 for 2min)

### Step 2: Apply Duration Constraint
- Baseline: ~10-12 seconds per scene
- Adjust for complexity:
  - Complex topics: 8-10s per scene (faster pacing for information density)
  - Medium topics: 10-12s per scene (standard pacing)
  - Simple topics: 15-20s per scene (slower, contemplative pacing)

### Step 3: Validate Your Decision
Before calling plan_video, ask yourself:
- Does this scene count allow adequate time per scene for narration?
- Will the visual variety be sufficient (not repetitive)?
- Can the narrative flow naturally with this many transitions?

### Examples with Reasoning:
**Example 1**: 90s documentary on Egyptian pyramids
- Complexity: HIGH (architecture, history, construction methods)
- Scene count: 10-12 scenes
- Reasoning: Need time for pyramid exterior, interior chambers, hieroglyphics,
  construction theories, historical context → Each needs 8-10s

**Example 2**: 60s inspirational quote video
- Complexity: LOW (abstract emotional concept)
- Scene count: 4 scenes
- Reasoning: Quote reflection, visual metaphor expansion, emotional climax,
  actionable message → Each needs 15s for weight

**Example 3**: 2min coffee-making tutorial
- Complexity: MEDIUM (step-by-step process)
- Scene count: 12 scenes
- Reasoning: Bean selection, grinding, water temp, brewing, pouring, tasting,
  cleanup → Standard 10s per scene

## QUALITY CONTROL WORKFLOW (MANDATORY)

After generating narration, you MUST run quality validation:

1. Call validate_plan
   - Returns score 0-100 and suggestions

2. If score < 80 AND iterations < 2:
   - Call adjust_timing (syncs scene durations to actual narration lengths)
   - Call validate_plan again
   - Repeat until score >= 80 OR max 2 iterations

3. Report final score and best score achieved

QUALITY SCORING RUBRIC:
- 85-100: Approved. Coherent scenes, good narration match, visual variety.
- 70-84: Needs improvement. Timing mismatches or low variety.
- Below 70: Major issues. Consider replanning.

## YOUR TOOLS:

1. plan_video - Create content plan
   - YOU decide scene count (don't accept user's count blindly)
   - Returns: ContentPlan with scenes[]

2. narrate_scenes - Generate TTS narration
   - Uses Gemini TTS (24kHz, mono, WAV)
   - Returns: Audio blobs + durations + transcripts

3. validate_plan - Check quality
   - Returns: Score + needsImprovement + suggestions

4. adjust_timing - Fix timing mismatches
   - Syncs scene durations to actual narration lengths
   - Increments iteration counter

WORKFLOW:
1. Analyze topic complexity
2. Decide scene count with reasoning
3. Call plan_video
4. Call narrate_scenes
5. Call validate_plan
6. If needed: adjust_timing → validate_plan again
7. Report completion with quality score

When done, report: "Content complete. Score: X/100. Scenes: N. Duration: Xs."
`;

/**
 * Get content tools (plan_video, narrate_scenes, validate_plan, adjust_timing)
 * Filters production tools to only include content-related ones
 */
function getContentTools(): StructuredTool[] {
  return productionTools.filter((tool: StructuredTool) =>
    ["plan_video", "narrate_scenes", "validate_plan", "adjust_timing"].includes(tool.name)
  );
}

/**
 * Create Content Subagent
 */
export function createContentSubagent(apiKey: string): Subagent {
  const contentTools = getContentTools();

  return {
    name: SubagentName.CONTENT,
    description: "Creates content plan, generates narration, validates quality",
    tools: contentTools,
    systemPrompt: CONTENT_SUBAGENT_PROMPT,
    maxIterations: 15, // Needs more iterations for quality loop

    async invoke(context: SubagentContext): Promise<SubagentResult> {
      const startTime = Date.now();

      console.log(`[ContentSubagent] Starting content creation: ${context.instruction}`);
      context.onProgress?.({
        stage: "content_starting",
        message: "Starting content subagent...",
        isComplete: false,
      });

      // Initialize model with tools
      const model = new ChatGoogleGenerativeAI({
        model: "gemini-3-flash-preview",
        apiKey,
        temperature: 0.3, // Balance creativity with consistency
      });

      const modelWithTools = model.bindTools(contentTools);

      // Initialize messages
      const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
        new SystemMessage(CONTENT_SUBAGENT_PROMPT),
        new HumanMessage(context.instruction),
      ];

      let iteration = 0;
      const MAX_ITERATIONS = this.maxIterations;
      let currentSessionId = context.sessionId;

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        context.onProgress?.({
          stage: "content_processing",
          message: `Creating content (iteration ${iteration}/${MAX_ITERATIONS})...`,
          isComplete: false,
        });

        // Get response from model
        const response = await modelWithTools.invoke(messages);
        messages.push(response);

        // Check if model wants to use tools
        if (!response.tool_calls || response.tool_calls.length === 0) {
          // No tool calls - check if content is complete
          const content = response.content as string;

          if (content.includes("Content complete") && content.includes("Score:")) {
            const duration = Date.now() - startTime;

            context.onProgress?.({
              stage: "content_complete",
              message: "Content creation completed successfully",
              isComplete: false,
              success: true,
            });

            return {
              success: true,
              sessionId: currentSessionId || "unknown",
              completedStage: SubagentName.CONTENT,
              duration,
              message: content,
            };
          }

          // Model finished without completing content
          console.warn("[ContentSubagent] Model finished without completion signal:", content);
          continue; // Give model another chance
        }

        // Execute tool calls
        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.name;

          context.onProgress?.({
            stage: "content_tool_call",
            tool: toolName,
            message: `Executing ${toolName}...`,
            isComplete: false,
          });

          const tool = contentTools.find(t => t.name === toolName);
          if (!tool) {
            throw new Error(`Tool ${toolName} not found`);
          }

          try {
            const result = await tool.invoke(toolCall.args);

            // Extract sessionId if this was plan_video
            if (toolName === "plan_video" && typeof result === "string") {
              try {
                const parsed = JSON.parse(result);
                if (parsed.sessionId) {
                  currentSessionId = parsed.sessionId;
                  console.log(`[ContentSubagent] Session created: ${currentSessionId}`);
                  
                  // Add a reminder message to reinforce the sessionId usage
                  // Using HumanMessage because Google AI requires SystemMessage to be first
                  messages.push(
                    new HumanMessage(
                      `IMPORTANT: The sessionId "${currentSessionId}" has been created. You MUST use this EXACT sessionId as contentPlanId for ALL subsequent tool calls (narrate_scenes, validate_plan, adjust_timing). Do not use any other value.`
                    )
                  );
                }
              } catch (e) {
                // Not JSON, ignore
              }
            }

            // Add tool result to messages
            messages.push(
              new ToolMessage({
                content: typeof result === "string" ? result : JSON.stringify(result),
                tool_call_id: toolCall.id || "",
              })
            );

            context.onProgress?.({
              stage: "content_tool_result",
              tool: toolName,
              message: `✓ ${toolName} completed`,
              isComplete: false,
              success: true,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            context.onProgress?.({
              stage: "content_tool_error",
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
      throw new Error(`Content subagent exceeded maximum iterations (${MAX_ITERATIONS})`);
    },
  };
}
