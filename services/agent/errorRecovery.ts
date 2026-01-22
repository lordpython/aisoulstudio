/**
 * Error Recovery System for Production Agent
 * 
 * Provides:
 * - Retry logic with exponential backoff for transient failures
 * - Fallback behaviors for each tool
 * - Partial success tracking and reporting
 * - Error categorization (transient, recoverable, fatal)
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

// --- Error Categories ---

export type ErrorCategory = 'transient' | 'recoverable' | 'fatal';

/**
 * Structured tool error with recovery information.
 * 
 * Requirement 6.4: Track errors in session state
 */
export interface ToolError {
    /** Name of the tool that failed */
    tool: string;
    /** Scene index if applicable (for per-scene operations) */
    sceneIndex?: number;
    /** Human-readable error message */
    error: string;
    /** Error category for recovery decision */
    category: ErrorCategory;
    /** Timestamp when error occurred */
    timestamp: number;
    /** Number of retry attempts made */
    retryCount: number;
    /** Whether this error is recoverable */
    recoverable: boolean;
    /** Fallback action taken (if any) */
    fallbackApplied?: string;
}

/**
 * Recovery strategy configuration for a tool.
 */
export interface RecoveryStrategy {
    /** Tool name this strategy applies to */
    tool: string;
    /** Maximum number of retries before giving up */
    maxRetries: number;
    /** Initial delay in ms for exponential backoff */
    initialDelayMs: number;
    /** Backoff multiplier (e.g., 2 = double delay each retry) */
    backoffFactor: number;
    /** Maximum delay in ms (cap for exponential backoff) */
    maxDelayMs: number;
    /** Fallback action to take on failure (null = no fallback) */
    fallbackAction: string | null;
    /** Whether to continue production if this tool fails */
    continueOnFailure: boolean;
    /** Custom error classification function */
    classifyError?: (error: Error) => ErrorCategory;
}

/**
 * Result of a tool execution with retry and recovery.
 */
export interface ToolExecutionResult<T = string> {
    /** Whether the tool succeeded */
    success: boolean;
    /** Result data if successful */
    data?: T;
    /** Error information if failed */
    error?: ToolError;
    /** Whether a fallback was applied */
    fallbackApplied: boolean;
    /** Fallback action name if applied */
    fallbackAction?: string;
    /** Number of retries attempted */
    retryCount: number;
}

/**
 * Partial success report for production run.
 * 
 * Requirement 6.4: Report partial success with details
 */
export interface PartialSuccessReport {
    /** Total number of tools/operations attempted */
    totalAttempted: number;
    /** Number of successful operations */
    succeeded: number;
    /** Number of operations that failed but continued with fallback */
    fallbackApplied: number;
    /** Number of operations that failed permanently */
    failed: number;
    /** Detailed list of all errors encountered */
    errors: ToolError[];
    /** Summary message for user */
    summary: string;
    /** Whether the production is usable despite errors */
    isUsable: boolean;
}

// --- Recovery Strategies ---

/**
 * Pre-configured recovery strategies for each tool.
 * 
 * Requirements: 6.1, 6.2, 6.3, 9.5
 */
