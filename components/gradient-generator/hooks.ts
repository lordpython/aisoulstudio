/**
 * CSS Gradient Generator - Custom Hooks
 */

import { useState, useCallback, useMemo } from 'react';
import type { GradientConfig, ColorStop, GradientType, GradientPreset, ExportOptions } from './types';
import { generateGradientCSS, DEFAULT_PRESETS } from './utils';

/**
 * Hook for managing gradient state
 */
interface UseGradientStateOptions {
  initialConfig?: GradientConfig;
  maxColorStops?: number;
  minColorStops?: number;
  onChange?: (config: GradientConfig) => void;
}

interface UseGradientStateReturn {
  config: GradientConfig;
  gradientType: GradientType;
  colorStops: ColorStop[];

  // Actions
  setGradientType: (type: GradientType) => void;
  setColorStops: (stops: ColorStop[]) => void;
  addColorStop: (color?: string, position?: number) => void;
  removeColorStop: (id: string) => void;
  updateColorStop: (id: string, updates: Partial<ColorStop>) => void;
  setLinearAngle: (angle: number) => void;
  setRadialPosition: (x: number, y: number) => void;
  setRadialShape: (shape: 'circle' | 'ellipse') => void;
  setConicAngle: (angle: number) => void;
  setConicPosition: (x: number, y: number) => void;
  setConfig: (config: GradientConfig) => void;
  resetConfig: () => void;

  // Computed
  canAddColorStop: boolean;
  canRemoveColorStop: boolean;
}

export function useGradientState(options: UseGradientStateOptions = {}): UseGradientStateReturn {
  const {
    initialConfig,
    maxColorStops = 10,
    minColorStops = 2,
    onChange,
  } = options;

  // Default initial configuration
  const defaultConfig: GradientConfig = {
    type: 'linear',
    angle: 90,
    colorStops: [
      { id: '1', color: '#6366f1', position: 0 },
      { id: '2', color: '#a855f7', position: 100 },
    ],
  };

  const [config, setConfig] = useState<GradientConfig>(initialConfig || defaultConfig);

  // Computed values
  const gradientType = config.type;
  const colorStops = config.colorStops;
  const canAddColorStop = colorStops.length < maxColorStops;
  const canRemoveColorStop = colorStops.length > minColorStops;

  // Actions
  const setGradientType = useCallback((type: GradientType) => {
    setConfig((prev) => {
      let newConfig: GradientConfig;

      if (type === 'linear') {
        newConfig = {
          type: 'linear',
          angle: 90,
          colorStops: prev.colorStops,
        };
      } else if (type === 'radial') {
        newConfig = {
          type: 'radial',
          shape: 'circle',
          position: { x: 50, y: 50 },
          colorStops: prev.colorStops,
        };
      } else {
        newConfig = {
          type: 'conic',
          angle: 0,
          position: { x: 50, y: 50 },
          colorStops: prev.colorStops,
        };
      }

      onChange?.(newConfig);
      return newConfig;
    });
  }, [onChange]);

  const setColorStops = useCallback((stops: ColorStop[]) => {
    setConfig((prev) => {
      const newConfig = { ...prev, colorStops: stops };
      onChange?.(newConfig);
      return newConfig;
    });
  }, [onChange]);

  const addColorStop = useCallback((color?: string, position?: number) => {
    setConfig((prev) => {
      if (prev.colorStops.length >= maxColorStops) return prev;

      const newStop: ColorStop = {
        id: `${Date.now()}-${Math.random()}`,
        color: color || '#ffffff',
        position: position ?? 50,
      };

      const newConfig = {
        ...prev,
        colorStops: [...prev.colorStops, newStop].sort((a, b) => a.position - b.position),
      };
      onChange?.(newConfig);
      return newConfig;
    });
  }, [maxColorStops, onChange]);

  const removeColorStop = useCallback((id: string) => {
    setConfig((prev) => {
      if (prev.colorStops.length <= minColorStops) return prev;

      const newConfig = {
        ...prev,
        colorStops: prev.colorStops.filter((stop) => stop.id !== id),
      };
      onChange?.(newConfig);
      return newConfig;
    });
  }, [minColorStops, onChange]);

  const updateColorStop = useCallback((id: string, updates: Partial<ColorStop>) => {
    setConfig((prev) => {
      const newConfig = {
        ...prev,
        colorStops: prev.colorStops.map((stop) =>
          stop.id === id ? { ...stop, ...updates } : stop
        ).sort((a, b) => a.position - b.position),
      };
      onChange?.(newConfig);
      return newConfig;
    });
  }, [onChange]);

  const setLinearAngle = useCallback((angle: number) => {
    setConfig((prev) => {
      if (prev.type !== 'linear') return prev;
      const newConfig = { ...prev, angle };
      onChange?.(newConfig);
      return newConfig;
    });
  }, [onChange]);

  const setRadialPosition = useCallback((x: number, y: number) => {
    setConfig((prev) => {
      if (prev.type !== 'radial') return prev;
      const newConfig = { ...prev, position: { x, y } };
      onChange?.(newConfig);
      return newConfig;
    });
  }, [onChange]);

  const setRadialShape = useCallback((shape: 'circle' | 'ellipse') => {
    setConfig((prev) => {
      if (prev.type !== 'radial') return prev;
      const newConfig = { ...prev, shape };
      onChange?.(newConfig);
      return newConfig;
    });
  }, [onChange]);

  const setConicAngle = useCallback((angle: number) => {
    setConfig((prev) => {
      if (prev.type !== 'conic') return prev;
      const newConfig = { ...prev, angle };
      onChange?.(newConfig);
      return newConfig;
    });
  }, [onChange]);

  const setConicPosition = useCallback((x: number, y: number) => {
    setConfig((prev) => {
      if (prev.type !== 'conic') return prev;
      const newConfig = { ...prev, position: { x, y } };
      onChange?.(newConfig);
      return newConfig;
    });
  }, [onChange]);

  const resetConfig = useCallback(() => {
    setConfig(defaultConfig);
    onChange?.(defaultConfig);
  }, [onChange]);

  return {
    config,
    gradientType,
    colorStops,
    setGradientType,
    setColorStops,
    addColorStop,
    removeColorStop,
    updateColorStop,
    setLinearAngle,
    setRadialPosition,
    setRadialShape,
    setConicAngle,
    setConicPosition,
    setConfig,
    resetConfig,
    canAddColorStop,
    canRemoveColorStop,
  };
}

