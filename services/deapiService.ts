import { cloudAutosave } from "./cloudStorageService";

const DEAPI_DIRECT_BASE = "https://api.deapi.ai/api/v1/client";
const PROXY_BASE = "/api/deapi/proxy"; // Server-side proxy to bypass CORS
const DEFAULT_VIDEO_MODEL = "Ltxv_13B_0_9_8_Distilled_FP8";
const DEFAULT_IMAGE_MODEL = "Flux1schnell"; // Fast, high-quality text-to-image

// Rate limit: 1 request per 60 seconds for img2video
const RATE_LIMIT_MS = 60 * 1000; // 60 seconds

// Use Vite's import.meta.env for browser-side environment variables
// @ts-ignore - Vite injects import.meta.env at build time
const VITE_API_KEY = import.meta.env?.VITE_DEAPI_API_KEY || "";
const API_KEY = VITE_API_KEY || (typeof process !== 'undefined' && process.env?.DEAPI_API_KEY) || "";

// Detect if running in browser (use proxy) or Node.js (direct API calls)
const isBrowser = typeof window !== 'undefined';
const API_BASE = isBrowser ? PROXY_BASE : DEAPI_DIRECT_BASE;

// ============================================================
// Rate Limiter for img2video endpoint (1 request per 60 seconds)
// ============================================================

class RateLimiter {
  private lastRequestTime: number = 0;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessing: boolean = false;

