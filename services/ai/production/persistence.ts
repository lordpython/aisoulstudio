/**
 * IndexedDB Persistence for Production Sessions
 *
 * Provides durable storage for production state to survive page refreshes.
 * Works alongside cloud autosave for redundancy.
 *
 * Storage strategy:
 * - Main state (serializable fields) → 'sessions' store
 * - Blob data (exportedVideo) → 'blobs' store (optional, large data)
 * - Session index → tracks available sessions for recovery UI
 */

import { openDB, type IDBPDatabase } from 'idb';
import { ProductionState, StoryModeState, createInitialState } from './types';
import { agentLogger } from '../../logger';

const log = agentLogger.child('Persistence');

const DB_NAME = 'lyriclens-production';
const DB_VERSION = 1;

interface SessionMetadata {
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    topic?: string;
    sceneCount: number;
    isComplete: boolean;
}

/**
 * Type for serializable production state (excludes Blobs)
 */
type SerializableProductionState = Omit<ProductionState, 'exportedVideo'> & {
    exportedVideo: null; // Always null in serialized form
};

/**
 * Stored session record
 */
interface StoredSession {
    sessionId: string;
    state: SerializableProductionState;
    metadata: SessionMetadata;
}

/**
 * Stored story session
 */
interface StoredStorySession {
    sessionId: string;
    state: StoryModeState;
    updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Get or create the IndexedDB database connection
 */
async function getDB(): Promise<IDBPDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            log.info(`Upgrading database from v${oldVersion} to v${DB_VERSION}`);

            // Production sessions store
            if (!db.objectStoreNames.contains('sessions')) {
                const sessionsStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
                sessionsStore.createIndex('updatedAt', 'metadata.updatedAt');
            }

            // Story mode sessions store
            if (!db.objectStoreNames.contains('story-sessions')) {
                const storyStore = db.createObjectStore('story-sessions', { keyPath: 'sessionId' });
                storyStore.createIndex('updatedAt', 'updatedAt');
            }

            // Blob store for large binary data (optional)
            if (!db.objectStoreNames.contains('blobs')) {
                db.createObjectStore('blobs', { keyPath: 'id' });
            }
        },
        blocked() {
            log.warn('Database upgrade blocked by another tab');
        },
        blocking() {
            log.warn('This tab is blocking a database upgrade');
        },
        terminated() {
            log.error('Database connection terminated unexpectedly');
            dbPromise = null;
        }
    });

    return dbPromise;
}

/**
 * Serialize production state for storage (removes non-serializable fields)
 */
function serializeState(state: ProductionState): SerializableProductionState {
    // Clone the state, explicitly setting exportedVideo to null
    // Blobs cannot be cloned directly to IndexedDB
    return {
        ...state,
        exportedVideo: null,
    };
}

/**
 * Create metadata from production state
 */
function createMetadata(sessionId: string, state: ProductionState, existingMeta?: SessionMetadata): SessionMetadata {
    const now = Date.now();
    return {
        sessionId,
        createdAt: existingMeta?.createdAt ?? now,
        updatedAt: now,
        topic: state.contentPlan?.topic,
        sceneCount: state.contentPlan?.scenes?.length ?? 0,
        isComplete: state.isComplete,
    };
}

// ============================================================
// PRODUCTION SESSION PERSISTENCE
// ============================================================

/**
 * Save production session to IndexedDB
 */
export async function saveProductionSession(sessionId: string, state: ProductionState): Promise<void> {
    try {
        const db = await getDB();

        // Get existing metadata to preserve createdAt
        const existing = await db.get('sessions', sessionId) as StoredSession | undefined;

        const record: StoredSession = {
            sessionId,
            state: serializeState(state),
            metadata: createMetadata(sessionId, state, existing?.metadata),
        };

        await db.put('sessions', record);
        log.debug(`Saved session ${sessionId} (${record.metadata.sceneCount} scenes)`);
    } catch (error) {
        log.error('Failed to save session to IndexedDB:', error);
        // Don't throw - persistence failure shouldn't break the app
    }
}

/**
 * Load production session from IndexedDB
 */
export async function loadProductionSession(sessionId: string): Promise<ProductionState | null> {
    try {
        const db = await getDB();
        const record = await db.get('sessions', sessionId) as StoredSession | undefined;

        if (!record) {
            log.debug(`Session ${sessionId} not found in IndexedDB`);
            return null;
        }

        // Restore full ProductionState shape (add back exportedVideo)
        const state: ProductionState = {
            ...record.state,
            exportedVideo: null, // Blobs are not persisted
        };

        log.info(`Loaded session ${sessionId} from IndexedDB`);
        return state;
    } catch (error) {
        log.error('Failed to load session from IndexedDB:', error);
        return null;
    }
}

/**
 * Delete production session from IndexedDB
 */
export async function deleteProductionSession(sessionId: string): Promise<void> {
    try {
        const db = await getDB();
        await db.delete('sessions', sessionId);
        // Also delete any associated blobs
        await db.delete('blobs', `${sessionId}-video`);
        log.debug(`Deleted session ${sessionId}`);
    } catch (error) {
        log.error('Failed to delete session from IndexedDB:', error);
    }
}

