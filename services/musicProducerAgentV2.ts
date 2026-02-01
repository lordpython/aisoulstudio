/**
 * Music Producer Agent V2
 * 
 * Enhanced agent with tools to directly call Suno API.
 * Uses ChatGoogleGenerativeAI with bindTools for browser compatibility.
 * Features:
 * - Conversational music production assistant
 * - Direct Suno API integration via tool calling
 * - Best practices prompt engineering for Suno
 * - Arabic/Khaliji music expertise
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { API_KEY, MODELS } from "./shared/apiClient";
import {
  generateMusic,
  getTaskStatus,
  waitForCompletion,
  getCredits,
  isSunoConfigured,
  type SunoGeneratedTrack,
  type SunoGenerationConfig,
} from "./sunoService";

// --- Best Practices Prompt System ---

const SUNO_BEST_PRACTICES = `
## SUNO API BEST PRACTICES

### Prompt Structure (CRITICAL)
Always structure prompts with section tags. This dramatically improves output quality:

[Intro]
(Describe instrumental opening, mood setting)

[Verse 1]
(Vocal delivery notes: soft, powerful, whispered, etc.)
Actual lyrics line 1
Actual lyrics line 2
Actual lyrics line 3
Actual lyrics line 4

[Pre-Chorus]
(Build tension, transition notes)
Lyrics building to chorus

[Chorus]
(Full energy, memorable hook)
Main hook lyrics
Catchy repeated phrase

[Verse 2]
(Continue story, vary delivery)
More lyrics...

[Bridge]
(Contrast section, emotional peak or quiet moment)
Bridge lyrics...

[Outro]
(Resolution, fade out notes)
Final lyrics or instrumental fade

### Style Description Best Practices
Be VERY detailed in the style field. Include:
- Primary genre + subgenre (e.g., "Modern Khaliji Pop with Gulf influences")
- Vocal characteristics (e.g., "warm female vocal with gentle vibrato")
- Instrumentation (e.g., "Oud, Darbuka, subtle synth pads, string section")
- Production style (e.g., "polished modern production with traditional elements")
- Mood/energy (e.g., "romantic, nostalgic, medium tempo")
- Reference artists if helpful (e.g., "in the style of Balqees, Hussain Al Jassmi")

### Arabic Music Specifics
For Arabic/Khaliji music, specify:
- Maqam (scale): Hijaz for emotional/dramatic, Bayati for melancholic, Rast for joyful
- Rhythm: Malfuf (2/4 fast), Saidi (4/4 energetic), Maqsum (4/4 standard), Wahda (4/4 slow)
- Dialect in lyrics: Gulf (Khaliji), Egyptian, Levantine, etc.
- Traditional vs modern balance

### Model Selection Guide
- V5: Latest, best overall quality - USE THIS BY DEFAULT
- V4_5ALL: Better song structure, good for complex arrangements
- V4_5PLUS: Richer tones, enhanced variation
- V4_5: Smart prompts, faster generation
- V4: Legacy, improved vocals

### Parameter Guidelines
- styleWeight: 0.6-0.7 for balanced, 0.8+ for strict style adherence
- weirdnessConstraint: 0.3-0.5 for conventional, 0.6-0.8 for experimental
- negativeTags: Always exclude unwanted elements (e.g., "screaming, heavy distortion, off-key")
`;

const SYSTEM_PROMPT = `You are an expert AI music producer assistant specializing in creating professional-quality songs using Suno AI.

${SUNO_BEST_PRACTICES}

## YOUR WORKFLOW

1. GATHER INFORMATION (1-3 messages):
   - Ask about genre/style preferences
   - Understand the mood and theme
   - Get vocal preferences (gender, style, language)
   - Collect any specific lyrics or themes
   - For Arabic music: ask about dialect, maqam preference, traditional vs modern

2. CRAFT THE PERFECT REQUEST:
   - Build a detailed structured prompt with section tags
   - Write or refine lyrics in the requested language
   - Create a comprehensive style description
   - Set appropriate parameters

3. GENERATE MUSIC:
   - Use the generate_music tool to create the song
   - The tool will return track details when complete

## CONVERSATION STYLE
- Be enthusiastic and knowledgeable about music
- Ask ONE focused question at a time
- Offer creative suggestions and examples
- Understand both English and Arabic
- Be concise but thorough

## ARABIC MUSIC EXPERTISE
You are highly knowledgeable about:
- Khaliji (Gulf) pop: Balqees, Hussain Al Jassmi, Ahlam style
- Egyptian pop: Amr Diab, Sherine style
- Lebanese pop: Nancy Ajram, Elissa style
- Traditional: Tarab, Muwashahat
- Maqamat: Hijaz, Bayati, Rast, Nahawand, Saba, Kurd, Ajam
- Rhythms: Malfuf, Saidi, Maqsum, Baladi, Wahda, Ayoub

When the user is ready or after gathering enough information, use the generate_music tool to create their song.`;

// --- Tool Definitions ---

const generateMusicTool = tool(
  async (input) => {
    try {
      console.log("[MusicProducerV2] Generating music with:", {
        title: input.title,
        style: input.style.substring(0, 50) + "...",
        model: input.model,
      });

      const config: SunoGenerationConfig = {
        prompt: input.prompt,
        title: input.title,
        style: input.style,
        instrumental: input.instrumental,
        model: input.model,
        vocalGender: input.vocalGender,
        negativeTags: input.negativeTags,
        styleWeight: input.styleWeight,
        weirdnessConstraint: input.weirdnessConstraint,
      };

      const taskId = await generateMusic(config);
      
      return JSON.stringify({
        success: true,
        taskId,
        message: `Music generation started! Task ID: ${taskId}. The song is being created and will be ready in a few minutes.`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  {
    name: "generate_music",
    description: `Generate a song using Suno AI. Use this when you have gathered enough information about the user's music preferences. 
  
IMPORTANT: The prompt should be a FULL structured song with section tags like [Intro], [Verse], [Chorus], etc.
The style should be a DETAILED description including genre, mood, instruments, and vocal characteristics.`,
    schema: z.object({
      prompt: z.string().describe("Full structured song prompt with [Intro], [Verse], [Chorus], [Bridge], [Outro] tags and complete lyrics"),
      title: z.string().describe("Song title"),
      style: z.string().describe("Detailed style: genre, subgenre, vocal style, instruments, mood, production style"),
      instrumental: z.boolean().describe("True for instrumental only, false for vocal track"),
      vocalGender: z.enum(["m", "f"]).optional().describe("Vocal gender: 'm' for male, 'f' for female"),
      negativeTags: z.string().optional().describe("Comma-separated styles to avoid"),
      model: z.enum(["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"]).default("V5").describe("Suno model version"),
      styleWeight: z.number().min(0).max(1).default(0.65).describe("Style influence strength 0-1"),
      weirdnessConstraint: z.number().min(0).max(1).default(0.5).describe("Creativity level 0-1"),
    }),
  }
);

const checkCreditsTool = tool(
  async () => {
    try {
      const result = await getCredits();
      return JSON.stringify({
        success: true,
        credits: result.credits,
        message: result.credits >= 0 
          ? `You have ${result.credits} credits remaining.`
          : "Could not fetch credit balance.",
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  {
    name: "check_credits",
    description: "Check the remaining Suno API credits before generating music",
    schema: z.object({}),
  }
);

const checkTaskStatusTool = tool(
  async ({ taskId }) => {
    try {
      const result = await getTaskStatus(taskId);
      return JSON.stringify({
        success: true,
        status: result.status,
        tracks: result.tracks,
        errorMessage: result.errorMessage,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  {
    name: "check_task_status",
    description: "Check the status of a music generation task",
    schema: z.object({
      taskId: z.string().describe("The task ID returned from generate_music"),
    }),
  }
);

// Tool registry for execution
async function executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
  let result: string | unknown;
  
  switch (toolName) {
    case "generate_music":
      result = await generateMusicTool.invoke(args as Parameters<typeof generateMusicTool.invoke>[0]);
      break;
    case "check_credits":
      result = await checkCreditsTool.invoke({});
      break;
    case "check_task_status":
      result = await checkTaskStatusTool.invoke(args as { taskId: string });
      break;
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
  
  // Ensure we return a string
  if (typeof result === "string") {
    return result;
  }
  return JSON.stringify(result);
}

const tools = [generateMusicTool, checkCreditsTool, checkTaskStatusTool];

// --- Agent Configuration ---

export interface MusicProducerV2Config {
  model?: string;
  temperature?: number;
  maxIterations?: number;
  onTaskStarted?: (taskId: string) => void;
  onStatusUpdate?: (status: string) => void;
}

const DEFAULT_CONFIG: Required<Omit<MusicProducerV2Config, 'onTaskStarted' | 'onStatusUpdate'>> = {
  model: MODELS.TEXT,
  temperature: 0.8,
  maxIterations: 10,
};

// --- Agent Response Types ---

/**
 * Pending tool call that requires user confirmation before execution.
 * Used for human-in-the-loop confirmation flow.
 */
