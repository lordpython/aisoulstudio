/**
 * Robust Utility Functions for AI Orchestration
 *
 * Provides production-grade utilities for:
 * - Timeout protection for async operations
 * - Retry with exponential backoff
 * - Blob URL lifecycle management (prevents memory leaks)
 * - Safe localStorage operations with size limits
 * - AbortController helpers for cancellation
 * - JSON extraction with multiple fallback strategies
 *
 * @module robustUtils
 */

// ============================================================
// TIMEOUT UTILITIES
// ============================================================

/**
 * Wraps a promise with a timeout.
 * Rejects with a TimeoutError if the promise doesn't resolve within the specified time.
 *
 * @example
 * const result = await withTimeout(
 *   fetchData(),
 *   30000,
 *   'Data fetch timed out'
 * );
 *
 * @param promise - The promise to wrap
 * @param ms - Timeout in milliseconds
 * @param message - Optional custom timeout message
 * @returns The resolved value or throws TimeoutError
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Operation timed out'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${message} after ${ms}ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Creates an AbortController with automatic timeout.
 * Useful for fetch operations that need cancellation support.
 *
 * @example
 * const { signal, cleanup } = createTimeoutAbortController(30000);
 * try {
 *   await fetch(url, { signal });
 * } finally {
 *   cleanup();
 * }
 *
 * @param ms - Timeout in milliseconds
 * @returns AbortController signal and cleanup function
 */
export function createTimeoutAbortController(ms: number): {
  controller: AbortController;
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${ms}ms`));
  }, ms);

  return {
    controller,
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
    },
  };
}

// ============================================================
// RETRY UTILITIES
// ============================================================

/**
 * Options for retry logic.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Base delay between retries in ms */
  baseDelay?: number;
  /** Maximum delay cap in ms */
  maxDelay?: number;
  /** Backoff multiplier (e.g., 2 for exponential) */
  backoffFactor?: number;
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
  /** Function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'isRetryable' | 'signal'>> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
};

/**
 * Default function to determine if an error is retryable.
 * Retries on network errors, rate limits, and server errors.
 */
export function isDefaultRetryable(error: Error): boolean {
  const message = error.message?.toLowerCase() || '';
  const name = error.name?.toLowerCase() || '';

  // Check for specific error types
  if (name === 'timeouterror') return true;
  if (name === 'aborterror') return false; // User-initiated abort, don't retry

  // Network errors
  if (message.includes('network') || message.includes('fetch failed')) return true;

  // Rate limiting
  if (message.includes('429') || message.includes('rate limit')) return true;

  // Server errors (5xx)
  if (message.includes('500') || message.includes('502') ||
      message.includes('503') || message.includes('504')) return true;

  // Generic transient errors
  if (message.includes('internal') || message.includes('unavailable')) return true;

  return false;
}

/**
 * Retries an async function with exponential backoff.
 *
 * @example
 * const result = await withRetry(
 *   async () => fetchFromAPI(),
 *   {
 *     maxRetries: 5,
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`)
 *   }
 * );
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns The resolved value or throws after all retries exhausted
 */
export async function withRetryBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries,
    baseDelay = DEFAULT_RETRY_OPTIONS.baseDelay,
    maxDelay = DEFAULT_RETRY_OPTIONS.maxDelay,
    backoffFactor = DEFAULT_RETRY_OPTIONS.backoffFactor,
    onRetry,
    isRetryable = isDefaultRetryable,
    signal,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check for abort before each attempt
    if (signal?.aborted) {
      throw new Error('Operation was aborted');
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if not retryable or we've exhausted retries
      if (!isRetryable(lastError) || attempt === maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff, capped at maxDelay
      const delay = Math.min(
        baseDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );

      // Add jitter (10-20% random variation) to prevent thundering herd
      const jitter = delay * (0.1 + Math.random() * 0.1);
      const finalDelay = Math.round(delay + jitter);

      // Notify caller of retry
      onRetry?.(attempt + 1, lastError, finalDelay);
      console.warn(
        `[Retry] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}. ` +
        `Retrying in ${finalDelay}ms...`
      );

      // Wait before retry
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(resolve, finalDelay);

        // Allow abort during delay
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new Error('Operation was aborted during retry delay'));
          }, { once: true });
        }
      });
    }
  }

  throw lastError!;
}

