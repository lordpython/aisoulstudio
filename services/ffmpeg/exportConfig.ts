/**
 * Export Configuration
 * 
 * Types and default configurations for video export.
 * Extracted from ffmpegService.ts for modularity.
 */

import { TransitionType } from "../../types";
import { isAndroid } from "../../utils/platformUtils";

/**
 * Get the server URL based on the current platform
 */
export const getServerUrl = (): string => {
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
