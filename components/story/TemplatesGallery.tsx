/**
 * TemplatesGallery - Browse and apply project templates.
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
  ChevronRight,
  Search,
  X,
  ArrowRight,
  Layers,
  Eye,
  Ratio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoryState } from '@/types';
import { useLanguage } from '@/i18n/useLanguage';
import {
  getAllTemplates,
  getTemplatesByCategory,
  getTemplateCategories,
  applyTemplate,
  type ProjectTemplate,
} from '@/services/projectTemplatesService';

interface TemplatesGalleryProps {
  onApplyTemplate: (state: Partial<StoryState>) => void;
  onClose?: () => void;
  className?: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  narrative: <Film className="w-3.5 h-3.5" />,
  commercial: <ShoppingBag className="w-3.5 h-3.5" />,
  educational: <GraduationCap className="w-3.5 h-3.5" />,
  social: <Smartphone className="w-3.5 h-3.5" />,
  experimental: <Palette className="w-3.5 h-3.5" />,
};

const difficultyColors: Record<string, { text: string; bg: string }> = {
  beginner: { text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  intermediate: { text: 'text-orange-400', bg: 'bg-orange-500/10' },
  advanced: { text: 'text-red-400', bg: 'bg-red-500/10' },
};

/** Translate a template field, falling back to the original value */
function useTemplateTranslation() {
  const { t } = useLanguage();

  return {
    tName: (template: ProjectTemplate) =>
      t(`story.templates.items.${template.id}.name`, { defaultValue: template.name }),
    tDesc: (template: ProjectTemplate) =>
      t(`story.templates.items.${template.id}.description`, { defaultValue: template.description }),
    tGenre: (genre: string) =>
      t(`story.templates.genres.${genre}`, { defaultValue: genre }),
    tTag: (tag: string) =>
      t(`story.templates.tags.${tag}`, { defaultValue: tag }),
    tDifficulty: (diff: string) =>
      t(`story.templates.difficulty.${diff}`, { defaultValue: diff }),
    tCategory: (cat: string) =>
      t(`story.templates.categories.${cat}`, { defaultValue: cat }),
    tStyle: (style: string) =>
      t(`story.templates.styles.${style}`, { defaultValue: style }),
    tSceneHeading: (template: ProjectTemplate, sceneNum: number) =>
      t(`story.templates.items.${template.id}.scene${sceneNum}_heading`, { defaultValue: '' }),
    tSceneAction: (template: ProjectTemplate, sceneNum: number) =>
      t(`story.templates.items.${template.id}.scene${sceneNum}_action`, { defaultValue: '' }),
  };
}

