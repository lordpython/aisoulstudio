/**
 * Unit tests for the export engine router.
 *
 * Mocks platformUtils so we can simulate Capacitor / no-SAB environments
 * without actually running in one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    chooseExportEngine,
    type ExportRoutingDecision,
} from '../../../packages/shared/src/services/ffmpeg/exportRouter';

vi.mock('../../../packages/shared/src/utils/platformUtils', () => ({
    isFFmpegWasmSupported: vi.fn(() => true),
    isNative: vi.fn(() => false),
}));

const platformUtils = await import('../../../packages/shared/src/utils/platformUtils');
const isFFmpegWasmSupported = vi.mocked(platformUtils.isFFmpegWasmSupported);
const isNative = vi.mocked(platformUtils.isNative);

beforeEach(() => {
    isFFmpegWasmSupported.mockReturnValue(true);
    isNative.mockReturnValue(false);
});

function decision(
    durationSec: number,
    sceneCount: number,
    userPreference?: 'cloud' | 'browser',
): ExportRoutingDecision {
    return chooseExportEngine({ durationSec, sceneCount, userPreference });
}

describe('chooseExportEngine — capability gates', () => {
    it('forces cloud on Capacitor (browser WASM impossible in WebView)', () => {
        isNative.mockReturnValue(true);
        const d = decision(30, 5, 'browser');
        expect(d.engine).toBe('cloud');
        expect(d.reason).toMatch(/Capacitor/i);
        // No warning — the choice was overridden, not just risky.
        expect(d.warning).toBeUndefined();
    });

    it('forces cloud when SharedArrayBuffer is missing', () => {
        isFFmpegWasmSupported.mockReturnValue(false);
        const d = decision(30, 5, 'browser');
        expect(d.engine).toBe('cloud');
        expect(d.reason).toMatch(/SharedArrayBuffer/);
    });
});

describe('chooseExportEngine — size thresholds', () => {
    it('recommends cloud above the duration limit (>180s)', () => {
        const d = decision(181, 5);
        expect(d.engine).toBe('cloud');
        expect(d.reason).toMatch(/duration/i);
    });

    it('recommends cloud above the scene-count limit (>20)', () => {
        const d = decision(60, 21);
        expect(d.engine).toBe('cloud');
        expect(d.reason).toMatch(/Scene count/i);
    });

    it('recommends cloud as the default for safe sizes (no preference given)', () => {
        const d = decision(30, 5);
        expect(d.engine).toBe('cloud');
        expect(d.reason).toMatch(/default/i);
    });

    it('honors a cloud preference for any size', () => {
        const d = decision(600, 50, 'cloud');
        expect(d.engine).toBe('cloud');
        expect(d.warning).toBeUndefined();
    });

    it('honors a browser preference within safe limits without warning', () => {
        const d = decision(60, 10, 'browser');
        expect(d.engine).toBe('browser');
        expect(d.warning).toBeUndefined();
    });

    it('honors a browser preference past the duration limit but attaches a warning', () => {
        const d = decision(300, 10, 'browser');
        expect(d.engine).toBe('browser');
        expect(d.warning).toMatch(/duration/i);
    });

    it('honors a browser preference past the scene limit but attaches a warning', () => {
        const d = decision(60, 25, 'browser');
        expect(d.engine).toBe('browser');
        expect(d.warning).toMatch(/Scene count/i);
    });
});

describe('chooseExportEngine — boundary conditions', () => {
    it('exactly at the duration limit (180s) is still safe', () => {
        const d = decision(180, 5, 'browser');
        expect(d.engine).toBe('browser');
        expect(d.warning).toBeUndefined();
    });

    it('exactly at the scene limit (20) is still safe', () => {
        const d = decision(60, 20, 'browser');
        expect(d.engine).toBe('browser');
        expect(d.warning).toBeUndefined();
    });

    it('zero duration and zero scenes is still safe', () => {
        const d = decision(0, 0, 'browser');
        expect(d.engine).toBe('browser');
        expect(d.warning).toBeUndefined();
    });
});
