/**
 * Supervisor Agent - Multi-Agent Orchestration
 *
 * The supervisor coordinates specialized subagents to complete video production workflows.
 * It analyzes user intent, routes to appropriate subagents, manages state transitions,
 * and consolidates progress reporting.
 *
 * Architecture:
 * SUPERVISOR (this agent)
 *  ├── delegate_to_import_subagent (optional)
 *  ├── delegate_to_content_subagent (required)
 *  ├── delegate_to_media_subagent (required)
 *  └── delegate_to_enhancement_export_subagent (required)
 *
 * Based on LangChain's supervisor + subagent pattern:
 * - Stateless subagents (no conversation history)
 * - Centralized memory in supervisor
 * - Tool-based invocation
 * - Sequential execution with dependencies
 */

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import {
  SubagentName,
  UserPreferences,
  CompletedStage,
  ProgressCallback,
  executeSubagent,
} from "./index";
import { MODELS } from "../../shared/apiClient";
import { createImportSubagent } from "./importSubagent";
import { createContentSubagent } from "./contentSubagent";
import { createMediaSubagent } from "./mediaSubagent";
import { createEnhancementExportSubagent } from "./enhancementExportSubagent";
import { productionStore, ProductionProgress } from "../productionAgent";
import { analyzeIntent, generateIntentHint } from "../../agent/intentDetection";

/**
 * Supervisor Agent System Prompt
 *
 * Enhanced with AI prompting best practices:
 * - Context-first: Explains orchestration role
 * - Example-driven: Multiple workflow examples
 * - Constraint-explicit: Clear rules for delegation
 * - Session ID pattern: Explicit instructions for session ID handling
 */
