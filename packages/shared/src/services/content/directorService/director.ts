/**
 * Director Service — LCEL chain composition, prompt validation, and main entry point
 */

import { RunnableSequence } from "@langchain/core/runnables";
import { ImagePrompt } from "../../../types";
import { VideoPurpose, CAMERA_ANGLES, LIGHTING_MOODS } from "../../../constants";
import {
  getPurposeGuidance,
  getSystemPersona,
  getStyleEnhancement,
  generatePromptsFromLyrics,
  generatePromptsFromStory,
  lintPrompt,
  refineImagePrompt,
  injectMasterStyle,
} from "../promptService";
import { parseSRTTimestamp } from "../../../utils/srtParser";
import { GEMINI_API_KEY, VERTEX_PROJECT } from "../../shared/apiClient";
import {
  AnalysisOutput,
  StoryboardOutput,
  DirectorConfig,
  DirectorServiceError,
  DirectorErrorCode,
} from "./schemas";
import { createAnalyzerChain } from "./analyzer";
import { createStoryboarderChain } from "./storyboarder";

// --- LCEL Chain ---

export function createDirectorChain(
  contentType: "lyrics" | "story",
  config?: DirectorConfig
) {
  const analyzerChain = createAnalyzerChain(contentType, config);
  const storyboarderChain = createStoryboarderChain(config);

  return RunnableSequence.from([
    async (input: {
      content: string;
      style: string;
      videoPurpose: VideoPurpose;
      globalSubject: string;
    }) => {
      const analysis = await analyzerChain.invoke({ content: input.content });
      console.log("[Director] Analysis complete:", JSON.stringify(analysis, null, 2));
      return { analysis, style: input.style, videoPurpose: input.videoPurpose, globalSubject: input.globalSubject };
    },
    async (input: {
      analysis: AnalysisOutput;
      style: string;
      videoPurpose: VideoPurpose;
      globalSubject: string;
    }) => {
      const persona = getSystemPersona(input.videoPurpose);
      const personaInstructions = `You are ${persona.name}, a ${persona.role}.

YOUR CORE RULE:
${persona.coreRule}

YOUR VISUAL PRINCIPLES:
${persona.visualPrinciples.map((p: string) => `- ${p}`).join('\n')}

WHAT TO AVOID:
${persona.avoidList.map((a: string) => `- ${a}`).join('\n')}`;

      const styleData = getStyleEnhancement(input.style);
      const styleEnhancement = `MEDIUM AUTHENTICITY (apply these characteristics):
${styleData.keywords.map((k: string) => `- ${k}`).join('\n')}
Overall: ${styleData.mediumDescription}`;

      const purposeGuidance = getPurposeGuidance(input.videoPurpose);
      const subjectGuidance = input.globalSubject.trim()
        ? `Keep this subject's appearance consistent across scenes.`
        : `Create cohesive scenes with consistent environmental elements.`;

      const visualScenes = input.analysis.visualScenes && input.analysis.visualScenes.length > 0
        ? input.analysis.visualScenes.map((scene, i) =>
            `SCENE ${i + 1} [${scene.timestamp}] - ${scene.emotionalTone}:
      Subject: ${scene.subjectContext}
      Visual: ${scene.visualPrompt}`
          ).join('\n\n')
        : "No visual scenes provided - create cinematic scenes based on themes and emotional arc.";

      const targetAssetCount = config?.targetAssetCount || 10;
      const result = await storyboarderChain.invoke({
        style: input.style,
        personaInstructions,
        styleEnhancement,
        purposeGuidance,
        globalSubject: input.globalSubject || "None specified",
        subjectGuidance,
        visualScenes,
        cameraAngles: CAMERA_ANGLES.join(", "),
        lightingMoods: LIGHTING_MOODS.join(", "),
        analysis: JSON.stringify(input.analysis, null, 2),
        targetAssetCount,
      });

      if (result.prompts) {
        result.prompts = result.prompts.map(prompt => ({
          ...prompt,
          text: injectMasterStyle(prompt.text, input.style)
        }));
      }

      console.log("[Director] Storyboard complete:", result.prompts?.length, "prompts generated");
      return result;
    },
  ]);
}

