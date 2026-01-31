/**
 * VisualPreview - Main visual preview with play/pause and animation controls
 *
 * Extracted from VisualizerScreen for better maintainability.
 */

import React from 'react';
import { Play, Pause, Video, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { GeneratedImage, SubtitleItem } from '@/types';

export interface VisualPreviewProps {
  /** Current visual being displayed */
  currentVisual: GeneratedImage | null;
  /** Current scene index */
  currentSceneIndex: number;
  /** Total number of scenes */
  totalScenes: number;
  /** Whether video is playing */
  isPlaying: boolean;
  /** Callback to toggle play/pause */
  onPlayPause: () => void;
  /** Current playback time in seconds */
  currentTime: number;
  /** Subtitles for overlay */
  subtitles: SubtitleItem[];
  /** ID of prompt currently being animated */
  animatingPromptId: string | null;
  /** Callback to animate current image */
  onAnimateImage: (promptId: string) => void;
  /** RTL layout */
  isRTL?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Visual preview with play/pause, subtitle overlay, and animation controls
 */
export function VisualPreview({
  currentVisual,
  currentSceneIndex,
  totalScenes,
  isPlaying,
  onPlayPause,
  currentTime,
  subtitles,
  animatingPromptId,
  onAnimateImage,
  isRTL = false,
  className,
}: VisualPreviewProps) {
  // Find current subtitle
  const currentSubtitle = subtitles.find(
    s => currentTime >= s.startTime && currentTime <= s.endTime
  );

  const isVideo = currentVisual?.type === 'video';
  const canAnimate = !!(currentVisual && !isVideo);
  const isAnimating = !!(currentVisual && animatingPromptId === currentVisual.promptId);

  return (
    <div className={cn('relative aspect-video bg-black/40 rounded-2xl overflow-hidden border border-white/10', className)}>
      {/* Visual Content */}
      {currentVisual ? (
        isVideo ? (
          <video
            src={currentVisual.imageUrl}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            controls
          />
        ) : (
          <img
            src={currentVisual.imageUrl}
            alt={`Scene ${currentSceneIndex + 1}`}
            className="w-full h-full object-cover"
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center text-white/40">
            <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
            <p>No visual for this scene</p>
          </div>
        </div>
      )}

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

      {/* Scene indicator */}
      <div className={cn('absolute top-4 z-20', isRTL ? 'right-4' : 'left-4')}>
        <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur text-xs text-white/80 border border-white/10 flex items-center gap-1">
          {isVideo ? (
            <Video className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ImageIcon className="w-3 h-3" aria-hidden="true" />
          )}
          Scene {currentSceneIndex + 1} / {totalScenes}
        </span>
      </div>

      {/* Animate button for current scene */}
      {canAnimate && (
        <div className={cn('absolute top-4 z-20', isRTL ? 'left-4' : 'right-4')}>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onAnimateImage(currentVisual.promptId);
            }}
            disabled={isAnimating}
            className="bg-purple-600/80 hover:bg-purple-500 backdrop-blur text-xs"
          >
            {isAnimating ? (
              <>
                <Loader2 className="w-3 h-3 me-1 animate-spin" aria-hidden="true" />
                Animating...
              </>
            ) : (
              <>
                <Video className="w-3 h-3 me-1" aria-hidden="true" />
                Animate
              </>
            )}
          </Button>
        </div>
      )}

      {/* Play/Pause overlay */}
      <button
        onClick={onPlayPause}
        className="absolute inset-0 z-10 flex items-center justify-center group"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        <div className={cn(
          'w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all',
          'group-hover:scale-110 group-hover:bg-white/20',
          isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        )}>
          {isPlaying ? (
            <Pause className="w-6 h-6 text-white" aria-hidden="true" />
          ) : (
            <Play className="w-6 h-6 text-white ms-1" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* Current subtitle */}
      {currentSubtitle && (
        <div className={cn('absolute bottom-4 z-20', isRTL ? 'right-4 left-4 text-right' : 'left-4 right-4')}>
          <p className="text-lg font-medium text-white text-center px-4 py-2 bg-black/60 rounded-lg backdrop-blur-sm">
            {currentSubtitle.text}
          </p>
        </div>
      )}
    </div>
  );
}

export default VisualPreview;
