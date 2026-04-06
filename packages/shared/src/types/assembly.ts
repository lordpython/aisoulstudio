/**
 * Assembly Types — Timeline clips, chapter markers, CTA markers, assembly rules
 */

import type { VideoFormat } from './pipeline';
import type { TransitionType } from './scene';
import type { BeatMetadata } from './audio';

/**
 * A chapter marker for Documentary format video assembly.
 *
 * Requirements: 5.6, 15.4
 */
export interface ChapterMarker {
  id: string;
  title: string;
  startTime: number; // seconds
  endTime: number;   // seconds
}

/**
 * CTA (Call-to-Action) marker for Advertisement format.
 *
 * Requirements: 4.6, 15.2
 */
export interface CTAMarker {
  text: string;
  /** CTA start position in seconds (should be in final 5 seconds) */
  startTime: number;
  /** CTA duration in seconds */
  duration: number;
}

/**
 * Timeline clip for assembly.
 */
export interface TimelineClip {
  id: string;
  type: 'visual' | 'audio' | 'text' | 'transition';
  startTime: number;
  endTime: number;
  assetUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Format-specific assembly rules applied during video export.
 *
 * Requirements: 15.1
 */
export interface FormatAssemblyRules {
  formatId: VideoFormat;
  /** Aspect ratio override (from format registry) */
  aspectRatio: '16:9' | '9:16' | '1:1';
  /** Default transition between scenes */
  defaultTransition: TransitionType;
  /** Transition duration in seconds */
  transitionDuration: number;
  /** CTA configuration for Advertisement format */
  ctaMarker?: CTAMarker;
  /** Chapter markers for Documentary format */
  chapters?: ChapterMarker[];
  /** Beat metadata for Music Video format */
  beatMetadata?: BeatMetadata;
  /** Whether to organize content by chapters */
  useChapterStructure?: boolean;
  /** Whether to sync visuals to beat timestamps */
  useBeatSync?: boolean;
}