// --- Error Classification ---

function classifyError(error: unknown): DirectorErrorCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("api key") || message.includes("apikey") || message.includes("unauthorized") ||
      message.includes("credentials") || message.includes("authentication") || message.includes("adc")) {
      return "API_KEY_MISSING";
    }
    if (message.includes("rate limit") || message.includes("quota") || message.includes("429")) return "RATE_LIMIT_EXCEEDED";
    if (message.includes("network") || message.includes("fetch") || message.includes("econnrefused") || message.includes("enotfound")) return "NETWORK_ERROR";
    if (message.includes("timeout") || message.includes("timed out")) return "TIMEOUT";
    if (message.includes("parse") || message.includes("json") || message.includes("unexpected token")) return "OUTPUT_PARSING_FAILED";
    if (message.includes("validation") || message.includes("schema") || message.includes("zod")) return "SCHEMA_VALIDATION_FAILED";
    if (message.includes("model") && (message.includes("init") || message.includes("create"))) return "MODEL_INIT_FAILED";
  }
  return "UNKNOWN_ERROR";
}

function logError(stage: string, error: unknown, context?: Record<string, unknown>): void {
  const errorCode = classifyError(error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error(`[Director] Error in ${stage}:`);
  console.error(`  Code: ${errorCode}`);
  console.error(`  Message: ${errorMessage}`);
  if (context) console.error(`  Context:`, JSON.stringify(context, null, 2));
  if (errorStack) console.error(`  Stack: ${errorStack}`);
}

// --- Prompt Validation ---

async function validateAndLintPrompts(
  prompts: StoryboardOutput["prompts"],
  globalSubject?: string,
  style: string = "Cinematic"
): Promise<ImagePrompt[]> {
  const validatedPrompts: ImagePrompt[] = [];
  const previousPrompts: string[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    if (!prompt) continue;

    const issues = lintPrompt({ promptText: prompt.text, globalSubject, previousPrompts });

    if (issues.length > 0) {
      console.log(`[Director] Lint issues for prompt ${i + 1}:`, issues.map(issue => issue.code).join(", "));
    }

    const criticalIssues = issues.filter(issue => issue.code === "too_short" || issue.code === "missing_subject");
    let finalText = prompt.text;

    if (criticalIssues.length > 0) {
      console.log(`[Director] Critical issues detected for prompt ${i + 1}, attempting refinement...`);
      try {
        const refinementResult = await refineImagePrompt({
          promptText: prompt.text,
          style,
          globalSubject,
          intent: "auto",
          previousPrompts,
        });
        finalText = refinementResult.refinedPrompt;
        console.log(`[Director] Prompt ${i + 1} refined successfully`);

        const postRefinementIssues = lintPrompt({ promptText: finalText, globalSubject, previousPrompts });
        if (postRefinementIssues.some(issue => issue.code === "too_short" || issue.code === "missing_subject")) {
          console.log(`[Director] Prompt ${i + 1} still has critical issues after refinement`);
        }
      } catch (refinementError) {
        console.error(`[Director] Refinement failed for prompt ${i + 1}:`, refinementError);
      }
    }

    validatedPrompts.push({
      id: `prompt-${Date.now()}-${i}`,
      text: finalText,
      mood: prompt.mood,
      timestamp: prompt.timestamp,
      timestampSeconds: parseSRTTimestamp(prompt.timestamp) ?? 0,
    });
    previousPrompts.push(finalText);
  }

  return validatedPrompts;
}

// --- Fallback ---

async function executeFallback(
  srtContent: string,
  style: string,
  contentType: "lyrics" | "story",
  videoPurpose: VideoPurpose,
  globalSubject?: string
): Promise<ImagePrompt[]> {
  try {
    console.log(`[Director] Fallback: Using ${contentType === "story" ? "generatePromptsFromStory" : "generatePromptsFromLyrics"}`);
    if (contentType === "story") return await generatePromptsFromStory(srtContent, style, globalSubject, videoPurpose);
    return await generatePromptsFromLyrics(srtContent, style, globalSubject, videoPurpose);
  } catch (fallbackError) {
    logError("fallback", fallbackError, { contentType, style });
    console.error("[Director] Fallback also failed, returning empty array");
    return [];
  }
}

// --- Main Entry Point ---

const isBrowser = typeof window !== "undefined";

export async function generatePromptsWithLangChain(
  srtContent: string,
  style: string,
  contentType: "lyrics" | "story",
  videoPurpose: VideoPurpose,
  globalSubject?: string,
  config?: DirectorConfig
): Promise<ImagePrompt[]> {
  const startTime = Date.now();

  try {
    if (isBrowser) {
      console.log("[Director] Client-side detected, calling server proxy...");
      const response = await fetch('/api/director/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srtContent, style, contentType, videoPurpose, globalSubject, config })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Server director failed: ${response.status}`);
      }

      const data = await response.json();
      return data.prompts;
    }

    console.log("[Director] Starting LangChain workflow (Server)...");
    console.log("[Director] Content type:", contentType);
    console.log("[Director] Style:", style);
    console.log("[Director] Purpose:", videoPurpose);

    if (!srtContent || srtContent.trim().length === 0) {
      console.warn("[Director] Empty SRT content provided, falling back to existing implementation");
      return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
    }

    if (!GEMINI_API_KEY && !VERTEX_PROJECT) {
      console.warn("[Director] API key not configured, falling back to existing implementation");
      logError("initialization", new Error("API key not configured - missing VITE_GEMINI_API_KEY"), { contentType, style });
      return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
    }

    const directorChain = createDirectorChain(contentType, config);

    let result;
    try {
      result = await directorChain.invoke({ content: srtContent, style, videoPurpose, globalSubject: globalSubject || "" });
    } catch (chainError) {
      logError("chain execution", chainError, { contentType, style, videoPurpose, srtContentLength: srtContent.length });
      throw new DirectorServiceError(
        `Chain execution failed: ${chainError instanceof Error ? chainError.message : String(chainError)}`,
        classifyError(chainError),
        "chain",
        chainError instanceof Error ? chainError : undefined
      );
    }

    if (!result || !result.prompts || !Array.isArray(result.prompts)) {
      console.warn("[Director] Invalid result structure, falling back");
      logError("validation", new Error("Invalid result structure"), { resultType: typeof result, hasPrompts: result ? "prompts" in result : false });
      return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
    }

    if (result.prompts.length === 0) {
      console.warn("[Director] No prompts generated, falling back");
      return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
    }

    let validatedPrompts: ImagePrompt[];
    try {
      validatedPrompts = await validateAndLintPrompts(result.prompts, globalSubject, style);
    } catch (validationError) {
      logError("validation", validationError, { promptCount: result.prompts.length });
      validatedPrompts = result.prompts.map((p, i) => ({
        id: `prompt-${Date.now()}-${i}`,
        text: p.text || "",
        mood: p.mood || "neutral",
        timestamp: p.timestamp,
        timestampSeconds: parseSRTTimestamp(p.timestamp) ?? 0,
      }));
    }

    const duration = Date.now() - startTime;
    console.log(`[Director] Workflow complete: ${validatedPrompts.length} prompts generated in ${duration}ms`);
    return validatedPrompts;

  } catch (error) {
    const duration = Date.now() - startTime;
    logError("workflow", error, { contentType, style, videoPurpose, duration, srtContentLength: srtContent?.length || 0 });
    console.log("[Director] Executing fallback to existing prompt generation...");
    return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
  }
}
