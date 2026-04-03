import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ProductionSessionSnapshot } from '@/services/orchestration/productionApi';
import type { ProductionState } from '@/services/ai/production';

const mocks = vi.hoisted(() => ({
  initializeProductionSession: vi.fn(),
  startProductionRun: vi.fn(),
  getProductionSessionSnapshot: vi.fn(),
  hydrateProductionSessionSnapshot: vi.fn(),
  subscribeToProductionRun: vi.fn(),
  generateAndSaveQualityReport: vi.fn(() => ({ overallScore: 92 })),
}));

vi.mock('@/services/ai/production/store', () => ({
  initializeProductionSession: mocks.initializeProductionSession,
}));

vi.mock('@/services/orchestration/productionApi', () => ({
  startProductionRun: mocks.startProductionRun,
  getProductionSessionSnapshot: mocks.getProductionSessionSnapshot,
  hydrateProductionSessionSnapshot: mocks.hydrateProductionSessionSnapshot,
  subscribeToProductionRun: mocks.subscribeToProductionRun,
}));

vi.mock('./useVideoQuality', () => ({
  useVideoQuality: () => ({
    qualityReport: null,
    generateAndSaveQualityReport: mocks.generateAndSaveQualityReport,
    runValidation: vi.fn(),
    resetQuality: vi.fn(),
    getQualityHistoryData: vi.fn(),
    getQualityTrend: vi.fn(),
    exportQualityReport: vi.fn(),
    getQualitySummaryText: vi.fn(),
  }),
}));

import { useVideoProductionRefactored } from './useVideoProductionRefactored';

describe('useVideoProductionRefactored', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts production through the backend API and hydrates the canonical session snapshot', async () => {
    const snapshot: ProductionSessionSnapshot = {
      sessionId: 'production_proj_frontend_test',
      contentPlan: {
        title: 'Backend Hydration',
        totalDuration: 60,
        targetAudience: 'General audience',
        overallTone: 'documentary',
        scenes: [
          {
            id: 'scene-1',
            name: 'Scene 1',
            duration: 12,
            visualDescription: 'A sunrise over the sea',
            narrationScript: 'Narration text',
          },
        ],
      },
      validation: {
        approved: true,
        score: 92,
        issues: [],
        suggestions: [],
      },
      narrationSegments: [],
      visuals: [
        {
          promptId: 'scene-1',
          imageUrl: 'https://example.com/scene-1.png',
          type: 'image',
        },
      ],
      sfxPlan: null,
      errors: [],
      qualityScore: 92,
      bestQualityScore: 92,
      isComplete: true,
    };

    const hydratedState: ProductionState = {
      contentPlan: snapshot.contentPlan,
      validation: snapshot.validation,
      narrationSegments: [],
      visuals: snapshot.visuals,
      sfxPlan: snapshot.sfxPlan,
      musicTaskId: null,
      musicUrl: null,
      musicTrack: null,
      errors: [],
      isComplete: true,
      importedContent: null,
      qualityScore: 92,
      qualityIterations: 0,
      bestQualityScore: 92,
      mixedAudio: null,
      subtitles: null,
      exportResult: null,
      exportedVideo: null,
    };

    mocks.startProductionRun.mockResolvedValue({
      runId: 'run_frontend_test',
      sessionId: snapshot.sessionId,
    });
    mocks.getProductionSessionSnapshot.mockResolvedValue(snapshot);
    mocks.hydrateProductionSessionSnapshot.mockResolvedValue(hydratedState);
    mocks.subscribeToProductionRun.mockImplementation((_runId, onEvent) => {
      queueMicrotask(() => {
        onEvent({
          stage: 'content_planning',
          message: 'Planning scenes',
          progress: 40,
          isComplete: false,
          sessionId: snapshot.sessionId,
        });
        onEvent({
          stage: 'complete',
          message: 'Production complete',
          progress: 100,
          isComplete: true,
          success: true,
          sessionId: snapshot.sessionId,
        });
      });

      return vi.fn();
    });

    const { result } = renderHook(() => useVideoProductionRefactored());

    act(() => {
      result.current.setTopic('Backend Hydration');
    });

    await act(async () => {
      await result.current.startProduction({
        sessionId: snapshot.sessionId,
        projectId: 'proj_frontend_test',
        targetDuration: 60,
        visualStyle: 'Cinematic',
      });
    });

    expect(mocks.startProductionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: snapshot.sessionId,
        projectId: 'proj_frontend_test',
        topic: 'Backend Hydration',
        targetDuration: 60,
        mode: 'agent',
      }),
    );

    await waitFor(() => {
      expect(result.current.contentPlan?.title).toBe('Backend Hydration');
      expect(result.current.visuals).toHaveLength(1);
      expect(result.current.validation?.score).toBe(92);
      expect(result.current.appState).toBe('READY');
    });

    expect(mocks.initializeProductionSession).toHaveBeenCalledWith(
      snapshot.sessionId,
      expect.objectContaining({
        contentPlan: hydratedState.contentPlan,
        visuals: hydratedState.visuals,
        validation: hydratedState.validation,
      }),
    );
    expect(mocks.generateAndSaveQualityReport).toHaveBeenCalled();
  });
});