// ============================================================
// BLOB URL MANAGEMENT
// ============================================================

/**
 * BlobManager provides centralized Blob URL lifecycle management.
 * Prevents memory leaks by tracking and properly revoking URLs.
 *
 * @example
 * const blobManager = BlobManager.getInstance();
 * const url = blobManager.create(myBlob);
 * // Use the URL...
 * blobManager.revoke(url); // Or call revokeAll() on component unmount
 */
export class BlobManager {
  private urls = new Map<string, { createdAt: number; size: number }>();
  private static instance: BlobManager;

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): BlobManager {
    if (!BlobManager.instance) {
      BlobManager.instance = new BlobManager();
    }
    return BlobManager.instance;
  }

  /**
   * Create a Blob URL and register it for tracking.
   * @param blob - The Blob to create a URL for
   * @returns The created Object URL
   */
  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.set(url, {
      createdAt: Date.now(),
      size: blob.size,
    });
    console.log(`[BlobManager] Created URL (total: ${this.urls.size}, size: ${this.formatBytes(blob.size)})`);
    return url;
  }

  /**
   * Revoke a specific Blob URL.
   * Safe to call multiple times with same URL.
   * @param url - The URL to revoke
   * @returns true if the URL was found and revoked
   */
  revoke(url: string): boolean {
    if (this.urls.has(url)) {
      URL.revokeObjectURL(url);
      const info = this.urls.get(url)!;
      this.urls.delete(url);
      console.log(
        `[BlobManager] Revoked URL (remaining: ${this.urls.size}, ` +
        `was alive: ${Math.round((Date.now() - info.createdAt) / 1000)}s)`
      );
      return true;
    }
    return false;
  }

  /**
   * Revoke all tracked Blob URLs.
   * Call this on component unmount or when resetting state.
   */
  revokeAll(): void {
    const count = this.urls.size;
    if (count === 0) return;

    console.log(`[BlobManager] Revoking all ${count} URLs`);
    this.urls.forEach((_, url) => URL.revokeObjectURL(url));
    this.urls.clear();
  }

  /**
   * Get current statistics about tracked URLs.
   */
  getStats(): { count: number; totalSize: number; oldestAge: number } {
    let totalSize = 0;
    let oldestCreatedAt = Date.now();

    this.urls.forEach(info => {
      totalSize += info.size;
      if (info.createdAt < oldestCreatedAt) {
        oldestCreatedAt = info.createdAt;
      }
    });

    return {
      count: this.urls.size,
      totalSize,
      oldestAge: this.urls.size > 0 ? Date.now() - oldestCreatedAt : 0,
    };
  }

  /**
   * Check if a URL is being tracked.
   */
  isTracked(url: string): boolean {
    return this.urls.has(url);
  }

  /**
   * Revoke URLs older than a specified age.
   * Useful for periodic cleanup of leaked URLs.
   * @param maxAgeMs - Maximum age in milliseconds
   * @returns Number of URLs revoked
   */
  revokeOlderThan(maxAgeMs: number): number {
    const now = Date.now();
    let revokedCount = 0;

    this.urls.forEach((info, url) => {
      if (now - info.createdAt > maxAgeMs) {
        URL.revokeObjectURL(url);
        this.urls.delete(url);
        revokedCount++;
      }
    });

    if (revokedCount > 0) {
      console.log(`[BlobManager] Revoked ${revokedCount} stale URLs (older than ${maxAgeMs / 1000}s)`);
    }

    return revokedCount;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
}

