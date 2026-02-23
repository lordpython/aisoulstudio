/**
 * Format Selector Component
 *
 * Displays 8 video format options in a grid layout.
 * Handles format selection, genre filtering, and format-specific placeholder text.
 * Prevents pipeline execution until a format is selected.
 *
 * Requirements: 1.1, 1.3, 1.4, 1.5
 * Properties: 43 (Genre Filtering), 44 (Format-Specific Placeholder), 45 (Execution Prevention)
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  Megaphone,
  Film,
  GraduationCap,
  Smartphone,
  Camera,
  Music,
  Newspaper,
  ChevronRight,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VideoFormat, FormatMetadata } from '@/types';
import { formatRegistry } from '@/services/formatRegistry';

// Map format IDs to lucide icons
const FORMAT_ICONS: Record<VideoFormat, React.ElementType> = {
  'youtube-narrator': Mic,
  advertisement: Megaphone,
  'movie-animation': Film,
  educational: GraduationCap,
  shorts: Smartphone,
  documentary: Camera,
  'music-video': Music,
  'news-politics': Newspaper,
};

// Format-specific placeholder text for the idea input
const FORMAT_PLACEHOLDERS: Record<VideoFormat, string> = {
  'youtube-narrator':
    'Describe a topic you want to narrate about... e.g., "The hidden history of the Silk Road"',
  advertisement:
    'Describe your product or service... e.g., "A new fitness app that uses AI to create personalized workouts"',
  'movie-animation':
    'Describe your story concept... e.g., "A young robot dreams of becoming a painter"',
  educational:
    'Describe what you want to teach... e.g., "How photosynthesis works at the molecular level"',
  shorts:
    'Describe a short, punchy idea... e.g., "3 mind-blowing facts about the ocean"',
  documentary:
    'Describe your documentary subject... e.g., "The rise and fall of a forgotten civilization"',
  'music-video':
    'Describe the song mood and theme... e.g., "An upbeat pop song about chasing your dreams"',
  'news-politics':
    'Describe the news topic... e.g., "The impact of AI regulation on global tech industries"',
};

export interface FormatSelectorProps {
  selectedFormat: VideoFormat | null;
  onFormatSelect: (format: VideoFormat) => void;
  selectedGenre: string | null;
  onGenreSelect: (genre: string) => void;
  idea: string;
  onIdeaChange: (idea: string) => void;
  onExecute: () => void;
  isProcessing?: boolean;
}

export function FormatSelector({
  selectedFormat,
  onFormatSelect,
  selectedGenre,
  onGenreSelect,
  idea,
  onIdeaChange,
  onExecute,
  isProcessing = false,
}: FormatSelectorProps) {
  const [showExecutionError, setShowExecutionError] = useState(false);

  const allFormats = useMemo(() => formatRegistry.getAllFormats(), []);

  const selectedFormatMetadata = useMemo(
    () => (selectedFormat ? formatRegistry.getFormat(selectedFormat) : null),
    [selectedFormat],
  );

  // Property 43: Genre list is exactly the format's applicableGenres
  const applicableGenres = useMemo(
    () => selectedFormatMetadata?.applicableGenres ?? [],
    [selectedFormatMetadata],
  );

  // Property 44: Placeholder updates based on format
  const placeholder = selectedFormat
    ? FORMAT_PLACEHOLDERS[selectedFormat]
    : 'Select a format above to get started...';

  // Property 45: Prevent execution without format
  const handleExecuteClick = () => {
    if (!selectedFormat) {
      setShowExecutionError(true);
      setTimeout(() => setShowExecutionError(false), 3000);
      return;
    }
    onExecute();
  };

  const canExecute = !!selectedFormat && idea.trim().length > 0 && !isProcessing;

  return (
    <div className="flex flex-col items-center min-h-[70vh] px-6 py-12 bg-black">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-sans text-3xl font-medium tracking-tight text-zinc-100">
            What will you create?
          </h1>
          <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
            Choose a format to shape your entire production pipeline
          </p>
        </div>

        {/* Format Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {allFormats.map((format) => {
            const Icon = FORMAT_ICONS[format.id];
            const isSelected = selectedFormat === format.id;

            return (
              <button
                key={format.id}
                type="button"
                onClick={() => onFormatSelect(format.id)}
                disabled={isProcessing}
                className={cn(
                  'group relative flex flex-col items-center gap-2.5 px-4 py-5 rounded-sm border transition-all duration-200',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  isSelected
                    ? 'bg-blue-500/10 border-blue-500/50'
                    : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900/50',
                )}
              >
                <Icon
                  className={cn(
                    'w-6 h-6 transition-colors duration-200',
                    isSelected ? 'text-blue-400' : 'text-zinc-500 group-hover:text-zinc-300',
                  )}
                />
                <span
                  className={cn(
                    'text-[13px] font-medium text-center leading-tight transition-colors duration-200',
                    isSelected ? 'text-blue-400' : 'text-zinc-400 group-hover:text-zinc-200',
                  )}
                >
                  {format.name}
                </span>
                <span className="text-[10px] text-zinc-600 text-center leading-snug line-clamp-2">
                  {format.description}
                </span>
              </button>
            );
          })}
        </div>

        {/* Genre Selection - only shown when format is selected */}
        <AnimatePresence>
          {selectedFormat && applicableGenres.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="mb-8"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[11px] font-medium tracking-[0.15em] uppercase text-zinc-500">
                  Genre
                </span>
                <span className="text-[10px] font-mono text-zinc-600">
                  {applicableGenres.length} available
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {applicableGenres.map((genre) => {
                  const isSelected = selectedGenre === genre;
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => onGenreSelect(genre)}
                      disabled={isProcessing}
                      className={cn(
                        'px-3 py-1.5 rounded-sm border text-[13px] font-medium transition-colors duration-200',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        isSelected
                          ? 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                          : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
                      )}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Idea Input */}
        <div className="mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-sm focus-within:border-blue-500/50 transition-colors duration-200">
            <textarea
              value={idea}
              onChange={(e) => onIdeaChange(e.target.value)}
              placeholder={placeholder}
              disabled={isProcessing}
              className="
                w-full min-h-[120px] px-5 py-4
                bg-transparent
                text-[15px] text-zinc-100 leading-relaxed
                placeholder:text-zinc-600
                focus:outline-none
                resize-none
              "
            />
            <div className="flex items-center justify-end px-5 pb-3.5 pt-0">
              <span className="font-mono text-[10px] text-zinc-600 tabular-nums">
                {idea.length}
              </span>
            </div>
          </div>
        </div>

        {/* Execute Button */}
        <div className="relative">
          <button
            type="button"
            onClick={handleExecuteClick}
            disabled={isProcessing}
            className={cn(
              'w-full flex items-center justify-center gap-3 px-8 py-3 rounded-sm font-mono text-sm font-medium transition-colors duration-200',
              canExecute
                ? 'bg-white text-black hover:bg-zinc-200'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed',
            )}
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 rounded-sm border-2 border-current border-t-transparent animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Start Production</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Execution prevention error */}
          <AnimatePresence>
            {showExecutionError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 right-0 mt-2 flex items-center gap-2 text-xs text-red-400 font-mono"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Please select a format before starting production</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/**
 * Utility: get applicable genres for a format ID.
 * Used by property tests.
 */
export function getGenresForFormat(formatId: string): string[] {
  const format = formatRegistry.getFormat(formatId);
  return format?.applicableGenres ?? [];
}

/**
 * Utility: get placeholder text for a format ID.
 * Used by property tests.
 */
export function getPlaceholderForFormat(formatId: VideoFormat): string {
  return FORMAT_PLACEHOLDERS[formatId] ?? '';
}

export default FormatSelector;
