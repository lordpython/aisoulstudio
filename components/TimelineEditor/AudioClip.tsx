/**
 * AudioClip Component
 * 
 * Renders an audio clip in the Graphite Timeline with:
 * - Waveform visualization with vertical bars
 * - Cyan coloring consistent with plasma theme
 * - Clip title and duration display
 * 
 * Requirements: 5.5, 6.1, 6.2, 6.3
 */

import { useMemo } from "react";
import { TimelineClip } from "./graphite-timeline-utils";
import "./graphite-timeline.css";

// --- Types ---

export interface AudioClipProps {
  /** Clip data containing id, name, duration, etc. */
  clip: TimelineClip;
  /** Current zoom level (pixels per second) */
  zoom: number;
  /** Whether this clip is currently selected */
  isSelected: boolean;
  /** Callback when clip is clicked */
  onClick: () => void;
  /** Optional left position override (otherwise calculated from startTime * zoom) */
  left?: number;
  /** Number of waveform bars to generate (default: calculated from width) */
  waveformBars?: number;
  /** Optional amplitude data for waveform (values 0-1) */
  amplitudeData?: number[];
}

// --- Helper Functions ---

/**
 * Formats duration in seconds to a display string (e.g., "4.2s")
 */
function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

/**
 * Generates pseudo-random waveform bar heights.
 * Uses a seeded approach based on clip ID for consistency.
 * 
 * @param count - Number of bars to generate
 * @param seed - Seed string for consistent randomization
 * @returns Array of heights (5-35 pixels)
 */
function generateWaveformHeights(count: number, seed: string): number[] {
  const heights: number[] = [];
  let hash = 0;
  
  // Simple hash from seed string
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  for (let i = 0; i < count; i++) {
    // Pseudo-random based on hash and index
    const pseudoRandom = Math.abs(Math.sin(hash + i * 0.1)) * 0.8 + 0.2;
    // Height between 5 and 35 pixels
    heights.push(5 + pseudoRandom * 30);
  }
  
  return heights;
}

/**
 * Calculates the number of waveform bars based on clip width.
 * Aims for approximately 1 bar every 4-5 pixels.
 */
function calculateBarCount(width: number): number {
  return Math.max(10, Math.floor(width / 5));
}

// --- Component ---

export function AudioClip({
  clip,
  zoom,
  isSelected,
  onClick,
  left,
  waveformBars,
  amplitudeData,
}: AudioClipProps) {
  // Calculate width based on duration and zoom level
  const width = clip.duration * zoom;
  
  // Calculate left position from startTime if not provided
  const leftPosition = left ?? clip.startTime * zoom;

  // Calculate number of bars
  const barCount = waveformBars ?? calculateBarCount(width);

  // Generate or use provided waveform heights
  const waveformHeights = useMemo(() => {
    if (amplitudeData && amplitudeData.length > 0) {
      // Use provided amplitude data, scale to pixel heights
      return amplitudeData.map(amp => 5 + amp * 30);
    }
    // Generate pseudo-random heights based on clip ID
    return generateWaveformHeights(barCount, clip.id);
  }, [amplitudeData, barCount, clip.id]);

  // Build class names for hover/selected states
  const classNames = [
    "graphite-clip",
    "graphite-audio-clip",
    isSelected ? "selected" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classNames}
      style={{
        left: `${leftPosition}px`,
        width: `${width}px`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      role="button"
      tabIndex={0}
      aria-label={`Audio clip: ${clip.name}`}
      aria-selected={isSelected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Waveform Visualization - Requirements 6.1, 6.2, 6.3 */}
      <div className="graphite-audio-wave" aria-hidden="true">
        {waveformHeights.map((height, index) => (
          <div
            key={index}
            className="graphite-wave-bar"
            style={{ height: `${height}px` }}
          />
        ))}
      </div>

      {/* Clip Info - Requirement 5.5 */}
      <div className="graphite-clip-info">
        <span className="graphite-clip-title" title={clip.name}>
          {clip.name}
        </span>
        <span className="graphite-clip-duration">
          {formatDuration(clip.duration)}
        </span>
      </div>
    </div>
  );
}

export default AudioClip;
