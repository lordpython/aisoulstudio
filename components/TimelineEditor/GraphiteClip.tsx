/**
 * GraphiteClip Component
 * 
 * Renders a video clip in the Graphite Timeline with:
 * - Thumbnail with luminosity blend mode
 * - Clip title (uppercase, truncated)
 * - Duration badge
 * - Hover and selected states with plasma glow
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 1.4, 1.5
 */

import { TimelineClip } from "./graphite-timeline-utils";
import "./graphite-timeline.css";

// --- Types ---

export interface GraphiteClipProps {
  /** Clip data containing id, name, duration, thumbnail, etc. */
  clip: TimelineClip;
  /** Current zoom level (pixels per second) */
  zoom: number;
  /** Whether this clip is currently selected */
  isSelected: boolean;
  /** Callback when clip is clicked */
  onClick: () => void;
  /** Optional left position override (otherwise calculated from startTime * zoom) */
  left?: number;
}

// --- Helper Functions ---

/**
 * Formats duration in seconds to a display string (e.g., "4.2s")
 */
function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

// --- Component ---

export function GraphiteClip({
  clip,
  zoom,
  isSelected,
  onClick,
  left,
}: GraphiteClipProps) {
  // Calculate width based on duration and zoom level
  const width = clip.duration * zoom;
  
  // Calculate left position from startTime if not provided
  const leftPosition = left ?? clip.startTime * zoom;

  // Build class names for hover/selected states
  const classNames = [
    "graphite-clip",
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
      aria-label={`Clip: ${clip.name}`}
      aria-selected={isSelected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Thumbnail with luminosity blend mode - Requirements 5.1, 5.4, 5.6 */}
      <div
        className="graphite-clip-thumb"
        style={{
          backgroundImage: clip.thumbnail ? `url(${clip.thumbnail})` : undefined,
          backgroundColor: clip.thumbnail ? undefined : "var(--graphite-mid)",
        }}
        aria-hidden="true"
      />

      {/* Clip Info - Requirements 5.2, 5.3 */}
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

export default GraphiteClip;
