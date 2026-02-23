/**
 * SceneThumbnails - Horizontal scrollable scene thumbnail strip
 *
 * Extracted from VisualizerScreen for better maintainability.
 */

import React from 'react';
import { Video, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImagePrompt, GeneratedImage } from '@/types';

export interface SceneThumbnailsProps {
  /** List of prompts/scenes */
  prompts: ImagePrompt[];
  /** Generated images for each prompt */
  generatedImages: GeneratedImage[];
  /** Currently active scene index */
  currentSceneIndex: number;
  /** Callback when scene is selected */
  onSceneSelect: (index: number, timestampSeconds?: number) => void;
  /** ID of prompt currently being animated */
  animatingPromptId: string | null;
  /** Additional class names */
  className?: string;
}

/**
 * Horizontal scrollable strip of scene thumbnails
 */
export function SceneThumbnails({
  prompts,
  generatedImages,
  currentSceneIndex,
  onSceneSelect,
  animatingPromptId,
  className,
}: SceneThumbnailsProps) {
  return (
    <div
      className={cn('flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/20', className)}
      role="tablist"
      aria-label="Scene thumbnails"
    >
      {prompts.map((prompt, idx) => {
        const image = generatedImages.find(img => img.promptId === prompt.id);
        const isActive = idx === currentSceneIndex;
        const isAnimating = animatingPromptId === prompt.id;
        const isVideo = image?.type === 'video';

        return (
          <div key={prompt.id} className="relative shrink-0">
            <button
              role="tab"
              aria-selected={isActive}
              aria-label={`Scene ${idx + 1}${image ? (isVideo ? ' (video)' : ' (image)') : ''}`}
              onClick={() => onSceneSelect(idx, prompt.timestampSeconds)}
              className={cn(
                'w-24 h-14 rounded-lg overflow-hidden border-2 transition-all',
                isActive
                  ? 'border-cyan-500 ring-2 ring-cyan-500/30'
                  : 'border-transparent opacity-60 hover:opacity-100'
              )}
            >
              {image?.imageUrl ? (
                isVideo ? (
                  <video
                    src={image.imageUrl}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={image.imageUrl}
                    alt={`Scene ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="w-full h-full bg-white/5 flex items-center justify-center text-xs text-white/30">
                  {idx + 1}
                </div>
              )}

              {/* Video/Image indicator badge */}
              {image && (
                <div className="absolute top-0.5 end-0.5">
                  <span className={cn(
                    'flex items-center justify-center w-4 h-4 rounded-full text-[8px]',
                    isVideo ? 'bg-purple-500/80' : 'bg-cyan-500/80'
                  )}>
                    {isVideo ? (
                      <Video className="w-2.5 h-2.5" aria-hidden="true" />
                    ) : (
                      <ImageIcon className="w-2.5 h-2.5" aria-hidden="true" />
                    )}
                  </span>
                </div>
              )}

              {/* Animating overlay */}
              {isAnimating && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin" aria-hidden="true" />
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default SceneThumbnails;
