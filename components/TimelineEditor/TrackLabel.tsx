/**
 * TrackLabel Component
 * 
 * Renders a track label in the left sidebar of the Graphite Timeline.
 * Displays the track name with uppercase styling and graphite background.
 * 
 * Requirements: 4.2
 */

import "./graphite-timeline.css";

// --- Types ---

export interface TrackLabelProps {
  /** Track name to display */
  name: string;
  /** Optional height override (default: uses CSS variable --graphite-track-height) */
  height?: number;
  /** Optional additional CSS class */
  className?: string;
}

// --- Component ---

export function TrackLabel({
  name,
  height,
  className = "",
}: TrackLabelProps) {
  const classNames = [
    "graphite-label-block",
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classNames}
      style={height ? { height: `${height}px` } : undefined}
      role="rowheader"
      aria-label={`Track: ${name}`}
    >
      <span>{name}</span>
    </div>
  );
}

export default TrackLabel;
