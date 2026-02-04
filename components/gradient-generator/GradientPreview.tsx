/**
 * CSS Gradient Generator - Gradient Preview Component
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useGradientCSS } from './hooks';
import type { GradientPreviewProps } from './types';

export function GradientPreview({
  config,
  width = '100%',
  height = '200px',
  showTransparencyGrid = true,
  className,
  enableAnimation = false,
  animationDuration = 3,
}: GradientPreviewProps) {
  const { css } = useGradientCSS(config);

  const previewStyle: React.CSSProperties = {
    width,
    height,
    background: css.replace('background: ', '').replace(';', ''),
    ...(enableAnimation && {
      animation: `gradientShift ${animationDuration}s ease infinite`,
    }),
  };

  return (
    <div className={cn('gradient-preview', className)}>
      <div
        className="relative rounded-lg overflow-hidden border border-border"
        style={{ width, height }}
      >
        {showTransparencyGrid && (
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage: `
                linear-gradient(45deg, #ccc 25%, transparent 25%),
                linear-gradient(-45deg, #ccc 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #ccc 75%),
                linear-gradient(-45deg, transparent 75%, #ccc 75%)
              `,
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            }}
            aria-hidden="true"
          />
        )}
        <div
          className="relative w-full h-full"
          style={previewStyle}
          role="img"
          aria-label={`Gradient preview: ${config.type} gradient`}
        />
      </div>

      {enableAnimation && (
        <style>{`
          @keyframes gradientShift {
            0% { filter: hue-rotate(0deg); }
            100% { filter: hue-rotate(360deg); }
          }
        `}</style>
      )}
    </div>
  );
}

export default GradientPreview;
