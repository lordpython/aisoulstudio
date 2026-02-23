/**
 * CSS Gradient Generator - Gradient Controls Component
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import type { GradientControlsProps } from './types';
import { generateGradientCSS } from './utils';

export function GradientControls({
  config,
  onConfigChange,
  maxColorStops = 10,
  minColorStops = 2,
  className,
}: GradientControlsProps) {
  const [editingColorId, setEditingColorId] = useState<string | null>(null);

  const handleGradientTypeChange = (type: string) => {
    if (type !== 'linear' && type !== 'radial' && type !== 'conic') return;

    let newConfig;

    if (type === 'linear') {
      newConfig = {
        type: 'linear' as const,
        angle: 90,
        colorStops: config.colorStops,
      };
    } else if (type === 'radial') {
      newConfig = {
        type: 'radial' as const,
        shape: 'circle' as const,
        position: { x: 50, y: 50 },
        colorStops: config.colorStops,
      };
    } else {
      newConfig = {
        type: 'conic' as const,
        angle: 0,
        position: { x: 50, y: 50 },
        colorStops: config.colorStops,
      };
    }

    onConfigChange(newConfig);
  };

  const handleColorChange = (id: string, color: string) => {
    const newColorStops = config.colorStops.map((stop) =>
      stop.id === id ? { ...stop, color } : stop
    );
    onConfigChange({ ...config, colorStops: newColorStops });
  };

  const handlePositionChange = (id: string, position: number) => {
    const newColorStops = config.colorStops.map((stop) =>
      stop.id === id ? { ...stop, position } : stop
    ).sort((a, b) => a.position - b.position);
    onConfigChange({ ...config, colorStops: newColorStops });
  };

  const handleAddColorStop = () => {
    if (config.colorStops.length >= maxColorStops) return;

    const newStop = {
      id: `${Date.now()}-${Math.random()}`,
      color: '#ffffff',
      position: 50,
    };

    const newColorStops = [...config.colorStops, newStop].sort((a, b) => a.position - b.position);
    onConfigChange({ ...config, colorStops: newColorStops });
  };

  const handleRemoveColorStop = (id: string) => {
    if (config.colorStops.length <= minColorStops) return;

    const newColorStops = config.colorStops.filter((stop) => stop.id !== id);
    onConfigChange({ ...config, colorStops: newColorStops });
  };

  const handleAngleChange = (angle: number) => {
    if (config.type !== 'linear' && config.type !== 'conic') return;
    onConfigChange({ ...config, angle });
  };

  const handlePositionXYChange = (x: number, y: number) => {
    if (config.type !== 'radial' && config.type !== 'conic') return;
    onConfigChange({ ...config, position: { x, y } });
  };

  const handleShapeChange = (shape: 'circle' | 'ellipse') => {
    if (config.type !== 'radial') return;
    onConfigChange({ ...config, shape });
  };

  const canAddColorStop = config.colorStops.length < maxColorStops;
  const canRemoveColorStop = config.colorStops.length > minColorStops;

  return (
    <div className={cn('gradient-controls space-y-6', className)}>
      {/* Gradient Type Selector */}
      <div className="space-y-3">
        <Label htmlFor="gradient-type">Gradient Type</Label>
        <Tabs value={config.type} onValueChange={handleGradientTypeChange}>
          <TabsList className="w-full">
            <TabsTrigger value="linear" className="flex-1">Linear</TabsTrigger>
            <TabsTrigger value="radial" className="flex-1">Radial</TabsTrigger>
            <TabsTrigger value="conic" className="flex-1">Conic</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Direction/Angle Controls */}
      {(config.type === 'linear' || config.type === 'conic') && (
        <div className="space-y-3">
          <Label htmlFor="angle-slider">
            Angle: {config.angle}°
          </Label>
          <Slider
            id="angle-slider"
            value={[config.angle]}
            onValueChange={([value]) => value !== undefined && handleAngleChange(value)}
            min={0}
            max={360}
            step={1}
            className="w-full"
            aria-label="Gradient angle in degrees"
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={config.angle}
          />
        </div>
      )}

      {/* Radial Shape Control */}
      {config.type === 'radial' && (
        <div className="space-y-3">
          <Label htmlFor="shape-select">Shape</Label>
          <Select value={config.shape} onValueChange={handleShapeChange}>
            <SelectTrigger id="shape-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="circle">Circle</SelectItem>
              <SelectItem value="ellipse">Ellipse</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Position Controls for Radial/Conic */}
      {(config.type === 'radial' || config.type === 'conic') && (
        <div className="space-y-3">
          <Label>Position</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="position-x" className="text-sm text-muted-foreground">
                X: {config.position.x}%
              </Label>
              <Slider
                id="position-x"
                value={[config.position.x]}
                onValueChange={([value]) => value !== undefined && handlePositionXYChange(value, config.position.y)}
                min={0}
                max={100}
                step={1}
                className="w-full"
                aria-label="Gradient position X"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={config.position.x}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position-y" className="text-sm text-muted-foreground">
                Y: {config.position.y}%
              </Label>
              <Slider
                id="position-y"
                value={[config.position.y]}
                onValueChange={([value]) => value !== undefined && handlePositionXYChange(config.position.x, value)}
                min={0}
                max={100}
                step={1}
                className="w-full"
                aria-label="Gradient position Y"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={config.position.y}
              />
            </div>
          </div>
        </div>
      )}

      {/* Color Stops */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Color Stops</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddColorStop}
            disabled={!canAddColorStop}
            aria-label="Add color stop"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>

        <div className="space-y-3">
          {config.colorStops.map((stop, index) => (
            <div
              key={stop.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
            >
              {/* Color Picker */}
              <div className="relative">
                <input
                  type="color"
                  value={stop.color}
                  onChange={(e) => handleColorChange(stop.id, e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                  aria-label={`Color stop ${index + 1} color`}
                />
              </div>

              {/* Position Slider */}
              <div className="flex-1 space-y-1">
                <Label htmlFor={`position-${stop.id}`} className="text-sm text-muted-foreground">
                  Position: {stop.position}%
                </Label>
                <Slider
                  id={`position-${stop.id}`}
                  value={[stop.position]}
                  onValueChange={([value]) => value !== undefined && handlePositionChange(stop.id, value)}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                  aria-label={`Color stop ${index + 1} position`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={stop.position}
                />
              </div>

              {/* Remove Button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveColorStop(stop.id)}
                disabled={!canRemoveColorStop}
                aria-label={`Remove color stop ${index + 1}`}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Reset Button */}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          const defaultConfig = {
            type: 'linear' as const,
            angle: 90,
            colorStops: [
              { id: '1', color: '#6366f1', position: 0 },
              { id: '2', color: '#a855f7', position: 100 },
            ],
          };
          onConfigChange(defaultConfig);
        }}
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        Reset to Default
      </Button>
    </div>
  );
}

export default GradientControls;
