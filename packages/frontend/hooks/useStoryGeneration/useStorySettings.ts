/**
 * useStorySettings
 *
 * Thin sub-hook that owns the story-wide visual and generation settings.
 * All updaters use functional setState so they carry empty dependency arrays
 * and are stable across renders — safe to pass as props without useMemo.
 *
 * Extracted from useStoryGeneration/index.ts to keep that file focused on
 * the multi-step workflow logic.
 */

import { useCallback } from 'react';
import type { StoryState } from '@/types';
import { DEAPI_TTS_MODELS } from '@/services/media/narratorService';
import type { TTSProvider, DeApiTtsModel } from '@/services/media/narratorService';

type SetState = (updater: (prev: StoryState) => StoryState) => void;

export interface StorySettings {
  updateVisualStyle: (style: string) => void;
  updateAspectRatio: (ratio: string) => void;
  updateGenre: (genre: string) => void;
  updateImageProvider: (provider: 'gemini' | 'deapi') => void;
  updateDeapiImageModel: (model: string) => void;
  updateStyleConsistency: (enabled: boolean) => void;
  updateBgRemoval: (enabled: boolean) => void;
  updateTtsSettings: (provider: TTSProvider, model?: DeApiTtsModel) => void;
  updateTargetDuration: (seconds: number) => void;
}

export function useStorySettings(setState: SetState): StorySettings {
  const updateVisualStyle = useCallback(
    (style: string) =>
      setState((prev) => ({ ...prev, visualStyle: style })),
    [setState],
  );

  const updateAspectRatio = useCallback(
    (ratio: string) =>
      setState((prev) => ({ ...prev, aspectRatio: ratio })),
    [setState],
  );

  const updateGenre = useCallback(
    (genre: string) =>
      setState((prev) => ({ ...prev, genre })),
    [setState],
  );

  const updateImageProvider = useCallback(
    (provider: 'gemini' | 'deapi') =>
      setState((prev) => ({ ...prev, imageProvider: provider })),
    [setState],
  );

  const updateDeapiImageModel = useCallback(
    (model: string) =>
      setState((prev) => ({ ...prev, deapiImageModel: model })),
    [setState],
  );

  const updateStyleConsistency = useCallback(
    (enabled: boolean) =>
      setState((prev) => ({ ...prev, applyStyleConsistency: enabled })),
    [setState],
  );

  const updateBgRemoval = useCallback(
    (enabled: boolean) =>
      setState((prev) => ({ ...prev, animateWithBgRemoval: enabled })),
    [setState],
  );

  const updateTtsSettings = useCallback(
    (provider: TTSProvider, model?: DeApiTtsModel) =>
      setState((prev) => ({
        ...prev,
        ttsProvider: provider,
        ttsModel: model ?? prev.ttsModel ?? DEAPI_TTS_MODELS.QWEN3_VOICE_DESIGN,
      })),
    [setState],
  );

  const updateTargetDuration = useCallback(
    (seconds: number) =>
      setState((prev) => ({ ...prev, targetDurationSeconds: seconds })),
    [setState],
  );

  return {
    updateVisualStyle,
    updateAspectRatio,
    updateGenre,
    updateImageProvider,
    updateDeapiImageModel,
    updateStyleConsistency,
    updateBgRemoval,
    updateTtsSettings,
    updateTargetDuration,
  };
}
