/**
 * Layout Constants
 * Defines zone-based layout system for video rendering
 * Ensures clear visual hierarchy with non-overlapping elements
 */

import { LayoutConfig } from "../types";

/**
 * Layout presets for different video orientations
 * Each zone uses normalized coordinates (0-1) for responsive scaling
 */
export const LAYOUT_PRESETS: Record<string, LayoutConfig> = {
    landscape: {
        orientation: "landscape",
        zones: {
            background: {
                name: "background",
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                zIndex: 0,
            },
            visualizer: {
                name: "visualizer",
                x: 0,
                y: 0.75,
                width: 1,
                height: 0.25,
                zIndex: 1,
            },
            text: {
                name: "text",
                x: 0.05,
                y: 0.72,
                width: 0.9,
                height: 0.22,
                zIndex: 10,
            },
            translation: {
                name: "translation",
                x: 0.1,
                y: 0.92,
                width: 0.8,
                height: 0.06,
                zIndex: 11,
            },
        },
    },
    portrait: {
        orientation: "portrait",
        zones: {
            background: {
                name: "background",
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                zIndex: 0,
            },
            visualizer: {
                name: "visualizer",
                x: 0,
                y: 0.85,
                width: 1,
                height: 0.15,
                zIndex: 1,
            },
            text: {
                name: "text",
                x: 0.05,
                y: 0.70,
                width: 0.9,
                height: 0.20,
                zIndex: 10,
            },
            translation: {
                name: "translation",
                x: 0.05,
                y: 0.88,
                width: 0.9,
                height: 0.08,
                zIndex: 11,
            },
        },
    },
};

/**
 * Get layout preset for a given orientation
 */
export function getLayoutPreset(orientation: "landscape" | "portrait"): LayoutConfig {
    return LAYOUT_PRESETS[orientation];
}

/**
 * Default visualizer configuration
 * Provides balanced settings for most use cases
 */
export const DEFAULT_VISUALIZER_CONFIG = {
    enabled: true,
    opacity: 0.15,
    maxHeightRatio: 0.25,
    zIndex: 1,
    barWidth: 3,
    barGap: 2,
    colorScheme: "cyan-purple" as const,
};

/**
 * Default text animation configuration
 * Provides smooth directional reveal effects
 */
export const DEFAULT_TEXT_ANIMATION_CONFIG = {
    revealDirection: "ltr" as const,
    revealDuration: 0.3, // 300ms per word
    wordReveal: true,
};