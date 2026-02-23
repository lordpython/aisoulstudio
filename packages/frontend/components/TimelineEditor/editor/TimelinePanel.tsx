"use client";

import type React from "react";

import { useRef, useCallback } from "react";
import { Settings, Lock, Type, Video, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WaveformClip } from "./WaveformClip";
import { SubtitleClip } from "./SubtitleClip";
import { VideoClipComponent } from "./VideoClipComponent";
import { ImageClipComponent } from "./ImageClipComponent";
import type {
  Track,
  AudioClip,
  SubtitleCue,
  VideoClip,
  ImageClip,
} from "@/types/audio-editor";

interface TimelinePanelProps {
  tracks: Track[];
  clips: AudioClip[];
  subtitles: SubtitleCue[];
  videoClips: VideoClip[];
  imageClips: ImageClip[];
  currentTime: number;
  zoom: number;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onSeek: (time: number) => void;
}

export function TimelinePanel({
  tracks,
  clips,
  subtitles,
  videoClips,
  imageClips,
  currentTime,
  zoom,
  selectedClipId,
  onSelectClip,
  onSeek,
}: TimelinePanelProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const duration = 60;
  const pixelsPerSecond = (zoom / 100) * 20 + 10;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - 140;
      const time = Math.max(0, Math.min(duration, x / pixelsPerSecond));
      onSeek(time);
    },
    [pixelsPerSecond, duration, onSeek]
  );

  const narratorTracks = tracks.filter((t) => t.type === "narrator");
  const sfxTracks = tracks.filter((t) => t.type === "sfx");

  const narratorClips = clips.filter((c) =>
    narratorTracks.some((t) => t.id === c.trackId)
  );
  const sfxClips = clips.filter((c) => sfxTracks.some((t) => t.id === c.trackId));

  const markers = [];
  for (let i = 0; i <= duration; i += 5) {
    markers.push(i);
  }

  return (
    <div
      ref={timelineRef}
      className="relative overflow-x-auto bg-timeline-bg"
      onClick={handleTimelineClick}
    >
      {/* Time ruler */}
      <div className="sticky top-0 z-10 flex h-8 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="w-[140px] shrink-0" />
        <div className="relative flex-1">
          {markers.map((time) => (
            <div
              key={time}
              className="absolute top-0 flex h-full flex-col items-center justify-end"
              style={{ left: time * pixelsPerSecond }}
            >
              <span className="mb-1 text-[10px] text-muted-foreground">
                {formatTime(time)}
              </span>
              <div className="h-2 w-px bg-border" />
            </div>
          ))}
        </div>
      </div>

      {/* Playhead */}
      <div
        className="absolute bottom-0 top-8 z-20 w-px bg-foreground"
        style={{ left: 140 + currentTime * pixelsPerSecond }}
      >
        <div className="absolute -left-1.5 -top-1 h-3 w-3 rounded-full bg-foreground" />
      </div>

      {/* Video Track */}
      <div className="flex min-h-[70px] border-b border-border">
        <div className="flex w-[140px] shrink-0 items-center gap-2 border-r border-border bg-card px-3">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-violet-500" />
            <div className="flex flex-col">
              <span className="text-xs font-medium">Video Track</span>
              <span className="text-[10px] text-muted-foreground">
                {videoClips.length} clip{videoClips.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Lock className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1 py-1 bg-violet-500/5">
          {videoClips.map((clip) => (
            <VideoClipComponent
              key={clip.id}
              clip={clip}
              pixelsPerSecond={pixelsPerSecond}
              isSelected={clip.id === selectedClipId}
              onSelect={() => onSelectClip(clip.id)}
            />
          ))}
          {videoClips.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
              Import video to add clips
            </div>
          )}
        </div>
      </div>

      {/* Image Track */}
      <div className="flex min-h-[60px] border-b border-border">
        <div className="flex w-[140px] shrink-0 items-center gap-2 border-r border-border bg-card px-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-amber-500" />
            <div className="flex flex-col">
              <span className="text-xs font-medium">Image Track</span>
              <span className="text-[10px] text-muted-foreground">
                {imageClips.length} image{imageClips.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Lock className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1 py-1 bg-amber-500/5">
          {imageClips.map((clip) => (
            <ImageClipComponent
              key={clip.id}
              clip={clip}
              pixelsPerSecond={pixelsPerSecond}
              isSelected={clip.id === selectedClipId}
              onSelect={() => onSelectClip(clip.id)}
            />
          ))}
          {imageClips.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
              Import images to add clips
            </div>
          )}
        </div>
      </div>

      {/* Narrator track row */}
      <div className="flex min-h-[60px] border-b border-border">
        <div className="flex w-[140px] shrink-0 items-center gap-2 border-r border-border bg-card px-3">
          <div className="flex flex-col">
            <span className="text-xs font-medium">Primary Narrator</span>
            <span className="text-[10px] text-muted-foreground">
              Narration Track - Original
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Settings className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Lock className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1 py-2">
          {narratorClips.map((clip) => (
            <WaveformClip
              key={clip.id}
              clip={clip}
              type="narrator"
              pixelsPerSecond={pixelsPerSecond}
              isSelected={clip.id === selectedClipId}
              onSelect={() => onSelectClip(clip.id)}
            />
          ))}
        </div>
      </div>

      {/* SFX track row */}
      <div className="flex min-h-[60px] border-b border-border">
        <div className="flex w-[140px] shrink-0 items-center gap-2 border-r border-border bg-card px-3">
          <div className="flex flex-col">
            <span className="text-xs font-medium">New SFX Track</span>
            <span className="text-[10px] text-muted-foreground">
              SFX Track - English
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Lock className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1 py-2">
          {sfxClips.map((clip) => (
            <WaveformClip
              key={clip.id}
              clip={clip}
              type="sfx"
              pixelsPerSecond={pixelsPerSecond}
              isSelected={clip.id === selectedClipId}
              onSelect={() => onSelectClip(clip.id)}
            />
          ))}
        </div>
      </div>

      {/* Subtitle Track */}
      <div className="flex min-h-[50px]">
        <div className="flex w-[140px] shrink-0 items-center gap-2 border-r border-border bg-card px-3">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-emerald-500" />
            <div className="flex flex-col">
              <span className="text-xs font-medium">Subtitles</span>
              <span className="text-[10px] text-muted-foreground">
                {subtitles.length} cue{subtitles.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Lock className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1 py-2 bg-emerald-500/5">
          {subtitles.map((cue) => (
            <SubtitleClip
              key={cue.id}
              cue={cue}
              pixelsPerSecond={pixelsPerSecond}
              isSelected={cue.id === selectedClipId}
              onSelect={() => onSelectClip(cue.id)}
            />
          ))}
          {subtitles.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
              Import subtitles or add manually
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
