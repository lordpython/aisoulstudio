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

// @ts-ignore - Vite injects import.meta.env at build time
const VITE_API_KEY = import.meta.env?.VITE_DEAPI_API_KEY || "";
export const API_KEY = VITE_API_KEY || (typeof process !== 'undefined' && process.env?.DEAPI_API_KEY) || "";

export const isBrowser = typeof window !== 'undefined';
export const API_BASE = isBrowser ? PROXY_BASE : DEAPI_DIRECT_BASE;

// --- Rate Limiter ---

class RateLimiter {
  private lastRequestTime: number = 0;
  private queue: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private isProcessing: boolean = false;

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
        log.info(`Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before next request (${this.queue.length} in queue)`);
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

  getQueueLength(): number {
    return this.queue.length;
  }

  getEstimatedWaitTime(): number {
    if (this.lastRequestTime === 0) return 0;
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
    const queueWait = this.queue.length * RATE_LIMIT_MS;
    return Math.max(0, Math.ceil((waitTime + queueWait) / 1000));
  }
}

export const img2videoRateLimiter = new RateLimiter();

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

      const isRateLimit = lastError.message.includes('429') ||
                          lastError.message.toLowerCase().includes('rate limit');

      if (isRateLimit) {
        detectTierInternal(true);
      }

      const isRetryable = isRateLimit ||
                          lastError.message.includes('503') ||
                          lastError.message.includes('502') ||
                          lastError.message.toLowerCase().includes('timeout');

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
