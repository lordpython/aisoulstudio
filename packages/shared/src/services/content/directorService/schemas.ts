/**
 * Director Service — Zod schemas, types, error classes, and model factory
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { GEMINI_API_KEY, VERTEX_PROJECT, MODELS } from "../../shared/apiClient";

// --- Zod Schemas ---

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
  visualScenes: z.array(z.object({
    visualPrompt: z.string().describe("Full Midjourney-style image prompt (60-100 words) with subject, lighting, composition, atmosphere"),
    subjectContext: z.string().describe("Who/what this scene depicts and its narrative significance"),
    timestamp: z.string().describe("When this scene should appear (MM:SS format)"),
    emotionalTone: z.string().describe("Single word emotional tone (e.g., 'reverent', 'anguished', 'triumphant')"),
  })).describe("CRITICAL: Art-directed visual scenes with full cinematic prompts ready for image generation"),
});

export type AnalysisOutput = z.infer<typeof AnalysisSchema>;

export const StoryboardSchema = z.object({
  prompts: z.array(z.object({
    text: z.string()
      .min(200, "Visual prompt must be at least 200 characters (approximately 40 words)")
      .describe("REQUIRED: Complete visual scene description, MINIMUM 60 words."),
    mood: z.string().describe("Emotional tone of the scene"),
    timestamp: z.string().describe("Timestamp in MM:SS format"),
    negativePrompt: z.string().optional().describe("Elements to avoid in this specific scene"),
  })),
  globalNegativePrompt: z.string().optional().describe("Negative prompt applied to ALL scenes"),
});

export type StoryboardOutput = z.infer<typeof StoryboardSchema>;

// --- Configuration ---

export interface DirectorConfig {
  model?: string;
  temperature?: number;
  maxRetries?: number;
  targetAssetCount?: number;
}

export const DEFAULT_CONFIG: Required<DirectorConfig> = {
  model: MODELS.TEXT,
  temperature: 0.7,
  maxRetries: 2,
  targetAssetCount: 10,
};

// --- Error Types ---

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

// --- LangChain Verbose Configuration ---

export const LANGCHAIN_VERBOSE = process.env.NODE_ENV === "development";

// --- Model Factory ---

export function createModel(config: DirectorConfig = {}): ChatGoogleGenerativeAI {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  if (!GEMINI_API_KEY && !VERTEX_PROJECT) {
    throw new DirectorServiceError(
      "Gemini API key is not configured. Set VITE_GEMINI_API_KEY in .env.local",
      "API_KEY_MISSING",
      "chain"
    );
  }

  return new ChatGoogleGenerativeAI({
    apiKey: GEMINI_API_KEY,
    model: mergedConfig.model,
    temperature: mergedConfig.temperature,
    maxOutputTokens: 65536,
    verbose: LANGCHAIN_VERBOSE,
  });
}
