/**
 * Director Service
 * LangChain-based orchestration for prompt generation using a two-stage pipeline:
 * 1. Analyzer Agent: Interprets content structure, emotional arcs, and key themes
 * 2. Storyboarder Agent: Generates detailed visual prompts based on the analysis
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { z } from "zod";
import { ImagePrompt } from "../types";
import { VideoPurpose, CAMERA_ANGLES, LIGHTING_MOODS } from "../constants";
import { lintPrompt, getPurposeGuidance, getSystemPersona, getStyleEnhancement, generatePromptsFromLyrics, generatePromptsFromStory, refineImagePrompt } from "./promptService";
import { parseSRTTimestamp } from "../utils/srtParser";
import { GEMINI_API_KEY, VERTEX_PROJECT, MODELS } from "./shared/apiClient";

// --- Zod Schemas ---

/**
 * Schema for Analyzer output validation.
 * Defines the structure of content analysis including sections, emotional arc, themes, and motifs.
 */
export const AnalysisSchema = z.object({
  sections: z.array(z.object({
    name: z.string().describe("Section name (e.g., Intro, Verse 1, Chorus)"),
    startTimestamp: z.string().describe("Start timestamp in MM:SS format"),
    endTimestamp: z.string().describe("End timestamp in MM:SS format"),
    type: z.enum(["intro", "verse", "pre-chorus", "chorus", "bridge", "outro", "transition", "key_point", "conclusion"]).describe("Section type"),
    emotionalIntensity: z.number().min(1).max(10).describe("Emotional intensity from 1-10"),
  })).describe("Content sections with timing and emotional intensity"),
  emotionalArc: z.object({
    opening: z.string().describe("Opening emotional state"),
    peak: z.string().describe("Peak emotional moment"),
    resolution: z.string().describe("Resolution emotional state"),
  }).describe("Overall emotional arc of the content"),
  themes: z.array(z.string()).describe("Key visual themes extracted from content"),
  motifs: z.array(z.string()).describe("Recurring visual motifs to maintain consistency"),
  // Concrete motifs for literal visualization (the "candle" fix)
  concreteMotifs: z.array(z.object({
    object: z.string().describe("Physical object mentioned (e.g., 'candle', 'door', 'rain', 'mirror')"),
    timestamp: z.string().describe("When it first appears (MM:SS format)"),
    emotionalContext: z.string().describe("What emotion/meaning it represents"),
  })).describe("CRITICAL: Concrete physical objects from the text that MUST appear LITERALLY in visuals"),
});

export type AnalysisOutput = z.infer<typeof AnalysisSchema>;

/**
 * Schema for Storyboarder output validation.
 * Defines the structure of generated image prompts.
 */
export const StoryboardSchema = z.object({
  prompts: z.array(z.object({
    text: z.string().describe("Detailed visual prompt 60-120 words"),
    mood: z.string().describe("Emotional tone of the scene"),
    timestamp: z.string().describe("Timestamp in MM:SS format"),
  })),
});

export type StoryboardOutput = z.infer<typeof StoryboardSchema>;

// --- Configuration Interface ---

/**
 * Configuration options for the Director Service.
 */
export interface DirectorConfig {
  /** Model name to use (defaults to MODELS.TEXT) */
  model?: string;
  /** Temperature for generation (0-1, defaults to 0.7) */
  temperature?: number;
  /** Maximum retry attempts on failure (defaults to 2) */
  maxRetries?: number;
  /** NEW: Target number of prompts to generate (defaults to 10) */
  targetAssetCount?: number;
}

// --- Default Configuration ---

const DEFAULT_CONFIG: Required<DirectorConfig> = {
  model: MODELS.TEXT,
  temperature: 0.7,
  maxRetries: 2,
  targetAssetCount: 10, // Default fallback if not provided
};

// --- Error Types ---

/**
 * Custom error class for Director Service errors.
 * Provides structured error information for debugging and fallback decisions.
 */
export class DirectorServiceError extends Error {
  public readonly code: DirectorErrorCode;
  public readonly stage: "analyzer" | "storyboarder" | "chain" | "validation" | "unknown";
  public readonly originalError?: Error;

