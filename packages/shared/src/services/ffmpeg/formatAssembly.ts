/**
 * Format-Specific Assembly Helpers
 *
 * Pure functions for building format-aware assembly configurations.
 * Used by the export pipeline to apply format-specific rules.
 *
 * Requirements: 4.6, 5.6, 8.6, 15.1–15.5
 */

import type {
  VideoFormat,
  FormatAssemblyRules,
  CTAMarker,
  ChapterMarker,
  BeatEvent,
  BeatMetadata,
  TransitionType,
  ScreenplayScene,
  TimelineClip,
} from '../../types';
import { formatRegistry } from '../formatRegistry';

// ============================================================================
// Assembly Rule Builder (Task 10.1)
// ============================================================================

/**
 * Build format-specific assembly rules from format metadata.
 * Returns a rules object that the export pipeline can apply.
 *
 * Requirements: 15.1
 *
 * @param formatId - Video format identifier
 * @param options  - Optional overrides (CTA text, chapter scenes, beat data)
 */
export function buildAssemblyRules(
  formatId: VideoFormat,
  options: {
    totalDuration?: number;
    ctaText?: string;
    scenes?: ScreenplayScene[];
    sceneDurations?: number[];
    beatMetadata?: BeatMetadata;
  } = {}
): FormatAssemblyRules {
  const meta = formatRegistry.getFormat(formatId);
  const aspectRatio = meta?.aspectRatio ?? '16:9';

  const base: FormatAssemblyRules = {
    formatId,
    aspectRatio,
    defaultTransition: getDefaultTransition(formatId),
    transitionDuration: getDefaultTransitionDuration(formatId),
  };

  // Advertisement: CTA emphasis (Task 10.2)
  if (formatId === 'advertisement' && options.totalDuration) {
    base.ctaMarker = buildCTAMarker(
      options.ctaText ?? 'Learn More',
      options.totalDuration
    );
  }

  // Documentary: chapter organization (Task 10.4)
  if (formatId === 'documentary' && options.scenes && options.sceneDurations) {
    base.chapters = buildChapterMarkers(options.scenes, options.sceneDurations);
    base.useChapterStructure = true;
  }

  // Music Video: beat synchronization (Task 10.6)
  if (formatId === 'music-video' && options.beatMetadata) {
    base.beatMetadata = options.beatMetadata;
    base.useBeatSync = true;
  }

  return base;
}

// ============================================================================
// Default Transition Helpers
// ============================================================================

/**
 * Get the default transition type for a format.
 */
function getDefaultTransition(formatId: VideoFormat): TransitionType {
  switch (formatId) {
    case 'advertisement':
    case 'shorts':
      return 'none'; // Hard cuts for fast-paced content
    case 'documentary':
    case 'youtube-narrator':
      return 'dissolve'; // Smooth transitions for long-form
    case 'music-video':
      return 'fade'; // Beat-synced fades
    case 'news-politics':
      return 'slide'; // Professional slide transitions
    default:
      return 'dissolve';
  }
}

/**
 * Get the default transition duration in seconds for a format.
 */
function getDefaultTransitionDuration(formatId: VideoFormat): number {
  switch (formatId) {
    case 'advertisement':
    case 'shorts':
      return 0.3;
    case 'documentary':
      return 1.5;
    case 'music-video':
      return 0.5;
    default:
      return 1.0;
  }
}

// ============================================================================
// CTA Emphasis (Task 10.2) — Requirements: 4.6, 15.2
// ============================================================================

/**
 * Build a CTA marker that positions the call-to-action in the final 5 seconds.
 *
 * Requirements: 4.6, 15.2
 *
 * @param ctaText       - CTA text content
 * @param totalDuration - Total video duration in seconds
 * @param ctaDuration   - CTA display duration in seconds (default: 5)
 * @returns CTAMarker positioned at the end of the video
 */