  /**
   * Wait until rate limit allows the next request.
   * Returns immediately if enough time has passed, otherwise waits.
   */
  async waitForSlot(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;

      if (waitTime > 0 && this.lastRequestTime > 0) {
        console.log(`[DeAPI] Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before next request (${this.queue.length} in queue)`);
        await new Promise(r => setTimeout(r, waitTime));
      }

      const item = this.queue.shift();
      if (item) {
        this.lastRequestTime = Date.now();
        item.resolve();
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get the current queue length (for UI feedback)
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get estimated wait time in seconds for a new request
   */
  getEstimatedWaitTime(): number {
    if (this.lastRequestTime === 0) return 0;
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
    const queueWait = this.queue.length * RATE_LIMIT_MS;
    return Math.max(0, Math.ceil((waitTime + queueWait) / 1000));
  }
}

// Singleton rate limiter for img2video requests
const img2videoRateLimiter = new RateLimiter();

// ============================================================
// Tier Detection and Adaptive Rate Limiting
// ============================================================

/**
 * DeAPI tier information based on documentation:
 * - Basic (free $5 credits): 1-10 RPM, 15-100 daily endpoint limit
 * - Premium (paid tier): 300 RPM, unlimited daily
 */
export type DeApiTier = "basic" | "premium" | "unknown";

let detectedTier: DeApiTier = "unknown";
let consecutiveSuccesses = 0;
let lastRateLimitTime = 0;

/**
 * Detect the user's tier based on rate limit responses.
 * Adapts concurrency limits accordingly.
 */
export const detectTier = (wasRateLimited: boolean): DeApiTier => {
  if (wasRateLimited) {
    lastRateLimitTime = Date.now();
    consecutiveSuccesses = 0;
    detectedTier = "basic";
  } else {
    consecutiveSuccesses++;
    // If we've had 20+ successful requests without rate limiting, likely premium
    if (consecutiveSuccesses > 20 && Date.now() - lastRateLimitTime > 60000) {
      detectedTier = "premium";
    }
  }
  return detectedTier;
};

/**
 * Get recommended concurrency based on detected tier.
 */
export const getRecommendedConcurrency = (): number => {
  switch (detectedTier) {
    case "premium":
      return 10; // Can handle higher concurrency
    case "basic":
      return 2;  // Conservative to avoid rate limits
    default:
      return 5;  // Default middle ground
  }
};

/**
 * Get current detected tier (for UI display).
 */
export const getCurrentTier = (): DeApiTier => detectedTier;

// ============================================================
// Exponential Backoff Retry Logic
// ============================================================

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Execute a function with exponential backoff retry.
 * Recommended by DeAPI documentation for handling transient errors and rate limits.
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Result of the function
 */
export const withExponentialBackoff = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      // Success - update tier detection
      detectTier(false);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a rate limit error
      const isRateLimit = lastError.message.includes('429') ||
                          lastError.message.toLowerCase().includes('rate limit');

      if (isRateLimit) {
        detectTier(true);
      }

      // Don't retry on non-retryable errors
      const isRetryable = isRateLimit ||
                          lastError.message.includes('503') ||
                          lastError.message.includes('502') ||
                          lastError.message.toLowerCase().includes('timeout');

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      console.log(`[DeAPI] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Exponential backoff with jitter
      delay = Math.min(delay * backoffMultiplier + Math.random() * 1000, maxDelayMs);
    }
  }

  throw lastError || new Error('Unknown error in retry loop');
};

/**
 * Get the estimated wait time for the next img2video request
 */
export const getImg2VideoWaitTime = (): number => {
  return img2videoRateLimiter.getEstimatedWaitTime();
};

/**
 * Get the number of queued img2video requests
 */
export const getImg2VideoQueueLength = (): number => {
  return img2videoRateLimiter.getQueueLength();
};

// Response from img2video endpoint - can be immediate or async
export interface DeApiResponse {
  request_id: string;
  status: "pending" | "processing" | "done" | "error";
  progress?: string;
  preview?: string | null;
  result_url?: string;
  error?: string;
}

// Text-to-image models available on DeAPI
export type DeApiImageModel =
  | "Flux1schnell"        // Fast, high-quality (recommended for speed)
  | "ZImageTurbo_INT8";   // Photorealistic, exceptional clarity (recommended for quality)

/**
 * Model recommendations based on use case:
 * - Flux1schnell: Best for rapid iteration, 1-4 steps, ~2-3 seconds per image
 * - ZImageTurbo_INT8: Best for final production, photorealistic output, INT8 optimized
 */
export const MODEL_RECOMMENDATIONS = {
  speed: "Flux1schnell" as DeApiImageModel,
  quality: "ZImageTurbo_INT8" as DeApiImageModel,
} as const;

// Text-to-image request parameters
export interface Txt2ImgParams {
  prompt: string;
  model?: DeApiImageModel;
  width?: number;
  height?: number;
  guidance?: number;      // Guidance scale (default: 7.5)
  steps?: number;         // Inference steps (default: 4, max: 10 for FLUX)
  seed?: number;          // Random seed (-1 for random)
  negative_prompt?: string;
}

/**
 * Check if DeAPI is configured.
 * In browser: Assume true (proxy handles it).
 * In server: Check for API key.
 */
export const isDeApiConfigured = (): boolean => {
  if (isBrowser) return true; // Browser uses proxy, assume server is configured
  return Boolean(API_KEY && API_KEY.trim().length > 0);
};

/**
 * Get a user-friendly message about DeAPI configuration status.
 */
export const getDeApiConfigMessage = (): string => {
  if (isDeApiConfigured()) {
    return "DeAPI is configured and ready to use.";
  }
  return (
    "DeAPI is not configured on the server. To enable video animation:\n" +
    "1. Get an API key from https://deapi.ai\n" +
    "2. Add VITE_DEAPI_API_KEY=your_key to your .env.local file\n" +
    "3. Restart the development server"
  );
};

// Helper to convert Base64 to Blob/File
const base64ToBlob = async (base64Data: string): Promise<Blob> => {
  const base64Response = await fetch(base64Data);
  return await base64Response.blob();
};

/**
 * Poll for request completion with exponential backoff and rate limit handling
 */
async function pollRequest(requestId: string): Promise<string> {
  const maxAttempts = 60; // Max polling attempts
  const baseDelayMs = 3000; // Start with 3s delay
  const maxDelayMs = 15000; // Cap at 15s between polls
  const maxConsecutive429 = 5; // Max consecutive 429s before giving up

  let consecutive429Count = 0;
  let currentDelay = baseDelayMs;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait before polling (skip first iteration to check immediately after submission)
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
    }

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      // Only add Authorization header for direct API calls (not proxy)
      if (!isBrowser) {
        headers.Authorization = `Bearer ${API_KEY}`;
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LyricLens/1.0";
      }

      const response = await fetch(`${API_BASE}/request-status/${requestId}`, {
        headers,
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        consecutive429Count++;
        console.warn(`[DeAPI] Rate limited (429) - attempt ${consecutive429Count}/${maxConsecutive429}`);

        if (consecutive429Count >= maxConsecutive429) {
          throw new Error(
            "DeAPI rate limit exceeded. Too many requests - please wait a few minutes before trying again."
          );
        }

        // Exponential backoff on 429: double the delay, up to max
        currentDelay = Math.min(currentDelay * 2, maxDelayMs);

        // Check for Retry-After header
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          const retryMs = parseInt(retryAfter, 10) * 1000;
          if (!isNaN(retryMs) && retryMs > 0) {
            currentDelay = Math.min(retryMs, 60000); // Cap at 60s
            console.log(`[DeAPI] Retry-After header: waiting ${currentDelay / 1000}s`);
          }
        }

        continue; // Retry with backoff
      }

      // Reset 429 counter on successful response
      consecutive429Count = 0;
      currentDelay = baseDelayMs; // Reset delay on success

      if (!response.ok) {
        // For other errors (500, 502, etc.), log and retry with backoff
        console.warn(`[DeAPI] Polling error: ${response.status} - retrying...`);
        currentDelay = Math.min(currentDelay * 1.5, maxDelayMs);
        continue;
      }

      const rawData = await response.json();
      // Handle nested response: { data: { status, result_url } } or flat: { status, result_url }
      const data = (rawData.data || rawData) as DeApiResponse;

      if (data.status === "done" && data.result_url) {
        console.log(`[DeAPI] Generation complete after ${attempt + 1} polls`);
        return data.result_url;
      }

      if (data.status === "error") {
        throw new Error(data.error || "Generation failed at provider");
      }

      // Still pending or processing - log progress
      if (data.progress) {
        console.log(`[DeAPI] Progress: ${data.progress}% (poll ${attempt + 1}/${maxAttempts})`);
      } else {
        console.log(`[DeAPI] Status: ${data.status || 'pending'} (poll ${attempt + 1}/${maxAttempts})`);
      }

    } catch (error: unknown) {
      // Network errors - retry with backoff
      const errorName = error instanceof Error ? error.name : '';
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorName === "TypeError" || errorMessage.includes("fetch")) {
        console.warn(`[DeAPI] Network error during poll: ${errorMessage}`);
        currentDelay = Math.min(currentDelay * 1.5, maxDelayMs);
        continue;
      }
      // Re-throw application errors
      throw error;
    }
  }

  throw new Error(
    `Video generation timed out after ${maxAttempts} polling attempts (~${Math.round((maxAttempts * baseDelayMs) / 60000)} minutes)`
  );
}

/**
 * Calculate dimensions that fit within DeAPI's limits while preserving aspect ratio intent
 */
const getDeApiDimensions = (
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
): { width: number; height: number } => {
  // DeAPI supports up to 768px and requires dimensions divisible by 32
  switch (aspectRatio) {
    case "16:9":
      // Landscape: 768 x 432 (close to 16:9 ratio, divisible by 8)
      return { width: 768, height: 432 };
    case "9:16":
      // Portrait: 432 x 768 (close to 9:16 ratio, divisible by 8)
      return { width: 432, height: 768 };
    case "1:1":
      // Square: 768 x 768
      return { width: 768, height: 768 };
    default:
      return { width: 768, height: 768 };
  }
};

export const animateImageWithDeApi = async (
  base64Image: string,
  prompt: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
  sessionId?: string,
  sceneIndex?: number,
): Promise<string> => {
  if (!isDeApiConfigured()) {
    throw new Error(
      "DeAPI API key is not configured on the server.\n\n" +
      "DeAPI is an optional video animation provider that converts still images to video loops.\n\n" +
      "To use DeAPI:\n" +
      "1. Get an API key from https://deapi.ai ($20 free credits for new accounts)\n" +
      "2. Add VITE_DEAPI_API_KEY=your_key to your .env.local file\n" +
      "3. Restart the development server (npm run dev:all)\n\n" +
      "Alternatives:\n" +
      "• Switch to 'Google Veo' as your video provider (requires paid Gemini API plan)\n" +
      "• Use 'Image' generation mode instead of video",
    );
  }

  // Rate limiting disabled - removed to allow parallel requests
  // const waitTime = img2videoRateLimiter.getEstimatedWaitTime();
  // if (waitTime > 0) {
  //   console.log(`[DeAPI] Queuing animation request. Estimated wait: ${waitTime}s`);
  // }
  // await img2videoRateLimiter.waitForSlot();
  console.log(`[DeAPI] Proceeding with animation (rate limiting disabled)...`);

  // Get dimensions that comply with DeAPI's max 768px limit
  const { width, height } = getDeApiDimensions(aspectRatio);

  // 1. Prepare Form Data
  const formData = new FormData();
  const imageBlob = await base64ToBlob(base64Image);

  formData.append("first_frame_image", imageBlob, "frame0.png");
  formData.append("prompt", prompt);
  formData.append("frames", "120"); // 4 seconds at 30fps
  formData.append("width", width.toString());
  formData.append("height", height.toString());
  formData.append("fps", "30");
  formData.append("model", DEFAULT_VIDEO_MODEL);
  formData.append("guidance", "3"); // Required parameter - guidance scale
  formData.append("steps", "1"); // Distilled model requires max 1 step
  formData.append("seed", "-1"); // Random seed

  console.log(`[DeAPI] Submitting img2video request: ${width}x${height}, prompt: ${prompt.substring(0, 50)}...`);

  // 2. Submit Request
  // Browser uses dedicated proxy endpoint that handles FormData properly
  // Node.js uses direct API call
  let response: Response;

  if (isBrowser) {
    // Use dedicated img2video proxy that handles multipart/form-data
    response = await fetch('/api/deapi/img2video', {
      method: "POST",
      body: formData,
    });
  } else {
    // Direct API call from Node.js
    response = await fetch(`${DEAPI_DIRECT_BASE}/img2video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LyricLens/1.0",
      },
      body: formData,
    });
  }

  if (!response.ok) {
    const errText = await response.text();
    let errorMessage = `DeAPI request failed (${response.status})`;

    // Check for Cloudflare challenge (common with Node.js/server-side requests)
    if (errText.includes('Just a moment') || errText.includes('challenge-platform') || errText.includes('_cf_chl')) {
      throw new Error(
        `DeAPI img2video blocked by Cloudflare bot protection.\n\n` +
        `This happens because DeAPI's video generation endpoint has stricter protection ` +
        `against automated/server-side requests.\n\n` +
        `Solutions:\n` +
        `1. Use the app in browser (npm run dev:all) - browsers handle Cloudflare automatically\n` +
        `2. Contact DeAPI support (support@deapi.ai) to request server-to-server access\n` +
        `3. Switch to Google Veo as your video provider (requires paid Gemini API plan)`
      );
    }

    try {
      const errJson = JSON.parse(errText);
      if (errJson.message) {
        errorMessage = `DeAPI: ${errJson.message}`;
      } else if (errJson.error) {
        errorMessage = `DeAPI: ${errJson.error}`;
      }
    } catch {
      if (errText) {
        errorMessage = `DeAPI img2video failed: API error: ${errText.substring(0, 200)}...`;
      }
    }

    throw new Error(errorMessage);
  }

  const rawData = await response.json();
  console.log(`[DeAPI] Raw response:`, JSON.stringify(rawData, null, 2));

  // Handle multiple response structure variations:
  // 1. Nested: { data: { request_id, status, ... } }
  // 2. Flat: { request_id, status, ... }
  // 3. Direct result: { status: "done", result_url: "..." }
  const data: DeApiResponse = rawData.data || rawData;
  console.log(`[DeAPI] Parsed response:`, data);

  // Check if result is immediately available
  let videoUrl: string;

  // Priority 1: Check for immediate result_url (status: "done")
  if (data.result_url) {
    console.log(`[DeAPI] Video ready immediately! Status: ${data.status || 'unknown'}`);
    videoUrl = data.result_url;
  }
  // Priority 2: Check for error status
  else if (data.status === "error") {
    throw new Error(data.error || "Generation failed at provider");
  }
  // Priority 3: Check for request_id to poll
  else if (data.request_id) {
    console.log(`[DeAPI] Polling for request: ${data.request_id}, status: ${data.status}`);
    videoUrl = await pollRequest(data.request_id);
  }
  // Priority 4: Fallback - unexpected structure
  else {
    console.error(`[DeAPI] Unexpected response structure:`, rawData);
    throw new Error(
      `No request_id or result_url received from DeAPI.\n\n` +
      `Response structure: ${JSON.stringify(rawData, null, 2)}\n\n` +
      `This might indicate:\n` +
      `1. API key is invalid or expired\n` +
      `2. API endpoint has changed\n` +
      `3. Request parameters are incorrect\n\n` +
      `Check browser console for full response details.`
    );
  }

  // 3. Download and convert to Base64 (for consistency with app architecture)
  console.log(`[DeAPI] Downloading video from: ${videoUrl.substring(0, 80)}...`);
  const vidResp = await fetch(videoUrl);

  if (!vidResp.ok) {
    throw new Error(`Failed to download generated video: ${vidResp.status}`);
  }

  const vidBlob = await vidResp.blob();
  console.log(`[DeAPI] Video downloaded: ${(vidBlob.size / 1024 / 1024).toFixed(2)} MB`);

  // Upload to cloud storage if session context is provided
  if (sessionId && sceneIndex !== undefined) {
    cloudAutosave.saveAsset(
      sessionId,
      vidBlob,
      `scene_${sceneIndex}_deapi.mp4`,
      'video_clips'
    ).catch(err => {
      console.warn('[DeAPI] Cloud upload failed (non-fatal):', err);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(new Error("Failed to convert video to base64"));
    reader.readAsDataURL(vidBlob);
  });
};

