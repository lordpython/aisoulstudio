import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectSession } from './useProjectSession';
import { createInitialState } from '@/services/ai/production/types';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  updateProject: vi.fn(),
  markProjectAccessed: vi.fn(),
  restoreProductionSession: vi.fn(),
  initializeProductionSession: vi.fn(),
  flushPendingPersistence: vi.fn(),
  initSession: vi.fn(),
  setCurrentProjectId: vi.fn(),
}));

vi.mock('@/stores', () => ({
  useAppStore: (selector: (store: { setCurrentProjectId: typeof mocks.setCurrentProjectId }) => unknown) =>
    selector({
      setCurrentProjectId: mocks.setCurrentProjectId,
    }),
}));

vi.mock('@/services/project/projectService', () => ({
  getProject: mocks.getProject,
  updateProject: mocks.updateProject,
  markProjectAccessed: mocks.markProjectAccessed,
}));

vi.mock('@/services/ai/production/store', () => ({
  restoreProductionSession: mocks.restoreProductionSession,
  initializeProductionSession: mocks.initializeProductionSession,
  flushPendingPersistence: mocks.flushPendingPersistence,
}));

vi.mock('@/services/cloud/cloudStorageService', () => ({
  cloudAutosave: {
    initSession: mocks.initSession,
  },
}));

describe('useProjectSession', () => {
  const project = {
    id: 'proj_restore_test',
    userId: 'user_1',
    title: 'Restore Test',
    type: 'production' as const,
    status: 'draft' as const,
    createdAt: new Date('2026-03-19T00:00:00Z'),
    updatedAt: new Date('2026-03-19T00:00:00Z'),
    cloudSessionId: 'production_proj_restore_test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue(project);
    mocks.updateProject.mockResolvedValue(undefined);
    mocks.markProjectAccessed.mockResolvedValue(undefined);
    mocks.restoreProductionSession.mockResolvedValue(null);
    mocks.initializeProductionSession.mockResolvedValue(undefined);
    mocks.flushPendingPersistence.mockResolvedValue(undefined);
    mocks.initSession.mockResolvedValue(true);
  });

  it('restores the canonical project session and reconnects cloud autosave', async () => {
    const restoredState = {
      ...createInitialState(),
      isComplete: true,
    };
    mocks.restoreProductionSession.mockResolvedValue(restoredState);

    const { result } = renderHook(() => useProjectSession(project.id));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mocks.getProject).toHaveBeenCalledWith(project.id);
    expect(mocks.restoreProductionSession).toHaveBeenCalledWith(project.cloudSessionId);
    expect(mocks.initSession).toHaveBeenCalledWith(project.cloudSessionId);
    expect(mocks.initializeProductionSession).not.toHaveBeenCalled();
    expect(mocks.setCurrentProjectId).toHaveBeenCalledWith(project.id);
    expect(result.current.sessionId).toBe(project.cloudSessionId);
    expect(result.current.restoredState).toEqual(restoredState);
  });

  it('initializes a missing project session using the canonical project session id', async () => {
    const { result } = renderHook(() => useProjectSession(project.id));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mocks.restoreProductionSession).toHaveBeenCalledWith(project.cloudSessionId);
    expect(mocks.initializeProductionSession).toHaveBeenCalledWith(project.cloudSessionId, {});
    expect(mocks.initSession).toHaveBeenCalledWith(project.cloudSessionId);
    expect(result.current.sessionId).toBe(project.cloudSessionId);
    expect(result.current.restoredState).toBeNull();
  });
});