/**
 * List all recoverable production sessions
 */
export async function listRecoverableSessions(): Promise<SessionMetadata[]> {
    try {
        const db = await getDB();
        const allRecords = await db.getAll('sessions') as StoredSession[];

        // Sort by updatedAt descending (most recent first)
        const sessions = allRecords
            .map(r => r.metadata)
            .sort((a, b) => b.updatedAt - a.updatedAt);

        log.info(`Found ${sessions.length} recoverable sessions`);
        return sessions;
    } catch (error) {
        log.error('Failed to list sessions from IndexedDB:', error);
        return [];
    }
}

/**
 * Check if a session exists in IndexedDB
 */
export async function hasPersistedSession(sessionId: string): Promise<boolean> {
    try {
        const db = await getDB();
        const record = await db.get('sessions', sessionId);
        return !!record;
    } catch (error) {
        log.error('Failed to check session in IndexedDB:', error);
        return false;
    }
}

/**
 * Get the most recent incomplete session (for recovery prompt)
 */
export async function getMostRecentIncompleteSession(): Promise<SessionMetadata | null> {
    try {
        const sessions = await listRecoverableSessions();
        // Find the most recent session that is not complete
        const incomplete = sessions.find(s => !s.isComplete);
        return incomplete ?? null;
    } catch (error) {
        log.error('Failed to get recent incomplete session:', error);
        return null;
    }
}

// ============================================================
// STORY SESSION PERSISTENCE
// ============================================================

/**
 * Save story mode session to IndexedDB
 */
export async function saveStorySession(sessionId: string, state: StoryModeState): Promise<void> {
    try {
        const db = await getDB();
        const record: StoredStorySession = {
            sessionId,
            state,
            updatedAt: Date.now(),
        };
        await db.put('story-sessions', record);
        log.debug(`Saved story session ${sessionId}`);
    } catch (error) {
        log.error('Failed to save story session to IndexedDB:', error);
    }
}

/**
 * Load story mode session from IndexedDB
 */
export async function loadStorySession(sessionId: string): Promise<StoryModeState | null> {
    try {
        const db = await getDB();
        const record = await db.get('story-sessions', sessionId) as StoredStorySession | undefined;
        return record?.state ?? null;
    } catch (error) {
        log.error('Failed to load story session from IndexedDB:', error);
        return null;
    }
}

// ============================================================
// BLOB STORAGE (FOR LARGE BINARY DATA)
// ============================================================

/**
 * Save a blob to IndexedDB (for video exports)
 */
export async function saveBlob(id: string, blob: Blob): Promise<void> {
    try {
        const db = await getDB();
        await db.put('blobs', { id, blob, savedAt: Date.now() });
        log.debug(`Saved blob ${id} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
        log.error('Failed to save blob to IndexedDB:', error);
    }
}

/**
 * Load a blob from IndexedDB
 */
export async function loadBlob(id: string): Promise<Blob | null> {
    try {
        const db = await getDB();
        const record = await db.get('blobs', id) as { id: string; blob: Blob } | undefined;
        return record?.blob ?? null;
    } catch (error) {
        log.error('Failed to load blob from IndexedDB:', error);
        return null;
    }
}

// ============================================================
// CLEANUP UTILITIES
// ============================================================

/**
 * Clean up old sessions (older than maxAgeDays)
 */
export async function cleanupOldSessions(maxAgeDays: number = 7): Promise<number> {
    try {
        const db = await getDB();
        const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

        const allRecords = await db.getAll('sessions') as StoredSession[];
        const oldSessions = allRecords.filter(r => r.metadata.updatedAt < cutoffTime);

        for (const record of oldSessions) {
            await db.delete('sessions', record.sessionId);
            await db.delete('blobs', `${record.sessionId}-video`);
        }

        if (oldSessions.length > 0) {
            log.info(`Cleaned up ${oldSessions.length} old sessions`);
        }

        return oldSessions.length;
    } catch (error) {
        log.error('Failed to cleanup old sessions:', error);
        return 0;
    }
}

/**
 * Clear all persisted data (for testing/reset)
 */
export async function clearAllPersistedData(): Promise<void> {
    try {
        const db = await getDB();
        await db.clear('sessions');
        await db.clear('story-sessions');
        await db.clear('blobs');
        log.info('Cleared all persisted data');
    } catch (error) {
        log.error('Failed to clear persisted data:', error);
    }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<{ sessionCount: number; storyCount: number; estimatedSizeMB: number }> {
    try {
        const db = await getDB();
        const sessions = await db.count('sessions');
        const stories = await db.count('story-sessions');

        // Estimate size (rough calculation)
        let totalSize = 0;
        const allSessions = await db.getAll('sessions') as StoredSession[];
        for (const record of allSessions) {
            totalSize += JSON.stringify(record).length;
        }

        return {
            sessionCount: sessions,
            storyCount: stories,
            estimatedSizeMB: totalSize / 1024 / 1024,
        };
    } catch (error) {
        log.error('Failed to get storage stats:', error);
        return { sessionCount: 0, storyCount: 0, estimatedSizeMB: 0 };
    }
}
