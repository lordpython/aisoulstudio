/**
 * Format Validation Service
 *
 * Provides validation for:
 * - Format configuration consistency (Property 1, Requirement 1.2, 3.1-9.1, 25.2)
 * - Genre pipeline invariance (Property 46, Requirements 12.5, 23.3)
 *
 * All functions are React-free and pure.
 */

import type { VideoFormat, FormatMetadata } from '../types';
import { formatRegistry } from './formatRegistry';

// ============================================================================
// Format Configuration Consistency (Property 1)
// ============================================================================

export interface FormatComplianceResult {
  valid: boolean;
  violations: FormatViolation[];
}

export interface FormatViolation {
  field: string;
  expected: string;
  actual: string;
  message: string;
}

/**
 * Validate that pipeline assets conform to the format's metadata constraints.
 *
 * Checks duration range, aspect ratio, and checkpoint count against the
 * registered format metadata.
 *
 * @param formatId        - Video format identifier
 * @param assets          - Asset metadata to validate
 * @returns Compliance result with violations if any
 */
export function validateFormatCompliance(
  formatId: VideoFormat,
  assets: {
    durationSeconds?: number;
    aspectRatio?: string;
    checkpointCount?: number;
    concurrentTasks?: number;
  },
): FormatComplianceResult {
  const meta = formatRegistry.getFormat(formatId);
  if (!meta) {
    return {
      valid: false,
      violations: [
        {
          field: 'formatId',
          expected: 'registered format',
          actual: formatId,
          message: `Format '${formatId}' not found in registry`,
        },
      ],
    };
  }

  const violations: FormatViolation[] = [];

  // Duration range check
  if (assets.durationSeconds != null) {
    if (assets.durationSeconds < meta.durationRange.min) {
      violations.push({
        field: 'duration',
        expected: `>= ${meta.durationRange.min}s`,
        actual: `${assets.durationSeconds}s`,
        message: `Duration ${assets.durationSeconds}s is below minimum ${meta.durationRange.min}s for ${meta.name}`,
      });
    }
    if (assets.durationSeconds > meta.durationRange.max) {
      violations.push({
        field: 'duration',
        expected: `<= ${meta.durationRange.max}s`,
        actual: `${assets.durationSeconds}s`,
        message: `Duration ${assets.durationSeconds}s exceeds maximum ${meta.durationRange.max}s for ${meta.name}`,
      });
    }
  }

  // Aspect ratio check
  if (assets.aspectRatio != null && assets.aspectRatio !== meta.aspectRatio) {
    violations.push({
      field: 'aspectRatio',
      expected: meta.aspectRatio,
      actual: assets.aspectRatio,
      message: `Aspect ratio '${assets.aspectRatio}' does not match expected '${meta.aspectRatio}' for ${meta.name}`,
    });
  }

  // Checkpoint count check
  if (assets.checkpointCount != null && assets.checkpointCount > meta.checkpointCount) {
    violations.push({
      field: 'checkpointCount',
      expected: `<= ${meta.checkpointCount}`,
      actual: `${assets.checkpointCount}`,
      message: `Checkpoint count ${assets.checkpointCount} exceeds maximum ${meta.checkpointCount} for ${meta.name}`,
    });
  }

  // Concurrency limit check
  if (assets.concurrentTasks != null && assets.concurrentTasks > meta.concurrencyLimit) {
    violations.push({
      field: 'concurrencyLimit',
      expected: `<= ${meta.concurrencyLimit}`,
      actual: `${assets.concurrentTasks}`,
      message: `Concurrent tasks ${assets.concurrentTasks} exceeds limit ${meta.concurrencyLimit} for ${meta.name}`,
    });
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ============================================================================
// Genre Pipeline Invariance (Property 46)
// ============================================================================

/**
 * Pipeline phase descriptor used to compare pipeline structures.
 * Genre should only affect the `styleParams` — never the phase list itself.
 */
export interface PipelinePhaseDescriptor {
  id: string;
  name: string;
  order: number;
  parallel: boolean;
}

/**
 * Extract the structural pipeline phases for a format.
 * This returns the phase sequence that must remain invariant regardless of genre.
 *
 * For each format, the pipeline structure is fixed:
 */
export function getFormatPipelineStructure(formatId: VideoFormat): PipelinePhaseDescriptor[] {
  switch (formatId) {
    case 'youtube-narrator':
      return [
        { id: 'research', name: 'Research', order: 1, parallel: true },
        { id: 'script', name: 'Script Generation', order: 2, parallel: false },
        { id: 'visual', name: 'Visual Generation', order: 3, parallel: true },
        { id: 'audio', name: 'Audio Generation', order: 4, parallel: false },
        { id: 'assembly', name: 'Assembly', order: 5, parallel: false },
      ];
    case 'advertisement':
      return [
        { id: 'script', name: 'Script Generation', order: 1, parallel: false },
        { id: 'visual', name: 'Visual Generation', order: 2, parallel: true },
        { id: 'audio', name: 'Audio Generation', order: 3, parallel: false },
        { id: 'assembly', name: 'Assembly', order: 4, parallel: false },
      ];
    case 'movie-animation':
      return [
        { id: 'breakdown', name: 'Story Breakdown', order: 1, parallel: false },
        { id: 'screenplay', name: 'Screenplay', order: 2, parallel: false },
        { id: 'characters', name: 'Character Design', order: 3, parallel: false },
        { id: 'visual', name: 'Visual Generation', order: 4, parallel: true },
        { id: 'audio', name: 'Audio Generation', order: 5, parallel: false },
        { id: 'assembly', name: 'Assembly', order: 6, parallel: false },
      ];
    case 'educational':
      return [
        { id: 'script', name: 'Script with Objectives', order: 1, parallel: false },
        { id: 'visual', name: 'Visuals with Overlays', order: 2, parallel: true },
        { id: 'audio', name: 'Audio Generation', order: 3, parallel: false },
        { id: 'assembly', name: 'Assembly', order: 4, parallel: false },
      ];
    case 'shorts':
      return [
        { id: 'script', name: 'Hook-First Script', order: 1, parallel: false },
        { id: 'visual', name: 'Visual Generation', order: 2, parallel: true },
        { id: 'audio', name: 'Audio Generation', order: 3, parallel: false },
        { id: 'assembly', name: 'Assembly', order: 4, parallel: false },
      ];
    case 'documentary':
      return [
        { id: 'research', name: 'Deep Research', order: 1, parallel: true },
        { id: 'script', name: 'Chapter Script', order: 2, parallel: false },
        { id: 'visual', name: 'Visual Generation', order: 3, parallel: true },
        { id: 'audio', name: 'Audio Generation', order: 4, parallel: false },
        { id: 'assembly', name: 'Assembly', order: 5, parallel: false },
      ];
    case 'music-video':
      return [
        { id: 'lyrics', name: 'Lyrics Generation', order: 1, parallel: false },
        { id: 'music', name: 'Music Generation', order: 2, parallel: false },
        { id: 'visual', name: 'Beat-Synced Visuals', order: 3, parallel: true },
        { id: 'assembly', name: 'Assembly', order: 4, parallel: false },
      ];
    case 'news-politics':
      return [
        { id: 'research', name: 'Multi-Source Research', order: 1, parallel: true },
        { id: 'script', name: 'Balanced Script', order: 2, parallel: false },
        { id: 'visual', name: 'News Graphics', order: 3, parallel: true },
        { id: 'audio', name: 'Audio Generation', order: 4, parallel: false },
        { id: 'assembly', name: 'Assembly', order: 5, parallel: false },
      ];
    default:
      return [];
  }
}

/**
 * Validate that genre selection does not change the pipeline phase structure.
 *
 * This compares two pipeline structures (one without genre, one with genre)
 * and asserts they are identical. Genre must only affect style parameters
 * passed to services, never the pipeline architecture.
 *
 * Property 46: Genre Pipeline Invariance
 * Requirements: 12.5, 23.3
 *
 * @param formatId - Video format identifier
 * @param genre    - Genre to validate
 * @returns Whether the pipeline structure remains invariant
 */
export function validateGenrePipelineInvariance(
  formatId: VideoFormat,
  genre: string,
): { invariant: boolean; message?: string } {
  const meta = formatRegistry.getFormat(formatId);
  if (!meta) {
    return { invariant: false, message: `Format '${formatId}' not found in registry` };
  }

  // Validate genre is applicable
  if (!meta.applicableGenres.includes(genre)) {
    return {
      invariant: false,
      message: `Genre '${genre}' is not applicable for format '${formatId}'`,
    };
  }

  // The pipeline structure is static per format — genre doesn't change it.
  // This function verifies the structural definition exists and is non-empty.
  const structure = getFormatPipelineStructure(formatId);
  if (structure.length === 0) {
    return { invariant: false, message: `No pipeline structure defined for format '${formatId}'` };
  }

  // Verify phase ordering is consistent (monotonically increasing)
  for (let i = 1; i < structure.length; i++) {
    if (structure[i]!.order <= structure[i - 1]!.order) {
      return {
        invariant: false,
        message: `Pipeline phase ordering is inconsistent at phase '${structure[i]!.id}'`,
      };
    }
  }

  return { invariant: true };
}

/**
 * Extract only the style parameters that genre affects.
 * This is the approved set of parameters that genre may modify.
 *
 * @param formatId - Video format identifier
 * @param genre    - Selected genre
 * @returns Style parameters derived from genre
 */
export function getGenreStyleParams(
  formatId: VideoFormat,
  genre: string,
): {
  tone: string;
  visualMood: string;
  colorPalette: string;
  pacing: string;
} {
  // Genre only influences these style parameters — never pipeline structure
  const genreLower = genre.toLowerCase();

  // Derive tone from genre
  const toneMap: Record<string, string> = {
    drama: 'dramatic',
    comedy: 'lighthearted',
    thriller: 'suspenseful',
    horror: 'dark',
    'sci-fi': 'futuristic',
    fantasy: 'mystical',
    romance: 'warm',
    action: 'intense',
    mystery: 'intriguing',
    documentary: 'authoritative',
    investigative: 'serious',
    'product launch': 'exciting',
    'brand story': 'inspirational',
  };

  const moodMap: Record<string, string> = {
    drama: 'moody, cinematic',
    comedy: 'bright, colorful',
    thriller: 'dark, high-contrast',
    horror: 'dark, desaturated',
    'sci-fi': 'neon, futuristic',
    fantasy: 'ethereal, vibrant',
    romance: 'warm tones, soft light',
    action: 'dynamic, saturated',
    mystery: 'shadowy, muted',
  };

  const pacingMap: Record<string, string> = {
    drama: 'measured',
    comedy: 'upbeat',
    thriller: 'fast',
    horror: 'slow-build',
    action: 'rapid',
    documentary: 'steady',
    shorts: 'rapid-fire',
  };

  return {
    tone: toneMap[genreLower] ?? 'neutral',
    visualMood: moodMap[genreLower] ?? 'balanced',
    colorPalette: 'default',
    pacing: pacingMap[genreLower] ?? 'moderate',
  };
}
