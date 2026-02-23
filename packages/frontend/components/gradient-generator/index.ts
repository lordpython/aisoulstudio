/**
 * CSS Gradient Generator - Public API Exports
 */

// Main component
export { GradientGenerator } from './GradientGenerator';

// Sub-components
export { GradientPreview } from './GradientPreview';
export { GradientControls } from './GradientControls';
export { GradientPresets } from './GradientPresets';
export { GradientExport } from './GradientExport';

// Custom hooks
export { useGradientState, useGradientCSS, useGradientPresets } from './hooks';

// Utility functions
export {
  generateGradientCSS,
  downloadCSS,
  copyToClipboard,
  hexToRgb,
  rgbToHex,
  isValidColor,
  getContrastColor,
  randomColor,
  interpolateColor,
  validateGradientConfig,
  gradientConfigToHash,
  generateCSSWithClass,
  generateInlineStyle,
  DEFAULT_PRESETS,
} from './utils';

// Types
export type {
  GradientType,
  ColorStop,
  LinearGradientConfig,
  RadialGradientConfig,
  ConicGradientConfig,
  GradientConfig,
  GradientPreset,
  CSSExportFormat,
  ExportOptions,
  GradientGeneratorProps,
  GradientPreviewProps,
  GradientControlsProps,
  GradientPresetsProps,
  GradientExportProps,
  ColorStopEditorProps,
  DirectionControlsProps,
} from './types';