// ============================================================
// SAFE LOCALSTORAGE UTILITIES
// ============================================================

/**
 * Maximum size for localStorage values (4MB to leave room for other data).
 */
const DEFAULT_MAX_SIZE_KB = 4000;

/**
 * Safe localStorage operations with size limits and error handling.
 * Prevents quota exceeded errors and handles malformed data gracefully.
 */
export const safeLocalStorage = {
  /**
   * Safely set a value in localStorage with size validation.
   * @param key - Storage key
   * @param value - Value to store (will be JSON stringified)
   * @param maxSizeKB - Maximum size in KB (default: 4000)
   * @returns true if successful, false if failed or too large
   */
  set: (key: string, value: unknown, maxSizeKB = DEFAULT_MAX_SIZE_KB): boolean => {
    try {
      const json = JSON.stringify(value);
      const sizeKB = json.length / 1024;

      if (sizeKB > maxSizeKB) {
        console.warn(
          `[Storage] ${key} exceeds ${maxSizeKB}KB (${Math.round(sizeKB)}KB), skipping save`
        );
        return false;
      }

      localStorage.setItem(key, json);
      return true;
    } catch (error) {
      // Handle quota exceeded or other storage errors
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.error(`[Storage] Quota exceeded when saving ${key}. Clearing old data...`);
        // Could implement LRU cleanup here
      } else {
        console.error(`[Storage] Failed to save ${key}:`, error);
      }
      return false;
    }
  },

  /**
   * Safely get a value from localStorage with fallback.
   * @param key - Storage key
   * @param fallback - Value to return if key doesn't exist or is invalid
   * @returns Parsed value or fallback
   */
  get: <T>(key: string, fallback: T): T => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return fallback;
      return JSON.parse(item) as T;
    } catch (error) {
      console.warn(`[Storage] Failed to parse ${key}, using fallback:`, error);
      return fallback;
    }
  },

  /**
   * Remove a key from localStorage.
   * @param key - Storage key to remove
   */
  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`[Storage] Failed to remove ${key}:`, error);
    }
  },

  /**
   * Get the current size of a stored value in bytes.
   * @param key - Storage key
   * @returns Size in bytes, or 0 if not found
   */
  getSize: (key: string): number => {
    const item = localStorage.getItem(key);
    return item ? new Blob([item]).size : 0;
  },

  /**
   * Get total localStorage usage.
   * @returns Total size in bytes
   */
  getTotalSize: (): number => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          total += key.length + value.length;
        }
      }
    }
    // UTF-16 encoding uses 2 bytes per character
    return total * 2;
  },
};

// ============================================================
// JSON EXTRACTION UTILITIES
// ============================================================

/**
 * Robust JSON extraction from AI responses with multiple fallback strategies.
 * Handles common LLM output patterns like markdown code blocks, wrapped text, etc.
 *
 * @example
 * const data = extractJSONFromResponse<MyType>(llmResponse);
 * if (data) {
 *   // Use the extracted data
 * }
 *
 * @param response - Raw string response from LLM
 * @returns Parsed JSON object or null if extraction failed
 */
