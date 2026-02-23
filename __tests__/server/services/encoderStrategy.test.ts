/**
 * Encoder Strategy Tests
 */

import { describe, it, expect } from 'vitest';
import {
  ENCODING_SPEC,
  getEncoderArgs,
} from '../../../packages/server/services/encoding/encoderStrategy';

describe('Encoder Strategy', () => {
  describe('ENCODING_SPEC', () => {
    it('should have standardized color space settings', () => {
      expect(ENCODING_SPEC.colorSpace).toBe('bt709');
      expect(ENCODING_SPEC.colorPrimaries).toBe('bt709');
      expect(ENCODING_SPEC.colorTrc).toBe('bt709');
      expect(ENCODING_SPEC.pixelFormat).toBe('yuv420p');
    });

    it('should have quality settings for all encoders', () => {
      expect(ENCODING_SPEC.quality.nvenc).toBeDefined();
      expect(ENCODING_SPEC.quality.qsv).toBeDefined();
      expect(ENCODING_SPEC.quality.amf).toBeDefined();
      expect(ENCODING_SPEC.quality.libx264).toBeDefined();
    });

    it('should use consistent quality values', () => {
      expect(ENCODING_SPEC.quality.nvenc.cq).toBe(21);
      expect(ENCODING_SPEC.quality.libx264.crf).toBe(21);
    });
  });

  describe('getEncoderArgs', () => {
    it('should return correct args for libx264', () => {
      const args = getEncoderArgs('libx264');

      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
      expect(args).toContain('-preset');
      expect(args).toContain('fast');
      expect(args).toContain('-crf');
      expect(args).toContain('21');
      // Color space settings
      expect(args).toContain('-colorspace');
      expect(args).toContain('bt709');
      expect(args).toContain('-pix_fmt');
      expect(args).toContain('yuv420p');
    });

    it('should return correct args for h264_nvenc', () => {
      const args = getEncoderArgs('h264_nvenc');

      expect(args).toContain('-c:v');
      expect(args).toContain('h264_nvenc');
      expect(args).toContain('-preset');
      expect(args).toContain('p4');
      expect(args).toContain('-cq');
      expect(args).toContain('21');
    });

    it('should return correct args for h264_qsv', () => {
      const args = getEncoderArgs('h264_qsv');

      expect(args).toContain('-c:v');
      expect(args).toContain('h264_qsv');
      expect(args).toContain('-global_quality');
    });

    it('should return correct args for h264_amf', () => {
      const args = getEncoderArgs('h264_amf');

      expect(args).toContain('-c:v');
      expect(args).toContain('h264_amf');
      expect(args).toContain('-quality');
    });

    it('should include color space settings for all encoders', () => {
      const encoders = ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf'] as const;

      for (const encoder of encoders) {
        const args = getEncoderArgs(encoder);
        expect(args).toContain('-colorspace');
        expect(args).toContain('-color_primaries');
        expect(args).toContain('-color_trc');
        expect(args).toContain('-pix_fmt');
      }
    });
  });
});