export function buildCTAMarker(
  ctaText: string,
  totalDuration: number,
  ctaDuration: number = 5
): CTAMarker {
  // Clamp CTA duration to available time
  const effectiveDuration = Math.min(ctaDuration, totalDuration);
  const startTime = Math.max(0, totalDuration - effectiveDuration);

  return {
    text: ctaText,
    startTime,
    duration: effectiveDuration,
  };
}

/**
 * Validate that a CTA marker is correctly positioned in the final 5 seconds.
 *
 * @param marker        - CTA marker to validate
 * @param totalDuration - Total video duration in seconds
 * @returns Whether the CTA is within the final 5 seconds
 */
export function validateCTAPosition(
  marker: CTAMarker,
  totalDuration: number
): boolean {
  const ctaEnd = marker.startTime + marker.duration;
  const finalFiveStart = Math.max(0, totalDuration - 5);

  return (
    marker.startTime >= finalFiveStart &&
    ctaEnd <= totalDuration + 0.001 // small tolerance for float precision
  );
}

// ============================================================================
// Chapter Organization (Task 10.4) — Requirements: 5.6, 15.4
// ============================================================================

/**
 * Build chapter markers from screenplay scenes and their durations.
 *
 * Requirements: 5.6, 15.4
 *
 * @param scenes         - Screenplay scenes (each becomes a chapter)
 * @param sceneDurations - Duration of each scene in seconds (must match scenes length)
 * @returns Array of ChapterMarker objects with correct time positions
 */
export function buildChapterMarkers(
  scenes: ScreenplayScene[],
  sceneDurations: number[]
): ChapterMarker[] {
  const chapters: ChapterMarker[] = [];
  let currentTime = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const duration = sceneDurations[i] ?? 0;

    if (scene && duration > 0) {
      chapters.push({
        id: `chapter_${i}`,
        title: scene.heading || `Chapter ${i + 1}`,
        startTime: currentTime,
        endTime: currentTime + duration,
      });
    }

    currentTime += duration;
  }

  return chapters;
}

/**
 * Validate that chapters are contiguous and non-overlapping.
 *
 * @param chapters - Chapter markers to validate
 * @returns Whether chapters form a valid sequence
 */
export function validateChapterSequence(chapters: ChapterMarker[]): boolean {
  if (chapters.length === 0) return true;

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]!;
    // Each chapter must have positive duration
    if (chapter.endTime <= chapter.startTime) return false;

    // Chapters must not overlap (allow small tolerance for float precision)
    if (i > 0) {
      const prev = chapters[i - 1]!;
      if (chapter.startTime < prev.endTime - 0.001) return false;
    }
  }

  return true;
}

// ============================================================================
// Beat Synchronization (Task 10.6) — Requirements: 8.6, 15.3
// ============================================================================

/**
 * Generate evenly-spaced beat metadata from BPM and duration.
 * Used when no real beat detection is available.
 *
 * @param bpm             - Beats per minute
 * @param durationSeconds - Total track duration in seconds
 * @returns BeatMetadata with generated beat events
 */
export function generateBeatMetadata(
  bpm: number,
  durationSeconds: number
): BeatMetadata {
  const beatInterval = 60 / bpm; // seconds between beats
  const beats: BeatEvent[] = [];
  let time = 0;
  let beatIndex = 0;

  while (time < durationSeconds) {
    beats.push({
      timestamp: Math.round(time * 1000) / 1000, // round to ms precision
      intensity: beatIndex % 4 === 0 ? 1.0 : beatIndex % 2 === 0 ? 0.6 : 0.3,
    });
    time += beatInterval;
    beatIndex++;
  }

  return { bpm, durationSeconds, beats };
}

/**
 * Find the nearest beat event to a given timestamp.
 * Returns the beat and the offset (in ms) from the target time.
 *
 * Requirements: 8.6 (100ms tolerance)
 *
 * @param beats     - Array of beat events
 * @param timestamp - Target timestamp in seconds
 * @returns { beat, offsetMs } or null if no beats exist
 */