/**
 * Hook for generating CSS from gradient config
 */
interface UseGradientCSSReturn {
  css: string;
  cssWithPrefixes: string;
  getCSS: (options?: ExportOptions) => string;
}

export function useGradientCSS(config: GradientConfig): UseGradientCSSReturn {
  const css = useMemo(() => {
    return generateGradientCSS(config, { format: 'standard', includePrefixes: false, includeComments: false });
  }, [config]);

  const cssWithPrefixes = useMemo(() => {
    return generateGradientCSS(config, { format: 'standard', includePrefixes: true, includeComments: false });
  }, [config]);

  const getCSS = (options?: ExportOptions) => {
    return generateGradientCSS(config, options);
  };

  return { css, cssWithPrefixes, getCSS };
}

/**
 * Hook for managing gradient presets
 */
interface UseGradientPresetsReturn {
  presets: GradientPreset[];
  selectedPreset: GradientPreset | null;
  selectPreset: (preset: GradientPreset) => void;
  addPreset: (preset: GradientPreset) => void;
  removePreset: (id: string) => void;
  filterByCategory: (category: string | null) => void;
  categories: string[];
  activeCategory: string | null;
}

export function useGradientPresets(customPresets?: GradientPreset[]): UseGradientPresetsReturn {
  const [presets, setPresets] = useState<GradientPreset[]>([...DEFAULT_PRESETS, ...(customPresets || [])]);
  const [selectedPreset, setSelectedPreset] = useState<GradientPreset | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const selectPreset = useCallback((preset: GradientPreset) => {
    setSelectedPreset(preset);
  }, []);

  const addPreset = useCallback((preset: GradientPreset) => {
    setPresets((prev) => [...prev, preset]);
  }, []);

  const removePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (selectedPreset?.id === id) {
      setSelectedPreset(null);
    }
  }, [selectedPreset]);

  const filterByCategory = useCallback((category: string | null) => {
    setActiveCategory(category);
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(presets.map((p) => p.category).filter(Boolean) as string[]);
    return Array.from(cats);
  }, [presets]);

  const filteredPresets = activeCategory
    ? presets.filter((p) => p.category === activeCategory)
    : presets;

  return {
    presets: filteredPresets,
    selectedPreset,
    selectPreset,
    addPreset,
    removePreset,
    filterByCategory,
    categories,
    activeCategory,
  };
}
