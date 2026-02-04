/**
 * CSS Gradient Generator - Utility Functions
 */

import type { GradientConfig, ExportOptions, GradientPreset } from './types';

/**
 * Generate CSS gradient string from configuration
 */
export function generateGradientCSS(
  config: GradientConfig,
  options: ExportOptions = { format: 'standard', includePrefixes: false, includeComments: false }
): string {
  const { format, includePrefixes, includeComments } = options;

  const colorStops = config.colorStops
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(', ');

  let gradient = '';

  switch (config.type) {
    case 'linear':
      gradient = `linear-gradient(${config.angle}deg, ${colorStops})`;
      break;
    case 'radial':
      gradient = `radial-gradient(${config.shape} at ${config.position.x}% ${config.position.y}%, ${colorStops})`;
      break;
    case 'conic':
      gradient = `conic-gradient(from ${config.angle}deg at ${config.position.x}% ${config.position.y}%, ${colorStops})`;
      break;
  }

  let css = `background: ${gradient};`;

  if (includePrefixes && config.type === 'linear') {
    css = `-webkit-linear-gradient(${config.angle}deg, ${colorStops});\n` +
          `-moz-linear-gradient(${config.angle}deg, ${colorStops});\n` +
          `-o-linear-gradient(${config.angle}deg, ${colorStops});\n` +
          `background: ${gradient};`;
  }

  if (includeComments) {
    css = `/* ${config.type.charAt(0).toUpperCase() + config.type.slice(1)} Gradient */\n` + css;
  }

  return css;
}

/**
 * Download CSS as a file
 */
export function downloadCSS(css: string, filename: string = 'gradient.css'): void {
  const blob = new Blob([css], { type: 'text/css' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1] || '00', 16),
        g: parseInt(result[2] || '00', 16),
        b: parseInt(result[3] || '00', 16),
      }
    : null;
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Check if a color string is valid
 */
export function isValidColor(color: string): boolean {
  const s = new Option().style;
  s.color = color;
  return s.color !== '';
}

/**
 * Get contrasting text color (black or white) for a given background
 */
export function getContrastColor(hex: string): 'black' | 'white' {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'black';

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? 'black' : 'white';
}

/**
 * Generate a random color
 */
export function randomColor(): string {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

/**
 * Interpolate between two colors
 */
export function interpolateColor(color1: string, color2: string, factor: number): string {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return color1;

  const r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r));
  const g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g));
  const b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));

  return rgbToHex(r, g, b);
}

/**
 * Validate gradient configuration
 */
