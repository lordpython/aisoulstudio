/**
 * PreviewScreen - Full-screen video preview before export
 *
 * Provides playback controls, aspect ratio toggle, and quick export CTA.
 * Loads project state from the production store and renders via TimelinePlayer.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Minimize2,
  Download,
  ArrowLeft,
  Monitor,
  Smartphone,
  Square,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { ScreenLayout } from '@/components/layout/ScreenLayout';
import { useProjectSession } from '@/hooks/useProjectSession';
import { uiLogger } from '@/services/infrastructure/logger';

const log = uiLogger.child('Preview');

const SKIP_SECONDS = 5;

type AspectMode = '16:9' | '9:16' | '1:1';

const ASPECT_OPTIONS: { mode: AspectMode; icon: typeof Monitor; labelKey: string; fallback: string }[] = [
  { mode: '16:9', icon: Monitor, labelKey: 'preview.landscape', fallback: 'Landscape' },
  { mode: '9:16', icon: Smartphone, labelKey: 'preview.portrait', fallback: 'Portrait' },
  { mode: '1:1', icon: Square, labelKey: 'preview.square', fallback: 'Square' },
];

export default function PreviewScreen() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const {
    project,
    isLoading,
    error: projectError,
    restoredState,
  } = useProjectSession(projectId);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [aspectMode, setAspectMode] = useState<AspectMode>('16:9');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const aspectClass = useMemo(() => {
    switch (aspectMode) {
      case '9:16': return 'aspect-[9/16] max-h-[70vh]';
      case '1:1': return 'aspect-square max-h-[70vh]';
      default: return 'aspect-video max-h-[70vh]';
    }
  }, [aspectMode]);

  const handleExport = useCallback(() => {
    if (projectId) {
      navigate(`/studio?projectId=${projectId}&mode=video`);
    } else {
      navigate('/studio?mode=video');
    }
  }, [navigate, projectId]);

  // Loading state
  if (isLoading) {
    return (
      <ScreenLayout title={t('preview.title') || 'Preview'} showBackButton onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{t('common.loading') || 'Loading...'}</p>
          </div>
        </div>
      </ScreenLayout>
    );
  }

  // Error state
  if (projectError) {
    return (
      <ScreenLayout title={t('preview.title') || 'Preview'} showBackButton onBack={() => navigate(-1)}>
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-center max-w-md">
            <p className="text-destructive mb-4">{projectError}</p>
            <Button onClick={() => navigate('/projects')}>{t('common.back') || 'Back'}</Button>
          </div>
        </div>
      </ScreenLayout>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      {/* Aspect Ratio Toggle */}
      <div className="flex items-center bg-secondary border border-border rounded-lg p-0.5">
        {ASPECT_OPTIONS.map(({ mode, icon: Icon, labelKey, fallback }) => (
          <Button
            key={mode}
            variant="ghost"
            size="sm"
            onClick={() => setAspectMode(mode)}
            className={cn(
              'h-8 px-2.5 text-xs transition-all',
              aspectMode === mode
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={t(labelKey) || fallback}
          >
            <Icon className="w-3.5 h-3.5" />
          </Button>
        ))}
      </div>

      <Button
        onClick={handleExport}
        size="sm"
        className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20"
      >
        <Download className="w-4 h-4" />
        {t('studio.export') || 'Export'}
      </Button>
    </div>
  );

  return (
    <ScreenLayout
      title={project?.title || t('preview.title') || 'Preview'}
      showBackButton
      onBack={() => navigate(-1)}
      headerActions={headerActions}
      maxWidth="full"
    >
      <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-6">
        {/* Video Preview Area */}
        <motion.div
          className={cn(
            'relative w-full mx-auto bg-black/40 rounded-2xl overflow-hidden border border-white/5',
            'shadow-2xl shadow-black/40',
            aspectClass
          )}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* Preview canvas */}
          {!restoredState?.contentPlan ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Play className="w-16 h-16 opacity-20" />
              <p className="text-sm">{t('preview.noContent') || 'No video content to preview'}</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/studio?mode=video')}>
                {t('preview.createVideo') || 'Create a video'}
              </Button>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <canvas
                className="w-full h-full object-contain"
                aria-label="Video preview canvas"
              />
            </div>
          )}
        </motion.div>

        {/* Transport Controls */}
        <motion.div
          className="flex items-center gap-4 bg-secondary/80 backdrop-blur-sm border border-border rounded-full px-6 py-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMuted(!isMuted)}
            className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
            onClick={() => setCurrentTime(Math.max(0, currentTime - SKIP_SECONDS))}
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPlaying(!isPlaying)}
            className={cn(
              'h-10 w-10 p-0 rounded-full',
              isPlaying
                ? 'bg-primary/20 text-primary hover:bg-primary/30'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
            onClick={() => setCurrentTime(Math.min(duration, currentTime + SKIP_SECONDS))}
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          <span className="text-xs text-muted-foreground font-mono min-w-[80px] text-center">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </motion.div>
      </div>
    </ScreenLayout>
  );
}
