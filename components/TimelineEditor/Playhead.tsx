/**
 * Playhead Component
 * 
 * Renders the current playback position indicator in the Graphite Timeline.
 * Features:
 * - Red vertical line with glow shadow
 * - Triangular handle at the top
 * - Position based on currentTime, zoom, and scrollLeft
 * - Smooth animation when clicking to seek
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.6
 */

import React, { useRef, useCallback, useState, useEffect } from "react";
import "./graphite-timeline.css";

// --- Types ---

export interface PlayheadProps {
  /** Current playback time in seconds */
  currentTime: number;
  /** Zoom level (pixels per second) */
  zoom: number;
  /** Horizontal scroll offset in pixels */
  scrollLeft: number;
  /** Height of the playhead line (typically track container height) */
  height: number;
  /** Total duration of the timeline in seconds */
  duration: number;
  /** Whether to animate position changes (for click-to-seek) */
  isAnimating?: boolean;
}

// --- Component ---

export function Playhead({
  currentTime,
  zoom,
  scrollLeft,
  height,
  duration,
  isAnimating = false,
}: PlayheadProps) {
  // Calculate the left position based on currentTime and zoom
  // The playhead position is relative to the track lanes container
  const leftPosition = currentTime * zoom - scrollLeft;

  // Build class names for animation state
  const classNames = [
    "graphite-playhead",
    isAnimating ? "animating" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classNames}
      style={{
        left: `${leftPosition}px`,
        height: `${height}px`,
      }}
      role="slider"
      aria-label="Playhead position"
      aria-valuenow={currentTime}
      aria-valuemin={0}
      aria-valuemax={duration}
    >
      {/* Triangular handle at the top - Requirement 7.1 */}
      <div className="graphite-playhead-handle" aria-hidden="true" />
    </div>
  );
}

// --- Seek Handler Hook ---

export interface UsePlayheadSeekOptions {
  /** Zoom level (pixels per second) */
  zoom: number;
  /** Horizontal scroll offset in pixels */
  scrollLeft: number;
  /** Total duration of the timeline in seconds */
  duration: number;
  /** Callback when user seeks to a new position */
  onSeek: (time: number) => void;
}

export interface UsePlayheadSeekResult {
  /** Whether the user is currently dragging */
  isDragging: boolean;
  /** Whether the playhead should animate (after click, not during drag) */
  isAnimating: boolean;
  /** Handler for mousedown events on the track lanes */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** Handler for click events on the track lanes (click-to-seek) */
  handleClick: (e: React.MouseEvent) => void;
}

/**
 * Custom hook for handling playhead seek interactions.
 * Supports both click-to-seek and drag-to-scrub functionality.
 * 
 * Requirements: 7.3, 7.4, 7.6
 */
export function usePlayheadSeek({
  zoom,
  scrollLeft,
  duration,
  onSeek,
}: UsePlayheadSeekOptions): UsePlayheadSeekResult {
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  /**
   * Calculates time from a mouse position relative to the track lanes.
   * Clamps the result to [0, duration] range.
   * Requirement 7.3: Clamp to valid range
   */
  const calculateTimeFromPosition = useCallback(
    (clientX: number, container: HTMLElement): number => {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left + scrollLeft;
      const time = x / zoom;
      // Clamp to valid range [0, duration]
      return Math.max(0, Math.min(duration, time));
    },
    [zoom, scrollLeft, duration]
  );

  /**
   * Handle click-to-seek with animation.
   * Requirement 7.3: Click to jump playhead
   * Requirement 7.6: Animate smooth transitions on click
   */
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't handle if clicking on a clip
      if ((e.target as HTMLElement).closest(".graphite-clip")) {
        return;
      }

      const container = e.currentTarget as HTMLElement;
      const time = calculateTimeFromPosition(e.clientX, container);
      
      // Enable animation for click-to-seek
      setIsAnimating(true);
      onSeek(time);
      
      // Disable animation after transition completes
      setTimeout(() => setIsAnimating(false), 200);
    },
    [calculateTimeFromPosition, onSeek]
  );

  /**
   * Handle mousedown for drag-to-scrub.
   * Requirement 7.4: Drag to scrub
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't handle if clicking on a clip
      if ((e.target as HTMLElement).closest(".graphite-clip")) {
        return;
      }

      // Only handle left mouse button
      if (e.button !== 0) return;

      const container = e.currentTarget as HTMLElement;
      containerRef.current = container;
      setIsDragging(true);
      setIsAnimating(false); // No animation during drag

      // Initial seek on mousedown
      const time = calculateTimeFromPosition(e.clientX, container);
      onSeek(time);
    },
    [calculateTimeFromPosition, onSeek]
  );

  // Handle mousemove and mouseup for drag-to-scrub
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const time = calculateTimeFromPosition(e.clientX, containerRef.current);
      onSeek(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      containerRef.current = null;
    };

    // Add listeners to document for drag outside container
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, calculateTimeFromPosition, onSeek]);

  return {
    isDragging,
    isAnimating,
    handleMouseDown,
    handleClick,
  };
}

export default Playhead;