export const RECOVERY_STRATEGIES: Record<string, RecoveryStrategy> = {
    // --- CONTENT Group ---
    plan_video: {
        tool: 'plan_video',
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2,
        maxDelayMs: 10000,
        fallbackAction: null, // No fallback - this is required
        continueOnFailure: false,
    },
    narrate_scenes: {
        tool: 'narrate_scenes',
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2,
        maxDelayMs: 10000,
        fallbackAction: null, // No fallback - narration is required
        continueOnFailure: false,
    },
    validate_plan: {
        tool: 'validate_plan',
        maxRetries: 2,
        initialDelayMs: 500,
        backoffFactor: 2,
        maxDelayMs: 5000,
        fallbackAction: 'assume_valid',
        continueOnFailure: true,
    },

    // --- MEDIA Group ---
    generate_visuals: {
        tool: 'generate_visuals',
        maxRetries: 3,
        initialDelayMs: 2000,
        backoffFactor: 2,
        maxDelayMs: 15000,
        fallbackAction: 'use_placeholder',
        continueOnFailure: true, // Requirement 6.1
    },
    animate_image: {
        tool: 'animate_image',
        maxRetries: 2,
        initialDelayMs: 1000,
        backoffFactor: 2,
        maxDelayMs: 10000,
        fallbackAction: 'use_static_image',
        continueOnFailure: true, // Requirement 6.2
    },
    generate_music: {
        tool: 'generate_music',
        maxRetries: 2,
        initialDelayMs: 2000,
        backoffFactor: 2,
        maxDelayMs: 15000,
        fallbackAction: null, // Continue without music
        continueOnFailure: true, // Requirement 6.3
    },
    plan_sfx: {
        tool: 'plan_sfx',
        maxRetries: 2,
        initialDelayMs: 1000,
        backoffFactor: 2,
        maxDelayMs: 8000,
        fallbackAction: null, // Continue without SFX
        continueOnFailure: true,
    },

    // --- ENHANCEMENT Group ---
    remove_background: {
        tool: 'remove_background',
        maxRetries: 2,
        initialDelayMs: 1000,
        backoffFactor: 2,
        maxDelayMs: 8000,
        fallbackAction: 'keep_original_image',
        continueOnFailure: true,
    },
    restyle_image: {
        tool: 'restyle_image',
        maxRetries: 2,
        initialDelayMs: 1000,
        backoffFactor: 2,
        maxDelayMs: 8000,
        fallbackAction: 'keep_original_image',
        continueOnFailure: true,
    },
    mix_audio_tracks: {
        tool: 'mix_audio_tracks',
        maxRetries: 2,
        initialDelayMs: 1000,
        backoffFactor: 2,
        maxDelayMs: 8000,
        fallbackAction: 'use_narration_only',
        continueOnFailure: true,
    },

    // --- EXPORT Group ---
    generate_subtitles: {
        tool: 'generate_subtitles',
        maxRetries: 2,
        initialDelayMs: 500,
        backoffFactor: 2,
        maxDelayMs: 5000,
        fallbackAction: 'skip_subtitles',
        continueOnFailure: true,
    },
    export_final_video: {
        tool: 'export_final_video',
        maxRetries: 2,
        initialDelayMs: 2000,
        backoffFactor: 2,
        maxDelayMs: 15000,
        fallbackAction: 'provide_asset_bundle', // Requirement 9.5
        continueOnFailure: false, // But we provide asset bundle as fallback
    },

    // --- IMPORT Group ---
    import_youtube_content: {
        tool: 'import_youtube_content',
        maxRetries: 3,
        initialDelayMs: 2000,
        backoffFactor: 2,
        maxDelayMs: 15000,
        fallbackAction: null,
        continueOnFailure: false,
    },
    transcribe_audio_file: {
        tool: 'transcribe_audio_file',
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2,
        maxDelayMs: 10000,
        fallbackAction: null,
        continueOnFailure: false,
    },
};

/**
 * Get the recovery strategy for a tool.
 * Returns default strategy if not configured.
 */
export function getRecoveryStrategy(toolName: string): RecoveryStrategy {
    return RECOVERY_STRATEGIES[toolName] || {
        tool: toolName,
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffFactor: 2,
        maxDelayMs: 10000,
        fallbackAction: null,
        continueOnFailure: true,
    };
}

// --- Error Classification ---

/**
 * Classify an error into categories for recovery decisions.
 * 
 * Transient: Network issues, rate limits - worth retrying
 * Recoverable: Tool-specific failure - apply fallback
 * Fatal: Configuration/auth issues - cannot recover
 */
