/**
 * VideoPreviewCard - Video preview with scene thumbnails
 *
 * Displays the current scene with playback controls and
 * a horizontal scrollable thumbnail strip for scene navigation.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Video, Play, Pause, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scene } from '@/types';

export interface VideoPreviewCardProps {
  /** List of scenes to display */
  scenes: Scene[];
  /** Map of scene ID to visual URL */
  visualsMap: Record<string, string | undefined>;
  /** Currently selected scene index */
  currentSceneIndex: number;
  /** Callback when scene is selected */
  onSceneSelect: (index: number) => void;
  /** Whether video is currently playing */
  isPlaying: boolean;
  /** Callback to toggle play/pause */
  onPlayPause: () => void;
  /** Whether video is ready for export */
  isReady?: boolean;
  /** Total duration in seconds */
  totalDuration?: number;
  /** Text for "scenes" label */
  scenesLabel?: string;
  /** Text for "done" status */
  doneLabel?: string;
  /** RTL layout */
  isRTL?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Video preview card with scene thumbnails
 */
export function VideoPreviewCard({
  scenes,
  visualsMap,
  currentSceneIndex,
  onSceneSelect,
  isPlaying,
  onPlayPause,
  isReady = false,
  totalDuration = 0,
  scenesLabel = 'Scenes',
  doneLabel = 'Ready',
  isRTL = false,
  className,
}: VideoPreviewCardProps) {
  const currentScene = scenes[currentSceneIndex];
  const currentVisual = currentScene ? visualsMap[currentScene.id] : undefined;

  if (scenes.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('', className)}
    >
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
        {/* Main Preview Area */}
        <div className="relative aspect-video bg-black/40">
          {/* Current Visual */}
          {currentVisual ? (
            <img
              src={currentVisual}
              alt={currentScene?.name || 'Scene preview'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white/30 animate-spin" aria-hidden="true" />
            </div>
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

          {/* Scene Counter Badge */}
          <div className={cn('absolute top-4', isRTL ? 'right-4' : 'left-4')}>
            <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur text-xs text-white/80 border border-white/10">
              {scenesLabel} {currentSceneIndex + 1} / {scenes.length}
            </span>
          </div>

          {/* Play/Pause Button */}
          {isReady && (
            <button
              onClick={onPlayPause}
              className="absolute inset-0 flex items-center justify-center group"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <div
                className={cn(
                  'w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all',
                  'group-hover:scale-110 group-hover:bg-white/20',
                  isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                )}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-white" aria-hidden="true" />
                ) : (
                  <Play className="w-6 h-6 text-white ms-1" aria-hidden="true" />
                )}
              </div>
            </button>
          )}

          {/* Scene Info Overlay */}
          <div
            className={cn(
              'absolute bottom-4',
              isRTL ? 'right-4 left-4 text-right' : 'left-4 right-4'
            )}
          >
            <h3 className="text-lg font-medium text-white mb-1">{currentScene?.name}</h3>
            <p className="text-sm text-white/60 line-clamp-2">{currentScene?.narrationScript}</p>
          </div>
        </div>

        {/* Scene Thumbnails */}
        {scenes.length > 1 && (
          <div className="p-3 flex gap-2 overflow-x-auto bg-black/20" role="tablist">
            {scenes.map((scene, idx) => (
              <button
                key={scene.id}
                role="tab"
                aria-selected={idx === currentSceneIndex}
                aria-label={`Scene ${idx + 1}: ${scene.name}`}
                onClick={() => onSceneSelect(idx)}
                className={cn(
                  'shrink-0 w-20 h-12 rounded-lg overflow-hidden border-2 transition-all',
                  idx === currentSceneIndex
                    ? 'border-violet-500 ring-2 ring-violet-500/30'
                    : 'border-transparent opacity-60 hover:opacity-100'
                )}
              >
                {visualsMap[scene.id] ? (
                  <img
                    src={visualsMap[scene.id]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center text-xs text-white/30">
                    {idx + 1}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Status Footer */}
        {isReady && (
          <div className="px-4 py-3 flex items-center justify-between border-t border-white/5 bg-black/20">
            <div className="flex items-center gap-4 text-xs text-white/40">
              <span className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" aria-hidden="true" />
                {scenes.length} {scenesLabel.toLowerCase()}
              </span>
              {totalDuration > 0 && <span>{Math.round(totalDuration)}s</span>}
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              {doneLabel}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default VideoPreviewCard;