export function findNearestBeat(
  beats: BeatEvent[],
  timestamp: number
): { beat: BeatEvent; offsetMs: number } | null {
  if (beats.length === 0) return null;

  let closest = beats[0]!;
  let minOffset = Math.abs(timestamp - closest.timestamp) * 1000;

  for (let i = 1; i < beats.length; i++) {
    const beat = beats[i]!;
    const offset = Math.abs(timestamp - beat.timestamp) * 1000;
    if (offset < minOffset) {
      closest = beat;
      minOffset = offset;
    }
  }

  return { beat: closest, offsetMs: minOffset };
}

/**
 * Snap a timestamp to the nearest beat within a tolerance (default 100ms).
 * If no beat is close enough, returns the original timestamp.
 *
 * Requirements: 8.6, 15.3 (100ms tolerance)
 *
 * @param beats       - Array of beat events
 * @param timestamp   - Target timestamp in seconds
 * @param toleranceMs - Maximum offset in ms to snap (default: 100)
 * @returns Snapped timestamp in seconds
 */
export function snapToBeat(
  beats: BeatEvent[],
  timestamp: number,
  toleranceMs: number = 100
): number {
  const nearest = findNearestBeat(beats, timestamp);
  if (!nearest) return timestamp;

  return nearest.offsetMs <= toleranceMs ? nearest.beat.timestamp : timestamp;
}

/**
 * Align visual transition timestamps to beat positions.
 * Returns new timestamps for each transition, snapped to the nearest beat.
 *
 * Requirements: 8.6, 15.3
 *
 * @param transitionTimes - Original transition timestamps in seconds
 * @param beats           - Beat events to sync to
 * @param toleranceMs     - Maximum snap tolerance in ms (default: 100)
 * @returns Array of aligned timestamps in seconds
 */
export function alignTransitionsToBeat(
  transitionTimes: number[],
  beats: BeatEvent[],
  toleranceMs: number = 100
): number[] {
  return transitionTimes.map(t => snapToBeat(beats, t, toleranceMs));
}

// ============================================================================
// Graceful Degradation (Task 10.7) — Requirements: 15.5
// ============================================================================

/**
 * Result of attempting to assemble a video with potentially missing assets.
 */
export interface AssemblyResult {
  /** Whether the assembly produced a usable output */
  success: boolean;
  /** Whether some assets were missing (partial output) */
  partial: boolean;
  /** Timeline clips that were successfully assembled */
  assembledClips: TimelineClip[];
  /** IDs of assets that were missing or failed to load */
  missingAssets: string[];
  /** Human-readable error messages for each failure */
  errors: string[];
}

/**
 * Assemble a timeline from clips, gracefully handling missing assets.
 * Missing assets are skipped; the timeline is built from available clips only.
 *
 * Requirements: 15.5
 *
 * @param clips          - All expected timeline clips
 * @param availableAssets - Set of asset IDs that are available
 * @returns AssemblyResult with partial output if some assets are missing
 */
export function assembleWithGracefulDegradation(
  clips: TimelineClip[],
  availableAssets: Set<string>
): AssemblyResult {
  const assembledClips: TimelineClip[] = [];
  const missingAssets: string[] = [];
  const errors: string[] = [];

  for (const clip of clips) {
    // Clips without asset URLs (e.g., transitions, text overlays) always succeed
    if (!clip.assetUrl) {
      assembledClips.push(clip);
      continue;
    }

    if (availableAssets.has(clip.id)) {
      assembledClips.push(clip);
    } else {
      missingAssets.push(clip.id);
      errors.push(`Missing asset for clip "${clip.id}" (${clip.type}, ${clip.startTime}s–${clip.endTime}s)`);
    }
  }

  return {
    success: assembledClips.length > 0,
    partial: missingAssets.length > 0 && assembledClips.length > 0,
    assembledClips,
    missingAssets,
    errors,
  };
}