export interface PendingToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Human-readable summary of what will happen */
  summary: string;
}

export interface AgentV2Response {
  type: "message" | "confirmation_required" | "generating" | "complete" | "error";
  message: string;
  taskId?: string;
  tracks?: SunoGeneratedTrack[];
  error?: string;
  /** Present when type is "confirmation_required" */
  pendingAction?: PendingToolCall;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}


// --- Agent Class ---

export class MusicProducerAgentV2 {
  private model: ChatGoogleGenerativeAI | null = null;
  private modelWithTools: ReturnType<ChatGoogleGenerativeAI["bindTools"]> | null = null;
  private config: Required<Omit<MusicProducerV2Config, 'onTaskStarted' | 'onStatusUpdate'>>;
  private callbacks: Pick<MusicProducerV2Config, 'onTaskStarted' | 'onStatusUpdate'>;
  private conversationHistory: BaseMessage[] = [];
  private currentTaskId: string | null = null;
  /** Pending tool call awaiting user confirmation (human-in-the-loop) */
  private pendingToolCall: PendingToolCall | null = null;
  /** The AI response that contained the pending tool call */
  private pendingAIResponse: AIMessage | null = null;

  constructor(config: MusicProducerV2Config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = {
      onTaskStarted: config.onTaskStarted,
      onStatusUpdate: config.onStatusUpdate,
    };
  }

