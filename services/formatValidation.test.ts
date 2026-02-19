/**
 * Format Validation Tests
 *
 * Property 1: Format Configuration Consistency (Requirements 1.2, 3.1-9.1, 25.2)
 * Property 46: Genre Pipeline Invariance (Requirements 12.5, 23.3)
 */

import { describe, it, expect } from 'vitest';
import {
  validateFormatCompliance,
  validateGenrePipelineInvariance,
  getFormatPipelineStructure,
  getGenreStyleParams,
} from './formatValidation';
import { formatRegistry } from './formatRegistry';
import type { VideoFormat } from '../types';

const ALL_FORMATS: VideoFormat[] = [
  'youtube-narrator',
  'advertisement',
  'movie-animation',
  'educational',
  'shorts',
  'documentary',
  'music-video',
  'news-politics',
];

describe('Format Validation', () => {
  describe('Property 1: Format Configuration Consistency', () => {
    it('should validate compliant assets for each format', () => {
      for (const formatId of ALL_FORMATS) {
        const meta = formatRegistry.getFormat(formatId)!;
        const result = validateFormatCompliance(formatId, {
          durationSeconds: (meta.durationRange.min + meta.durationRange.max) / 2,
          aspectRatio: meta.aspectRatio,
          checkpointCount: meta.checkpointCount,
          concurrentTasks: meta.concurrencyLimit,
        });

        expect(result.valid).toBe(true);
        expect(result.violations).toHaveLength(0);
      }
    });

    it('should detect duration below minimum', () => {
      const result = validateFormatCompliance('youtube-narrator', {
        durationSeconds: 10, // min is 480
      });
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.field).toBe('duration');
      expect(result.violations[0]!.message).toContain('below minimum');
    });

    it('should detect duration above maximum', () => {
      const result = validateFormatCompliance('advertisement', {
        durationSeconds: 300, // max is 60
      });
      expect(result.valid).toBe(false);
      expect(result.violations[0]!.field).toBe('duration');
      expect(result.violations[0]!.message).toContain('exceeds maximum');
    });

    it('should detect wrong aspect ratio', () => {
      const result = validateFormatCompliance('shorts', {
        aspectRatio: '16:9', // shorts should be 9:16
      });
      expect(result.valid).toBe(false);
      expect(result.violations[0]!.field).toBe('aspectRatio');
    });

    it('should detect checkpoint count exceeding limit', () => {
      const result = validateFormatCompliance('advertisement', {
        checkpointCount: 5, // advertisement has max 2
      });
      expect(result.valid).toBe(false);
      expect(result.violations[0]!.field).toBe('checkpointCount');
    });

    it('should detect concurrency limit exceeded', () => {
      const result = validateFormatCompliance('advertisement', {
        concurrentTasks: 10, // advertisement limit is 3
      });
      expect(result.valid).toBe(false);
      expect(result.violations[0]!.field).toBe('concurrencyLimit');
    });

    it('should collect multiple violations', () => {
      const result = validateFormatCompliance('shorts', {
        durationSeconds: 300, // too long
        aspectRatio: '16:9', // wrong ratio
        checkpointCount: 10, // too many
      });
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBe(3);
    });

    it('should fail for unknown format', () => {
      const result = validateFormatCompliance('nonexistent' as VideoFormat, {});
      expect(result.valid).toBe(false);
      expect(result.violations[0]!.field).toBe('formatId');
    });

    it('should pass when no assets provided (no constraints to check)', () => {
      const result = validateFormatCompliance('youtube-narrator', {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Property 49: Format Deprecation Preservation', () => {
    it('should keep deprecated formats queryable in registry', () => {
      // Deprecate a format
      formatRegistry.deprecateFormat('music-video', 'Use shorts instead');

      // Format should still be queryable
      const format = formatRegistry.getFormat('music-video');
      expect(format).not.toBeNull();
      expect(format!.deprecated).toBe(true);
      expect(format!.deprecationMessage).toBe('Use shorts instead');

      // Format should still be valid
      expect(formatRegistry.isValidFormat('music-video')).toBe(true);

      // Format should appear in all formats
      const allFormats = formatRegistry.getAllFormats();
      expect(allFormats.some(f => f.id === 'music-video')).toBe(true);

      // But not in active formats
      const activeFormats = formatRegistry.getActiveFormats();
      expect(activeFormats.some(f => f.id === 'music-video')).toBe(false);

      // Should appear in deprecated formats
      const deprecatedFormats = formatRegistry.getDeprecatedFormats();
      expect(deprecatedFormats.some(f => f.id === 'music-video')).toBe(true);

      // Clean up
      const fmt = formatRegistry.getFormat('music-video')!;
      fmt.deprecated = false;
      fmt.deprecationMessage = undefined;
    });

    it('should report isDeprecated correctly', () => {
      expect(formatRegistry.isDeprecated('youtube-narrator')).toBe(false);

      formatRegistry.deprecateFormat('youtube-narrator');
      expect(formatRegistry.isDeprecated('youtube-narrator')).toBe(true);

      // Clean up
      const fmt = formatRegistry.getFormat('youtube-narrator')!;
      fmt.deprecated = false;
      fmt.deprecationMessage = undefined;
    });

    it('should return false for isDeprecated on unknown format', () => {
      expect(formatRegistry.isDeprecated('nonexistent')).toBe(false);
    });

    it('should preserve all 8 formats when none are deprecated', () => {
      const active = formatRegistry.getActiveFormats();
      expect(active).toHaveLength(8);
      const deprecated = formatRegistry.getDeprecatedFormats();
      expect(deprecated).toHaveLength(0);
    });
  });

  describe('Property 48: Complete Format Support', () => {
    it('should have all 8 formats registered', () => {
      for (const formatId of ALL_FORMATS) {
        const format = formatRegistry.getFormat(formatId);
        expect(format).not.toBeNull();
        expect(format!.id).toBe(formatId);
      }
    });

    it('should have complete metadata for all formats', () => {
      for (const formatId of ALL_FORMATS) {
        const format = formatRegistry.getFormat(formatId)!;
        expect(format.name).toBeTruthy();
        expect(format.description).toBeTruthy();
        expect(format.icon).toBeTruthy();
        expect(format.durationRange.min).toBeGreaterThan(0);
        expect(format.durationRange.max).toBeGreaterThan(format.durationRange.min);
        expect(['16:9', '9:16', '1:1']).toContain(format.aspectRatio);
        expect(format.applicableGenres.length).toBeGreaterThan(0);
        expect(format.checkpointCount).toBeGreaterThanOrEqual(2);
        expect(format.checkpointCount).toBeLessThanOrEqual(4);
        expect(format.concurrencyLimit).toBeGreaterThanOrEqual(3);
        expect(format.concurrencyLimit).toBeLessThanOrEqual(5);
        expect(format.supportedLanguages).toContain('en');
        expect(format.supportedLanguages).toContain('ar');
      }
    });

    it('should return exactly 8 formats from getAllFormats', () => {
      const all = formatRegistry.getAllFormats();
      expect(all).toHaveLength(8);
    });
  });

  describe('Property 46: Genre Pipeline Invariance', () => {
    it('should confirm pipeline structure is invariant across all genres for each format', () => {
      for (const formatId of ALL_FORMATS) {
        const meta = formatRegistry.getFormat(formatId)!;
        const baseStructure = getFormatPipelineStructure(formatId);

        for (const genre of meta.applicableGenres) {
          const result = validateGenrePipelineInvariance(formatId, genre);
          expect(result.invariant).toBe(true);

          // Structure should be identical regardless of genre
          const structureWithGenre = getFormatPipelineStructure(formatId);
          expect(structureWithGenre).toEqual(baseStructure);
        }
      }
    });

    it('should return non-empty pipeline structure for all formats', () => {
      for (const formatId of ALL_FORMATS) {
        const structure = getFormatPipelineStructure(formatId);
        expect(structure.length).toBeGreaterThan(0);
      }
    });

    it('should have monotonically increasing phase order', () => {
      for (const formatId of ALL_FORMATS) {
        const structure = getFormatPipelineStructure(formatId);
        for (let i = 1; i < structure.length; i++) {
          expect(structure[i]!.order).toBeGreaterThan(structure[i - 1]!.order);
        }
      }
    });

    it('should reject invalid genres', () => {
      const result = validateGenrePipelineInvariance('youtube-narrator', 'InvalidGenre');
      expect(result.invariant).toBe(false);
      expect(result.message).toContain('not applicable');
    });

    it('should reject invalid format', () => {
      const result = validateGenrePipelineInvariance('nonexistent' as VideoFormat, 'Drama');
      expect(result.invariant).toBe(false);
    });

    it('should only affect style params, not structure', () => {
      const baseStructure = getFormatPipelineStructure('movie-animation');

      // Get style params for different genres
      const dramaStyle = getGenreStyleParams('movie-animation', 'Drama');
      const comedyStyle = getGenreStyleParams('movie-animation', 'Comedy');

      // Styles should be different
      expect(dramaStyle.tone).not.toBe(comedyStyle.tone);

      // But structure should be identical
      const structureAfter = getFormatPipelineStructure('movie-animation');
      expect(structureAfter).toEqual(baseStructure);
    });

    it('should return genre style params for all applicable genres', () => {
      for (const formatId of ALL_FORMATS) {
        const meta = formatRegistry.getFormat(formatId)!;
        for (const genre of meta.applicableGenres) {
          const style = getGenreStyleParams(formatId, genre);
          expect(style).toHaveProperty('tone');
          expect(style).toHaveProperty('visualMood');
          expect(style).toHaveProperty('pacing');
        }
      }
    });
  });
});