  constructor(
    message: string,
    code: DirectorErrorCode,
    stage: "analyzer" | "storyboarder" | "chain" | "validation" | "unknown",
    originalError?: Error
  ) {
    super(message);
    this.name = "DirectorServiceError";
    this.code = code;
    this.stage = stage;
    this.originalError = originalError;
  }
}

/**
 * Error codes for Director Service failures.
 */
export type DirectorErrorCode =
  | "API_KEY_MISSING"
  | "MODEL_INIT_FAILED"
  | "CHAIN_EXECUTION_FAILED"
  | "OUTPUT_PARSING_FAILED"
  | "SCHEMA_VALIDATION_FAILED"
  | "RATE_LIMIT_EXCEEDED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";


// --- LangChain Verbose Configuration ---

/**
 * Enable verbose mode for LangChain debugging.
 * Only enabled in development environment to avoid leaking sensitive info in production logs.
 */
const LANGCHAIN_VERBOSE = process.env.NODE_ENV === "development";

// --- Model Initialization ---

/**
 * Creates a configured ChatGoogleGenerativeAI model instance.
 * Uses Vertex AI authentication via ADC (Application Default Credentials).
 * The @langchain/google-genai package auto-detects ADC when no apiKey is provided.
 */
function createModel(config: DirectorConfig = {}): ChatGoogleGenerativeAI {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  if (!GEMINI_API_KEY && !VERTEX_PROJECT) {
    throw new DirectorServiceError(
      "Gemini API key is not configured. Set VITE_GEMINI_API_KEY in .env.local",
      "API_KEY_MISSING",
      "chain"
    );
  }

  return new ChatGoogleGenerativeAI({
    apiKey: GEMINI_API_KEY, // Can be empty if using Vertex
    model: mergedConfig.model,
    temperature: mergedConfig.temperature,
    verbose: LANGCHAIN_VERBOSE,
  });
}

// --- Analyzer Agent ---

/**
 * Creates the Analyzer prompt template.
 * Handles both "lyrics" and "story" content types.
 */
function createAnalyzerTemplate(contentType: "lyrics" | "story"): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    ["system", `You are a professional content analyst specializing in ${contentType} analysis.
Your task is to analyze the provided content and identify its structure, emotional arc, themes, motifs, and CONCRETE VISUAL MOTIFS.

CONTENT TYPE: ${contentType}

ANALYSIS REQUIREMENTS:

1. SECTIONS (REQUIRED): Divide the content into logical sections
   - For lyrics: intro, verse, pre-chorus, chorus, bridge, outro
   - For story: intro, key_point, transition, conclusion
   - Each section needs: name, startTimestamp (MM:SS), endTimestamp (MM:SS), type, emotionalIntensity (1-10)

2. EMOTIONAL ARC (REQUIRED): Identify the overall emotional journey
   - opening: The initial emotional state/mood
   - peak: The most intense emotional moment
   - resolution: How the emotion resolves at the end

3. THEMES: Identify 3-6 key visual themes

4. MOTIFS: Identify 2-4 recurring visual motifs for consistency

5. CONCRETE MOTIFS (CRITICAL - THE "CANDLE FIX"):
   Hunt for EVERY physical object mentioned in the text. These MUST be visualized LITERALLY:
   - Objects: candle, door, window, rain, fire, mirror, clock, rose, stars, moon, ocean, etc.
   - Actions: falling, burning, breaking, opening, closing, fading, melting
   - Settings: beach, city, bedroom, forest, rooftop, highway

OUTPUT FORMAT:
Return a valid JSON object (NO markdown code blocks, NO backtick wrapper) with ALL these fields:
- "sections": array of section objects with name, startTimestamp, endTimestamp, type, emotionalIntensity
- "emotionalArc": object with opening, peak, resolution strings
- "themes": array of theme strings
- "motifs": array of motif strings  
- "concreteMotifs": array of objects with object, timestamp, emotionalContext

CRITICAL RULES:
- ALL fields are REQUIRED - sections, emotionalArc, themes, motifs, concreteMotifs
- Timestamps MUST be in MM:SS format (e.g., "01:30")
- Return ONLY the JSON object, no markdown formatting
- If content has no clear sections, create at least one section covering the full duration`],
    ["human", `Analyze this content and return the complete JSON structure with sections, emotionalArc, themes, motifs, and concreteMotifs:

{content}`],
  ]);
}

