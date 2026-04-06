/**
 * ExportsScreen - Export history across all projects
 *
 * Lists past exports with format, quality, file size, and download links.
 * Groups by project with expandable sections.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  FileVideo,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  FolderOpen,
  Film,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { ScreenLayout } from '@/components/layout/ScreenLayout';
import { BlurFade } from '@/components/motion-primitives/blur-fade';
import { useAuth } from '@/hooks/useAuth';
import {
  listUserProjects,
  getExportHistory,
  type Project,
  type ExportRecord,
} from '@/services/project/projectService';
import { uiLogger } from '@/services/infrastructure/logger';

const log = uiLogger.child('Exports');

function formatFileSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date instanceof Date ? date : new Date(date));
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const QUALITY_COLORS: Record<string, string> = {
  draft: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  standard: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  high: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  ultra: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

interface ProjectExports {
  project: Project;
  exports: ExportRecord[];
}

function ExportRow({ record }: { record: ExportRecord }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/5">
          <FileVideo className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground uppercase">{record.format}</span>
            <span className={cn(
              'px-1.5 py-0 text-[10px] font-medium rounded-full border',
              QUALITY_COLORS[record.quality] || QUALITY_COLORS.standard
            )}>
              {record.quality}
            </span>
            <span className="text-xs text-muted-foreground">{record.aspectRatio}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(record.createdAt)}
            </span>
            {record.duration && (
              <span className="flex items-center gap-1">
                <Film className="w-3 h-3" />
                {formatDuration(record.duration)}
              </span>
            )}
            {record.fileSize && (
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                {formatFileSize(record.fileSize)}
              </span>
            )}
          </div>
        </div>
      </div>
      {(record.cloudUrl || record.localUrl) && (
        <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs">
          <a
            href={record.cloudUrl || record.localUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        </Button>
      )}
    </div>
  );
}

function ProjectExportGroup({ data, index }: { data: ProjectExports; index: number }) {
  const [isExpanded, setIsExpanded] = useState(index === 0);

  return (
    <BlurFade delay={index * 0.05} inView>
      <div className="rounded-xl border border-border bg-secondary/30 overflow-hidden">
        {/* Project Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-muted-foreground" />
            <div className="text-start">
              <h3 className="text-sm font-semibold text-foreground">{data.project.title}</h3>
              <p className="text-xs text-muted-foreground">
                {data.exports.length} export{data.exports.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {/* Exports List */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-0.5">
                {data.exports.map((record) => (
                  <ExportRow key={record.id} record={record} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </BlurFade>
  );
}

export default function ExportsScreen() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [projectExports, setProjectExports] = useState<ProjectExports[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const projects = await listUserProjects(100);
        const results: ProjectExports[] = [];

        for (const project of projects) {
          const exports = await getExportHistory(project.id);
          if (exports.length > 0) {
            results.push({ project, exports });
          }
        }

        // Sort by most recent export first
        results.sort((a, b) => {
          const latestA = Math.max(...a.exports.map(e => new Date(e.createdAt).getTime()));
          const latestB = Math.max(...b.exports.map(e => new Date(e.createdAt).getTime()));
          return latestB - latestA;
        });

        setProjectExports(results);
      } catch (err) {
        log.error('Failed to load export history', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isAuthenticated]);

  const totalExports = useMemo(() =>
    projectExports.reduce((sum, pe) => sum + pe.exports.length, 0),
    [projectExports]
  );

  const filteredExports = useMemo(() => {
    if (!search.trim()) return projectExports;
    const q = search.toLowerCase();
    return projectExports.filter(pe =>
      pe.project.title.toLowerCase().includes(q) ||
      pe.exports.some(e => e.format.includes(q) || e.quality.includes(q))
    );
  }, [projectExports, search]);

  if (!isAuthenticated) {
    return (
      <ScreenLayout title={t('exports.title') || 'Export History'} showBackButton onBack={() => navigate('/')}>
        <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
          <FileVideo className="w-16 h-16 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground">{t('account.signInRequired') || 'Sign in to view export history'}</p>
          <Button onClick={() => navigate('/signin')}>{t('nav.signIn') || 'Sign In'}</Button>
        </div>
      </ScreenLayout>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('exports.search') || 'Search exports...'}
          className="ps-9 h-9 w-56 bg-secondary"
        />
      </div>
    </div>
  );

  return (
    <ScreenLayout
      title={t('exports.title') || 'Export History'}
      showBackButton
      onBack={() => navigate('/')}
      headerActions={headerActions}
      maxWidth="3xl"
      contentClassName="py-8"
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-full min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span>{totalExports} total export{totalExports !== 1 ? 's' : ''}</span>
            <span>{projectExports.length} project{projectExports.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Export Groups */}
          <div className="space-y-3">
            {filteredExports.map((data, index) => (
              <ProjectExportGroup key={data.project.id} data={data} index={index} />
            ))}
          </div>

          {/* Empty State */}
          {filteredExports.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <FileVideo className="w-12 h-12 opacity-20" />
              <p className="text-sm">
                {search
                  ? (t('exports.noResults') || 'No exports match your search')
                  : (t('exports.empty') || 'No exports yet. Create a video and export it!')}
              </p>
              {!search && (
                <Button variant="outline" size="sm" onClick={() => navigate('/studio?mode=video')}>
                  {t('exports.createVideo') || 'Create a video'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </ScreenLayout>
  );
}
