/**
 * useTimelineScroll Hook
 * 
 * Custom hook for managing horizontal scroll state in the Graphite Timeline.
 * Handles:
 * - Tracking scrollLeft state
 * - Syncing ruler and track lanes scroll positions
 * - Auto-scroll during playback to keep playhead visible
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import { useState, useCallback, useRef, useEffect } from "react";

// --- Types ---

export interface UseTimelineScrollOptions {
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Current zoom level (pixels per second) */
  zoom: number;
  /** Whether playback is currently active */
  isPlaying: boolean;
  /** Width of the track labels sidebar in pixels */
  labelsWidth?: number;
  /** Margin from edge before auto-scroll triggers (in pixels) */
  autoScrollMargin?: number;
}

export interface UseTimelineScrollResult {
  /** Current horizontal scroll offset in pixels */
  scrollLeft: number;
  /** Ref to attach to the scrollable track lanes container */
  trackLanesRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to attach to the ruler container (for sync) */
  rulerRef: React.RefObject<HTMLDivElement | null>;
  /** Handler for scroll events on track lanes */
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  /** Programmatically set scroll position */
  setScrollLeft: (value: number) => void;
  /** Calculate visible time range based on current scroll and container width */
  getVisibleRange: () => { start: number; end: number };
  /** Scroll to make a specific time visible */
  scrollToTime: (time: number) => void;
}

// --- Constants ---

const DEFAULT_LABELS_WIDTH = 140;
const DEFAULT_AUTO_SCROLL_MARGIN = 100;

// --- Hook Implementation ---

/**
 * Custom hook for managing timeline horizontal scroll state.
 * 
 * Features:
 * - Tracks scrollLeft state for positioning playhead and clips
 * - Syncs ruler scroll with track lanes (Requirement 11.2)
 * - Auto-scrolls during playback to keep playhead visible (Requirement 11.4)
 * - Provides refs for attaching to scrollable containers
 * 
 * @param options - Configuration options
 * @returns Scroll state and handlers
 */
export function useTimelineScroll({
  currentTime,
  duration,
  zoom,
  isPlaying,
  labelsWidth = DEFAULT_LABELS_WIDTH,
  autoScrollMargin = DEFAULT_AUTO_SCROLL_MARGIN,
}: UseTimelineScrollOptions): UseTimelineScrollResult {
  // Scroll state
  const [scrollLeft, setScrollLeftState] = useState(0);
  
  // Refs for scrollable containers
  const trackLanesRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  
  // Track if we're programmatically scrolling to avoid feedback loops
  const isProgrammaticScroll = useRef(false);

  /**
   * Handle scroll events from track lanes.
   * Syncs the ruler scroll position to match.
   * Requirement 11.2: Ruler scrolls in sync with track lanes
   */
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollLeft = e.currentTarget.scrollLeft;
    setScrollLeftState(newScrollLeft);
    
    // Sync ruler scroll position (Requirement 11.2)
    if (rulerRef.current && !isProgrammaticScroll.current) {
      rulerRef.current.scrollLeft = newScrollLeft;
    }
  }, []);

  /**
   * Programmatically set scroll position.
   * Updates both track lanes and ruler.
   */
  const setScrollLeft = useCallback((value: number) => {
    const clampedValue = Math.max(0, value);
    setScrollLeftState(clampedValue);
    
    isProgrammaticScroll.current = true;
    
    if (trackLanesRef.current) {
      trackLanesRef.current.scrollLeft = clampedValue;
    }
    if (rulerRef.current) {
      rulerRef.current.scrollLeft = clampedValue;
    }
    
    // Reset flag after a tick
    requestAnimationFrame(() => {
      isProgrammaticScroll.current = false;
    });
  }, []);

  /**
   * Calculate the visible time range based on current scroll and container width.
   * Used for the project overview minimap.
   */
  const getVisibleRange = useCallback((): { start: number; end: number } => {
    if (!trackLanesRef.current) {
      return { start: 0, end: duration };
    }
    
    const containerWidth = trackLanesRef.current.clientWidth;
    const visibleStart = scrollLeft / zoom;
    const visibleEnd = (scrollLeft + containerWidth) / zoom;
    
    return {
      start: Math.max(0, visibleStart),
      end: Math.min(duration, visibleEnd),
    };
  }, [scrollLeft, zoom, duration]);

  /**
   * Scroll to make a specific time visible.
   * Centers the time in the viewport if possible.
   */
  const scrollToTime = useCallback((time: number) => {
    if (!trackLanesRef.current) return;
    
    const containerWidth = trackLanesRef.current.clientWidth;
    const targetPosition = time * zoom;
    
    // Center the time in the viewport
    const newScrollLeft = Math.max(0, targetPosition - containerWidth / 2);
    setScrollLeft(newScrollLeft);
  }, [zoom, setScrollLeft]);

  /**
   * Auto-scroll during playback to keep playhead visible.
   * Requirement 11.4: Auto-scroll when playhead approaches edge
   */
  useEffect(() => {
    if (!isPlaying || !trackLanesRef.current) return;
    
    const containerWidth = trackLanesRef.current.clientWidth;
    const playheadPosition = currentTime * zoom;
    
    // Calculate visible bounds
    const visibleStart = scrollLeft;
    const visibleEnd = scrollLeft + containerWidth;
    
    // Check if playhead is approaching the right edge
    if (playheadPosition > visibleEnd - autoScrollMargin) {
      // Scroll to keep playhead visible with margin
      const newScrollLeft = playheadPosition - containerWidth + autoScrollMargin;
      setScrollLeft(Math.max(0, newScrollLeft));
    }
    // Check if playhead is before the visible area (e.g., after seeking)
    else if (playheadPosition < visibleStart + autoScrollMargin) {
      // Scroll to show playhead with margin from left
      const newScrollLeft = playheadPosition - autoScrollMargin;
      setScrollLeft(Math.max(0, newScrollLeft));
    }
  }, [currentTime, zoom, isPlaying, scrollLeft, autoScrollMargin, setScrollLeft]);

  return {
    scrollLeft,
    trackLanesRef,
    rulerRef,
    handleScroll,
    setScrollLeft,
    getVisibleRange,
    scrollToTime,
  };
}

export default useTimelineScroll;
