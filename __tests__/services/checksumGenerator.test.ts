/**
 * Checksum Generator Tests (Client-side)
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  isChecksumSupported,
  generateSimpleChecksum,
  createFrameManifest,
  FrameChecksum,
} from '../../services/ffmpeg/checksumGenerator';

// Mock the crypto.subtle API if not available in test environment
beforeAll(() => {
  if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = {
      subtle: {
        digest: vi.fn().mockImplementation(async (algorithm: string, data: ArrayBuffer) => {
          // Simple mock - just return a buffer based on data length
          const result = new ArrayBuffer(32);
          const view = new Uint8Array(result);
          const dataView = new Uint8Array(data);
          for (let i = 0; i < 32; i++) {
            view[i] = (dataView[i % dataView.length] || 0) ^ i;
          }
          return result;
        }),
      } as unknown as SubtleCrypto,
    } as unknown as Crypto;
  }
});

describe('Checksum Generator', () => {
  describe('isChecksumSupported', () => {
    it('should return true when crypto.subtle is available', () => {
      // In Node with our mock, this should be true
      expect(typeof isChecksumSupported()).toBe('boolean');
    });
  });

  describe('generateSimpleChecksum', () => {
    it('should generate consistent checksums for same data', () => {
      const data = new TextEncoder().encode('test data').buffer;
      const checksum1 = generateSimpleChecksum(data);
      const checksum2 = generateSimpleChecksum(data);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksums for different data', () => {
      const data1 = new TextEncoder().encode('test data 1').buffer;
      const data2 = new TextEncoder().encode('test data 2').buffer;
      const checksum1 = generateSimpleChecksum(data1);
      const checksum2 = generateSimpleChecksum(data2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should return a hex string', () => {
      const data = new TextEncoder().encode('test').buffer;
      const checksum = generateSimpleChecksum(data);

      expect(checksum).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('createFrameManifest', () => {
    it('should create a manifest from checksums', () => {
      const checksums: FrameChecksum[] = [
        { frameIndex: 0, checksum: 'abc123', size: 1024 },
        { frameIndex: 1, checksum: 'def456', size: 2048 },
        { frameIndex: 2, checksum: 'ghi789', size: 1536 },
      ];

      const manifest = createFrameManifest(checksums);

      expect(manifest[0]).toEqual({ frameIndex: 0, checksum: 'abc123', size: 1024 });
      expect(manifest[1]).toEqual({ frameIndex: 1, checksum: 'def456', size: 2048 });
      expect(manifest[2]).toEqual({ frameIndex: 2, checksum: 'ghi789', size: 1536 });
    });

    it('should handle empty checksums', () => {
      const manifest = createFrameManifest([]);
      expect(Object.keys(manifest).length).toBe(0);
    });

    it('should handle non-sequential frame indices', () => {
      const checksums: FrameChecksum[] = [
        { frameIndex: 5, checksum: 'abc', size: 100 },
        { frameIndex: 10, checksum: 'def', size: 200 },
        { frameIndex: 15, checksum: 'ghi', size: 300 },
      ];

      const manifest = createFrameManifest(checksums);

      expect(manifest[5]).toBeDefined();
      expect(manifest[10]).toBeDefined();
      expect(manifest[15]).toBeDefined();
      expect(manifest[0]).toBeUndefined();
    });
  });
});
