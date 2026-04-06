/**
 * TemplatesScreen - Browseable gallery of video format templates
 *
 * Displays all registered video formats from FormatRegistry with metadata,
 * genre tags, duration ranges, and a "Use Template" CTA that routes to
 * the studio with pre-filled format config.
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  Clock,
  Sparkles,
  ArrowRight,
  Filter,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/useLanguage';
import { ScreenLayout } from '@/components/layout/ScreenLayout';
import { BlurFade } from '@/components/motion-primitives/blur-fade';
import { formatRegistry } from '@/services/format/formatRegistry';
import type { FormatMetadata } from '@/types';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const FORMAT_COLORS: Record<string, string> = {
  'youtube-narrator': 'from-red-500/20 to-red-900/10 border-red-500/20',
  'advertisement': 'from-amber-500/20 to-amber-900/10 border-amber-500/20',
  'movie-animation': 'from-purple-500/20 to-purple-900/10 border-purple-500/20',
  'educational': 'from-blue-500/20 to-blue-900/10 border-blue-500/20',
  'shorts': 'from-pink-500/20 to-pink-900/10 border-pink-500/20',
  'documentary': 'from-emerald-500/20 to-emerald-900/10 border-emerald-500/20',
  'music-video': 'from-violet-500/20 to-violet-900/10 border-violet-500/20',
  'news-politics': 'from-cyan-500/20 to-cyan-900/10 border-cyan-500/20',
};

function TemplateCard({
  format,
  index,
  onUse,
}: {
  format: FormatMetadata;
  index: number;
  onUse: (format: FormatMetadata) => void;
}) {
  const colorClass = FORMAT_COLORS[format.id] || 'from-primary/20 to-primary/5 border-primary/20';

  return (
    <BlurFade delay={index * 0.06} inView>
      <motion.div
        className={cn(
          'group relative rounded-2xl border bg-gradient-to-br p-6 transition-all',
          'hover:shadow-xl hover:shadow-black/20 hover:scale-[1.02] hover:border-primary/40',
          'cursor-pointer',
          colorClass
        )}
        whileHover={{ y: -2 }}
        onClick={() => onUse(format)}
      >
        {/* Icon & Name */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl" role="img" aria-label={format.name}>
              {format.icon}
            </span>
            <div>
              <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                {format.name}
              </h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3 h-3" />
                {formatDuration(format.durationRange.min)} – {formatDuration(format.durationRange.max)}
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {format.description}
        </p>

        {/* Genres */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {format.applicableGenres.slice(0, 4).map((genre) => (
            <span
              key={genre}
              className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-white/5 text-muted-foreground border border-white/10"
            >
              {genre}
            </span>
          ))}
          {format.applicableGenres.length > 4 && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-white/5 text-muted-foreground border border-white/10">
              +{format.applicableGenres.length - 4}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {format.requiresResearch && (
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Research-backed
            </span>
          )}
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {format.supportedLanguages?.join(', ').toUpperCase() || 'EN'}
          </span>
          <span>{format.aspectRatio}</span>
        </div>

        {format.deprecated && (
          <div className="absolute top-3 end-3 px-2 py-0.5 text-[10px] font-medium rounded-full bg-destructive/20 text-destructive border border-destructive/30">
            Deprecated
          </div>
        )}
      </motion.div>
    </BlurFade>
  );
}

export default function TemplatesScreen() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showDeprecated, setShowDeprecated] = useState(false);

  const allFormats = useMemo(() => formatRegistry.getAllFormats(), []);

  const filteredFormats = useMemo(() => {
    let formats = showDeprecated ? allFormats : allFormats.filter(f => !f.deprecated);

    if (search.trim()) {
      const q = search.toLowerCase();
      formats = formats.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.applicableGenres.some(g => g.toLowerCase().includes(q))
      );
    }

    return formats;
  }, [allFormats, search, showDeprecated]);

  const handleUseTemplate = (format: FormatMetadata) => {
    const params = new URLSearchParams({
      mode: 'story',
      format: format.id,
    });
    navigate(`/studio?${params.toString()}`);
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('templates.search') || 'Search templates...'}
          className="ps-9 h-9 w-64 bg-secondary"
        />
      </div>
    </div>
  );

  return (
    <ScreenLayout
      title={t('templates.title') || 'Templates'}
      showBackButton
      onBack={() => navigate('/')}
      headerActions={headerActions}
      maxWidth="full"
      contentClassName="py-8 px-6"
    >
      <div className="space-y-6">
        {/* Summary */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredFormats.length} {t('templates.available') || 'templates available'}
          </p>
          {formatRegistry.getDeprecatedFormats().length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeprecated(!showDeprecated)}
              className="text-xs text-muted-foreground"
            >
              <Filter className="w-3 h-3 me-1" />
              {showDeprecated ? 'Hide deprecated' : 'Show deprecated'}
            </Button>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFormats.map((format, index) => (
            <TemplateCard
              key={format.id}
              format={format}
              index={index}
              onUse={handleUseTemplate}
            />
          ))}
        </div>

        {/* Empty state */}
        {filteredFormats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Search className="w-10 h-10 opacity-20" />
            <p className="text-sm">{t('templates.noResults') || 'No templates match your search'}</p>
            <Button variant="outline" size="sm" onClick={() => setSearch('')}>
              {t('templates.clearSearch') || 'Clear search'}
            </Button>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
}
