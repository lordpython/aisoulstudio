/**
 * Agent Director Service
 * 
 * Orchestrates the AI video creation workflow using LangChain tools.
 * Refactored to separate concerns:
 * - Tools: ./agent/agentTools.ts
 * - Metrics: ./agent/agentMetrics.ts
 * - Logging: ./agent/agentLogger.ts
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { ImagePrompt } from "../types";
import { VideoPurpose } from "../constants";
import {
  getSystemPersona,
  getStyleEnhancement,
} from "./promptService";
import { GEMINI_API_KEY, VERTEX_PROJECT, MODELS } from "./shared/apiClient";
import { parseSRTTimestamp } from "../utils/srtParser";
import { generateCompleteFormatGuidance } from "./promptFormatService";

// Imported from decoupled modules
import { agentLogger, LogLevel, type LogEntry } from "./agent/agentLogger";
import { agentMetrics } from "./agent/agentMetrics";
import {
  allTools,
  executeToolCall,
  analyzeContentTool,
  searchVisualReferencesTool,
  analyzeAndGenerateStoryboardTool,
  generateStoryboardTool,
  refinePromptTool,
  critiqueStoryboardTool,
  jsonExtractor,
  fallbackProcessor
} from "./agent/agentTools";
import {
  type StoryboardData,
  ExtractionMethod,
} from "./jsonExtractor";
import {
  type AnalysisOutput,
  type StoryboardOutput,
} from "./directorService";

// Use imported singleton instances
export { LogLevel, type LogEntry };

// --- Agent Configuration ---

export interface AgentDirectorConfig {
  model?: string;
  temperature?: number;
  maxIterations?: number;
  qualityThreshold?: number;
  targetAssetCount?: number;
}

const DEFAULT_AGENT_CONFIG: Required<AgentDirectorConfig> = {
  model: MODELS.TEXT,
  temperature: 0.7,
  maxIterations: 2,
  qualityThreshold: 70,
  targetAssetCount: 10,
};

const LANGCHAIN_VERBOSE = process.env.NODE_ENV === "development";

/**
 * Generates a dynamic system prompt based on video purpose.
 */
function getAgentSystemPrompt(purpose: VideoPurpose): string {
  const persona = getSystemPersona(purpose);

  return `You are ${persona.name}, a Visionary Film Director.
  
## Your Identity
${persona.visualPrinciples.map(p => `- ${p}`).join('\n')}

## Core Rule
ATMOSPHERIC RESONANCE: Visualize the *feeling*, not just the nouns.

## Capabilities
1. **GENERATE MUSIC**: You can create full musical tracks using Suno AI.
2. **CREATE VIDEOS**: You create cinematic storyboards from text/lyrics.

## Workflow
1. For VIDEO: Use 'analyze_and_generate_storyboard' tool.
2. For MUSIC: Identify prompt/style and use 'generate_music' action.
3. If needed, use 'critique_storyboard' and 'refine_prompt'.
4. Output the final storyboard JSON or music config.

## Quality Standards
- Consistent visual motif in every scene
- No text or logos
- Varied camera angles`;
}

// --- Main Agent Function ---