/**
 * Creates the Analyzer chain that processes content and outputs structured analysis.
 * Uses withStructuredOutput for robust JSON extraction.
 */
export function createAnalyzerChain(contentType: "lyrics" | "story", config?: DirectorConfig) {
  const model = createModel(config).withStructuredOutput(AnalysisSchema, {
    name: "content_analysis",
  });
  const template = createAnalyzerTemplate(contentType);

  return template.pipe(model);
}

/**
 * Runs the Analyzer agent on the provided content.
 */
export async function runAnalyzer(
  content: string,
  contentType: "lyrics" | "story",
  config?: DirectorConfig
): Promise<AnalysisOutput> {
  const chain = createAnalyzerChain(contentType, config);

  try {
    const result = await chain.invoke({
      content,
    });
    return result;
  } catch (error) {
    // If parsing fails, try to extract what we can and provide defaults
    console.warn("[Analyzer] Parsing failed, attempting to provide defaults:", error);

    // Return a minimal valid structure with defaults
    const defaultAnalysis: AnalysisOutput = {
      sections: [{
        name: "Full Content",
        startTimestamp: "00:00",
        endTimestamp: "03:00",
        type: contentType === "lyrics" ? "verse" : "key_point",
        emotionalIntensity: 5,
      }],
      emotionalArc: {
        opening: "Establishing mood",
        peak: "Emotional climax",
        resolution: "Conclusion",
      },
      themes: ["Visual storytelling", "Emotional journey"],
      motifs: ["Light and shadow", "Movement"],
      concreteMotifs: [],
    };

    return defaultAnalysis;
  }
}


// --- Storyboarder Agent ---

/**
 * Creates the Storyboarder prompt template.
 * Generates detailed visual prompts based on the Analyzer's output and persona rules.
 */
function createStoryboarderTemplate(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    ["system", `{personaInstructions}

ART STYLE: {style}
{styleEnhancement}

{purposeGuidance}

GLOBAL SUBJECT: {globalSubject}
{subjectGuidance}

CRITICAL: If a GLOBAL SUBJECT is provided, you MUST use it as the main subject in almost every scene. Don't wander away from the subject.

CONCRETE MOTIFS (MUST INCLUDE LITERALLY):
{concreteMotifs}

CRITICAL RULE - METAPHOR LITERALISM:
For each concrete motif listed above, you MUST show the actual physical object.
- If lyrics say "candle" → show a real candle
- If lyrics say "door closing" → show a door physically closing
- If lyrics say "rain" → show actual rain falling
Do NOT replace concrete objects with abstract interpretations.
Do NOT show "sad person" when lyrics mention "candle".
The object IS the metaphor. Show the object itself.

AVAILABLE CAMERA ANGLES: {cameraAngles}
AVAILABLE LIGHTING MOODS: {lightingMoods}

CONTENT ANALYSIS:
{analysis}

PROMPT WRITING RULES:
1. EVERY prompt MUST begin with a concrete subject noun (e.g., "A lone figure...", "A vintage car...", "A glowing orb...", "Weathered hands...")
2. Each prompt must be 60-120 words with SPECIFIC visual details
3. MANDATORY CHECKLIST for each prompt (include ALL of these):
   - Subject: WHO or WHAT is in the scene (concrete noun, not abstract)
   - Action/Pose: What the subject is doing
   - Setting: WHERE the scene takes place
   - Lighting: Type and quality (e.g., "golden hour backlighting", "harsh overhead fluorescent", "soft diffused window light")
   - Texture: At least one tactile detail (e.g., "weathered wood grain", "rain-slicked asphalt", "velvet fabric")
    - Camera: Shot type and angle (e.g., "extreme close-up at eye level", "wide establishing shot from low angle")
    - Atmosphere: Mood and ambient details
 4. NEVER include text, titles, lyrics, subtitles, captions, labels, typography, written words, or UI elements inside the image - this is a CRITICAL requirement
 5. NO generic phrases like "beautiful", "stunning", "amazing" - be SPECIFIC with descriptors
 6. Reference the main subject by their specific features, not just "the subject"
 7. Vary compositions: rule-of-thirds, centered, symmetrical, asymmetrical
 8. NEVER repeat the same camera angle in consecutive scenes
 9. INCLUDE at least one concrete motif from the list in each relevant scene
11. SUBJECT CONSISTENCY: The GLOBAL SUBJECT takes priority. If a subject is specified, it MUST be the focus of at least 80% of the scenes.

- Instead, use visual metaphors: glass breaking, door closing, wilting flower, fading photograph

EMOTIONAL ARC GUIDANCE:
- Opening scenes: Establish mood and setting (wide shots, context)
- Building scenes: Increase intensity (medium shots, character focus)
- Peak scenes: Maximum emotion (dynamic angles, close-ups, action)
- Resolution scenes: Wind down (pull back, contemplative)

CRITICAL REQUIREMENT: You MUST generate EXACTLY {targetAssetCount} prompts. Not 7, not 6, but exactly {targetAssetCount} prompts that follow the emotional arc from the analysis.

OUTPUT FORMAT:
Return a valid JSON object (no markdown code blocks) with a "prompts" array containing exactly {targetAssetCount} objects.
Each prompt object must have:
- "text": detailed visual prompt (60-120 words) starting with a concrete subject
- "mood": emotional tone of the scene
- "timestamp": timestamp in MM:SS format when this specific scene should occur. Distribute prompts logically across the content duration.`],
    ["human", `Create the visual storyboard based on the analysis provided. Remember to generate exactly {targetAssetCount} prompts that follow the persona rules and include the concrete motifs literally.`],
  ]);
}

