/**
 * FooterNav Component
 * 
 * Footer section of the Graphite Timeline containing:
 * - Zoom controls (zoom in/out buttons and slider)
 * - Project overview minimap
 * - Total duration display
 * 
 * Requirements: 8.1, 8.2, 9.1, 9.2, 9.3, 9.4
 */

import React, { useCallback, useRef } from "react";
import { formatTimecode, TimelineTrack } from "./graphite-timeline-utils";
import "./graphite-timeline.css";

// --- SVG Icons ---

const ZoomOutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const ZoomInIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

// --- Types ---

export interface FooterNavProps {
  /** Current zoom level (pixels per second) */
  zoom: number;
  /** Minimum zoom level */
  minZoom: number;
  /** Maximum zoom level */
  maxZoom: number;
  /** Total project duration in seconds */
  duration: number;
  /** Start time of visible region in seconds */
  visibleStart: number;
  /** End time of visible region in seconds */
  visibleEnd: number;
  /** Callback when zoom level changes */
  onZoomChange: (zoom: number) => void;
  /** Timeline tracks for minimap display */
  tracks?: TimelineTrack[];
  /** Frames per second for duration display (default: 24) */
  fps?: number;
}

// --- Sub-Components ---

/**
 * ZoomControls - Zoom in/out buttons with slider
 * Requirements: 8.1, 8.2
 */
interface ZoomControlsProps {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
}

function ZoomControls({ zoom, minZoom, maxZoom, onZoomChange }: ZoomControlsProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  
  // Calculate slider handle position (0-100%)
  const handlePosition = ((zoom - minZoom) / (maxZoom - minZoom)) * 100;
  
  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(minZoom, zoom - 10);
    onZoomChange(newZoom);
  }, [zoom, minZoom, onZoomChange]);
  
  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(maxZoom, zoom + 10);
    onZoomChange(newZoom);
  }, [zoom, maxZoom, onZoomChange]);
  
  const handleSliderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newZoom = minZoom + percentage * (maxZoom - minZoom);
    onZoomChange(newZoom);
  }, [minZoom, maxZoom, onZoomChange]);
  
  const handleSliderDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1 || !sliderRef.current) return;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const dragX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, dragX / rect.width));
    const newZoom = minZoom + percentage * (maxZoom - minZoom);
    onZoomChange(newZoom);
  }, [minZoom, maxZoom, onZoomChange]);
  
  return (
    <div className="graphite-zoom-controls">
      <button
        className="graphite-btn graphite-btn-small"
        onClick={handleZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
        disabled={zoom <= minZoom}
      >
        <ZoomOutIcon />
      </button>
      
      <div
        ref={sliderRef}
        className="graphite-zoom-slider"
        onClick={handleSliderClick}
        onMouseMove={handleSliderDrag}
        role="slider"
        aria-label="Zoom level"
        aria-valuemin={minZoom}
        aria-valuemax={maxZoom}
        aria-valuenow={zoom}
        tabIndex={0}
      >
        <div
          className="graphite-zoom-handle"
          style={{ left: `calc(${handlePosition}% - 7px)` }}
        />
      </div>
      
      <button
        className="graphite-btn graphite-btn-small"
        onClick={handleZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= maxZoom}
      >
        <ZoomInIcon />
      </button>
    </div>
  );
}

/**
 * ProjectOverview - Minimap showing all clips and visible region
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
interface ProjectOverviewProps {
  tracks: TimelineTrack[];
  duration: number;
  visibleStart: number;
  visibleEnd: number;
}

function ProjectOverview({ tracks, duration, visibleStart, visibleEnd }: ProjectOverviewProps) {
  // Don't render if no duration
  if (duration <= 0) {
    return <div className="graphite-project-overview" />;
  }
  
  // Calculate visible region position and width as percentages
  const visibleLeft = (visibleStart / duration) * 100;
  const visibleWidth = ((visibleEnd - visibleStart) / duration) * 100;
  
  // Flatten all clips from all tracks for minimap display
  const allClips = tracks.flatMap(track => 
    track.clips.map(clip => ({
      ...clip,
      trackType: track.type,
    }))
  );
  
  return (
    <div className="graphite-project-overview" aria-label="Project overview minimap">
      {/* Render mini clips */}
      {allClips.map(clip => {
        const clipLeft = (clip.startTime / duration) * 100;
        const clipWidth = (clip.duration / duration) * 100;
        
        return (
          <div
            key={clip.id}
            className={`graphite-mini-clip graphite-mini-clip--${clip.trackType}`}
            style={{
              left: `${clipLeft}%`,
              width: `${Math.max(clipWidth, 0.5)}%`, // Minimum width for visibility
            }}
            title={clip.name}
          />
        );
      })}
      
      {/* Visible region indicator */}
      <div
        className="graphite-visible-region"
        style={{
          left: `${visibleLeft}%`,
          width: `${Math.max(visibleWidth, 1)}%`, // Minimum width for visibility
        }}
        aria-label={`Visible region: ${visibleStart.toFixed(1)}s to ${visibleEnd.toFixed(1)}s`}
      />
    </div>
  );
}

// --- Main Component ---

export function FooterNav({
  zoom,
  minZoom,
  maxZoom,
  duration,
  visibleStart,
  visibleEnd,
  onZoomChange,
  tracks = [],
  fps = 24,
}: FooterNavProps) {
  return (
    <footer className="graphite-footer-nav">
      {/* Zoom Controls - Requirements 8.1, 8.2 */}
      <ZoomControls
        zoom={zoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        onZoomChange={onZoomChange}
      />
      
      {/* Project Overview Minimap - Requirements 9.1, 9.2, 9.3, 9.4 */}
      <ProjectOverview
        tracks={tracks}
        duration={duration}
        visibleStart={visibleStart}
        visibleEnd={visibleEnd}
      />
      
      {/* Duration Display - Requirement 9.3 */}
      <div className="graphite-duration-display">
        DURATION: <span>{formatTimecode(duration, fps)}</span>
      </div>
    </footer>
  );
}

export default FooterNav;