export function classifyError(error: Error, toolName?: string): ErrorCategory {
    const message = error.message?.toLowerCase() || '';
    const statusCode = (error as any).status || (error as any).statusCode;

    // Transient errors - retry with backoff
    if (
        statusCode === 429 ||  // Rate limit
        statusCode === 500 ||  // Internal server error
        statusCode === 503 ||  // Service unavailable
        statusCode === 504 ||  // Gateway timeout
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('fetch failed') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('internal') ||
        message.includes('temporarily unavailable') ||
        message.includes('rate limit') ||
        message.includes('quota exceeded')
    ) {
        return 'transient';
    }

    // Fatal errors - cannot recover
    if (
        statusCode === 401 ||  // Unauthorized
        statusCode === 403 ||  // Forbidden
        message.includes('api key') ||
        message.includes('authentication') ||
        message.includes('not configured') ||
        message.includes('missing required') ||
        message.includes('invalid session')
    ) {
        return 'fatal';
    }

    // Recoverable - tool-specific failures
    return 'recoverable';
}

/**
 * Check if an error is retryable based on its category.
 */
export function isRetryableError(error: Error): boolean {
    const category = classifyError(error);
    return category === 'transient';
}

// --- Retry Logic ---

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff.
 * 
 * Requirement 6.5: Retry transient failures up to 3 times
 * 
 * @param fn Function to execute
 * @param strategy Recovery strategy to use
 * @param onRetry Optional callback for retry events
 * @returns Execution result with retry information
 */
export async function executeWithRetry<T>(
    fn: () => Promise<T>,
    strategy: RecoveryStrategy,
    onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void
): Promise<ToolExecutionResult<T>> {
    let lastError: Error | null = null;
    let retryCount = 0;
    let currentDelay = strategy.initialDelayMs;

    for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
        try {
            const result = await fn();
            return {
                success: true,
                data: result,
                fallbackApplied: false,
                retryCount,
            };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const category = classifyError(lastError, strategy.tool);

            // Log the attempt
            console.warn(
                `[ErrorRecovery] ${strategy.tool} attempt ${attempt + 1}/${strategy.maxRetries + 1} failed:`,
                lastError.message,
                `(category: ${category})`
            );

            // Don't retry fatal errors
            if (category === 'fatal') {
                break;
            }

            // Don't retry if we've exhausted attempts
            if (attempt >= strategy.maxRetries) {
                break;
            }

            // Only retry transient errors
            if (category === 'transient') {
                retryCount++;

                // Notify about retry
                onRetry?.(attempt + 1, lastError, currentDelay);

                // Wait with exponential backoff
                console.log(`[ErrorRecovery] Retrying ${strategy.tool} in ${currentDelay}ms...`);
                await sleep(currentDelay);

                // Increase delay for next attempt (capped at maxDelay)
                currentDelay = Math.min(
                    currentDelay * strategy.backoffFactor,
                    strategy.maxDelayMs
                );
            } else {
                // Recoverable but not transient - don't retry, apply fallback
                break;
            }
        }
    }

    // All attempts failed - return error result
    const category = classifyError(lastError!, strategy.tool);

    return {
        success: false,
        error: {
            tool: strategy.tool,
            error: lastError!.message,
            category,
            timestamp: Date.now(),
            retryCount,
            recoverable: category !== 'fatal' && strategy.continueOnFailure,
        },
        fallbackApplied: false,
        retryCount,
    };
}

// --- Fallback Behaviors ---

/**
 * Fallback handlers for each tool.
 * Returns the fallback result or null if no fallback available.
 */
export type FallbackHandler<T = any> = (
    error: ToolError,
    context: any
) => Promise<T | null>;

