import React from 'react';
import { motion } from 'framer-motion';
import {
  Video,
  Music,
  AudioWaveform,
  MoreVertical,
  Trash2,
  Star,
  Edit3,
  Download,
  Clock,
  Image as ImageIcon,
  Mic,
  Film,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Project, ProjectType } from '@/services/projectService';

interface ProjectCardProps {
  project: Project;
  onDelete: (projectId: string) => void;
  onToggleFavorite: (projectId: string) => void;
  onExport?: (projectId: string) => void;
}

const TYPE_ICONS: Record<ProjectType, typeof Video> = {
  production: Video,
  story: Film,
  visualizer: AudioWaveform,
};

const TYPE_GRADIENTS: Record<ProjectType, { from: string; glow: string; accent: string }> = {
  production: {
    from: 'linear-gradient(135deg, oklch(0.50 0.18 55) 0%, oklch(0.25 0.10 40) 100%)',
    glow: '210, 140, 50',
    accent: 'oklch(0.82 0.16 75)',
  },
  story: {
    from: 'linear-gradient(135deg, oklch(0.45 0.22 320) 0%, oklch(0.25 0.14 290) 100%)',
    glow: '185, 55, 210',
    accent: 'oklch(0.78 0.20 330)',
  },
  visualizer: {
    from: 'linear-gradient(135deg, oklch(0.50 0.18 200) 0%, oklch(0.25 0.12 220) 100%)',
    glow: '35, 190, 205',
    accent: 'oklch(0.80 0.16 190)',
  },
};

const TYPE_ROUTES: Record<ProjectType, string> = {
  production: '/studio?mode=video',
  story: '/studio?mode=story',
  visualizer: '/visualizer',
};

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ProjectCard({ project, onDelete, onToggleFavorite, onExport }: ProjectCardProps) {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const Icon = TYPE_ICONS[project.type];
  const style = TYPE_GRADIENTS[project.type];

  const handleOpen = () => {
    const route = TYPE_ROUTES[project.type];
    const separator = route.includes('?') ? '&' : '?';
    navigate(`${route}${separator}projectId=${project.id}`);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('projects.confirmDelete') || 'Delete this project?')) onDelete(project.id);
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(project.id);
  };

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExport?.(project.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -4, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
      whileTap={{ scale: 0.98 }}
      onClick={handleOpen}
      className={cn(
        'group relative cursor-pointer rounded-2xl overflow-hidden',
        'transition-shadow duration-300',
        isRTL && 'text-right'
      )}
      style={{
        background: 'oklch(0.09 0.02 240)',
        border: '1px solid oklch(1 0 0 / 0.07)',
      }}
    >
      {/* Hover border glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none z-10"
        style={{
          boxShadow: `inset 0 0 0 1px rgba(${style.glow}, 0.3), 0 8px 30px -8px rgba(${style.glow}, 0.2)`,
        }}
      />

      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden">
        {project.thumbnailUrl ? (
          <img
            src={project.thumbnailUrl}
            alt={project.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: style.from }}
          >
            <Icon
              className="w-10 h-10 transition-transform duration-300 group-hover:scale-110"
              style={{ color: `rgba(${style.glow}, 0.6)` }}
            />
          </div>
        )}

        {/* Bottom fade */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, oklch(0.09 0.02 240) 0%, transparent 50%)' }}
        />

        {/* Duration badge */}
        {project.duration && (
          <div
            className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-xs font-code"
            style={{ background: 'oklch(0 0 0 / 0.65)', backdropFilter: 'blur(8px)', color: 'oklch(0.80 0 0)' }}
          >
            {formatDuration(project.duration)}
          </div>
        )}

        {/* Favorite star */}
        {project.isFavorite && (
          <div className="absolute top-2.5 right-2.5">
            <Star className="w-4 h-4 fill-current" style={{ color: 'var(--cinema-spotlight)' }} />
          </div>
        )}

        {/* Type badge */}
        <div
          className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-code font-medium uppercase tracking-wider"
          style={{
            background: `rgba(${style.glow}, 0.15)`,
            border: `1px solid rgba(${style.glow}, 0.3)`,
            backdropFilter: 'blur(8px)',
            color: style.accent,
          }}
        >
          {project.type}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-3 pb-4">
        <h3
          className="font-editorial font-semibold truncate mb-1 text-sm"
          style={{ color: 'oklch(0.93 0 0)' }}
        >
          {project.title}
        </h3>

        {project.topic && (
          <p className="text-xs truncate mb-3" style={{ color: 'oklch(0.52 0.03 240)' }}>
            {project.topic}
          </p>
        )}

        <div className={cn('flex items-center justify-between', isRTL && 'flex-row-reverse')}>
          {/* Time */}
          <span className="flex items-center gap-1 text-[11px] font-code" style={{ color: 'oklch(0.40 0.02 240)' }}>
            <Clock className="w-3 h-3" />
            {formatDate(project.updatedAt)}
          </span>

          {/* Progress icons */}
          <div className="flex items-center gap-1.5">
            {project.hasVisuals && (
              <ImageIcon className="w-3 h-3" style={{ color: `rgba(${style.glow}, 0.7)` }} title="Has visuals" />
            )}
            {project.hasNarration && (
              <Mic className="w-3 h-3" style={{ color: `rgba(${style.glow}, 0.7)` }} title="Has narration" />
            )}
            {project.hasMusic && (
              <Music className="w-3 h-3" style={{ color: `rgba(${style.glow}, 0.7)` }} title="Has music" />
            )}
            {project.hasExport && (
              <Download className="w-3 h-3" style={{ color: `rgba(${style.glow}, 0.7)` }} title="Exported" />
            )}
          </div>
        </div>

        {/* Status */}
        {project.status !== 'draft' && (
          <div className="mt-2">
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-code"
              style={{
                background: `rgba(${style.glow}, 0.10)`,
                color: style.accent,
              }}
            >
              {project.status.replace('_', ' ')}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        className={cn(
          'absolute bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20',
          isRTL ? 'left-3' : 'right-3'
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg transition-colors"
              style={{ background: 'oklch(0 0 0 / 0.55)', backdropFilter: 'blur(8px)' }}
              aria-label="Project actions"
            >
              <MoreVertical className="w-3.5 h-3.5" style={{ color: 'oklch(0.65 0 0)' }} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={handleOpen}>
              <Edit3 className="w-3.5 h-3.5 mr-2" />
              {t('projects.open') || 'Open'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggleFavorite}>
              <Star className={cn('w-3.5 h-3.5 mr-2', project.isFavorite && 'fill-current text-accent')} />
              {project.isFavorite ? t('projects.unfavorite') : t('projects.favorite')}
            </DropdownMenuItem>
            {project.hasExport && onExport && (
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-3.5 h-3.5 mr-2" />
                {t('projects.export') || 'Export'}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              {t('projects.delete') || 'Delete'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