export async function generatePromptsWithAgent(
  srtContent: string,
  style: string,
  contentType: "lyrics" | "story",
  videoPurpose: VideoPurpose,
  globalSubject?: string,
  config?: AgentDirectorConfig
): Promise<ImagePrompt[]> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_AGENT_CONFIG, ...config };

  agentLogger.info('Starting agent workflow', {
    contentType,
    videoPurpose,
    style,
    targetAssetCount: mergedConfig.targetAssetCount
  });

  if (!srtContent || srtContent.trim().length === 0) {
    agentLogger.warn('Empty content provided');
    agentMetrics.recordRequest(false, Date.now() - startTime);
    return [];
  }

  if (!GEMINI_API_KEY && !VERTEX_PROJECT) {
    agentLogger.error('API key not configured');
    throw new Error("API key not configured. Add VITE_GEMINI_API_KEY to .env.local");
  }

  try {
    const model = new ChatGoogleGenerativeAI({
      apiKey: GEMINI_API_KEY, // Can be empty if using Vertex
      model: mergedConfig.model,
      temperature: mergedConfig.temperature,
      verbose: LANGCHAIN_VERBOSE,
    }).bindTools(allTools);

    const systemPrompt = getAgentSystemPrompt(videoPurpose);
    const formatGuidance = generateCompleteFormatGuidance('storyboard');
    const styleData = getStyleEnhancement(style);

    // Simplifed prompt construction
    const taskMessage = `Create a visual storyboard for this ${contentType}.
    
Style: ${style} (${styleData.mediumDescription})
Purpose: ${videoPurpose}
Target Assets: ${mergedConfig.targetAssetCount}

${formatGuidance}

Content:
${srtContent}`;

    const messages: (HumanMessage | AIMessage | ToolMessage)[] = [
      new HumanMessage(systemPrompt + "\n\n" + taskMessage),
    ];

    let finalStoryboard: StoryboardOutput | null = null;
    let iterations = 0;
    const maxIterations = mergedConfig.maxIterations + 3;

    // Agent loop
    while (iterations < maxIterations) {
      iterations++;

      const response = await model.invoke(messages);
      messages.push(response);

      const toolCalls = response.tool_calls || [];

      if (toolCalls.length === 0) {
        // No tool calls, check for result
        const extracted = await extractStoryboardFromContent(response.content as string);
        if (extracted) {
          finalStoryboard = extracted;
        }
        break;
      }

      // Execute tool calls
      for (const toolCall of toolCalls) {
        agentLogger.debug(`Executing tool: ${toolCall.name}`);

        // Inject targetAssetCount if missing
        const toolArgs = { ...toolCall.args as Record<string, unknown> };
        if (['generate_storyboard', 'analyze_and_generate_storyboard'].includes(toolCall.name) && !toolArgs.targetAssetCount) {
          toolArgs.targetAssetCount = mergedConfig.targetAssetCount;
        }

        const result = await executeToolCall({
          name: toolCall.name,
          args: toolArgs,
        });

        messages.push(new ToolMessage({
          content: result,
          tool_call_id: toolCall.id || `call_${Date.now()}`,
        }));

        // Capture storyboard from tool output directly for reliability
        if (['generate_storyboard', 'analyze_and_generate_storyboard'].includes(toolCall.name)) {
          const extracted = await extractStoryboardFromContent(result);
          if (extracted) {
            finalStoryboard = extracted;
            agentLogger.info('Captured storyboard from tool output');
          }
        }
      }

      // Early exit if we have a good storyboard
      if (finalStoryboard) {
        break;
      }
    }

    if (finalStoryboard?.prompts) {
      const prompts = convertToImagePrompts(finalStoryboard.prompts);
      agentMetrics.recordRequest(true, Date.now() - startTime);
      return prompts;
    }

    agentMetrics.recordRequest(false, Date.now() - startTime);
    return [];

  } catch (error) {
    agentMetrics.recordRequest(false, Date.now() - startTime);
    throw error;
  }
}

/**
 * Helper to extract storyboard from text content using jsonExtractor
 */
export async function extractStoryboardFromContent(content: string): Promise<StoryboardOutput | null> {
  const extracted = await jsonExtractor.extractJSON(content);
  if (extracted) {
    const data = extracted.data as any;
    const storyboard = (data.storyboard || data) as StoryboardOutput;
    // Basic validation
    if (storyboard.prompts && Array.isArray(storyboard.prompts)) {
      return storyboard;
    }
  }

  // Fallback
  const fallback = fallbackProcessor.processWithFallback(content, "JSON extraction failed");
  if (fallback) {
    agentMetrics.recordExtractionMethod(ExtractionMethod.FALLBACK_TEXT);
    return {
      prompts: fallback.prompts.map((p, i) => ({
        text: p.prompt || '',
        mood: p.mood || 'neutral',
        timestamp: p.timestamp || '00:00'
      }))
    } as StoryboardOutput;
  }

  return null;
}

export function convertToImagePrompts(prompts: StoryboardOutput["prompts"]): ImagePrompt[] {
  return prompts.map((p, i) => ({
    id: `agent-prompt-${Date.now()}-${i}`,
    text: p.text,
    mood: p.mood,
    timestamp: p.timestamp,
    timestampSeconds: parseSRTTimestamp(p.timestamp) ?? 0,
  }));
}

// Re-export for testing/compatibility
export const agentTools = {
  analyzeContentTool,
  searchVisualReferencesTool,
  analyzeAndGenerateStoryboardTool,
  generateStoryboardTool,
  refinePromptTool,
  critiqueStoryboardTool,
};
export { agentLogger, agentMetrics };