const SUPERVISOR_AGENT_PROMPT = `You are the Production Supervisor Agent. Your role is to orchestrate a multi-agent video production pipeline.

## CRITICAL: SESSION ID MANAGEMENT

The sessionId is the KEY to the entire production. It links all stages together.

**How it works:**
1. delegate_to_content_subagent creates a sessionId (format: prod_TIMESTAMP_HASH, e.g., prod_1768266562924_r3zdsyfgc)
2. You MUST pass this EXACT sessionId to delegate_to_media_subagent
3. You MUST pass this EXACT sessionId to delegate_to_enhancement_export_subagent

**NEVER use placeholder values like:**
- "plan_123", "cp_01", "session_123"
- "prod_video_plan", "content_plan_20250124_123456"
- "current_production", "video_session"

**ALWAYS use the ACTUAL sessionId returned by delegate_to_content_subagent.**

CONTEXT:
You coordinate specialized subagents that handle different stages of production. You maintain
the overall workflow, manage state transitions, and ensure all stages complete successfully.

## YOUR SPECIALIZED SUBAGENTS:

You have access to these subagent delegation tools:

1. delegate_to_import_subagent
   - When: User provides YouTube URL or audio file path
   - Returns: ImportedContent with transcript
   - Optional: Can skip if user provides topic directly

2. delegate_to_content_subagent (REQUIRED)
   - When: Always (every production needs content plan + narration)
   - Returns: ContentPlan + NarrationSegment[] + quality score + **sessionId**
   - Critical: This determines scene count and timing for all downstream stages
   - **IMPORTANT: Extract the sessionId from the response and use it for ALL subsequent calls**

3. delegate_to_media_subagent (REQUIRED)
   - When: Always (every production needs visuals)
   - Returns: GeneratedImage[] + optional SFX
   - Note: Animation, SFX are optional based on user request
   - NOTE: Music generation is NOT available in video production mode
   - **REQUIRED: Pass the sessionId from delegate_to_content_subagent**

4. delegate_to_enhancement_export_subagent (REQUIRED)
   - When: Always (every production needs export)
   - Returns: ExportResult + optional cloud upload
   - Note: Enhancement tools optional, export required
   - **REQUIRED: Pass the SAME sessionId from delegate_to_content_subagent**

## WORKFLOW ORCHESTRATION:

### Step 1: Analyze User Intent (Your Job)

Detect from user request:
- **Import Source**: YouTube URL? Audio file? Topic only?
- **Animation**: Keywords like "animated", "motion", "video", "moving"
- **Style**: Keywords like "cinematic", "anime", "watercolor", "documentary"
- **Subtitles**: Keywords like "subtitles", "captions", "accessibility"
- **Aspect Ratio**: Keywords like "portrait", "vertical", "square", "TikTok", "Instagram"
- NOTE: Music generation is not available in video production mode

### Step 2: Route to Subagents Sequentially

CRITICAL: Subagents must execute in this order (dependencies):

STAGE 1: IMPORT (Optional)
If user provides YouTube URL or audio file
→ delegate_to_import_subagent
→ Wait for completion → Extract transcript

STAGE 2: CONTENT (Required)
→ delegate_to_content_subagent
  Pass: topic (from import or user), duration
→ Wait for completion → Verify ContentPlan

STAGE 3: MEDIA (Required)
→ delegate_to_media_subagent
  Pass: animation=true/false, sfx=true/false
→ Wait for completion → Verify visuals

STAGE 4: ENHANCEMENT/EXPORT (Required)
→ delegate_to_enhancement_export_subagent
  Pass: enhancement options, export format
→ Wait for completion → Verify video export

### Step 3: State Coordination

**Session ID Management**:
- If import stage runs: Use sessionId from import
- If no import: Content subagent creates sessionId
- Pass SAME sessionId to all subsequent subagents
- DO NOT create new sessionIds for each stage

**State Verification Between Stages**:
After each subagent completes, verify expected state updates:
- IMPORT: \`importedContent\` must be set
- CONTENT: \`contentPlan\` and \`narrationSegments\` must be set
- MEDIA: \`visuals\` must be set (length = scene count)
- EXPORT: \`exportResult\` must be set

**Handling Missing State**:
If expected state is missing after subagent completes:
- Log error with subagent name and expected field
- Retry subagent once
- If still fails: Abort with partial success report

### Step 4: Error Recovery Strategy

| Error Type | Action |
|-----------|--------|
| **IMPORT fails** | Continue with topic-based workflow (don't abort) |
| **CONTENT fails** | ABORT (can't proceed without content plan) |
| **MEDIA fails** | RETRY once, then use placeholder visuals |
| **EXPORT fails** | RETRY once, then return asset bundle |

**Critical Path**: CONTENT → MEDIA → EXPORT
- If critical path fails after retries: ABORT
- If optional stages fail: CONTINUE with fallback

### Step 5: Progress Aggregation

Report progress at these key points:
1. "Starting production..." (before any subagent)
2. "Import stage: [status]" (if import stage runs)
3. "Content stage: Planning... Narrating... Validating..."
4. "Media stage: Generating visuals... [Animation if applicable]"
5. "Export stage: Mixing audio... Generating subtitles... Rendering video..."
6. "Production complete! Duration: Xs, Size: Y MB"

## EXAMPLES:

**Example 1**: Simple topic-based video
User: "Create a 60-second video about coffee history"

Intent Analysis:
- No import needed (topic provided)
- No animation keywords
- Style: Default (cinematic)

Workflow:
1. delegate_to_content_subagent({
     sessionId: null,  // Will create new
     topic: "coffee history",
     targetDuration: 60,
     style: "Cinematic"
   })
   // Returns: { "sessionId": "prod_xxx", "success": true, ... }

2. delegate_to_media_subagent({
     sessionId: "prod_xxx",  // USE THE SAME sessionId from step 1
     animation: false,
     sfx: false
   })

3. delegate_to_enhancement_export_subagent({
     sessionId: "prod_xxx",  // USE THE SAME sessionId from step 1
     format: "mp4",
     aspectRatio: "16:9"
   })

**Example 2**: YouTube import with animation
User: "Import this YouTube video and create an animated version: https://youtube.com/watch?v=abc123"

Intent Analysis:
- Import needed (YouTube URL detected)
- Animation: "animated" keyword found
- Style: Default

Workflow:
1. delegate_to_import_subagent({
     url: "https://youtube.com/watch?v=abc123"
   })
   // Returns: { "sessionId": "prod_yyy", "success": true, ... }

2. delegate_to_content_subagent({
     sessionId: "prod_yyy",  // REUSE import sessionId
     topic: [transcript from import],
     targetDuration: [video duration from import]
   })

3. delegate_to_media_subagent({
     sessionId: "prod_yyy",  // USE THE SAME sessionId
     animation: true,
     sfx: false
   })

4. delegate_to_enhancement_export_subagent({
     sessionId: "prod_yyy",  // USE THE SAME sessionId
     format: "mp4"
   })

**Example 3**: Vertical video with subtitles and cloud upload
User: "Create a 90-second vertical video about Ancient Egypt with subtitles, upload to cloud"

Intent Analysis:
- No import needed
- Vertical: aspectRatio = "9:16"
- Subtitles: generate_subtitles = true
- Cloud upload: upload_production_to_cloud = true

Workflow:
1. delegate_to_content_subagent({
     sessionId: null,
     topic: "Ancient Egypt",
     targetDuration: 90
   })
   // Returns: { "sessionId": "prod_zzz", "success": true, ... }

2. delegate_to_media_subagent({
     sessionId: "prod_zzz",  // USE THE SAME sessionId from step 1
     animation: false,
     sfx: false
   })

3. delegate_to_enhancement_export_subagent({
     sessionId: "prod_zzz",  // USE THE SAME sessionId from step 1
     format: "mp4",
     aspectRatio: "9:16",
     generateSubtitles: true,
     uploadToCloud: true
   })

## CONSTRAINTS:

- DO NOT skip required subagents (CONTENT, MEDIA, EXPORT always run)
- DO NOT run subagents in parallel (sequential execution required)
- DO NOT create multiple sessionIds (reuse from first stage)
- DO NOT call subagent tools yourself (delegate via subagent wrappers)

## SUCCESS CRITERIA:

Production is successful when:
- ✓ All required subagents completed
- ✓ State transitions verified
- ✓ Final video exported or asset bundle provided
- ✓ No critical path failures

When done, report: "Production complete! [summary of assets created]"
`;

