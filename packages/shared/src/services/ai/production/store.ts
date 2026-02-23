/**
 * Production Agent State Management
 *
 * Manages production session state and story mode state.
 * Features:
 * - In-memory cache for fast access
 * - IndexedDB persistence for session recovery
 * - Cloud autosave for redundancy
 */

import { ProductionState, StoryModeState, createInitialState } from "./types";
import { agentLogger } from "../../logger";
import { cloudAutosave } from "../../cloudStorageService";
import {
    saveProductionSession,
    loadProductionSession,
    deleteProductionSession,
    listRecoverableSessions,
    getMostRecentIncompleteSession,
    saveStorySession,
    loadStorySession,
    cleanupOldSessions,
} from "./persistence";
import type { SessionMetadata } from "./persistence";

const log = agentLogger.child('Store');

/**
 * Store for intermediate results (in-memory cache)
 */
export const productionStore: Map<string, ProductionState> = new Map();

/**
 * Story Mode session store (in-memory cache)
 */
export const storyModeStore: Map<string, StoryModeState> = new Map();

/**
 * Debounce timer for persistence writes
 */
const persistenceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const PERSISTENCE_DEBOUNCE_MS = 1000; // 1 second debounce

/**
 * Schedule a debounced persistence write
 */
function schedulePersistence(sessionId: string, state: ProductionState): void {
    // Clear existing timer
    const existingTimer = persistenceTimers.get(sessionId);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    // Schedule new write
    const timer = setTimeout(() => {
        persistenceTimers.delete(sessionId);
        saveProductionSession(sessionId, state).catch(err => {
            log.warn('IndexedDB persistence failed (non-fatal):', err);
        });
    }, PERSISTENCE_DEBOUNCE_MS);

    persistenceTimers.set(sessionId, timer);
}

/**
 * Get a production session by ID
 */
export function getProductionSession(sessionId: string): ProductionState | null {
    return productionStore.get(sessionId) || null;
}

/**
 * Clear a production session (both memory and IndexedDB)
 */
export function clearProductionSession(sessionId: string): void {
    // Clear pending persistence
    const timer = persistenceTimers.get(sessionId);
    if (timer) {
        clearTimeout(timer);
        persistenceTimers.delete(sessionId);
    }

    productionStore.delete(sessionId);

    // Also clear from IndexedDB (fire-and-forget)
    deleteProductionSession(sessionId).catch(err => {
        log.warn('Failed to clear session from IndexedDB:', err);
    });
}

/**
 * Initialize a new production session with cloud autosave and IndexedDB
 */
export async function initializeProductionSession(sessionId: string, initialState?: Partial<ProductionState>): Promise<void> {
    const state: ProductionState = {
        ...createInitialState(),
        ...initialState,
    };

    productionStore.set(sessionId, state);

    // Persist to IndexedDB immediately for new sessions
    saveProductionSession(sessionId, state).catch(err => {
        log.warn('IndexedDB initial save failed (non-fatal):', err);
    });

    // Initialize cloud autosave session (fire-and-forget, non-blocking)
    cloudAutosave.initSession(sessionId).catch(err => {
        log.warn('Cloud autosave init failed (non-fatal):', err);
    });
}

/**
 * Update production session state with automatic persistence
 */
export function updateProductionSession(sessionId: string, updates: Partial<ProductionState>): void {
    const state = productionStore.get(sessionId);
    if (state) {
        Object.assign(state, updates);
        productionStore.set(sessionId, state);

        // Schedule debounced persistence to IndexedDB
        schedulePersistence(sessionId, state);
    }
}

// ============================================================
// SESSION RECOVERY FUNCTIONS
// ============================================================

/**
 * Restore a production session from IndexedDB into memory
 */
export async function restoreProductionSession(sessionId: string): Promise<ProductionState | null> {
    // Check memory first
    const memoryState = productionStore.get(sessionId);
    if (memoryState) {
        log.debug(`Session ${sessionId} already in memory`);
        return memoryState;
    }

    // Try to load from IndexedDB
    const persistedState = await loadProductionSession(sessionId);
    if (persistedState) {
        productionStore.set(sessionId, persistedState);
        log.info(`Restored session ${sessionId} from IndexedDB`);
        return persistedState;
    }

    return null;
}