/**
 * Generate an image from text prompt using DeAPI
 * Supports FLUX.1-schnell (fast) and Z-Image-Turbo (photorealistic)
 * 
 * @param params - Text-to-image generation parameters
 * @returns Base64-encoded image data URL
 */
export const generateImageWithDeApi = async (
  params: Txt2ImgParams
): Promise<string> => {
  if (!isDeApiConfigured()) {
    throw new Error(
      "DeAPI API key is not configured on the server.\n\n" +
      "To use DeAPI text-to-image:\n" +
      "1. Get an API key from https://deapi.ai\n" +
      "2. Add VITE_DEAPI_API_KEY=your_key to your .env.local file\n" +
      "3. Restart the development server (npm run dev:all)"
    );
  }

  const {
    prompt,
    model = DEFAULT_IMAGE_MODEL,
    width = 768,
    height = 768,
    guidance = 7.5,
    steps = 4,  // FLUX models work best with 1-4 steps, max 10
    seed = -1,
    negative_prompt = "blur, darkness, noise, low quality",
  } = params;

  console.log(`[DeAPI] Generating image: ${model}, ${width}x${height}, prompt: ${prompt.substring(0, 50)}...`);

  // 1. Submit Request (via proxy in browser, direct in Node.js)
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // Only add Authorization header for direct API calls (proxy handles auth server-side)
  if (!isBrowser) {
    headers.Authorization = `Bearer ${API_KEY}`;
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LyricLens/1.0";
  }

  const response = await fetch(`${API_BASE}/txt2img`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt,
      model,
      width,
      height,
      guidance,
      steps,
      seed,
      negative_prompt,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let errorMessage = `DeAPI txt2img request failed (${response.status})`;

    try {
      const errJson = JSON.parse(errText);
      if (errJson.message) {
        errorMessage = `DeAPI: ${errJson.message}`;
      } else if (errJson.error) {
        errorMessage = `DeAPI: ${errJson.error}`;
      }
    } catch {
      if (errText) {
        errorMessage = `DeAPI: ${errText}`;
      }
    }

    throw new Error(errorMessage);
  }

  const rawData = await response.json();
  console.log(`[DeAPI] txt2img raw response:`, JSON.stringify(rawData, null, 2));

  // Handle response structure (same as img2video)
  const data: DeApiResponse = rawData.data || rawData;
  console.log(`[DeAPI] txt2img parsed response:`, data);

  let imageUrl: string;

  // Check for immediate result
  if (data.result_url) {
    console.log(`[DeAPI] Image ready immediately! Status: ${data.status || 'unknown'}`);
    imageUrl = data.result_url;
  } else if (data.status === "error") {
    throw new Error(data.error || "Image generation failed at provider");
  } else if (data.request_id) {
    console.log(`[DeAPI] Polling for txt2img request: ${data.request_id}`);
    imageUrl = await pollRequest(data.request_id);
  } else {
    console.error(`[DeAPI] Unexpected txt2img response:`, rawData);
    throw new Error("No request_id or result_url received from DeAPI txt2img");
  }

  // 2. Download and convert to Base64
  console.log(`[DeAPI] Downloading image from: ${imageUrl.substring(0, 80)}...`);
  const imgResp = await fetch(imageUrl);

  if (!imgResp.ok) {
    throw new Error(`Failed to download generated image: ${imgResp.status}`);
  }

  const imgBlob = await imgResp.blob();
  console.log(`[DeAPI] Image downloaded: ${(imgBlob.size / 1024).toFixed(2)} KB`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(new Error("Failed to convert image to base64"));
    reader.readAsDataURL(imgBlob);
  });
};

