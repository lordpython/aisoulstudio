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
  narrative: <Film className="w-3.5 h-3.5" />,
  commercial: <ShoppingBag className="w-3.5 h-3.5" />,
  educational: <GraduationCap className="w-3.5 h-3.5" />,
  social: <Smartphone className="w-3.5 h-3.5" />,
  experimental: <Palette className="w-3.5 h-3.5" />,
};

const difficultyColors: Record<string, { color: string; bg: string }> = {
  beginner: { color: '#34D399', bg: 'rgba(52, 211, 153, 0.1)' },
  intermediate: { color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.1)' },
  advanced: { color: '#F87171', bg: 'rgba(248, 113, 113, 0.1)' },
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
  const colors = difficultyColors[template.difficulty] ?? { color: '#34D399', bg: 'rgba(52, 211, 153, 0.1)' };
  const tt = useTemplateTranslation();

  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="group relative cursor-pointer rounded-xl transition-all duration-200"
      style={{
        background: isSelected
          ? 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
        border: `1px solid ${isSelected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isSelected ? '0 0 0 2px rgba(255,255,255,0.05)' : 'none',
      }}
    >
      <div className="p-4">
        {/* Top row: difficulty + genre */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[10px] font-editorial font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md"
            style={{ color: colors.color, background: colors.bg }}
          >
            {tt.tDifficulty(template.difficulty)}
          </span>
          <span className="text-[10px] font-editorial font-medium tracking-wider uppercase px-2 py-0.5 rounded-md bg-white/5 text-white/40">
            {tt.tGenre(template.genre)}
          </span>
        </div>

        {/* Title */}
        <h4 className="font-editorial text-[15px] font-semibold text-white/90 mb-1.5 leading-snug">
          {tt.tName(template)}
        </h4>

        {/* Description */}
        <p className="font-editorial text-[12px] text-white/35 leading-relaxed line-clamp-2 mb-3">
          {tt.tDesc(template)}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-4 text-white/25">
          <span className="flex items-center gap-1.5 text-[11px] font-editorial">
            <Layers className="w-3 h-3" />
            {template.templateScenes.length}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-editorial">
            <Clock className="w-3 h-3" />
            {template.estimatedDuration}
          </span>
        </div>

        {/* Tags */}
        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
            {template.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-code text-white/25 px-1.5 py-0.5 rounded bg-white/[0.03]"
              >
                {tt.tTag(tag)}
              </span>
            ))}
            {template.tags.length > 3 && (
              <span className="text-[10px] font-code text-white/15">
                +{template.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Hover arrow */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <ChevronRight className="w-4 h-4 text-white/30" />
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
  const colors = difficultyColors[template.difficulty] ?? { color: '#34D399', bg: 'rgba(52, 211, 153, 0.1)' };

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="h-full flex flex-col"
    >
      {/* Preview header */}
      <div className="flex items-start justify-between p-5 pb-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[10px] font-editorial font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md"
              style={{ color: colors.color, background: colors.bg }}
            >
              {tt.tDifficulty(template.difficulty)}
            </span>
          </div>
          <h3 className="font-editorial text-lg font-semibold text-white leading-snug">
            {tt.tName(template)}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 -mr-1 text-white/25 hover:text-white/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <p className="font-editorial text-[13px] text-white/45 leading-relaxed">
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
              className="p-3 rounded-lg"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3 h-3 text-white/20" />
                <span className="text-[10px] font-editorial font-medium tracking-wider uppercase text-white/25">
                  {label}
                </span>
              </div>
              <p className="font-editorial text-[13px] font-medium text-white/75">{value}</p>
            </div>
          ))}
        </div>

        {/* Scene breakdown */}
        <div>
          <span className="text-[10px] font-editorial font-medium tracking-[0.15em] uppercase text-white/25 block mb-2.5">
            {t('story.templates.scenes')}
          </span>
          <div className="space-y-1.5">
            {template.templateScenes.map((scene, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-editorial font-semibold flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
                >
                  {scene.sceneNumber}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-code text-[11px] text-white/50 truncate">
                    {tt.tSceneHeading(template, scene.sceneNumber) || scene.heading}
                  </p>
                  <p className="font-editorial text-[11px] text-white/25 line-clamp-1 mt-0.5">
                    {tt.tSceneAction(template, scene.sceneNumber) || scene.action}
                  </p>
                </div>
                {scene.duration && (
                  <span className="font-code text-[10px] text-white/20 flex-shrink-0">{scene.duration}s</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Suggested styles */}
        {template.suggestedVisualStyles.length > 0 && (
          <div>
            <span className="text-[10px] font-editorial font-medium tracking-[0.15em] uppercase text-white/25 block mb-2.5">
              {t('story.templates.visualStyles')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {template.suggestedVisualStyles.map((style) => (
                <span
                  key={style}
                  className="text-[11px] font-editorial px-2.5 py-1 rounded-md text-white/40"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {tt.tStyle(style)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Apply button */}
      <div className="p-4 pt-3 border-t border-white/[0.04]">
        <motion.button
          onClick={onApply}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.99 }}
          className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-editorial text-[13px] font-semibold transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.85))',
            color: '#000',
            boxShadow: '0 2px 12px rgba(255,255,255,0.08)',
          }}
        >
          <span>{t('story.templates.useTemplate')}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </motion.button>
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
      // Search both original English and translated content
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
          // Also search original English values
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
      className={cn('flex flex-col h-full rounded-2xl overflow-hidden', className)}
      style={{
        background: 'linear-gradient(180deg, rgba(18,18,20,0.98), rgba(10,10,12,0.99))',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <Layout className="w-3.5 h-3.5 text-white/50" />
          </div>
          <h3 className="font-editorial text-[15px] font-semibold text-white/90">{t('story.templates.title')}</h3>
          <span className="font-code text-[11px] text-white/20">{templates.length}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/5 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search + Filters */}
      <div className="px-5 py-3 space-y-3 border-b border-white/[0.04]">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedCategory(null);
            }}
            placeholder={t('story.templates.searchPlaceholder')}
            className="w-full pl-9 pr-8 py-2 rounded-lg font-editorial text-[13px] text-white/80 placeholder:text-white/20 focus:outline-none transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-editorial font-medium whitespace-nowrap transition-all duration-200"
            style={{
              background: !selectedCategory && !searchQuery ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: !selectedCategory && !searchQuery ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
              border: `1px solid ${!selectedCategory && !searchQuery ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}`,
            }}
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-editorial font-medium whitespace-nowrap transition-all duration-200"
              style={{
                background: selectedCategory === cat.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: selectedCategory === cat.id ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                border: `1px solid ${selectedCategory === cat.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}`,
              }}
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
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <Search className="w-5 h-5 text-white/15" />
              </div>
              <p className="font-editorial text-[13px] text-white/30 mb-1">{t('story.templates.noTemplatesFound')}</p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="font-editorial text-[12px] text-white/40 hover:text-white/60 transition-colors mt-1"
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
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="border-l border-white/[0.06] overflow-hidden flex-shrink-0"
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
