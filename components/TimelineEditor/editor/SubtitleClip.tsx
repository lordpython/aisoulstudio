"use client";

import type { SubtitleCue } from "@/types/audio-editor";
import { cn } from "@/lib/utils";

interface SubtitleClipProps {
  cue: SubtitleCue;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: () => void;
}

export function SubtitleClip({
  cue,
  pixelsPerSecond,
  isSelected,
  onSelect,
}: SubtitleClipProps) {
  const width = (cue.endTime - cue.startTime) * pixelsPerSecond;
  const left = cue.startTime * pixelsPerSecond;

  return (
    <div
      className={cn(
        "absolute top-1/2 -translate-y-1/2 h-8 rounded-md cursor-pointer transition-all overflow-hidden",
        "bg-emerald-500/20 border border-emerald-500/40",
        isSelected &&
          "ring-2 ring-emerald-500 ring-offset-1 ring-offset-background"
      )}
      style={{ left, width: Math.max(width, 20) }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      role="button"
      tabIndex={0}
      aria-label={`Subtitle: ${cue.text}`}
      aria-selected={isSelected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex h-full items-center px-2">
        <span className="text-[10px] text-emerald-700 dark:text-emerald-300 truncate font-medium">
          {cue.text}
        </span>
      </div>
      {/* Resize handles */}
      {isSelected && (
        <>
          <div className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-emerald-500/50 hover:bg-emerald-500" />
          <div className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-emerald-500/50 hover:bg-emerald-500" />
        </>
      )}
    </div>
  );
}
