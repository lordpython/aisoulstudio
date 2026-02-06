/**
 * Job Queue Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RenderJob,
  createRenderJob,
  serializeJob,
  deserializeJob,
} from '../../../server/types/renderJob';

describe('RenderJob', () => {
  describe('createRenderJob', () => {
    it('should create a job with default values', () => {
      const job = createRenderJob('session_123');

      expect(job.sessionId).toBe('session_123');
      expect(job.status).toBe('pending');
      expect(job.jobId).toMatch(/^job_\d+_[a-z0-9]+$/);
      expect(job.config.fps).toBe(24);
      expect(job.config.encoder).toBe('libx264');
      expect(job.retryCount).toBe(0);
      expect(job.maxRetries).toBe(3);
    });

    it('should allow custom config', () => {
      const job = createRenderJob('session_456', {
        fps: 30,
        encoder: 'h264_nvenc',
        quality: 18,
      });

      expect(job.config.fps).toBe(30);
      expect(job.config.encoder).toBe('h264_nvenc');
      expect(job.config.quality).toBe(18);
    });

    it('should initialize frame manifest', () => {
      const job = createRenderJob('session_789');

      expect(job.frameManifest.totalFrames).toBe(0);
      expect(job.frameManifest.receivedFrames).toBe(0);
      expect(job.frameManifest.validated).toBe(false);
      expect(job.frameManifest.missingFrames).toEqual([]);
    });
  });

  describe('serializeJob/deserializeJob', () => {
    it('should serialize and deserialize a job', () => {
      const original = createRenderJob('session_test', { fps: 60 });
      original.frameManifest.checksums[0] = {
        frameIndex: 0,
        checksum: 'abc123',
        size: 1024,
      };
      original.frameManifest.checksums[1] = {
        frameIndex: 1,
        checksum: 'def456',
        size: 2048,
      };

      const serialized = serializeJob(original);
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json);
      const restored = deserializeJob(parsed);

      expect(restored.sessionId).toBe(original.sessionId);
      expect(restored.jobId).toBe(original.jobId);
      expect(restored.config.fps).toBe(60);
      expect(restored.frameManifest.checksums[0]).toEqual({
        frameIndex: 0,
        checksum: 'abc123',
        size: 1024,
      });
    });
  });

  describe('job state machine', () => {
    it('should have correct initial status', () => {
      const job = createRenderJob('session_1');
      expect(job.status).toBe('pending');
    });

    it('should have all required fields', () => {
      const job = createRenderJob('session_2');

      expect(job).toHaveProperty('jobId');
      expect(job).toHaveProperty('sessionId');
      expect(job).toHaveProperty('status');
      expect(job).toHaveProperty('config');
      expect(job).toHaveProperty('frameManifest');
      expect(job).toHaveProperty('progress');
      expect(job).toHaveProperty('currentFrame');
      expect(job).toHaveProperty('createdAt');
      expect(job).toHaveProperty('retryCount');
      expect(job).toHaveProperty('maxRetries');
    });
  });
});

describe('TimeoutManager', () => {
  // These tests would require more setup with actual timeouts
  it('should have configuration constants', async () => {
    // Dynamic import to avoid initialization issues
    const { timeoutManager } = await import(
      '../../../server/services/jobQueue/timeoutManager'
    );

    const config = timeoutManager.getConfig();
    expect(config.heartbeatIntervalMs).toBe(5000);
    expect(config.stallTimeoutMs).toBe(60000);
    expect(config.maxJobTimeMs).toBe(30 * 60 * 1000);
  });
});