/**
 * Helper function to generate image with aspect ratio presets
 */
export const generateImageWithAspectRatio = async (
  prompt: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
  model: DeApiImageModel = "Flux1schnell",
  negativePrompt?: string
): Promise<string> => {
  const dimensions = getDeApiDimensions(aspectRatio);

  return generateImageWithDeApi({
    prompt,
    model,
    width: dimensions.width,
    height: dimensions.height,
    negative_prompt: negativePrompt,
  });
};

// ============================================================
// Cost Estimation
// ============================================================

/**
 * Pricing per DeAPI documentation (approximate, may change):
 * - txt2img (Flux): $0.00136 per 512×512 image at 4 steps
 * - img2video: ~$0.02-0.05 per 4-second clip (varies by resolution)
 * - txt2video: ~$0.03-0.08 per 4-second clip
 */
export interface CostEstimate {
  imageCount: number;
  videoCount: number;
  estimatedCostUSD: number;
  breakdown: {
    images: number;
    videos: number;
  };
}

/**
 * Estimate the cost of a batch generation job.
 * Note: These are approximate costs based on public pricing. Actual costs may vary.
 *
 * @param imageCount - Number of images to generate
 * @param videoCount - Number of videos to generate
 * @param resolution - Target resolution (affects pricing)
 * @returns Cost estimate with breakdown
 */
