/**
 * StoryPanel - story mode workspace, extracted from StudioScreen
 *
 * Self-contained panel: owns useStoryGeneration + useFormatPipeline.
 * The shell (StudioScreen) no longer imports these heavy dependencies.
 *
 * Also owns:
 *   - handleFormatExecute
 *   - handleContinueFromFormatPipeline
 *   - handleOpenInEditor
 *   - canOpenEditor
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StoryWorkspace } from '@/components/story';
import { StoryWorkspaceErrorBoundary } from '@/components/story/StoryWorkspaceErrorBoundary';
import { useStoryGeneration } from '@/hooks/useStoryGeneration';
import { useFormatPipeline } from '@/hooks/useFormatPipeline';
import { getCurrentUser } from '@/services/firebase/authService';
import { storyModeStore } from '@/services/ai/production/store';
import { useVideoEditorStore } from '@/components/VideoEditor/hooks/useVideoEditorStore';
import type {
  ScreenplayScene,
  StoryState,
  ShotlistEntry,
  Scene,
  NarrationSegment,
  GeneratedImage,
  StoryNarrationSegment,
} from '@/types';
import type { VideoStateSnapshot } from './VideoProductionPanel';

// ── Helpers (copied from StudioScreen to keep zero behavior change) ──

function normalizePipelineScenes(value: unknown): ScreenplayScene[] {
  if (!Array.isArray(value)) return [];

  return value.map((scene, index) => {
    const candidate = (scene ?? {}) as Partial<ScreenplayScene>;
    return {
      id: candidate.id || `scene_${index}`,
      sceneNumber: candidate.sceneNumber || index + 1,
      heading: candidate.heading || `Scene ${index + 1}`,
      action: candidate.action || '',
      dialogue: Array.isArray(candidate.dialogue) ? candidate.dialogue : [],
      charactersPresent: Array.isArray(candidate.charactersPresent) ? candidate.charactersPresent : [],
    };
  });
}

function buildFallbackShotlist(screenplay: ScreenplayScene[], visuals: unknown): ShotlistEntry[] {
  if (!Array.isArray(visuals)) return [];

  return visuals.map((visual, index) => {
    const candidate = (visual ?? {}) as { sceneId?: string; imageUrl?: string };
    return {
      id: `shot_${index}`,
      sceneId: candidate.sceneId || screenplay[index]?.id || `scene_${index}`,
      shotNumber: index + 1,
      description: screenplay[index]?.action || '',
      cameraAngle: 'Eye-level',
      movement: 'Static',
      lighting: 'Natural',
      dialogue: screenplay[index]?.dialogue?.[0]?.text || '',
      imageUrl: candidate.imageUrl,
    };
  });
}

function canOpenStudioEditor(input: {
  pipelineScreenplayCount?: number;
  storyBreakdownCount?: number;
  contentPlanSceneCount?: number;
}): boolean {
  return Boolean(
    input.pipelineScreenplayCount ||
    input.storyBreakdownCount ||
    input.contentPlanSceneCount
  );
}

// ── Props ──

export interface StoryPanelProps {
  projectId: string | undefined;
  paramsStyle: string | undefined;
  storyInitialTopic: string;
  onSetStoryInitialTopic: (topic: string) => void;
  onSetStudioMode: (mode: 'chat' | 'story' | 'editor') => void;

  // Video state snapshot (from VideoProductionPanel via shell) — needed for handleOpenInEditor
  videoStateSnapshot: VideoStateSnapshot;

  // Callback to report canOpenEditor to shell (for header Editor button)
  onCanOpenEditorChange: (canOpen: boolean) => void;

  // Callback to expose openInEditor handler to shell (for header Editor button)
  onOpenInEditorRef: (fn: () => void) => void;
}

// ── Component ──

export function StoryPanel({
  projectId,
  paramsStyle,
  storyInitialTopic,
  onSetStoryInitialTopic,
  onSetStudioMode,
  videoStateSnapshot,
  onCanOpenEditorChange,
  onOpenInEditorRef,
}: StoryPanelProps) {
  // ── Heavy hooks (live here, not in shell) ──
  const storyHook = useStoryGeneration(projectId);
  const formatPipelineHook = useFormatPipeline();

  // topic fallback: use video topic from snapshot when storyInitialTopic is empty
  const topic = videoStateSnapshot.topic;

  // ── Compute and report canOpenEditor ──
  const canOpenEditor = useMemo(() => {
    return canOpenStudioEditor({
      pipelineScreenplayCount: formatPipelineHook.result?.partialResults?.screenplay?.length,
      storyBreakdownCount: storyHook.state.breakdown?.length,
      contentPlanSceneCount: videoStateSnapshot.contentPlan?.scenes.length,
    });
  }, [formatPipelineHook.result, storyHook.state.breakdown, videoStateSnapshot.contentPlan]);

  useEffect(() => {
    onCanOpenEditorChange(canOpenEditor);
  }, [canOpenEditor, onCanOpenEditorChange]);

  // ── Handlers ──

  const handleFormatExecute = useCallback(() => {
    if (formatPipelineHook.selectedFormat === 'movie-animation') {
      const idea = formatPipelineHook.idea || storyInitialTopic || topic || '';
      const genre = formatPipelineHook.selectedGenre || 'Drama';
      onSetStoryInitialTopic(idea);
      storyHook.updateGenre(genre);
      storyHook.generateBreakdown(idea, genre);
    } else {
      const user = getCurrentUser();
      const userId = user?.uid ?? 'anonymous';
      const effectiveProjectId = projectId ?? `fp_${Date.now()}`;
      formatPipelineHook.execute(userId, effectiveProjectId);
    }
  }, [formatPipelineHook, storyHook, storyInitialTopic, topic, projectId, onSetStoryInitialTopic]);

  const handleContinueFromFormatPipeline = useCallback(() => {
    if (!formatPipelineHook.result?.success) {
      return;
    }

    const partialResults = formatPipelineHook.result.partialResults ?? {};
    const pipelineSessionId = typeof partialResults.sessionId === 'string'
      ? partialResults.sessionId
      : undefined;
    const storedState = pipelineSessionId ? storyModeStore.get(pipelineSessionId) : undefined;
    const screenplay = normalizePipelineScenes(
      storedState?.screenplay?.length ? storedState.screenplay : partialResults.screenplay,
    );

    if (screenplay.length === 0) {
      return;
    }

    const shotlist = storedState?.shotlist?.length
      ? storedState.shotlist
      : Array.isArray(partialResults.shotlist) && partialResults.shotlist.length
        ? partialResults.shotlist
        : buildFallbackShotlist(screenplay, partialResults.visuals);

    const importedNarrationSegments = Array.isArray(partialResults.narrationSegments)
      ? partialResults.narrationSegments.flatMap((segment: NarrationSegment | StoryNarrationSegment) => {
        const seg = segment as NarrationSegment & StoryNarrationSegment;
        const audioUrl = typeof seg?.audioUrl === 'string' && seg.audioUrl
          ? seg.audioUrl
          : seg?.audioBlob instanceof Blob
            ? URL.createObjectURL(seg.audioBlob)
            : '';

        if (!audioUrl) {
          return [];
        }

        return [{
          sceneId: String(seg.sceneId || ''),
          audioUrl,
          duration: Number(seg.audioDuration ?? seg.duration ?? 0),
          text: String(seg.transcript ?? seg.text ?? ''),
        }];
      })
      : undefined;

    const importedTopic = formatPipelineHook.idea
      || storedState?.topic
      || storyInitialTopic
      || topic
      || screenplay[0]?.heading
      || 'Imported Story';

    const importedState: StoryState = {
      currentStep: importedNarrationSegments?.length ? 'narration' : shotlist.length > 0 ? 'storyboard' : 'script',
      breakdown: screenplay,
      script: {
        title: importedTopic,
        scenes: screenplay,
      },
      characters: storedState?.characters || [],
      shotlist,
      genre: formatPipelineHook.selectedGenre || storyHook.state.genre,
      visualStyle: storyHook.state.visualStyle || paramsStyle || 'Cinematic',
      aspectRatio: partialResults.aspectRatio || storyHook.state.aspectRatio || '16:9',
      imageProvider: storyHook.state.imageProvider || 'gemini',
      scenesWithShots: Array.from(new Set(shotlist.map((shot: ShotlistEntry) => shot.sceneId))),
      scenesWithVisuals: Array.from(new Set(shotlist.filter((shot: ShotlistEntry) => Boolean(shot.imageUrl)).map((shot: ShotlistEntry) => shot.sceneId))),
      ...(importedNarrationSegments?.length ? {
        narrationSegments: importedNarrationSegments,
        scenesWithNarration: Array.from(new Set(importedNarrationSegments.map((segment: { sceneId: string }) => segment.sceneId))),
      } : {}),
    };

    onSetStoryInitialTopic(importedTopic);
    storyHook.importProject(importedState, {
      sessionId: pipelineSessionId ?? storyHook.sessionId ?? null,
      topic: importedTopic,
    });
    onSetStudioMode('story');
  }, [formatPipelineHook, storyHook, storyInitialTopic, topic, paramsStyle, onSetStoryInitialTopic, onSetStudioMode]);

  const handleOpenInEditor = useCallback(() => {
    const editorStore = useVideoEditorStore.getState();
    editorStore.reset();
    editorStore.addTrack('video', 'Visuals');
    editorStore.addTrack('audio', 'Voiceover');

    const { visuals, narrationSegments, contentPlan, mergedAudioUrl } = videoStateSnapshot;

    const pipelineResults = formatPipelineHook.result?.success ? formatPipelineHook.result.partialResults : null;
    const editorVisuals: (GeneratedImage | ShotlistEntry)[] = pipelineResults?.visuals?.length
      ? pipelineResults.visuals
      : storyHook.state.shotlist?.length
        ? storyHook.state.shotlist
        : visuals;
    const editorNarrations: (NarrationSegment | StoryNarrationSegment)[] = pipelineResults?.narrationSegments?.length
      ? pipelineResults.narrationSegments
      : storyHook.state.narrationSegments?.length
        ? storyHook.state.narrationSegments
        : narrationSegments;
    const editorBreakdown: (ScreenplayScene | Scene)[] = pipelineResults?.screenplay?.length
      ? pipelineResults.screenplay
      : storyHook.state.breakdown?.length
        ? storyHook.state.breakdown
        : contentPlan?.scenes || [];

    if (editorBreakdown.length === 0) {
      return;
    }

    window.setTimeout(() => {
      const state = useVideoEditorStore.getState();
      const videoTrack = state.tracks.find((track) => track.type === 'video');
      const audioTrack = state.tracks.find((track) => track.type === 'audio');

      let currentTime = 0;
      editorBreakdown.forEach((scene: ScreenplayScene | Scene, idx: number) => {
        const sceneAny = scene as ScreenplayScene & Scene;
        const sceneId = sceneAny.id;
        const visual = editorVisuals.find((item: GeneratedImage | ShotlistEntry) => {
          const v = item as GeneratedImage & ShotlistEntry;
          return (v.sceneId || v.promptId || v.id) === sceneId;
        });
        const narration = editorNarrations.find((item: NarrationSegment | StoryNarrationSegment) => item.sceneId === sceneId);
        const narrationAny = narration as (NarrationSegment & StoryNarrationSegment) | undefined;
        const duration = narrationAny?.audioDuration ?? narrationAny?.duration ?? sceneAny.duration ?? 5;

        if (visual?.imageUrl && videoTrack) {
          state.addClip({
            trackId: videoTrack.id,
            type: 'video',
            startTime: currentTime,
            duration,
            name: sceneAny.heading || `Scene ${idx + 1}`,
            sourceUrl: visual.imageUrl,
            thumbnailUrl: visual.imageUrl,
            inPoint: 0,
            outPoint: duration,
          });
        }

        if (narration && audioTrack) {
          const narrationUrl = narrationAny?.audioBlob ? URL.createObjectURL(narrationAny.audioBlob) : narrationAny?.audioUrl;
          if (typeof narrationUrl === 'string' && narrationUrl.length > 0) {
            state.addClip({
              trackId: audioTrack.id,
              type: 'audio',
              startTime: currentTime,
              duration,
              name: `Voiceover ${idx + 1}`,
              sourceUrl: narrationUrl,
              inPoint: 0,
              outPoint: duration,
            });
          }
        }

        currentTime += duration;
      });

      if (typeof mergedAudioUrl === 'string' && mergedAudioUrl.length > 0) {
        editorStore.addTrack('audio', 'Music');
        window.setTimeout(() => {
          const state2 = useVideoEditorStore.getState();
          const musicTrack = [...state2.tracks].reverse().find((track) => track.type === 'audio' && track.name === 'Music');
          if (musicTrack) {
            state2.addClip({
              trackId: musicTrack.id,
              type: 'audio',
              startTime: 0,
              duration: currentTime,
              name: 'Background Music',
              sourceUrl: mergedAudioUrl,
              inPoint: 0,
              outPoint: currentTime,
            });
          }
        }, 0);
      }

      onSetStudioMode('editor');
    }, 50);
  }, [formatPipelineHook.result, storyHook.state, videoStateSnapshot, onSetStudioMode]);

  // Expose openInEditor to shell (for header Editor button)
  const handleOpenInEditorRef = useRef(handleOpenInEditor);
  useEffect(() => {
    handleOpenInEditorRef.current = handleOpenInEditor;
  });
  useEffect(() => {
    onOpenInEditorRef(() => handleOpenInEditorRef.current());
  }, [onOpenInEditorRef]);

  return (
    <StoryWorkspaceErrorBoundary
      storyState={storyHook.state}
      onRestore={() => {
        console.log('[StoryWorkspace] Restoring from last saved state');
      }}
    >
      <StoryWorkspace
        storyState={storyHook.state}
        initialTopic={storyInitialTopic || topic || ''}
        formatPipelineHook={formatPipelineHook}
        onFormatExecute={handleFormatExecute}
        onOpenInEditor={handleOpenInEditor}
        onContinueFromFormatPipeline={handleContinueFromFormatPipeline}
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
            storyHook.generateBreakdown(storyInitialTopic || topic || 'A generic story', 'Drama');
          } else if (step === 'breakdown') {
            storyHook.generateScreenplay();
          } else if (step === 'script') {
            storyHook.setStep('style');
          } else if (step === 'style') {
            storyHook.generateCharacters();
          } else if (step === 'characters') {
            if (isLocked) {
              storyHook.generateShots();
            } else {
              console.warn('Story should be locked before generating shots');
              storyHook.setStep('script');
            }
          } else if (step === 'shots') {
            storyHook.generateVisuals();
          }
        }}
        onGenerateShots={storyHook.generateShots}
        onGenerateVisuals={storyHook.generateVisuals}
        stageProgress={storyHook.getStageProgress()}
        isProcessing={storyHook.isProcessing}
        progress={storyHook.progress}
        processingShots={storyHook.processingShots}
        onLockStory={storyHook.lockStory}
        onUpdateVisualStyle={storyHook.updateVisualStyle}
        onUpdateAspectRatio={storyHook.updateAspectRatio}
        onUpdateImageProvider={storyHook.updateImageProvider}
        onUpdateDeapiImageModel={storyHook.updateDeapiImageModel}
        onUpdateStyleConsistency={storyHook.updateStyleConsistency}
        onUpdateBgRemoval={storyHook.updateBgRemoval}
        onUpdateTtsSettings={storyHook.updateTtsSettings}
        error={storyHook.error}
        onClearError={storyHook.clearError}
        onRetry={storyHook.retryLastOperation}
        onUpdateShot={storyHook.updateShot}
        onGenerateNarration={storyHook.generateNarration}
        onAnimateShots={storyHook.animateShots}
        onExportFinalVideo={storyHook.exportFinalVideo}
        onDownloadVideo={storyHook.downloadVideo}
        allScenesHaveNarration={storyHook.allScenesHaveNarration}
        allShotsHaveAnimation={storyHook.allShotsHaveAnimation}
        onReorderShots={storyHook.reorderShots}
        projectId={storyHook.sessionId ?? undefined}
        onApplyTemplate={storyHook.applyTemplate}
        onImportProject={storyHook.importProject}
      />
    </StoryWorkspaceErrorBoundary>
  );
}
