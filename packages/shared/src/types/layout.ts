/**
 * Layout & Rendering Types — Zones, text animation, visualizer config
 */

/**
 * Text reveal direction for wipe animations
 */
export type TextRevealDirection = "ltr" | "rtl" | "center-out" | "center-in";

/**
 * Layout zone definition for zone-based rendering
 * Uses normalized coordinates (0-1) for responsive scaling
 */
export interface LayoutZone {
  name: string;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  width: number; // normalized 0-1
  height: number; // normalized 0-1
  zIndex: number;
}

/**
 * Layout configuration with zone definitions
 */
export interface LayoutConfig {
  orientation: "landscape" | "portrait";
  zones: {
    background: LayoutZone;
    visualizer: LayoutZone;
    text: LayoutZone;
    translation: LayoutZone;
  };
}

/**
 * Text animation configuration for wipe effects
 */
export interface TextAnimationConfig {
  revealDirection: TextRevealDirection;
  revealDuration: number; // seconds
  wordReveal: boolean; // word-by-word or line-by-line
}

/**
 * Visualizer configuration options
 */
export interface VisualizerConfig {
  enabled: boolean;
  opacity: number; // 0.0-1.0
  maxHeightRatio: number; // 0.0-1.0
  zIndex: number;
  barWidth: number; // pixels
  barGap: number; // pixels
  colorScheme: "cyan-purple" | "rainbow" | "monochrome";
}
