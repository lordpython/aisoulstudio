/**
 * Video Editor Types
 *
 * Type definitions for the professional video editor component.
 * Defines the mutable clip/track model used for interactive editing.
 */

// ============================================================================
// Track Types
// ============================================================================

export type EditorTrackType = 'text' | 'video' | 'image' | 'audio';

export interface EditorTrack {
  id: string;
  type: EditorTrackType;
  name: string;
  isLocked: boolean;
  isMuted: boolean;
  isVisible: boolean;
  order: number;
}

// ============================================================================
// Clip Types
// ============================================================================

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  backgroundColor?: string;
  /** Normalized position 0-1 on canvas */
  position: { x: number; y: number };
  alignment: 'left' | 'center' | 'right';
}

export interface EditorClip {
  id: string;
  trackId: string;
  type: EditorTrackType;
  startTime: number;
  duration: number;
  name: string;

  // Video-specific
  thumbnailUrl?: string;
  sourceUrl?: string;

  // Image-specific
  imageUrl?: string;

  // Text-specific
  text?: string;
  textStyle?: TextStyle;

  // Audio-specific
  waveformData?: number[];

  // Trimming (source-relative)
  inPoint: number;
  outPoint: number;
}

// ============================================================================
// Editor State
// ============================================================================

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3';
export type ActiveTool = 'select' | 'split' | 'text' | 'hand';
export type ToolPanel = 'layers' | 'templates' | 'audio' | 'text' | 'media' | null;

export interface EditorSnapshot {
  tracks: EditorTrack[];
  clips: EditorClip[];
}

export interface VideoEditorState {
  // Tracks and clips
  tracks: EditorTrack[];
  clips: EditorClip[];

  // Playback
  currentTime: number;
  duration: number;
  isPlaying: boolean;

  // Selection
  selectedClipIds: string[];
  selectedTrackId: string | null;

  // View
  zoom: number;
  aspectRatio: AspectRatio;
  isFullscreen: boolean;

  // Undo
  undoStack: EditorSnapshot[];
  redoStack: EditorSnapshot[];

  // Tool state
  activeTool: ActiveTool;
  activeToolPanel: ToolPanel;

  // Actions — Tracks
  addTrack: (type: EditorTrackType, name?: string) => void;
  removeTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, newOrder: number) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;

  // Actions — Clips
  addClip: (clip: Omit<EditorClip, 'id'>) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<EditorClip>) => void;
  moveClip: (clipId: string, newStartTime: number, newTrackId?: string) => void;
  resizeClip: (clipId: string, edge: 'left' | 'right', newTime: number) => void;
  splitClipAtPlayhead: (clipId: string) => void;

  // Actions — Playback
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayback: () => void;

  // Actions — View
  setZoom: (zoom: number) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setFullscreen: (fullscreen: boolean) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setActiveToolPanel: (panel: ToolPanel) => void;

  // Actions — Selection
  selectClip: (clipId: string, additive?: boolean) => void;
  selectTrack: (trackId: string | null) => void;
  deselectAll: () => void;

  // Actions — Undo/Redo
  undo: () => void;
  redo: () => void;
  pushSnapshot: () => void;

  // Actions — Reset
  reset: () => void;
}

// ============================================================================
// Constants
// ============================================================================

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 200;
export const DEFAULT_ZOOM = 50;
export const MAX_UNDO_STACK = 50;

export const TRACK_COLORS: Record<EditorTrackType, {
  bg: string;
  border: string;
  clip: string;
  clipBorder: string;
  waveform: string;
}> = {
  text: {
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.5)',
    clip: 'rgba(59, 130, 246, 0.25)',
    clipBorder: 'rgba(59, 130, 246, 0.6)',
    waveform: '#3b82f6',
  },
  video: {
    bg: 'rgba(20, 184, 166, 0.12)',
    border: 'rgba(20, 184, 166, 0.5)',
    clip: 'rgba(20, 184, 166, 0.25)',
    clipBorder: 'rgba(20, 184, 166, 0.6)',
    waveform: '#14b8a6',
  },
  image: {
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.5)',
    clip: 'rgba(34, 197, 94, 0.25)',
    clipBorder: 'rgba(34, 197, 94, 0.6)',
    waveform: '#22c55e',
  },
  audio: {
    bg: 'rgba(249, 115, 22, 0.12)',
    border: 'rgba(249, 115, 22, 0.5)',
    clip: 'rgba(249, 115, 22, 0.2)',
    clipBorder: 'rgba(249, 115, 22, 0.5)',
    waveform: '#f97316',
  },
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Inter',
  fontSize: 48,
  fontWeight: '700',
  color: '#ffffff',
  position: { x: 0.5, y: 0.5 },
  alignment: 'center',
};
