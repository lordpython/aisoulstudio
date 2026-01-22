/**
 * LangSmith Tracing Service (Browser-Compatible)
 * 
 * Provides tracing utilities for AI pipeline functions.
 * Uses LangChain's callback system for LangSmith integration (browser-safe).
 * 
 * For browser environments, we use manual trace logging via the LangSmith REST API.
 * For server environments (Node.js), the full traceable wrapper is available.
 * 
 * Setup:
 * 1. Set VITE_LANGSMITH_API_KEY in .env.local
 * 2. Set VITE_LANGSMITH_PROJECT (optional, defaults to "lyriclens")
 * 3. Traces appear at: https://smith.langchain.com
 */

// --- Configuration ---

// Access Vite env vars (types are defined in vite-env.d.ts or env.d.ts)
const LANGSMITH_API_KEY = (import.meta as any).env?.VITE_LANGSMITH_API_KEY as string | undefined;
const LANGSMITH_PROJECT = ((import.meta as any).env?.VITE_LANGSMITH_PROJECT as string) || "lyriclens";
const LANGSMITH_ENDPOINT = "https://api.smith.langchain.com";
const TRACING_ENABLED = !!LANGSMITH_API_KEY && (import.meta as any).env?.VITE_LANGSMITH_TRACING !== "false";

if (TRACING_ENABLED && typeof window !== "undefined") {
    console.log(`[Tracing] LangSmith tracing enabled for project: ${LANGSMITH_PROJECT}`);
}

// --- Types ---

interface TraceRun {
    id: string;
    name: string;
    run_type: "llm" | "chain" | "tool" | "retriever";
    start_time: string;
    end_time?: string;
    inputs: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error?: string;
    extra?: Record<string, unknown>;
    tags?: string[];
    parent_run_id?: string;
}

// --- Utility Functions ---

function generateRunId(): string {
    return crypto.randomUUID();
}

function getCurrentTimestamp(): string {
    return new Date().toISOString();
}

// --- LangSmith REST API Client ---

async function postRun(run: TraceRun): Promise<void> {
    if (!TRACING_ENABLED) return;

    try {
        const response = await fetch(`${LANGSMITH_ENDPOINT}/runs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": LANGSMITH_API_KEY!,
            },
            body: JSON.stringify({
                ...run,
                session_name: LANGSMITH_PROJECT,
            }),
        });

        if (!response.ok) {
            console.warn(`[Tracing] Failed to post run: ${response.status}`);
        }
    } catch (error) {
        // Don't let tracing errors break the app
        console.warn("[Tracing] Error posting run:", error);
    }
}

async function patchRun(runId: string, updates: Partial<TraceRun>): Promise<void> {
    if (!TRACING_ENABLED) return;

    try {
        const response = await fetch(`${LANGSMITH_ENDPOINT}/runs/${runId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": LANGSMITH_API_KEY!,
            },
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            console.warn(`[Tracing] Failed to patch run: ${response.status}`);
        }
    } catch (error) {
        console.warn("[Tracing] Error patching run:", error);
    }
}

// --- Traceable Wrapper Factory ---

interface TraceOptions {
    name: string;
    runType?: "llm" | "chain" | "tool" | "retriever";
    metadata?: Record<string, unknown>;
    tags?: string[];
}

/**
 * Wrap an async function with LangSmith tracing.
 * Traces are sent to LangSmith via REST API (browser-compatible).
 * 
 * @param fn - Function to wrap
 * @param name - Name for the trace
 * @param options - Additional tracing options
 * @returns Traced function (or original if tracing disabled)
 */
