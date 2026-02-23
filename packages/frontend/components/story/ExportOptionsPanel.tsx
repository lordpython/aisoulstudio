/**
 * ExportOptionsPanel - Export options for Story Mode projects.
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  FileVideo,
  FileJson,
  Subtitles,
  Upload,
  Check,
  AlertCircle,
  Loader2,
  X,
  Globe,
  Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoryState } from '@/types';
import { useLanguage } from '@/i18n/useLanguage';
import { isNative } from '@/utils/platformUtils';
import {
  downloadSubtitles,
  downloadProjectJSON,
  importProjectFromJSON,
  downloadAsWebM,
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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
      const detail = err instanceof Error ? err.message : String(err);
      setError(`Failed to export MP4 video: ${detail}`);
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
        return <Check className="w-4 h-4 text-emerald-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Download className="w-4 h-4" />;
    }
  };

  const videoOptions = exportOptions.filter(o => o.category === 'video');
  const subtitleOptions = exportOptions.filter(o => o.category === 'subtitle');
  const projectOptions = exportOptions.filter(o => o.category === 'project');

  const renderOptionGrid = (options: ExportOption[], accentClass: string) => (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => option.action()}
          disabled={option.disabled || exportStatus[option.id] === 'loading'}
          className={cn(
            'p-3 rounded-sm border text-left transition-all duration-200',
            option.disabled
              ? 'border-zinc-800/50 bg-zinc-900/50 opacity-50 cursor-not-allowed'
              : 'border-zinc-800 bg-zinc-900 hover:border-blue-500/40 hover:bg-blue-500/5'
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={accentClass}>{option.icon}</span>
            {getStatusIcon(option.id)}
          </div>
          <p className="text-sm font-medium text-zinc-100">{option.name}</p>
          <p className="text-xs text-zinc-600">
            {option.disabled ? option.disabledReason : option.description}
          </p>
        </button>
      ))}
    </div>
  );

  return (
    <div className={cn('bg-zinc-950 rounded-sm border border-zinc-800 p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-400" />
          <h3 className="font-sans font-medium text-zinc-100">{t('story.export_panel.exportOptions')}</h3>
        </div>
        {onImportProject && (
          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-sm transition-colors duration-200"
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
            transition={{ duration: 0.15 }}
            className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-sm flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="flex-1 text-sm text-red-300">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Native / mobile server URL warning */}
      {isNative() && !import.meta.env.VITE_SERVER_URL && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-sm flex items-start gap-2">
          <Wifi className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">
            <span className="font-semibold">Mobile export requires a LAN connection.</span>{' '}
            Add <code className="font-mono bg-amber-500/10 px-1 rounded">VITE_SERVER_URL=http://&lt;your-pc-ip&gt;:3001</code> to{' '}
            <code className="font-mono">.env.local</code> and rebuild the app so the device can reach the export server.
          </p>
        </div>
      )}

      {/* Video Exports */}
      <div className="mb-4">
        <h4 className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">
          {t('story.export_panel.videoFormats')}
        </h4>
        {renderOptionGrid(videoOptions, 'text-blue-400')}
      </div>

      {/* Subtitle Exports */}
      <div className="mb-4">
        <h4 className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">
          {t('story.export_panel.subtitles')}
        </h4>
        {renderOptionGrid(subtitleOptions, 'text-blue-400')}
      </div>

      {/* Project Exports */}
      <div>
        <h4 className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-2">
          {t('story.export_panel.project')}
        </h4>
        {renderOptionGrid(projectOptions, 'text-orange-400')}
      </div>

      {/* Import Dialog */}
      <AnimatePresence>
        {showImportDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setShowImportDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md bg-zinc-900 rounded-sm border border-zinc-800 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="font-sans text-lg font-medium text-zinc-100 mb-2">{t('story.export_panel.importProject')}</h4>
              <p className="text-sm text-zinc-500 mb-4">
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
                className="border-2 border-dashed border-zinc-700 rounded-sm p-8 text-center cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-all duration-200"
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
                <p className="text-zinc-500">{t('story.export_panel.clickToSelect')}</p>
                <p className="text-xs text-zinc-700 mt-1">{t('story.export_panel.orDragDrop')}</p>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowImportDialog(false)}
                  className="px-4 py-2 text-zinc-500 hover:text-zinc-100 transition-colors duration-200"
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
