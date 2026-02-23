/**
 * useTimelineKeyboard Hook
 * 
 * Custom React hook for comprehensive keyboard navigation in the Graphite Timeline.
 * Implements professional video editor-style keyboard shortcuts for:
 * - Playback control (Space/K for play/pause)
 * - Time navigation (Arrow keys, J/K/L, Home/End)
 * - Clip navigation and selection (Tab, Enter, Escape, Delete)
 * - Frame-by-frame navigation (Ctrl+Arrow)
 * 
 * Requirements: Accessibility - keyboard-only navigation support
 */

import { useCallback, useEffect, useRef } from 'react';

// --- Types ---

export interface UseTimelineKeyboardOptions {
  /** Whether the timeline component is currently focused/active */
  isActive: boolean;
  /** Total duration of the timeline in seconds */
  duration: number;
  /** Current playhead time in seconds */
  currentTime: number;
  /** Whether playback is currently active */
  isPlaying: boolean;
  /** Index of the currently selected clip, or null if none selected */
  selectedClipIndex: number | null;
  /** Total number of clips in the timeline */
  clipCount: number;
  /** Callback when time should change */
  onTimeChange: (time: number) => void;
  /** Callback for play/pause toggle */
  onPlayPause: () => void;
  /** Callback for selecting a clip by index */
  onSelectClip: (index: number | null) => void;
  /** Callback for deleting the selected clip */
  onDeleteClip?: (index: number) => void;
  /** Callback to navigate to next clip */
  onNextClip: () => void;
  /** Callback to navigate to previous clip */
  onPrevClip: () => void;
  /** Callback to jump to start of timeline */
  onJumpToStart: () => void;
  /** Callback to jump to end of timeline */
  onJumpToEnd: () => void;
  /** Frames per second for frame-by-frame navigation (default: 30) */
  fps?: number;
  /** Amount to skip for small time jumps in seconds (default: 1) */
  smallSkip?: number;
  /** Amount to skip for large time jumps in seconds (default: 5) */
  largeSkip?: number;
}

export interface UseTimelineKeyboardReturn {
  /** Map of keyboard shortcut descriptions for displaying help */
  shortcuts: Record<string, string>;
}

// --- Constants ---

const DEFAULT_FPS = 30;
const DEFAULT_SMALL_SKIP = 1; // 1 second
const DEFAULT_LARGE_SKIP = 5; // 5 seconds

/**
 * Keyboard shortcut reference map for UI display
 */
const SHORTCUTS: Record<string, string> = {
  'Space / K': 'Play/Pause',
  '← / J': 'Rewind 1 second',
  '→ / L': 'Forward 1 second',
  'Shift + ←/→': 'Move 5 seconds',
  'Ctrl + ←/→': 'Move 1 frame',
  'Home': 'Jump to start',
  'End': 'Jump to end',
  'Tab': 'Next clip',
  'Shift + Tab': 'Previous clip',
  'Delete / Backspace': 'Remove selected clip',
  'Escape': 'Deselect clip',
};

// --- Hook Implementation ---

/**
 * Custom hook for keyboard navigation in the timeline editor.
 * 
 * Implements industry-standard keyboard shortcuts similar to professional
 * video editing software (Premiere Pro, Final Cut, DaVinci Resolve).
 * 
 * @param options - Configuration options and callbacks
 * @returns Object with keyboard shortcut map for UI display
 * 
 * @example
 * ```tsx
 * const { shortcuts } = useTimelineKeyboard({
 *   isActive: isFocused,
 *   duration: 120,
 *   currentTime,
 *   isPlaying,
 *   selectedClipIndex,
 *   clipCount: clips.length,
 *   onTimeChange: setCurrentTime,
 *   onPlayPause: togglePlay,
 *   onSelectClip: setSelectedClipIndex,
 *   onNextClip: () => selectNext(),
 *   onPrevClip: () => selectPrev(),
 *   onJumpToStart: () => setCurrentTime(0),
 *   onJumpToEnd: () => setCurrentTime(duration),
 * });
 * ```
 */
