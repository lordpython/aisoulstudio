"use client";

import { cn } from "@/lib/utils";
import type { VideoClip } from "@/types/audio-editor";

interface VideoClipProps {
  clip: VideoClip;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Format duration in seconds to a human-readable string.
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins} minute${mins !== 1 ? "s" : ""} ${secs} second${secs !== 1 ? "s" : ""}`;
  }
  return `${secs} second${secs !== 1 ? "s" : ""}`;
}

export function VideoClipComponent({
  clip,
  pixelsPerSecond,
  isSelected,
  onSelect,
}: VideoClipProps) {
  const width = clip.duration * pixelsPerSecond;
  const left = clip.startTime * pixelsPerSecond;

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 cursor-pointer rounded-md overflow-hidden transition-all",
        "bg-violet-500/20 border-2",
        isSelected
          ? "border-violet-500 ring-2 ring-violet-500/30"
          : "border-violet-500/50 hover:border-violet-500/70"
      )}
      style={{ left, width, minWidth: 60 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      role="button"
      tabIndex={0}
      aria-label={`Video clip: ${clip.name}, duration ${formatDuration(clip.duration)}`}
      aria-selected={isSelected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Thumbnail strip */}
      <div className="flex h-full">
        {Array.from({ length: Math.max(1, Math.floor(width / 50)) }).map(
          (_, i) => (
            <div
              key={i}
              className="h-full w-[50px] shrink-0 bg-cover bg-center border-r border-violet-500/30 last:border-r-0"
              style={{
                backgroundImage: `url(${clip.thumbnailUrl || "/video-frame.png"})`,
              }}
            />
          )
        )}
      </div>

      {/* Clip name overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
        <span className="text-[10px] font-medium text-white truncate block">
          {clip.name}
        </span>
      </div>

      {/* Resize handles when selected */}
      {isSelected && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-violet-500 hover:bg-violet-400" />
          <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-violet-500 hover:bg-violet-400" />
        </>
      )}
    </div>
  );
}