  private initialize(): ReturnType<ChatGoogleGenerativeAI["bindTools"]> {
    if (this.modelWithTools) return this.modelWithTools;

    if (!API_KEY) {
      throw new Error("Gemini API key is not configured");
    }

    if (!isSunoConfigured()) {
      throw new Error("Suno API key is not configured");
    }

    this.model = new ChatGoogleGenerativeAI({
      apiKey: API_KEY,
      model: this.config.model,
      temperature: this.config.temperature,
    });

    this.modelWithTools = this.model.bindTools(tools);
    return this.modelWithTools;
  }

  /**
   * Reset the conversation
   */
  reset(): void {
    this.conversationHistory = [];
    this.currentTaskId = null;
    this.pendingToolCall = null;
    this.pendingAIResponse = null;
  }

  /**
   * Check if there's a pending action awaiting confirmation
   */
  hasPendingAction(): boolean {
    return this.pendingToolCall !== null;
  }

  /**
   * Get the pending action details
   */
  getPendingAction(): PendingToolCall | null {
    return this.pendingToolCall;
  }

  /**
   * Cancel the pending action and continue chatting
   */
  cancelPendingAction(): void {
    if (this.pendingToolCall && this.pendingAIResponse) {
      // Add a tool message indicating cancellation
      this.conversationHistory.push(this.pendingAIResponse);
      this.conversationHistory.push(new ToolMessage({
        tool_call_id: this.pendingToolCall.id,
        content: JSON.stringify({
          cancelled: true,
          message: "User cancelled the action. Ask if they want to modify anything."
        }),
      }));
    }
    this.pendingToolCall = null;
    this.pendingAIResponse = null;
  }

  /**
   * Get conversation history
   */
  getHistory(): ConversationMessage[] {
    return this.conversationHistory
      .filter(msg => msg instanceof HumanMessage || msg instanceof AIMessage)
      .map(msg => ({
        role: (msg instanceof HumanMessage ? "user" : "assistant") as "user" | "assistant",
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      }));
  }

  /**
   * Get current task ID if generation is in progress
   */
  getCurrentTaskId(): string | null {
    return this.currentTaskId;
  }

