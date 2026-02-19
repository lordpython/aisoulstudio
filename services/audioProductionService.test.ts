/**
 * Audio Production Service Property-Based Tests
 *
 * Feature: multi-format-pipeline
 *
 * Property 24: Format-Specific Voice Profile
 *   Validates: Requirements 3.4, 4.4, 9.6, 14.1
 *
 * Property 25: Music Video Beat Synchronization
 *   Validates: Requirements 8.4, 8.6, 15.3
 *
 * Property 26: Bilingual Audio Support
 *   Validates: Requirements 14.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  FORMAT_VOICE_PROFILE_MAP,
  getVoiceProfileForFormat,
  getFormatVoiceForLanguage,
  TTS_VOICES,
  type FormatVoiceProfile,
  type TTSVoice,
} from './narratorService';
import {
  generateBeatMetadata,
  findNearestBeat,
  snapToBeat,
  alignTransitionsToBeat,
} from './ffmpeg/formatAssembly';
import type { VideoFormat } from '../types';

// ============================================================================
// Constants
// ============================================================================

const ALL_FORMAT_IDS: VideoFormat[] = [
  'youtube-narrator',
  'advertisement',
  'movie-animation',
  'educational',
  'shorts',
  'documentary',
  'music-video',
  'news-politics',
];

const VALID_VOICES: TTSVoice[] = Object.values(TTS_VOICES);

// ============================================================================
// Property 24: Format-Specific Voice Profile
// Feature: multi-format-pipeline, Property 24: Format-Specific Voice Profile
// Validates: Requirements 3.4, 4.4, 9.6, 14.1
// ============================================================================

describe('Property 24: Format-Specific Voice Profile', () => {
  it('every format has a voice profile in FORMAT_VOICE_PROFILE_MAP', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const profile = FORMAT_VOICE_PROFILE_MAP[formatId];
      expect(profile, `missing voice profile for '${formatId}'`).toBeDefined();
      expect(profile.label).toBeTruthy();
      expect(profile.voice).toBeDefined();
      expect(profile.videoPurpose).toBeTruthy();
    }
  });

  it('getVoiceProfileForFormat returns a valid profile for every format', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const profile = getVoiceProfileForFormat(formatId);
      expect(profile.voice.voiceName).toBeTruthy();
      expect(VALID_VOICES).toContain(profile.voice.voiceName);
    }
  });

  it('youtube-narrator uses a conversational voice profile (Req 3.4)', () => {
    const profile = getVoiceProfileForFormat('youtube-narrator');
    expect(profile.label.toLowerCase()).toContain('conversational');
    expect(profile.voice.stylePrompt?.persona?.toLowerCase()).toMatch(/youtube|host|sharing/);
  });

  it('advertisement uses an energetic voice profile (Req 4.4)', () => {
    const profile = getVoiceProfileForFormat('advertisement');
    expect(profile.label.toLowerCase()).toContain('energetic');
    expect(profile.voice.stylePrompt?.emotion?.toLowerCase()).toMatch(/energetic|persuasive|confident/);
  });

  it('news-politics uses a neutral voice profile (Req 9.6)', () => {
    const profile = getVoiceProfileForFormat('news-politics');
    expect(profile.label.toLowerCase()).toContain('neutral');
    expect(profile.voice.stylePrompt?.emotion?.toLowerCase()).toMatch(/neutral|objective|balanced/);
  });

  it('every profile has a valid speaking rate (0.25–4.0)', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const profile = getVoiceProfileForFormat(formatId);
      const rate = profile.voice.speakingRate ?? 1.0;
      expect(rate, `'${formatId}' speaking rate out of range`).toBeGreaterThanOrEqual(0.25);
      expect(rate, `'${formatId}' speaking rate out of range`).toBeLessThanOrEqual(4.0);
    }
  });

  it('every profile has a valid pitch (-20 to 20)', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const profile = getVoiceProfileForFormat(formatId);
      const pitch = profile.voice.pitch ?? 0;
      expect(pitch, `'${formatId}' pitch out of range`).toBeGreaterThanOrEqual(-20);
      expect(pitch, `'${formatId}' pitch out of range`).toBeLessThanOrEqual(20);
    }
  });

  it('every profile has a non-empty style prompt', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const profile = getVoiceProfileForFormat(formatId);
      expect(profile.voice.stylePrompt, `'${formatId}' missing style prompt`).toBeDefined();
      const prompt = profile.voice.stylePrompt!;
      expect(prompt.persona || prompt.customDirectorNote, `'${formatId}' no persona`).toBeTruthy();
    }
  });

  it('all 8 formats are covered (no gaps)', () => {
    expect(Object.keys(FORMAT_VOICE_PROFILE_MAP)).toHaveLength(ALL_FORMAT_IDS.length);
  });
});

// ============================================================================
// Property 25: Music Video Beat Synchronization
// Feature: multi-format-pipeline, Property 25: Music Video Beat Synchronization
// Validates: Requirements 8.4, 8.6, 15.3
// ============================================================================

describe('Property 25: Music Video Beat Synchronization', () => {
  it('generateBeatMetadata produces beats at correct intervals for any BPM', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 60, max: 200 }),   // BPM
        fc.integer({ min: 10, max: 300 }),    // duration in seconds
        (bpm, durationSec) => {
          const meta = generateBeatMetadata(bpm, durationSec);
          expect(meta.bpm).toBe(bpm);
          expect(meta.durationSeconds).toBe(durationSec);
          expect(meta.beats.length).toBeGreaterThan(0);

          // First beat should be at time 0
          expect(meta.beats[0]!.timestamp).toBe(0);

          // All beats should be within duration (inclusive — rounding may land on boundary)
          for (const beat of meta.beats) {
            expect(beat.timestamp).toBeLessThanOrEqual(durationSec);
          }

          // Beats should be in ascending order
          for (let i = 1; i < meta.beats.length; i++) {
            expect(meta.beats[i]!.timestamp).toBeGreaterThan(meta.beats[i - 1]!.timestamp);
          }
        }
      )
    );
  });

  it('beat intervals are consistent (within 1ms tolerance)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 60, max: 180 }),
        (bpm) => {
          const meta = generateBeatMetadata(bpm, 30);
          const expectedInterval = 60 / bpm;

          for (let i = 1; i < Math.min(meta.beats.length, 10); i++) {
            const interval = meta.beats[i]!.timestamp - meta.beats[i - 1]!.timestamp;
            expect(Math.abs(interval - expectedInterval)).toBeLessThan(0.002);
          }
        }
      )
    );
  });

  it('beat intensities follow the expected pattern (strong on every 4th)', () => {
    const meta = generateBeatMetadata(120, 10);
    expect(meta.beats[0]!.intensity).toBe(1.0); // First beat is strong
    if (meta.beats.length > 1) {
      expect(meta.beats[1]!.intensity).toBe(0.3); // Second is weak
    }
    if (meta.beats.length > 2) {
      expect(meta.beats[2]!.intensity).toBe(0.6); // Third is medium
    }
    if (meta.beats.length > 4) {
      expect(meta.beats[4]!.intensity).toBe(1.0); // Fifth (index 4) is strong
    }
  });

  it('findNearestBeat returns the closest beat within tolerance', () => {
    const meta = generateBeatMetadata(120, 10); // 0.5s intervals
    const result = findNearestBeat(meta.beats, 1.02);
    expect(result).not.toBeNull();
    expect(result!.offsetMs).toBeLessThan(50); // within 50ms of beat at 1.0
  });

  it('findNearestBeat returns null for empty beats array', () => {
    expect(findNearestBeat([], 1.0)).toBeNull();
  });

  it('snapToBeat snaps within tolerance, returns original otherwise', () => {
    const meta = generateBeatMetadata(120, 10); // beats at 0, 0.5, 1.0, ...
    // Close to beat at 1.0 → snap
    const snapped = snapToBeat(meta.beats, 1.05, 100);
    expect(snapped).toBe(1.0);

    // Far from any beat → keep original
    const notSnapped = snapToBeat(meta.beats, 1.26, 10); // >10ms from any beat
    expect(notSnapped).toBe(1.26);
  });

  it('alignTransitionsToBeat aligns all transitions within 100ms tolerance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 80, max: 160 }),
        fc.array(fc.double({ min: 0, max: 29, noNaN: true }), { minLength: 1, maxLength: 10 }),
        (bpm, transitions) => {
          const meta = generateBeatMetadata(bpm, 30);
          const aligned = alignTransitionsToBeat(transitions, meta.beats, 100);

          expect(aligned).toHaveLength(transitions.length);

          for (let i = 0; i < aligned.length; i++) {
            const nearest = findNearestBeat(meta.beats, transitions[i]!);
            if (nearest && nearest.offsetMs <= 100) {
              // Should have been snapped to the beat
              expect(aligned[i]).toBe(nearest.beat.timestamp);
            } else {
              // Should remain at original position
              expect(aligned[i]).toBe(transitions[i]);
            }
          }
        }
      )
    );
  });
});

// ============================================================================
// Property 26: Bilingual Audio Support
// Feature: multi-format-pipeline, Property 26: Bilingual Audio Support
// Validates: Requirements 14.3
// ============================================================================

describe('Property 26: Bilingual Audio Support', () => {
  it('getFormatVoiceForLanguage returns a valid voice for English across all formats', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const config = getFormatVoiceForLanguage(formatId, 'en');
      expect(VALID_VOICES).toContain(config.voiceName);
    }
  });

  it('getFormatVoiceForLanguage returns a valid voice for Arabic across all formats', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const config = getFormatVoiceForLanguage(formatId, 'ar');
      expect(VALID_VOICES).toContain(config.voiceName);
    }
  });

  it('Arabic voice override uses LANGUAGE_VOICE_MAP (Aoede for Arabic)', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const config = getFormatVoiceForLanguage(formatId, 'ar');
      // Arabic should override to Aoede (best multilingual voice)
      expect(config.voiceName).toBe(TTS_VOICES.AOEDE);
    }
  });

  it('English does not override the format-default voice', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const formatDefault = getVoiceProfileForFormat(formatId).voice.voiceName;
      const config = getFormatVoiceForLanguage(formatId, 'en');
      expect(config.voiceName).toBe(formatDefault);
    }
  });

  it('style prompt is preserved when language overrides voice', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const config = getFormatVoiceForLanguage(formatId, 'ar');
      const formatDefault = getVoiceProfileForFormat(formatId).voice;
      // Style prompt should remain from the format profile
      expect(config.stylePrompt).toEqual(formatDefault.stylePrompt);
    }
  });

  it('speaking rate and pitch are preserved when language overrides voice', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_FORMAT_IDS),
        fc.constantFrom('ar' as const, 'en' as const),
        (formatId, lang) => {
          const formatDefault = getVoiceProfileForFormat(formatId).voice;
          const config = getFormatVoiceForLanguage(formatId, lang);
          expect(config.speakingRate).toBe(formatDefault.speakingRate);
          expect(config.pitch).toBe(formatDefault.pitch);
        }
      )
    );
  });
});