/**
 * Creates the Storyboarder chain that generates image prompts from analysis.
 * Uses withStructuredOutput for robust JSON extraction.
 */
export function createStoryboarderChain(config?: DirectorConfig) {
  const model = createModel(config).withStructuredOutput(StoryboardSchema, {
    name: "storyboard",
  });
  const template = createStoryboarderTemplate();

  return template.pipe(model);
}

/**
 * Runs the Storyboarder agent on the provided analysis.
 */
export async function runStoryboarder(
  analysis: AnalysisOutput,
  style: string,
  videoPurpose: VideoPurpose,
  globalSubject: string = "",
  config?: DirectorConfig
): Promise<StoryboardOutput> {
  const targetAssetCount = config?.targetAssetCount || 10;
  const chain = createStoryboarderChain(config);

  // Get persona for this video purpose
  const persona = getSystemPersona(videoPurpose);
  const personaInstructions = `You are ${persona.name}, a ${persona.role}.

YOUR CORE RULE:
${persona.coreRule}

YOUR VISUAL PRINCIPLES:
${persona.visualPrinciples.map(p => `- ${p}`).join('\n')}

WHAT TO AVOID:
${persona.avoidList.map(a => `- ${a}`).join('\n')}`;

  // Get style enhancement
  const styleData = getStyleEnhancement(style);
  const styleEnhancement = `MEDIUM AUTHENTICITY (apply these characteristics):
${styleData.keywords.map(k => `- ${k}`).join('\n')}
Overall: ${styleData.mediumDescription}`;

  // Get purpose guidance
  const purposeGuidance = getPurposeGuidance(videoPurpose);
  const subjectGuidance = globalSubject.trim()
    ? `Keep this subject's appearance consistent across scenes.`
    : `Create cohesive scenes with consistent environmental elements.`;

  // Format concrete motifs from analysis
  const concreteMotifs = analysis.concreteMotifs && analysis.concreteMotifs.length > 0
    ? analysis.concreteMotifs.map(m => `- "${m.object}" (at ${m.timestamp}): ${m.emotionalContext}`).join('\n')
    : "No specific objects mentioned - create appropriate visual elements based on themes.";

  const result = await chain.invoke({
    style,
    personaInstructions,
    styleEnhancement,
    purposeGuidance,
    globalSubject: globalSubject || "None specified",
    subjectGuidance,
    concreteMotifs,
    cameraAngles: CAMERA_ANGLES.join(", "),
    lightingMoods: LIGHTING_MOODS.join(", "),
    analysis: JSON.stringify(analysis, null, 2),
    targetAssetCount,
  });

  return result;
}

