/**
 * useProjectSession Hook
 *
 * Manages the connection between Project (Firestore) and Production Session (IndexedDB).
 * Handles loading, restoring, and syncing project state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/stores';
import {
  getProject,
  updateProject,
  markProjectAccessed,
  type Project,
  type UpdateProjectInput,
} from '@/services/projectService';
import {
  restoreProductionSession,
  initializeProductionSession,
  flushPendingPersistence,
} from '@/services/ai/production/store';
import { cloudAutosave } from '@/services/cloudStorageService';
import type { ProductionState } from '@/services/ai/production/types';

export interface UseProjectSessionResult {
  project: Project | null;
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  restoredState: ProductionState | null;
  syncProjectMetadata: (updates: Partial<UpdateProjectInput>) => void;
  flushSession: () => Promise<void>;
}

const SYNC_DEBOUNCE_MS = 2000;

export function useProjectSession(projectId: string | undefined): UseProjectSessionResult {
  const [project, setProject] = useState<Project | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoredState, setRestoredState] = useState<ProductionState | null>(null);

  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Partial<UpdateProjectInput>>({});

  // Load project and restore session on mount or projectId change
  useEffect(() => {
    if (!projectId) {
      // No project - clear state
      setProject(null);
      setSessionId(null);
      setRestoredState(null);
      setCurrentProjectId(null);
      setError(null);
      return;
    }

    // Capture projectId to help TypeScript narrow the type
    const currentProjectId = projectId;
    let cancelled = false;

    async function loadAndRestore() {
      setIsLoading(true);
      setError(null);

      try {
        // 1. Load project from Firestore
        const loadedProject = await getProject(currentProjectId);

        if (cancelled) return;

        if (!loadedProject) {
          throw new Error(`Project "${currentProjectId}" not found or access denied`);
        }

        setProject(loadedProject);
        setCurrentProjectId(currentProjectId);

        // Mark as accessed (fire-and-forget)
        markProjectAccessed(currentProjectId);

        // 2. Get session ID from project
        const cloudSessionId = loadedProject.cloudSessionId;
        setSessionId(cloudSessionId);

        // 3. Try to restore production state from IndexedDB
        const restored = await restoreProductionSession(cloudSessionId);

        if (cancelled) return;

        if (restored) {
          console.log(
            `[useProjectSession] Restored session ${cloudSessionId} with ${restored.contentPlan?.scenes?.length || 0} scenes`
          );
          setRestoredState(restored);
        } else {
          // No existing session - initialize new one
          console.log(
            `[useProjectSession] No existing session, initializing ${cloudSessionId}`
          );
          await initializeProductionSession(cloudSessionId, {});

          // Initialize cloud autosave (fire-and-forget)
          cloudAutosave.initSession(cloudSessionId).catch((err) => {
            console.warn('[useProjectSession] Cloud autosave init failed:', err);
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[useProjectSession] Failed to load project:', err);
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadAndRestore();

    // Cleanup on unmount or projectId change
    return () => {
      cancelled = true;
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        // Flush any pending updates before unmount
        if (Object.keys(pendingUpdatesRef.current).length > 0) {
          updateProject(currentProjectId, pendingUpdatesRef.current).catch(() => {});
          pendingUpdatesRef.current = {};
        }
      }
    };
  }, [projectId, setCurrentProjectId]);

  // Sync project metadata to Firestore (debounced)
  const syncProjectMetadata = useCallback(
    (updates: Partial<UpdateProjectInput>) => {
      if (!projectId || !project) return;

      // Merge updates with pending
      pendingUpdatesRef.current = {
        ...pendingUpdatesRef.current,
        ...updates,
      };

      // Debounce sync calls
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = setTimeout(async () => {
        const toSync = { ...pendingUpdatesRef.current };
        pendingUpdatesRef.current = {};

        try {
          await updateProject(projectId, toSync);
          console.log('[useProjectSession] Synced project metadata:', Object.keys(toSync));
        } catch (err) {
          console.warn('[useProjectSession] Failed to sync project metadata:', err);
        }
      }, SYNC_DEBOUNCE_MS);
    },
    [projectId, project]
  );

  // Flush session to IndexedDB
  const flushSession = useCallback(async () => {
    if (!sessionId) return;

    // Flush IndexedDB persistence
    await flushPendingPersistence(sessionId);

    // Also flush any pending Firestore updates
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    if (projectId && Object.keys(pendingUpdatesRef.current).length > 0) {
      const toSync = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      await updateProject(projectId, toSync);
    }
  }, [sessionId, projectId]);

  return {
    project,
    sessionId,
    isLoading,
    error,
    restoredState,
    syncProjectMetadata,
    flushSession,
  };
}