export const estimateBatchCost = (
  imageCount: number,
  videoCount: number,
  resolution: "16:9" | "9:16" | "1:1" = "16:9"
): CostEstimate => {
  // Base costs (approximate)
  const IMAGE_COST_BASE = 0.00136; // per 512x512 at 4 steps
  const VIDEO_COST_BASE = 0.03;    // per 4-second clip at 768x432

  // Resolution multipliers (larger = more expensive)
  const resolutionMultiplier = resolution === "1:1" ? 1.2 : 1.0;

  const imageCost = imageCount * IMAGE_COST_BASE * resolutionMultiplier * 2; // 768px is ~2x 512px
  const videoCost = videoCount * VIDEO_COST_BASE * resolutionMultiplier;

  return {
    imageCount,
    videoCount,
    estimatedCostUSD: Math.round((imageCost + videoCost) * 1000) / 1000,
    breakdown: {
      images: Math.round(imageCost * 1000) / 1000,
      videos: Math.round(videoCost * 1000) / 1000,
    },
  };
};

/**
 * Check if the user has sufficient credits for a batch job.
 * This would require an API call to DeAPI's account endpoint.
 */
export const checkCredits = async (): Promise<{ available: number; sufficient: boolean } | null> => {
  // TODO: Implement when DeAPI provides account balance endpoint
  // For now, return null to indicate unknown
  return null;
};

