/**
 * Assembly Service Property-Based Tests
 *
 * Feature: multi-format-pipeline
 *
 * Property 27: Advertisement CTA Emphasis
 *   Validates: Requirements 4.6, 15.2
 *
 * Property 28: Documentary Chapter Organization
 *   Validates: Requirements 5.6, 15.4
 *
 * Property 30: Assembly Graceful Degradation
 *   Validates: Requirements 15.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildCTAMarker,
  validateCTAPosition,
  buildChapterMarkers,
  validateChapterSequence,
  buildAssemblyRules,
  assembleWithGracefulDegradation,
  generateBeatMetadata,
} from './formatAssembly';
import type { ScreenplayScene, TimelineClip, VideoFormat } from '../../types';

// ============================================================================
// Helpers
// ============================================================================

function makeScene(index: number, heading?: string): ScreenplayScene {
  return {
    id: `scene_${index}`,
    sceneNumber: index + 1,
    heading: heading ?? `INT. ROOM ${index + 1} - DAY`,
    action: `Scene ${index + 1} action text`,
    dialogue: [],
    charactersPresent: [],
  };
}

function makeClip(
  id: string,
  type: TimelineClip['type'],
  start: number,
  end: number,
  hasAsset: boolean = true
): TimelineClip {
  return {
    id,
    type,
    startTime: start,
    endTime: end,
    assetUrl: hasAsset ? `https://cdn.example.com/${id}.mp4` : undefined,
  };
}

// ============================================================================
// Property 27: Advertisement CTA Emphasis
// Feature: multi-format-pipeline, Property 27: Advertisement CTA Emphasis
// Validates: Requirements 4.6, 15.2
// ============================================================================

describe('Property 27: Advertisement CTA Emphasis', () => {
  it('CTA marker is always positioned in the final 5 seconds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 6, max: 120, noNaN: true }), // total duration (>5s so CTA fits)
        fc.string({ minLength: 1, maxLength: 50 }),    // CTA text
        (duration, ctaText) => {
          const marker = buildCTAMarker(ctaText, duration);
          expect(validateCTAPosition(marker, duration)).toBe(true);
        }
      )
    );
  });

  it('CTA marker text is preserved', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z ]{3,30}$/),
        (ctaText) => {
          const marker = buildCTAMarker(ctaText, 30);
          expect(marker.text).toBe(ctaText);
        }
      )
    );
  });

  it('CTA starts at totalDuration - 5 for videos longer than 5 seconds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 60, noNaN: true }),
        (duration) => {
          const marker = buildCTAMarker('Buy Now', duration, 5);
          expect(marker.startTime).toBeCloseTo(duration - 5, 5);
          expect(marker.duration).toBeCloseTo(5, 5);
        }
      )
    );
  });

  it('CTA duration is clamped for very short videos', () => {
    const marker = buildCTAMarker('Buy Now', 3, 5);
    expect(marker.duration).toBe(3);
    expect(marker.startTime).toBe(0);
  });

  it('CTA startTime is never negative', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 120, noNaN: true }),
        (duration) => {
          const marker = buildCTAMarker('CTA', duration);
          expect(marker.startTime).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });

  it('buildAssemblyRules adds CTA marker for advertisement format', () => {
    const rules = buildAssemblyRules('advertisement', {
      totalDuration: 30,
      ctaText: 'Shop Now',
    });
    expect(rules.ctaMarker).toBeDefined();
    expect(rules.ctaMarker!.text).toBe('Shop Now');
    expect(validateCTAPosition(rules.ctaMarker!, 30)).toBe(true);
  });

  it('buildAssemblyRules does NOT add CTA for non-advertisement formats', () => {
    const formats: VideoFormat[] = ['youtube-narrator', 'documentary', 'educational'];
    for (const formatId of formats) {
      const rules = buildAssemblyRules(formatId, { totalDuration: 300 });
      expect(rules.ctaMarker, `${formatId} should not have CTA`).toBeUndefined();
    }
  });
});

// ============================================================================
// Property 28: Documentary Chapter Organization
// Feature: multi-format-pipeline, Property 28: Documentary Chapter Organization
// Validates: Requirements 5.6, 15.4
// ============================================================================

describe('Property 28: Documentary Chapter Organization', () => {
  it('chapter markers cover all scenes with correct time positions', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({ min: 10, max: 300, noNaN: true }),
          { minLength: 2, maxLength: 8 }
        ),
        (durations) => {
          const scenes = durations.map((_, i) => makeScene(i));
          const chapters = buildChapterMarkers(scenes, durations);

          // One chapter per scene
          expect(chapters).toHaveLength(scenes.length);

          // Chapters are contiguous
          expect(validateChapterSequence(chapters)).toBe(true);

          // Total duration matches sum of scene durations
          const lastChapter = chapters[chapters.length - 1]!;
          const totalDuration = durations.reduce((a, b) => a + b, 0);
          expect(lastChapter.endTime).toBeCloseTo(totalDuration, 5);
        }
      )
    );
  });

  it('chapter titles use scene headings', () => {
    const scenes = [
      makeScene(0, 'INT. PRISON - NIGHT'),
      makeScene(1, 'EXT. DESERT - DAY'),
    ];
    const chapters = buildChapterMarkers(scenes, [60, 90]);

    expect(chapters[0]!.title).toBe('INT. PRISON - NIGHT');
    expect(chapters[1]!.title).toBe('EXT. DESERT - DAY');
  });

  it('chapters start at time 0 and are non-overlapping', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({ min: 5, max: 120, noNaN: true }),
          { minLength: 1, maxLength: 6 }
        ),
        (durations) => {
          const scenes = durations.map((_, i) => makeScene(i));
          const chapters = buildChapterMarkers(scenes, durations);

          // First chapter starts at 0
          expect(chapters[0]!.startTime).toBe(0);

          // No overlaps
          for (let i = 1; i < chapters.length; i++) {
            expect(chapters[i]!.startTime).toBeCloseTo(chapters[i - 1]!.endTime, 5);
          }
        }
      )
    );
  });

  it('each chapter has a unique ID', () => {
    const scenes = Array.from({ length: 5 }, (_, i) => makeScene(i));
    const durations = [30, 45, 60, 30, 45];
    const chapters = buildChapterMarkers(scenes, durations);
    const ids = chapters.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('validateChapterSequence rejects overlapping chapters', () => {
    const bad = [
      { id: 'c1', title: 'A', startTime: 0, endTime: 30 },
      { id: 'c2', title: 'B', startTime: 25, endTime: 60 }, // overlaps!
    ];
    expect(validateChapterSequence(bad)).toBe(false);
  });

  it('validateChapterSequence rejects zero-duration chapters', () => {
    const bad = [
      { id: 'c1', title: 'A', startTime: 10, endTime: 10 }, // 0 duration
    ];
    expect(validateChapterSequence(bad)).toBe(false);
  });

  it('buildAssemblyRules adds chapters for documentary format', () => {
    const scenes = [makeScene(0), makeScene(1), makeScene(2)];
    const sceneDurations = [120, 180, 150];
    const rules = buildAssemblyRules('documentary', { scenes, sceneDurations });
    expect(rules.chapters).toBeDefined();
    expect(rules.chapters).toHaveLength(3);
    expect(rules.useChapterStructure).toBe(true);
  });

  it('buildAssemblyRules does NOT add chapters for non-documentary formats', () => {
    const scenes = [makeScene(0), makeScene(1)];
    const sceneDurations = [120, 180];
    const formats: VideoFormat[] = ['advertisement', 'shorts', 'youtube-narrator'];
    for (const formatId of formats) {
      const rules = buildAssemblyRules(formatId, { scenes, sceneDurations });
      expect(rules.chapters, `${formatId} should not have chapters`).toBeUndefined();
    }
  });
});

// ============================================================================
// Property 30: Assembly Graceful Degradation
// Feature: multi-format-pipeline, Property 30: Assembly Graceful Degradation
// Validates: Requirements 15.5
// ============================================================================

describe('Property 30: Assembly Graceful Degradation', () => {
  it('all clips assembled when all assets are available', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (count) => {
          const clips: TimelineClip[] = [];
          const available = new Set<string>();

          for (let i = 0; i < count; i++) {
            const clip = makeClip(`clip_${i}`, 'visual', i * 10, (i + 1) * 10);
            clips.push(clip);
            available.add(clip.id);
          }

          const result = assembleWithGracefulDegradation(clips, available);
          expect(result.success).toBe(true);
          expect(result.partial).toBe(false);
          expect(result.assembledClips).toHaveLength(count);
          expect(result.missingAssets).toHaveLength(0);
          expect(result.errors).toHaveLength(0);
        }
      )
    );
  });

  it('partial assembly when some assets are missing', () => {
    const clips = [
      makeClip('v1', 'visual', 0, 10),
      makeClip('v2', 'visual', 10, 20),
      makeClip('v3', 'visual', 20, 30),
    ];
    // Only v1 and v3 are available
    const available = new Set(['v1', 'v3']);

    const result = assembleWithGracefulDegradation(clips, available);
    expect(result.success).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.assembledClips).toHaveLength(2);
    expect(result.missingAssets).toEqual(['v2']);
    expect(result.errors).toHaveLength(1);
  });

  it('clips without assetUrl always succeed (transitions, text)', () => {
    const clips = [
      makeClip('t1', 'transition', 9, 11, false), // no assetUrl
      makeClip('txt1', 'text', 0, 30, false),      // no assetUrl
    ];
    const available = new Set<string>(); // empty — no assets at all

    const result = assembleWithGracefulDegradation(clips, available);
    expect(result.success).toBe(true);
    expect(result.partial).toBe(false); // no missing since none needed
    expect(result.assembledClips).toHaveLength(2);
  });

  it('failure when zero assets are available and all clips need assets', () => {
    const clips = [
      makeClip('v1', 'visual', 0, 10),
      makeClip('v2', 'visual', 10, 20),
    ];
    const available = new Set<string>(); // nothing available

    const result = assembleWithGracefulDegradation(clips, available);
    expect(result.success).toBe(false);
    expect(result.partial).toBe(false);
    expect(result.assembledClips).toHaveLength(0);
    expect(result.missingAssets).toHaveLength(2);
  });

  it('error messages include clip details for each missing asset', () => {
    const clips = [makeClip('missing_1', 'visual', 5, 15)];
    const available = new Set<string>();

    const result = assembleWithGracefulDegradation(clips, available);
    expect(result.errors[0]).toContain('missing_1');
    expect(result.errors[0]).toContain('visual');
    expect(result.errors[0]).toMatch(/5s.*15s/);
  });

  it('missingAssets count is correct for any mix of available/missing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),      // total clips
        fc.integer({ min: 0, max: 20 }),       // available count
        (totalClips, availCount) => {
          const actualAvail = Math.min(availCount, totalClips);
          const clips: TimelineClip[] = [];
          const available = new Set<string>();

          for (let i = 0; i < totalClips; i++) {
            clips.push(makeClip(`c_${i}`, 'visual', i * 10, (i + 1) * 10));
            if (i < actualAvail) {
              available.add(`c_${i}`);
            }
          }

          const result = assembleWithGracefulDegradation(clips, available);
          expect(result.assembledClips.length).toBe(actualAvail);
          expect(result.missingAssets.length).toBe(totalClips - actualAvail);
          expect(result.errors.length).toBe(totalClips - actualAvail);
        }
      )
    );
  });

  it('mixed clip types (some with assets, some without) degrade correctly', () => {
    const clips = [
      makeClip('v1', 'visual', 0, 10, true),
      makeClip('tr1', 'transition', 10, 11, false),
      makeClip('v2', 'visual', 11, 20, true),
      makeClip('txt1', 'text', 0, 20, false),
    ];
    // Only v1 is available, v2 is missing
    const available = new Set(['v1']);

    const result = assembleWithGracefulDegradation(clips, available);
    expect(result.success).toBe(true);
    expect(result.partial).toBe(true);
    // v1 + tr1 + txt1 assembled (3), v2 missing (1)
    expect(result.assembledClips).toHaveLength(3);
    expect(result.missingAssets).toEqual(['v2']);
  });
});
