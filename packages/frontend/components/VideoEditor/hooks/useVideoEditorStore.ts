/**
 * Video Editor Store
 *
 * Zustand store managing all mutable state for the video editor:
 * tracks, clips, playback, selection, undo/redo, and view settings.
 */

import { create } from 'zustand';
import type {
  VideoEditorState,
  EditorTrack,
  EditorTrackType,
  EditorClip,
  EditorSnapshot,
  AspectRatio,
  ActiveTool,
  ToolPanel,
} from '../types/video-editor-types';
import { MAX_UNDO_STACK, DEFAULT_ZOOM } from '../types/video-editor-types';

let clipIdCounter = 0;
let trackIdCounter = 0;

function nextClipId(): string {
  return `clip_${Date.now()}_${++clipIdCounter}`;
}

function nextTrackId(): string {
  return `track_${Date.now()}_${++trackIdCounter}`;
}

function createSnapshot(state: { tracks: EditorTrack[]; clips: EditorClip[] }): EditorSnapshot {
  return {
    tracks: state.tracks.map(t => ({ ...t })),
    clips: state.clips.map(c => ({ ...c, textStyle: c.textStyle ? { ...c.textStyle, position: { ...c.textStyle.position } } : undefined })),
  };
}

function recalcDuration(clips: EditorClip[]): number {
  if (clips.length === 0) return 30;
  return Math.max(30, ...clips.map(c => c.startTime + c.duration));
}