/**
 * Progress callback for streaming storyboard generation.
 */
export type StoryboardProgressCallback = (progress: {
  stage: "generating" | "complete";
  partialResult?: Partial<StoryboardOutput>;
  finalResult?: StoryboardOutput;
}) => void;

/**
 * Streams storyboard generation with progress callbacks.
 * Uses LangChain streaming for better UX on long-running generations.
 *
 * @param analysis - The content analysis from the analyzer
 * @param style - Visual style for the storyboard
 * @param videoPurpose - The purpose/type of video
 * @param globalSubject - Optional consistent subject across scenes
 * @param onProgress - Callback for progress updates
 * @param config - Optional configuration overrides
 * @returns The final storyboard output
 */
export async function streamStoryboarder(
  analysis: AnalysisOutput,
  style: string,
  videoPurpose: VideoPurpose,
  globalSubject: string = "",
  onProgress?: StoryboardProgressCallback,
  config?: DirectorConfig
): Promise<StoryboardOutput> {
  const targetAssetCount = config?.targetAssetCount || 10;
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Create model without structured output for streaming raw content
  const model = new ChatGoogleGenerativeAI({
    apiKey: GEMINI_API_KEY,
    model: mergedConfig.model,
    temperature: mergedConfig.temperature,
    verbose: LANGCHAIN_VERBOSE,
  });

  const template = createStoryboarderTemplate();
  const chain = template.pipe(model);

  // Get persona for this video purpose
  const persona = getSystemPersona(videoPurpose);
  const personaInstructions = `You are ${persona.name}, a ${persona.role}.

YOUR CORE RULE:
${persona.coreRule}

YOUR VISUAL PRINCIPLES:
${persona.visualPrinciples.map(p => `- ${p}`).join('\n')}

WHAT TO AVOID:
${persona.avoidList.map(a => `- ${a}`).join('\n')}`;

  // Get style enhancement
  const styleData = getStyleEnhancement(style);
  const styleEnhancement = `MEDIUM AUTHENTICITY (apply these characteristics):
${styleData.keywords.map(k => `- ${k}`).join('\n')}
Overall: ${styleData.mediumDescription}`;

  // Get purpose guidance
  const purposeGuidance = getPurposeGuidance(videoPurpose);
  const subjectGuidance = globalSubject.trim()
    ? `Keep this subject's appearance consistent across scenes.`
    : `Create cohesive scenes with consistent environmental elements.`;

  // Format concrete motifs from analysis
  const concreteMotifs = analysis.concreteMotifs && analysis.concreteMotifs.length > 0
    ? analysis.concreteMotifs.map(m => `- "${m.object}" (at ${m.timestamp}): ${m.emotionalContext}`).join('\n')
    : "No specific objects mentioned - create appropriate visual elements based on themes.";

  const input = {
    style,
    personaInstructions,
    styleEnhancement,
    purposeGuidance,
    globalSubject: globalSubject || "None specified",
    subjectGuidance,
    concreteMotifs,
    cameraAngles: CAMERA_ANGLES.join(", "),
    lightingMoods: LIGHTING_MOODS.join(", "),
    analysis: JSON.stringify(analysis, null, 2),
    targetAssetCount,
  };

  // Stream the response
  let fullContent = "";

  onProgress?.({ stage: "generating" });

  for await (const chunk of await chain.stream(input)) {
    // Extract content from the chunk
    const content = typeof chunk.content === "string"
      ? chunk.content
      : Array.isArray(chunk.content)
        ? chunk.content.map(c => typeof c === "string" ? c : "").join("")
        : "";

    fullContent += content;

    // Try to parse partial JSON for progress updates
    try {
      // Attempt to extract any complete prompts from partial JSON
      const promptMatches = fullContent.match(/"text"\s*:\s*"[^"]+"/g);
      if (promptMatches && promptMatches.length > 0) {
        onProgress?.({
          stage: "generating",
          partialResult: {
            prompts: promptMatches.map(() => ({
              text: "...",
              mood: "...",
              timestamp: "...",
            })).slice(0, promptMatches.length),
          },
        });
      }
    } catch {
      // Ignore partial parsing errors
    }
  }

  // Parse the final result
  try {
    // Clean up the content for JSON parsing
    let jsonStr = fullContent.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);
    const result = StoryboardSchema.parse(parsed);

    onProgress?.({ stage: "complete", finalResult: result });

    return result;
  } catch (error) {
    console.error("[Storyboarder Stream] Failed to parse final result:", error);
    console.error("[Storyboarder Stream] Raw content:", fullContent);
    throw new DirectorServiceError(
      `Failed to parse storyboard output: ${error instanceof Error ? error.message : String(error)}`,
      "OUTPUT_PARSING_FAILED",
      "storyboarder"
    );
  }
}


