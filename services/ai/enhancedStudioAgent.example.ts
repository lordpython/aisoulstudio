/**
 * Enhanced Studio Agent - Example Implementation
 * 
 * This file demonstrates how to implement the enhancements from the guide.
 * Copy and adapt sections as needed for your implementation.
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { GEMINI_API_KEY } from "../shared/apiClient";

// ============================================================
// 1. ENHANCED SYSTEM PROMPT WITH REASONING
// ============================================================

const ENHANCED_SYSTEM_PROMPT = `You are an AI creation assistant for LyricLens.

## REASONING FRAMEWORK (Use for EVERY request):
<thinking>
1. UNDERSTAND: What is the user asking for?
2. EXTRACT: What parameters are provided? What's missing?
3. DECIDE: Can I execute now or need clarification?
4. PLAN: What actions should I take?
5. RESPOND: Provide clear message + quick actions
</thinking>

## CAPABILITIES:
- Create videos (Cinematic, Documentary, Anime, Oil Painting styles)
- Generate music with Suno AI
- Search sound effects
- Modify existing projects
- Export videos

## RESPONSE RULES:
- ALWAYS include quickActions for common choices
- Be DIRECT - no preamble
- Use emojis for visual appeal
- Support English and Arabic

## EXAMPLE REASONING:
User: "Make a video about space"

<thinking>
1. UNDERSTAND: User wants video creation
2. EXTRACT: Topic=space ✓, Duration=?, Style=?, Language=?
3. DECIDE: Need clarification - offer presets
4. PLAN: Provide 3 quick action buttons with common durations/styles
5. RESPOND: Friendly message + buttons
</thinking>

Response: {
  "action": {"type": "ask_clarification"},
  "message": "🚀 Space video! Choose your style:",
  "quickActions": [
    {"id": "space-60-cine", "label": "60s Cinematic", ...},
    {"id": "space-90-doc", "label": "90s Documentary", ...}
  ]
}

Now respond to user requests following this framework.`;

// ============================================================
// 2. TOOL DEFINITIONS
// ============================================================

const createVideoTool = new DynamicStructuredTool({
  name: "create_video",
  description: "Create a video from a topic with specified parameters",
  schema: z.object({
    topic: z.string().describe("The video topic or subject"),
    duration: z.number().min(15).max(300).describe("Duration in seconds"),
    style: z.enum(["Cinematic", "Documentary", "Anime", "Oil Painting", "Watercolor"])
      .describe("Visual style"),
    language: z.enum(["en", "ar"]).optional().describe("Narration language"),
    mood: z.string().optional().describe("Overall mood/tone"),
  }),
  func: async ({ topic, duration, style, language, mood }) => {
    console.log('[Tool] Creating video:', { topic, duration, style });
    
    // This would trigger your actual video production pipeline
    // For now, return success message
    return JSON.stringify({
      success: true,
      message: `Video creation started: ${topic}`,
      videoId: `video-${Date.now()}`,
      estimatedTime: Math.ceil(duration / 10) + ' minutes',
    });
  },
});

const generateMusicTool = new DynamicStructuredTool({
  name: "generate_music",
  description: "Generate music with Suno AI",
  schema: z.object({
    prompt: z.string().describe("Music description"),
    style: z.string().describe("Music genre/style"),
    instrumental: z.boolean().describe("Whether to include vocals"),
    duration: z.number().optional().describe("Duration in seconds"),
  }),
  func: async ({ prompt, style, instrumental, duration }) => {
    console.log('[Tool] Generating music:', { prompt, style, instrumental });
    
    return JSON.stringify({
      success: true,
      message: `Music generation started: ${style}`,
      taskId: `music-${Date.now()}`,
    });
  },
});

const searchKnowledgeTool = new DynamicStructuredTool({
  name: "search_knowledge",
  description: "Search video production knowledge base for best practices",
  schema: z.object({
    query: z.string().describe("What to search for"),
  }),
  func: async ({ query }) => {
    // Simulated knowledge base
    const knowledge = {
      'cinematic': 'Cinematic style uses wide shots, dramatic lighting, slow movements',
      'pacing': '60s videos work best with 5-7 scenes, 8-12s per scene',
      'anime': 'Anime style features bold outlines, vibrant colors, dynamic poses',
    };

    const result = Object.entries(knowledge)
      .filter(([key]) => query.toLowerCase().includes(key))
      .map(([, value]) => value)
      .join('\n');

    return result || 'No specific knowledge found';
  },
});

// ============================================================
// 3. ENHANCED AGENT CLASS
// ============================================================

export class EnhancedStudioAgent {
  private agent: AgentExecutor;
  private conversationHistory: (HumanMessage | AIMessage)[] = [];
  private userPreferences: UserPreferences = {
    defaultStyle: undefined,
    defaultDuration: 60,
    preferredLanguage: 'en',
  };

  constructor() {
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.0-flash-exp",
      apiKey: GEMINI_API_KEY,
      temperature: 0.7,
    });

    const tools = [
      createVideoTool,
      generateMusicTool,
      searchKnowledgeTool,
    ];

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", ENHANCED_SYSTEM_PROMPT],
      ["placeholder", "{chat_history}"],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    const agentRunnable = createToolCallingAgent({
      llm: model,
      tools,
      prompt,
    });

    this.agent = new AgentExecutor({
      agent: agentRunnable,
      tools,
      verbose: true,
      maxIterations: 5,
    });
  }

  async processMessage(userMessage: string): Promise<AgentResponse> {
    const startTime = Date.now();

    // Add user message to history
    this.conversationHistory.push(new HumanMessage(userMessage));

    // Build context-aware input
    const contextualInput = this.buildContextualInput(userMessage);

    try {
      // Invoke agent
      const result = await this.agent.invoke({
        input: contextualInput,
        chat_history: this.conversationHistory.slice(-10), // Last 10 messages
      });

      // Add assistant response to history
      this.conversationHistory.push(new AIMessage(result.output));

      // Parse and format response
      const response = this.parseAgentResult(result);

      // Track performance
      console.log(`[Agent] Response time: ${Date.now() - startTime}ms`);

      return response;
    } catch (error) {
      console.error('[Agent] Error:', error);
      return this.createFallbackResponse(userMessage);
    }
  }

  private buildContextualInput(userMessage: string): string {
    let context = userMessage;

    // Add user preferences if available
    if (this.userPreferences.defaultStyle) {
      context += `\n\n[User typically prefers ${this.userPreferences.defaultStyle} style]`;
    }

    return context;
  }

  private parseAgentResult(result: any): AgentResponse {
    // Extract tool calls if any
    const toolCalls = result.intermediateSteps || [];
    
    // Try to parse JSON from output
    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          action: parsed.action,
          message: parsed.message,
          thinking: parsed.thinking,
          quickActions: parsed.quickActions || [],
        };
      } catch (e) {
        // Fall through to default parsing
      }
    }

    // Default response format
    return {
      action: { type: 'respond', message: result.output },
      message: result.output,
      thinking: this.extractThinking(toolCalls),
      quickActions: [],
    };
  }

  private extractThinking(toolCalls: any[]): string {
    if (toolCalls.length === 0) return '';
    
    return toolCalls
      .map(step => `Used ${step.action.tool}: ${step.observation}`)
      .join('\n');
  }

  private createFallbackResponse(userMessage: string): AgentResponse {
    return {
      action: { type: 'respond', message: "I'd be happy to help! Could you provide more details?" },
      message: "I'd be happy to help! Could you provide more details?",
      thinking: 'Fallback response due to error',
      quickActions: [],
    };
  }

  // Update user preferences based on actions
  updatePreferences(action: AgentAction) {
    if (action.type === 'create_video' && action.params) {
      // Track style usage
      const style = action.params.style;
      // After 3 uses, set as default
      // Implementation depends on your tracking mechanism
    }
  }

  resetConversation() {
    this.conversationHistory = [];
  }
}

// ============================================================
// 4. TYPE DEFINITIONS
// ============================================================

interface UserPreferences {
  defaultStyle?: string;
  defaultDuration?: number;
  preferredLanguage?: string;
}

interface AgentResponse {
  action: AgentAction;
  message: string;
  thinking?: string;
  quickActions?: QuickAction[];
}

interface AgentAction {
  type: string;
  params?: Record<string, any>;
  message?: string;
}

interface QuickAction {
  id: string;
  label: string;
  labelAr?: string;
  action: AgentAction;
  variant?: 'primary' | 'secondary';
}

// ============================================================
// 5. USAGE EXAMPLE
// ============================================================

/*
// In your StudioScreen.tsx or wherever you use the agent:

const enhancedAgent = new EnhancedStudioAgent();

const handleSubmit = async () => {
  const response = await enhancedAgent.processMessage(input);
  
  // Handle response
  updateLastMessage({
    content: response.message,
    quickActions: response.quickActions,
  });

  // Execute action
  switch (response.action.type) {
    case 'create_video':
      startProduction(response.action.params);
      break;
    case 'generate_music':
      generateMusic(response.action.params);
      break;
    // ... other actions
  }
};
*/
