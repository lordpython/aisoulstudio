/**
 * Quality Verifier Service
 *
 * Post-encode validation to ensure output meets quality standards.
 * Verifies duration, resolution, audio presence, and file integrity.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { createLogger } from '../../../services/logger.js';

const log = createLogger('QualityVerifier');

export interface VideoMetadata {
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  audioCodec?: string;
  videoCodec: string;
  bitrate: number; // kbps
  fileSize: number; // bytes
}

export interface QualityReport {
  valid: boolean;
  metadata: VideoMetadata | null;
  errors: string[];
  warnings: string[];
}

/**
 * Get video metadata using ffprobe
 */
export function getVideoMetadata(filePath: string): VideoMetadata | null {
  try {
    // Get format info
    const formatInfo = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { encoding: 'utf-8' }
    );

    const info = JSON.parse(formatInfo);

    // Find video stream
    const videoStream = info.streams?.find(
      (s: any) => s.codec_type === 'video'
    );
    const audioStream = info.streams?.find(
      (s: any) => s.codec_type === 'audio'
    );

    if (!videoStream) {
      log.error('No video stream found in output');
      return null;
    }

    // Parse frame rate (can be "30/1" or "29.97")
    let fps = 30;
    if (videoStream.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2) {
        fps = parseInt(parts[0]) / parseInt(parts[1]);
      } else {
        fps = parseFloat(videoStream.r_frame_rate);
      }
    }

    const stats = fs.statSync(filePath);

    return {
      duration: parseFloat(info.format?.duration || '0'),
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      fps: Math.round(fps * 100) / 100,
      hasAudio: !!audioStream,
      audioCodec: audioStream?.codec_name,
      videoCodec: videoStream.codec_name || 'unknown',
      bitrate: Math.round(parseInt(info.format?.bit_rate || '0') / 1000),
      fileSize: stats.size,
    };
  } catch (error) {
    log.error('Failed to get video metadata:', error);
    return null;
  }
}

/**
 * Verify output quality against expectations
 */
export function verifyOutputQuality(
  outputPath: string,
  expectations: {
    expectedDurationSeconds: number;
    expectedFps: number;
    minWidth?: number;
    minHeight?: number;
    requireAudio?: boolean;
  }
): QualityReport {
  const report: QualityReport = {
    valid: true,
    metadata: null,
    errors: [],
    warnings: [],
  };

  // Check file exists
  if (!fs.existsSync(outputPath)) {
    report.valid = false;
    report.errors.push('Output file does not exist');
    return report;
  }

  // Get metadata
  const metadata = getVideoMetadata(outputPath);
  if (!metadata) {
    report.valid = false;
    report.errors.push('Failed to read video metadata');
    return report;
  }

  report.metadata = metadata;

  // Validate duration (within 1 second tolerance)
  const durationDiff = Math.abs(
    metadata.duration - expectations.expectedDurationSeconds
  );
  if (durationDiff > 1) {
    report.valid = false;
    report.errors.push(
      `Duration mismatch: expected ${expectations.expectedDurationSeconds}s, got ${metadata.duration}s`
    );
  } else if (durationDiff > 0.5) {
    report.warnings.push(
      `Duration slightly off: expected ${expectations.expectedDurationSeconds}s, got ${metadata.duration}s`
    );
  }

  // Validate FPS (within 10% tolerance)
  const fpsDiff = Math.abs(metadata.fps - expectations.expectedFps);
  const fpsTolerance = expectations.expectedFps * 0.1;
  if (fpsDiff > fpsTolerance) {
    report.valid = false;
    report.errors.push(
      `FPS mismatch: expected ${expectations.expectedFps}, got ${metadata.fps}`
    );
  }

  // Validate resolution
  if (expectations.minWidth && metadata.width < expectations.minWidth) {
    report.valid = false;
    report.errors.push(
      `Width too small: expected at least ${expectations.minWidth}, got ${metadata.width}`
    );
  }
  if (expectations.minHeight && metadata.height < expectations.minHeight) {
    report.valid = false;
    report.errors.push(
      `Height too small: expected at least ${expectations.minHeight}, got ${metadata.height}`
    );
  }

  // Validate audio presence
  if (expectations.requireAudio && !metadata.hasAudio) {
    report.valid = false;
    report.errors.push('Audio track missing');
  }

  // Check for suspiciously small file
  const expectedBitrate = 8000; // 8 Mbps approximate
  const expectedSize =
    (expectedBitrate * 1000 * expectations.expectedDurationSeconds) / 8;
  if (metadata.fileSize < expectedSize * 0.1) {
    report.warnings.push(
      `File size unexpectedly small: ${(metadata.fileSize / 1024 / 1024).toFixed(2)}MB`
    );
  }

  // Log result
  if (report.valid) {
    log.info(
      `Output verified: ${metadata.width}x${metadata.height} @ ${metadata.fps}fps, ` +
      `${metadata.duration.toFixed(1)}s, ${(metadata.fileSize / 1024 / 1024).toFixed(2)}MB`
    );
  } else {
    log.error(`Output validation failed:`, report.errors);
  }

  return report;
}

/**
 * Verify video file integrity (can be fully decoded)
 */
export async function verifyFileIntegrity(
  filePath: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Use ffmpeg to decode the file to null (verifies it can be fully read)
    execSync(
      `ffmpeg -v error -i "${filePath}" -f null -`,
      { encoding: 'utf-8', timeout: 60000 }
    );
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('File integrity check failed:', message);
    return { valid: false, error: message };
  }
}

/**
 * Quick validation (just metadata, no full decode)
 */
export function quickValidate(
  outputPath: string,
  expectedDurationSeconds: number
): boolean {
  const metadata = getVideoMetadata(outputPath);
  if (!metadata) return false;

  const durationDiff = Math.abs(metadata.duration - expectedDurationSeconds);
  return durationDiff <= 1 && metadata.width > 0 && metadata.height > 0;
}