export function validateGradientConfig(config: GradientConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.colorStops.length < 2) {
    errors.push('At least 2 color stops are required');
  }

  if (config.colorStops.length > 10) {
    errors.push('Maximum 10 color stops allowed');
  }

  for (const stop of config.colorStops) {
    if (stop.position < 0 || stop.position > 100) {
      errors.push(`Color stop position must be between 0 and 100`);
    }
    if (!isValidColor(stop.color)) {
      errors.push(`Invalid color: ${stop.color}`);
    }
  }

  if (config.type === 'linear') {
    if (config.angle < 0 || config.angle > 360) {
      errors.push('Linear angle must be between 0 and 360');
    }
  }

  if (config.type === 'radial' || config.type === 'conic') {
    if (config.position.x < 0 || config.position.x > 100) {
      errors.push('Position X must be between 0 and 100');
    }
    if (config.position.y < 0 || config.position.y > 100) {
      errors.push('Position Y must be between 0 and 100');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Convert gradient config to a unique hash for comparison
 */
export function gradientConfigToHash(config: GradientConfig): string {
  return JSON.stringify(config);
}

/**
 * Generate CSS with class wrapper
 */
export function generateCSSWithClass(
  config: GradientConfig,
  className: string = 'gradient-bg',
  options: ExportOptions = { format: 'standard', includePrefixes: false, includeComments: true }
): string {
  const gradientCSS = generateGradientCSS(config, options);

  return `.${className} {
  ${gradientCSS}
}`;
}

/**
 * Generate CSS with inline style
 */
export function generateInlineStyle(config: GradientConfig): string {
  const gradientCSS = generateGradientCSS(config, {
    format: 'standard',
    includePrefixes: false,
    includeComments: false
  });
  return gradientCSS.replace('background: ', '').replace(';', '');
}

/**
 * Default gradient presets
 */
export const DEFAULT_PRESETS: GradientPreset[] = [
  // Warm presets
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange to purple gradient',
    category: 'Warm',
    config: {
      type: 'linear',
      angle: 135,
      colorStops: [
        { id: '1', color: '#ff7e5f', position: 0 },
        { id: '2', color: '#feb47b', position: 100 },
      ],
    },
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'Intense red and orange gradient',
    category: 'Warm',
    config: {
      type: 'linear',
      angle: 45,
      colorStops: [
        { id: '1', color: '#f12711', position: 0 },
        { id: '2', color: '#f5af19', position: 100 },
      ],
    },
  },
  {
    id: 'peach',
    name: 'Peach',
    description: 'Soft peach gradient',
    category: 'Warm',
    config: {
      type: 'linear',
      angle: 180,
      colorStops: [
        { id: '1', color: '#ffecd2', position: 0 },
        { id: '2', color: '#fcb69f', position: 100 },
      ],
    },
  },
  // Cool presets
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue to cyan gradient',
    category: 'Cool',
    config: {
      type: 'linear',
      angle: 180,
      colorStops: [
        { id: '1', color: '#2193b0', position: 0 },
        { id: '2', color: '#6dd5ed', position: 100 },
      ],
    },
  },
  {
    id: 'sky',
    name: 'Sky',
    description: 'Light blue sky gradient',
    category: 'Cool',
    config: {
      type: 'linear',
      angle: 90,
      colorStops: [
        { id: '1', color: '#56ccf2', position: 0 },
        { id: '2', color: '#2f80ed', position: 100 },
      ],
    },
  },
  {
    id: 'ice',
    name: 'Ice',
    description: 'Cool ice blue gradient',
    category: 'Cool',
    config: {
      type: 'linear',
      angle: 135,
      colorStops: [
        { id: '1', color: '#a8edea', position: 0 },
        { id: '2', color: '#fed6e3', position: 100 },
      ],
    },
  },
  // Nature presets
  {
    id: 'forest',
    name: 'Forest',
    description: 'Green nature gradient',
    category: 'Nature',
    config: {
      type: 'linear',
      angle: 45,
      colorStops: [
        { id: '1', color: '#134e5e', position: 0 },
        { id: '2', color: '#71b280', position: 100 },
      ],
    },
  },
  {
    id: 'meadow',
    name: 'Meadow',
    description: 'Fresh meadow gradient',
    category: 'Nature',
    config: {
      type: 'linear',
      angle: 90,
      colorStops: [
        { id: '1', color: '#d4fc79', position: 0 },
        { id: '2', color: '#96e6a1', position: 100 },
      ],
    },
  },
  // Vibrant presets
  {
    id: 'neon',
    name: 'Neon',
    description: 'Vibrant purple to pink gradient',
    category: 'Vibrant',
    config: {
      type: 'linear',
      angle: 90,
      colorStops: [
        { id: '1', color: '#667eea', position: 0 },
        { id: '2', color: '#764ba2', position: 100 },
      ],
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights inspired gradient',
    category: 'Vibrant',
    config: {
      type: 'linear',
      angle: 120,
      colorStops: [
        { id: '1', color: '#00c6ff', position: 0 },
        { id: '2', color: '#0072ff', position: 100 },
      ],
    },
  },
  // Dark presets
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark blue to black gradient',
    category: 'Dark',
    config: {
      type: 'linear',
      angle: 180,
      colorStops: [
        { id: '1', color: '#0f2027', position: 0 },
        { id: '2', color: '#203a43', position: 50 },
        { id: '3', color: '#2c5364', position: 100 },
      ],
    },
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    description: 'Space-inspired purple gradient',
    category: 'Dark',
    config: {
      type: 'radial',
      shape: 'circle',
      position: { x: 50, y: 50 },
      colorStops: [
        { id: '1', color: '#667eea', position: 0 },
        { id: '2', color: '#764ba2', position: 100 },
      ],
    },
  },
];
