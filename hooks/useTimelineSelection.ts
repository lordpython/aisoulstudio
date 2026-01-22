/**
 * useTimelineSelection Hook
 * 
 * Custom React hook for managing timeline clip selection state.
 * Implements single-selection logic with support for:
 * - Selecting clips on click (Requirement 10.1)
 * - Clearing selection on click outside clips (Requirement 10.2)
 * - Notifying parent components via callback (Requirement 10.3)
 * - Single-selection only - no multi-select (Requirement 10.4)
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  SelectionState,
  createInitialSelectionState,
  handleClipClick,
  handleOutsideClick,
  isClipSelected,
} from "@/components/TimelineEditor/graphite-timeline-utils";
import { clipIdToSceneId } from "@/components/TimelineEditor/timelineAdapter";

export interface UseTimelineSelectionOptions {
  /** Initial selected clip ID */
  initialSelectedId?: string | null;
  /** Callback when a scene is selected (Requirement 10.3) */
  onSceneSelect?: (sceneId: string) => void;
  /** Callback when selection is cleared */
  onSelectionClear?: () => void;
}

export interface UseTimelineSelectionReturn {
  /** Currently selected clip ID, or null if none */
  selectedClipId: string | null;
  /** Handler for clip click events - selects the clip */
  handleSelectClip: (clipId: string) => void;
  /** Handler for clicking outside clips - clears selection */
  handleClearSelection: () => void;
  /** Check if a specific clip is selected */
  isSelected: (clipId: string) => boolean;
  /** Programmatically set the selected clip ID */
  setSelectedClipId: (clipId: string | null) => void;
}

/**
 * Hook for managing timeline selection state.
 * 
 * @param options - Configuration options
 * @returns Selection state and handlers
 * 
 * @example
 * ```tsx
 * const { selectedClipId, handleSelectClip, handleClearSelection, isSelected } = 
 *   useTimelineSelection({
 *     onSceneSelect: (sceneId) => console.log("Selected:", sceneId),
 *   });
 * 
 * // In TrackLane:
 * <TrackLane
 *   selectedClipId={selectedClipId}
 *   onClipSelect={handleSelectClip}
 *   onLaneClick={handleClearSelection}
 * />
 * ```
 */
export function useTimelineSelection(
  options: UseTimelineSelectionOptions = {}
): UseTimelineSelectionReturn {
  const { initialSelectedId, onSceneSelect, onSelectionClear } = options;

  // Internal selection state
  const [selectionState, setSelectionState] = useState<SelectionState>(() =>
    createInitialSelectionState(initialSelectedId)
  );

  /**
   * Handle clip click - selects the clip and notifies parent.
   * Implements Requirement 10.1 (mark as selected) and 10.3 (notify via callback).
   */
  const handleSelectClip = useCallback(
    (clipId: string) => {
      setSelectionState((currentState) => {
        const { newState, sceneId } = handleClipClick(currentState, clipId);
        return newState;
      });
    },
    []
  );

  // Use useEffect to handle scene selection callback instead of setTimeout
  useEffect(() => {
    if (selectionState.selectedClipId && onSceneSelect) {
      const sceneId = clipIdToSceneId(selectionState.selectedClipId);
      onSceneSelect(sceneId);
    }
  }, [selectionState.selectedClipId, onSceneSelect]);

  /**
   * Handle click outside clips - clears selection.
   * Implements Requirement 10.2.
   */
  const handleClearSelection = useCallback(() => {
    setSelectionState((currentState) => {
      const newState = handleOutsideClick(currentState);
      
      // Call the onSelectionClear callback if selection was cleared
      if (currentState.selectedClipId !== null && onSelectionClear) {
        setTimeout(() => onSelectionClear(), 0);
      }
      
      return newState;
    });
  }, [onSelectionClear]);

  /**
   * Check if a specific clip is selected.
   */
  const isSelected = useCallback(
    (clipId: string) => isClipSelected(selectionState, clipId),
    [selectionState]
  );

  /**
   * Programmatically set the selected clip ID.
   * Useful for external control of selection state.
   */
  const setSelectedClipId = useCallback(
    (clipId: string | null) => {
      setSelectionState({ selectedClipId: clipId });
    },
    []
  );

  // Memoize the return value to prevent unnecessary re-renders
  return useMemo(
    () => ({
      selectedClipId: selectionState.selectedClipId,
      handleSelectClip,
      handleClearSelection,
      isSelected,
      setSelectedClipId,
    }),
    [
      selectionState.selectedClipId,
      handleSelectClip,
      handleClearSelection,
      isSelected,
      setSelectedClipId,
    ]
  );
}

export default useTimelineSelection;
