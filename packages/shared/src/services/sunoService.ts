/**
 * Suno API Service
 * 
 * Integrates with Suno API for AI-powered music generation.
 * https://api.sunoapi.org/api/v1
 */

import type { SubtitleItem } from "../types";

// --- Configuration ---
const SUNO_API_BASE = "https://api.sunoapi.org/api/v1";

// --- Rate Limiter ---

/**
 * Simple rate limiter for Suno API.
 * Enforces 20 requests per 10 seconds limit as per API documentation.
 * Implements a sliding window algorithm to track request timestamps.
 */
class SunoRateLimiter {
  private requestTimestamps: number[] = [];
  private readonly maxRequests = 20;
  private readonly windowMs = 10000; // 10 seconds

  /**
   * Wait for an available request slot.
   * If the rate limit is reached, waits until a slot becomes available.
   * 
   * @returns Promise that resolves when a request slot is available
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Remove timestamps outside the sliding window
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < this.windowMs
    );

    // If at capacity, wait for the oldest request to expire
    if (this.requestTimestamps.length >= this.maxRequests) {
      const oldestTimestamp = this.requestTimestamps[0]!;
      const waitTime = this.windowMs - (now - oldestTimestamp) + 10; // +10ms buffer

      if (waitTime > 0) {
        console.log(`[Suno] Rate limit reached, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Clean up again after waiting
        const newNow = Date.now();
        this.requestTimestamps = this.requestTimestamps.filter(
          ts => newNow - ts < this.windowMs
        );
      }
    }

    // Record this request
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Get the current number of requests in the sliding window.
   * Useful for debugging and monitoring.
   */
  getCurrentRequestCount(): number {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < this.windowMs
    );
    return this.requestTimestamps.length;
  }

  /**
   * Reset the rate limiter state.
   * Useful for testing.
   */
  reset(): void {
    this.requestTimestamps = [];
  }
}

// Singleton instance of the rate limiter
const rateLimiter = new SunoRateLimiter();

// Export for testing
export { SunoRateLimiter, rateLimiter };

// Export status helper functions for testing
export { mapToSunoTaskStatus, isFailedStatus, isIntermediateStatus };

/**
 * Get Suno API key from environment variables.
 * Follows the same pattern as freesoundService.
 */
const getSunoApiKey = (): string => {
  // Try Vite's import.meta.env first (browser)
  if (typeof window !== "undefined") {
    // @ts-ignore - Vite injects this at build time
    const viteEnv = (import.meta as any).env;
    if (viteEnv?.VITE_SUNO_API_KEY) {
      return viteEnv.VITE_SUNO_API_KEY;
    }
  }
  // Fallback to process.env (Node.js/SSR)
  return process.env.VITE_SUNO_API_KEY || "";
};

const SUNO_API_KEY = getSunoApiKey();

// Debug log (without exposing the key)
const isBrowser = typeof window !== "undefined";
if (isBrowser) {
  console.log(`[Suno] API Key configured: ${SUNO_API_KEY ? "YES" : "NO"}`);
}

// --- Helper: Call Backend Proxy ---

// Use backend proxy to bypass CORS
// @ts-ignore - Vite injects this at build time
const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || "http://localhost:3001";

