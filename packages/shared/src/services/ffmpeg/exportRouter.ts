/**
 * Export engine router.
 *
 * Decides whether to render via the server (cloud FFmpeg) or browser
 * (FFmpeg WASM) given the video size, platform capabilities, and any user
 * preference. Pure function — no I/O, easy to unit test.
 *
 * Why this exists: browser WASM OOMs on long videos because the frame
 * buffer grows unbounded. Picking the wrong engine surfaces as a hung
 * tab 5–10 minutes into export. Routing up front prevents the failure.
 */

import {
    isFFmpegWasmSupported,
    isNative,
} from '../../utils/platformUtils';

export type ExportEngine = 'cloud' | 'browser';

/** Browser WASM starts to risk OOM beyond this duration. */
const BROWSER_DURATION_LIMIT_SEC = 180;

/** Each scene adds asset+frame memory pressure; cap at this scene count. */
const BROWSER_SCENE_LIMIT = 20;

export interface ExportRoutingInput {
    /** Total video duration in seconds. */
    durationSec: number;
    /** Number of scenes/shots in the video. */
    sceneCount: number;
    /**
     * What the user explicitly asked for, if anything. When omitted, the
     * router picks the recommended engine; when set, the router respects
     * the choice but may attach a warning.
     */
    userPreference?: ExportEngine;
}

export interface ExportRoutingDecision {
    /** Chosen engine — pass to the matching exportVideo* function. */
    engine: ExportEngine;
    /** Human-readable explanation of why this engine was chosen. */
    reason: string;
    /**
     * Warning to show in the UI when the user picked an engine that
     * the router considers risky (e.g., browser on a 30-min video).
     * Undefined when the choice is safe.
     */
    warning?: string;
}

/**
 * Capabilities check — these conditions mean browser WASM is impossible,
 * not just risky. They override any user preference.
 */
function browserExportImpossible(): { impossible: boolean; reason?: string } {
    if (isNative()) {
        return { impossible: true, reason: 'Browser WASM is unavailable in Capacitor WebViews' };
    }
    if (!isFFmpegWasmSupported()) {
        return { impossible: true, reason: 'Browser lacks SharedArrayBuffer support required by FFmpeg WASM' };
    }
    return { impossible: false };
}

/**
 * Size check — these are soft limits where browser is technically possible
 * but likely to fail (OOM). The router defaults to cloud and warns if the
 * user explicitly picks browser.
 */
function browserExportRisky(input: ExportRoutingInput): { risky: boolean; reason?: string } {
    if (input.durationSec > BROWSER_DURATION_LIMIT_SEC) {
        return {
            risky: true,
            reason: `Video duration ${Math.round(input.durationSec)}s exceeds browser-safe limit (${BROWSER_DURATION_LIMIT_SEC}s)`,
        };
    }
    if (input.sceneCount > BROWSER_SCENE_LIMIT) {
        return {
            risky: true,
            reason: `Scene count ${input.sceneCount} exceeds browser-safe limit (${BROWSER_SCENE_LIMIT})`,
        };
    }
    return { risky: false };
}

/**
 * Pick the export engine for a given video.
 */
export function chooseExportEngine(input: ExportRoutingInput): ExportRoutingDecision {
    const impossible = browserExportImpossible();
    if (impossible.impossible) {
        return {
            engine: 'cloud',
            reason: impossible.reason ?? 'Browser export not available on this platform',
        };
    }

    const risky = browserExportRisky(input);

    // No explicit preference → recommend based on size.
    if (!input.userPreference) {
        if (risky.risky) {
            return { engine: 'cloud', reason: risky.reason ?? 'Recommended for this video size' };
        }
        return { engine: 'cloud', reason: 'Server is the default — faster encoding and no memory limits' };
    }

    // User picked cloud — always honor; cloud has no real downsides here.
    if (input.userPreference === 'cloud') {
        return { engine: 'cloud', reason: 'User selected cloud rendering' };
    }

    // User picked browser — honor it but warn if risky.
    return {
        engine: 'browser',
        reason: 'User selected browser rendering',
        warning: risky.risky ? risky.reason : undefined,
    };
}
