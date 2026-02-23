/**
 * CSS Gradient Generator - Gradient Presets Component
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateGradientCSS } from './utils';
import type { GradientPresetsProps } from './types';

export function GradientPresets({
  presets,
  selectedPresetId,
  onPresetSelect,
  showCategories = true,
  columns = 3,
  className,
}: GradientPresetsProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Get unique categories
  const categories = Array.from(
    new Set(presets.map((p) => p.category).filter(Boolean) as string[])
  );

  // Filter presets by category
  const filteredPresets = activeCategory
    ? presets.filter((p) => p.category === activeCategory)
    : presets;

  const handleCategoryClick = (category: string | null) => {
    setActiveCategory(category);
  };

  const handlePresetClick = (preset: typeof presets[0]) => {
    onPresetSelect(preset);
  };

  return (
    <div className={cn('gradient-presets space-y-4', className)}>
      {/* Category Filters */}
      {showCategories && categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={activeCategory === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleCategoryClick(null)}
          >
            All
          </Button>
          {categories.map((category) => (
            <Button
              key={category}
              type="button"
              variant={activeCategory === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleCategoryClick(category)}
            >
              {category}
            </Button>
          ))}
        </div>
      )}

      {/* Presets Grid */}
      <ScrollArea className="h-64">
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {filteredPresets.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            const gradientStyle = {
              background: generateGradientCSS(preset.config).replace('background: ', '').replace(';', ''),
            };

            return (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  'group relative rounded-lg border-2 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring',
                  isSelected
                    ? 'border-primary ring-2 ring-primary ring-offset-2'
                    : 'border-border hover:border-primary/50'
                )}
                onClick={() => handlePresetClick(preset)}
                aria-label={`Select ${preset.name} preset: ${preset.description || ''}`}
                aria-pressed={isSelected}
              >
                {/* Gradient Preview */}
                <div
                  className="aspect-square w-full rounded-md"
                  style={gradientStyle}
                  aria-hidden="true"
                />

                {/* Preset Info Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-sm font-medium text-white">{preset.name}</span>
                  {preset.category && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {preset.category}
                    </Badge>
                  )}
                </div>

                {/* Selected Indicator */}
                {isSelected && (
                  <div className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {filteredPresets.length === 0 && (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No presets found
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default GradientPresets;
