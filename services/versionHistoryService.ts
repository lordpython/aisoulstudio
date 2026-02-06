/**
 * Version History Service
 * 
 * Provides persistent version history with named snapshots, auto-save checkpoints,
 * and the ability to browse/restore previous versions of story projects.
 */

import { openDB, IDBPDatabase } from 'idb';
import type { StoryState } from '@/types';

export interface VersionSnapshot {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  timestamp: number;
  state: StoryState;
  type: 'manual' | 'auto' | 'checkpoint';
  metadata?: {
    step?: string;
    shotCount?: number;
    sceneCount?: number;
    characterCount?: number;
  };
}

export interface VersionHistoryStats {
  totalSnapshots: number;
  manualSnapshots: number;
  autoSnapshots: number;
  oldestSnapshot?: number;
  newestSnapshot?: number;
  totalSizeBytes: number;
}

const DB_NAME = 'aisoul-version-history';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const MAX_AUTO_SNAPSHOTS = 50;
const AUTO_SAVE_INTERVAL_MS = 60000; // 1 minute

let db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db;
  
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('projectId_timestamp', ['projectId', 'timestamp'], { unique: false });
      }
    },
  });
  
  return db;
}

function generateSnapshotId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function extractMetadata(state: StoryState): VersionSnapshot['metadata'] {
  return {
    step: state.currentStep,
    shotCount: state.shots?.length ?? 0,
    sceneCount: state.breakdown?.length ?? 0,
    characterCount: state.characters?.length ?? 0,
  };
}

export async function createSnapshot(
  projectId: string,
  state: StoryState,
  name: string,
  description?: string,
  type: VersionSnapshot['type'] = 'manual'
): Promise<VersionSnapshot> {
  const database = await getDB();
  
  const snapshot: VersionSnapshot = {
    id: generateSnapshotId(),
    projectId,
    name,
    description,
    timestamp: Date.now(),
    state: JSON.parse(JSON.stringify(state)), // Deep clone
    type,
    metadata: extractMetadata(state),
  };
  
  await database.put(STORE_NAME, snapshot);
  
  // Clean up old auto snapshots if over limit
  if (type === 'auto') {
    await cleanupOldAutoSnapshots(projectId);
  }
  
  return snapshot;
}

export async function createAutoSnapshot(
  projectId: string,
  state: StoryState
): Promise<VersionSnapshot> {
  const stepName = state.currentStep || 'unknown';
  const name = `Auto-save at ${stepName} step`;
  return createSnapshot(projectId, state, name, undefined, 'auto');
}

export async function createCheckpoint(
  projectId: string,
  state: StoryState,
  checkpointName: string
): Promise<VersionSnapshot> {
  const description = `Checkpoint: ${checkpointName}`;
  return createSnapshot(projectId, state, checkpointName, description, 'checkpoint');
}

