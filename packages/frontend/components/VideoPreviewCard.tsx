/**
 * VideoPreviewCard - Video preview with scene thumbnails
 *
 * Displays the current scene with playback controls and
 * a horizontal scrollable thumbnail strip for scene navigation.
 * Includes a full transport bar (seek, skip, volume, fullscreen)
 * and a "N / M Videos generated" counter badge.
 *
 * When `currentVisual` is a video, the internal <video> ref drives the
 * transport bar — callers get `currentTime` / `onSeek` / `onPlayPause`
 * callbacks but can also leave them unset and the card self-manages.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Video, Play, Pause, Loader2, CheckCircle2,
  SkipBack, SkipForward, ChevronFirst, Volume2, VolumeX, Maximize,
} from 'lucide-react';
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
  /** Whether video is currently playing (controlled externally; ignored when self-managing) */
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

  // Transport bar — caller-controlled (optional; if omitted the card self-manages via videoRef)
  currentTime?: number;
  onSeek?: (time: number) => void;
  onSkipToStart?: () => void;
  onSkipPrev?: () => void;
  onSkipNext?: () => void;
  volume?: number;
  onVolumeChange?: (v: number) => void;
  onFullscreen?: () => void;

  // Generation counter + Generate Video button
  videosGeneratedCount?: number;
  totalVideos?: number;
  onGenerateVideo?: () => void;
}

