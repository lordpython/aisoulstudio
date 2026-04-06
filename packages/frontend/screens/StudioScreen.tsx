/**
 * Studio Screen - Unified creation workspace
 *
 * Thin shell that handles URL parsing, mode routing, shared state/hooks,
 * and Suspense wrapping. Mode-specific UI is delegated to lazy-loaded panels:
 *   - VideoProductionPanel (chat/video mode)
 *   - StoryPanel (story mode)
 *   - MusicPanel (editor mode)
 *
 * Heavy hooks (useVideoProductionRefactored, studioAgent, useStoryGeneration,
 * useFormatPipeline) have been moved into their respective panels so they are
 * excluded from this shell's chunk and are only loaded when the panel is used.
 *
 * Requirements: 6.1-6.6, 2.5, 1.5, 9.1, 9.4
 */

import React, { useState, useCallback, useRef, useEffect, useMemo, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Video,
  Music as MusicIcon,
  Image as ImageIcon,
  Download,
  RotateCcw,
  BarChart3,
  Edit3,
  Layers,
  Settings,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { useModalState } from '@/hooks/useModalState';
import { useAppStore } from '@/stores';
import { useProjectSession } from '@/hooks/useProjectSession';

// Layout & UI Components
import { ScreenLayout } from '@/components/layout/ScreenLayout';

// Chat Components
import { ChatInput } from '@/components/chat';

// Types
import { AppState } from '@/types';
import type { ContentPlan, NarrationSegment, GeneratedImage } from '@/types';
import type { VideoStateSnapshot } from './VideoProductionPanel';

// Lazy-loaded panels
const VideoProductionPanel = React.lazy(() =>
  import('./VideoProductionPanel').then((m) => ({ default: m.VideoProductionPanel }))
);
const StoryPanel = React.lazy(() =>
  import('./StoryPanel').then((m) => ({ default: m.StoryPanel }))
);
const MusicPanel = React.lazy(() =>
  import('./MusicPanel').then((m) => ({ default: m.MusicPanel }))
);

// ============================================================
// Types & Helpers
// ============================================================

export interface StudioParams {
  mode?: 'video' | 'music' | 'story';
  style?: string;
  duration?: number;
  topic?: string;
  projectId?: string;
}

export function parseStudioParams(searchParams: URLSearchParams): StudioParams {
  const mode = searchParams.get('mode');
  const style = searchParams.get('style');
  const duration = searchParams.get('duration');
  const topic = searchParams.get('topic');
  const projectId = searchParams.get('projectId');

  return {
    mode: mode === 'video' || mode === 'music' || mode === 'story' ? mode : undefined,
    style: style || undefined,
    duration: duration ? parseInt(duration, 10) : undefined,
    topic: topic || undefined,
    projectId: projectId || undefined,
  };
}

export function canOpenStudioEditor(input: {
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

// ============================================================
// Main Component
// ============================================================

export default function StudioScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = parseStudioParams(searchParams);

  // Project session management
  const {
    project,
    sessionId,
    isLoading: isProjectLoading,
    error: projectError,
    restoredState,
    syncProjectMetadata,
    flushSession,
  } = useProjectSession(params.projectId);

  // Modal state (unified)
  const {
    showExport, setShowExport,
    showQuality, setShowQuality,
    showSceneEditor, setShowSceneEditor,
    showMusic, setShowMusic,
    showTimeline, setShowTimeline,
  } = useModalState();

  // View mode toggle
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  const [studioMode, setStudioMode] = useState<'chat' | 'story' | 'editor'>(
    params.mode === 'story' ? 'story' : 'chat'
  );

  // Story initial topic (shared between shell and StoryPanel)
  const [storyInitialTopic, setStoryInitialTopic] = useState(params.mode === 'story' ? (params.topic || '') : '');

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [musicModalMode, setMusicModalMode] = useState<'generate' | 'remix'>('generate');

  // Chat input state (shared with VideoProductionPanel)
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [panelAppState, setPanelAppState] = useState<AppState>(AppState.IDLE);

  // Lightweight video state snapshot (updated by VideoProductionPanel via callback)
  const [videoStateSnapshot, setVideoStateSnapshot] = useState<VideoStateSnapshot>({
    contentPlan: null,
    isVideoReady: false,
    topic: '',
    visuals: [],
    narrationSegments: [],
    mergedAudioUrl: null,
    qualityReport: null,
  });

  // canOpenEditor updated by StoryPanel
  const [canOpenEditor, setCanOpenEditor] = useState(false);

  // Ref callbacks from VideoProductionPanel
  const panelResetRef = useRef<(() => void) | null>(null);
  const panelSubmitRef = useRef<(() => void) | null>(null);
  const panelOpenInEditorRef = useRef<(() => void) | null>(null);

  // ── Sync studioMode from URL params ──
  useEffect(() => {
    if (params.mode === 'story' && studioMode !== 'story') {
      setStudioMode('story');
    }
  }, [params.mode]);

  // ── Stable callbacks passed to panels ──

  const handleVideoStateChange = useCallback((snapshot: VideoStateSnapshot) => {
    setVideoStateSnapshot(snapshot);
  }, []);

  const handleResetRef = useCallback((resetFn: () => void) => {
    panelResetRef.current = resetFn;
  }, []);

  const handleSubmitRef = useCallback((submitFn: () => void) => {
    panelSubmitRef.current = submitFn;
  }, []);

  const handleCanOpenEditorChange = useCallback((canOpen: boolean) => {
    setCanOpenEditor(canOpen);
  }, []);

  const handleOpenInEditorRef = useCallback((fn: () => void) => {
    panelOpenInEditorRef.current = fn;
  }, []);

  // Header "New Project" button handler — delegates to VideoProductionPanel's reset
  const handleReset = useCallback(() => {
    panelResetRef.current?.();
  }, []);

  // ── Render helpers ──

  const isVideoReady = videoStateSnapshot.isVideoReady;
  const contentPlan = videoStateSnapshot.contentPlan;
  const qualityReport = videoStateSnapshot.qualityReport;

  // App store for message count (used for "New Project" button visibility)
  const storeMessages = useAppStore((s) => s.messages);

  // ── Header actions ──
  const headerActions = (
    <div className="flex items-center gap-2" role="toolbar" aria-label="Studio actions">
      {/* Mode Toggle Selection */}
      <div className="flex items-center bg-secondary border border-border rounded-lg p-0.5 me-4" role="toolbar" aria-label={t('studio.modeToggle')}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStudioMode('chat')}
          className={cn(
            "h-9 px-3 text-xs uppercase font-bold transition-all",
            studioMode === 'chat' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
          )}
          aria-pressed={studioMode === 'chat'}
        >
          {t('studio.chatMode')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStudioMode('story')}
          className={cn(
            "h-9 px-3 text-xs uppercase font-bold transition-all",
            studioMode === 'story' ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
          )}
          aria-pressed={studioMode === 'story'}
        >
          {t('studio.storyMode')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => panelOpenInEditorRef.current?.()}
          disabled={!canOpenEditor}
          className={cn(
            "h-9 px-3 text-xs uppercase font-bold transition-all",
            studioMode === 'editor'
              ? "bg-primary text-primary-foreground shadow-lg"
              : "text-muted-foreground hover:text-foreground",
            !canOpenEditor && "opacity-50 cursor-not-allowed hover:text-muted-foreground"
          )}
          aria-pressed={studioMode === 'editor'}
        >
          {t('studio.editor')}
        </Button>
      </div>

      {/* Simple/Advanced toggle */}
      <div className="flex items-center gap-1 bg-secondary rounded-lg p-1" role="group" aria-label="View mode">
        <button
          onClick={() => setViewMode('simple')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
            viewMode === 'simple'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-pressed={viewMode === 'simple'}
        >
          {t('studio.simpleMode')}
        </button>
        <button
          onClick={() => setViewMode('advanced')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
            viewMode === 'advanced'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-pressed={viewMode === 'advanced'}
        >
          {t('studio.advancedMode')}
        </button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowSettings(true)}
        className="text-muted-foreground hover:text-foreground hover:bg-secondary"
      >
        <Settings className="w-4 h-4 me-2" />
        {t('studio.settings')}
      </Button>

      {/* Action buttons */}
      {(storeMessages.length > 1 || contentPlan) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary"
        >
          <RotateCcw className="w-4 h-4 me-2" aria-hidden="true" />
          {t('studio.newProject')}
        </Button>
      )}
      {isVideoReady && (
        <>
          <Button
            variant={showSceneEditor ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowSceneEditor(!showSceneEditor)}
            className={cn(
              'gap-2',
              showSceneEditor
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
            aria-pressed={showSceneEditor}
          >
            <Edit3 className="w-4 h-4" aria-hidden="true" />
            {t('studio.edit')}
          </Button>
          {qualityReport && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQuality(true)}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              {t('studio.quality')}
            </Button>
          )}
          <Button
            variant={showTimeline ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowTimeline(!showTimeline)}
            className={cn(
              'gap-2',
              showTimeline
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            <Layers className="w-4 h-4" />
            {t('studio.timeline')}
          </Button>
          <Button
            onClick={() => setShowExport(true)}
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20"
          >
            <Download className="w-4 h-4" />
            {t('studio.export')}
          </Button>
        </>
      )}
    </div>
  );

  // Loading state for project
  if (isProjectLoading) {
    return (
      <ScreenLayout
        title={t('studio.title')}
        showBackButton
        onBack={() => navigate('/')}
      >
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-white/60">{t('studio.loadingProject') || 'Loading project...'}</p>
          </div>
        </div>
      </ScreenLayout>
    );
  }

  // Error state for project loading
  if (projectError) {
    return (
      <ScreenLayout
        title={t('studio.title')}
        showBackButton
        onBack={() => navigate('/')}
      >
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-center max-w-md">
            <p className="text-destructive mb-4">{projectError}</p>
            <Button onClick={() => navigate('/projects')}>
              {t('common.back')}
            </Button>
          </div>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout
      title={t('studio.title')}
      showBackButton
      onBack={() => navigate('/')}
      headerActions={headerActions}
      contentClassName={cn("py-8", studioMode === 'story' && "p-0 h-full")}
      maxWidth={studioMode === 'story' || viewMode === 'advanced' ? 'full' : '3xl'}
      footer={
        studioMode === 'chat' ? (
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => panelSubmitRef.current?.()}
            placeholder={t('studio.placeholder')}
            disabled={panelAppState !== AppState.IDLE}
            isLoading={isProcessing || panelAppState !== AppState.IDLE}
            isRTL={isRTL}
            hintText={`${t('studio.send')}(Enter)`}
            inputId="studio-input"
          />
        ) : null
      }
    >
      <Suspense fallback={
        <div className="flex items-center justify-center h-full min-h-[50vh]" role="status" aria-live="polite">
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">{t('common.loading') || 'Loading...'}</span>
        </div>
      }>
        <AnimatePresence mode="wait">
        {studioMode === 'editor' ? (
          <motion.div
            key="editor"
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(4px)' }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="h-full"
          >
            <MusicPanel className="h-full" />
          </motion.div>
        ) : studioMode === 'story' ? (
          <motion.div
            key="story"
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(4px)' }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="h-full"
          >
            <StoryPanel
              projectId={params.projectId}
              paramsStyle={params.style}
              storyInitialTopic={storyInitialTopic}
              onSetStoryInitialTopic={setStoryInitialTopic}
              onSetStudioMode={setStudioMode}
              videoStateSnapshot={videoStateSnapshot}
              onCanOpenEditorChange={handleCanOpenEditorChange}
              onOpenInEditorRef={handleOpenInEditorRef}
            />
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(4px)' }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
          <VideoProductionPanel
            projectId={params.projectId}
            sessionId={sessionId}
            project={project}
            restoredState={restoredState}
            flushSession={flushSession}
            syncProjectMetadata={syncProjectMetadata}
            paramsStyle={params.style}
            paramsTopic={params.topic}
            paramsDuration={params.duration}
            paramsMode={params.mode}
            isProjectLoading={isProjectLoading}
            showExport={showExport}
            setShowExport={setShowExport}
            showQuality={showQuality}
            setShowQuality={setShowQuality}
            showSceneEditor={showSceneEditor}
            setShowSceneEditor={setShowSceneEditor}
            showMusic={showMusic}
            setShowMusic={setShowMusic}
            showTimeline={showTimeline}
            setShowTimeline={setShowTimeline}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            musicModalMode={musicModalMode}
            setMusicModalMode={setMusicModalMode}
            setStudioMode={setStudioMode}
            onVideoStateChange={handleVideoStateChange}
            onResetRef={handleResetRef}
            onSubmitRef={handleSubmitRef}
            input={input}
            setInput={setInput}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
            appStateForFooter={panelAppState}
            onAppStateChange={setPanelAppState}
          />
          </motion.div>
        )}
        </AnimatePresence>
      </Suspense>
    </ScreenLayout>
  );
}