export function traceAsync<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    name: string,
    options?: Omit<TraceOptions, "name">
): (...args: TArgs) => Promise<TReturn> {
    if (!TRACING_ENABLED) {
        return fn;
    }

    return async (...args: TArgs): Promise<TReturn> => {
        const runId = generateRunId();
        const startTime = getCurrentTimestamp();

        // Create initial run
        const run: TraceRun = {
            id: runId,
            name,
            run_type: options?.runType || "chain",
            start_time: startTime,
            inputs: { args: args.length === 1 ? args[0] : args },
            extra: options?.metadata,
            tags: options?.tags,
        };

        // Post the run start (fire and forget)
        postRun(run);

        try {
            const result = await fn(...args);

            // Update with success
            patchRun(runId, {
                end_time: getCurrentTimestamp(),
                outputs: { result: result as unknown },
            });

            return result;
        } catch (error) {
            // Update with error
            patchRun(runId, {
                end_time: getCurrentTimestamp(),
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    };
}

/**
 * Wrap a sync function with tracing.
 * Note: Tracing is async but won't block the sync function.
 */
export function traceSync<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => TReturn,
    name: string,
    options?: Omit<TraceOptions, "name">
): (...args: TArgs) => TReturn {
    if (!TRACING_ENABLED) {
        return fn;
    }

    return (...args: TArgs): TReturn => {
        const runId = generateRunId();
        const startTime = getCurrentTimestamp();

        // Create initial run
        const run: TraceRun = {
            id: runId,
            name,
            run_type: options?.runType || "chain",
            start_time: startTime,
            inputs: { args: args.length === 1 ? args[0] : args },
            extra: options?.metadata,
            tags: options?.tags,
        };

        // Post the run start (fire and forget)
        postRun(run);

        try {
            const result = fn(...args);

            // Update with success (fire and forget)
            patchRun(runId, {
                end_time: getCurrentTimestamp(),
                outputs: { result: result as unknown },
            });

            return result;
        } catch (error) {
            // Update with error (fire and forget)
            patchRun(runId, {
                end_time: getCurrentTimestamp(),
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    };
}

/**
 * Create a traceable version of a function.
 * Automatically detects async vs sync functions.
 */
export function createTraceable<T extends (...args: any[]) => any>(
    fn: T,
    options: TraceOptions
): T {
    if (!TRACING_ENABLED) {
        return fn;
    }

    // Check if function returns a promise (async)
    const isAsync = fn.constructor.name === "AsyncFunction";

    if (isAsync) {
        return traceAsync(fn as any, options.name, options) as T;
    } else {
        return traceSync(fn as any, options.name, options) as T;
    }
}

// --- Pre-built Traceable Decorators ---

/**
 * Decorator for LLM calls (Gemini, etc.)
 */
export const traceLLM = (name: string, metadata?: Record<string, unknown>) =>
    <T extends (...args: any[]) => any>(fn: T): T =>
        createTraceable(fn, { name, runType: "llm", metadata, tags: ["llm", "gemini"] });

/**
 * Decorator for chain/pipeline operations
 */
export const traceChain = (name: string, metadata?: Record<string, unknown>) =>
    <T extends (...args: any[]) => any>(fn: T): T =>
        createTraceable(fn, { name, runType: "chain", metadata, tags: ["chain"] });

/**
 * Decorator for tool operations (image gen, TTS, etc.)
 */
export const traceTool = (name: string, metadata?: Record<string, unknown>) =>
    <T extends (...args: any[]) => any>(fn: T): T =>
        createTraceable(fn, { name, runType: "tool", metadata, tags: ["tool"] });

// --- Status ---

export function isTracingEnabled(): boolean {
    return TRACING_ENABLED;
}

export function getTracingProject(): string {
    return LANGSMITH_PROJECT;
}

// --- Manual Trace API ---

/**
 * Start a manual trace span. Returns a function to end the span.
 * Useful for tracing code blocks that aren't easily wrapped.
 * 
 * @example
 * const endTrace = startTrace("myOperation", { runType: "tool" });
 * try {
 *     // ... do work ...
 *     endTrace({ result: "success" });
 * } catch (error) {
 *     endTrace(undefined, error);
 * }
 */
export function startTrace(
    name: string,
    options?: Omit<TraceOptions, "name">
): (outputs?: Record<string, unknown>, error?: Error) => void {
    if (!TRACING_ENABLED) {
        return () => {}; // No-op
    }

    const runId = generateRunId();
    const startTime = getCurrentTimestamp();

    const run: TraceRun = {
        id: runId,
        name,
        run_type: options?.runType || "chain",
        start_time: startTime,
        inputs: {},
        extra: options?.metadata,
        tags: options?.tags,
    };

    postRun(run);

    return (outputs?: Record<string, unknown>, error?: Error) => {
        patchRun(runId, {
            end_time: getCurrentTimestamp(),
            outputs,
            error: error?.message,
        });
    };
}