export const useVideoEditorStore = create<VideoEditorState>((set, get) => ({
  // Initial state
  tracks: [],
  clips: [],
  currentTime: 0,
  duration: 30,
  isPlaying: false,
  selectedClipIds: [],
  selectedTrackId: null,
  zoom: DEFAULT_ZOOM,
  aspectRatio: '16:9' as AspectRatio,
  isFullscreen: false,
  undoStack: [],
  redoStack: [],
  activeTool: 'select' as ActiveTool,
  activeToolPanel: null as ToolPanel,

  // ---- Track Actions ----

  addTrack: (type: EditorTrackType, name?: string) => {
    const state = get();
    state.pushSnapshot();
    const track: EditorTrack = {
      id: nextTrackId(),
      type,
      name: name ?? `${type.charAt(0).toUpperCase() + type.slice(1)} ${state.tracks.filter(t => t.type === type).length + 1}`,
      isLocked: false,
      isMuted: false,
      isVisible: true,
      order: state.tracks.length,
    };
    set({ tracks: [...state.tracks, track], redoStack: [] });
  },

  removeTrack: (trackId: string) => {
    const state = get();
    state.pushSnapshot();
    set({
      tracks: state.tracks.filter(t => t.id !== trackId),
      clips: state.clips.filter(c => c.trackId !== trackId),
      selectedTrackId: state.selectedTrackId === trackId ? null : state.selectedTrackId,
      redoStack: [],
    });
  },

  reorderTrack: (trackId: string, newOrder: number) => {
    const state = get();
    state.pushSnapshot();
    const tracks = state.tracks.map(t => {
      if (t.id === trackId) return { ...t, order: newOrder };
      return t;
    }).sort((a, b) => a.order - b.order).map((t, i) => ({ ...t, order: i }));
    set({ tracks, redoStack: [] });
  },

  toggleTrackLock: (trackId: string) => {
    set(state => ({
      tracks: state.tracks.map(t => t.id === trackId ? { ...t, isLocked: !t.isLocked } : t),
    }));
  },

  toggleTrackMute: (trackId: string) => {
    set(state => ({
      tracks: state.tracks.map(t => t.id === trackId ? { ...t, isMuted: !t.isMuted } : t),
    }));
  },

  toggleTrackVisibility: (trackId: string) => {
    set(state => ({
      tracks: state.tracks.map(t => t.id === trackId ? { ...t, isVisible: !t.isVisible } : t),
    }));
  },

  // ---- Clip Actions ----

  addClip: (clipData) => {
    const state = get();
    state.pushSnapshot();
    const clip: EditorClip = { ...clipData, id: nextClipId() };
    const newClips = [...state.clips, clip];
    set({ clips: newClips, duration: recalcDuration(newClips), redoStack: [] });
  },

  removeClip: (clipId: string) => {
    const state = get();
    state.pushSnapshot();
    const newClips = state.clips.filter(c => c.id !== clipId);
    set({
      clips: newClips,
      duration: recalcDuration(newClips),
      selectedClipIds: state.selectedClipIds.filter(id => id !== clipId),
      redoStack: [],
    });
  },

  updateClip: (clipId: string, updates: Partial<EditorClip>) => {
    const state = get();
    state.pushSnapshot();
    const newClips = state.clips.map(c => c.id === clipId ? { ...c, ...updates } : c);
    set({ clips: newClips, duration: recalcDuration(newClips), redoStack: [] });
  },

  moveClip: (clipId: string, newStartTime: number, newTrackId?: string) => {
    const state = get();
    state.pushSnapshot();
    const clampedTime = Math.max(0, newStartTime);
    const newClips = state.clips.map(c => {
      if (c.id !== clipId) return c;
      return { ...c, startTime: clampedTime, ...(newTrackId ? { trackId: newTrackId } : {}) };
    });
    set({ clips: newClips, duration: recalcDuration(newClips), redoStack: [] });
  },

  resizeClip: (clipId: string, edge: 'left' | 'right', newTime: number) => {
    const state = get();
    state.pushSnapshot();
    const newClips = state.clips.map(c => {
      if (c.id !== clipId) return c;
      if (edge === 'left') {
        const clamped = Math.max(0, Math.min(newTime, c.startTime + c.duration - 0.1));
        const delta = clamped - c.startTime;
        return { ...c, startTime: clamped, duration: c.duration - delta, inPoint: c.inPoint + delta };
      } else {
        const newDuration = Math.max(0.1, newTime - c.startTime);
        return { ...c, duration: newDuration, outPoint: c.inPoint + newDuration };
      }
    });
    set({ clips: newClips, duration: recalcDuration(newClips), redoStack: [] });
  },

  splitClipAtPlayhead: (clipId: string) => {
    const state = get();
    const clip = state.clips.find(c => c.id === clipId);
    if (!clip) return;
    const splitTime = state.currentTime;
    if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) return;

    state.pushSnapshot();
    const leftDuration = splitTime - clip.startTime;
    const rightDuration = clip.duration - leftDuration;

    const leftClip: EditorClip = { ...clip, duration: leftDuration, outPoint: clip.inPoint + leftDuration };
    const rightClip: EditorClip = {
      ...clip,
      id: nextClipId(),
      startTime: splitTime,
      duration: rightDuration,
      inPoint: clip.inPoint + leftDuration,
    };

    const newClips = state.clips.map(c => c.id === clipId ? leftClip : c);
    newClips.push(rightClip);
    set({ clips: newClips, duration: recalcDuration(newClips), redoStack: [] });
  },

  // ---- Playback Actions ----

  setCurrentTime: (time: number) => set({ currentTime: Math.max(0, time) }),
  setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
  togglePlayback: () => set(state => {
    if (state.isPlaying) {
      return { isPlaying: false };
    }

    if (state.currentTime >= state.duration) {
      return { isPlaying: true, currentTime: 0 };
    }

    return { isPlaying: true };
  }),

  // ---- View Actions ----

  setZoom: (zoom: number) => set({ zoom: Math.max(10, Math.min(200, zoom)) }),
  setAspectRatio: (ratio: AspectRatio) => set({ aspectRatio: ratio }),
  setFullscreen: (fullscreen: boolean) => set({ isFullscreen: fullscreen }),
  setActiveTool: (tool: ActiveTool) => set({ activeTool: tool }),
  setActiveToolPanel: (panel: ToolPanel) => set(state => ({
    activeToolPanel: state.activeToolPanel === panel ? null : panel,
  })),

  // ---- Selection Actions ----

  selectClip: (clipId: string, additive = false) => {
    set(state => ({
      selectedClipIds: additive
        ? (state.selectedClipIds.includes(clipId)
          ? state.selectedClipIds.filter(id => id !== clipId)
          : [...state.selectedClipIds, clipId])
        : [clipId],
    }));
  },

  selectTrack: (trackId: string | null) => set({ selectedTrackId: trackId }),

  deselectAll: () => set({ selectedClipIds: [], selectedTrackId: null }),

  // ---- Undo/Redo ----

  pushSnapshot: () => {
    set(state => {
      const snapshot = createSnapshot(state);
      const stack = [...state.undoStack, snapshot];
      if (stack.length > MAX_UNDO_STACK) stack.shift();
      return { undoStack: stack };
    });
  },

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return;
    const currentSnapshot = createSnapshot(state);
    const prev = state.undoStack[state.undoStack.length - 1]!;
    set({
      tracks: prev.tracks,
      clips: prev.clips,
      duration: recalcDuration(prev.clips),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, currentSnapshot],
    });
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return;
    const currentSnapshot = createSnapshot(state);
    const next = state.redoStack[state.redoStack.length - 1]!;
    set({
      tracks: next.tracks,
      clips: next.clips,
      duration: recalcDuration(next.clips),
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, currentSnapshot],
    });
  },

  // ---- Reset ----

  reset: () => {
    clipIdCounter = 0;
    trackIdCounter = 0;
    set({
      tracks: [],
      clips: [],
      currentTime: 0,
      duration: 30,
      isPlaying: false,
      selectedClipIds: [],
      selectedTrackId: null,
      zoom: DEFAULT_ZOOM,
      aspectRatio: '16:9',
      isFullscreen: false,
      undoStack: [],
      redoStack: [],
      activeTool: 'select',
      activeToolPanel: null,
    });
  },
}));