const fallbackHandlers: Record<string, FallbackHandler> = {
    /**
     * Requirement 6.1: Use placeholder for failed visual generation
     */
    use_placeholder: async (_error, context) => {
        console.log('[ErrorRecovery] Applying fallback: use_placeholder');
        // Return a placeholder visual result
        return {
            success: true,
            isPlaceholder: true,
            message: 'Using placeholder image due to generation failure',
            imageUrl: null, // UI should show a placeholder
            sceneIndex: context?.sceneIndex,
        };
    },

    /**
     * Requirement 6.2: Keep static image when animation fails
     */
    use_static_image: async (_error, context) => {
        console.log('[ErrorRecovery] Applying fallback: use_static_image');
        return {
            success: true,
            isStatic: true,
            message: `Scene ${context?.sceneIndex ?? 'unknown'} will use static image (animation failed)`,
            sceneIndex: context?.sceneIndex,
        };
    },

    /**
     * Keep original image when enhancement fails
     */
    keep_original_image: async (_error, context) => {
        console.log('[ErrorRecovery] Applying fallback: keep_original_image');
        return {
            success: true,
            unchanged: true,
            message: `Keeping original image for scene ${context?.sceneIndex ?? 'unknown'}`,
            sceneIndex: context?.sceneIndex,
        };
    },

    /**
     * Use narration only when audio mixing fails
     */
    use_narration_only: async (_error, _context) => {
        console.log('[ErrorRecovery] Applying fallback: use_narration_only');
        return {
            success: true,
            narrationOnly: true,
            message: 'Using narration audio only (mixing failed)',
        };
    },

    /**
     * Skip subtitles when generation fails
     */
    skip_subtitles: async (_error, _context) => {
        console.log('[ErrorRecovery] Applying fallback: skip_subtitles');
        return {
            success: true,
            skipped: true,
            message: 'Subtitles skipped due to generation failure',
        };
    },

    /**
     * Requirement 9.5: Provide asset bundle when export fails
     */
    provide_asset_bundle: async (_error, context) => {
        console.log('[ErrorRecovery] Applying fallback: provide_asset_bundle');
        return {
            success: true,
            isAssetBundle: true,
            message: 'Video export failed. Providing asset bundle for manual assembly.',
            assets: {
                visuals: context?.visuals || [],
                narration: context?.narrationSegments || [],
                music: context?.musicUrl || null,
                sfx: context?.sfxPlan || null,
                subtitles: context?.subtitles || null,
            },
        };
    },

    /**
     * Assume valid when validation fails
     */
    assume_valid: async (_error, _context) => {
        console.log('[ErrorRecovery] Applying fallback: assume_valid');
        return {
            success: true,
            assumed: true,
            score: 70, // Assume moderate quality
            message: 'Validation failed - assuming plan is acceptable',
        };
    },
};

/**
 * Apply a fallback action for a failed tool.
 */
export async function applyFallback(
    fallbackAction: string,
    error: ToolError,
    context: any
): Promise<any> {
    const handler = fallbackHandlers[fallbackAction];
    if (!handler) {
        console.warn(`[ErrorRecovery] No fallback handler for: ${fallbackAction}`);
        return null;
    }

    try {
        const result = await handler(error, context);
        if (result) {
            error.fallbackApplied = fallbackAction;
        }
        return result;
    } catch (fallbackError) {
        console.error(
            `[ErrorRecovery] Fallback ${fallbackAction} failed:`,
            fallbackError
        );
        return null;
    }
}

// --- Partial Success Tracking ---

/**
 * Error tracker for a production session.
 * Collects errors and generates partial success reports.
 * 
 * Requirement 6.4: Track errors and report partial success
 */
export class ErrorTracker {
    private errors: ToolError[] = [];
    private totalAttempted = 0;
    private succeeded = 0;
    private fallbackApplied = 0;

    /**
     * Record a successful operation.
     */
    recordSuccess(): void {
        this.totalAttempted++;
        this.succeeded++;
    }

    /**
     * Record an error with optional fallback.
     */
    recordError(error: ToolError, fallbackApplied = false): void {
        this.totalAttempted++;
        this.errors.push(error);

        if (fallbackApplied) {
            this.fallbackApplied++;
        }
    }

    /**
     * Get all recorded errors.
     */
    getErrors(): ToolError[] {
        return [...this.errors];
    }

    /**
     * Check if there were any errors.
     */
    hasErrors(): boolean {
        return this.errors.length > 0;
    }

