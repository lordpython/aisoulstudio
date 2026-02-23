/**
 * CSS Gradient Generator - TypeScript Type Definitions
 */

/**
 * Supported gradient types
 */
export type GradientType = 'linear' | 'radial' | 'conic';

/**
 * Color stop definition
 */
export interface ColorStop {
  id: string;
  color: string;        // Hex, RGB, or HSL color value
  position: number;     // 0-100 percentage
}

/**
 * Linear gradient configuration
 */
export interface LinearGradientConfig {
  type: 'linear';
  angle: number;        // 0-360 degrees
  colorStops: ColorStop[];
}

/**
 * Radial gradient configuration
 */
export interface RadialGradientConfig {
  type: 'radial';
  shape: 'circle' | 'ellipse';
  position: {
    x: number;         // 0-100 percentage
    y: number;         // 0-100 percentage
  };
  colorStops: ColorStop[];
}

/**
 * Conic gradient configuration
 */
export interface ConicGradientConfig {
  type: 'conic';
  angle: number;        // 0-360 degrees
  position: {
    x: number;         // 0-100 percentage
    y: number;         // 0-100 percentage
  };
  colorStops: ColorStop[];
}

/**
 * Union type for all gradient configurations
 */
export type GradientConfig =
  | LinearGradientConfig
  | RadialGradientConfig
  | ConicGradientConfig;

/**
 * Gradient preset definition
 */
export interface GradientPreset {
  id: string;
  name: string;
  description?: string;
  config: GradientConfig;
  thumbnail?: string;   // Optional preview image
  category?: string;   // For grouping presets
}

/**
 * CSS export format options
 */
export type CSSExportFormat = 'standard' | 'shorthand' | 'legacy';

/**
 * Export options
 */
export interface ExportOptions {
  format: CSSExportFormat;
  includePrefixes: boolean;  // Include vendor prefixes
  includeComments: boolean;  // Include descriptive comments
}

/**
 * Main GradientGenerator component props
 */
export interface GradientGeneratorProps {
  /** Initial gradient configuration */
  initialConfig?: GradientConfig;
  /** Callback when gradient changes */
  onGradientChange?: (config: GradientConfig) => void;
  /** Available presets to display */
  presets?: GradientPreset[];
  /** Whether to show the presets panel */
  showPresets?: boolean;
  /** Whether to show the CSS export panel */
  showExportPanel?: boolean;
  /** Custom className for styling */
  className?: string;
  /** Maximum number of color stops allowed */
  maxColorStops?: number;
  /** Minimum number of color stops required */
  minColorStops?: number;
  /** Whether to enable animation on the preview */
  enableAnimation?: boolean;
  /** Animation duration in seconds (when enabled) */
  animationDuration?: number;
}

/**
 * GradientPreview component props
 */
export interface GradientPreviewProps {
  config: GradientConfig;
  /** Preview dimensions */
  width?: number | string;
  height?: number | string;
  /** Whether to show a checkerboard pattern for transparency */
  showTransparencyGrid?: boolean;
  /** Custom className */
  className?: string;
  /** Whether to enable animation */
  enableAnimation?: boolean;
  /** Animation duration in seconds */
  animationDuration?: number;
}

/**
 * GradientControls component props
 */
export interface GradientControlsProps {
  config: GradientConfig;
  onConfigChange: (config: GradientConfig) => void;
  /** Maximum number of color stops allowed */
  maxColorStops?: number;
  /** Minimum number of color stops required */
  minColorStops?: number;
  /** Custom className */
  className?: string;
}

/**
 * GradientPresets component props
 */
export interface GradientPresetsProps {
  presets: GradientPreset[];
  selectedPresetId?: string;
  onPresetSelect: (preset: GradientPreset) => void;
  /** Whether to show category filters */
  showCategories?: boolean;
  /** Grid layout columns */
  columns?: number;
  /** Custom className */
  className?: string;
}

/**
 * GradientExport component props
 */
export interface GradientExportProps {
  config: GradientConfig;
  exportOptions: ExportOptions;
  onExportOptionsChange: (options: ExportOptions) => void;
  /** Callback when copy to clipboard is triggered */
  onCopy?: (css: string) => void;
  /** Callback when download is triggered */
  onDownload?: (css: string, filename: string) => void;
  /** Custom className */
  className?: string;
}

/**
 * ColorStopEditor component props
 */
export interface ColorStopEditorProps {
  colorStops: ColorStop[];
  onColorStopsChange: (stops: ColorStop[]) => void;
  maxStops?: number;
  minStops?: number;
  /** Whether to show position sliders */
  showPositionSliders?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * DirectionControls component props
 */
export interface DirectionControlsProps {
  config: GradientConfig;
  onConfigChange: (config: GradientConfig) => void;
  /** Available preset directions for linear gradients */
  presetDirections?: Array<{ label: string; angle: number }>;
  /** Custom className */
  className?: string;
}
