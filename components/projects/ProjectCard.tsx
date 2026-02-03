/**
 * Project Card Component
 *
 * Displays a project with thumbnail, title, metadata, and quick actions.
 * Used in the ProjectsScreen dashboard grid.
 */

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

// Type-to-icon mapping
const TYPE_ICONS: Record<ProjectType, typeof Video> = {
  production: Video,
  story: Film,
  visualizer: AudioWaveform,
};

// Type-to-color mapping
const TYPE_COLORS: Record<ProjectType, string> = {
  production: 'from-violet-500 to-purple-600',
  story: 'from-amber-500 to-orange-600',
  visualizer: 'from-cyan-500 to-blue-600',
};

// Type-to-route mapping
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

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ProjectCard({
  project,
  onDelete,
  onToggleFavorite,
  onExport,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();

  const Icon = TYPE_ICONS[project.type];
  const colorClass = TYPE_COLORS[project.type];

  const handleOpen = () => {
    const route = TYPE_ROUTES[project.type];
    // Append project ID to route
    const separator = route.includes('?') ? '&' : '?';
    navigate(`${route}${separator}projectId=${project.id}`);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('projects.confirmDelete') || 'Delete this project?')) {
      onDelete(project.id);
    }
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleOpen}
      className={cn(
        'group relative cursor-pointer rounded-xl overflow-hidden',
        'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20',
        'transition-all duration-300',
        'focus-within:ring-2 focus-within:ring-violet-500/50',
        isRTL && 'text-right'
      )}
    >
      {/* Thumbnail Area */}
      <div className="relative aspect-video bg-gradient-to-br from-white/5 to-white/10">
        {project.thumbnailUrl ? (
          <img
            src={project.thumbnailUrl}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={cn(
              'w-full h-full flex items-center justify-center bg-gradient-to-br',
              colorClass
            )}
          >
            <Icon className="w-12 h-12 text-white/50" />
          </div>
        )}

        {/* Duration Badge */}
        {project.duration && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-xs text-white">
            {formatDuration(project.duration)}
          </div>
        )}

        {/* Favorite Star */}
        {project.isFavorite && (
          <div className="absolute top-2 right-2">
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
          </div>
        )}

        {/* Type Badge */}
        <div
          className={cn(
            'absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-medium',
            'bg-black/50 backdrop-blur-sm text-white/90 capitalize'
          )}
        >
          {project.type}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-white truncate mb-1">{project.title}</h3>

        {/* Topic/Description */}
        {project.topic && (
          <p className="text-sm text-white/60 truncate mb-2">{project.topic}</p>
        )}

        {/* Metadata Row */}
        <div
          className={cn(
            'flex items-center gap-3 text-xs text-white/50',
            isRTL && 'flex-row-reverse'
          )}
        >
          {/* Last Updated */}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(project.updatedAt)}
          </span>

          {/* Progress Indicators */}
          <div className="flex items-center gap-1.5">
            {project.hasVisuals && (
              <ImageIcon className="w-3 h-3 text-green-400" title="Has visuals" />
            )}
            {project.hasNarration && (
              <Mic className="w-3 h-3 text-blue-400" title="Has narration" />
            )}
            {project.hasMusic && (
              <Music className="w-3 h-3 text-pink-400" title="Has music" />
            )}
            {project.hasExport && (
              <Download className="w-3 h-3 text-violet-400" title="Has export" />
            )}
          </div>
        </div>

        {/* Status Badge */}
        {project.status !== 'draft' && (
          <div className="mt-2">
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs',
                project.status === 'completed' && 'bg-green-500/20 text-green-400',
                project.status === 'in_progress' && 'bg-blue-500/20 text-blue-400',
                project.status === 'archived' && 'bg-gray-500/20 text-gray-400'
              )}
            >
              {project.status.replace('_', ' ')}
            </span>
          </div>
        )}
      </div>

      {/* Actions Menu */}
      <div
        className={cn(
          'absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity',
          isRTL ? 'left-2' : 'right-2'
        )}
        style={{ top: 'calc(100% - 40px)' }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-colors"
              aria-label="Project actions"
            >
              <MoreVertical className="w-4 h-4 text-white/70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={handleOpen}>
              <Edit3 className="w-4 h-4 mr-2" />
              {t('projects.open') || 'Open'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggleFavorite}>
              <Star
                className={cn(
                  'w-4 h-4 mr-2',
                  project.isFavorite && 'fill-yellow-400 text-yellow-400'
                )}
              />
              {project.isFavorite
                ? t('projects.unfavorite') || 'Remove from favorites'
                : t('projects.favorite') || 'Add to favorites'}
            </DropdownMenuItem>
            {project.hasExport && onExport && (
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                {t('projects.export') || 'Export'}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-red-400 focus:text-red-400"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('projects.delete') || 'Delete'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
