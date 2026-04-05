import { GoogleGenAI } from "@google/genai";
import { geminiLogger } from '../infrastructure/logger';

const log = geminiLogger.child('APIClient');

// --- Environment Detection ---
const isBrowser = typeof window !== "undefined";

// --- Configuration ---
// Vertex AI (server-side only)
export const VERTEX_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_GOOGLE_CLOUD_PROJECT || "";
export const VERTEX_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || process.env.VITE_GOOGLE_CLOUD_LOCATION || "global";

// API Key (browser-side, or server fallback)
// Export for LangChain services that need direct API key access
export const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
// Backward compatibility alias
export const API_KEY = GEMINI_API_KEY;

// Debug: Log configuration
if (isBrowser) {
  log.info('Running in browser mode (using proxy)');
} else {
  log.info('Running in server mode');
  log.info(`Vertex AI Project: ${VERTEX_PROJECT || 'NOT SET'}`);
  log.info(`Vertex AI Location: ${VERTEX_LOCATION}`);
}

// Validate configuration based on context
if (!isBrowser && !VERTEX_PROJECT && !GEMINI_API_KEY) {
  log.error(
    'Missing authentication. Set either:\n' +
    '- GOOGLE_CLOUD_PROJECT for Vertex AI (recommended for server)\n' +
    '- VITE_GEMINI_API_KEY for API key auth'
  );
}

/**
 * Model availability in Vertex AI (as of January 2026):
 * ✅ Available: gemini-3-flash-preview, gemini-3.1-pro-preview, veo-3.1-*, imagen-4.0-fast-generate-001
 * ⚠️ Quota needed: veo-*, imagegeneration@006
 * 
 * Note: TTS and Multimodal output supported in Gemini 3.0 and 2.x Flash.
 */
export const MODELS = {
  TEXT: "gemini-3-flash-preview",
  IMAGE: "imagen-4.0-fast-generate-001", // Stable generation model
  VIDEO: "veo-3.1-fast-generate-preview",
  TRANSCRIPTION: "gemini-3-flash-preview",
  TRANSLATION: "gemini-3-flash-preview",
  TTS: "gemini-2.5-flash-preview-tts", // Supports AUDIO output modality

  // Grounded research model (Google Search grounding enabled in researchService)
  TEXT_GROUNDED: "gemini-3-flash-preview",

  // Alternative models
  TEXT_EXP: "gemini-3.1-pro-preview", // Latest reasoning model
  TEXT_LEGACY: "gemini-3.1-pro-preview",
  IMAGE_STANDARD: "imagen-3.0-generate-001",
  IMAGE_HD: "gemini-3.1-pro-preview", // Multimodal image understanding & generation
  VIDEO_STANDARD: "veo-3.1-generate-preview",
  VIDEO_FAST: "veo-3.1-fast-generate-preview",
  VIDEO_LEGACY: "veo-3.1-fast-generate-preview",
};

/**
 * Validates that Vertex AI configuration is properly set up.
 * Throws a descriptive error if configuration is missing.
 */
export function validateVertexConfig(): void {
  if (!VERTEX_PROJECT) {
    throw new Error(
      "Vertex AI not configured. Required setup:\n" +
      "1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install\n" +
      "2. Authenticate: gcloud auth application-default login\n" +
      "3. Set project: export GOOGLE_CLOUD_PROJECT=your-project-id\n" +
      "4. (Optional) Set location: export GOOGLE_CLOUD_LOCATION=global"
    );
  }
}

/**
 * Helper function to handle quota exceeded errors gracefully.
 * Falls back to text model for image/video generation prompts.
 */
export function getModelWithFallback(modelType: keyof typeof MODELS): string {
  const model = MODELS[modelType];

  // For image and video models that might hit quota limits,
  // we can fall back to using the text model for prompt generation
  if (modelType === 'IMAGE' || modelType === 'VIDEO') {
    log.warn(`Using ${model} - may require quota increase for actual generation`);
  }

  return model;
}

// Typed parameter shapes for the two proxy methods
interface GenerateContentParams {
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
}

interface GenerateImagesParams {
  model: string;
  prompt: string;
  config?: Record<string, unknown>;
}

interface ProxyModels {
  generateContent(params: GenerateContentParams): Promise<unknown>;
  generateImages(params: GenerateImagesParams): Promise<unknown>;
}

/** Error subclass that carries the HTTP status from a failed proxy response. */
class ProxyError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProxyError';
    this.status = status;
  }
}

/**
 * Proxy AI Client for Browser
 * Mimics the GoogleGenAI interface but routes requests through the backend proxy.
 */
class ProxyAIClient {
  public readonly models: ProxyModels;

  constructor() {
    this.models = {
      generateContent: (params: GenerateContentParams) =>
        this.callProxy('/api/gemini/proxy/generateContent', params),
      generateImages: (params: GenerateImagesParams) =>
        this.callProxy('/api/gemini/proxy/generateImages', params),
    };
  }

  private async callProxy(endpoint: string, params: unknown): Promise<unknown> {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new ProxyError(
          errorData.error || `Proxy call failed: ${response.status}`,
          response.status,
        );
      }

      return await response.json();
    } catch (error: unknown) {
      log.error(`ProxyAIClient error calling ${endpoint}`, error);
      throw error;
    }
  }
}

/**
 * Initialize GoogleGenAI with hybrid authentication:
 * - Browser: Uses ProxyAIClient to route through backend (no API key needed in client)
 * - Server: Uses Vertex AI ADC (GOOGLE_CLOUD_PROJECT) or falls back to API key
 */
function createAIClient(): GoogleGenAI | ProxyAIClient {
  if (isBrowser) {
    // Browser: Use Proxy Client
    return new ProxyAIClient() as unknown as GoogleGenAI;
  }

  // Re-read environment variables at creation time (for lazy initialization)
  const vertexProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_GOOGLE_CLOUD_PROJECT || "";
  const vertexLocation = process.env.GOOGLE_CLOUD_LOCATION || process.env.VITE_GOOGLE_CLOUD_LOCATION || "global";
  const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";

  // Server: Prefer Vertex AI, fall back to API key
  if (vertexProject) {
    log.info(`Using Vertex AI with project: ${vertexProject}`);
    return new GoogleGenAI({
      vertexai: true,
      project: vertexProject,
      location: vertexLocation,
    });
  }

  if (geminiKey) {
    log.info('Server using API key auth (Vertex AI not configured)');
    return new GoogleGenAI({ apiKey: geminiKey });
  }

  throw new Error(
    "No authentication configured. Set either:\n" +
    "- GOOGLE_CLOUD_PROJECT for Vertex AI\n" +
    "- VITE_GEMINI_API_KEY for API key auth"
  );
}

// Lazy initialization - create client on first access
let _aiClient: GoogleGenAI | null = null;
export const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop: string | symbol) {
    if (!_aiClient) {
      _aiClient = createAIClient() as GoogleGenAI;
    }
    return (_aiClient as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// --- Retry Configuration ---
export interface RetryConfig {
  retries?: number;
  delayMs?: number;
  backoffFactor?: number;
}

// Re-export retry utilities (implementations live in robustUtils.ts)
export { withRetry, getCircuitBreakerStatus, resetCircuitBreaker } from './robustUtils';
