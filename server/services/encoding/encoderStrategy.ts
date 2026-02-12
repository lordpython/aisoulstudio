/**
 * Encoder Strategy Service
 *
 * Handles encoder selection, testing, and fallback logic.
 * Standardizes color space settings for consistent output.
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createLogger } from '../../../services/logger.js';

const log = createLogger('EncoderStrategy');

export type EncoderType = 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libx264';

interface EncoderConfig {
  name: string;
  type: EncoderType;
  isHardware: boolean;
  priority: number;
  available: boolean;
  testedAt?: number;
  testError?: string;
}

/**
 * Standardized encoding specification for color fidelity
 */
export const ENCODING_SPEC = {
  colorSpace: 'bt709',
  colorPrimaries: 'bt709',
  colorTrc: 'bt709',
  pixelFormat: 'yuv420p',
  quality: {
    nvenc: { cq: 21, preset: 'p4' },
    qsv: { cq: 21, preset: 'medium' },
    amf: { cq: 21, preset: 'quality' },
    libx264: { crf: 21, preset: 'fast' },
  },
} as const;

/**
 * Encoder configurations in priority order
 */
const ENCODERS: EncoderConfig[] = [
  {
    name: 'NVIDIA NVENC',
    type: 'h264_nvenc',
    isHardware: true,
    priority: 1,
    available: false,
  },
  {
    name: 'Intel Quick Sync',
    type: 'h264_qsv',
    isHardware: true,
    priority: 2,
    available: false,
  },
  {
    name: 'AMD AMF',
    type: 'h264_amf',
    isHardware: true,
    priority: 3,
    available: false,
  },
  {
    name: 'Software (libx264)',
    type: 'libx264',
    isHardware: false,
    priority: 4,
    available: true, // Always assume available as fallback
  },
];

// Cache encoder availability
let encoderCache: Map<EncoderType, boolean> | null = null;
let selectedEncoder: EncoderType | null = null;

/**
 * Check if FFmpeg is installed
 */