async function callSunoProxy(endpoint: string, body?: any, method: string = "POST"): Promise<any> {
  // Wait for rate limiter slot before making request
  await rateLimiter.waitForSlot();

  const fetchOptions: any = {
    method: method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (method !== "GET" && method !== "HEAD") {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${SERVER_URL}/api/suno/proxy/${endpoint}`, fetchOptions);

  const data = await response.json();

  // Enhanced error handling based on error codes
  if (!response.ok || (data.code && data.code !== 200)) {
    const errorCode = data.code || response.status;
    const errorMessage = data.msg || data.error || data.message || `Suno API error: ${endpoint}`;

    // Use the error mapping helper function
    throw mapErrorCodeToError(errorCode, endpoint, errorMessage);
  }

  // For generate endpoint, return taskId; for other endpoints, return full data
  if (endpoint === "generate" && data.data?.taskId) {
    return data.data.taskId;
  }
  return data.data || data; // Return data.data if exists, otherwise full response
}

// --- Types ---

/**
 * Suno AI model versions.
 * V5 is the latest and highest quality.
 */
export type SunoModel = "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5";

/**
 * Status of a Suno generation task.
 * Extended to include all documented statuses from the Suno API.
 */
export type SunoTaskStatus =
  | "PENDING"
  | "PROCESSING"
  | "TEXT_SUCCESS"
  | "FIRST_SUCCESS"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_AUDIO_FAILED"
  | "CALLBACK_EXCEPTION"
  | "SENSITIVE_WORD_ERROR"
  | "FAILED";

/**
 * Configuration for extending an existing music track.
 * Used with the extend endpoint.
 */
export interface SunoExtendConfig {
  /** Task ID of the original generation */
  taskId: string;
  /** Audio ID of the track to extend */
  audioId: string;
  /** Lyrics or prompt for the extension */
  prompt?: string;
  /** Music style/genre for the extension */
  style?: string;
  /** Title for the extended track */
  title?: string;
  /** Time in seconds to continue from */
  continueAt: number;
  /** AI model version */
  model?: SunoModel;
  /** Optional webhook URL for status updates */
  callBackUrl?: string;
}

/**
 * Configuration for upload-based operations (upload-and-extend, upload-and-cover).
 * Extends SunoGenerationConfig with upload-specific fields.
 */
export interface SunoUploadConfig extends SunoGenerationConfig {
  /** URL of the uploaded audio file */
  uploadUrl: string;
  /** Time in seconds to continue from (for upload-and-extend) */
  continueAt?: number;
  /** Use default parameters flag for custom parameter mode */
  defaultParamFlag?: boolean;
}

/**
 * Configuration for persona generation.
 * Used to create personalized music styles.
 */
export interface SunoPersonaConfig {
  /** Name of the persona */
  name: string;
  /** Description of the persona's characteristics */
  description: string;
  /** Music style associated with the persona */
  style: string;
  /** Optional webhook URL for status updates */
  callBackUrl?: string;
}

/**
 * Result of vocal/instrumental stem separation.
 */
export interface SunoStemSeparationResult {
  /** Task identifier */
  taskId: string;
  /** Current status */
  status: SunoTaskStatus;
  /** URL to the separated vocals track */
  vocalsUrl?: string;
  /** URL to the separated instrumental track */
  instrumentalUrl?: string;
  /** Error message (available when status is FAILED) */
  errorMessage?: string;
}

/**
 * Configuration for music generation request.
 */
export interface SunoGenerationConfig {
  /** Topic or lyrics prompt (required) */
  prompt: string;
  /** Song title (optional) */
  title?: string;
  /** Music style/genre (e.g., "Pop, Upbeat") */
  style?: string;
  /** Generate instrumental only (no vocals) */
  instrumental?: boolean;
  /** AI model version (default: V5) */
  model?: SunoModel;
  /** Vocal gender: 'm' for male, 'f' for female */
  vocalGender?: "m" | "f";
  /** Comma-separated styles to exclude (e.g., "Heavy Metal, Screaming") */
  negativeTags?: string;
  /** Style influence strength (0-1, default: 0.65) */
  styleWeight?: number;
  /** Creative variation (0-1, default: 0.5) */
  weirdnessConstraint?: number;
  /** Audio quality weight (0-1, default: 0.65) */
  audioWeight?: number;
  /** Optional webhook URL for status updates */
  callBackUrl?: string;
  /** Enable Custom Mode (advanced settings) - defaults to true if style/title provided */
  customMode?: boolean;
  /** Persona ID to apply specific style (Custom Mode only) */
  personaId?: string;
}

/**
 * A single generated music track from Suno.
 */
export interface SunoGeneratedTrack {
  /** Suno's audio ID */
  id: string;
  /** Generated or user-provided title */
  title: string;
  /** URL to the MP3 file */
  audio_url: string;
  /** Duration in seconds */
  duration: number;
  /** Style used for generation */
  style?: string;
  /** Lyrics if vocal track */
  lyrics?: string;
}

/**
 * Result of a music generation task.
 */
export interface SunoTaskResult {
  /** Task identifier */
  taskId: string;
  /** Current status */
  status: SunoTaskStatus;
  /** Generated tracks (available when status is SUCCESS) */
  tracks?: SunoGeneratedTrack[];
  /** Error message (available when status is FAILED) */
  errorMessage?: string;
  /** Error code from API (available when status is FAILED) */
  errorCode?: number;
}

/**
 * Full track data from API response.
 */
export interface SunoTrackData {
  /** Suno's audio ID */
  id: string;
  /** URL to the MP3 file */
  audioUrl: string;
  /** URL to the streaming audio */
  streamAudioUrl: string;
  /** URL to the cover image */
  imageUrl: string;
  /** Prompt/lyrics used for generation */
  prompt: string;
  /** Model name used for generation */
  modelName: string;
  /** Generated or user-provided title */
  title: string;
  /** Style tags */
  tags: string;
  /** Creation timestamp */
  createTime: string;
  /** Duration in seconds */
  duration: number;
  /** Track status */
  status: string;
  /** Track type */
  type: string;
  /** Error code if failed */
  errorCode?: number;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Detailed task result with full API response fields.
 * Extends SunoTaskResult with additional metadata.
 */
export interface SunoDetailedTaskResult extends SunoTaskResult {
  /** Parent music ID if this is an extension/cover */
  parentMusicId?: string;
  /** Original request parameters */
  param?: Record<string, any>;
  /** Full API response data */
  response?: {
    taskId: string;
    sunoData: SunoTrackData[];
  };
  /** Task type (e.g., "generate", "extend", "cover") */
  type?: string;
  /** Error code from API */
  errorCode?: number;
}

/**
 * Result of a lyrics generation task.
 */
export interface SunoLyricsResult {
  /** Task identifier */
  taskId: string;
  /** Current status */
  status: SunoTaskStatus;
  /** Generated song title */
  title?: string;
  /** Generated lyrics text */
  text?: string;
  /** Error message (available when status is FAILED) */
  errorMessage?: string;
}

/**
 * Suno API credits balance.
 */
export interface SunoCredits {
  /** Remaining credits */
  credits: number;
}

// --- Custom Error Classes ---

/**
 * Base error class for Suno API errors.
 */
export class SunoApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public endpoint: string
  ) {
    super(message);
    this.name = 'SunoApiError';
  }
}

/**
 * Error thrown when API returns error code 429 (insufficient credits).
 */
export class InsufficientCreditsError extends SunoApiError {
  constructor(endpoint: string) {
    super('Insufficient credits. Please top up your account.', 429, endpoint);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Error thrown when API returns error code 430 (rate limit exceeded).
 */
export class RateLimitError extends SunoApiError {
  constructor(endpoint: string) {
    super('Rate limit exceeded. Please try again later.', 430, endpoint);
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when API returns error code 455 (system maintenance).
 */
export class MaintenanceError extends SunoApiError {
  constructor(endpoint: string) {
    super('System is under maintenance. Please try again later.', 455, endpoint);
    this.name = 'MaintenanceError';
  }
}

/**
 * Maps an error code to the appropriate SunoApiError subclass.
 * This function is exported for testing purposes.
 * 
 * @param errorCode - The error code from the API response
 * @param endpoint - The API endpoint that returned the error
 * @param errorMessage - Optional error message (used for generic errors)
 * @returns The appropriate error instance
 */
export function mapErrorCodeToError(
  errorCode: number,
  endpoint: string,
  errorMessage?: string
): SunoApiError {
  switch (errorCode) {
    case 429:
      return new InsufficientCreditsError(endpoint);
    case 430:
      return new RateLimitError(endpoint);
    case 455:
      return new MaintenanceError(endpoint);
    default:
      return new SunoApiError(
        errorMessage || `Suno API error: ${endpoint}`,
        errorCode,
        endpoint
      );
  }
}

// --- Retry Logic ---

/**
 * Retry utility with exponential backoff for handling transient errors.
 * 
 * - Retries on RateLimitError with exponential backoff
 * - Does NOT retry on InsufficientCreditsError (non-recoverable)
 * - Does NOT retry on other errors (to avoid masking issues)
 * 
 * @param fn - Async function to execute with retry logic
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelayMs - Base delay in milliseconds for exponential backoff (default: 1000)
 * @returns Result of the function on success
 * @throws The last error encountered after all retries exhausted, or non-retryable errors immediately
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on InsufficientCreditsError - it's not recoverable
      if (error instanceof InsufficientCreditsError) {
        console.log(`[Suno] InsufficientCreditsError - not retrying`);
        throw error;
      }

      // Retry with exponential backoff on RateLimitError
      if (error instanceof RateLimitError) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          console.log(`[Suno] RateLimitError - retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        // Max retries exhausted for rate limit
        console.log(`[Suno] RateLimitError - max retries (${maxRetries}) exhausted`);
        throw error;
      }

      // Don't retry on other errors (MaintenanceError, SunoApiError, etc.)
      throw error;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

// --- API Functions ---

/**
 * Check if Suno API is configured with a valid API key.
 */
export function isSunoConfigured(): boolean {
  // In browser, we assume server has the key (or we'll get an error on request)
  // This allows the UI to enable features even if client doesn't have the key directly
  if (isBrowser) return true;
  return !!SUNO_API_KEY;
}

/**
 * Generate music from a topic/prompt.
 * Endpoint: POST /api/v1/generate
 * Returns the taskId for tracking progress.
 * 
 * @param config - Generation configuration
 * @returns taskId for polling status
 * @throws Error if API key is not configured or request fails
 */
export async function generateMusic(config: SunoGenerationConfig): Promise<string> {
  // Auto-generate title if not provided (required for customMode: true)
  const autoTitle = config.title || config.prompt.slice(0, 50) || "AI Generated Track";

  const requestBody = {
    prompt: config.prompt,
    customMode: true, // Always use custom mode for full control
    style: config.style || "",
    title: autoTitle,
    instrumental: config.instrumental ?? false,
    model: config.model ?? "V5",
    callBackUrl: "playground", // Use "playground" for polling mode
    negativeTags: config.negativeTags || "",
    // Add other fields if needed, like styleWeight etc used in custom mode logic
    // But proxy body logic handles it. However, we should be explicit.
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.65,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.5,
    audioWeight: config.audioWeight ?? 0.65,
    personaId: config.personaId
  };

  // Clean up undefined
  Object.keys(requestBody).forEach(key => (requestBody as any)[key] === undefined && delete (requestBody as any)[key]);

  // Full path: /api/v1/generate
  return callSunoProxy("generate", requestBody);
}

/**
 * Map raw API status string to SunoTaskStatus type.
 * Handles all documented statuses from the Suno API.
 * 
 * @param rawStatus - Raw status string from API response
 * @returns Normalized SunoTaskStatus value
 */
function mapToSunoTaskStatus(rawStatus: string | undefined): SunoTaskStatus {
  if (!rawStatus) return "PENDING";

  // Normalize to uppercase for comparison
  const normalizedStatus = rawStatus.toUpperCase();

  // Map all documented statuses
  const statusMap: Record<string, SunoTaskStatus> = {
    "PENDING": "PENDING",
    "PROCESSING": "PROCESSING",
    "TEXT_SUCCESS": "TEXT_SUCCESS",
    "FIRST_SUCCESS": "FIRST_SUCCESS",
    "SUCCESS": "SUCCESS",
    "CREATE_TASK_FAILED": "CREATE_TASK_FAILED",
    "GENERATE_AUDIO_FAILED": "GENERATE_AUDIO_FAILED",
    "CALLBACK_EXCEPTION": "CALLBACK_EXCEPTION",
    "SENSITIVE_WORD_ERROR": "SENSITIVE_WORD_ERROR",
    "FAILED": "FAILED",
  };

  return statusMap[normalizedStatus] || "PENDING";
}

/**
 * Check if a status represents a failure state.
 * 
 * @param status - SunoTaskStatus to check
 * @returns true if the status indicates a failure
 */
function isFailedStatus(status: SunoTaskStatus): boolean {
  return [
    "FAILED",
    "CREATE_TASK_FAILED",
    "GENERATE_AUDIO_FAILED",
    "CALLBACK_EXCEPTION",
    "SENSITIVE_WORD_ERROR"
  ].includes(status);
}

/**
 * Check if a status represents an intermediate/in-progress state.
 * These statuses indicate the task is still processing and should continue polling.
 * 
 * @param status - SunoTaskStatus to check
 * @returns true if the status indicates the task is still in progress
 */
function isIntermediateStatus(status: SunoTaskStatus): boolean {
  return [
    "PENDING",
    "PROCESSING",
    "TEXT_SUCCESS",
    "FIRST_SUCCESS"
  ].includes(status);
}

/**
 * Get the status of a generation task.
 * Endpoint: GET /api/v1/generate/record-info?taskId={taskId}
 * 
 * Handles all documented Suno API statuses:
 * - PENDING: Task is queued
 * - PROCESSING: Task is being processed
 * - TEXT_SUCCESS: Lyrics/text generation completed (intermediate)
 * - FIRST_SUCCESS: First audio generated (intermediate)
 * - SUCCESS: All audio generated successfully
 * - CREATE_TASK_FAILED: Task creation failed
 * - GENERATE_AUDIO_FAILED: Audio generation failed
 * - CALLBACK_EXCEPTION: Callback processing failed
 * - SENSITIVE_WORD_ERROR: Content flagged for sensitive words
 * 
 * @param taskId - Task identifier from generateMusic()
 * @returns Task result with status, tracks, and error details if failed
 */
export async function getTaskStatus(taskId: string): Promise<SunoTaskResult> {
  const data = await callSunoProxy(`generate/record-info?taskId=${taskId}`, null, "GET");

  const status = mapToSunoTaskStatus(data.status);

  // Parse tracks if available - API returns sunoData array in response
  let tracks: SunoGeneratedTrack[] | undefined;
  if (status === "SUCCESS" && data.response?.sunoData) {
    tracks = data.response.sunoData.map((track: any) => ({
      id: track.id,
      title: track.title || "Untitled",
      audio_url: track.audioUrl,
      duration: track.duration || 0,
      style: track.tags,
      lyrics: track.prompt,
    }));
  }

  // Build result with error details for failed tasks
  const result: SunoTaskResult = {
    taskId,
    status,
    tracks,
  };

  // Include error details for failed statuses
  if (isFailedStatus(status)) {
    // Extract error code from various possible locations in the response
    result.errorCode = data.errorCode
      || data.code
      || data.response?.sunoData?.[0]?.errorCode;

    // Extract error message from various possible locations in the response
    result.errorMessage = data.errorMessage
      || data.msg
      || data.response?.sunoData?.[0]?.errorMessage
      || getDefaultErrorMessage(status);
  }

  return result;
}

/**
 * Get a default error message based on the failure status.
 * 
 * @param status - The failed status
 * @returns Human-readable error message
 */
function getDefaultErrorMessage(status: SunoTaskStatus): string {
  switch (status) {
    case "CREATE_TASK_FAILED":
      return "Failed to create generation task. Please try again.";
    case "GENERATE_AUDIO_FAILED":
      return "Audio generation failed. Please try again with different parameters.";
    case "CALLBACK_EXCEPTION":
      return "Callback processing failed. The task may have completed but notification failed.";
    case "SENSITIVE_WORD_ERROR":
      return "Content flagged for sensitive words. Please modify your prompt and try again.";
    case "FAILED":
    default:
      return "Generation failed. Please try again.";
  }
}

/**
 * Get detailed status of a generation task with full API response fields.
 * Endpoint: GET /api/v1/generate/record-info?taskId={taskId}
 * 
 * Returns the complete API response including:
 * - parentMusicId: ID of the parent track (for extensions/covers)
 * - param: Original request parameters
 * - response: Full API response with sunoData array
 * - type: Task type (generate, extend, cover, etc.)
 * - errorCode: Numeric error code if failed
 * 
 * Use this function when you need access to all metadata about a task.
 * For simple status checks, use getTaskStatus() instead.
 * 
 * @param taskId - Task identifier from generateMusic() or other generation functions
 * @returns Detailed task result with all API response fields
 */
export async function getDetailedTaskStatus(taskId: string): Promise<SunoDetailedTaskResult> {
  const data = await callSunoProxy(`generate/record-info?taskId=${taskId}`, null, "GET");

  const status = mapToSunoTaskStatus(data.status);

  // Parse tracks if available - API returns sunoData array in response
  let tracks: SunoGeneratedTrack[] | undefined;
  if (status === "SUCCESS" && data.response?.sunoData) {
    tracks = data.response.sunoData.map((track: any) => ({
      id: track.id,
      title: track.title || "Untitled",
      audio_url: track.audioUrl,
      duration: track.duration || 0,
      style: track.tags,
      lyrics: track.prompt,
    }));
  }

  // Build detailed result with all API response fields
  const result: SunoDetailedTaskResult = {
    taskId,
    status,
    tracks,
    // Include parent music ID for extensions/covers
    parentMusicId: data.parentMusicId || data.response?.parentMusicId,
    // Include original request parameters
    param: data.param,
    // Include full response data with sunoData array
    response: data.response ? {
      taskId: data.response.taskId || taskId,
      sunoData: data.response.sunoData || []
    } : undefined,
    // Include task type
    type: data.type || data.taskType,
  };

  // Include error details for failed statuses
  if (isFailedStatus(status)) {
    // Extract error code from various possible locations in the response
    result.errorCode = data.errorCode
      || data.code
      || data.response?.sunoData?.[0]?.errorCode;

    // Extract error message from various possible locations in the response
    result.errorMessage = data.errorMessage
      || data.msg
      || data.response?.sunoData?.[0]?.errorMessage
      || getDefaultErrorMessage(status);
  }

  return result;
}

/**
 * Poll for task completion with timeout.
 * 
 * Handles intermediate statuses properly:
 * - PENDING, PROCESSING: Continue polling (task is queued/processing)
 * - TEXT_SUCCESS: Continue polling (lyrics generated, audio in progress)
 * - FIRST_SUCCESS: Continue polling (first track done, more may be generating)
 * - SUCCESS: Return tracks (all generation complete)
 * - Any failure status: Throw error with details
 * 
 * @param taskId - Task identifier
 * @param maxWaitMs - Maximum wait time in milliseconds (default: 10 minutes)
 * @returns Generated tracks on success
 * @throws Error on failure or timeout
 */
export async function waitForCompletion(
  taskId: string,
  maxWaitMs: number = 10 * 60 * 1000
): Promise<SunoGeneratedTrack[]> {
  const pollIntervalMs = 30 * 1000; // 30 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getTaskStatus(taskId);

    // Success - return the generated tracks
    if (result.status === "SUCCESS" && result.tracks) {
      console.log("[Suno] Generation completed successfully");
      return result.tracks;
    }

    // Check for any failure status
    if (isFailedStatus(result.status)) {
      const errorDetails = result.errorCode
        ? ` (code: ${result.errorCode})`
        : '';
      throw new Error(
        result.errorMessage || `Music generation failed with status: ${result.status}${errorDetails}`
      );
    }

    // Continue polling for intermediate statuses (PENDING, PROCESSING, TEXT_SUCCESS, FIRST_SUCCESS)
    // The isIntermediateStatus helper identifies these statuses
    if (isIntermediateStatus(result.status)) {
      console.log(`[Suno] Status: ${result.status}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    // Unknown status - log warning and continue polling
    console.warn(`[Suno] Unknown status: ${result.status}, continuing to poll...`);
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Music generation timed out. Please try again.");
}

/**
 * Generate lyrics from a topic/prompt.
 * Endpoint: POST /api/v1/generate-lyrics
 * Returns the taskId for tracking progress.
 * 
 * @param prompt - Topic or theme for lyrics (max 200 words)
 * @returns taskId for polling status
 */
export async function generateLyrics(prompt: string): Promise<string> {
  // Full path: /api/v1/generate-lyrics
  return callSunoProxy("generate-lyrics", { prompt, callBackUrl: "playground" });
}

/**
 * Get the status of a lyrics generation task.
 * Endpoint: GET /api/v1/generate-lyrics/record-info?taskId={taskId}
 * 
 * @param taskId - Task identifier from generateLyrics()
 * @returns Lyrics result with status and text
 */
export async function getLyricsStatus(taskId: string): Promise<SunoLyricsResult> {
  const data = await callSunoProxy(`generate-lyrics/record-info?taskId=${taskId}`, null, "GET");

  const status = data.status || "PENDING";

  // API returns data array in response with text and title
  const lyricsData = data.response?.data?.[0];

  return {
    taskId,
    status,
    title: status === "SUCCESS" ? lyricsData?.title : undefined,
    text: status === "SUCCESS" ? lyricsData?.text : undefined,
    errorMessage: status === "FAILED" ? (data.errorMessage || lyricsData?.errorMessage || "Lyrics generation failed") : undefined,
  };
}

/**
 * Get timestamped lyrics for a generated track.
 * Endpoint: GET /api/v1/get-timestamped-lyrics?taskId={taskId}&audioId={audioId}
 * 
 * @param taskId - Original generation task ID
 * @param audioId - Audio ID from the generated track
 * @returns Array of SubtitleItem for timeline display
 */
export async function getTimestampedLyrics(taskId: string, audioId: string): Promise<SubtitleItem[]> {
  try {
    const data = await callSunoProxy(`get-timestamped-lyrics?taskId=${taskId}&audioId=${audioId}`, null, "GET");
    const lyricsData = data.response?.lyrics || [];
    return parseTimestampedLyrics(lyricsData);
  } catch (e) {
    console.warn("[Suno] Failed to get timestamped lyrics", e);
    return [];
  }
}

/**
 * Parse raw timestamped lyrics data into SubtitleItem array.
 * Exported for testing.
 */
export function parseTimestampedLyrics(lyricsData: Array<{ start: number; end: number; text: string }>): SubtitleItem[] {
  return lyricsData.map((item, index) => ({
    id: index + 1,
    startTime: item.start,
    endTime: item.end,
    text: item.text,
  }));
}

/**
 * Get remaining API credits.
 * Endpoint: GET /api/v1/generate/credit
 * 
 * @returns Credits balance
 */
export async function getCredits(): Promise<SunoCredits> {
  const result = await callSunoProxy("generate/credit", null, "GET");
  // API returns credits directly in data field or nested
  const credits = typeof result === "number" ? result : (result?.credits ?? 0);
  console.log("[Suno] Credits:", credits);
  return { credits };
}

/**
 * Test function to verify Suno API is working.
 * Can be called from browser console: testSunoAPI()
 */
export async function testSunoAPI(): Promise<void> {
  console.log("=== Suno API Test ===");
  console.log(`API Key configured: ${isSunoConfigured() ? "YES" : "NO"}`);

  if (!isSunoConfigured()) {
    console.error("❌ Suno API key not found. Add VITE_SUNO_API_KEY to .env.local");
    return;
  }

  try {
    console.log("Testing credits endpoint...");
    const credits = await getCredits();
    console.log(`✅ Credits check successful! Remaining: ${credits.credits}`);
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// ... existing code ...

/**
 * Generate a music video for a track.
 * Endpoint: POST /api/v1/create-music-video
 * 
 * @param taskId - Task ID of the generated music
 * @param audioId - Audio ID of the specific track
 * @param author - Optional artist name to display
 * @param domainName - Optional domain/brand watermark
 * @returns taskId for video generation
 */
export async function createMusicVideo(
  taskId: string,
  audioId: string,
  author?: string,
  domainName?: string
): Promise<string> {
  try {
    const requestBody: any = {
      taskId,
      audioId,
      callBackUrl: "playground"
    };
    if (author) requestBody.author = author;
    if (domainName) requestBody.domainName = domainName;

    // Full path: /api/v1/create-music-video
    return await callSunoProxy("create-music-video", requestBody);
  } catch (e) {
    console.warn("[Suno] create-music-video failed");
    throw e;
  }
}

/**
 * Generate a cover image for a track.
 * Endpoint: POST /api/v1/cover
 */
export async function generateCover(taskId: string): Promise<string> {
  // Full path: /api/v1/cover
  return callSunoProxy("cover", { taskId, callBackUrl: "playground" });
}

/**
 * Boost/Enhance a music style description.
 * Endpoint: POST /api/v1/boost-music-style
 */
export async function boostMusicStyle(style: string): Promise<string> {
  // Full path: /api/v1/boost-music-style
  const result = await callSunoProxy("boost-music-style", { content: style });
  return result?.result || result?.content || result || style;
}

// Expose to window for console testing
if (typeof window !== "undefined") {
  (window as any).testSunoAPI = testSunoAPI;
  // ... existing code ...
  (window as any).sunoVideo = createMusicVideo;
  (window as any).sunoCover = generateCover;
  (window as any).sunoExtend = extendMusic;
  (window as any).sunoUploadExtend = uploadAndExtend;
  (window as any).sunoPersona = generatePersona;
  (window as any).sunoConvertWav = convertToWav;
  (window as any).sunoSeparateVocals = separateVocals;
  (window as any).sunoStemStatus = getStemSeparationStatus;
  (window as any).sunoUploadBase64 = uploadFileBase64;
  (window as any).sunoUploadUrl = uploadFileUrl;
}

/**
 * Add vocals to an instrumental track.
 * Endpoint: POST /api/v1/add-vocals
 */
export async function addVocals(config: SunoGenerationConfig & { uploadUrl: string }): Promise<string> {
  const requestBody = {
    prompt: config.prompt,
    uploadUrl: config.uploadUrl,
    title: config.title || "",
    negativeTags: config.negativeTags || "",
    style: config.style || "",
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.61,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.72,
    audioWeight: config.audioWeight ?? 0.65,
    model: config.model ?? "V4_5PLUS",
    callBackUrl: config.callBackUrl || "playground"
  };

  // Full path: /api/v1/add-vocals
  return callSunoProxy("add-vocals", requestBody);
}

/**
 * Add instrumental to a vocal track.
 * Endpoint: POST /api/v1/add-instrumental
 */
export async function addInstrumental(config: SunoGenerationConfig & { uploadUrl: string }): Promise<string> {
  const requestBody = {
    uploadUrl: config.uploadUrl,
    title: config.title || "",
    negativeTags: config.negativeTags || "",
    tags: config.style || "Relaxing Piano, Ambient",
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.61,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.72,
    audioWeight: config.audioWeight ?? 0.65,
    model: config.model ?? "V4_5PLUS",
    callBackUrl: config.callBackUrl || "playground"
  };

  // Full path: /api/v1/add-instrumental
  return callSunoProxy("add-instrumental", requestBody);
}

/**
 * Upload audio and cover it with a new style.
 * Endpoint: POST /api/v1/generate/upload-cover
 */
export async function uploadAndCover(config: SunoGenerationConfig & { uploadUrl: string }): Promise<string> {
  const requestBody = {
    uploadUrl: config.uploadUrl,
    customMode: true,
    instrumental: config.instrumental ?? true,
    model: config.model ?? "V4_5ALL",
    callBackUrl: config.callBackUrl || "playground",
    prompt: config.prompt,
    style: config.style || "",
    title: config.title || "",
    negativeTags: config.negativeTags || "",
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.65,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.65,
    audioWeight: config.audioWeight ?? 0.65
  };

  // Full path: /api/v1/generate/upload-cover
  return callSunoProxy("generate/upload-cover", requestBody);
}

/**
 * Replace a section of the music track.
 * Endpoint: POST /api/v1/replace-section
 */
export async function replaceSection(
  taskId: string,
  audioId: string,
  startTime: number,
  endTime: number,
  prompt: string,
  style?: string,
  title?: string
): Promise<string> {
  const requestBody = {
    taskId,
    audioId,
    prompt,
    tags: style || "",
    title: title || "",
    infillStartS: startTime,
    infillEndS: endTime,
    callBackUrl: "playground"
  };
  // Full path: /api/v1/replace-section
  return callSunoProxy("replace-section", requestBody);
}

/**
 * Extend an existing music track.
 * Endpoint: POST /api/v1/extend
 * 
 * Allows continuing a generated track from a specific timestamp with new lyrics/style.
 * 
 * @param config - Extension configuration including taskId, audioId, and continueAt time
 * @returns taskId for tracking the extension progress
 */
export async function extendMusic(config: SunoExtendConfig): Promise<string> {
  const requestBody = {
    taskId: config.taskId,
    audioId: config.audioId,
    prompt: config.prompt || "",
    style: config.style || "",
    title: config.title || "",
    continueAt: config.continueAt,
    model: config.model ?? "V5",
    callBackUrl: config.callBackUrl || "playground"
  };

  // Clean up undefined values
  Object.keys(requestBody).forEach(key =>
    (requestBody as any)[key] === undefined && delete (requestBody as any)[key]
  );

  // Full path: /api/v1/extend
  return callSunoProxy("extend", requestBody);
}

/**
 * Upload audio and extend it with new content.
 * Endpoint: POST /api/v1/upload-and-extend
 * 
 * Allows uploading an external audio file and extending it with AI-generated content.
 * 
 * @param config - Upload configuration including uploadUrl, prompt, style, and continueAt time
 * @returns taskId for tracking the extension progress
 */
export async function uploadAndExtend(config: SunoUploadConfig): Promise<string> {
  const requestBody = {
    uploadUrl: config.uploadUrl,
    prompt: config.prompt || "",
    style: config.style || "",
    title: config.title || "",
    continueAt: config.continueAt ?? 0,
    instrumental: config.instrumental ?? false,
    model: config.model ?? "V5",
    defaultParamFlag: config.defaultParamFlag ?? false,
    negativeTags: config.negativeTags || "",
    vocalGender: config.vocalGender,
    styleWeight: config.styleWeight ?? 0.65,
    weirdnessConstraint: config.weirdnessConstraint ?? 0.5,
    audioWeight: config.audioWeight ?? 0.65,
    callBackUrl: config.callBackUrl || "playground"
  };

  // Clean up undefined values
  Object.keys(requestBody).forEach(key =>
    (requestBody as any)[key] === undefined && delete (requestBody as any)[key]
  );

  // Full path: /api/v1/upload-and-extend
  return callSunoProxy("upload-and-extend", requestBody);
}

/**
 * Generate a personalized music style/persona.
 * Endpoint: POST /api/v1/generate-persona
 * 
 * Creates a custom persona that can be used with music generation for consistent style.
 * The returned personaId can be passed to generateMusic() for personalized output.
 * 
 * @param config - Persona configuration including name, description, and style
 * @returns taskId for tracking the persona generation progress
 */
export async function generatePersona(config: SunoPersonaConfig): Promise<string> {
  const requestBody = {
    name: config.name,
    description: config.description,
    style: config.style,
    callBackUrl: config.callBackUrl || "playground"
  };

  // Full path: /api/v1/generate-persona
  return callSunoProxy("generate-persona", requestBody);
}

/**
 * Upload an audio file for use with Cover or Extend features.
 * Uses backend proxy to bypass CORS restrictions.
 * 
 * @param file - The audio file to upload
 * @returns The URL of the uploaded file
 */
export async function uploadAudioFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  // Use backend proxy to bypass CORS
  // The server forwards the request to Suno API server-side
  // @ts-ignore - Vite injects this at build time
  const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || "http://localhost:3001";

  const response = await fetch(`${serverUrl}/api/suno/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok || data.code !== 200) {
    throw new Error(data.error || data.msg || data.message || "File upload failed");
  }

  // Return the accessible URL for the file
  return data.data?.fileUrl || data.data?.url || data.url;
}

/**
 * Convert a generated audio track to WAV format.
 * Endpoint: POST /api/v1/convert-to-wav
 * 
 * Converts an MP3 track to high-quality WAV format for professional use.
 * The conversion is asynchronous - poll getTaskStatus() for completion.
 * 
 * @param taskId - Task ID of the original generation
 * @param audioId - Audio ID of the specific track to convert
 * @returns taskId for tracking the conversion progress
 */
export async function convertToWav(taskId: string, audioId: string): Promise<string> {
  const requestBody = {
    taskId,
    audioId,
    callBackUrl: "playground"
  };

  // Full path: /api/v1/convert-to-wav
  return callSunoProxy("convert-to-wav", requestBody);
}

/**
 * Separate vocals from instrumental in a music track.
 * Endpoint: POST /api/v1/separate-vocals-from-music
 * 
 * Uses AI to split a track into separate vocal and instrumental stems.
 * Useful for remixing, karaoke, or isolating specific elements.
 * 
 * @param taskId - Task ID of the original generation
 * @param audioId - Audio ID of the specific track to separate
 * @returns taskId for tracking the separation progress
 */
export async function separateVocals(taskId: string, audioId: string): Promise<string> {
  const requestBody = {
    taskId,
    audioId,
    callBackUrl: "playground"
  };

  // Full path: /api/v1/separate-vocals-from-music
  return callSunoProxy("separate-vocals-from-music", requestBody);
}

/**
 * Get the status of a stem separation task.
 * Endpoint: GET /api/v1/separate-vocals-from-music/record-info?taskId={taskId}
 * 
 * Returns the separation result with URLs to the separated vocal and instrumental tracks.
 * 
 * @param taskId - Task identifier from separateVocals()
 * @returns Stem separation result with vocalsUrl and instrumentalUrl
 */
export async function getStemSeparationStatus(taskId: string): Promise<SunoStemSeparationResult> {
  const data = await callSunoProxy(`separate-vocals-from-music/record-info?taskId=${taskId}`, null, "GET");

  const status = data.status || "PENDING";

  // Parse stem URLs from response - API returns vocals and instrumental URLs in response
  let vocalsUrl: string | undefined;
  let instrumentalUrl: string | undefined;

  if (status === "SUCCESS" && data.response) {
    // The API typically returns the separated tracks in the response
    vocalsUrl = data.response.vocalsUrl || data.response.vocals_url || data.response.vocalUrl;
    instrumentalUrl = data.response.instrumentalUrl || data.response.instrumental_url || data.response.instrumentUrl;
  }

  return {
    taskId,
    status,
    vocalsUrl,
    instrumentalUrl,
    errorMessage: status === "FAILED" ? (data.errorMessage || "Stem separation failed") : undefined,
  };
}

/**
 * Wait for stem separation to complete and return the result.
 * 
 * Handles intermediate statuses properly:
 * - PENDING, PROCESSING: Continue polling (task is queued/processing)
 * - TEXT_SUCCESS, FIRST_SUCCESS: Continue polling (intermediate progress)
 * - SUCCESS: Return result with stem URLs
 * - Any failure status: Throw error with details
 * 
 * @param taskId - Task identifier from separateVocals()
 * @param maxWaitMs - Maximum wait time in milliseconds (default: 5 minutes)
 * @returns Stem separation result with both URLs
 * @throws Error on failure or timeout
 */
export async function waitForStemSeparation(
  taskId: string,
  maxWaitMs: number = 5 * 60 * 1000
): Promise<SunoStemSeparationResult> {
  const pollIntervalMs = 15 * 1000; // 15 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getStemSeparationStatus(taskId);

    // Success - return the separation result
    if (result.status === "SUCCESS") {
      console.log("[Suno] Stem separation completed successfully");
      return result;
    }

    // Check for any failure status
    if (isFailedStatus(result.status)) {
      throw new Error(result.errorMessage || `Stem separation failed with status: ${result.status}`);
    }

    // Continue polling for intermediate statuses
    console.log(`[Suno] Stem separation status: ${result.status}, waiting...`);
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Stem separation timed out. Please try again.");
}

/**
 * Upload a file using Base64 encoded data.
 * Endpoint: POST /api/v1/upload/base64
 * 
 * Uploads a file to Suno's servers using Base64 encoding.
 * The returned URL can be used with upload-and-cover, upload-and-extend, 
 * add-vocals, and add-instrumental endpoints.
 * 
 * @param base64Data - Base64 encoded file data (without data URI prefix)
 * @param fileName - Name of the file including extension (e.g., "audio.mp3")
 * @returns URL of the uploaded file for use with other Suno endpoints
 * @throws SunoApiError if upload fails
 */
export async function uploadFileBase64(base64Data: string, fileName: string): Promise<string> {
  // Strip data URI prefix if present (e.g., "data:audio/mp3;base64,")
  const cleanBase64 = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  const requestBody = {
    base64Data: cleanBase64,
    fileName: fileName
  };

  // Call the upload endpoint via proxy
  const result = await callSunoProxy("upload/base64", requestBody);

  // Extract the file URL from the response
  const fileUrl = result?.fileUrl || result?.url || result;

  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new SunoApiError('Upload failed: No file URL returned', 500, 'upload/base64');
  }

  console.log(`[Suno] File uploaded via Base64: ${fileName}`);
  return fileUrl;
}

/**
 * Upload a file from a remote URL.
 * Endpoint: POST /api/v1/upload/url
 * 
 * Uploads a file to Suno's servers by providing a source URL.
 * Suno will fetch the file from the URL and store it.
 * The returned URL can be used with upload-and-cover, upload-and-extend,
 * add-vocals, and add-instrumental endpoints.
 * 
 * @param sourceUrl - URL of the audio file to upload (must be publicly accessible)
 * @returns URL of the uploaded file for use with other Suno endpoints
 * @throws SunoApiError if upload fails
 */
export async function uploadFileUrl(sourceUrl: string): Promise<string> {
  const requestBody = {
    url: sourceUrl
  };

  // Call the upload endpoint via proxy
  const result = await callSunoProxy("upload/url", requestBody);

  // Extract the file URL from the response
  const fileUrl = result?.fileUrl || result?.url || result;

  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new SunoApiError('Upload failed: No file URL returned', 500, 'upload/url');
  }

  console.log(`[Suno] File uploaded via URL: ${sourceUrl.substring(0, 50)}...`);
  return fileUrl;
}
