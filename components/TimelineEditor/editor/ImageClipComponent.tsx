"use client";

import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";
import type { ImageClip } from "@/types/audio-editor";

interface ImageClipProps {
  clip: ImageClip;
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

export function ImageClipComponent({
  clip,
  pixelsPerSecond,
  isSelected,
  onSelect,
}: ImageClipProps) {
  const width = clip.duration * pixelsPerSecond;
  const left = clip.startTime * pixelsPerSecond;

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 cursor-pointer rounded-md overflow-hidden transition-all",
        "bg-amber-500/20 border-2",
        isSelected
          ? "border-amber-500 ring-2 ring-amber-500/30"
          : "border-amber-500/50 hover:border-amber-500/70"
      )}
      style={{ left, width, minWidth: 40 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      role="button"
      tabIndex={0}
      aria-label={`Image clip: ${clip.name}, duration ${formatDuration(clip.duration)}`}
      aria-selected={isSelected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Image thumbnail */}
      <div
        className="h-full w-full bg-cover bg-center"
        style={{
          backgroundImage: `url(${clip.imageUrl || "/generic-image-thumbnail.png"})`,
        }}
      />

      {/* Icon badge */}
      <div className="absolute top-1 left-1 rounded bg-amber-500 p-0.5">
        <ImageIcon className="h-2.5 w-2.5 text-white" />
      </div>

      {/* Clip name overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-0.5">
        <span className="text-[9px] font-medium text-white truncate block">
          {clip.name}
        </span>
      </div>

      {/* Resize handles when selected */}
      {isSelected && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-amber-500 hover:bg-amber-400" />
          <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-amber-500 hover:bg-amber-400" />
        </>
      )}
    </div>
  );
}
