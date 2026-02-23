/**
 * CSS Gradient Generator - Main Component
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGradientState, useGradientCSS, useGradientPresets } from './hooks';
import { GradientPreview } from './GradientPreview';
import { GradientControls } from './GradientControls';
import { GradientPresets } from './GradientPresets';
import { GradientExport } from './GradientExport';
import { DEFAULT_PRESETS } from './utils';
import type { GradientGeneratorProps } from './types';

export function GradientGenerator({
  initialConfig,
  onGradientChange,
  presets,
  showPresets = true,
  showExportPanel = true,
  className,
  maxColorStops = 10,
  minColorStops = 2,
  enableAnimation = false,
  animationDuration = 3,
}: GradientGeneratorProps) {
  const gradientState = useGradientState({
    initialConfig,
    maxColorStops,
    minColorStops,
    onChange: onGradientChange,
  });

  const { config } = gradientState;
  const { css } = useGradientCSS(config);

  // Use default presets if none provided
  const presetsToUse = presets || DEFAULT_PRESETS;

  // Export options state
  const [exportOptions, setExportOptions] = React.useState({
    format: 'standard' as 'standard' | 'shorthand' | 'legacy',
    includePrefixes: false,
    includeComments: false,
  });

  const handlePresetSelect = (preset: typeof presetsToUse[0]) => {
    gradientState.setConfig(preset.config);
  };

  return (
    <div className={cn('gradient-generator w-full', className)}>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Preview */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gradient Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <GradientPreview
                config={config}
                enableAnimation={enableAnimation}
                animationDuration={animationDuration}
              />
            </CardContent>
          </Card>

          {/* Export Panel */}
          {showExportPanel && (
            <Card>
              <CardHeader>
                <CardTitle>Export CSS</CardTitle>
              </CardHeader>
              <CardContent>
                <GradientExport
                  config={config}
                  exportOptions={exportOptions}
                  onExportOptionsChange={setExportOptions}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Controls */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gradient Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <GradientControls
                  config={config}
                  onConfigChange={gradientState.setConfig}
                  maxColorStops={maxColorStops}
                  minColorStops={minColorStops}
                />
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Presets Panel */}
          {showPresets && (
            <Card>
              <CardHeader>
                <CardTitle>Preset Gradients</CardTitle>
              </CardHeader>
              <CardContent>
                <GradientPresets
                  presets={presetsToUse}
                  onPresetSelect={handlePresetSelect}
                  showCategories={true}
                  columns={3}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default GradientGenerator;
