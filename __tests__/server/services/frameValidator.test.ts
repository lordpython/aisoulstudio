/**
 * Frame Validator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateChecksum,
  verifyFrameChecksum,
  validateFrameSequence,
} from '../../../packages/server/services/validation/frameValidator';

describe('Frame Validator', () => {
  describe('generateChecksum', () => {
    it('should generate consistent checksums for same data', () => {
      const data = Buffer.from('test data');
      const checksum1 = generateChecksum(data);
      const checksum2 = generateChecksum(data);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksums for different data', () => {
      const data1 = Buffer.from('test data 1');
      const data2 = Buffer.from('test data 2');
      const checksum1 = generateChecksum(data1);
      const checksum2 = generateChecksum(data2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should generate a 64-character hex string (SHA-256)', () => {
      const data = Buffer.from('test');
      const checksum = generateChecksum(data);

      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('verifyFrameChecksum', () => {
    it('should return true for matching checksums', () => {
      const data = Buffer.from('frame data');
      const checksum = generateChecksum(data);
      const isValid = verifyFrameChecksum(data, checksum);

      expect(isValid).toBe(true);
    });

    it('should return false for non-matching checksums', () => {
      const data = Buffer.from('frame data');
      const wrongChecksum = 'invalid_checksum';
      const isValid = verifyFrameChecksum(data, wrongChecksum);

      expect(isValid).toBe(false);
    });
  });

  describe('validateFrameSequence', () => {
    it('should validate a complete sequence', () => {
      const indices = [0, 1, 2, 3, 4];
      const result = validateFrameSequence(indices, 5);

      expect(result.valid).toBe(true);
      expect(result.missingFrames).toEqual([]);
      expect(result.duplicateFrames).toEqual([]);
    });

    it('should detect missing frames', () => {
      const indices = [0, 1, 3, 4]; // Missing frame 2
      const result = validateFrameSequence(indices, 5);

      expect(result.valid).toBe(false);
      expect(result.missingFrames).toContain(2);
      expect(result.totalExpected).toBe(5);
      expect(result.totalReceived).toBe(4);
    });

    it('should detect duplicate frames', () => {
      const indices = [0, 1, 1, 2, 3, 4]; // Duplicate frame 1
      const result = validateFrameSequence(indices, 5);

      expect(result.valid).toBe(false);
      expect(result.duplicateFrames).toContain(1);
    });

    it('should detect both missing and duplicate frames', () => {
      const indices = [0, 1, 1, 3, 4]; // Missing 2, duplicate 1
      const result = validateFrameSequence(indices, 5);

      expect(result.valid).toBe(false);
      expect(result.missingFrames).toContain(2);
      expect(result.duplicateFrames).toContain(1);
    });

    it('should handle empty sequence', () => {
      const indices: number[] = [];
      const result = validateFrameSequence(indices, 5);

      expect(result.valid).toBe(false);
      expect(result.missingFrames.length).toBe(5);
      expect(result.totalReceived).toBe(0);
    });

    it('should handle out-of-order indices', () => {
      const indices = [4, 2, 0, 3, 1]; // Out of order but complete
      const result = validateFrameSequence(indices, 5);

      expect(result.valid).toBe(true);
      expect(result.missingFrames).toEqual([]);
    });
  });
});