/**
 * Supervisor Agent Options
 */
export interface SupervisorOptions {
  apiKey: string;
  userRequest: string;
  onProgress?: ProgressCallback;
}

/**
 * Supervisor Agent Result
 */
export interface SupervisorResult {
  success: boolean;
  sessionId: string | null;
  completedStages: CompletedStage[];
  message: string;
  duration: number;
}

/**
 * Run Supervisor Agent
 *
 * This is the main entry point for the multi-agent production system.
 */
export async function runSupervisorAgent(options: SupervisorOptions): Promise<SupervisorResult> {
  const { apiKey, userRequest, onProgress } = options;
  const startTime = Date.now();

  console.log("[SupervisorAgent] Starting production:", userRequest);
  onProgress?.({
    stage: "supervisor_starting",
    message: "Analyzing request and planning workflow...",
    isComplete: false,
  });

  // Create subagent instances
  const importSubagent = createImportSubagent(apiKey);
  const contentSubagent = createContentSubagent(apiKey);
  const mediaSubagent = createMediaSubagent(apiKey);
  const enhancementExportSubagent = createEnhancementExportSubagent(apiKey);

  // Create delegation tools
  const delegateToImportTool = tool(
    async ({ url, filePath }) => {
      const instruction = url ? `Import from ${url}` : `Transcribe ${filePath}`;
      const result = await executeSubagent(importSubagent, {
        sessionId: null,
        instruction,
        priorStages: [],
        userPreferences: {},
        onProgress,
      });
      return JSON.stringify(result);
    },
    {
      name: "delegate_to_import_subagent",
      description: "Delegate YouTube/audio import to specialized Import Subagent. Returns sessionId and transcript.",
      schema: z.object({
        url: z.string().optional().describe("YouTube/X URL to import"),
        filePath: z.string().optional().describe("Path to audio file to transcribe"),
      }),
    }
  );

  const delegateToContentTool = tool(
    async ({ sessionId, topic, targetDuration, style }) => {
      const instruction = `Create content plan for "${topic}" (${targetDuration}s duration, ${style || "Cinematic"} style)`;
      const result = await executeSubagent(contentSubagent, {
        sessionId: sessionId || null,
        instruction,
        priorStages: [],
        userPreferences: { style },
        onProgress,
      });
      return JSON.stringify(result);
    },
    {
      name: "delegate_to_content_subagent",
      description: "Delegate content planning and narration to Content Subagent. Creates ContentPlan with optimal scene count.",
      schema: z.object({
        sessionId: z.string().nullable().describe("Session ID from import stage, or null to create new"),
        topic: z.string().describe("Topic or transcript for the video"),
        targetDuration: z.number().describe("Target duration in seconds"),
        style: z.string().optional().describe("Visual style (cinematic, anime, documentary, etc.)"),
      }),
    }
  );

  const delegateToMediaTool = tool(
    async ({ sessionId, animation, sfx }) => {
      const features = [];
      if (animation) features.push("animation");
      if (sfx) features.push("sound effects");

      const instruction = features.length > 0
        ? `Generate visual assets with ${features.join(", ")}`
        : `Generate visual assets (no animation or SFX)`;

      const result = await executeSubagent(mediaSubagent, {
        sessionId,
        instruction,
        priorStages: [],
        userPreferences: { animation, sfx },
        onProgress,
      });
      return JSON.stringify(result);
    },
    {
      name: "delegate_to_media_subagent",
      description: "Delegate media generation to Media Subagent. Generates visuals, optionally animates, adds SFX. NOTE: Music generation is NOT available in video production mode. REQUIRED: Pass the sessionId from content stage.",
      schema: z.object({
        sessionId: z.string().describe("REQUIRED: Session ID from content stage (use the sessionId returned by delegate_to_content_subagent)"),
        animation: z.boolean().optional().default(false).describe("Whether to animate images to video"),
        sfx: z.boolean().optional().default(false).describe("Whether to create sound effects plan"),
      }),
    }
  );

  const delegateToEnhancementExportTool = tool(
    async ({ sessionId, format, aspectRatio, generateSubtitles, uploadToCloud, makePublic }) => {
      const features = [];
      if (generateSubtitles) features.push("subtitles");
      if (uploadToCloud) features.push("cloud upload");

      const instruction = `Export final video (${format || "mp4"}, ${aspectRatio || "16:9"})${features.length > 0 ? ` with ${features.join(", ")}` : ""}`;

      const result = await executeSubagent(enhancementExportSubagent, {
        sessionId,
        instruction,
        priorStages: [],
        userPreferences: { format, aspectRatio, subtitles: generateSubtitles, uploadToCloud, makePublic },
        onProgress,
      });
      return JSON.stringify(result);
    },
    {
      name: "delegate_to_enhancement_export_subagent",
      description: "Delegate enhancement and export to Enhancement/Export Subagent. Mixes audio, generates subtitles, exports video. REQUIRED: Pass the same sessionId used in previous stages.",
      schema: z.object({
        sessionId: z.string().describe("REQUIRED: Session ID from previous stages (use the SAME sessionId from content and media stages)"),
        format: z.string().optional().default("mp4").describe("Video format (mp4 or webm)"),
        aspectRatio: z.string().optional().default("16:9").describe("Aspect ratio (16:9, 9:16, or 1:1)"),
        generateSubtitles: z.boolean().optional().default(false).describe("Whether to generate subtitles"),
        uploadToCloud: z.boolean().optional().default(false).describe("Whether to upload to cloud storage"),
        makePublic: z.boolean().optional().default(false).describe("Whether to make cloud files public"),
      }),
    }
  );

  const supervisorTools = [
    delegateToImportTool,
    delegateToContentTool,
    delegateToMediaTool,
    delegateToEnhancementExportTool,
  ];

  // Initialize supervisor model
  const model = new ChatGoogleGenerativeAI({
    model: MODELS.TEXT,
    apiKey,
    temperature: 0.1, // Low temperature for consistent orchestration
  });

  const modelWithTools = model.bindTools(supervisorTools);

  // Analyze user intent for better tool selection
  const intentResult = analyzeIntent(userRequest);
  const intentHint = generateIntentHint(intentResult);

  // Build enhanced user message with intent hints
  let enhancedRequest = userRequest;
  if (intentHint) {
    enhancedRequest = `${userRequest}\n\n---\nSYSTEM INTENT ANALYSIS:\n${intentHint}`;
    console.log(`[SupervisorAgent] Intent detected:`, {
      wantsAnimation: intentResult.wantsAnimation,
      wantsMusic: intentResult.wantsMusic,
      detectedStyle: intentResult.detectedStyle,
    });
  }

  // Initialize messages
  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(SUPERVISOR_AGENT_PROMPT),
    new HumanMessage(enhancedRequest),
  ];

  let sessionId: string | null = null;
  const completedStages: CompletedStage[] = [];
  const MAX_ITERATIONS = 20;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    console.log(`[SupervisorAgent] Iteration ${iteration}/${MAX_ITERATIONS}`);

    // Get response from model
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    // Check if model wants to use tools
    if (!response.tool_calls || response.tool_calls.length === 0) {
      // No tool calls - check if production is complete
      const content = response.content as string;

      if (content.includes("Production complete")) {
        const duration = Date.now() - startTime;

        onProgress?.({
          stage: "complete",
          message: content,
          isComplete: true,
        });

        return {
          success: true,
          sessionId,
          completedStages,
          message: content,
          duration,
        };
      }

      // Model finished without completing production
      console.warn("[SupervisorAgent] Model finished without completion signal");
      continue;
    }

    // Execute tool calls (subagent delegations)
    for (const toolCall of response.tool_calls) {
      const toolName = toolCall.name;

      console.log(`[SupervisorAgent] Delegating to: ${toolName}`);

      const tool = supervisorTools.find(t => t.name === toolName);
      if (!tool) {
        throw new Error(`Tool ${toolName} not found`);
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (tool as any).invoke(toolCall.args);
        const parsed = JSON.parse(result);

        // Extract sessionId if returned
        if (parsed.sessionId && !sessionId) {
          sessionId = parsed.sessionId;
          console.log(`[SupervisorAgent] Session created: ${sessionId}`);
        }

        // Record completed stage
        if (parsed.completedStage) {
          completedStages.push({
            subagent: parsed.completedStage,
            completedAt: Date.now(),
            duration: parsed.duration || 0,
            success: parsed.success,
          });
        }

        // Add tool result to messages
        messages.push(
          new ToolMessage({
            content: result,
            tool_call_id: toolCall.id || "",
          })
        );

        // If sessionId was just set, add a reminder message to use it
        // NOTE: Using HumanMessage instead of SystemMessage because Google Generative AI
        // requires SystemMessage to be first in the messages array
        if (parsed.sessionId && sessionId === parsed.sessionId) {
          messages.push(
            new HumanMessage(
              `IMPORTANT: Session "${sessionId}" has been created. You MUST pass this sessionId to ALL subsequent subagent calls (media, enhancement/export). Do not use null or create a new sessionId.`
            )
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error(`[SupervisorAgent] Delegation failed:`, errorMessage);

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
  throw new Error(`Supervisor agent exceeded maximum iterations (${MAX_ITERATIONS})`);
}
