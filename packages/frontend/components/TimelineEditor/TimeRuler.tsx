/**
 * TimeRuler Component
 * 
 * Renders the time scale ruler at the top of the Graphite Timeline.
 * Features:
 * - Major and minor tick marks based on zoom level (Requirements 3.1, 3.2)
 * - Timecode labels at major ticks (Requirement 3.3)
 * - Zoom-responsive tick intervals (Requirement 3.4)
 * - Horizontal scroll synchronization with track lanes (Requirements 3.5, 11.2)
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 11.2
 */

import React, { forwardRef, useMemo } from "react";
import { getTickInterval } from "./graphite-timeline-utils";
import "./graphite-timeline.css";

// --- Types ---

export interface TimeRulerProps {
  /** Total duration in seconds */
  duration: number;
  /** Current zoom level (pixels per second) */
  zoom: number;
  /** Horizontal scroll offset in pixels (for positioning) - used for sync tracking */
  scrollLeft?: number;
  /** Frames per second for timecode display (default: 24) */
  fps?: number;
  /** Optional additional CSS class */
  className?: string;
}

// --- Helper Functions ---

/**
 * Formats time for ruler labels (shorter format than full timecode).
 * Shows MM:SS for times under an hour, HH:MM:SS for longer.
 * 
 * @param seconds - Time value in seconds
 * @returns Formatted time string
 */
export function formatRulerLabel(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Generates tick positions for the ruler based on duration and zoom level.
 * Uses getTickInterval to determine appropriate spacing based on zoom.
 * 
 * @param duration - Total duration in seconds
 * @param zoom - Current zoom level (pixels per second)
 * @returns Object containing arrays of major and minor tick positions
 */
export function generateTicks(
  duration: number,
  zoom: number
): { majorTicks: number[]; minorTicks: number[] } {
  const { major, minor } = getTickInterval(zoom);
  
  const majorTicks: number[] = [];
  const minorTicks: number[] = [];
  
  // Generate major ticks at configurable intervals (Requirement 3.1)
  for (let t = 0; t <= duration; t += major) {
    // Round to avoid floating point precision issues
    majorTicks.push(Math.round(t * 1000) / 1000);
  }
  
  // Generate minor ticks between major ticks for finer granularity (Requirement 3.2)
  for (let t = 0; t <= duration; t += minor) {
    const roundedT = Math.round(t * 1000) / 1000;
    // Check if this is not a major tick position (with small epsilon for floating point)
    const isMajorTick = majorTicks.some(mt => Math.abs(mt - roundedT) < 0.001);
    if (!isMajorTick) {
      minorTicks.push(roundedT);
    }
  }
  
  return { majorTicks, minorTicks };
}

// --- Component ---

/**
 * TimeRuler component with forwardRef for scroll synchronization.
 * 
 * The ref is used by useTimelineScroll to sync ruler scroll with track lanes.
 * When the track lanes scroll, the ruler's scrollLeft is updated to match,
 * ensuring the time scale stays aligned with the clips below.
 * 
 * Scroll synchronization (Requirements 3.5, 11.2):
 * - The ruler container has overflow-x: auto (hidden scrollbar via CSS)
 * - The inner container width matches the total timeline width
 * - The useTimelineScroll hook syncs scrollLeft between ruler and track lanes
 */
export const TimeRuler = forwardRef<HTMLDivElement, TimeRulerProps>(
  function TimeRuler(
    {
      duration,
      zoom,
      scrollLeft = 0,
      fps = 24,
      className = "",
    },
    ref
  ) {
    // Calculate total width based on duration and zoom
    const totalWidth = Math.max(duration * zoom, 800);
    
    // Generate tick positions - memoized for performance
    const { majorTicks, minorTicks } = useMemo(
      () => generateTicks(duration, zoom),
      [duration, zoom]
    );
    
    const classNames = [
      "graphite-ruler",
      className,
    ].filter(Boolean).join(" ");

    return (
      <div
        ref={ref}
        className={classNames}
        role="presentation"
        aria-label="Time ruler"
        style={{ minHeight: '35px' }}
      >
        {/* Inner container with full width for scrolling */}
        <div
          className="graphite-ruler-inner"
          style={{
            width: `${totalWidth}px`,
            minWidth: "100%",
            height: "100%",
            position: "relative",
          }}
        >
          {/* Minor ticks - smaller marks between major ticks (Requirement 3.2) */}
          {minorTicks.map((t) => (
            <div
              key={`minor-${t}`}
              className="graphite-ruler-mark"
              style={{ left: `${t * zoom}px` }}
              data-time={t}
            />
          ))}
          
          {/* Major ticks with timecode labels (Requirements 3.1, 3.3) */}
          {majorTicks.map((t) => (
            <React.Fragment key={`major-${t}`}>
              <div
                className="graphite-ruler-mark major"
                style={{ left: `${t * zoom}px` }}
                data-time={t}
              />
              <span
                className="graphite-ruler-label"
                style={{ left: `${t * zoom + 4}px` }}
              >
                {formatRulerLabel(t)}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
);

export default TimeRuler;
