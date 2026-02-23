"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Play, Pause, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaFile, SubtitleCue } from "@/types/audio-editor";

interface VideoPreviewProps {
  video?: MediaFile | null;
  currentTime?: number;
  isPlaying?: boolean;
  subtitles?: SubtitleCue[];
  onTimeUpdate?: (time: number) => void;
  onPlayPause?: () => void;
}

export function VideoPreview({
  video,
  currentTime = 0,
  isPlaying = false,
  subtitles = [],
  onTimeUpdate,
  onPlayPause,
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>("");

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;

    if (isPlaying) {
      const playVideoSafe = async () => {
        try {
          if (el.readyState >= 3) {
            await el.play();
          } else {
            el.oncanplay = async () => {
              try { await el.play(); } catch (err) {
                if (err instanceof Error && err.name !== 'AbortError') {
                  console.error("Playback failed on canplay", err);
                }
              }
            };
          }
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            console.error("Playback failed", err);
          }
        }
      };
      playVideoSafe();
    } else {
      el.pause();
    }
  }, [isPlaying, video]);

  useEffect(() => {
    const activeCue = subtitles.find(
      (cue) => currentTime >= cue.startTime && currentTime <= cue.endTime
    );
    setCurrentSubtitle(activeCue?.text || "");
  }, [currentTime, subtitles]);

  const handleTimeUpdate = () => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  };

  return (
    <div className="relative flex flex-1 items-center justify-center bg-muted/30 p-4">
      {/* Zoom/Search button */}
      <Button
        variant="secondary"
        size="icon"
        className="absolute left-4 top-4 z-10 h-8 w-8 rounded-full bg-card/80 backdrop-blur-sm"
        aria-label="Zoom preview"
      >
        <Search className="h-4 w-4" />
      </Button>

      {/* Video preview container */}
      <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-lg shadow-lg bg-black">
        {video ? (
          <>
            <video
              ref={videoRef}
              src={video.url}
              className="h-full w-full object-contain"
              onTimeUpdate={handleTimeUpdate}
              playsInline
            />
            {/* Play/Pause overlay button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 hover:opacity-100 focus:opacity-100"
              onClick={onPlayPause}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-8 w-8" />
              ) : (
                <Play className="h-8 w-8 ml-1" />
              )}
            </Button>
          </>
        ) : (
          // Default placeholder image
          <div className="h-full w-full flex items-center justify-center bg-muted/50">
            <span className="text-muted-foreground text-sm">
              No video loaded
            </span>
          </div>
        )}

        {/* Subtitle overlay */}
        {currentSubtitle && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 max-w-[80%]">
            <p className="rounded bg-black/75 px-4 py-2 text-center text-sm font-medium text-white md:text-base">
              {currentSubtitle}
            </p>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        {/* Fullscreen button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute bottom-4 right-4 h-8 w-8 rounded bg-black/50 text-white hover:bg-black/70"
          aria-label="Fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