// --- LCEL Director Chain Composition ---

/**
 * Creates the complete Director chain using LCEL.
 * Chains Analyzer → Storyboarder in a single pipeline.
 */
export function createDirectorChain(
  contentType: "lyrics" | "story",
  config?: DirectorConfig
) {
  const analyzerChain = createAnalyzerChain(contentType, config);
  const storyboarderChain = createStoryboarderChain(config);

  return RunnableSequence.from([
    // Stage 1: Analyze content
    async (input: {
      content: string;
      style: string;
      videoPurpose: VideoPurpose;
      globalSubject: string;
    }) => {
      const analysis = await analyzerChain.invoke({ content: input.content });
      console.log("[Director] Analysis complete:", JSON.stringify(analysis, null, 2));

      return {
        analysis,
        style: input.style,
        videoPurpose: input.videoPurpose,
        globalSubject: input.globalSubject,
      };
    },
    // Stage 2: Generate storyboard with persona and style enhancements
    async (input: {
      analysis: AnalysisOutput;
      style: string;
      videoPurpose: VideoPurpose;
      globalSubject: string;
    }) => {
      // Get persona for this video purpose
      const persona = getSystemPersona(input.videoPurpose);
      const personaInstructions = `You are ${persona.name}, a ${persona.role}.

YOUR CORE RULE:
${persona.coreRule}

YOUR VISUAL PRINCIPLES:
${persona.visualPrinciples.map(p => `- ${p}`).join('\n')}

WHAT TO AVOID:
${persona.avoidList.map(a => `- ${a}`).join('\n')}`;

      // Get style enhancement
      const styleData = getStyleEnhancement(input.style);
      const styleEnhancement = `MEDIUM AUTHENTICITY (apply these characteristics):
${styleData.keywords.map(k => `- ${k}`).join('\n')}
Overall: ${styleData.mediumDescription}`;

      const purposeGuidance = getPurposeGuidance(input.videoPurpose);
      const subjectGuidance = input.globalSubject.trim()
        ? `Keep this subject's appearance consistent across scenes.`
        : `Create cohesive scenes with consistent environmental elements.`;

      // Format concrete motifs from analysis
      const concreteMotifs = input.analysis.concreteMotifs && input.analysis.concreteMotifs.length > 0
        ? input.analysis.concreteMotifs.map(m => `- "${m.object}" (at ${m.timestamp}): ${m.emotionalContext}`).join('\n')
        : "No specific objects mentioned - create appropriate visual elements based on themes.";

      const targetAssetCount = config?.targetAssetCount || 10;
      const result = await storyboarderChain.invoke({
        style: input.style,
        personaInstructions,
        styleEnhancement,
        purposeGuidance,
        globalSubject: input.globalSubject || "None specified",
        subjectGuidance,
        concreteMotifs,
        cameraAngles: CAMERA_ANGLES.join(", "),
        lightingMoods: LIGHTING_MOODS.join(", "),
        analysis: JSON.stringify(input.analysis, null, 2),
        targetAssetCount,
      });

      console.log("[Director] Storyboard complete:", result.prompts?.length, "prompts generated");
      return result;
    },
  ]);
}

// --- Lint Validation ---

/**
 * Classifies an error and returns the appropriate DirectorErrorCode.
 */
