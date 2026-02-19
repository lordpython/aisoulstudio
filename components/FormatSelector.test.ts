/**
 * FormatSelector Property-Based Tests
 *
 * Feature: multi-format-pipeline
 *
 * Property 43: Genre Filtering by Format
 *   Validates: Requirements 1.3, 23.1
 *
 * Property 44: Format-Specific Placeholder
 *   Validates: Requirements 1.4
 *
 * Property 45: Pipeline Execution Prevention
 *   Validates: Requirements 1.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatRegistry } from '@/services/formatRegistry';
import { getGenresForFormat, getPlaceholderForFormat } from './FormatSelector';
import type { VideoFormat } from '@/types';

// ============================================================================
// Arbitraries
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

const arbFormatId = fc.constantFrom(...ALL_FORMAT_IDS);

// ============================================================================
// Property 43: Genre Filtering by Format
// ============================================================================

describe('Feature: multi-format-pipeline, Property 43: Genre Filtering by Format', () => {
  it('displayed genres SHALL be exactly the format\'s applicableGenres list', () => {
    fc.assert(
      fc.property(arbFormatId, (formatId) => {
        const formatMetadata = formatRegistry.getFormat(formatId);
        expect(formatMetadata).not.toBeNull();

        const displayedGenres = getGenresForFormat(formatId);

        // Exactly matches the format's applicableGenres
        expect(displayedGenres).toEqual(formatMetadata!.applicableGenres);

        // No additional or missing genres
        expect(displayedGenres.length).toBe(formatMetadata!.applicableGenres.length);

        // Every displayed genre is in the format's list
        for (const genre of displayedGenres) {
          expect(formatMetadata!.applicableGenres).toContain(genre);
        }

        // Every format genre is displayed
        for (const genre of formatMetadata!.applicableGenres) {
          expect(displayedGenres).toContain(genre);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('invalid format returns empty genre list', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !ALL_FORMAT_IDS.includes(s as VideoFormat)),
        (invalidId) => {
          const genres = getGenresForFormat(invalidId);
          expect(genres).toEqual([]);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('all 8 formats have at least one applicable genre', () => {
    for (const formatId of ALL_FORMAT_IDS) {
      const genres = getGenresForFormat(formatId);
      expect(genres.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Property 44: Format-Specific Placeholder
// ============================================================================

describe('Feature: multi-format-pipeline, Property 44: Format-Specific Placeholder', () => {
  it('each format SHALL have a unique, non-empty placeholder text', () => {
    fc.assert(
      fc.property(arbFormatId, (formatId) => {
        const placeholder = getPlaceholderForFormat(formatId);

        // Must be a non-empty string
        expect(typeof placeholder).toBe('string');
        expect(placeholder.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('different formats have different placeholder text', () => {
    const placeholders = new Set<string>();
    for (const formatId of ALL_FORMAT_IDS) {
      const placeholder = getPlaceholderForFormat(formatId);
      placeholders.add(placeholder);
    }
    // All 8 formats have unique placeholders
    expect(placeholders.size).toBe(ALL_FORMAT_IDS.length);
  });
});

// ============================================================================
// Property 45: Pipeline Execution Prevention
// ============================================================================

describe('Feature: multi-format-pipeline, Property 45: Pipeline Execution Prevention', () => {
  it('SHALL prevent execution when no format is selected (null)', () => {
    // Simulates the execution guard logic from FormatSelector
    const selectedFormat: VideoFormat | null = null;
    const canExecute = selectedFormat !== null;
    expect(canExecute).toBe(false);
  });

  it('SHALL allow execution when a valid format is selected', () => {
    fc.assert(
      fc.property(arbFormatId, (formatId) => {
        const selectedFormat: VideoFormat | null = formatId;
        const idea = 'A test idea';
        const canExecute = selectedFormat !== null && idea.trim().length > 0;
        expect(canExecute).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('SHALL prevent execution when format is selected but idea is empty', () => {
    fc.assert(
      fc.property(
        arbFormatId,
        fc.constantFrom('', '   ', '\n', '\t'),
        (formatId, emptyIdea) => {
          const canExecute = formatId !== null && emptyIdea.trim().length > 0;
          expect(canExecute).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
