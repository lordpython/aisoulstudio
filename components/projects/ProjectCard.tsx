/**
 * Project Card Component
 *
 * Displays a project with thumbnail, title, metadata, and quick actions.
 * Uses the cinematic design system tokens for consistent visual language.
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

// Type-to-gradient mapping using design tokens
const TYPE_GRADIENTS: Record<ProjectType, string> = {
  production: 'from-primary/60 to-primary/20',
  story: 'from-accent/60 to-accent/20',
  visualizer: 'from-ring/60 to-ring/20',
};

// Type-to-accent color for badges
const TYPE_ACCENT: Record<ProjectType, string> = {
  production: 'text-primary bg-primary/10 border-primary/20',
  story: 'text-accent bg-accent/10 border-accent/20',
  visualizer: 'text-ring bg-ring/10 border-ring/20',
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
  const gradientClass = TYPE_GRADIENTS[project.type];
  const accentClass = TYPE_ACCENT[project.type];

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
        'bg-card hover:bg-card/80 border border-border hover:border-primary/30',
        'transition-all duration-300',
        'focus-within:ring-2 focus-within:ring-primary/50',
        'shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-primary/5',
        isRTL && 'text-right'
      )}
    >
      {/* Hover glow effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px]"
          style={{
            background: 'linear-gradient(90deg, transparent, oklch(0.70 0.15 190 / 0.4), transparent)',
          }}
        />
      </div>

      {/* Thumbnail Area */}
      <div className="relative aspect-video bg-gradient-to-br from-secondary to-muted overflow-hidden">
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
              gradientClass
            )}
          >
            <Icon className="w-12 h-12 text-foreground/30" />
          </div>
        )}

        {/* Duration Badge */}
        {project.duration && (
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm text-xs text-foreground font-code">
            {formatDuration(project.duration)}
          </div>
        )}

        {/* Favorite Star */}
        {project.isFavorite && (
          <div className="absolute top-2 right-2">
            <Star className="w-5 h-5 text-accent fill-accent drop-shadow-lg" />
          </div>
        )}

        {/* Type Badge */}
        <div
          className={cn(
            'absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-code font-medium uppercase tracking-wider',
            'border backdrop-blur-sm capitalize',
            accentClass
          )}
        >
          {project.type}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4">
        {/* Title */}
        <h3 className="font-editorial font-semibold text-foreground truncate mb-1">{project.title}</h3>

        {/* Topic/Description */}
        {project.topic && (
          <p className="text-sm text-muted-foreground truncate mb-2.5">{project.topic}</p>
        )}

        {/* Metadata Row */}
        <div
          className={cn(
            'flex items-center gap-3 text-xs text-muted-foreground',
            isRTL && 'flex-row-reverse'
          )}
        >
          {/* Last Updated */}
          <span className="flex items-center gap-1 font-code">
            <Clock className="w-3 h-3" />
            {formatDate(project.updatedAt)}
          </span>

          {/* Progress Indicators */}
          <div className="flex items-center gap-1.5">
            {project.hasVisuals && (
              <span title="Has visuals"><ImageIcon className="w-3 h-3 text-primary/70" /></span>
            )}
            {project.hasNarration && (
              <span title="Has narration"><Mic className="w-3 h-3 text-ring/70" /></span>
            )}
            {project.hasMusic && (
              <span title="Has music"><Music className="w-3 h-3 text-accent/70" /></span>
            )}
            {project.hasExport && (
              <span title="Has export"><Download className="w-3 h-3 text-primary/70" /></span>
            )}
          </div>
        </div>

        {/* Status Badge */}
        {project.status !== 'draft' && (
          <div className="mt-2.5">
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-code',
                project.status === 'completed' && 'bg-primary/15 text-primary',
                project.status === 'in_progress' && 'bg-ring/15 text-ring',
                project.status === 'archived' && 'bg-muted text-muted-foreground'
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
              <MoreVertical className="w-4 h-4 text-foreground/70" />
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
                  project.isFavorite && 'fill-accent text-accent'
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
              className="text-destructive focus:text-destructive"
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