export function isFFmpegInstalled(): boolean {
  try {
    execSync('ffmpeg -version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of available encoders from FFmpeg
 */
function getFFmpegEncoders(): string[] {
  try {
    const output = execSync('ffmpeg -encoders 2>&1', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return output.split('\n');
  } catch {
    return [];
  }
}

/**
 * Test an encoder with a null encode
 */
async function testEncoder(encoder: EncoderType): Promise<boolean> {
  return new Promise((resolve) => {
    // Create a minimal test - encode 1 frame of black
    // NOTE: Some hardware encoders (e.g. NVENC) require a minimum resolution
    // larger than tiny thumbnails like 64x64. Use a safe HD size so the
    // health check reflects real-world usage instead of failing on size.
    const testArgs = [
      '-f', 'lavfi',
      '-i', 'color=black:s=1280x720:d=0.1',
      '-c:v', encoder,
      '-f', 'null',
      '-',
    ];

    const ffmpeg = spawn('ffmpeg', testArgs, {
      stdio: 'pipe',
      timeout: 10000, // 10 second timeout
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      ffmpeg.kill('SIGTERM');
    }, 10000);

    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        resolve(false);
      } else {
        resolve(code === 0);
      }
    });

    ffmpeg.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Detect available encoders (called at startup)
 */
export async function detectEncoders(): Promise<void> {
  log.info('Detecting available encoders...');

  encoderCache = new Map();
  const encoderList = getFFmpegEncoders();

  for (const encoder of ENCODERS) {
    // First check if encoder is listed
    const isListed = encoderList.some((line) =>
      line.includes(encoder.type)
    );

    if (!isListed && encoder.isHardware) {
      encoder.available = false;
      encoder.testError = 'Not listed in FFmpeg encoders';
      encoderCache.set(encoder.type, false);
      continue;
    }

    // Test the encoder
    if (encoder.isHardware) {
      try {
        const works = await testEncoder(encoder.type);
        encoder.available = works;
        encoder.testedAt = Date.now();

        if (works) {
          log.info(`✓ ${encoder.name} (${encoder.type}) available`);
        } else {
          encoder.testError = 'Test encode failed';
          log.debug(`✗ ${encoder.name} (${encoder.type}) test failed`);
        }

        encoderCache.set(encoder.type, works);
      } catch (error) {
        encoder.available = false;
        encoder.testError = error instanceof Error ? error.message : 'Unknown error';
        encoderCache.set(encoder.type, false);
      }
    } else {
      // libx264 is always assumed available
      encoder.available = true;
      encoderCache.set(encoder.type, true);
    }
  }

  // Select best available encoder
  selectedEncoder = selectBestEncoder();
  log.info(`Selected encoder: ${selectedEncoder}`);
}

/**
 * Select the best available encoder
 */
function selectBestEncoder(): EncoderType {
  const available = ENCODERS
    .filter((e) => e.available)
    .sort((a, b) => a.priority - b.priority);

  return available[0]?.type || 'libx264';
}

/**
 * Get the currently selected encoder
 */
export function getSelectedEncoder(): EncoderType {
  if (!selectedEncoder) {
    // If not initialized, do a quick sync check
    const encoderList = getFFmpegEncoders();

    if (encoderList.some((line) => line.includes('h264_nvenc'))) {
      return 'h264_nvenc';
    }
    if (encoderList.some((line) => line.includes('h264_qsv'))) {
      return 'h264_qsv';
    }
    if (encoderList.some((line) => line.includes('h264_amf'))) {
      return 'h264_amf';
    }

    return 'libx264';
  }

  return selectedEncoder;
}

/**
 * Check if an encoder is available
 */
export function isEncoderAvailable(encoder: EncoderType): boolean {
  if (encoderCache) {
    return encoderCache.get(encoder) ?? false;
  }
  return encoder === 'libx264';
}

/**
 * Get fallback encoder chain
 */
export function getFallbackChain(primary: EncoderType): EncoderType[] {
  const chain: EncoderType[] = [primary];

  // Add fallbacks in priority order
  for (const encoder of ENCODERS) {
    if (encoder.type !== primary && encoder.available) {
      chain.push(encoder.type);
    }
  }

  return chain;
}

/**
 * Build encoder-specific FFmpeg arguments
 */
export function getEncoderArgs(encoder: EncoderType): string[] {
  const args: string[] = ['-c:v', encoder];

  const quality = ENCODING_SPEC.quality;

  switch (encoder) {
    case 'h264_nvenc':
      args.push(
        '-preset', quality.nvenc.preset,
        '-rc', 'vbr',
        '-cq', String(quality.nvenc.cq),
        '-b:v', '8M',
        '-maxrate', '12M',
        '-bufsize', '16M'
      );
      break;

    case 'h264_qsv':
      args.push(
        '-preset', quality.qsv.preset,
        '-global_quality', String(quality.qsv.cq),
        '-look_ahead', '1'
      );
      break;

    case 'h264_amf':
      args.push(
        '-quality', quality.amf.preset,
        '-rc', 'vbr_latency',
        '-qp_i', String(quality.amf.cq),
        '-qp_p', String(quality.amf.cq + 2)
      );
      break;

    case 'libx264':
    default:
      const cpuCount = Math.max(2, os.cpus().length - 2);
      args.push(
        '-preset', quality.libx264.preset,
        '-crf', String(quality.libx264.crf),
        '-tune', 'film',
        '-threads', String(cpuCount)
      );
      break;
  }

  // Add standardized color space settings
  args.push(
    '-colorspace', ENCODING_SPEC.colorSpace,
    '-color_primaries', ENCODING_SPEC.colorPrimaries,
    '-color_trc', ENCODING_SPEC.colorTrc,
    '-pix_fmt', ENCODING_SPEC.pixelFormat
  );

  return args;
}

/**
 * Get encoder information for status display
 */
export function getEncoderInfo(): {
  selected: EncoderType;
  isHardware: boolean;
  available: Array<{ type: EncoderType; name: string; isHardware: boolean }>;
} {
  const selected = getSelectedEncoder();
  const selectedConfig = ENCODERS.find((e) => e.type === selected);

  return {
    selected,
    isHardware: selectedConfig?.isHardware ?? false,
    available: ENCODERS
      .filter((e) => e.available)
      .map((e) => ({
        type: e.type,
        name: e.name,
        isHardware: e.isHardware,
      })),
  };
}