function TemplateCard({
  template,
  onClick,
  isSelected,
}: {
  template: ProjectTemplate;
  onClick: () => void;
  isSelected: boolean;
}) {
  const colors = difficultyColors[template.difficulty] ?? difficultyColors.beginner;
  const tt = useTemplateTranslation();

  return (
    <motion.div
      layout
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer rounded-sm border transition-all duration-200 hover:-translate-y-0.5',
        isSelected
          ? 'border-blue-500/50 bg-blue-500/5'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
      )}
    >
      <div className="p-4">
        {/* Top row: difficulty + genre */}
        <div className="flex items-center gap-2 mb-3">
          <span className={cn('font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-sm', colors.text, colors.bg)}>
            {tt.tDifficulty(template.difficulty)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-sm bg-zinc-800 text-zinc-500">
            {tt.tGenre(template.genre)}
          </span>
        </div>

        {/* Title */}
        <h4 className="font-sans text-sm font-medium text-zinc-100 mb-1.5 leading-snug">
          {tt.tName(template)}
        </h4>

        {/* Description */}
        <p className="text-xs text-zinc-600 leading-relaxed line-clamp-2 mb-3">
          {tt.tDesc(template)}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-4 text-zinc-700">
          <span className="flex items-center gap-1.5 font-mono text-[10px]">
            <Layers className="w-3 h-3" />
            {template.templateScenes.length}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px]">
            <Clock className="w-3 h-3" />
            {template.estimatedDuration}
          </span>
        </div>

        {/* Tags */}
        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-zinc-800">
            {template.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="font-mono text-[9px] text-zinc-600 px-1.5 py-0.5 rounded-sm bg-zinc-950 border border-zinc-800"
              >
                {tt.tTag(tag)}
              </span>
            ))}
            {template.tags.length > 3 && (
              <span className="font-mono text-[9px] text-zinc-700">
                +{template.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Hover arrow */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <ChevronRight className="w-4 h-4 text-zinc-600" />
      </div>
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
  const { t } = useLanguage();
  const tt = useTemplateTranslation();
  const colors = difficultyColors[template.difficulty] ?? difficultyColors.beginner;

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="h-full flex flex-col"
    >
      {/* Preview header */}
      <div className="flex items-start justify-between p-5 pb-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-sm', colors.text, colors.bg)}>
              {tt.tDifficulty(template.difficulty)}
            </span>
          </div>
          <h3 className="font-sans text-lg font-medium text-zinc-100 leading-snug">
            {tt.tName(template)}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 -mr-1 text-zinc-700 hover:text-zinc-400 transition-colors duration-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <p className="text-sm text-zinc-500 leading-relaxed">
          {tt.tDesc(template)}
        </p>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: t('story.templates.duration'), value: template.estimatedDuration, icon: Clock },
            { label: t('story.templates.scenes'), value: `${template.templateScenes.length}`, icon: Layers },
            { label: t('story.templates.style'), value: tt.tStyle(template.visualStyle), icon: Eye },
            { label: t('story.templates.ratio'), value: template.aspectRatio, icon: Ratio },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="p-3 rounded-sm bg-zinc-950 border border-zinc-800"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3 h-3 text-zinc-700" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  {label}
                </span>
              </div>
              <p className="text-sm font-medium text-zinc-300">{value}</p>
            </div>
          ))}
        </div>

        {/* Scene breakdown */}
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600 block mb-2.5">
            {t('story.templates.scenes')}
          </span>
          <div className="space-y-1.5">
            {template.templateScenes.map((scene, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-sm bg-zinc-950 border border-zinc-800"
              >
                <span className="w-5 h-5 rounded-sm flex items-center justify-center font-mono text-[10px] bg-zinc-800 text-zinc-500 flex-shrink-0">
                  {scene.sceneNumber}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[11px] text-zinc-400 truncate">
                    {tt.tSceneHeading(template, scene.sceneNumber) || scene.heading}
                  </p>
                  <p className="text-[11px] text-zinc-600 line-clamp-1 mt-0.5">
                    {tt.tSceneAction(template, scene.sceneNumber) || scene.action}
                  </p>
                </div>
                {scene.duration && (
                  <span className="font-mono text-[10px] text-zinc-700 flex-shrink-0">{scene.duration}s</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Suggested styles */}
        {template.suggestedVisualStyles.length > 0 && (
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600 block mb-2.5">
              {t('story.templates.visualStyles')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {template.suggestedVisualStyles.map((style) => (
                <span
                  key={style}
                  className="text-xs px-2.5 py-1 rounded-sm text-zinc-400 bg-zinc-950 border border-zinc-800"
                >
                  {tt.tStyle(style)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Apply button */}
      <div className="p-4 pt-3 border-t border-zinc-800">
        <button
          onClick={onApply}
          className="w-full flex items-center justify-center gap-2.5 py-3 rounded-sm bg-white text-black font-sans text-sm font-medium hover:bg-zinc-200 transition-colors duration-200"
        >
          <span>{t('story.templates.useTemplate')}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export function TemplatesGallery({
  onApplyTemplate,
  onClose,
  className,
}: TemplatesGalleryProps) {
  const { t, language } = useLanguage();
  const tt = useTemplateTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);

  const categories = getTemplateCategories();

  const templates = useMemo(() => {
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      return getAllTemplates().filter((tmpl) => {
        const name = tt.tName(tmpl).toLowerCase();
        const desc = tt.tDesc(tmpl).toLowerCase();
        const genre = tt.tGenre(tmpl.genre).toLowerCase();
        const tags = tmpl.tags.map((tag) => tt.tTag(tag).toLowerCase());
        return (
          name.includes(lowerQuery) ||
          desc.includes(lowerQuery) ||
          genre.includes(lowerQuery) ||
          tags.some((tag) => tag.includes(lowerQuery)) ||
          tmpl.name.toLowerCase().includes(lowerQuery) ||
          tmpl.description.toLowerCase().includes(lowerQuery) ||
          tmpl.genre.toLowerCase().includes(lowerQuery) ||
          tmpl.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
        );
      });
    }
    if (selectedCategory) {
      return getTemplatesByCategory(selectedCategory as ProjectTemplate['category']);
    }
    return getAllTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, searchQuery, language]);

  const handleApply = () => {
    if (!selectedTemplate) return;
    const state = applyTemplate(selectedTemplate);
    onApplyTemplate(state);
    onClose?.();
  };

  return (
    <div
      className={cn('flex flex-col h-full rounded-sm overflow-hidden bg-zinc-950 border border-zinc-800', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-sm flex items-center justify-center bg-zinc-900 border border-zinc-800">
            <Layout className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <h3 className="font-sans text-sm font-medium text-zinc-100">{t('story.templates.title')}</h3>
          <span className="font-mono text-[10px] text-zinc-600">{templates.length}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search + Filters */}
      <div className="px-5 py-3 space-y-3 border-b border-zinc-800">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-700" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedCategory(null);
            }}
            placeholder={t('story.templates.searchPlaceholder')}
            className="w-full pl-9 pr-8 py-2 rounded-sm font-sans text-sm text-zinc-200 bg-zinc-900 border border-zinc-800 placeholder:text-zinc-700 focus:outline-none focus:border-blue-500 transition-colors duration-200"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
          <button
            onClick={() => {
              setSelectedCategory(null);
              setSearchQuery('');
            }}
            className={cn(
              'px-3 py-1.5 rounded-sm text-xs font-sans whitespace-nowrap transition-all duration-200 border',
              !selectedCategory && !searchQuery
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
            )}
          >
            {t('common.all')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                setSearchQuery('');
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-sans whitespace-nowrap transition-all duration-200 border',
                selectedCategory === cat.id
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              )}
            >
              {categoryIcons[cat.id]}
              {tt.tCategory(cat.id)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-12 h-12 rounded-sm flex items-center justify-center bg-zinc-900 border border-zinc-800 mb-4">
                <Search className="w-5 h-5 text-zinc-700" />
              </div>
              <p className="text-sm text-zinc-500 mb-1">{t('story.templates.noTemplatesFound')}</p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors mt-1"
                >
                  {t('story.templates.clearSearch')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AnimatePresence mode="popLayout">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isSelected={selectedTemplate?.id === template.id}
                    onClick={() => setSelectedTemplate(template)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <AnimatePresence>
          {selectedTemplate && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="border-l border-zinc-800 overflow-hidden flex-shrink-0"
            >
              <div className="w-80 h-full">
                <TemplatePreview
                  template={selectedTemplate}
                  onApply={handleApply}
                  onClose={() => setSelectedTemplate(null)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default TemplatesGallery;
