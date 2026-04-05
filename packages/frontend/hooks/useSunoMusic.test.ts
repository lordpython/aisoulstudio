/**
 * Tests for useSunoMusic hook
 *
 * Focused on verifying the guard-interval cleanup contract:
 * - Interval is cleared when waitForCompletion resolves (happy path)
 * - Interval is cleared when the operation times out
 * - Interval is cleared when the user cancels via cancelGeneration()
 *
 * Structural note: useSunoMusic uses a `Promise.race([waitForCompletion, guardPromise]).finally(clearInterval)`
 * pattern introduced to fix a setInterval leak. These tests confirm the fix holds.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSunoConfigured: vi.fn(() => true),
  generateMusic: vi.fn(),
  waitForCompletion: vi.fn(),
  generateLyrics: vi.fn(),
  getLyricsStatus: vi.fn(),
  getCredits: vi.fn(),
  extendMusic: vi.fn(),
  uploadAndExtend: vi.fn(),
  generatePersona: vi.fn(),
  convertToWav: vi.fn(),
  separateVocals: vi.fn(),
  waitForStemSeparation: vi.fn(),
  createMusicVideo: vi.fn(),
  generateCover: vi.fn(),
  addVocals: vi.fn(),
  addInstrumental: vi.fn(),
  uploadAndCover: vi.fn(),
  uploadAudioFile: vi.fn(),
}));

vi.mock('@/services/music/sunoService', () => ({
  SunoTaskStatus: {},
  isSunoConfigured: mocks.isSunoConfigured,
  generateMusic: mocks.generateMusic,
  waitForCompletion: mocks.waitForCompletion,
  generateLyrics: mocks.generateLyrics,
  getLyricsStatus: mocks.getLyricsStatus,
  getCredits: mocks.getCredits,
  extendMusic: mocks.extendMusic,
  uploadAndExtend: mocks.uploadAndExtend,
  generatePersona: mocks.generatePersona,
  convertToWav: mocks.convertToWav,
  separateVocals: mocks.separateVocals,
  waitForStemSeparation: mocks.waitForStemSeparation,
  createMusicVideo: mocks.createMusicVideo,
  generateCover: mocks.generateCover,
  addVocals: mocks.addVocals,
  addInstrumental: mocks.addInstrumental,
  uploadAndCover: mocks.uploadAndCover,
  uploadAudioFile: mocks.uploadAudioFile,
}));

vi.mock('@/services/infrastructure/logger', () => ({
  musicLogger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { useSunoMusic } from './useSunoMusic';

describe('useSunoMusic — guard interval cleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restore default: Suno is configured unless a test explicitly overrides this
    mocks.isSunoConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('clears the guard interval when waitForCompletion resolves (happy path)', async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const tracks = [{ id: 'track_1', title: 'Test Track', audio_url: '' }];
    mocks.generateMusic.mockResolvedValue('task_happy');
    mocks.waitForCompletion.mockResolvedValue(tracks);

    const { result } = renderHook(() => useSunoMusic());

    await act(async () => {
      result.current.generateMusic({ prompt: 'happy path test' });
      await vi.runAllTimersAsync();
    });

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(result.current.musicState.isGenerating).toBe(false);
    expect(result.current.musicState.generatedTracks).toEqual(tracks);
  });

  it('clears the guard interval when the operation times out', async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    mocks.generateMusic.mockResolvedValue('task_timeout');
    mocks.waitForCompletion.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSunoMusic());

    await act(async () => {
      result.current.generateMusic({ prompt: 'timeout test' });
      await vi.runAllTicks();
    });

    // Advance past DEFAULT_TIMEOUT_MS (5 minutes = 300 000 ms)
    await act(async () => {
      vi.advanceTimersByTime(310_000);
      await vi.runAllTicks();
    });

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(result.current.musicState.isGenerating).toBe(false);
    expect(result.current.musicState.status).toBe('FAILED');
  });

  it('clears the guard interval when the user cancels the operation', async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    mocks.generateMusic.mockResolvedValue('task_cancel');
    mocks.waitForCompletion.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSunoMusic());

    await act(async () => {
      result.current.generateMusic({ prompt: 'cancel test' });
      await vi.runAllTicks();
    });

    await act(async () => {
      result.current.cancelGeneration();
      vi.advanceTimersByTime(1100); // past the 1 000 ms guard check
      await vi.runAllTicks();
    });

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('reports an error and skips API call when Suno is not configured', async () => {
    mocks.isSunoConfigured.mockReturnValue(false);

    const { result } = renderHook(() => useSunoMusic());

    await act(async () => {
      result.current.generateMusic({ prompt: 'unconfigured test' });
    });

    expect(mocks.generateMusic).not.toHaveBeenCalled();
    expect(result.current.musicState.error).toMatch(/api key/i);
  });

  it('exposes generated tracks and selects the first after a successful generation', async () => {
    vi.useFakeTimers();
    const tracks = [
      { id: 'track_a', title: 'Song A', audio_url: 'https://cdn.suno.ai/a.mp3' },
      { id: 'track_b', title: 'Song B', audio_url: 'https://cdn.suno.ai/b.mp3' },
    ];
    mocks.generateMusic.mockResolvedValue('task_tracks');
    mocks.waitForCompletion.mockResolvedValue(tracks);

    const { result } = renderHook(() => useSunoMusic());

    await act(async () => {
      result.current.generateMusic({ prompt: 'two tracks' });
      await vi.runAllTimersAsync();
    });

    expect(result.current.musicState.generatedTracks).toEqual(tracks);
    expect(result.current.musicState.selectedTrackId).toBe('track_a');
    expect(result.current.musicState.status).toBe('SUCCESS');
  });
});
