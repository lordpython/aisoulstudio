/**
 * StoryPanel - story mode workspace, extracted from StudioScreen
 *
 * Renders the StoryWorkspace with all storyHook callbacks and formatPipeline
 * integration. Receives all props from the StudioScreen shell.
 */

import React from 'react';
import { StoryWorkspace } from '@/components/story';
import { StoryWorkspaceErrorBoundary } from '@/components/story/StoryWorkspaceErrorBoundary';
import type { useStoryGeneration } from '@/hooks/useStoryGeneration';
import type { useFormatPipeline } from '@/hooks/useFormatPipeline';

type StoryHook = ReturnType<typeof useStoryGeneration>;
type FormatPipelineHook = ReturnType<typeof useFormatPipeline>;

export interface StoryPanelProps {
  storyHook: StoryHook;
  storyInitialTopic: string;
  topic: string;
  formatPipelineHook: FormatPipelineHook;
  onFormatExecute: () => void;
  onOpenInEditor: () => void;
  onContinueFromFormatPipeline: () => void;
  onSetStudioMode: (mode: 'chat' | 'story' | 'editor') => void;
  onSetStoryInitialTopic: (topic: string) => void;
}

export function StoryPanel({
  storyHook,
  storyInitialTopic,
  topic,
  formatPipelineHook,
  onFormatExecute,
  onOpenInEditor,
  onContinueFromFormatPipeline,
  onSetStoryInitialTopic,
}: StoryPanelProps) {
  return (
    <StoryWorkspaceErrorBoundary
      storyState={storyHook.state}
      onRestore={() => {
        // Restore from version history or last saved state
        console.log('[StoryWorkspace] Restoring from last saved state');
        // The version history system already handles auto-save
      }}
    >
      <StoryWorkspace
        storyState={storyHook.state}
        initialTopic={storyInitialTopic || topic || ''}
        formatPipelineHook={formatPipelineHook}
        onFormatExecute={onFormatExecute}
        onOpenInEditor={onOpenInEditor}
        onContinueFromFormatPipeline={onContinueFromFormatPipeline}
        onGenerateIdea={(storyTopic, genre) => {
          onSetStoryInitialTopic(storyTopic);
          storyHook.updateGenre(genre);
          storyHook.generateBreakdown(storyTopic, genre);
        }}
        onExportScript={storyHook.exportScreenplay}
        onRegenerateScene={storyHook.regenerateScene}
        onVerifyConsistency={storyHook.verifyConsistency}
        onGenerateScreenplay={storyHook.generateScreenplay}
        onGenerateCharacters={storyHook.generateCharacters}
        onGenerateCharacterImage={storyHook.generateCharacterImage}
        onUndo={storyHook.undo}
        onRedo={storyHook.redo}
        canUndo={storyHook.canUndo}
        canRedo={storyHook.canRedo}
        onNextStep={() => {
          const step = storyHook.state.currentStep;
          const isLocked = storyHook.state.isLocked;

          if (step === 'idea') {
            // Idea → Breakdown: Generate story outline
            storyHook.generateBreakdown(storyInitialTopic || topic || 'A generic story', 'Drama');
          } else if (step === 'breakdown') {
            // Breakdown → Script: Generate full screenplay
            storyHook.generateScreenplay();
          } else if (step === 'script') {
            // Script → Characters: Generate character profiles
            // Note: Lock is handled separately via onLockStory
            storyHook.generateCharacters();
          } else if (step === 'characters') {
            // Characters → Shots: Generate shot breakdown
            // Story must be locked at this point
            if (isLocked) {
              storyHook.generateShots();
            } else {
              // Shouldn't happen, but fallback to showing lock dialog
              console.warn('Story should be locked before generating shots');
              storyHook.setStep('script');
            }
          } else if (step === 'shots') {
            // Shots → Style: Move to visual style selection
            storyHook.setStep('style');
          } else if (step === 'style') {
            // Style → Storyboard: Generate storyboard visuals
            storyHook.generateVisuals();
          }
        }}
        onGenerateShots={storyHook.generateShots}
        onGenerateVisuals={storyHook.generateVisuals}
        stageProgress={storyHook.getStageProgress()}
        isProcessing={storyHook.isProcessing}
        progress={storyHook.progress}
        processingShots={storyHook.processingShots}
        // Storyboarder.ai-style workflow props
        onLockStory={storyHook.lockStory}
        onUpdateVisualStyle={storyHook.updateVisualStyle}
        onUpdateAspectRatio={storyHook.updateAspectRatio}
        onUpdateImageProvider={storyHook.updateImageProvider}
        onUpdateStyleConsistency={storyHook.updateStyleConsistency}
        onUpdateBgRemoval={storyHook.updateBgRemoval}
        onUpdateTtsSettings={storyHook.updateTtsSettings}
        // Error handling
        error={storyHook.error}
        onClearError={storyHook.clearError}
        onRetry={storyHook.retryLastOperation}
        onUpdateShot={storyHook.updateShot}
        // Narration, Animation, and Export
        onGenerateNarration={storyHook.generateNarration}
        onAnimateShots={storyHook.animateShots}
        onExportFinalVideo={storyHook.exportFinalVideo}
        onDownloadVideo={storyHook.downloadVideo}
        allScenesHaveNarration={storyHook.allScenesHaveNarration}
        allShotsHaveAnimation={storyHook.allShotsHaveAnimation}
        // Drag-to-reorder shots
        onReorderShots={storyHook.reorderShots}
        // Template and project management
        projectId={storyHook.sessionId ?? undefined}
        onApplyTemplate={storyHook.applyTemplate}
        onImportProject={storyHook.importProject}
      />
    </StoryWorkspaceErrorBoundary>
  );
}