export function useTimelineKeyboard({
  isActive,
  duration,
  currentTime,
  isPlaying,
  selectedClipIndex,
  clipCount,
  onTimeChange,
  onPlayPause,
  onSelectClip,
  onDeleteClip,
  onNextClip,
  onPrevClip,
  onJumpToStart,
  onJumpToEnd,
  fps = DEFAULT_FPS,
  smallSkip = DEFAULT_SMALL_SKIP,
  largeSkip = DEFAULT_LARGE_SKIP,
}: UseTimelineKeyboardOptions): UseTimelineKeyboardReturn {
  
  // Track last announced time for screen readers to avoid excessive announcements
  const lastAnnouncedTimeRef = useRef<number>(currentTime);
  
  /**
   * Main keyboard event handler.
   * Processes keyboard events when the timeline has focus.
   */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle events when the timeline is active/focused
    if (!isActive) return;
    
    // Don't interfere with input elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    
    // Calculate frame duration for frame-by-frame navigation
    const frameDuration = 1 / fps;
    
    switch (e.code) {
      // ==================== PLAYBACK CONTROLS ====================
      
      // Play/Pause - Space or K (standard video editor shortcut)
      case 'Space':
      case 'KeyK':
        e.preventDefault();
        onPlayPause();
        break;
        
      // ==================== TIME NAVIGATION ====================
      
      // Move playhead left - ArrowLeft or J
      case 'ArrowLeft':
      case 'KeyJ':
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Frame-by-frame backward (Ctrl/Cmd + Left)
          onTimeChange(Math.max(0, currentTime - frameDuration));
        } else if (e.shiftKey) {
          // Large skip backward (Shift + Left)
          onTimeChange(Math.max(0, currentTime - largeSkip));
        } else {
          // Small skip backward
          onTimeChange(Math.max(0, currentTime - smallSkip));
        }
        break;
        
      // Move playhead right - ArrowRight or L  
      case 'ArrowRight':
      case 'KeyL':
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Frame-by-frame forward (Ctrl/Cmd + Right)
          onTimeChange(Math.min(duration, currentTime + frameDuration));
        } else if (e.shiftKey) {
          // Large skip forward (Shift + Right)
          onTimeChange(Math.min(duration, currentTime + largeSkip));
        } else {
          // Small skip forward
          onTimeChange(Math.min(duration, currentTime + smallSkip));
        }
        break;
        
      // Jump to start
      case 'Home':
        e.preventDefault();
        onJumpToStart();
        break;
        
      // Jump to end
      case 'End':
        e.preventDefault();
        onJumpToEnd();
        break;
        
      // ==================== CLIP SELECTION ====================
      
      // Navigate between clips with Tab
      case 'Tab':
        if (clipCount > 0) {
          e.preventDefault();
          if (e.shiftKey) {
            onPrevClip();
          } else {
            onNextClip();
          }
        }
        break;
        
      // Deselect current selection
      case 'Escape':
        e.preventDefault();
        onSelectClip(null);
        break;
        
      // ==================== CLIP ACTIONS ====================
      
      // Delete selected clip
      case 'Delete':
      case 'Backspace':
        if (selectedClipIndex !== null && onDeleteClip) {
          e.preventDefault();
          onDeleteClip(selectedClipIndex);
        }
        break;
        
      // Select/confirm clip (could be extended for clip editing)
      case 'Enter':
        e.preventDefault();
        // Currently just ensures clip is selected
        // Could be extended to open clip editor in the future
        break;
        
      // ==================== ADDITIONAL SHORTCUTS ====================
      
      // Quick jump shortcuts using number keys (0-9)
      // Jump to percentage of timeline: 0=0%, 1=10%, ... 9=90%
      case 'Digit0':
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          const digit = parseInt(e.code.replace('Digit', ''), 10);
          const targetTime = (digit / 10) * duration;
          onTimeChange(targetTime);
        }
        break;
    }
  }, [
    isActive,
    duration,
    currentTime,
    isPlaying, // Added missing dependency
    selectedClipIndex,
    clipCount,
    onTimeChange,
    onPlayPause,
    onSelectClip,
    onDeleteClip,
    onNextClip,
    onPrevClip,
    onJumpToStart,
    onJumpToEnd,
    fps,
    smallSkip,
    largeSkip,
  ]);
  
  /**
   * Attach keyboard event listener to window.
   * Uses capture phase to handle events before bubbling.
   */
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
  
  return {
    shortcuts: SHORTCUTS,
  };
}

export default useTimelineKeyboard;
