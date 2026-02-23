/**
 * EnhancedTransportBar
 *
 * Full transport bar with undo/redo, split tool, playback controls,
 * timecode display, aspect ratio selector, zoom slider, and fullscreen toggle.
 */

import {
  Undo2, Redo2, Scissors,
  SkipBack, Play, Pause, SkipForward,
  Maximize2,
} from 'lucide-react';
import type { AspectRatio } from './types/video-editor-types';
import { MIN_ZOOM, MAX_ZOOM } from './types/video-editor-types';
import './video-editor.css';

function formatTimecodeCompact(seconds: number): string {
  const time = Math.max(0, seconds);
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  const ms = Math.floor((time % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

interface EnhancedTransportBarProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  zoom: number;
  aspectRatio: AspectRatio;
  activeTool: string;
  canUndo: boolean;
  canRedo: boolean;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onZoomChange: (zoom: number) => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onFullscreen: () => void;
}

export function EnhancedTransportBar({
  currentTime,
  duration,
  isPlaying,
  zoom,
  aspectRatio,
  activeTool,
  canUndo,
  canRedo,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onUndo,
  onRedo,
  onSplit,
  onZoomChange,
  onAspectRatioChange,
  onFullscreen,
}: EnhancedTransportBarProps) {
  return (
    <div className="ve-transport" role="toolbar" aria-label="Transport controls">
      {/* Left group: undo/redo/split */}
      <div className="ve-transport-group">
        <button
          className="ve-transport-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={16} />
        </button>
        <button
          className="ve-transport-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 size={16} />
        </button>
        <button
          className={`ve-transport-btn ${activeTool === 'split' ? 'active' : ''}`}
          onClick={onSplit}
          title="Split at playhead (S)"
          aria-label="Split clip"
        >
          <Scissors size={16} />
        </button>
      </div>

      <div className="ve-transport-divider" />

      {/* Center group: transport + timecode */}
      <div className="ve-transport-group">
        <button
          className="ve-transport-btn"
          onClick={onSkipBack}
          title="Skip back 5s (J)"
          aria-label="Skip back"
        >
          <SkipBack size={16} />
        </button>
        <button
          className="ve-transport-btn primary"
          onClick={onPlayPause}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          className="ve-transport-btn"
          onClick={onSkipForward}
          title="Skip forward 5s (L)"
          aria-label="Skip forward"
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* Timecode */}
      <div className="ve-timecode" role="timer" aria-label="Playback position">
        <span className="ve-timecode-current">{formatTimecodeCompact(currentTime)}</span>
        <span className="ve-timecode-separator">/</span>
        <span>{formatTimecodeCompact(duration)}</span>
      </div>

      <div className="ve-transport-spacer" />

      {/* Right group: aspect ratio, zoom, fullscreen */}
      <select
        className="ve-aspect-select"
        value={aspectRatio}
        onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
        title="Aspect ratio"
        aria-label="Aspect ratio"
      >
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
        <option value="1:1">1:1</option>
        <option value="4:3">4:3</option>
      </select>

      <div className="ve-zoom-container">
        <input
          type="range"
          className="ve-zoom-slider"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          title={`Zoom: ${zoom}px/s`}
          aria-label="Timeline zoom"
        />
      </div>

      <button
        className="ve-transport-btn"
        onClick={onFullscreen}
        title="Fullscreen"
        aria-label="Toggle fullscreen"
      >
        <Maximize2 size={16} />
      </button>
    </div>
  );
}
