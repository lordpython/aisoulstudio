/**
 * Frame Validator Service
 *
 * Validates uploaded frames via checksums and sequence integrity.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../../services/logger.js';
import { FrameChecksum } from '../../types/renderJob.js';

const log = createLogger('FrameValidator');

/**
 * Generate SHA256 checksum for a buffer
 */
export function generateChecksum(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify a frame's checksum
 */
export function verifyFrameChecksum(
  frameData: Buffer,
  expectedChecksum: string
): boolean {
  const actualChecksum = generateChecksum(frameData);
  return actualChecksum === expectedChecksum;
}

/**
 * Validate a batch of frames
 */
export interface FrameValidationResult {
  valid: boolean;
  totalFrames: number;
  validFrames: number;
  invalidFrames: number[];
  mismatches: Array<{
    frameIndex: number;
    expected: string;
    actual: string;
  }>;
}

export function validateFrameBatch(
  frames: Array<{ data: Buffer; index: number }>,
  checksums: Record<number, FrameChecksum>
): FrameValidationResult {
  const result: FrameValidationResult = {
    valid: true,
    totalFrames: frames.length,
    validFrames: 0,
    invalidFrames: [],
    mismatches: [],
  };

  for (const frame of frames) {
    const expectedChecksum = checksums[frame.index];

    if (!expectedChecksum) {
      // No checksum provided - skip validation for this frame
      result.validFrames++;
      continue;
    }

    const actualChecksum = generateChecksum(frame.data);

    if (actualChecksum === expectedChecksum.checksum) {
      result.validFrames++;
    } else {
      result.valid = false;
      result.invalidFrames.push(frame.index);
      result.mismatches.push({
        frameIndex: frame.index,
        expected: expectedChecksum.checksum,
        actual: actualChecksum,
      });
    }
  }

  return result;
}

/**
 * Validate frame sequence integrity (no gaps)
 */
export interface SequenceValidationResult {
  valid: boolean;
  totalExpected: number;
  totalReceived: number;
  missingFrames: number[];
  duplicateFrames: number[];
}

export function validateFrameSequence(
  receivedFrameIndices: number[],
  expectedTotalFrames: number
): SequenceValidationResult {
  const result: SequenceValidationResult = {
    valid: true,
    totalExpected: expectedTotalFrames,
    totalReceived: receivedFrameIndices.length,
    missingFrames: [],
    duplicateFrames: [],
  };

  // Check for duplicates
  const seen = new Set<number>();
  for (const index of receivedFrameIndices) {
    if (seen.has(index)) {
      result.duplicateFrames.push(index);
    }
    seen.add(index);
  }

  // Check for missing frames
  for (let i = 0; i < expectedTotalFrames; i++) {
    if (!seen.has(i)) {
      result.missingFrames.push(i);
    }
  }

  result.valid =
    result.missingFrames.length === 0 &&
    result.duplicateFrames.length === 0;

  return result;
}

/**
 * Validate all frames in a session directory
 */
export async function validateSessionFrames(
  sessionDir: string,
  expectedTotalFrames: number
): Promise<SequenceValidationResult> {
  const framePattern = /^frame(\d{6})\.jpg$/;
  const receivedIndices: number[] = [];

  try {
    const files = await fs.promises.readdir(sessionDir);

    for (const file of files) {
      const match = file.match(framePattern);
      if (match && match[1]) {
        receivedIndices.push(parseInt(match[1], 10));
      }
    }

    const result = validateFrameSequence(receivedIndices, expectedTotalFrames);

    if (!result.valid) {
      log.warn(
        `Session ${path.basename(sessionDir)} frame validation failed: ` +
        `missing=${result.missingFrames.length}, duplicates=${result.duplicateFrames.length}`
      );
    }

    return result;
  } catch (error) {
    log.error(`Failed to validate session frames:`, error);
    return {
      valid: false,
      totalExpected: expectedTotalFrames,
      totalReceived: 0,
      missingFrames: Array.from({ length: expectedTotalFrames }, (_, i) => i),
      duplicateFrames: [],
    };
  }
}

/**
 * Verify minimum frame file sizes (detect corrupt uploads)
 */
export async function validateFrameSizes(
  sessionDir: string,
  minSizeBytes: number = 1000 // 1KB minimum for a valid JPEG
): Promise<{ valid: boolean; undersizedFrames: string[] }> {
  const result = {
    valid: true,
    undersizedFrames: [] as string[],
  };

  try {
    const files = await fs.promises.readdir(sessionDir);
    const framePattern = /^frame\d{6}\.jpg$/;

    for (const file of files) {
      if (!framePattern.test(file)) continue;

      const filePath = path.join(sessionDir, file);
      const stats = await fs.promises.stat(filePath);

      if (stats.size < minSizeBytes) {
        result.valid = false;
        result.undersizedFrames.push(file);
      }
    }

    if (!result.valid) {
      log.warn(
        `Session ${path.basename(sessionDir)} has ${result.undersizedFrames.length} undersized frames`
      );
    }

    return result;
  } catch (error) {
    log.error(`Failed to validate frame sizes:`, error);
    return { valid: false, undersizedFrames: [] };
  }
}