  /**
   * Send a message to the agent with automatic tool execution loop.
   * When generate_music is called, returns confirmation_required instead of executing.
   */
  async chat(userMessage: string): Promise<AgentV2Response> {
    if (!userMessage?.trim()) {
      return { type: "error", message: "Message is required", error: "Empty message" };
    }

    try {
      const modelWithTools = this.initialize();

      // Add system message if this is the first message
      if (this.conversationHistory.length === 0) {
        this.conversationHistory.push(new SystemMessage(SYSTEM_PROMPT));
      }

      // Add user message
      this.conversationHistory.push(new HumanMessage(userMessage));

      let iterations = 0;
      let finalOutput = "";

      // Tool execution loop
      while (iterations < this.config.maxIterations) {
        iterations++;

        const response = await modelWithTools.invoke(this.conversationHistory);

        // Check if there are tool calls
        const toolCalls = response.tool_calls;
        console.log("[MusicProducerV2] Tool calls in response:", toolCalls?.map(tc => tc.name) || "none");

        if (!toolCalls || toolCalls.length === 0) {
          // No tool calls - this is the final response
          this.conversationHistory.push(response);
          finalOutput = typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);
          break;
        }

        // Check if generate_music is being called - requires confirmation
        const generateMusicCall = toolCalls.find(tc => tc.name === "generate_music");
        if (generateMusicCall) {
          // Store pending action for confirmation (don't add response to history yet)
          const args = generateMusicCall.args as Record<string, unknown>;
          this.pendingAIResponse = response;
          this.pendingToolCall = {
            id: generateMusicCall.id || "generate_music",
            name: "generate_music",
            args,
            summary: this.createConfirmationSummary(args),
          };

          // Extract message content for the confirmation prompt
          const messageContent = typeof response.content === "string"
            ? response.content
            : "";

          console.log("[MusicProducerV2] Returning confirmation_required with pendingAction:", {
            id: this.pendingToolCall.id,
            name: this.pendingToolCall.name,
            summary: this.pendingToolCall.summary,
          });

          return {
            type: "confirmation_required",
            message: messageContent || "I'm ready to generate your song! Please confirm the details below.",
            pendingAction: this.pendingToolCall,
          };
        }

        // For other tools, execute normally
        this.conversationHistory.push(response);

        for (const toolCall of toolCalls) {
          const toolName = toolCall.name;

          try {
            const toolResult = await executeTool(toolName, toolCall.args as Record<string, unknown>);
            this.conversationHistory.push(new ToolMessage({
              tool_call_id: toolCall.id || toolName,
              content: toolResult,
            }));
          } catch (error) {
            this.conversationHistory.push(new ToolMessage({
              tool_call_id: toolCall.id || toolName,
              content: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              }),
            }));
          }
        }
      }

      // Check if a task was started
      if (this.currentTaskId) {
        return {
          type: "generating",
          message: finalOutput || `Music generation started! Task ID: ${this.currentTaskId}`,
          taskId: this.currentTaskId,
        };
      }

      return {
        type: "message",
        message: finalOutput,
      };

    } catch (error) {
      console.error("[MusicProducerV2] Chat error:", error);
      return {
        type: "error",
        message: "Sorry, something went wrong. Please try again.",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a human-readable summary of the pending generation action
   */
  private createConfirmationSummary(args: Record<string, unknown>): string {
    const title = args.title as string || "Untitled";
    const style = args.style as string || "";
    const instrumental = args.instrumental as boolean;
    const vocalGender = args.vocalGender as string;
    const model = args.model as string || "V5";

    let summary = `🎵 **${title}**\n`;
    summary += `📀 Style: ${style.substring(0, 100)}${style.length > 100 ? "..." : ""}\n`;
    summary += `🎤 ${instrumental ? "Instrumental only" : `Vocals: ${vocalGender === "f" ? "Female" : vocalGender === "m" ? "Male" : "Auto"}`}\n`;
    summary += `⚙️ Model: Suno ${model}`;

    return summary;
  }

  /**
   * Confirm and execute the pending action.
   * Call this after the user clicks the confirm button.
   */
  async confirmAndExecute(): Promise<AgentV2Response> {
    if (!this.pendingToolCall || !this.pendingAIResponse) {
      return {
        type: "error",
        message: "No pending action to confirm.",
        error: "No pending action",
      };
    }

    try {
      // Add the AI response to history now that it's confirmed
      this.conversationHistory.push(this.pendingAIResponse);

      // Execute the pending tool
      const toolResult = await executeTool(
        this.pendingToolCall.name,
        this.pendingToolCall.args
      );

      // Add tool result to history
      this.conversationHistory.push(new ToolMessage({
        tool_call_id: this.pendingToolCall.id,
        content: toolResult,
      }));

      // Check if generation started
      try {
        const parsed = JSON.parse(toolResult);
        if (parsed.success && parsed.taskId) {
          this.currentTaskId = parsed.taskId;
          if (this.currentTaskId) {
            this.callbacks.onTaskStarted?.(this.currentTaskId);
          }

          // Get title before clearing pending state
          const title = this.pendingToolCall?.args.title || "Untitled";

          // Clear pending state
          this.pendingToolCall = null;
          this.pendingAIResponse = null;

          return {
            type: "generating",
            message: `🎶 Music generation started! Your song "${title}" is being created...`,
            taskId: this.currentTaskId ?? undefined,
          };
        } else if (parsed.error) {
          throw new Error(parsed.error);
        }
      } catch (parseError) {
        // If not JSON, treat as error
        if (parseError instanceof SyntaxError) {
          throw new Error(toolResult);
        }
        throw parseError;
      }

      // Unexpected state
      return {
        type: "error",
        message: "Generation may have started but couldn't confirm the task ID.",
        error: "Unexpected response format",
      };

    } catch (error) {
      console.error("[MusicProducerV2] Confirm error:", error);

      // Clear pending state on error
      this.pendingToolCall = null;
      this.pendingAIResponse = null;

      return {
        type: "error",
        message: `Failed to start generation: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Poll for task completion
   */
  async pollForCompletion(taskId: string, maxWaitMs: number = 10 * 60 * 1000): Promise<SunoGeneratedTrack[]> {
    return waitForCompletion(taskId, maxWaitMs);
  }
}

// --- Factory Function ---

export function createMusicProducerAgentV2(config?: MusicProducerV2Config): MusicProducerAgentV2 {
  return new MusicProducerAgentV2(config);
}