function formatTime(secs: number): string {
  const s = Math.floor(secs);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

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
  currentTime: externalCurrentTime,
  onSeek: externalOnSeek,
  onSkipToStart,
  onSkipPrev,
  onSkipNext,
  volume: externalVolume,
  onVolumeChange: externalOnVolumeChange,
  onFullscreen,
  videosGeneratedCount,
  totalVideos,
  onGenerateVideo,
}: VideoPreviewCardProps) {
  const currentScene = scenes[currentSceneIndex];
  const currentVisual = currentScene ? visualsMap[currentScene.id] : undefined;
  const isVideoSrc = !!(
    currentVisual &&
    (currentVisual.match(/\.(mp4|webm)$/i) ||
      currentVisual.includes('generativelanguage.googleapis.com'))
  );

  // Internal state for self-managed playback (only used when currentVisual is a <video>)
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalTime, setInternalTime] = useState(0);
  const [internalDuration, setInternalDuration] = useState(0);
  const [internalVolume, setInternalVolume] = useState(1);
  const [internalPlaying, setInternalPlaying] = useState(false);

  // Whether we self-manage (no external seek wired)
  const selfManaged = isVideoSrc && !externalOnSeek;

  const currentTime = selfManaged ? internalTime : (externalCurrentTime ?? 0);
  const duration = selfManaged ? internalDuration : (totalDuration || 0);
  const volume = selfManaged ? internalVolume : (externalVolume ?? 1);
  const playing = selfManaged ? internalPlaying : isPlaying;

  // Sync video element play/pause with external isPlaying when not self-managed
  useEffect(() => {
    if (!videoRef.current || selfManaged) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, selfManaged]);

  // Sync volume to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  // Reset internal state when scene changes
  useEffect(() => {
    setInternalTime(0);
    setInternalDuration(0);
    setInternalPlaying(false);
  }, [currentSceneIndex]);

  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current && selfManaged) {
      setInternalTime(videoRef.current.currentTime);
    }
  }, [selfManaged]);

  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setInternalDuration(videoRef.current.duration);
    }
  }, []);

  const handleVideoPlay = useCallback(() => setInternalPlaying(true), []);
  const handleVideoPause = useCallback(() => setInternalPlaying(false), []);
  const handleVideoEnded = useCallback(() => setInternalPlaying(false), []);

  const handlePlayPause = useCallback(() => {
    if (selfManaged && videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    } else {
      onPlayPause();
    }
  }, [selfManaged, onPlayPause]);

  const handleSeek = useCallback((time: number) => {
    if (selfManaged && videoRef.current) {
      videoRef.current.currentTime = time;
      setInternalTime(time);
    } else {
      externalOnSeek?.(time);
    }
  }, [selfManaged, externalOnSeek]);

  const handleSkipToStart = useCallback(() => {
    if (selfManaged && videoRef.current) {
      videoRef.current.currentTime = 0;
      setInternalTime(0);
    } else {
      onSkipToStart?.();
    }
  }, [selfManaged, onSkipToStart]);

  const handleVolumeChange = useCallback((v: number) => {
    if (selfManaged) {
      setInternalVolume(v);
      if (videoRef.current) videoRef.current.volume = v;
    } else {
      externalOnVolumeChange?.(v);
    }
  }, [selfManaged, externalOnVolumeChange]);

  const handleFullscreen = useCallback(() => {
    if (onFullscreen) {
      onFullscreen();
    } else if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    }
  }, [onFullscreen]);

  const hasTransportBar = isVideoSrc || !!(
    externalOnSeek || onSkipToStart || onSkipPrev || onSkipNext ||
    externalOnVolumeChange || onFullscreen
  );
  const hasGenerationCounter =
    videosGeneratedCount !== undefined && totalVideos !== undefined;

  if (scenes.length === 0) return null;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('', className)}
    >
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
        {/* Main Preview Area */}
        <div className="relative aspect-video bg-black/40">
          {/* Current Visual */}
          {currentVisual ? (
            isVideoSrc ? (
              <video
                ref={videoRef}
                src={currentVisual}
                className="w-full h-full object-cover"
                controls={false}
                loop
                muted={volume === 0}
                playsInline
                crossOrigin="anonymous"
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onEnded={handleVideoEnded}
              />
            ) : (
              <img
                src={currentVisual}
                alt={currentScene?.name || 'Scene preview'}
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white/30 animate-spin" aria-hidden="true" />
            </div>
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

          {/* Scene Counter Badge (top-left) */}
          <div className={cn('absolute top-4', isRTL ? 'right-4' : 'left-4')}>
            <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur text-xs text-white/80 border border-white/10">
              {scenesLabel} {currentSceneIndex + 1} / {scenes.length}
            </span>
          </div>

          {/* Generation Counter Badge (top-right) */}
          {hasGenerationCounter && (
            <div className={cn('absolute top-4', isRTL ? 'left-4' : 'right-4')}>
              <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur text-xs text-white/80 border border-white/10">
                {videosGeneratedCount} / {totalVideos} Videos generated
              </span>
            </div>
          )}

          {/* Generate Video overlay (centered, when no visual yet) */}
          {onGenerateVideo && !currentVisual && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <button
                onClick={onGenerateVideo}
                className="px-6 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-sm shadow-2xl transition-colors flex items-center gap-2"
              >
                <Video className="w-4 h-4" aria-hidden="true" />
                Generate Video →
              </button>
            </div>
          )}

          {/* Play/Pause overlay button (center) */}
          {isReady && (
            <button
              onClick={handlePlayPause}
              className="absolute inset-0 flex items-center justify-center group"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              <div
                className={cn(
                  'w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all',
                  'group-hover:scale-110 group-hover:bg-white/20',
                  playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                )}
              >
                {playing ? (
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
              'absolute bottom-4 pointer-events-none',
              isRTL ? 'right-4 left-4 text-right' : 'left-4 right-4'
            )}
          >
            <h3 className="text-lg font-medium text-white mb-1">{currentScene?.name}</h3>
            <p className="text-sm text-white/60 line-clamp-2">{currentScene?.narrationScript}</p>
          </div>
        </div>

        {/* Transport Bar */}
        {hasTransportBar && (
          <div className="px-4 py-2 bg-black/30 border-t border-white/5 space-y-1.5">
            {/* Seek bar */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={e => handleSeek(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10 accent-yellow-400"
              aria-label="Seek"
            />

            {/* Controls row */}
            <div className="flex items-center gap-1.5">
              {/* Skip to start */}
              <button
                onClick={handleSkipToStart}
                className="p-1 text-white/50 hover:text-white transition-colors"
                aria-label="Skip to start"
              >
                <ChevronFirst className="w-4 h-4" aria-hidden="true" />
              </button>

              {/* Previous scene */}
              <button
                onClick={() => {
                  if (onSkipPrev) onSkipPrev();
                  else if (currentSceneIndex > 0) onSceneSelect(currentSceneIndex - 1);
                }}
                disabled={currentSceneIndex === 0}
                className="p-1 text-white/50 hover:text-white disabled:text-white/20 transition-colors"
                aria-label="Previous scene"
              >
                <SkipBack className="w-4 h-4" aria-hidden="true" />
              </button>

              {/* Play / Pause */}
              <button
                onClick={handlePlayPause}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? (
                  <Pause className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Play className="w-4 h-4 ms-0.5" aria-hidden="true" />
                )}
              </button>

              {/* Next scene */}
              <button
                onClick={() => {
                  if (onSkipNext) onSkipNext();
                  else if (currentSceneIndex < scenes.length - 1) onSceneSelect(currentSceneIndex + 1);
                }}
                disabled={currentSceneIndex >= scenes.length - 1}
                className="p-1 text-white/50 hover:text-white disabled:text-white/20 transition-colors"
                aria-label="Next scene"
              >
                <SkipForward className="w-4 h-4" aria-hidden="true" />
              </button>

              {/* Time display */}
              {duration > 0 && (
                <span className="text-xs text-white/40 font-mono tabular-nums ml-1">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              )}

              <div className="flex-1" />

              {/* Volume */}
              <button
                onClick={() => handleVolumeChange(volume > 0 ? 0 : 1)}
                className="p-1 text-white/50 hover:text-white transition-colors"
                aria-label={volume > 0 ? 'Mute' : 'Unmute'}
              >
                {volume > 0 ? (
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <VolumeX className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={e => handleVolumeChange(parseFloat(e.target.value))}
                className="w-16 h-1 rounded-full appearance-none cursor-pointer bg-white/10 accent-yellow-400"
                aria-label="Volume"
              />

              {/* Fullscreen */}
              <button
                onClick={handleFullscreen}
                className="p-1 text-white/50 hover:text-white transition-colors"
                aria-label="Fullscreen"
              >
                <Maximize className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

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
                  (() => {
                    const url = visualsMap[scene.id]!;
                    const isVid = url.match(/\.(mp4|webm)$/i) ||
                      url.includes('generativelanguage.googleapis.com');
                    if (isVid) {
                      return (
                        <video
                          src={url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          crossOrigin="anonymous"
                          onMouseOver={e => e.currentTarget.play()}
                          onMouseOut={e => e.currentTarget.pause()}
                        />
                      );
                    }
                    return (
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                      />
                    );
                  })()
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
