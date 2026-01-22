/**
 * TrackLane Component
 * 
 * Renders a single track lane in the Graphite Timeline containing clips.
 * Supports different track types (video, audio, fx) with type-specific styling.
 * Handles clip selection via click events.
 * Supports click-to-seek and drag-to-scrub for playhead positioning.
 * 
 * Requirements: 4.5, 10.1, 7.3, 7.4
 */

import React from "react";
import { TimelineTrack, TimelineClip } from "./graphite-timeline-utils";
import { GraphiteClip } from "./GraphiteClip";
import { AudioClip } from "./AudioClip";
import "./graphite-timeline.css";

// --- Types ---

export interface TrackLaneProps {
  /** Track data containing clips and metadata */
  track: TimelineTrack;
  /** Current zoom level (pixels per second) */
  zoom: number;
  /** Horizontal scroll offset in pixels */
  scrollLeft: number;
  /** ID of the currently selected clip (null if none) */
  selectedClipId: string | null;
  /** Callback when a clip is clicked */
  onClipSelect: (clipId: string) => void;
  /** Callback when clicking on empty lane area (to deselect) */
  onLaneClick?: () => void;
  /** Callback for click-to-seek (Requirement 7.3) */
  onSeekClick?: (e: React.MouseEvent) => void;
  /** Callback for drag-to-scrub mousedown (Requirement 7.4) */
  onSeekMouseDown?: (e: React.MouseEvent) => void;
  /** Optional height override */
  height?: number;
  /** Optional additional CSS class */
  className?: string;
}

// --- Helper Functions ---

/**
 * Gets the CSS class modifier for track type-specific background colors.
 * Requirement 4.5: Visually distinguish track types using different background colors.
 */
function getTrackTypeClass(type: TimelineTrack["type"]): string {
  switch (type) {
    case "video":
      return "graphite-lane--video";
    case "audio":
      return "graphite-lane--audio";
    case "fx":
      return "graphite-lane--fx";
    case "music":
      return "graphite-lane--music";
    default:
      return "";
  }
}

/**
 * Renders the appropriate clip component based on track type.
 */
function renderClip(
  clip: TimelineClip,
  trackType: TimelineTrack["type"],
  zoom: number,
  isSelected: boolean,
  onSelect: () => void
) {
  if (trackType === "audio" || trackType === "fx" || trackType === "music") {
    return (
      <AudioClip
        key={clip.id}
        clip={clip}
        zoom={zoom}
        isSelected={isSelected}
        onClick={onSelect}
      />
    );
  }

  return (
    <GraphiteClip
      key={clip.id}
      clip={clip}
      zoom={zoom}
      isSelected={isSelected}
      onClick={onSelect}
    />
  );
}

// --- Component ---

export function TrackLane({
  track,
  zoom,
  scrollLeft,
  selectedClipId,
  onClipSelect,
  onLaneClick,
  onSeekClick,
  onSeekMouseDown,
  height,
  className = "",
}: TrackLaneProps) {
  const trackTypeClass = getTrackTypeClass(track.type);

  const classNames = [
    "graphite-lane",
    trackTypeClass,
    className,
  ].filter(Boolean).join(" ");

  // Handle click on lane area
  // Supports both deselection and click-to-seek (Requirement 7.3)
  const handleLaneClick = (e: React.MouseEvent) => {
    // Only trigger if clicking directly on the lane, not on a clip
    if ((e.target as HTMLElement).closest(".graphite-clip")) {
      return;
    }

    // Call deselect handler
    if (onLaneClick) {
      onLaneClick();
    }

    // Call seek handler for click-to-seek
    if (onSeekClick) {
      onSeekClick(e);
    }
  };

  // Handle mousedown for drag-to-scrub (Requirement 7.4)
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only trigger if clicking directly on the lane, not on a clip
    if ((e.target as HTMLElement).closest(".graphite-clip")) {
      return;
    }

    if (onSeekMouseDown) {
      onSeekMouseDown(e);
    }
  };

  return (
    <div
      className={classNames}
      style={height ? { height: `${height}px` } : undefined}
      onClick={handleLaneClick}
      onMouseDown={handleMouseDown}
      role="row"
      aria-label={`${track.name} track lane`}
    >
      {track.clips.map((clip) =>
        renderClip(
          clip,
          track.type,
          zoom,
          clip.id === selectedClipId,
          () => onClipSelect(clip.id)
        )
      )}
    </div>
  );
}

export default TrackLane;
