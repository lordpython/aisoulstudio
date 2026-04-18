/**
 * DeAPI internal configuration, shared utilities, and singletons.
 * Not exported publicly — consumed by other deapiService modules.
 */

import type { DeApiResponse } from './types';
import { mediaLogger } from '../../infrastructure/logger';

const log = mediaLogger.child('DeAPI');

export const DEAPI_DIRECT_BASE = "https://api.deapi.ai/api/v1/client";
export const PROXY_BASE = "/api/deapi/proxy";
export const DEFAULT_VIDEO_MODEL = 'Ltx2_3_22B_Dist_INT8';
export const DEFAULT_IMAGE_MODEL = 'Flux1schnell';

const RATE_LIMIT_MS = 60 * 1000;
const GLOBAL_THROTTLE_MS = 3500;
const HOURLY_BUDGET_DEFAULT = 18;
const HOUR_MS = 60 * 60 * 1000;

const readEnvInt = (name: string, fallback: number): number => {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// --- Typed Errors ---

export class DeApiRateLimitError extends Error {
  readonly status = 429;
  constructor(message = 'DeAPI rate limit (429)') {
    super(message);
    this.name = 'DeApiRateLimitError';
  }
}

export class DeApiPayloadError extends Error {
  readonly status = 422;
  constructor(message = 'DeAPI payload rejected (422)') {
    super(message);
    this.name = 'DeApiPayloadError';
  }
}

export class RateBudgetExceededError extends Error {
  constructor(public readonly resetMs: number, message = 'DeAPI hourly request budget exhausted') {
    super(message);
    this.name = 'RateBudgetExceededError';
  }
}

// API key is server-only — never read from VITE_ env vars so it isn't inlined
// into the browser bundle. Browser requests are proxied through /api/deapi/proxy.
export const API_KEY = (typeof process !== 'undefined' && process.env?.DEAPI_API_KEY) || "";

export const isBrowser = typeof window !== 'undefined';
export const API_BASE = isBrowser ? PROXY_BASE : DEAPI_DIRECT_BASE;

// --- Rate Limiter ---

class RateLimiter {
  private lastRequestTime: number = 0;
  private queue: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private isProcessing: boolean = false;
  private readonly minSpacingMs: number;
  private readonly hourlyBudget: number;
  private requestTimestamps: number[] = [];

  constructor(minSpacingMs: number, hourlyBudget: number = 0) {
    this.minSpacingMs = minSpacingMs;
    this.hourlyBudget = hourlyBudget;
  }

  async waitForSlot(): Promise<void> {
    if (this.hourlyBudget > 0) {
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(t => now - t < HOUR_MS);
      if (this.requestTimestamps.length >= this.hourlyBudget) {
        const oldest = this.requestTimestamps[0] ?? now;
        const resetMs = HOUR_MS - (now - oldest);
        throw new RateBudgetExceededError(
          resetMs,
          `DeAPI hourly request budget exhausted (${this.hourlyBudget}/hr). Resets in ${Math.ceil(resetMs / 60000)} min.`
        );
      }
    }

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
      const waitTime = this.minSpacingMs - timeSinceLastRequest;

      if (waitTime > 0 && this.lastRequestTime > 0) {
        if (waitTime >= 1000) {
          log.info(`Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before next request (${this.queue.length} in queue)`);
        }
        await new Promise(r => setTimeout(r, waitTime));
      }

      const item = this.queue.shift();
      if (item) {
        const ts = Date.now();
        this.lastRequestTime = ts;
        if (this.hourlyBudget > 0) this.requestTimestamps.push(ts);
        item.resolve();
      }
    }

    this.isProcessing = false;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getEstimatedWaitTime(): number {
    if (this.lastRequestTime === 0) return 0;
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const waitTime = this.minSpacingMs - timeSinceLastRequest;
    const queueWait = this.queue.length * this.minSpacingMs;
    return Math.max(0, Math.ceil((waitTime + queueWait) / 1000));
  }

  getRemainingBudget(): number {
    if (this.hourlyBudget <= 0) return Infinity;
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < HOUR_MS);
    return Math.max(0, this.hourlyBudget - this.requestTimestamps.length);
  }
}

export const img2videoRateLimiter = new RateLimiter(RATE_LIMIT_MS);

// Shared global throttle covering txt2img / img2img / img2video, with an hourly budget
// to prevent overshooting basic-tier quotas (~20 req/hr).
export const deapiGlobalLimiter = new RateLimiter(
  GLOBAL_THROTTLE_MS,
  readEnvInt('DEAPI_HOURLY_BUDGET', HOURLY_BUDGET_DEFAULT)
);

// --- Tier Detection ---

export type DeApiTierInternal = "basic" | "premium" | "unknown";

let detectedTier: DeApiTierInternal = "unknown";
let consecutiveSuccesses = 0;
let lastRateLimitTime = 0;

export const detectTierInternal = (wasRateLimited: boolean): DeApiTierInternal => {
  if (wasRateLimited) {
    lastRateLimitTime = Date.now();
    consecutiveSuccesses = 0;
    detectedTier = "basic";
  } else {
    consecutiveSuccesses++;
    if (consecutiveSuccesses > 20 && Date.now() - lastRateLimitTime > 60000) {
      detectedTier = "premium";
    }
  }
  return detectedTier;
};

