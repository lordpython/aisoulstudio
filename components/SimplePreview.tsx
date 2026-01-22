/**
 * SimplePreview Component
 * 
 * Clean video preview with minimal controls.
 * Supports image slideshow playback synced with audio.
 * Shows "Fine-tune" button for power users.
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  Settings2,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SceneInfo {
  id: string;
  imageUrl?: string;
  duration: number;
}

interface SimplePreviewProps {
  videoUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  duration: number;
  scenes?: SceneInfo[];
  onExport: () => void;
  onRegenerate: () => void;
  onFineTune: () => void;
  className?: string;
}

export const SimplePreview: React.FC<SimplePreviewProps> = ({
  videoUrl,
  audioUrl,
  thumbnailUrl,
  title = "Your Video",
  duration,
  scenes = [],
  onExport,
  onRegenerate,
  onFineTune,
  className,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Calculate scene timings for slideshow
  const sceneTimings = useMemo(() => {
    let cumulative = 0;
    return scenes.map(scene => {
      const start = cumulative;
      cumulative += scene.duration;
      return { ...scene, startTime: start, endTime: cumulative };
    });
  }, [scenes]);

  // Get current scene based on playback time
  const currentScene = useMemo(() => {
    if (sceneTimings.length === 0) return null;
    return sceneTimings.find(
      scene => currentTime >= scene.startTime && currentTime < scene.endTime
    ) || sceneTimings[sceneTimings.length - 1];
  }, [sceneTimings, currentTime]);

  // Current image to display
  const currentImageUrl = currentScene?.imageUrl || thumbnailUrl;

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle play/pause
  const togglePlay = () => {
    // If we have a video, use video playback
    if (videoRef.current && videoUrl) {
      if (isPlaying) {
        videoRef.current.pause();
        audioRef.current?.pause();
      } else {
        videoRef.current.play();
        audioRef.current?.play();
      }
      setIsPlaying(!isPlaying);
    }
    // Otherwise use audio-only slideshow mode
    else if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(err => {
          console.error("[SimplePreview] Audio play failed:", err);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Handle seek
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;

    if (videoRef.current && videoUrl) {
      videoRef.current.currentTime = newTime;
    }
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setCurrentTime(newTime);
  };

  // Sync time updates from audio (for slideshow mode)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [audioUrl]);

  // Sync time updates from video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [videoUrl]);

  // Auto-hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("[SimplePreview] Fullscreen error:", err);
    }
  };

  // Track fullscreen changes (e.g., user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if our container or its children are focused, or no specific element is focused
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";
      if (isInput) return;

      switch (e.key) {
        case " ": // Space - play/pause
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft": // Seek backward 5s
          e.preventDefault();
          const newTimeBack = Math.max(0, currentTime - 5);
          if (videoRef.current && videoUrl) videoRef.current.currentTime = newTimeBack;
          if (audioRef.current) audioRef.current.currentTime = newTimeBack;
          setCurrentTime(newTimeBack);
          break;
        case "ArrowRight": // Seek forward 5s
          e.preventDefault();
          const newTimeForward = Math.min(duration, currentTime + 5);
          if (videoRef.current && videoUrl) videoRef.current.currentTime = newTimeForward;
          if (audioRef.current) audioRef.current.currentTime = newTimeForward;
          setCurrentTime(newTimeForward);
          break;
        case "m":
        case "M": // Mute toggle
          setIsMuted(!isMuted);
          break;
        case "f":
        case "F": // Fullscreen toggle
          toggleFullscreen();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, duration, isMuted, videoUrl]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("w-full max-w-3xl mx-auto px-4 sm:px-0", className)}
    >
      {/* Video Container */}
      <div
        ref={containerRef}
        className={cn(
          "relative glass-panel rounded-xl sm:rounded-2xl overflow-hidden group border-0",
          isFullscreen ? "rounded-none" : "aspect-video"
        )}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        {/* Video/Slideshow/Thumbnail */}
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            muted={isMuted}
            playsInline
          />
        ) : scenes.length > 0 ? (
          // Slideshow mode - show current scene image with crossfade + Ken Burns
          <div className="relative w-full h-full overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentScene?.id || "default"}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 1 }}
                animate={{
                  opacity: 1,
                  scale: isPlaying ? 1.08 : 1
                }}
                exit={{ opacity: 0 }}
                transition={{
                  opacity: { duration: 0.5 },
                  scale: { duration: currentScene?.duration || 5, ease: "linear" }
                }}
              >
                <img
                  src={currentImageUrl}
                  alt={title}
                  className="w-full h-full object-contain"
                />
              </motion.div>
            </AnimatePresence>
          </div>
        ) : thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-slate-900 to-slate-800 flex items-center justify-center">
            <span className="text-muted-foreground">Preview not available</span>
          </div>
        )}

        {/* Audio element for slideshow playback */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            muted={isMuted}
            preload="auto"
          />
        )}

        {/* Play Button Overlay */}
        <AnimatePresence>
          {(!isPlaying || showControls) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/30 flex items-center justify-center"
            >
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={togglePlay}
                className="w-20 h-20 rounded-full glass-button flex items-center justify-center border border-white/30"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 text-white" />
                ) : (
                  <Play className="w-8 h-8 text-white ml-1" />
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Controls */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-0 left-0 right-0 p-4 bg-linear-to-t from-black/80 to-transparent backdrop-blur-md"
            >
              {/* Progress Bar */}
              <div
                className="h-1 bg-white/20 rounded-full mb-3 cursor-pointer group/progress"
                onClick={handleSeek}
              >
                <div
                  className="h-full bg-white rounded-full relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Time & Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 text-white" />
                    ) : (
                      <Play className="w-5 h-5 text-white" />
                    )}
                  </button>

                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5 text-white" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-white" />
                    )}
                  </button>

                  <span className="text-sm text-white/80 font-mono">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                <button
                  onClick={toggleFullscreen}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-5 h-5 text-white" />
                  ) : (
                    <Maximize2 className="w-5 h-5 text-white" />
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Title */}
      <div className="mt-3 sm:mt-4 mb-4 sm:mb-6 text-center">
        <h2 className="text-lg sm:text-xl font-bold">{title}</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {formatTime(duration)} • Ready to export
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3">
        <Button
          onClick={onRegenerate}
          variant="outline"
          className="gap-2 h-10 sm:h-12 px-4 sm:px-6 rounded-xl order-2 sm:order-1"
        >
          <RotateCcw className="w-4 h-4" />
          Regenerate
        </Button>

        <Button
          onClick={onExport}
          className="gap-2 h-12 sm:h-12 px-6 sm:px-8 rounded-xl bg-linear-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 font-semibold order-1 sm:order-2 hover-glow"
        >
          <Download className="w-4 h-4" />
          Export Video
        </Button>

        <Button
          onClick={onFineTune}
          variant="outline"
          className="gap-2 h-10 sm:h-12 px-4 sm:px-6 rounded-xl order-3"
        >
          <Settings2 className="w-4 h-4" />
          Fine-tune
        </Button>
      </div>

      {/* Expand hint */}
      <div className="mt-4 sm:mt-6 text-center">
        <button
          onClick={onFineTune}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Advanced timeline editor</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
};

export default SimplePreview;
