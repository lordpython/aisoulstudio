/**
 * TransportBar Component
 * 
 * Header section of the Graphite Timeline containing:
 * - Playback controls (play/pause, skip back, skip forward)
 * - Timecode display with cyan glow styling
 * - Project name display
 * - Add button placeholder
 * 
 * Accessibility Features:
 * - Keyboard shortcut hints in tooltips
 * - ARIA labels for all interactive elements
 * - aria-pressed for toggle states
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 + Accessibility
 */

import React from "react";
import { formatTimecode } from "./graphite-timeline-utils";
import "./graphite-timeline.css";

// --- SVG Icons ---

const SkipBackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
  </svg>
);

const PlayIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const SkipForwardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
);

const AddIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

// --- Types ---

export interface TransportBarProps {
  /** Current playback time in seconds */
  currentTime: number;
  /** Whether playback is currently active */
  isPlaying: boolean;
  /** Project name to display in header */
  projectName?: string;
  /** Callback when play/pause button is clicked */
  onPlayPause: () => void;
  /** Callback when skip back button is clicked */
  onSkipBack: () => void;
  /** Callback when skip forward button is clicked */
  onSkipForward: () => void;
  /** Callback when add button is clicked (optional) */
  onAdd?: () => void;
  /** Frames per second for timecode display (default: 24) */
  fps?: number;
}

// --- Component ---

export function TransportBar({
  currentTime,
  isPlaying,
  projectName = "UNTITLED",
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onAdd,
  fps = 24,
}: TransportBarProps) {
  return (
    <header className="graphite-transport-bar" role="toolbar" aria-label="Playback controls">
      {/* Playback Controls - Requirements 2.1, 2.4, 2.5 */}
      <div className="graphite-transport-btns" role="group" aria-label="Transport controls">
        <button
          className="graphite-btn"
          onClick={onSkipBack}
          aria-label="Skip backward 5 seconds (J or Left Arrow)"
          title="Skip backward 5 seconds (J or ←)"
          type="button"
        >
          <SkipBackIcon />
        </button>
        
        <button
          className="graphite-btn primary"
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause (Space or K)" : "Play (Space or K)"}
          aria-pressed={isPlaying}
          title={isPlaying ? "Pause (Space or K)" : "Play (Space or K)"}
          type="button"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        
        <button
          className="graphite-btn"
          onClick={onSkipForward}
          aria-label="Skip forward 5 seconds (L or Right Arrow)"
          title="Skip forward 5 seconds (L or →)"
          type="button"
        >
          <SkipForwardIcon />
        </button>
      </div>

      {/* Timecode Display - Requirement 2.2 */}
      <div 
        className="graphite-timecode-display"
        role="timer"
        aria-label={`Current time: ${formatTimecode(currentTime, fps)}`}
        aria-live="off"
      >
        {formatTimecode(currentTime, fps)}
      </div>

      {/* Project Info - Requirements 2.3, 2.6 */}
      <div className="graphite-project-info">
        <span className="graphite-project-name" aria-label={`Project name: ${projectName}`}>
          PROJECT: {projectName.toUpperCase()}
        </span>
        
        <button
          className="graphite-btn"
          onClick={onAdd}
          aria-label="Add new clip or media"
          title="Add new clip or media"
          type="button"
        >
          <AddIcon />
        </button>
      </div>
    </header>
  );
}

export default TransportBar;
