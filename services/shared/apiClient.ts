import { GoogleGenAI } from "@google/genai";

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
  console.log(`[API Client] Running in browser mode (using proxy)`);
} else {
  console.log(`[API Client] Running in server mode`);
  console.log(`[API Client] Vertex AI Project: ${VERTEX_PROJECT || "NOT SET"}`);
  console.log(`[API Client] Vertex AI Location: ${VERTEX_LOCATION}`);
}

// Validate configuration based on context
if (!isBrowser && !VERTEX_PROJECT && !GEMINI_API_KEY) {
  console.error(
    "[API Client] Missing authentication. Set either:\n" +
    "- GOOGLE_CLOUD_PROJECT for Vertex AI (recommended for server)\n" +
    "- VITE_GEMINI_API_KEY for API key auth"
  );
}

/**
 * Model availability in Vertex AI (as of January 2026):
 * ✅ Available: gemini-3-flash-preview, gemini-3-pro-preview, veo-3.1-*, imagen-4.0-fast-generate-001
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

  // Alternative models
  TEXT_EXP: "gemini-3-pro-preview", // Latest reasoning model
  TEXT_LEGACY: "gemini-3-pro-preview",
  IMAGE_STANDARD: "imagen-3.0-generate-001",
  IMAGE_HD: "gemini-3-pro-image-preview", // Multimodal image understanding & generation
  VIDEO_STANDARD: "veo-3.1-generate-preview",
  VIDEO_FAST: "veo-3.1-fast-generate-preview",
  VIDEO_LEGACY: "veo-2.0-generate-001",
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
    console.warn(`[API Client] Using ${model} - may require quota increase for actual generation`);
  }

  return model;
}

/**
 * Proxy AI Client for Browser
 * Mimics the GoogleGenAI interface but routes requests through the backend proxy.
 */
class ProxyAIClient {
  public models: any;

  constructor() {
    this.models = {
      generateContent: async (params: any) => {
        return this.callProxy('/api/gemini/proxy/generateContent', params);
      },
      generateImages: async (params: any) => {
        return this.callProxy('/api/gemini/proxy/generateImages', params);
      }
    };
  }

  private async callProxy(endpoint: string, params: any) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Proxy call failed: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error(`[ProxyAIClient] Error calling ${endpoint}:`, error);
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
    console.log(`[API Client] Using Vertex AI with project: ${vertexProject}`);
    return new GoogleGenAI({
      vertexai: true,
      project: vertexProject,
      location: vertexLocation,
    });
  }

  if (geminiKey) {
    console.log("[API Client] Server using API key auth (Vertex AI not configured)");
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
  get(target, prop) {
    if (!_aiClient) {
      _aiClient = createAIClient() as GoogleGenAI;
    }
    return (_aiClient as any)[prop];
  }
});

// --- Retry Configuration ---
export interface RetryConfig {
  retries?: number;
  delayMs?: number;
  backoffFactor?: number;
}

// --- Circuit Breaker State ---
// Tracks consecutive failures to prevent hammering a failing API
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const CIRCUIT_BREAKER_THRESHOLD = 5; // Trip after 5 consecutive failures
const CIRCUIT_COOLDOWN_MS = 30000; // 30 second cooldown when tripped
const MAX_BACKOFF_MS = 30000; // Cap backoff at 30 seconds

/**
 * Check if the circuit breaker is currently open (blocking requests).
 * @returns Time remaining in ms if open, 0 if closed
 */
export function getCircuitBreakerStatus(): number {
  const now = Date.now();
  if (now < circuitOpenUntil) {
    return circuitOpenUntil - now;
  }
  return 0;
}

/**
 * Reset the circuit breaker (for testing or manual recovery).
 */
export function resetCircuitBreaker(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

/**
 * Retry wrapper for AI calls.
 * Handles transient API failures (503, 429) with exponential backoff.
 * Includes circuit breaker pattern to prevent hammering failing APIs.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000,
  backoffFactor = 2,
): Promise<T> {
  // Check if circuit breaker is open
  const circuitRemaining = getCircuitBreakerStatus();
  if (circuitRemaining > 0) {
    const error = new Error(
      `Circuit breaker is open. API calls blocked for ${Math.ceil(circuitRemaining / 1000)} more seconds. ` +
      `This prevents overwhelming the API after ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures.`
    );
    (error as any).code = "CIRCUIT_BREAKER_OPEN";
    throw error;
  }

  try {
    const result = await fn();
    // Success: reset failure counter
    consecutiveFailures = 0;
    return result;
  } catch (error: any) {
    // Check if this is a retryable error
    // Include 500 (Internal Server Error) as these are often transient on Google's side
    const isRetryable =
      error.status === 500 ||
      error.status === 503 ||
      error.status === 429 ||
      error.message?.includes("INTERNAL") ||
      error.message?.includes("fetch failed");

    if (isRetryable) {
      consecutiveFailures++;

      // Check if we should trip the circuit breaker
      if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
        console.error(
          `[Circuit Breaker] Tripped after ${consecutiveFailures} consecutive failures. ` +
          `Blocking API calls for ${CIRCUIT_COOLDOWN_MS / 1000}s.`
        );
      }

      if (retries > 0) {
        // Cap the delay at MAX_BACKOFF_MS
        const cappedDelay = Math.min(delayMs, MAX_BACKOFF_MS);
        console.warn(
          `API call failed. Retrying in ${cappedDelay}ms... (${retries} attempts left). Error: ${error.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, cappedDelay));
        return withRetry(
          fn,
          retries - 1,
          Math.min(delayMs * backoffFactor, MAX_BACKOFF_MS), // Cap next delay too
          backoffFactor
        );
      }
    }
    throw error;
  }
}
