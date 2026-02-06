/**
 * TemplatesGallery - Browse and apply project templates
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layout,
  Film,
  ShoppingBag,
  GraduationCap,
  Smartphone,
  Palette,
  Clock,
  Star,
  ChevronRight,
  Search,
  X,
  Sparkles,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoryState } from '@/types';
import {
  getAllTemplates,
  getTemplatesByCategory,
  getTemplateCategories,
  searchTemplates,
  applyTemplate,
  type ProjectTemplate,
} from '@/services/projectTemplatesService';

interface TemplatesGalleryProps {
  onApplyTemplate: (state: Partial<StoryState>) => void;
  onClose?: () => void;
  className?: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  narrative: <Film className="w-5 h-5" />,
  commercial: <ShoppingBag className="w-5 h-5" />,
  educational: <GraduationCap className="w-5 h-5" />,
  social: <Smartphone className="w-5 h-5" />,
  experimental: <Palette className="w-5 h-5" />,
};

const difficultyColors: Record<string, string> = {
  beginner: 'text-green-400 bg-green-500/20',
  intermediate: 'text-amber-400 bg-amber-500/20',
  advanced: 'text-red-400 bg-red-500/20',
};

function TemplateCard({
  template,
  onClick,
  isSelected,
}: {
  template: ProjectTemplate;
  onClick: () => void;
  isSelected: boolean;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'relative p-4 rounded-xl border cursor-pointer transition-all',
        isSelected
          ? 'border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/30'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
      )}
    >
      {/* Genre Badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">
          {template.genre}
        </span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full', difficultyColors[template.difficulty])}>
          {template.difficulty}
        </span>
      </div>

      {/* Title & Description */}
      <h4 className="font-medium text-white mb-1">{template.name}</h4>
      <p className="text-sm text-white/50 line-clamp-2 mb-3">{template.description}</p>

      {/* Meta Info */}
      <div className="flex items-center gap-3 text-xs text-white/40">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {template.estimatedDuration}
        </span>
        <span className="flex items-center gap-1">
          <Layout className="w-3 h-3" />
          {template.templateScenes.length} scenes
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mt-3">
        {template.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-xs px-1.5 py-0.5 rounded bg-black/30 text-white/40"
          >
            #{tag}
          </span>
        ))}
        {template.tags.length > 3 && (
          <span className="text-xs text-white/30">+{template.tags.length - 3}</span>
        )}
      </div>

      {/* Selected Indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2">
          <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center">
            <Star className="w-3 h-3 text-white" fill="currentColor" />
          </div>
        </div>
      )}
    </motion.div>
  );
}

function TemplatePreview({
  template,
  onApply,
  onClose,
}: {
  template: ProjectTemplate;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="bg-black/60 rounded-xl border border-white/10 p-6 sticky top-4"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400">
            {template.category}
          </span>
          <h3 className="text-xl font-semibold text-white mt-2">{template.name}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-white/40 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-white/60 mb-4">{template.description}</p>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-white/5 border border-white/5">
          <p className="text-xs text-white/40 mb-1">Duration</p>
          <p className="text-sm font-medium text-white">{template.estimatedDuration}</p>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/5">
          <p className="text-xs text-white/40 mb-1">Difficulty</p>
          <p className={cn('text-sm font-medium capitalize', difficultyColors[template.difficulty]?.split(' ')[0] ?? 'text-white')}>
            {template.difficulty}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/5">
          <p className="text-xs text-white/40 mb-1">Visual Style</p>
          <p className="text-sm font-medium text-white">{template.visualStyle}</p>
        </div>
        <div className="p-3 rounded-lg bg-white/5 border border-white/5">
          <p className="text-xs text-white/40 mb-1">Aspect Ratio</p>
          <p className="text-sm font-medium text-white">{template.aspectRatio}</p>
        </div>
      </div>

      {/* Scene Breakdown */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-white/80 mb-2">Scene Structure</h4>
        <div className="space-y-2">
          {template.templateScenes.map((scene, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-2 rounded-lg bg-white/5"
            >
              <span className="w-6 h-6 rounded-full bg-violet-600/30 text-violet-400 text-xs flex items-center justify-center flex-shrink-0">
                {scene.sceneNumber}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{scene.heading}</p>
                <p className="text-xs text-white/40 line-clamp-1">{scene.action}</p>
              </div>
              {scene.duration && (
                <span className="text-xs text-white/30">{scene.duration}s</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Suggested Styles */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-white/80 mb-2">Suggested Styles</h4>
        <div className="flex flex-wrap gap-1">
          {template.suggestedVisualStyles.map((style) => (
            <span
              key={style}
              className="text-xs px-2 py-1 rounded-full bg-violet-500/10 text-violet-300"
            >
              {style}
            </span>
          ))}
        </div>
      </div>

      {/* Apply Button */}
      <button
        onClick={onApply}
        className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        <Sparkles className="w-4 h-4" />
        Use This Template
      </button>
    </motion.div>
  );
}

export function TemplatesGallery({
  onApplyTemplate,
  onClose,
  className,
}: TemplatesGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);

  const categories = getTemplateCategories();

  const templates = useMemo(() => {
    if (searchQuery) {
      return searchTemplates(searchQuery);
    }
    if (selectedCategory) {
      return getTemplatesByCategory(selectedCategory as ProjectTemplate['category']);
    }
    return getAllTemplates();
  }, [selectedCategory, searchQuery]);

  const handleApply = () => {
    if (!selectedTemplate) return;
    const state = applyTemplate(selectedTemplate);
    onApplyTemplate(state);
    onClose?.();
  };

  return (
    <div className={cn('flex flex-col h-full bg-black/40 rounded-xl border border-white/10', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Layout className="w-5 h-5 text-violet-400" />
          <h3 className="font-medium text-white">Project Templates</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-white/40 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="p-4 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedCategory(null);
            }}
            placeholder="Search templates..."
            className="w-full pl-10 pr-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-violet-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 p-3 border-b border-white/5 overflow-x-auto">
        <button
          onClick={() => {
            setSelectedCategory(null);
            setSearchQuery('');
          }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
            !selectedCategory && !searchQuery
              ? 'bg-violet-600 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          )}
        >
          <Star className="w-4 h-4" />
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategory(cat.id);
              setSearchQuery('');
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors',
              selectedCategory === cat.id
                ? 'bg-violet-600 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            {categoryIcons[cat.id]}
            {cat.name}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {templates.length === 0 ? (
            <div className="text-center py-12">
              <Layout className="w-10 h-10 mx-auto mb-3 text-white/20" />
              <p className="text-white/40">No templates found</p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-sm text-violet-400 hover:text-violet-300"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplate?.id === template.id}
                  onClick={() => setSelectedTemplate(template)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <AnimatePresence>
          {selectedTemplate && (
            <div className="w-80 border-l border-white/10 overflow-y-auto">
              <TemplatePreview
                template={selectedTemplate}
                onApply={handleApply}
                onClose={() => setSelectedTemplate(null)}
              />
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default TemplatesGallery;
