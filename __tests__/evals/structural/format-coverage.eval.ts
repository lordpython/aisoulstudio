/**
 * Structural eval: format coverage.
 *
 * Verifies that every format declared in the VideoFormat union is registered
 * in formatRegistry with valid metadata, and that the 8 expected formats
 * exist. No API calls — purely a structural sanity check.
 *
 * Why this matters: when refactoring pipelines (Tier 2 work), accidentally
 * dropping a format from the registry produces silent runtime failures.
 * This eval catches it at test time.
 *
 * Run: pnpm test:eval
 */

import { describe, it, expect } from 'vitest';
import { formatRegistry } from '../../../packages/shared/src/services/pipelines/formatRegistry';
import type { VideoFormat } from '../../../packages/shared/src/types';

const EXPECTED_FORMATS: VideoFormat[] = [
  'youtube-narrator',
  'advertisement',
  'movie-animation',
  'educational',
  'shorts',
  'documentary',
  'music-video',
  'news-politics',
];

describe('[STRUCTURAL] Format coverage', () => {
  it('registers all 8 expected formats', () => {
    const registered = formatRegistry.getAllFormats();
    const registeredIds = registered.map((f) => f.id).sort();
    expect(registeredIds).toEqual([...EXPECTED_FORMATS].sort());
  });

  it.each(EXPECTED_FORMATS)('format "%s" has valid metadata', (formatId) => {
    const meta = formatRegistry.getFormat(formatId);
    expect(meta).not.toBeNull();
    if (!meta) return;

    expect(meta.id).toBe(formatId);
    expect(meta.name.length).toBeGreaterThan(0);
    expect(meta.description.length).toBeGreaterThan(0);
    expect(meta.durationRange.min).toBeGreaterThan(0);
    expect(meta.durationRange.max).toBeGreaterThanOrEqual(meta.durationRange.min);
    expect(['16:9', '9:16', '1:1']).toContain(meta.aspectRatio);
    expect(meta.checkpointCount).toBeGreaterThanOrEqual(0);
    expect(meta.concurrencyLimit).toBeGreaterThan(0);
    expect(Array.isArray(meta.applicableGenres)).toBe(true);
    expect(meta.supportedLanguages.length).toBeGreaterThan(0);
    for (const lang of meta.supportedLanguages) {
      expect(['ar', 'en']).toContain(lang);
    }
  });

  it('every format declares at least one applicable genre', () => {
    const formats = formatRegistry.getAllFormats();
    const empty = formats.filter((f) => f.applicableGenres.length === 0);
    expect(
      empty,
      `Formats with no genres: ${empty.map((f) => f.id).join(', ')}`,
    ).toHaveLength(0);
  });

  it('no two formats share the same id', () => {
    const ids = formatRegistry.getAllFormats().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports active and deprecated counts that sum to total', () => {
    const all = formatRegistry.getAllFormats();
    const active = formatRegistry.getActiveFormats();
    const deprecated = formatRegistry.getDeprecatedFormats();
    expect(active.length + deprecated.length).toBe(all.length);
  });
});
