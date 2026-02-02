/**
 * Visualizer Screen - Audio-first lyric video creation
 *
 * Refactored to use extracted components for better maintainability.
 * Requirements: 1.1, 9.1, 9.4
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  RotateCcw,
  Wand2,
  Video,
  Loader2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { useLyricLens } from '@/hooks/useLyricLens';
import { useModalState } from '@/hooks/useModalState';
import { AppState, GeneratedImage } from '@/types';

// Layout Components
import { ScreenLayout } from '@/components/layout/ScreenLayout';

// Visualizer Components
import { AudioUploadForm, VisualPreview, SceneThumbnails } from '@/components/visualizer';

// Feature Components
import { TimelinePlayer } from '@/components/TimelinePlayer';
import { QuickExport } from '@/components/QuickExport';
import { ErrorState } from '@/components/ui/ErrorState';

// Services
import { animateImageWithDeApi, animateImageBatch } from '@/services/deapiService';

export default function VisualizerScreen() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();

  // Modal state
  const { showExport, setShowExport } = useModalState();

  // LyricLens hook for audio processing
  const {
    appState,
    songData,
    setSongData,
    errorMsg,
    isBulkGenerating,
    processFile,
    handleGenerateAll,
    resetApp,
    imageProvider,
    setImageProvider,
  } = useLyricLens();

  // Local state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] = useState('Cinematic');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);

  // Animation state
  const [animatingPromptId, setAnimatingPromptId] = useState<string | null>(null);
  const [animationError, setAnimationError] = useState<string | null>(null);
  const [isBatchAnimating, setIsBatchAnimating] = useState(false);
  const [batchAnimationProgress, setBatchAnimationProgress] = useState({ current: 0, total: 0 });

  // ============================================================
  // Computed Values
  // ============================================================

  const hasVisuals = useMemo(() => {
    return songData?.generatedImages && songData.generatedImages.length > 0;
  }, [songData]);

  const currentVisual = useMemo(() => {
    if (!songData || !hasVisuals) return null;
    const currentPrompt = songData.prompts[currentSceneIndex];
    if (!currentPrompt) return null;
    return songData.generatedImages.find(img => img.promptId === currentPrompt.id) || null;
  }, [songData, hasVisuals, currentSceneIndex]);

  const isReadyForExport = useMemo(() => {
    return songData && hasVisuals && songData.generatedImages.length >= songData.prompts.length * 0.5;
  }, [songData, hasVisuals]);

  const animatableImagesCount = useMemo(() => {
    if (!songData) return 0;
    return songData.generatedImages.filter(img => img.type !== 'video').length;
  }, [songData]);

  const isProcessing = appState === AppState.PROCESSING_AUDIO ||
    appState === AppState.TRANSCRIBING ||
    appState === AppState.ANALYZING_LYRICS ||
    appState === AppState.GENERATING_PROMPTS;

  const isReady = appState === AppState.READY && songData;

  // ============================================================
  // Effects
  // ============================================================

  // Update current scene based on playback time using binary search for accurate sync
  // This uses absolute video currentTime to prevent cumulative drift over long durations
  useEffect(() => {
    if (!songData || !songData.prompts.length || duration <= 0) return;

    // Binary search to find the correct scene index for the current time
    // This is more efficient and accurate than linear search, especially for long videos
    const prompts = songData.prompts;
    let left = 0;
    let right = prompts.length - 1;
    let targetIndex = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const prompt = prompts[mid];
      if (!prompt) break;

      const startTime = prompt.timestampSeconds || 0;
      const nextPrompt = prompts[mid + 1];
      const endTime = nextPrompt?.timestampSeconds || duration;

      if (currentTime >= startTime && currentTime < endTime) {
        // Found the exact scene
        targetIndex = mid;
        break;
      } else if (currentTime < startTime) {
        // Current time is before this scene, search left
        right = mid - 1;
        targetIndex = Math.max(0, mid - 1);
      } else {
        // Current time is after this scene, search right
        left = mid + 1;
        targetIndex = mid;
      }
    }

    // Clamp to valid range
    targetIndex = Math.max(0, Math.min(targetIndex, prompts.length - 1));

    // Only update if the index actually changed (prevents unnecessary re-renders)
    if (targetIndex !== currentSceneIndex) {
      setCurrentSceneIndex(targetIndex);
    }
  }, [currentTime, songData, duration]); // Removed currentSceneIndex from deps to prevent circular updates

  // ============================================================
  // Handlers
  // ============================================================

  const handleStartProcessing = useCallback(async () => {
    if (!audioFile) return;
    await processFile(audioFile, selectedStyle);
  }, [audioFile, selectedStyle, processFile]);

  const handleGenerateVisuals = useCallback(async () => {
    await handleGenerateAll(selectedStyle, '16:9');
  }, [selectedStyle, handleGenerateAll]);

  const handleAnimateImage = useCallback(async (promptId: string) => {
    if (!songData || animatingPromptId) return;

    const image = songData.generatedImages.find(img => img.promptId === promptId);
    if (!image || !image.imageUrl || image.type === 'video') return;

    const prompt = songData.prompts.find(p => p.id === promptId);
    if (!prompt) return;

    setAnimatingPromptId(promptId);
    setAnimationError(null);

    try {
      const videoBase64 = await animateImageWithDeApi(
        image.imageUrl,
        prompt.text,
        '16:9'
      );

      const updatedImage: GeneratedImage = {
        ...image,
        promptId: image.promptId, // Explicitly pass to avoid optional spread issues
        imageUrl: videoBase64,
        type: 'video',
        baseImageUrl: image.imageUrl,
      };

      setSongData(prev => {
        if (!prev) return null;
        return {
          ...prev,
          generatedImages: prev.generatedImages.map(img =>
            img.promptId === promptId ? updatedImage : img
          ),
        };
      });
    } catch (error: any) {
      console.error('Animation failed:', error);
      setAnimationError(error.message || 'Animation failed');
    } finally {
      setAnimatingPromptId(null);
    }
  }, [songData, animatingPromptId, setSongData]);

  const handleAnimateAll = useCallback(async () => {
    if (!songData || isBatchAnimating) return;

    const imagesToAnimate = songData.generatedImages.filter(img => img.type !== 'video');

    if (imagesToAnimate.length === 0) {
      setAnimationError('All images are already animated');
      return;
    }

    setIsBatchAnimating(true);
    setBatchAnimationProgress({ current: 0, total: imagesToAnimate.length });
    setAnimationError(null);

    // Prepare batch items with prompts
    const batchItems = imagesToAnimate
      .map(image => {
        const prompt = songData.prompts.find(p => p.id === image.promptId);
        if (!prompt) return null;
        return {
          id: image.promptId,
          imageUrl: image.imageUrl,
          prompt: prompt.text,
          aspectRatio: '16:9' as const,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    try {
      // Use parallel batch animation (concurrency: 2 for video generation)
      const results = await animateImageBatch(
        batchItems,
        2, // Lower concurrency for video generation (more resource intensive)
        (progress) => {
          setBatchAnimationProgress({ current: progress.completed, total: progress.total });
          // Show which one is currently being processed
          const currentItem = batchItems[progress.completed - 1];
          if (currentItem) {
            setAnimatingPromptId(currentItem.id);
          }
        }
      );

      // Update all successful results
      setSongData(prev => {
        if (!prev) return null;
        const updatedImages = prev.generatedImages.map(img => {
          const result = results.find(r => r.id === img.promptId);
          if (result?.success && result.imageUrl) {
            return {
              ...img,
              imageUrl: result.imageUrl,
              type: 'video' as const,
              baseImageUrl: img.imageUrl,
            };
          }
          return img;
        });
        return { ...prev, generatedImages: updatedImages };
      });

      // Report any failures
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        console.error(`${failures.length} animations failed:`, failures.map(f => f.error));
      }
    } catch (error: any) {
      console.error('Batch animation failed:', error);
      setAnimationError(error.message || 'Batch animation failed');
    }

    setIsBatchAnimating(false);
    setAnimatingPromptId(null);
    setBatchAnimationProgress({ current: 0, total: 0 });
  }, [songData, isBatchAnimating, setSongData]);

  const handleReset = useCallback(() => {
    resetApp();
    setAudioFile(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAnimationError(null);
  }, [resetApp]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSceneSelect = useCallback((index: number, timestampSeconds?: number) => {
    setCurrentSceneIndex(index);
    if (timestampSeconds !== undefined) {
      handleSeek(timestampSeconds);
    }
  }, [handleSeek]);

  const handleExport = useCallback(async (
    config: { presetId: string; width: number; height: number; orientation: 'landscape' | 'portrait'; quality: string },
    onProgress?: (percent: number) => void
  ) => {
    if (!songData || !hasVisuals) {
      throw new Error('Video not ready for export');
    }

    const { exportVideoWithFFmpeg } = await import('@/services/ffmpeg/exporters');

    const blob = await exportVideoWithFFmpeg(
      songData,
      (p) => onProgress?.(p.progress),
      {
        orientation: config.orientation,
        useModernEffects: true,
        transitionType: 'dissolve',
        transitionDuration: 1.5,
        contentMode: 'music',
      }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${songData.fileName?.replace(/\.[^/.]+$/, '') || 'lyric-video'}-${config.presetId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [songData, hasVisuals]);

  // ============================================================
  // Render Helpers
  // ============================================================

  const headerActions = isReady ? (
    <div className={cn('flex items-center gap-2', isRTL && 'flex-row-reverse')}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleReset}
        className="text-white/60 hover:text-white"
      >
        <RotateCcw className="w-4 h-4 me-2" aria-hidden="true" />
        {t('common.reset')}
      </Button>

      {!isBulkGenerating && songData && songData.generatedImages.length < songData.prompts.length && (
        <Button
          onClick={handleGenerateVisuals}
          size="sm"
          className="bg-cyan-600 hover:bg-cyan-500"
        >
          <Wand2 className="w-4 h-4 me-2" aria-hidden="true" />
          Generate Visuals
        </Button>
      )}

      {isBulkGenerating && songData && (
        <div className={cn('flex items-center gap-2 text-cyan-400 text-sm', isRTL && 'flex-row-reverse')}>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Generating ({songData.generatedImages.length}/{songData.prompts.length})
        </div>
      )}

      {hasVisuals && animatableImagesCount > 0 && !isBatchAnimating && (
        <Button
          onClick={handleAnimateAll}
          size="sm"
          className="bg-purple-600 hover:bg-purple-500"
        >
          <Video className="w-4 h-4 me-2" aria-hidden="true" />
          Animate All ({animatableImagesCount})
        </Button>
      )}

      {isBatchAnimating && (
        <div className={cn('flex items-center gap-2 text-purple-400 text-sm', isRTL && 'flex-row-reverse')}>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Animating ({batchAnimationProgress.current}/{batchAnimationProgress.total})
        </div>
      )}

      {isReadyForExport && (
        <Button
          onClick={() => setShowExport(true)}
          size="sm"
          className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500"
        >
          <Download className="w-4 h-4 me-2" aria-hidden="true" />
          {t('studio.export')}
        </Button>
      )}
    </div>
  ) : undefined;

  // ============================================================
  // Render
  // ============================================================

  return (
    <ScreenLayout
      title={t('visualizer.title')}
      showBackButton
      onBack={() => navigate('/')}
      headerActions={headerActions}
      maxWidth="full"
      centerContent={!isReady}
      footer={
        <footer className="p-4 md:p-6 text-center text-sm text-white/40">
          Powered by Gemini AI
        </footer>
      }
    >
      <AnimatePresence mode="wait">
        {!isReady ? (
          /* Upload State */
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex justify-center"
          >
            <AudioUploadForm
              audioFile={audioFile}
              onAudioFileChange={setAudioFile}
              selectedStyle={selectedStyle}
              onStyleChange={setSelectedStyle}
              imageProvider={imageProvider}
              onProviderChange={setImageProvider}
              appState={appState}
              errorMsg={errorMsg || undefined}
              onStartProcessing={handleStartProcessing}
            />
          </motion.div>
        ) : (
          /* Ready State - Player with Visual Preview */
          <motion.div
            key="player"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-5xl mx-auto w-full px-4"
          >
            {/* Header Info */}
            <div className={cn('mb-6', isRTL && 'text-right')}>
              <h2 className="text-xl font-semibold">{songData?.fileName}</h2>
              <p className="text-sm text-white/60">
                {songData?.parsedSubtitles.length} subtitles • {songData?.prompts.length} scenes
                {hasVisuals && ` • ${songData?.generatedImages.length} visuals`}
              </p>
            </div>

            {/* Visual Preview Section */}
            {hasVisuals && songData && (
              <div className="mb-6">
                <VisualPreview
                  currentVisual={currentVisual}
                  currentSceneIndex={currentSceneIndex}
                  totalScenes={songData.prompts.length}
                  isPlaying={isPlaying}
                  onPlayPause={handlePlayPause}
                  currentTime={currentTime}
                  subtitles={songData.parsedSubtitles}
                  animatingPromptId={animatingPromptId}
                  onAnimateImage={handleAnimateImage}
                  isRTL={isRTL}
                  className="mb-4"
                />

                <SceneThumbnails
                  prompts={songData.prompts}
                  generatedImages={songData.generatedImages}
                  currentSceneIndex={currentSceneIndex}
                  onSceneSelect={handleSceneSelect}
                  animatingPromptId={animatingPromptId}
                />

                {/* Animation error message */}
                {animationError && (
                  <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm flex items-center justify-between">
                    <span>{animationError}</span>
                    <button
                      onClick={() => setAnimationError(null)}
                      className="p-1 hover:bg-white/10 rounded"
                      aria-label="Dismiss error"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Timeline Player */}
            {songData && (
              <TimelinePlayer
                audioUrl={songData.audioUrl}
                subtitles={songData.parsedSubtitles}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                onSeek={handleSeek}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                onEnded={() => setIsPlaying(false)}
                contentMode="music"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export Modal */}
      <QuickExport
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        onExport={handleExport}
        videoTitle={songData?.fileName?.replace(/\.[^/.]+$/, '') || 'lyric-video'}
        duration={duration}
      />
    </ScreenLayout>
  );
}
