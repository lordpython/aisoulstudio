/**
 * useStoryProject Hook
 *
 * Manages UI state for the Story Workspace: tab navigation, step completion,
 * keyboard shortcuts, and auto-save. Decouples UI orchestration from the
 * StoryWorkspace component so it receives data via props/context.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { StoryState, StoryStep } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MainStep = 'idea' | 'breakdown' | 'storyboard';
export type StepStatus = 'completed' | 'active' | 'pending' | 'processing';

export interface UseStoryProjectOptions {
  storyState: StoryState;
  isProcessing: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onGenerateScreenplay?: () => void;
  onGenerateCharacters?: () => void;
  onAutoSave?: (state: StoryState) => void;
}

export interface UseStoryProjectReturn {
  // Tab state
  activeMainTab: MainStep;
  setActiveMainTab: (tab: MainStep) => void;
  subTab: StoryStep;
  setSubTab: (tab: StoryStep) => void;

  // Dialog state
  showLockDialog: boolean;
  setShowLockDialog: (show: boolean) => void;
  showVersionHistory: boolean;
  setShowVersionHistory: (show: boolean) => void;

  // Helpers
  getHighLevelStep: (step: StoryStep) => MainStep;
  getStepCompletionStatus: (stepId: StoryStep) => StepStatus;
  handleTabNavigation: (tabId: StoryStep) => void;
  handleMainTabClick: (tabId: MainStep) => void;

  // Derived state
  isBreakdownProcessing: boolean;
  isStoryboardProcessing: boolean;
  currentStepIndex: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getHighLevelStep(step: StoryStep): MainStep {
  if (step === 'idea') return 'idea';
  if (['breakdown', 'script', 'characters'].includes(step)) return 'breakdown';
  return 'storyboard';
}

const AUTOSAVE_DELAY = 2000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStoryProject({
  storyState,
  isProcessing,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onGenerateScreenplay,
  onGenerateCharacters,
  onAutoSave,
}: UseStoryProjectOptions): UseStoryProjectReturn {
  // --- Tab state ---
  const [activeMainTab, setActiveMainTab] = useState<MainStep>(
    getHighLevelStep(storyState.currentStep),
  );
  const [subTab, setSubTab] = useState<StoryStep>(storyState.currentStep);

  // --- Dialog state ---
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Sync tabs when storyState.currentStep changes externally
  useEffect(() => {
    const newMain = getHighLevelStep(storyState.currentStep);
    setActiveMainTab(newMain);
    setSubTab(storyState.currentStep);
  }, [storyState.currentStep]);

  // --- Keyboard shortcuts (Ctrl+Z / Ctrl+Y) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z') {
        if (e.shiftKey) {
          if (canRedo && onRedo) { e.preventDefault(); onRedo(); }
        } else {
          if (canUndo && onUndo) { e.preventDefault(); onUndo(); }
        }
      } else if (e.key === 'y') {
        if (canRedo && onRedo) { e.preventDefault(); onRedo(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo, canUndo, canRedo]);

  // --- Auto-save (debounced 2 s) ---
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStateRef = useRef(storyState);

  useEffect(() => {
    if (!onAutoSave) return;
    // Don't auto-save the initial "idea" step
    if (storyState.currentStep === 'idea') return;
    // Don't auto-save if nothing changed
    if (prevStateRef.current === storyState) return;
    prevStateRef.current = storyState;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      onAutoSave(storyState);
    }, AUTOSAVE_DELAY);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [storyState, onAutoSave]);

  // --- Tab navigation with auto-generation ---
  const handleTabNavigation = useCallback(
    (tabId: StoryStep) => {
      if (tabId === 'script' && !storyState.script && !isProcessing) {
        onGenerateScreenplay?.();
      } else if (
        tabId === 'characters' &&
        storyState.characters.length === 0 &&
        !isProcessing
      ) {
        onGenerateCharacters?.();
      }
      setSubTab(tabId);
    },
    [storyState.script, storyState.characters.length, isProcessing, onGenerateScreenplay, onGenerateCharacters],
  );

  const handleMainTabClick = useCallback(
    (tabId: MainStep) => {
      const stepOrder: MainStep[] = ['idea', 'breakdown', 'storyboard'];
      const currentIdx = stepOrder.indexOf(getHighLevelStep(storyState.currentStep));
      const tabIdx = stepOrder.indexOf(tabId);
      if (tabIdx > currentIdx) return; // not accessible

      setActiveMainTab(tabId);
      if (tabId === 'idea') setSubTab('idea');
      if (tabId === 'breakdown') setSubTab('breakdown');
      if (tabId === 'storyboard') setSubTab('shots');
    },
    [storyState.currentStep],
  );

  // --- Step completion status ---
  const getStepCompletionStatus = useCallback(
    (stepId: StoryStep): StepStatus => {
      const storyboardOrder: StoryStep[] = ['shots', 'style', 'storyboard', 'narration', 'animation', 'export'];
      const breakdownOrder: StoryStep[] = ['breakdown', 'script', 'characters'];
      const currentOrder = activeMainTab === 'storyboard' ? storyboardOrder : breakdownOrder;
      const currentIndex = currentOrder.indexOf(subTab);
      const stepIndex = currentOrder.indexOf(stepId);

      if (stepId === subTab) return isProcessing ? 'processing' : 'active';

      if (activeMainTab === 'storyboard') {
        switch (stepId) {
          case 'shots': return (storyState.shots?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
          case 'style': return storyState.visualStyle ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
          case 'storyboard': return (storyState.scenesWithVisuals?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
          case 'narration': return (storyState.narrationSegments?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
          case 'animation': return (storyState.animatedShots?.length ?? 0) > 0 ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
          case 'export': return storyState.finalVideoUrl ? 'completed' : 'pending';
        }
      } else {
        switch (stepId) {
          case 'breakdown': return storyState.breakdown.length > 0 ? 'completed' : 'pending';
          case 'script': return storyState.script ? 'completed' : stepIndex < currentIndex ? 'completed' : 'pending';
          case 'characters': return storyState.characters.length > 0 ? 'completed' : 'pending';
        }
      }

      return stepIndex < currentIndex ? 'completed' : 'pending';
    },
    [activeMainTab, subTab, isProcessing, storyState],
  );

  // --- Derived state ---
  const isBreakdownProcessing =
    isProcessing && activeMainTab === 'breakdown' && storyState.breakdown.length === 0;
  const isStoryboardProcessing =
    isProcessing && activeMainTab === 'storyboard' && (!storyState.shots || storyState.shots.length === 0);

  const stepOrder: MainStep[] = ['idea', 'breakdown', 'storyboard'];
  const currentStepIndex = stepOrder.indexOf(getHighLevelStep(storyState.currentStep));

  return {
    activeMainTab,
    setActiveMainTab,
    subTab,
    setSubTab,
    showLockDialog,
    setShowLockDialog,
    showVersionHistory,
    setShowVersionHistory,
    getHighLevelStep,
    getStepCompletionStatus,
    handleTabNavigation,
    handleMainTabClick,
    isBreakdownProcessing,
    isStoryboardProcessing,
    currentStepIndex,
  };
}