export const getDetectedTier = (): DeApiTierInternal => detectedTier;

// --- Exponential Backoff ---

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

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
      detectTierInternal(false);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Never retry payload-rejection or budget-exhaustion errors
      if (lastError instanceof DeApiPayloadError ||
          lastError instanceof RateBudgetExceededError ||
          lastError.message.includes('422')) {
        throw lastError;
      }

      const isRateLimit = lastError instanceof DeApiRateLimitError ||
                          lastError.message.includes('429') ||
                          lastError.message.toLowerCase().includes('rate limit');

      if (isRateLimit) {
        detectTierInternal(true);
      }

      const isRetryable = isRateLimit ||
                          lastError.message.includes('503') ||
                          lastError.message.includes('502') ||
                          lastError.message.toLowerCase().includes('timeout') ||
                          lastError.message.toLowerCase().includes('failed to fetch') ||
                          lastError.message.toLowerCase().includes('connection reset') ||
                          lastError.message.toLowerCase().includes('network error');

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      log.info(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier + Math.random() * 1000, maxDelayMs);
    }
  }

  throw lastError || new Error('Unknown error in retry loop');
};

// --- Shared Helpers ---

export const base64ToBlob = async (base64Data: string): Promise<Blob> => {
  const base64Response = await fetch(base64Data);
  return await base64Response.blob();
};

export const getDeApiDimensions = (
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
): { width: number; height: number } => {
  switch (aspectRatio) {
    case "16:9":
      return { width: 768, height: 512 };
    case "9:16":
      return { width: 512, height: 768 };
    case "1:1":
      return { width: 768, height: 768 };
    default:
      return { width: 768, height: 768 };
  }
};

export const pollRequest = async (
  requestId: string,
  onProgress?: (progress: number, preview?: string) => void
): Promise<string> => {
  if (isBrowser) {
    try {
      const { waitForJobViaWebSocket, isWebSocketAvailable } = await import('../deapiWebSocket.js');
      if (isWebSocketAvailable()) {
        log.info(`Using WebSocket for request: ${requestId}`);
        const wsResult = await waitForJobViaWebSocket(requestId, onProgress);
        if (wsResult !== null) return wsResult;
        log.info(`WebSocket timed out, falling back to polling for ${requestId}`);
      }
    } catch {
      // pusher-js unavailable or module missing — fall through to polling
    }
  }

  const maxAttempts = 60;
  const baseDelayMs = 3000;
  const maxDelayMs = 15000;
  const maxConsecutive429 = 5;

  let consecutive429Count = 0;
  let currentDelay = baseDelayMs;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
    }

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if (!isBrowser) {
        headers.Authorization = `Bearer ${API_KEY}`;
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AISoulStudio/1.0";
      }

      const response = await fetch(`${API_BASE}/request-status/${requestId}`, { headers });

      if (response.status === 429) {
        consecutive429Count++;
        log.warn(`Rate limited (429) - attempt ${consecutive429Count}/${maxConsecutive429}`);

        if (consecutive429Count >= maxConsecutive429) {
          throw new Error("DeAPI rate limit exceeded. Too many requests - please wait a few minutes before trying again.");
        }

        currentDelay = Math.min(currentDelay * 2, maxDelayMs);

        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          const retryMs = parseInt(retryAfter, 10) * 1000;
          if (!isNaN(retryMs) && retryMs > 0) {
            currentDelay = Math.min(retryMs, 60000);
            log.info(`Retry-After header: waiting ${currentDelay / 1000}s`);
          }
        }

        continue;
      }

      consecutive429Count = 0;
      currentDelay = baseDelayMs;

      if (!response.ok) {
        log.warn(`Polling error: ${response.status} - retrying...`);
        currentDelay = Math.min(currentDelay * 1.5, maxDelayMs);
        continue;
      }

      const rawData = await response.json();
      const data = (rawData.data || rawData) as DeApiResponse;

      if (data.status === "done" && data.result_url) {
        log.info(`Generation complete after ${attempt + 1} polls`);
        return data.result_url;
      }

      if (data.status === "error") {
        throw new Error(data.error || "Generation failed at provider");
      }

      if (data.progress) {
        log.debug(`Progress: ${data.progress}% (poll ${attempt + 1}/${maxAttempts})`);
        const progressValue = parseFloat(data.progress);
        if (!Number.isNaN(progressValue)) {
          onProgress?.(progressValue, data.preview ?? undefined);
        }
      } else if (data.preview) {
        onProgress?.(0, data.preview);
      } else {
        log.debug(`Status: ${data.status || 'pending'} (poll ${attempt + 1}/${maxAttempts})`);
      }
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : '';
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorName === "TypeError" || errorMessage.includes("fetch")) {
        log.warn(`Network error during poll: ${errorMessage}`);
        currentDelay = Math.min(currentDelay * 1.5, maxDelayMs);
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Video generation timed out after ${maxAttempts} polling attempts (~${Math.round((maxAttempts * baseDelayMs) / 60000)} minutes)`
  );
};

// --- Semaphore ---

export class Semaphore {
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