export function extractJSONFromResponse<T = unknown>(response: string): T | null {
  if (!response || typeof response !== 'string') {
    return null;
  }

  const strategies: Array<() => unknown> = [
    // Strategy 1: Direct parse (response is pure JSON)
    () => JSON.parse(response.trim()),

    // Strategy 2: Extract from ```json ... ``` block
    () => {
      const match = response.match(/```json\s*([\s\S]*?)\s*```/i);
      if (!match || !match[1]) throw new Error('No json block found');
      return JSON.parse(match[1].trim());
    },

    // Strategy 3: Extract from ``` ... ``` block (without json tag)
    () => {
      const match = response.match(/```\s*([\s\S]*?)\s*```/);
      if (!match || !match[1]) throw new Error('No code block found');
      return JSON.parse(match[1].trim());
    },

    // Strategy 4: Find first { ... } object
    () => {
      const match = response.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No object found');
      return JSON.parse(match[0]);
    },

    // Strategy 5: Find first [ ... ] array
    () => {
      const match = response.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No array found');
      return JSON.parse(match[0]);
    },

    // Strategy 6: Remove common prefixes/suffixes and try again
    () => {
      const cleaned = response
        .replace(/^[\s\S]*?(?=[\[{])/, '') // Remove everything before first [ or {
        .replace(/[\]}][\s\S]*$/, (match) => match[0] ?? "") // Keep only up to last ] or }
        .trim();
      return JSON.parse(cleaned);
    },

    // Strategy 7: Fix common JSON issues and retry
    () => {
      let fixed = response
        .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Quote unquoted keys
        .replace(/:\s*'([^']*)'/g, ': "$1"') // Convert single quotes to double
        .replace(/\n/g, '\\n') // Escape newlines in strings
        .trim();

      // Find the JSON part
      const start = fixed.indexOf('{');
      const end = fixed.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No object boundaries');

      return JSON.parse(fixed.substring(start, end + 1));
    },
  ];

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    if (!strategy) continue;
    try {
      const result = strategy();
      if (result !== null && result !== undefined) {
        console.log(`[JSONExtract] Succeeded with strategy ${i + 1}`);
        return result as T;
      }
    } catch {
      // Strategy failed, try next
      continue;
    }
  }

  console.warn('[JSONExtract] All strategies failed. Response preview:', response.substring(0, 200));
  return null;
}

/**
 * Extract JSON with schema validation using a custom validator function.
 *
 * @param response - Raw string response from LLM
 * @param validate - Validation function (e.g., Zod schema.parse)
 * @returns Validated data or null
 */
export function extractAndValidateJSON<T>(
  response: string,
  validate: (data: unknown) => T
): T | null {
  const extracted = extractJSONFromResponse(response);
  if (extracted === null) return null;

  try {
    return validate(extracted);
  } catch (error) {
    console.warn('[JSONExtract] Validation failed:', error);
    return null;
  }
}

// ============================================================
// ASYNC OPERATION HELPERS
// ============================================================

/**
 * Creates a deferred promise that can be resolved/rejected externally.
 * Useful for complex async workflows.
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Runs multiple promises concurrently with a limit on concurrent executions.
 * Prevents overwhelming APIs with too many simultaneous requests.
 *
 * @param items - Array of items to process
 * @param fn - Async function to run for each item
 * @param concurrency - Maximum concurrent executions
 * @returns Array of results (or errors) in same order as input
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<Array<R | Error>> {
  const results: Array<R | Error> = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];
      if (item === undefined) continue;

      try {
        results[index] = await fn(item, index);
      } catch (error) {
        results[index] = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  // Start workers
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

/**
 * Sleep for a specified duration.
 * Supports cancellation via AbortSignal.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Sleep was aborted'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new Error('Sleep was aborted'));
    }, { once: true });
  });
}

// ============================================================
// ERROR HANDLING UTILITIES
// ============================================================

/**
 * Wraps an async function to catch and log errors without throwing.
 * Returns the error instead of throwing.
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<{ data: T; error: null } | { data: null; error: Error }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (context) {
      console.error(`[${context}] ${err.message}`);
    }
    return { data: null, error: err };
  }
}

/**
 * Creates a logger with a service prefix for consistent logging.
 */
export function createServiceLogger(serviceName: string) {
  const prefix = `[${serviceName}]`;

  return {
    info: (message: string, data?: unknown) => {
      console.log(`${prefix} ${message}`, data ?? '');
    },
    warn: (message: string, data?: unknown) => {
      console.warn(`${prefix} ${message}`, data ?? '');
    },
    error: (message: string, data?: unknown) => {
      console.error(`${prefix} ${message}`, data ?? '');
    },
    debug: (message: string, data?: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`${prefix} ${message}`, data ?? '');
      }
    },
  };
}
