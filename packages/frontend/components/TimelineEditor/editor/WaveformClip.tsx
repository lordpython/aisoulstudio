"use client";

import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AudioClip } from "@/types/audio-editor";

interface WaveformClipProps {
  clip: AudioClip;
  type: "narrator" | "sfx";
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: () => void;
}

export function WaveformClip({
  clip,
  type,
  pixelsPerSecond,
  isSelected,
  onSelect,
}: WaveformClipProps) {
  const width = clip.duration * pixelsPerSecond;
  const left = clip.startTime * pixelsPerSecond;

  return (
    <div
      className={cn(
        "absolute flex h-10 cursor-pointer items-center rounded-md transition-all",
        type === "narrator"
          ? "bg-narrator-waveform/20 hover:bg-narrator-waveform/30"
          : "bg-sfx-waveform/20 hover:bg-sfx-waveform/30",
        isSelected && "ring-2 ring-primary ring-offset-1"
      )}
      style={{ left, width }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Audio clip, ${clip.duration.toFixed(1)} seconds`}
      aria-selected={isSelected}
    >
      {/* Waveform visualization */}
      <div className="flex h-full flex-1 items-center gap-px px-2">
        {clip.waveformData.map((amplitude, index) => (
          <div
            key={index}
            className={cn(
              "w-0.5 rounded-full",
              type === "narrator" ? "bg-narrator-waveform" : "bg-sfx-waveform"
            )}
            style={{ height: `${amplitude * 100}%` }}
          />
        ))}
      </div>

      {/* Resize handle */}
      <div className="absolute right-1 top-1">
        <Maximize2 className="h-3 w-3 rotate-90 text-muted-foreground/50" />
      </div>
    </div>
  );
}
