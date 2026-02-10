/**
 * AI Logging Service
 *
 * Captures every AI call (prompts sent, responses received) for debugging,
 * transparency, quality review, and iterative prompt improvement.
 *
 * Design:
 * - Fire-and-forget writes (logging never blocks the pipeline)
 * - Text only (binary data logged as metadata, never raw bytes)
 * - Truncation at 10,000 chars to prevent IndexedDB bloat
 * - Session-scoped (all logs keyed by sessionId)
 * - Optional sessionId (when not provided, logging is skipped)
 * - Dual persistence: IndexedDB (local) + Google Cloud Storage (bucket)
 */

import {
    saveAILog,
    getAILogsForSession,
    getAILogsByStep,
    deleteAILogsForSession,
    type AILogEntry,
} from './ai/production/persistence';
import { cloudAutosave } from './cloudStorageService';

export type { AILogEntry };

const MAX_TEXT_LENGTH = 10_000;

function truncate(text: string): string {
    if (text.length <= MAX_TEXT_LENGTH) return text;
    return text.slice(0, MAX_TEXT_LENGTH) + `... [truncated, ${text.length} total chars]`;
}

function generateLogId(): string {
    const rand = Math.random().toString(36).slice(2, 10);
    return `log_${Date.now()}_${rand}`;
}

/**
 * Log an AI call (fire-and-forget). Does nothing if sessionId is undefined.
 * Saves to both IndexedDB (local) and Google Cloud Storage (bucket).
 */
export function logAICall(entry: Omit<AILogEntry, 'id' | 'timestamp'>): void {
    if (!entry.sessionId) return;

    const full: AILogEntry = {
        ...entry,
        id: generateLogId(),
        timestamp: Date.now(),
        input: truncate(entry.input),
        output: truncate(entry.output),
        error: entry.error ? truncate(entry.error) : undefined,
    };

    // Fire-and-forget to IndexedDB — never block the caller
    saveAILog(full).catch(() => {
        // Silently swallow persistence errors
    });

    // Fire-and-forget to Cloud Storage — non-blocking
    cloudAutosave.saveAILog(entry.sessionId, full).catch(() => {
        // Silently swallow cloud storage errors
    });
}

/**
 * Ergonomic wrapper: runs an async AI operation while capturing timing,
 * input/output, and error state into the log store.
 *
 * @param sessionId - Story session ID (logging is skipped when undefined)
 * @param step - Step identifier (e.g. 'breakdown', 'screenplay', 'tts')
 * @param model - Model name (e.g. 'gemini-2.0-flash')
 * @param input - The prompt or input sent to the model
 * @param fn - The async function that performs the actual AI call
 * @param outputMapper - Optional function to extract a loggable string from the result
 */
export async function withAILogging<T>(
    sessionId: string | undefined,
    step: string,
    model: string,
    input: string,
    fn: () => Promise<T>,
    outputMapper?: (result: T) => string,
): Promise<T> {
    if (!sessionId) return fn();

    const start = Date.now();
    try {
        const result = await fn();
        const output = outputMapper
            ? outputMapper(result)
            : typeof result === 'string'
              ? result
              : JSON.stringify(result);

        logAICall({
            sessionId,
            step,
            model,
            input,
            output,
            durationMs: Date.now() - start,
            status: 'success',
        });

        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logAICall({
            sessionId,
            step,
            model,
            input,
            output: '',
            durationMs: Date.now() - start,
            status: 'error',
            error: errorMessage,
        });
        throw error;
    }
}

/**
 * Retrieve all logs for a session, ordered by timestamp.
 */
export async function getLogsForSession(sessionId: string): Promise<AILogEntry[]> {
    return getAILogsForSession(sessionId);
}

/**
 * Retrieve logs for a session filtered by step.
 */
export async function getLogsByStep(sessionId: string, step: string): Promise<AILogEntry[]> {
    return getAILogsByStep(sessionId, step);
}

/**
 * Export all logs for a session as a JSON string.
 */
export async function exportLogsAsJSON(sessionId: string): Promise<string> {
    const logs = await getAILogsForSession(sessionId);
    return JSON.stringify(logs, null, 2);
}

/**
 * Clear all logs for a session.
 */
export async function clearLogsForSession(sessionId: string): Promise<void> {
    return deleteAILogsForSession(sessionId);
}