async function cleanupOldAutoSnapshots(projectId: string): Promise<void> {
  const database = await getDB();
  const tx = database.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('projectId_timestamp');
  
  const autoSnapshots: VersionSnapshot[] = [];
  let cursor = await index.openCursor(IDBKeyRange.bound([projectId, 0], [projectId, Infinity]));
  
  while (cursor) {
    if (cursor.value.type === 'auto') {
      autoSnapshots.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  
  // Sort by timestamp descending
  autoSnapshots.sort((a, b) => b.timestamp - a.timestamp);
  
  // Delete excess auto snapshots
  if (autoSnapshots.length > MAX_AUTO_SNAPSHOTS) {
    const toDelete = autoSnapshots.slice(MAX_AUTO_SNAPSHOTS);
    for (const snap of toDelete) {
      await database.delete(STORE_NAME, snap.id);
    }
  }
  
  await tx.done;
}

export async function getSnapshots(
  projectId: string,
  options?: {
    type?: VersionSnapshot['type'];
    limit?: number;
    offset?: number;
  }
): Promise<VersionSnapshot[]> {
  const database = await getDB();
  const index = database.transaction(STORE_NAME).objectStore(STORE_NAME).index('projectId_timestamp');
  
  const snapshots: VersionSnapshot[] = [];
  let cursor = await index.openCursor(
    IDBKeyRange.bound([projectId, 0], [projectId, Infinity]),
    'prev' // Newest first
  );
  
  let count = 0;
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;
  
  while (cursor) {
    const snapshot = cursor.value as VersionSnapshot;
    
    // Filter by type if specified
    if (!options?.type || snapshot.type === options.type) {
      if (count >= offset && count < offset + limit) {
        snapshots.push(snapshot);
      }
      count++;
    }
    
    if (snapshots.length >= limit) break;
    cursor = await cursor.continue();
  }
  
  return snapshots;
}

export async function getSnapshot(snapshotId: string): Promise<VersionSnapshot | undefined> {
  const database = await getDB();
  return database.get(STORE_NAME, snapshotId);
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const database = await getDB();
  await database.delete(STORE_NAME, snapshotId);
}

export async function deleteAllSnapshots(projectId: string): Promise<number> {
  const database = await getDB();
  const snapshots = await getSnapshots(projectId, { limit: 1000 });
  
  const tx = database.transaction(STORE_NAME, 'readwrite');
  for (const snap of snapshots) {
    await tx.objectStore(STORE_NAME).delete(snap.id);
  }
  await tx.done;
  
  return snapshots.length;
}

export async function renameSnapshot(
  snapshotId: string,
  newName: string,
  newDescription?: string
): Promise<VersionSnapshot | undefined> {
  const database = await getDB();
  const snapshot = await database.get(STORE_NAME, snapshotId);
  
  if (!snapshot) return undefined;
  
  snapshot.name = newName;
  if (newDescription !== undefined) {
    snapshot.description = newDescription;
  }
  
  await database.put(STORE_NAME, snapshot);
  return snapshot;
}

export async function getHistoryStats(projectId: string): Promise<VersionHistoryStats> {
  const snapshots = await getSnapshots(projectId, { limit: 1000 });
  
  const stats: VersionHistoryStats = {
    totalSnapshots: snapshots.length,
    manualSnapshots: snapshots.filter(s => s.type === 'manual').length,
    autoSnapshots: snapshots.filter(s => s.type === 'auto').length,
    totalSizeBytes: 0,
  };
  
  if (snapshots.length > 0) {
    stats.newestSnapshot = Math.max(...snapshots.map(s => s.timestamp));
    stats.oldestSnapshot = Math.min(...snapshots.map(s => s.timestamp));
    
    // Estimate size
    stats.totalSizeBytes = snapshots.reduce((acc, s) => {
      return acc + JSON.stringify(s.state).length * 2; // Rough byte estimate
    }, 0);
  }
  
  return stats;
}

export async function compareSnapshots(
  snapshotId1: string,
  snapshotId2: string
): Promise<{
  added: string[];
  removed: string[];
  modified: string[];
} | null> {
  const snap1 = await getSnapshot(snapshotId1);
  const snap2 = await getSnapshot(snapshotId2);
  
  if (!snap1 || !snap2) return null;
  
  const changes = {
    added: [] as string[],
    removed: [] as string[],
    modified: [] as string[],
  };
  
  // Compare scenes
  const scenes1 = new Set(snap1.state.breakdown?.map(s => s.sceneNumber) ?? []);
  const scenes2 = new Set(snap2.state.breakdown?.map(s => s.sceneNumber) ?? []);
  
  for (const scene of scenes2) {
    if (!scenes1.has(scene)) changes.added.push(`Scene ${scene}`);
  }
  for (const scene of scenes1) {
    if (!scenes2.has(scene)) changes.removed.push(`Scene ${scene}`);
  }
  
  // Compare characters
  const chars1 = new Set(snap1.state.characters?.map(c => c.name) ?? []);
  const chars2 = new Set(snap2.state.characters?.map(c => c.name) ?? []);
  
  for (const char of chars2) {
    if (!chars1.has(char)) changes.added.push(`Character: ${char}`);
  }
  for (const char of chars1) {
    if (!chars2.has(char)) changes.removed.push(`Character: ${char}`);
  }
  
  // Compare shots
  const shots1 = snap1.state.shots?.length ?? 0;
  const shots2 = snap2.state.shots?.length ?? 0;
  
  if (shots2 > shots1) {
    changes.added.push(`${shots2 - shots1} new shot(s)`);
  } else if (shots1 > shots2) {
    changes.removed.push(`${shots1 - shots2} shot(s)`);
  }
  
  // Compare visual style
  if (snap1.state.visualStyle !== snap2.state.visualStyle) {
    changes.modified.push(`Visual style: ${snap1.state.visualStyle} → ${snap2.state.visualStyle}`);
  }
  
  return changes;
}

export class AutoSaveManager {
  private projectId: string;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastState: string = '';
  private getState: () => StoryState;
  
  constructor(projectId: string, getState: () => StoryState) {
    this.projectId = projectId;
    this.getState = getState;
  }
  
  start(): void {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(async () => {
      const state = this.getState();
      const stateHash = JSON.stringify(state);
      
      // Only save if state changed
      if (stateHash !== this.lastState) {
        await createAutoSnapshot(this.projectId, state);
        this.lastState = stateHash;
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  async saveNow(): Promise<VersionSnapshot> {
    const state = this.getState();
    this.lastState = JSON.stringify(state);
    return createAutoSnapshot(this.projectId, state);
  }
}

export function formatSnapshotDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
}
