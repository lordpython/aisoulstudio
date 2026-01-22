/**
 * Studio Agent - LangChain-powered AI Agent for Video Creation
 * 
 * A proper AI agent that can:
 * - Understand natural language requests
 * - Plan and execute video creation workflows
 * - Ask clarifying questions
 * - Maintain conversation context
 * - Handle complex multi-step tasks
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { GEMINI_API_KEY } from "../shared/apiClient";
import { knowledgeBase } from "./rag/knowledgeBase";
import { exampleLibrary } from "./rag/exampleLibrary";
import { AI_CONFIG } from "./config";

// Agent action types
export type AgentAction =
  | { type: "generate_music"; params: { prompt: string; style?: string; instrumental?: boolean; title?: string; customMode?: boolean; model?: string } }
  | { type: "create_video"; params: VideoParams }
  | { type: "ask_clarification"; question: string }
  | { type: "respond"; message: string }
  | { type: "modify_settings"; settings: Partial<VideoParams> }
  | { type: "export_video"; format?: string }
  | { type: "show_preview" }
  | { type: "add_vocals"; params: { uploadUrl: string; prompt: string } }
  | { type: "generate_cover"; params: { taskId: string } }
  | { type: "create_music_video"; params: { taskId: string; audioId: string } }
  | { type: "reset" }
  // New actions for unused features
  | { type: "browse_sfx"; params: { category: string; query?: string } }
  | { type: "set_camera_style"; params: { angle?: string; lighting?: string } }
  | { type: "refine_prompt"; params: { promptText: string; intent?: string } }
  | { type: "show_quality_report" }
  | { type: "show_quality_history" }
  | { type: "mix_audio"; params: { includeSfx: boolean; includeMusic: boolean } }
  | { type: "lint_prompt"; params: { promptText: string } };

export interface VideoParams {
  topic: string;
  style: string;
  duration: number;
  mood?: string;
  targetAudience?: string;
  aspectRatio?: string;
  cameraAngle?: string;
  lightingMood?: string;
}

export interface QuickAction {
  id: string;
  label: string;
  labelAr?: string; // Arabic label
  action: AgentAction;
  variant?: 'primary' | 'secondary';
}

export interface AgentResponse {
  action: AgentAction;
  message: string;
  thinking?: string;
  quickActions?: QuickAction[];
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are an AI creation assistant for LyricLens, capable of generating both professional videos and full musical tracks.

## REASONING FRAMEWORK (Use for EVERY request):
<thinking>
1. UNDERSTAND: What is the user asking for?
2. EXTRACT: What parameters are provided? What's missing?
3. DECIDE: Can I execute now or need clarification?
4. PLAN: What actions should I take?
5. RESPOND: Provide clear message + quick actions
</thinking>

## Your Capabilities:
1. GENERATE MUSIC using Suno AI (V5 Model) - Full songs, instrumentals, custom lyrics
2. CREATE VIDEOS from any topic (documentaries, stories, educational content)
3. EDIT MUSIC (Extend, Add Vocals, Create Cover/Remix)
4. BROWSE SFX from Freesound library
5. SET CAMERA & LIGHTING styles
6. VIEW QUALITY reports and history
7. MIX AUDIO with SFX and background music
8. REFINE & LINT prompts

## CRITICAL: BE DIRECT - NO PREAMBLE
NEVER say "I'll ask you questions" or "Let me ask a few things" - just ASK THE QUESTIONS DIRECTLY.
BAD: "Great topic! I'll ask you some questions to understand your vision."
GOOD: "Great topic! 🎬 Quick questions:\n1. Duration? (30s/60s/90s/180s)\n2. Style? (Cinematic/Anime/Documentary)\n3. Language for narration?"

## QUICK ACTIONS - ALWAYS INCLUDE BUTTONS
When asking questions or suggesting options, ALWAYS include quickActions array with clickable buttons.
This lets users tap instead of typing. Include 2-4 most common choices as buttons.

## WHEN TO ASK vs WHEN TO EXECUTE

### ASK QUESTIONS when user request is vague:
- "Make a video about X" → Ask about duration, style, language + provide buttons
- "I want music" → Ask about genre, mood, vocals/instrumental + provide buttons

### EXECUTE IMMEDIATELY when user provides enough details:
- "Create a 90s cinematic video about Egypt in Arabic" → Has duration, style, topic, language - GO!
- "Make an upbeat pop song about summer" → Has genre, mood, topic - GO!

## Response Format (JSON):
{
  "action": {
    "type": "ask_clarification" | "create_video" | "generate_music" | "respond" | ...,
    "question": "..." // for ask_clarification
    "params": { ... } // for create_video, generate_music, etc.
  },
  "message": "Your response - if asking questions, THE QUESTIONS GO HERE TOO",
  "thinking": "Brief internal reasoning",
  "quickActions": [
    {"id": "action1", "label": "60s Cinematic", "labelAr": "60 ثانية سينمائي", "action": {"type": "create_video", "params": {...}}, "variant": "primary"},
    {"id": "action2", "label": "30s Short", "labelAr": "30 ثانية قصير", "action": {"type": "create_video", "params": {...}}, "variant": "secondary"}
  ]
}

## Examples:

User: "Make a video about space"
Response: {
  "action": {"type": "ask_clarification", "question": "duration and style"},
  "message": "🚀 Space video! What style works for you?",
  "thinking": "Vague request - offer common presets as buttons",
  "quickActions": [
    {"id": "space-60-cine", "label": "60s Cinematic", "labelAr": "60 ثانية سينمائي", "action": {"type": "create_video", "params": {"topic": "space exploration - planets, stars, and the cosmos", "style": "Cinematic", "duration": 60}}, "variant": "primary"},
    {"id": "space-90-doc", "label": "90s Documentary", "labelAr": "90 ثانية وثائقي", "action": {"type": "create_video", "params": {"topic": "space exploration documentary", "style": "Documentary", "duration": 90}}, "variant": "secondary"},
    {"id": "space-30-short", "label": "30s Short", "labelAr": "30 ثانية قصير", "action": {"type": "create_video", "params": {"topic": "space highlights", "style": "Cinematic", "duration": 30}}, "variant": "secondary"}
  ]
}

User: "اصنع فيديو عن روما القديمة"
Response: {
  "action": {"type": "ask_clarification", "question": "duration and style"},
  "message": "🏛️ روما القديمة! اختر النمط:",
  "thinking": "Arabic user - provide Arabic labels, offer presets",
  "quickActions": [
    {"id": "rome-60-cine", "label": "60s Cinematic", "labelAr": "60 ثانية سينمائي", "action": {"type": "create_video", "params": {"topic": "روما القديمة - الكولوسيوم والأباطرة", "style": "Cinematic", "duration": 60}}, "variant": "primary"},
    {"id": "rome-90-doc", "label": "90s Documentary", "labelAr": "90 ثانية وثائقي", "action": {"type": "create_video", "params": {"topic": "تاريخ روما القديمة", "style": "Documentary", "duration": 90}}, "variant": "secondary"},
    {"id": "rome-60-art", "label": "60s Oil Painting", "labelAr": "60 ثانية لوحة زيتية", "action": {"type": "create_video", "params": {"topic": "روما القديمة", "style": "Oil Painting", "duration": 60}}, "variant": "secondary"}
  ]
}

User: "I want some music"
Response: {
  "action": {"type": "ask_clarification", "question": "type and genre"},
  "message": "🎵 What kind of music?",
  "thinking": "Vague - offer popular genres as buttons",
  "quickActions": [
    {"id": "music-lofi", "label": "Lo-Fi Chill", "labelAr": "لو-فاي هادئ", "action": {"type": "generate_music", "params": {"prompt": "lo-fi chill beats, relaxing", "style": "Lo-Fi", "instrumental": true}}, "variant": "primary"},
    {"id": "music-epic", "label": "Epic Orchestral", "labelAr": "أوركسترا ملحمي", "action": {"type": "generate_music", "params": {"prompt": "epic orchestral cinematic", "style": "Orchestral", "instrumental": true}}, "variant": "secondary"},
    {"id": "music-pop", "label": "Pop Song", "labelAr": "أغنية بوب", "action": {"type": "generate_music", "params": {"prompt": "upbeat pop song", "style": "Pop", "instrumental": false}}, "variant": "secondary"},
    {"id": "music-electronic", "label": "Electronic", "labelAr": "إلكتروني", "action": {"type": "generate_music", "params": {"prompt": "electronic dance music", "style": "Electronic", "instrumental": true}}, "variant": "secondary"}
  ]
}

User: "Create a 90 second cinematic video about ancient Egypt in Arabic"
Response: {
  "action": {"type": "create_video", "params": {"topic": "ancient Egypt - pyramids, pharaohs, and the mysteries of the Nile", "style": "Cinematic", "duration": 90}},
  "message": "🏛️ Perfect! Creating 90s cinematic journey through Ancient Egypt with Arabic narration...",
  "thinking": "Has all details: 90s, cinematic, Egypt, Arabic. Execute immediately.",
  "quickActions": []
}

CAMERA ANGLES: wide establishing shot, medium shot, close-up, extreme close-up, low angle, high angle, over-the-shoulder, dutch angle, tracking shot, aerial/drone view

LIGHTING MOODS: golden hour warm, cool blue moonlight, dramatic chiaroscuro, soft diffused overcast, neon-lit urban glow, harsh midday sun, candlelit warmth, silhouette backlighting, foggy haze, studio three-point

SFX CATEGORIES: desert-wind, ocean-waves, forest-ambience, rain-gentle, thunderstorm, city-traffic, cafe-ambience, marketplace, eerie-ambience, mystical-drone, whispers, heartbeat, tension-drone, hopeful-pad, epic-strings, middle-eastern
`;


class StudioAgent {
  private model: ChatGoogleGenerativeAI;
  private conversationHistory: ConversationMessage[] = [];
  private currentVideoParams: Partial<VideoParams> = {};

  constructor() {
    this.model = new ChatGoogleGenerativeAI({
      model: "gemini-3-flash-preview",
      apiKey: GEMINI_API_KEY,
      temperature: 0.7,
    });

    // Log Phase 2 configuration on initialization
    if (AI_CONFIG.rag.enabled) {
      console.log('[StudioAgent] Phase 2 RAG enabled - knowledge base will be used');
    }
  }

  async processMessage(userMessage: string): Promise<AgentResponse> {
    const startTime = Date.now();

    // Phase 2: Get relevant knowledge from knowledge base (RAG)
    let knowledge = '';
    let exampleContext = '';
    
    if (AI_CONFIG.rag.enabled) {
      try {
        // Get relevant knowledge for the query
        knowledge = await knowledgeBase.getRelevantKnowledge(userMessage);
        
        // Get similar successful examples
        exampleContext = await exampleLibrary.getExampleContext(userMessage);
        
        if (knowledge) {
          console.log('[StudioAgent] ✅ Retrieved knowledge from knowledge base');
        }
        if (exampleContext) {
          console.log('[StudioAgent] ✅ Found similar successful examples');
        }
      } catch (error) {
        console.error('[StudioAgent] Failed to retrieve knowledge:', error);
        // Continue without knowledge - graceful degradation
      }
    }

    // Build enhanced message with knowledge context
    let enhancedMessage = userMessage;
    if (knowledge || exampleContext) {
      enhancedMessage = `${knowledge}\n\n${exampleContext}\n\nUser Request: ${userMessage}`;
    }

    // Add enhanced message to history
    this.conversationHistory.push({ role: "user", content: enhancedMessage });

    // Build messages for the model
    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      ...this.conversationHistory.map(msg =>
        msg.role === "user"
          ? new HumanMessage(msg.content)
          : new AIMessage(msg.content)
      ),
    ];

    // Add context about current state
    // NOTE: Using HumanMessage instead of SystemMessage because Google Generative AI
    // requires SystemMessage to be first in the messages array
    if (Object.keys(this.currentVideoParams).length > 0) {
      messages.push(new HumanMessage(
        `Current video settings: ${JSON.stringify(this.currentVideoParams)}`
      ));
    }

    try {
      const response = await this.model.invoke(messages);
      const responseText = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      // Parse the JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Fallback if no JSON found
        return this.createFallbackResponse(userMessage, responseText);
      }

      const parsed = JSON.parse(jsonMatch[0]) as AgentResponse;

      // Update conversation history with assistant response
      this.conversationHistory.push({ role: "assistant", content: parsed.message });

      // Update current video params if creating
      if (parsed.action.type === "create_video" && parsed.action.params) {
        this.currentVideoParams = { ...this.currentVideoParams, ...parsed.action.params };
      } else if (parsed.action.type === "modify_settings" && parsed.action.settings) {
        this.currentVideoParams = { ...this.currentVideoParams, ...parsed.action.settings };
      } else if (parsed.action.type === "reset") {
        this.currentVideoParams = {};
      }

      // Log performance
      const duration = Date.now() - startTime;
      console.log(`[StudioAgent] ✅ Response generated in ${duration}ms`);

      return parsed;
    } catch (error) {
      console.error("Agent error:", error);
      return this.createFallbackResponse(userMessage);
    }
  }

  private createFallbackResponse(userMessage: string, rawResponse?: string): AgentResponse {
    // Try to extract topic from user message
    const topic = this.extractTopicFallback(userMessage);

    // Check for music keywords in fallback
    const isMusicRequest = /\b(song|music|track|beat|audio|soundtrack|instrumental)\b/i.test(userMessage);

    if (topic) {
      if (isMusicRequest) {
        return {
          action: {
            type: "generate_music",
            params: { prompt: topic, instrumental: false }
          },
          message: `Generating music for "${topic}"...`,
          thinking: "Fallback extraction - detected music request"
        };
      }

      return {
        action: {
          type: "create_video",
          params: { topic, style: "Cinematic", duration: 60 }
        },
        message: `Creating a video about "${topic}"...`,
        thinking: "Fallback extraction"
      };
    }

    return {
      action: { type: "respond", message: rawResponse || "I'd be happy to help! Would you like to create a video or generate some music?" },
      message: rawResponse || "I'd be happy to help! Would you like to create a video or generate some music?",
    };
  }

  private extractTopicFallback(input: string): string | null {
    // Remove common prefixes and extract the core topic
    const topic = input
      .replace(/^(please\s+)?(can you\s+)?(i want\s+)?(to\s+)?/i, "")
      .replace(/^(create|make|generate|produce|build)\s+(me\s+)?(a\s+)?/i, "")
      .replace(/^(video|lyric video|music video)\s+(about|on|for|of)?\s*/i, "")
      .trim();

    if (topic.length > 5) {
      return topic;
    }

    // Try to find topic after keywords
    const patterns = [
      /(?:about|for|on|of|featuring|showcasing)\s+(.+?)(?:\.|$)/i,
      /(?:video|create|make)\s+(.+?)(?:\.|$)/i,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match?.[1] && match[1].length > 5) {
        return match[1].trim();
      }
    }

    return null;
  }

  // Get current video parameters
  getCurrentParams(): Partial<VideoParams> {
    return { ...this.currentVideoParams };
  }

  // Reset conversation
  resetConversation(): void {
    this.conversationHistory = [];
    this.currentVideoParams = {};
  }

  // Get conversation history
  getHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }
}

// Export singleton instance
export const studioAgent = new StudioAgent();

// Re-export productionAgent for autonomous video creation
export {
  runProductionAgent,
  getProductionSession,
  clearProductionSession,
  type ProductionProgress
} from "./productionAgent";