    /**
     * Check if there were any fatal (non-recoverable) errors.
     */
    hasFatalErrors(): boolean {
        return this.errors.some((e) => !e.recoverable);
    }

    /**
     * Generate a partial success report.
     */
    generateReport(): PartialSuccessReport {
        const failed = this.errors.filter((e) => !e.fallbackApplied && !e.recoverable).length;
        const isUsable = !this.hasFatalErrors() && this.succeeded > 0;

        // Build summary message
        let summary: string;
        if (this.errors.length === 0) {
            summary = 'All operations completed successfully.';
        } else if (isUsable) {
            summary = `Production completed with ${this.errors.length} issue(s). ` +
                `${this.fallbackApplied} fallback(s) applied. Result is usable.`;
        } else {
            summary = `Production failed with ${failed} critical error(s). ` +
                `Please review the errors and try again.`;
        }

        return {
            totalAttempted: this.totalAttempted,
            succeeded: this.succeeded,
            fallbackApplied: this.fallbackApplied,
            failed,
            errors: this.getErrors(),
            summary,
            isUsable,
        };
    }

    /**
     * Clear all tracked errors.
     */
    clear(): void {
        this.errors = [];
        this.totalAttempted = 0;
        this.succeeded = 0;
        this.fallbackApplied = 0;
    }
}

// --- High-Level Tool Execution ---

/**
 * Execute a tool with full error recovery.
 * Handles retries, fallbacks, and error tracking.
 * 
 * @param toolName Name of the tool
 * @param fn Function to execute the tool
 * @param tracker Error tracker for the session
 * @param context Context for fallback handlers
 * @param onProgress Optional progress callback
 */
export async function executeToolWithRecovery<T>(
    toolName: string,
    fn: () => Promise<T>,
    tracker: ErrorTracker,
    context?: any,
    onProgress?: (message: string) => void
): Promise<ToolExecutionResult<T>> {
    const strategy = getRecoveryStrategy(toolName);

    // Execute with retry
    const result = await executeWithRetry(fn, strategy, (attempt, error, delay) => {
        onProgress?.(
            `${toolName} failed (attempt ${attempt}/${strategy.maxRetries}). ` +
            `Retrying in ${Math.round(delay / 1000)}s... (${error.message})`
        );
    });

    if (result.success) {
        tracker.recordSuccess();
        return result;
    }

    // Record the error
    const error = result.error!;

    // Try to apply fallback
    if (strategy.fallbackAction && strategy.continueOnFailure) {
        onProgress?.(`${toolName} failed. Applying fallback: ${strategy.fallbackAction}`);

        const fallbackResult = await applyFallback(
            strategy.fallbackAction,
            error,
            context
        );

        if (fallbackResult) {
            error.fallbackApplied = strategy.fallbackAction;
            tracker.recordError(error, true);

            return {
                success: true, // Consider fallback as success
                data: fallbackResult as T,
                fallbackApplied: true,
                fallbackAction: strategy.fallbackAction,
                retryCount: result.retryCount,
            };
        }
    }

    // No fallback or fallback failed
    tracker.recordError(error, false);

    return {
        success: false,
        error,
        fallbackApplied: false,
        retryCount: result.retryCount,
    };
}

/**
 * Format errors for display in the final response.
 */
export function formatErrorsForResponse(errors: ToolError[]): string {
    if (errors.length === 0) {
        return '';
    }

    const lines = ['## Errors Encountered:\n'];

    for (const error of errors) {
        const sceneInfo = error.sceneIndex !== undefined ? ` (scene ${error.sceneIndex})` : '';
        const fallbackInfo = error.fallbackApplied ? ` → Fallback: ${error.fallbackApplied}` : '';
        const retryInfo = error.retryCount > 0 ? ` (${error.retryCount} retries)` : '';

        lines.push(`- **${error.tool}**${sceneInfo}: ${error.error}${retryInfo}${fallbackInfo}`);
    }

    return lines.join('\n');
}