// ============================================================
// Batch Generation with Concurrency Control
// ============================================================

export interface BatchGenerationItem {
  id: string;
  prompt: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  model?: DeApiImageModel;
  negativePrompt?: string;
}

export interface BatchGenerationResult {
  id: string;
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export interface BatchGenerationProgress {
  completed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
  results: BatchGenerationResult[];
}

/**
 * Simple semaphore for controlling concurrent operations
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

/**
 * Generate multiple images concurrently with configurable concurrency limit.
 * This dramatically speeds up batch generation by running multiple DeAPI requests in parallel.
 *
 * @param items - Array of generation items with prompts and settings
 * @param concurrencyLimit - Maximum number of concurrent requests (default: 5, max recommended: 10)
 * @param onProgress - Optional callback for progress updates
 * @returns Array of results with success/failure status for each item
 */
export const generateImageBatch = async (
  items: BatchGenerationItem[],
  concurrencyLimit: number = 5,
  onProgress?: (progress: BatchGenerationProgress) => void
): Promise<BatchGenerationResult[]> => {
  if (!isDeApiConfigured()) {
    throw new Error("DeAPI API key is not configured.");
  }

  if (items.length === 0) {
    return [];
  }

  // Clamp concurrency to reasonable limits
  const effectiveConcurrency = Math.max(1, Math.min(concurrencyLimit, 10));
  const semaphore = new Semaphore(effectiveConcurrency);
  const results: BatchGenerationResult[] = [];
  let completed = 0;

  const totalBatches = Math.ceil(items.length / effectiveConcurrency);

  console.log(`[DeAPI Batch] Starting batch generation: ${items.length} items, concurrency: ${effectiveConcurrency}`);

  const processItem = async (item: BatchGenerationItem): Promise<BatchGenerationResult> => {
    await semaphore.acquire();

    try {
      console.log(`[DeAPI Batch] Processing item ${item.id}: ${item.prompt.substring(0, 50)}...`);

      const imageUrl = await generateImageWithAspectRatio(
        item.prompt,
        item.aspectRatio || "16:9",
        item.model || "Flux1schnell",
        item.negativePrompt
      );

      return {
        id: item.id,
        success: true,
        imageUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DeAPI Batch] Failed to generate item ${item.id}:`, errorMessage);

      return {
        id: item.id,
        success: false,
        error: errorMessage,
      };
    } finally {
      semaphore.release();
      completed++;

      // Report progress
      const currentBatch = Math.ceil(completed / effectiveConcurrency);
      onProgress?.({
        completed,
        total: items.length,
        currentBatch,
        totalBatches,
        results: [...results],
      });
    }
  };

  // Launch all requests concurrently - semaphore will control actual parallelism
  const promises = items.map(processItem);
  const allResults = await Promise.all(promises);

  // Sort results to match original order
  const resultMap = new Map(allResults.map(r => [r.id, r]));
  const orderedResults = items.map(item => resultMap.get(item.id)!);

  const successCount = orderedResults.filter(r => r.success).length;
  console.log(`[DeAPI Batch] Batch complete: ${successCount}/${items.length} successful`);

  return orderedResults;
};

/**
 * Generate multiple videos concurrently with configurable concurrency limit.
 * Note: Video generation is more resource-intensive, so lower concurrency is recommended.
 *
 * @param items - Array of images to animate with their prompts
 * @param concurrencyLimit - Maximum concurrent animations (default: 2, max recommended: 4)
 * @param onProgress - Optional callback for progress updates
 */
/**
 * Generate video directly from text prompt using txt2video endpoint.
 * This bypasses the two-step image→video workflow for faster generation.
 *
 * @param prompt - Text description of the video scene
 * @param aspectRatio - Aspect ratio for the video
 * @param durationFrames - Number of frames (default: 120 = 4 seconds at 30fps)
 * @returns Base64-encoded video data URL
 */
export const generateVideoFromText = async (
  prompt: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
  durationFrames: number = 120
): Promise<string> => {
  if (!isDeApiConfigured()) {
    throw new Error("DeAPI API key is not configured.");
  }

  const { width, height } = getDeApiDimensions(aspectRatio);

  console.log(`[DeAPI] Generating video from text: ${width}x${height}, ${durationFrames} frames`);
  console.log(`[DeAPI] Prompt: ${prompt.substring(0, 80)}...`);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (!isBrowser) {
    headers.Authorization = `Bearer ${API_KEY}`;
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LyricLens/1.0";
  }

  const response = await fetch(`${API_BASE}/txt2video`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt,
      model: DEFAULT_VIDEO_MODEL,
      width,
      height,
      guidance: 3,
      steps: 1, // Distilled model
      frames: durationFrames,
      fps: 30,
      seed: -1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeAPI txt2video failed (${response.status}): ${errText.substring(0, 200)}`);
  }

  const rawData = await response.json();
  const data: DeApiResponse = rawData.data || rawData;

  let videoUrl: string;

  if (data.result_url) {
    videoUrl = data.result_url;
  } else if (data.request_id) {
    console.log(`[DeAPI] Polling for txt2video request: ${data.request_id}`);
    videoUrl = await pollRequest(data.request_id);
  } else {
    throw new Error("No request_id or result_url received from DeAPI txt2video");
  }

  // Download and convert to base64
  const vidResp = await fetch(videoUrl);
  if (!vidResp.ok) {
    throw new Error(`Failed to download video: ${vidResp.status}`);
  }

  const vidBlob = await vidResp.blob();
  console.log(`[DeAPI] Video downloaded: ${(vidBlob.size / 1024 / 1024).toFixed(2)} MB`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to convert video to base64"));
    reader.readAsDataURL(vidBlob);
  });
};

