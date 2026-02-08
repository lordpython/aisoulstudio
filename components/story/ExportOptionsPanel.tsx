/**
 * ExportOptionsPanel - Comprehensive export options for Story Mode projects
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  FileVideo,
  FileText,
  FileJson,
  Subtitles,
  Upload,
  Check,
  AlertCircle,
  Loader2,
  X,
  Film,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoryState } from '@/types';
import { useLanguage } from '@/i18n/useLanguage';
import {
  downloadSubtitles,
  downloadProjectJSON,
  importProjectFromJSON,
  downloadAsWebM,
  getExportFormats,
} from '@/services/exportFormatsService';

interface ExportOptionsPanelProps {
  storyState: StoryState;
  videoBlob?: Blob | null;
  onImportProject?: (state: StoryState) => void;
  onExportVideo?: () => Promise<Blob | null | undefined>;
  className?: string;
}

type ExportStatus = 'idle' | 'loading' | 'success' | 'error';

interface ExportOption {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'video' | 'subtitle' | 'project';
  action: () => Promise<void> | void;
  disabled?: boolean;
  disabledReason?: string;
}

export function ExportOptionsPanel({
  storyState,
  videoBlob,
  onImportProject,
  onExportVideo,
  className,
}: ExportOptionsPanelProps) {
  const { t } = useLanguage();
  const [exportStatus, setExportStatus] = useState<Record<string, ExportStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasShots = (storyState.shots?.length ?? 0) > 0;
  const hasScript = storyState.script !== null;
  const hasVideo = videoBlob !== null && videoBlob !== undefined;

  const setStatus = (id: string, status: ExportStatus) => {
    setExportStatus(prev => ({ ...prev, [id]: status }));
  };

  const handleExportSRT = async () => {
    setStatus('srt', 'loading');
    try {
      downloadSubtitles(storyState, 'srt', 'shots');
      setStatus('srt', 'success');
      setTimeout(() => setStatus('srt', 'idle'), 2000);
    } catch (err) {
      setStatus('srt', 'error');
      setError('Failed to export SRT subtitles');
    }
  };

  const handleExportVTT = async () => {
    setStatus('vtt', 'loading');
    try {
      downloadSubtitles(storyState, 'vtt', 'shots');
      setStatus('vtt', 'success');
      setTimeout(() => setStatus('vtt', 'idle'), 2000);
    } catch (err) {
      setStatus('vtt', 'error');
      setError('Failed to export VTT subtitles');
    }
  };

  const handleExportJSON = async () => {
    setStatus('json', 'loading');
    try {
      downloadProjectJSON(storyState);
      setStatus('json', 'success');
      setTimeout(() => setStatus('json', 'idle'), 2000);
    } catch (err) {
      setStatus('json', 'error');
      setError('Failed to export project');
    }
  };

  const handleExportWebM = async () => {
    if (!videoBlob) {
      setError('No video to export. Generate a video first.');
      return;
    }
    
    setStatus('webm', 'loading');
    try {
      const filename = storyState.script?.title || 'story';
      await downloadAsWebM(videoBlob, filename);
      setStatus('webm', 'success');
      setTimeout(() => setStatus('webm', 'idle'), 2000);
    } catch (err) {
      setStatus('webm', 'error');
      setError('Failed to export WebM video');
    }
  };

  const handleExportMP4 = async () => {
    if (!onExportVideo) {
      setError('Video export not available');
      return;
    }
    
    setStatus('mp4', 'loading');
    try {
      const blob = await onExportVideo();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${storyState.script?.title || 'story'}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStatus('mp4', 'success');
        setTimeout(() => setStatus('mp4', 'idle'), 2000);
      } else {
        throw new Error('No video generated');
      }
    } catch (err) {
      setStatus('mp4', 'error');
      setError('Failed to export MP4 video');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('import', 'loading');
    try {
      const result = await importProjectFromJSON(file);
      if (result.success && result.state) {
        onImportProject?.(result.state);
        setStatus('import', 'success');
        setShowImportDialog(false);
        setTimeout(() => setStatus('import', 'idle'), 2000);
      } else {
        throw new Error(result.error || 'Failed to import project');
      }
    } catch (err) {
      setStatus('import', 'error');
      setError(err instanceof Error ? err.message : 'Failed to import project');
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const exportOptions: ExportOption[] = [
    {
      id: 'mp4',
      name: t('story.export_panel.mp4Video'),
      description: t('story.export_panel.mp4Desc'),
      icon: <FileVideo className="w-5 h-5" />,
      category: 'video',
      action: handleExportMP4,
      disabled: !onExportVideo,
      disabledReason: t('story.export_panel.generateVideoFirst'),
    },
    {
      id: 'webm',
      name: t('story.export_panel.webmVideo'),
      description: t('story.export_panel.webmDesc'),
      icon: <Globe className="w-5 h-5" />,
      category: 'video',
      action: handleExportWebM,
      disabled: !hasVideo,
      disabledReason: t('story.export_panel.generateVideoFirst'),
    },
    {
      id: 'srt',
      name: t('story.export_panel.srtSubtitles'),
      description: t('story.export_panel.srtDesc'),
      icon: <Subtitles className="w-5 h-5" />,
      category: 'subtitle',
      action: handleExportSRT,
      disabled: !hasShots,
      disabledReason: t('story.export_panel.generateShotsFirst'),
    },
    {
      id: 'vtt',
      name: t('story.export_panel.webvttSubtitles'),
      description: t('story.export_panel.webvttDesc'),
      icon: <Subtitles className="w-5 h-5" />,
      category: 'subtitle',
      action: handleExportVTT,
      disabled: !hasShots,
      disabledReason: t('story.export_panel.generateShotsFirst'),
    },
    {
      id: 'json',
      name: t('story.export_panel.projectFile'),
      description: t('story.export_panel.projectFileDesc'),
      icon: <FileJson className="w-5 h-5" />,
      category: 'project',
      action: handleExportJSON,
    },
  ];

  const getStatusIcon = (id: string) => {
    const status = exportStatus[id];
    switch (status) {
      case 'loading':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'success':
        return <Check className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Download className="w-4 h-4" />;
    }
  };

  const videoOptions = exportOptions.filter(o => o.category === 'video');
  const subtitleOptions = exportOptions.filter(o => o.category === 'subtitle');
  const projectOptions = exportOptions.filter(o => o.category === 'project');

  return (
    <div className={cn('bg-black/40 rounded-xl border border-white/10 p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-[var(--cinema-spotlight)]" />
          <h3 className="font-medium text-white">{t('story.export_panel.exportOptions')}</h3>
        </div>
        {onImportProject && (
          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            {t('common.import')}
          </button>
        )}
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-300">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Exports */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
          {t('story.export_panel.videoFormats')}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {videoOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => option.action()}
              disabled={option.disabled || exportStatus[option.id] === 'loading'}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                option.disabled
                  ? 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                  : 'border-white/10 bg-white/5 hover:border-[var(--cinema-spotlight)]/40 hover:bg-[var(--cinema-spotlight)]/8'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--cinema-spotlight)]">{option.icon}</span>
                {getStatusIcon(option.id)}
              </div>
              <p className="text-sm font-medium text-white">{option.name}</p>
              <p className="text-xs text-white/40">
                {option.disabled ? option.disabledReason : option.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Subtitle Exports */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
          {t('story.export_panel.subtitles')}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {subtitleOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => option.action()}
              disabled={option.disabled || exportStatus[option.id] === 'loading'}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                option.disabled
                  ? 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                  : 'border-white/10 bg-white/5 hover:border-[var(--cinema-spotlight)]/40 hover:bg-[var(--cinema-spotlight)]/8'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-blue-400">{option.icon}</span>
                {getStatusIcon(option.id)}
              </div>
              <p className="text-sm font-medium text-white">{option.name}</p>
              <p className="text-xs text-white/40">
                {option.disabled ? option.disabledReason : option.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Project Exports */}
      <div>
        <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
          {t('story.export_panel.project')}
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {projectOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => option.action()}
              disabled={option.disabled || exportStatus[option.id] === 'loading'}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                option.disabled
                  ? 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                  : 'border-white/10 bg-white/5 hover:border-[var(--cinema-spotlight)]/40 hover:bg-[var(--cinema-spotlight)]/8'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-amber-400">{option.icon}</span>
                {getStatusIcon(option.id)}
              </div>
              <p className="text-sm font-medium text-white">{option.name}</p>
              <p className="text-xs text-white/40">
                {option.disabled ? option.disabledReason : option.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Import Dialog */}
      <AnimatePresence>
        {showImportDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setShowImportDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-[var(--cinema-celluloid)] rounded-xl border border-white/10 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-lg font-medium text-white mb-2">{t('story.export_panel.importProject')}</h4>
              <p className="text-sm text-white/60 mb-4">
                {t('story.export_panel.importProjectDesc')}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center cursor-pointer hover:border-[var(--cinema-spotlight)]/40 hover:bg-[var(--cinema-spotlight)]/5 transition-all"
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-white/40" />
                <p className="text-white/60">{t('story.export_panel.clickToSelect')}</p>
                <p className="text-xs text-white/30 mt-1">{t('story.export_panel.orDragDrop')}</p>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowImportDialog(false)}
                  className="px-4 py-2 text-white/60 hover:text-white transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ExportOptionsPanel;