/**
 * Get list of recoverable sessions for the recovery UI
 */
export async function getRecoverableSessions(): Promise<SessionMetadata[]> {
    return listRecoverableSessions();
}

/**
 * Get the most recent incomplete session (for automatic recovery prompt)
 */
export async function getRecentIncompleteSession(): Promise<SessionMetadata | null> {
    return getMostRecentIncompleteSession();
}

/**
 * Flush pending persistence writes immediately
 * Call this before navigation or when session is complete
 */
export async function flushPendingPersistence(sessionId: string): Promise<void> {
    const timer = persistenceTimers.get(sessionId);
    if (timer) {
        clearTimeout(timer);
        persistenceTimers.delete(sessionId);
    }

    const state = productionStore.get(sessionId);
    if (state) {
        await saveProductionSession(sessionId, state);
        log.debug(`Flushed persistence for session ${sessionId}`);
    }
}

// ============================================================
// STORY MODE SESSION FUNCTIONS
// ============================================================

/**
 * Save story mode session with IndexedDB persistence.
 * Automatically stamps updatedAt and preserves formatId for isolation.
 */
export function saveStoryModeSession(sessionId: string, state: StoryModeState): void {
    // Ensure updatedAt is current
    const stamped: StoryModeState = { ...state, updatedAt: Date.now() };
    storyModeStore.set(sessionId, stamped);

    // Persist to IndexedDB (fire-and-forget)
    saveStorySession(sessionId, stamped).catch(err => {
        log.warn('Story session persistence failed:', err);
    });
}

/**
 * Load story mode session (memory first, then IndexedDB).
 * If formatId is provided, validates that the loaded session matches the format.
 */
export async function loadStoryModeSession(
    sessionId: string,
    expectedFormatId?: string,
): Promise<StoryModeState | null> {
    // Check memory first
    const memoryState = storyModeStore.get(sessionId);
    if (memoryState) {
        if (expectedFormatId && memoryState.formatId && memoryState.formatId !== expectedFormatId) {
            log.debug(`Session ${sessionId} format mismatch: expected ${expectedFormatId}, got ${memoryState.formatId}`);
            return null;
        }
        return memoryState;
    }

    // Try IndexedDB
    const persistedState = await loadStorySession(sessionId);
    if (persistedState) {
        if (expectedFormatId && persistedState.formatId && persistedState.formatId !== expectedFormatId) {
            log.debug(`Persisted session ${sessionId} format mismatch: expected ${expectedFormatId}, got ${persistedState.formatId}`);
            return null;
        }
        storyModeStore.set(sessionId, persistedState);
        return persistedState;
    }

    return null;
}

/**
 * Get all story sessions matching a specific format ID.
 * Searches both in-memory cache and IndexedDB.
 * Useful for format-specific state isolation (Requirement 18.4).
 */
export function getStorySessionsByFormat(formatId: string): StoryModeState[] {
    const results: StoryModeState[] = [];
    for (const state of storyModeStore.values()) {
        if (state.formatId === formatId) {
            results.push(state);
        }
    }
    return results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Clear all story mode sessions for a specific format.
 * Useful when switching formats to ensure clean state.
 */
export function clearStorySessionsByFormat(formatId: string): void {
    for (const [key, state] of storyModeStore.entries()) {
        if (state.formatId === formatId) {
            storyModeStore.delete(key);
        }
    }
}

// ============================================================
// INITIALIZATION & CLEANUP
// ============================================================

/**
 * Initialize the persistence layer (call on app startup)
 */
export async function initializePersistence(): Promise<void> {
    try {
        // Clean up old sessions (older than 7 days)
        const cleaned = await cleanupOldSessions(7);
        if (cleaned > 0) {
            log.info(`Cleaned up ${cleaned} old sessions on startup`);
        }
    } catch (err) {
        log.warn('Persistence initialization warning:', err);
    }
}

// Re-export SessionMetadata type for consumers
export type { SessionMetadata };