function classifyError(error: unknown): DirectorErrorCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Authentication issues (API key or ADC/Vertex AI)
    if (message.includes("api key") || message.includes("apikey") || message.includes("unauthorized") ||
      message.includes("credentials") || message.includes("authentication") || message.includes("adc")) {
      return "API_KEY_MISSING";
    }

    // Rate limiting
    if (message.includes("rate limit") || message.includes("quota") || message.includes("429")) {
      return "RATE_LIMIT_EXCEEDED";
    }

    // Network errors
    if (message.includes("network") || message.includes("fetch") || message.includes("econnrefused") || message.includes("enotfound")) {
      return "NETWORK_ERROR";
    }

    // Timeout
    if (message.includes("timeout") || message.includes("timed out")) {
      return "TIMEOUT";
    }

    // Parsing errors
    if (message.includes("parse") || message.includes("json") || message.includes("unexpected token")) {
      return "OUTPUT_PARSING_FAILED";
    }

    // Validation errors
    if (message.includes("validation") || message.includes("schema") || message.includes("zod")) {
      return "SCHEMA_VALIDATION_FAILED";
    }

    // Model initialization
    if (message.includes("model") && (message.includes("init") || message.includes("create"))) {
      return "MODEL_INIT_FAILED";
    }
  }

  return "UNKNOWN_ERROR";
}

/**
 * Logs error details for debugging purposes.
 */
function logError(
  stage: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errorCode = classifyError(error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error(`[Director] Error in ${stage}:`);
  console.error(`  Code: ${errorCode}`);
  console.error(`  Message: ${errorMessage}`);
  if (context) {
    console.error(`  Context:`, JSON.stringify(context, null, 2));
  }
  if (errorStack) {
    console.error(`  Stack: ${errorStack}`);
  }
}

/**
 * Validates and optionally refines generated prompts using lintPrompt.
 * When critical issues (too_short, missing_subject) are detected, attempts refinement.
 */
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

    // Run lint validation
    const issues = lintPrompt({
      promptText: prompt.text,
      globalSubject,
      previousPrompts,
    });

    // Log any warnings
    if (issues.length > 0) {
      console.log(`[Director] Lint issues for prompt ${i + 1}:`, issues.map(issue => issue.code).join(", "));
    }

    // Check for critical issues that need refinement
    const criticalIssues = issues.filter(
      issue => issue.code === "too_short" || issue.code === "missing_subject"
    );
    const hasCriticalIssues = criticalIssues.length > 0;

    let finalText = prompt.text;

    // Attempt refinement for critical issues
    if (hasCriticalIssues) {
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

        // Re-lint the refined prompt to verify improvement
        const postRefinementIssues = lintPrompt({
          promptText: finalText,
          globalSubject,
          previousPrompts,
        });

        const stillHasCriticalIssues = postRefinementIssues.some(
          issue => issue.code === "too_short" || issue.code === "missing_subject"
        );

        if (stillHasCriticalIssues) {
          console.log(`[Director] Prompt ${i + 1} still has critical issues after refinement`);
        }
      } catch (refinementError) {
        console.error(`[Director] Refinement failed for prompt ${i + 1}:`, refinementError);
        // Keep original text if refinement fails
      }
    }

    // Create ImagePrompt object
    const imagePrompt: ImagePrompt = {
      id: `prompt-${Date.now()}-${i}`,
      text: finalText,
      mood: prompt.mood,
      timestamp: prompt.timestamp,
      timestampSeconds: parseSRTTimestamp(prompt.timestamp) ?? 0,
    };

    validatedPrompts.push(imagePrompt);
    previousPrompts.push(finalText);
  }

  return validatedPrompts;
}

// --- Main Export Function ---

const isBrowser = typeof window !== "undefined";

