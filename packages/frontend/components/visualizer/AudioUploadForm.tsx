/**
 * AudioUploadForm - Audio file upload with style/provider selection
 *
 * Extracted from VisualizerScreen for better maintainability.
 */

import React, { useCallback, useRef } from 'react';
import { Music, Sparkles, Loader2, CheckCircle2, X, Wand2, Film, Image, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { ART_STYLES, VIDEO_PURPOSES, type VideoPurpose } from '@/constants';
import { AppState } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

export interface AudioUploadFormProps {
  /** Selected audio file */
  audioFile: File | null;
  /** Callback when audio file changes */
  onAudioFileChange: (file: File | null) => void;
  /** Selected visual style */
  selectedStyle: string;
  /** Callback when style changes */
  onStyleChange: (style: string) => void;
  /** Selected image provider */
  imageProvider: 'gemini' | 'deapi';
  /** Callback when provider changes */
  onProviderChange: (provider: 'gemini' | 'deapi') => void;
  /** Selected director mode (chain = faster, agent = smarter) */
  directorMode?: 'chain' | 'agent';
  /** Callback when director mode changes */
  onDirectorModeChange?: (mode: 'chain' | 'agent') => void;
  /** Global subject for visual consistency (e.g., "a bearded prophet in flowing robes") */
  globalSubject?: string;
  /** Callback when global subject changes */
  onGlobalSubjectChange?: (subject: string) => void;
  /** Content type: music/lyrics or story/narrative */
  contentType?: 'music' | 'story';
  /** Callback when content type changes */
  onContentTypeChange?: (type: 'music' | 'story') => void;
  /** Video purpose affects prompt generation style */
  videoPurpose?: VideoPurpose;
  /** Callback when video purpose changes */
  onVideoPurposeChange?: (purpose: VideoPurpose) => void;
  /** Aspect ratio for output */
  aspectRatio?: '16:9' | '9:16';
  /** Callback when aspect ratio changes */
  onAspectRatioChange?: (ratio: '16:9' | '9:16') => void;
  /** Generation mode: image or video */
  generationMode?: 'image' | 'video';
  /** Callback when generation mode changes */
  onGenerationModeChange?: (mode: 'image' | 'video') => void;
  /** Video provider when generationMode is video */
  videoProvider?: 'veo' | 'deapi';
  /** Callback when video provider changes */
  onVideoProviderChange?: (provider: 'veo' | 'deapi') => void;
  /** Current app state for processing status */
  appState: AppState;
  /** Error message to display */
  errorMsg?: string;
  /** Callback to start processing */
  onStartProcessing: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Audio upload form with drag & drop, style selection, and provider choice
 */
export function AudioUploadForm({
  audioFile,
  onAudioFileChange,
  selectedStyle,
  onStyleChange,
  imageProvider,
  onProviderChange,
  directorMode = 'chain',
  onDirectorModeChange,
  globalSubject = '',
  onGlobalSubjectChange,
  contentType = 'music',
  onContentTypeChange,
  videoPurpose = 'music_video',
  onVideoPurposeChange,
  aspectRatio = '16:9',
  onAspectRatioChange,
  generationMode = 'image',
  onGenerationModeChange,
  videoProvider = 'veo',
  onVideoProviderChange,
  appState,
  errorMsg,
  onStartProcessing,
  className,
}: AudioUploadFormProps) {
  const { t, isRTL } = useLanguage();
  const audioInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = appState === AppState.PROCESSING_AUDIO ||
    appState === AppState.TRANSCRIBING ||
    appState === AppState.ANALYZING_LYRICS ||
    appState === AppState.GENERATING_PROMPTS;

  const handleAudioSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAudioFileChange(file);
    }
  }, [onAudioFileChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const isAudio = file.type.startsWith('audio/') ||
        file.name.endsWith('.mp3') ||
        file.name.endsWith('.wav');
      if (isAudio) {
        onAudioFileChange(file);
      }
    }
  }, [onAudioFileChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const getProcessingMessage = () => {
    switch (appState) {
      case AppState.TRANSCRIBING:
        return 'Transcribing audio...';
      case AppState.ANALYZING_LYRICS:
        return 'Analyzing content...';
      case AppState.GENERATING_PROMPTS:
        return 'Generating visual prompts...';
      case AppState.PROCESSING_AUDIO:
        return t('common.loading');
      default:
        return t('common.loading');
    }
  };

  return (
    <div className={cn('max-w-2xl w-full', className)}>
      {/* Title */}
      <div className={cn('text-center mb-8', isRTL && 'rtl')}>
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-cyan-600/20 to-blue-600/20 border border-white/10 flex items-center justify-center">
          <Wand2 className="w-8 h-8 text-cyan-400" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold mb-3">{t('visualizer.title')}</h1>
        <p className="text-white/60">{t('visualizer.uploadAudio')}</p>
      </div>

      {/* Form Content */}
      <div className="space-y-4">
        {/* Audio Upload */}
        <div
          onClick={() => audioInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={cn(
            'relative p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer',
            audioFile
              ? 'border-cyan-500/50 bg-cyan-500/5'
              : 'border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10'
          )}
          role="button"
          tabIndex={0}
          aria-label={audioFile ? `Selected: ${audioFile.name}` : 'Click or drag to upload audio'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              audioInputRef.current?.click();
            }
          }}
        >
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg"
            onChange={handleAudioSelect}
            className="hidden"
            aria-hidden="true"
          />
          <div className={cn('flex flex-col items-center gap-4', isRTL && 'rtl')}>
            <div className={cn(
              'w-14 h-14 rounded-xl flex items-center justify-center',
              audioFile ? 'bg-cyan-500/20' : 'bg-white/10'
            )}>
              {audioFile ? (
                <CheckCircle2 className="w-7 h-7 text-cyan-400" aria-hidden="true" />
              ) : (
                <Music className="w-7 h-7 text-white/60" aria-hidden="true" />
              )}
            </div>
            <div className="text-center">
              <p className="font-medium mb-1">
                {audioFile ? audioFile.name : t('visualizer.dropAudio')}
              </p>
              <p className="text-sm text-white/40">
                MP3, WAV, M4A, OGG
              </p>
            </div>
          </div>
          {audioFile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAudioFileChange(null);
              }}
              className="absolute top-4 end-4 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Remove selected file"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Style Selection */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
          <label className="block text-sm font-medium text-white/80 mb-3">
            Visual Style
          </label>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2" role="radiogroup" aria-label="Visual style selection">
            {ART_STYLES.slice(0, 10).map((style) => (
              <button
                key={style}
                role="radio"
                aria-checked={selectedStyle === style}
                onClick={() => onStyleChange(style)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  selectedStyle === style
                    ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        {/* Content Type Selection */}
        {onContentTypeChange && (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <label className="block text-sm font-medium text-white/80 mb-3">
              Content Type
            </label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Content type selection">
              <button
                role="radio"
                aria-checked={contentType === 'music'}
                onClick={() => onContentTypeChange('music')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                  contentType === 'music'
                    ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold">Music / Lyrics</span>
                  <span className="text-xs text-white/50">Song with subtitles</span>
                </div>
              </button>
              <button
                role="radio"
                aria-checked={contentType === 'story'}
                onClick={() => onContentTypeChange('story')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                  contentType === 'story'
                    ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold">Story / Narrative</span>
                  <span className="text-xs text-white/50">Spoken word content</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Video Purpose Selection */}
        {onVideoPurposeChange && (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <label className="block text-sm font-medium text-white/80 mb-3">
              <Film className="w-4 h-4 inline mr-2" aria-hidden="true" />
              Video Purpose
            </label>
            <Select value={videoPurpose} onValueChange={onVideoPurposeChange}>
              <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-white/10">
                {VIDEO_PURPOSES.map((purpose) => (
                  <SelectItem key={purpose.value} value={purpose.value}>
                    {purpose.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Generation Mode Selection */}
        {onGenerationModeChange && (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <label className="block text-sm font-medium text-white/80 mb-3">
              Output Type
            </label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Generation mode selection">
              <button
                role="radio"
                aria-checked={generationMode === 'image'}
                onClick={() => onGenerationModeChange('image')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                  generationMode === 'image'
                    ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold flex items-center gap-2">
                    <Image className="w-4 h-4" aria-hidden="true" />
                    Images
                  </span>
                  <span className="text-xs text-white/50">Static visual scenes</span>
                </div>
              </button>
              <button
                role="radio"
                aria-checked={generationMode === 'video'}
                onClick={() => onGenerationModeChange('video')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                  generationMode === 'video'
                    ? 'bg-purple-500/20 border-2 border-purple-500 text-purple-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold flex items-center gap-2">
                    <Video className="w-4 h-4" aria-hidden="true" />
                    Videos
                  </span>
                  <span className="text-xs text-white/50">Animated clips</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Video Provider Selection (only when generationMode is video) */}
        {onVideoProviderChange && generationMode === 'video' && (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <label className="block text-sm font-medium text-white/80 mb-3">
              Video Provider
            </label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Video provider selection">
              <button
                role="radio"
                aria-checked={videoProvider === 'veo'}
                onClick={() => onVideoProviderChange('veo')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                  videoProvider === 'veo'
                    ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold">Google VEO</span>
                  <span className="text-xs text-white/50">High quality (default)</span>
                </div>
              </button>
              <button
                role="radio"
                aria-checked={videoProvider === 'deapi'}
                onClick={() => onVideoProviderChange('deapi')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                  videoProvider === 'deapi'
                    ? 'bg-purple-500/20 border-2 border-purple-500 text-purple-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold">DeAPI</span>
                  <span className="text-xs text-white/50">Image-to-video</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Aspect Ratio Selection */}
        {onAspectRatioChange && (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <label className="block text-sm font-medium text-white/80 mb-3">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Aspect ratio selection">
              <button
                role="radio"
                aria-checked={aspectRatio === '16:9'}
                onClick={() => onAspectRatioChange('16:9')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all',
                  aspectRatio === '16:9'
                    ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <span className="font-semibold">16:9</span>
                <span className="text-xs text-white/50 ml-2">Landscape</span>
              </button>
              <button
                role="radio"
                aria-checked={aspectRatio === '9:16'}
                onClick={() => onAspectRatioChange('9:16')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all',
                  aspectRatio === '9:16'
                    ? 'bg-purple-500/20 border-2 border-purple-500 text-purple-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <span className="font-semibold">9:16</span>
                <span className="text-xs text-white/50 ml-2">Portrait</span>
              </button>
            </div>
          </div>
        )}

        {/* Image Provider Selection */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
          <label className="block text-sm font-medium text-white/80 mb-3">
            Image Provider
          </label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Image provider selection">
            <button
              role="radio"
              aria-checked={imageProvider === 'gemini'}
              onClick={() => onProviderChange('gemini')}
              className={cn(
                'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                imageProvider === 'gemini'
                  ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-300'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
              )}
            >
              <div className="flex flex-col items-start gap-1">
                <span className="font-semibold">Gemini Imagen</span>
                <span className="text-xs text-white/50">Google AI (default)</span>
              </div>
            </button>
            <button
              role="radio"
              aria-checked={imageProvider === 'deapi'}
              onClick={() => onProviderChange('deapi')}
              className={cn(
                'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                imageProvider === 'deapi'
                  ? 'bg-purple-500/20 border-2 border-purple-500 text-purple-300'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
              )}
            >
              <div className="flex flex-col items-start gap-1">
                <span className="font-semibold">DeAPI FLUX</span>
                <span className="text-xs text-white/50">Fast, high-quality</span>
              </div>
            </button>
          </div>
        </div>

        {/* Director Mode Selection */}
        {onDirectorModeChange && (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <label className="block text-sm font-medium text-white/80 mb-3">
              AI Director Mode
            </label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Director mode selection">
              <button
                role="radio"
                aria-checked={directorMode === 'chain'}
                onClick={() => onDirectorModeChange('chain')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                  directorMode === 'chain'
                    ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold">Chain Mode</span>
                  <span className="text-xs text-white/50">Faster, predictable</span>
                </div>
              </button>
              <button
                role="radio"
                aria-checked={directorMode === 'agent'}
                onClick={() => onDirectorModeChange('agent')}
                className={cn(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-all text-start',
                  directorMode === 'agent'
                    ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-300'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold">Agent Mode</span>
                  <span className="text-xs text-white/50">Smarter, self-correcting</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Global Subject Input */}
        {onGlobalSubjectChange && (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <label className="block text-sm font-medium text-white/80 mb-2">
              Global Subject (Optional)
            </label>
            <p className="text-xs text-white/50 mb-3">
              Describe a consistent character/subject to appear in all scenes (e.g., &quot;a bearded prophet in flowing white robes&quot;)
            </p>
            <input
              type="text"
              value={globalSubject}
              onChange={(e) => onGlobalSubjectChange(e.target.value)}
              placeholder="e.g., a young woman with dark curly hair in a crimson dress"
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/25"
            />
          </div>
        )}

        {/* Error Message */}
        {errorMsg && (
          <ErrorState variant="inline" message={errorMsg} />
        )}

        {/* Processing Status */}
        {isProcessing && (
          <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
            <div className={cn('flex items-center gap-3', isRTL && 'flex-row-reverse')}>
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" aria-hidden="true" />
              <span className="text-cyan-200">{getProcessingMessage()}</span>
            </div>
          </div>
        )}

        {/* Start Button */}
        <Button
          onClick={onStartProcessing}
          disabled={!audioFile || isProcessing}
          size="lg"
          className={cn(
            'w-full h-14 text-lg font-semibold rounded-xl',
            'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 me-2 animate-spin" aria-hidden="true" />
              {t('studio.processing')}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 me-2" aria-hidden="true" />
              {t('visualizer.generate')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default AudioUploadForm;
