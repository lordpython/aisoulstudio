/**
 * Pipeline Types — Video formats, pipeline phases, checkpoints
 */

import type { TransitionType } from './scene';

/**
 * Video format types for the multi-format pipeline
 */
export type VideoFormat =
  | 'youtube-narrator'
  | 'advertisement'
  | 'movie-animation'
  | 'educational'
  | 'shorts'
  | 'documentary'
  | 'music-video'
  | 'news-politics';

/**
 * Format metadata for pipeline configuration
 */
export interface FormatMetadata {
  id: VideoFormat;
  name: string;
  description: string;
  icon: string;
  durationRange: { min: number; max: number }; // seconds
  aspectRatio: '16:9' | '9:16' | '1:1';
  applicableGenres: string[];
  checkpointCount: number;
  concurrencyLimit: number;
  requiresResearch: boolean;
  supportedLanguages: ('ar' | 'en')[];
  deprecated?: boolean;
  deprecationMessage?: string;
}

/**
 * Pipeline phase configuration
 */
export interface PipelinePhase {
  id: string;
  name: string;
  order: number;
  tasks: PhaseTask[];
  parallel: boolean;
  required: boolean;
}

/**
 * Individual task within a pipeline phase
 */
export interface PhaseTask {
  id: string;
  type: 'research' | 'script' | 'visual' | 'audio' | 'assembly';
  service: string;
  parameters: Record<string, unknown>; // Fixed from Record<string, any>
  dependencies: string[]; // task IDs that must complete first
  retryable: boolean;
  timeout: number; // milliseconds
}

/**
 * Format-specific pipeline configuration
 */
export interface FormatPipelineConfig {
  formatId: VideoFormat;
  phases: PipelinePhase[];
  checkpoints: CheckpointConfig[];
  concurrencyLimit: number;
  defaultDuration: number; // seconds
}

/**
 * Checkpoint configuration for user approval
 */
export interface CheckpointConfig {
  id: string;
  phase: string;
  title: string;
  description: string;
  timeout: number; // milliseconds
  required: boolean;
}

/**
 * Checkpoint state during execution
 */
export interface CheckpointState {
  checkpointId: string;
  phase: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedAt?: Date;
  /** Arbitrary preview data attached by the pipeline at checkpoint creation */
  data?: Record<string, unknown>;
}