/**
 * Generates image prompts using the LangChain Director workflow.
 * 
 * This function orchestrates a two-stage AI pipeline:
 * 1. Analyzer: Interprets content structure and emotional arcs
 * 2. Storyboarder: Generates detailed visual prompts
 * 
 * Falls back to existing prompt generation on errors.
 * 
 * @param srtContent - The SRT content to analyze
 * @param style - Art style preset for generation
 * @param contentType - "lyrics" or "story"
 * @param videoPurpose - Purpose of the video (affects visual style)
 * @param globalSubject - Optional consistent subject across scenes
 * @param config - Optional configuration overrides
 * @returns Array of ImagePrompt objects
 */
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
    // Client-side: Offload to server
    if (isBrowser) {
      console.log("[Director] Client-side detected, calling server proxy...");
      const response = await fetch('/api/director/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srtContent,
          style,
          contentType,
          videoPurpose,
          globalSubject,
          config
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Server director failed: ${response.status}`);
      }

      const data = await response.json();
      return data.prompts;
    }

    // Server-side: Run logic directly
    console.log("[Director] Starting LangChain workflow (Server)...");
    console.log("[Director] Content type:", contentType);
    console.log("[Director] Style:", style);
    console.log("[Director] Purpose:", videoPurpose);

    // Validate inputs before proceeding
    if (!srtContent || srtContent.trim().length === 0) {
      console.warn("[Director] Empty SRT content provided, falling back to existing implementation");
      return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
    }

    // Check for API key configuration (Server-side check)
    if (!GEMINI_API_KEY && !VERTEX_PROJECT) {
      console.warn("[Director] API key not configured, falling back to existing implementation");
      logError("initialization", new Error("API key not configured - missing VITE_GEMINI_API_KEY"), {
        contentType,
        style
      });
      return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
    }

    // Create and run the director chain
    const directorChain = createDirectorChain(contentType, config);

    let result;
    try {
      result = await directorChain.invoke({
        content: srtContent,
        style,
        videoPurpose,
        globalSubject: globalSubject || "",
      });
    } catch (chainError) {
      // Log the chain execution error
      logError("chain execution", chainError, {
        contentType,
        style,
        videoPurpose,
        srtContentLength: srtContent.length,
      });

      // Throw a structured error for the outer catch to handle
      throw new DirectorServiceError(
        `Chain execution failed: ${chainError instanceof Error ? chainError.message : String(chainError)}`,
        classifyError(chainError),
        "chain",
        chainError instanceof Error ? chainError : undefined
      );
    }

    // Validate the result structure
    if (!result || !result.prompts || !Array.isArray(result.prompts)) {
      console.warn("[Director] Invalid result structure, falling back");
      logError("validation", new Error("Invalid result structure"), {
        resultType: typeof result,
        hasPrompts: result ? "prompts" in result : false,
      });
      return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
    }

    // Check if we got any prompts
    if (result.prompts.length === 0) {
      console.warn("[Director] No prompts generated, falling back");
      return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
    }

    // Validate and lint the generated prompts
    let validatedPrompts: ImagePrompt[];
    try {
      validatedPrompts = await validateAndLintPrompts(
        result.prompts,
        globalSubject,
        style
      );
    } catch (validationError) {
      logError("validation", validationError, {
        promptCount: result.prompts.length,
      });

      // If validation fails, still try to return the raw prompts with basic transformation
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

    // Log the error with full context
    logError("workflow", error, {
      contentType,
      style,
      videoPurpose,
      duration,
      srtContentLength: srtContent?.length || 0,
    });

    // Execute fallback
    console.log("[Director] Executing fallback to existing prompt generation...");
    return executeFallback(srtContent, style, contentType, videoPurpose, globalSubject);
  }
}

/**
 * Executes the fallback to existing prompt generation functions.
 * This is called when the LangChain workflow fails or encounters errors.
 * 
 * @param srtContent - The SRT content to process
 * @param style - Art style preset
 * @param contentType - "lyrics" or "story"
 * @param videoPurpose - Purpose of the video
 * @param globalSubject - Optional consistent subject
 * @returns Array of ImagePrompt objects from fallback implementation
 */
async function executeFallback(
  srtContent: string,
  style: string,
  contentType: "lyrics" | "story",
  videoPurpose: VideoPurpose,
  globalSubject?: string
): Promise<ImagePrompt[]> {
  try {
    console.log(`[Director] Fallback: Using ${contentType === "story" ? "generatePromptsFromStory" : "generatePromptsFromLyrics"}`);

    if (contentType === "story") {
      return await generatePromptsFromStory(srtContent, style, globalSubject, videoPurpose);
    }
    return await generatePromptsFromLyrics(srtContent, style, globalSubject, videoPurpose);
  } catch (fallbackError) {
    // If even the fallback fails, log and return empty array
    logError("fallback", fallbackError, {
      contentType,
      style,
    });
    console.error("[Director] Fallback also failed, returning empty array");
    return [];
  }
}