export const animateImageBatch = async (
  items: Array<{
    id: string;
    imageUrl: string;
    prompt: string;
    aspectRatio?: "16:9" | "9:16" | "1:1";
  }>,
  concurrencyLimit: number = 2,
  onProgress?: (progress: BatchGenerationProgress) => void
): Promise<BatchGenerationResult[]> => {
  if (!isDeApiConfigured()) {
    throw new Error("DeAPI API key is not configured.");
  }

  if (items.length === 0) {
    return [];
  }

  // Lower concurrency for video generation (more resource intensive)
  const effectiveConcurrency = Math.max(1, Math.min(concurrencyLimit, 4));
  const semaphore = new Semaphore(effectiveConcurrency);
  const results: BatchGenerationResult[] = [];
  let completed = 0;

  const totalBatches = Math.ceil(items.length / effectiveConcurrency);

  console.log(`[DeAPI Batch] Starting video batch: ${items.length} items, concurrency: ${effectiveConcurrency}`);

  const processItem = async (item: typeof items[0]): Promise<BatchGenerationResult> => {
    await semaphore.acquire();

    try {
      console.log(`[DeAPI Batch] Animating item ${item.id}...`);

      const videoUrl = await animateImageWithDeApi(
        item.imageUrl,
        item.prompt,
        item.aspectRatio || "16:9"
      );

      return {
        id: item.id,
        success: true,
        imageUrl: videoUrl,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DeAPI Batch] Failed to animate item ${item.id}:`, errorMessage);

      return {
        id: item.id,
        success: false,
        error: errorMessage,
      };
    } finally {
      semaphore.release();
      completed++;

      const currentBatch = Math.ceil(completed / effectiveConcurrency);
      onProgress?.({
        completed,
        total: items.length,
        currentBatch,
        totalBatches,
        results: [...results],
      });
    }
  };

  const promises = items.map(processItem);
  const allResults = await Promise.all(promises);

  const resultMap = new Map(allResults.map(r => [r.id, r]));
  const orderedResults = items.map(item => resultMap.get(item.id)!);

  const successCount = orderedResults.filter(r => r.success).length;
  console.log(`[DeAPI Batch] Video batch complete: ${successCount}/${items.length} successful`);

  return orderedResults;
};
