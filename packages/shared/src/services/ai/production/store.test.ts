/**
 * State Persistence Property Tests
 *
 * Property 34: State Persistence Round-Trip (Requirements 18.1, 18.2)
 * Property 35: Format ID Persistence (Requirement 18.3)
 * Property 36: State Isolation (Requirement 18.4)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  storyModeStore,
  saveStoryModeSession,
  loadStoryModeSession,
  getStorySessionsByFormat,
  clearStorySessionsByFormat,
} from './store';
import type { StoryModeState } from './types';

/** Create a minimal valid StoryModeState for testing */
function createTestState(overrides: Partial<StoryModeState> = {}): StoryModeState {
  return {
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    topic: 'Test topic',
    breakdown: '',
    screenplay: [],
    characters: [],
    shotlist: [],
    currentStep: 'breakdown',
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('State Persistence', () => {
  beforeEach(() => {
    // Clear in-memory store between tests
    storyModeStore.clear();
  });

  describe('Property 34: State Persistence Round-Trip', () => {
    it('should save and load state from in-memory store', async () => {
      const sessionId = 'test_session_001';
      const state = createTestState({ topic: 'Round-trip test' });

      saveStoryModeSession(sessionId, state);
      const loaded = await loadStoryModeSession(sessionId);

      expect(loaded).not.toBeNull();
      expect(loaded!.topic).toBe('Round-trip test');
      expect(loaded!.id).toBe(state.id);
    });

    it('should return null for non-existent session', async () => {
      const loaded = await loadStoryModeSession('non_existent_session');
      expect(loaded).toBeNull();
    });

    it('should preserve all fields through save/load cycle', async () => {
      const sessionId = 'test_full_state';
      const state = createTestState({
        topic: 'Full state test',
        breakdown: 'Act 1: Introduction\nAct 2: Conflict',
        screenplay: [
          { id: 'sc1', sceneNumber: 1, heading: 'EXT. PARK - DAY', action: 'A dog runs', dialogue: [], charactersPresent: [] },
        ],
        characters: [
          { id: 'c1', name: 'Hero', role: 'protagonist', visualDescription: 'Tall warrior' },
        ],
        currentStep: 'screenplay',
        formatId: 'youtube-narrator',
        language: 'ar',
      });

      saveStoryModeSession(sessionId, state);
      const loaded = await loadStoryModeSession(sessionId);

      expect(loaded!.topic).toBe('Full state test');
      expect(loaded!.breakdown).toContain('Act 1');
      expect(loaded!.screenplay).toHaveLength(1);
      expect(loaded!.characters).toHaveLength(1);
      expect(loaded!.currentStep).toBe('screenplay');
      expect(loaded!.formatId).toBe('youtube-narrator');
      expect(loaded!.language).toBe('ar');
    });

    it('should overwrite state on re-save', async () => {
      const sessionId = 'test_overwrite';
      const state1 = createTestState({ topic: 'Version 1' });
      const state2 = createTestState({ topic: 'Version 2' });

      saveStoryModeSession(sessionId, state1);
      saveStoryModeSession(sessionId, state2);

      const loaded = await loadStoryModeSession(sessionId);
      expect(loaded!.topic).toBe('Version 2');
    });

    it('should stamp updatedAt on save', async () => {
      const sessionId = 'test_timestamp';
      const before = Date.now();
      const state = createTestState({ updatedAt: 0 });

      saveStoryModeSession(sessionId, state);
      const loaded = await loadStoryModeSession(sessionId);

      expect(loaded!.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('Property 35: Format ID Persistence', () => {
    it('should persist formatId through save/load', async () => {
      const sessionId = 'test_format_persist';
      const state = createTestState({ formatId: 'documentary' });

      saveStoryModeSession(sessionId, state);
      const loaded = await loadStoryModeSession(sessionId);

      expect(loaded!.formatId).toBe('documentary');
    });

    it('should persist undefined formatId (backward compat)', async () => {
      const sessionId = 'test_no_format';
      const state = createTestState(); // no formatId

      saveStoryModeSession(sessionId, state);
      const loaded = await loadStoryModeSession(sessionId);

      expect(loaded!.formatId).toBeUndefined();
    });

    it('should filter by expectedFormatId when loading', async () => {
      const sessionId = 'test_format_filter';
      const state = createTestState({ formatId: 'advertisement' });

      saveStoryModeSession(sessionId, state);

      // Load with matching format
      const match = await loadStoryModeSession(sessionId, 'advertisement');
      expect(match).not.toBeNull();

      // Load with mismatching format
      const noMatch = await loadStoryModeSession(sessionId, 'documentary');
      expect(noMatch).toBeNull();
    });

    it('should not filter when session has no formatId', async () => {
      const sessionId = 'test_legacy_no_format';
      const state = createTestState(); // no formatId (legacy)

      saveStoryModeSession(sessionId, state);

      // Should still load even when expectedFormatId is provided
      // because state.formatId is undefined (legacy session)
      const loaded = await loadStoryModeSession(sessionId, 'documentary');
      expect(loaded).not.toBeNull();
    });
  });

  describe('Property 36: State Isolation', () => {
    it('should return only sessions matching format ID', () => {
      saveStoryModeSession('s1', createTestState({ formatId: 'youtube-narrator', topic: 'YT 1' }));
      saveStoryModeSession('s2', createTestState({ formatId: 'advertisement', topic: 'Ad 1' }));
      saveStoryModeSession('s3', createTestState({ formatId: 'youtube-narrator', topic: 'YT 2' }));
      saveStoryModeSession('s4', createTestState({ formatId: 'documentary', topic: 'Doc 1' }));

      const ytSessions = getStorySessionsByFormat('youtube-narrator');
      expect(ytSessions).toHaveLength(2);
      expect(ytSessions.map(s => s.topic)).toEqual(expect.arrayContaining(['YT 1', 'YT 2']));

      const adSessions = getStorySessionsByFormat('advertisement');
      expect(adSessions).toHaveLength(1);
      expect(adSessions[0]!.topic).toBe('Ad 1');
    });

    it('should return empty array for format with no sessions', () => {
      saveStoryModeSession('s1', createTestState({ formatId: 'youtube-narrator' }));

      const sessions = getStorySessionsByFormat('shorts');
      expect(sessions).toHaveLength(0);
    });

    it('should sort by updatedAt descending', () => {
      saveStoryModeSession('s1', createTestState({ formatId: 'documentary', updatedAt: 100 }));
      // Small delay to ensure different timestamps
      saveStoryModeSession('s2', createTestState({ formatId: 'documentary', updatedAt: 200 }));

      const sessions = getStorySessionsByFormat('documentary');
      expect(sessions).toHaveLength(2);
      // Both get re-stamped by saveStoryModeSession, but order should be newest first
      expect(sessions[0]!.updatedAt).toBeGreaterThanOrEqual(sessions[1]!.updatedAt);
    });

    it('should clear only sessions of the specified format', () => {
      saveStoryModeSession('s1', createTestState({ formatId: 'youtube-narrator' }));
      saveStoryModeSession('s2', createTestState({ formatId: 'advertisement' }));
      saveStoryModeSession('s3', createTestState({ formatId: 'youtube-narrator' }));

      clearStorySessionsByFormat('youtube-narrator');

      expect(getStorySessionsByFormat('youtube-narrator')).toHaveLength(0);
      expect(getStorySessionsByFormat('advertisement')).toHaveLength(1);
    });

    it('should isolate state between different format sessions', async () => {
      const ytState = createTestState({
        formatId: 'youtube-narrator',
        topic: 'YouTube topic',
        breakdown: 'YouTube breakdown',
      });
      const adState = createTestState({
        formatId: 'advertisement',
        topic: 'Ad topic',
        breakdown: 'Ad breakdown',
      });

      saveStoryModeSession('yt_session', ytState);
      saveStoryModeSession('ad_session', adState);

      const loadedYt = await loadStoryModeSession('yt_session', 'youtube-narrator');
      const loadedAd = await loadStoryModeSession('ad_session', 'advertisement');

      expect(loadedYt!.topic).toBe('YouTube topic');
      expect(loadedAd!.topic).toBe('Ad topic');

      // Cross-format load should fail
      const crossLoad = await loadStoryModeSession('yt_session', 'advertisement');
      expect(crossLoad).toBeNull();
    });
  });
});
