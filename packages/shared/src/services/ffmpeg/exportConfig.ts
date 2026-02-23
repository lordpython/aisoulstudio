/**
 * Export Configuration
 * 
 * Types and default configurations for video export.
 * Extracted from ffmpegService.ts for modularity.
 */

import { TransitionType, VideoFormat, FormatAssemblyRules } from "../../types";
import { isAndroid } from "../../utils/platformUtils";

/**
 * Get the server URL based on the current platform.
 *
 * Priority:
 *  1. VITE_SERVER_URL env var — set this in .env.local when running on a real
 *     mobile device so the app can reach the Express server over the LAN.
 *     e.g. VITE_SERVER_URL=http://192.168.1.42:3001
 *  2. Android emulator — 10.0.2.2 is the host loopback alias inside AVD.
 *  3. Default — localhost:3001 (works for web browser dev).
 */
export const getServerUrl = (): string => {
    // Allow override via environment variable (real device / CI)
    const envUrl = typeof import.meta !== 'undefined'
        ? (import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL
        : undefined;
    if (envUrl) return envUrl;

    if (isAndroid()) {
        return "http://10.0.2.2:3001";
    }
    return "http://localhost:3001";
};

export const SERVER_URL = getServerUrl();

export type ExportProgress = {
    stage: "loading" | "preparing" | "rendering" | "encoding" | "complete";
    progress: number;
    message: string;
    /** Current frame being rendered (for detailed progress) */
    currentFrame?: number;
    /** Total frames to render */
    totalFrames?: number;
    /** Current asset type being processed */
    currentAssetType?: "image" | "video";
    /** Current asset index */
    currentAssetIndex?: number;
    /** Total asset count */
    totalAssets?: number;
    /** Video-specific: whether seeking is in progress */
    isSeekingVideo?: boolean;
};

export type ProgressCallback = (progress: ExportProgress) => void;

export interface ExportConfig {
    orientation: "landscape" | "portrait";
    useModernEffects: boolean;
    syncOffsetMs: number;
    fadeOutBeforeCut: boolean;
    wordLevelHighlight: boolean;
    contentMode: "music" | "story";
    transitionType: TransitionType;
    transitionDuration: number;

    visualizerConfig?: {
        enabled: boolean;
        opacity: number;
        maxHeightRatio: number;
        zIndex: number;
        barWidth: number;
        barGap: number;
        colorScheme: "cyan-purple" | "rainbow" | "monochrome";
    };

    textAnimationConfig?: {
        revealDirection: "ltr" | "rtl" | "center-out" | "center-in";
        revealDuration: number;
        wordReveal: boolean;
    };

    // SFX configuration
    sfxPlan?: import("../../types").VideoSFXPlan | null;
    sfxMasterVolume?: number; // 0-1, default: 1.0
    musicMasterVolume?: number; // 0-1, default: 0.5
    /** Scene timing info for SFX mixing */
    sceneTimings?: import("../audioMixerService").SceneAudioInfo[];

    // Format-specific assembly (Task 10.1)
    /** Video format identifier — drives format-specific assembly rules */
    formatId?: VideoFormat;
    /** Pre-built format assembly rules (overrides auto-generation from formatId) */
    assemblyRules?: FormatAssemblyRules;
}



export type RenderAsset = {
    time: number;
    type: "image" | "video";
    element: HTMLImageElement | HTMLVideoElement;
    /** Native duration of the video asset in seconds (for freeze-frame on short clips) */
    nativeDuration?: number;
};

/**
 * Default export configuration for cloud rendering
 */
export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
    orientation: "landscape",
    useModernEffects: true,
    syncOffsetMs: -50,
    fadeOutBeforeCut: true,
    wordLevelHighlight: true,
    contentMode: "music",
    transitionType: "dissolve",
    transitionDuration: 1.5,
    visualizerConfig: {
        enabled: true,
        opacity: 0.15,
        maxHeightRatio: 0.25,
        zIndex: 1,
        barWidth: 3,
        barGap: 2,
        colorScheme: "cyan-purple",
    },
    textAnimationConfig: {
        revealDirection: "ltr",
        revealDuration: 0.3,
        wordReveal: true,
    },
};

/**
 * Merge user config with defaults
 */
export function mergeExportConfig(config?: Partial<ExportConfig>): ExportConfig {
    if (!config) return DEFAULT_EXPORT_CONFIG;

    return {
        ...DEFAULT_EXPORT_CONFIG,
        ...config,
        visualizerConfig: config.visualizerConfig
            ? { ...DEFAULT_EXPORT_CONFIG.visualizerConfig!, ...config.visualizerConfig }
            : DEFAULT_EXPORT_CONFIG.visualizerConfig,
        textAnimationConfig: config.textAnimationConfig
            ? { ...DEFAULT_EXPORT_CONFIG.textAnimationConfig!, ...config.textAnimationConfig }
            : DEFAULT_EXPORT_CONFIG.textAnimationConfig,
    };
}
