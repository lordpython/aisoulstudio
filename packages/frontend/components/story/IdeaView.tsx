import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Heart, Laugh, Skull, Rocket, Search, Sword, Ghost, Crown, Baby, BookOpen, Lightbulb, Wand2, ChevronRight, Layout, ArrowRight } from 'lucide-react';
import { TemplatesGallery } from './TemplatesGallery';
import type { StoryState } from '@/types';
import { useLanguage } from '@/i18n/useLanguage';

interface IdeaViewProps {
    initialTopic?: string;
    onGenerate: (topic: string, genre: string) => void;
    onApplyTemplate?: (state: Partial<StoryState>) => void;
    isProcessing?: boolean;
}

const GENRES = [
    { id: 'Drama', icon: Heart },
    { id: 'Comedy', icon: Laugh },
    { id: 'Thriller', icon: Skull },
    { id: 'Sci-Fi', icon: Rocket },
    { id: 'Mystery', icon: Search },
    { id: 'Action', icon: Sword },
    { id: 'Horror', icon: Ghost },
    { id: 'Fantasy', icon: Wand2 },
    { id: 'Romance', icon: Heart },
    { id: 'Historical', icon: Crown },
    { id: 'Documentary', icon: BookOpen },
    { id: 'Animation', icon: Baby },
];

const STORY_TEMPLATES = [
    { genre: 'Drama', prompt: 'A family reunites after 20 years to confront a secret that tore them apart...' },
    { genre: 'Thriller', prompt: 'A detective discovers that the murder they\'re investigating was committed by their own future self...' },
    { genre: 'Sci-Fi', prompt: 'In 2150, humanity discovers that Earth\'s moon is actually an ancient alien spacecraft...' },
    { genre: 'Mystery', prompt: 'A small town librarian finds coded messages hidden in returned books, leading to a decades-old conspiracy...' },
    { genre: 'Comedy', prompt: 'A wedding planner must organize the perfect ceremony for their ex and their new partner...' },
    { genre: 'Action', prompt: 'A retired spy is pulled back into the game when their grandchild is kidnapped by an old enemy...' },
    { genre: 'Horror', prompt: 'A family moves into their dream home, only to discover the previous owners never actually left...' },
    { genre: 'Fantasy', prompt: 'A young mapmaker discovers their drawings have the power to reshape reality...' },
    { genre: 'Romance', prompt: 'Two rival food truck owners compete for the same corner, but find themselves falling for each other...' },
    { genre: 'Historical', prompt: 'The untold story of the women codebreakers who helped win World War II...' },
    { genre: 'Documentary', prompt: 'An exploration of how a small village in Japan became the world\'s longest-living community...' },
    { genre: 'Animation', prompt: 'A young robot dreams of becoming a painter in a world where machines aren\'t supposed to create art...' },
];

export const IdeaView: React.FC<IdeaViewProps> = ({
    initialTopic = '',
    onGenerate,
    onApplyTemplate,
    isProcessing = false
}) => {
    const { t } = useLanguage();
    const [topic, setTopic] = useState(initialTopic);
    const [genre, setGenre] = useState('Drama');
    const [showAllGenres, setShowAllGenres] = useState(false);
    const [showTemplatesGallery, setShowTemplatesGallery] = useState(false);
    const [expandMessage, setExpandMessage] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const currentTemplate = STORY_TEMPLATES.find(t => t.genre === genre);
    const visibleGenres = showAllGenres ? GENRES : GENRES.slice(0, 6);

    const handleUseTemplate = () => {
        if (currentTemplate) {
            setTopic(currentTemplate.prompt);
            textareaRef.current?.focus();
        }
    };

    /** Smart Expand: enrich short prompts with narrative scaffolding */
    const handleSmartExpand = () => {
        if (!topic.trim()) return;
        if (topic.length < 50) {
            setTopic(
                'Expand this idea into a rich narrative: ' +
                topic +
                '... (include vivid settings, character motivations, and a surprising twist)'
            );
            textareaRef.current?.focus();
        } else {
            setExpandMessage('Prompt is already detailed enough');
            setTimeout(() => setExpandMessage(null), 2000);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (topic.trim() && !isProcessing) {
            onGenerate(topic.trim(), genre);
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.max(120, textareaRef.current.scrollHeight) + 'px';
        }
    }, [topic]);

    return (
        <div className="flex flex-col items-center min-h-[70vh] px-6 py-12 bg-black">
            <div className="w-full max-w-2xl">
                {/* Header */}
                <div className="mb-10">
                    <h1 className="font-sans text-3xl font-medium tracking-tight text-zinc-100">
                        {t('story.whatsYourStory')}
                    </h1>
                    <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
                        {t('story.describeYourConcept')}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Textarea */}
                    <div>
                        <div className="bg-zinc-900 border border-zinc-800 rounded-sm focus-within:border-blue-500/50 transition-colors duration-200">
                            <textarea
                                ref={textareaRef}
                                id="topic-input"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder={t('story.placeholderStory')}
                                className="
                                    w-full min-h-[120px] px-5 py-4
                                    bg-transparent
                                    text-[15px] text-zinc-100 leading-relaxed
                                    placeholder:text-zinc-600
                                    focus:outline-none
                                    resize-none
                                "
                                disabled={isProcessing}
                                autoFocus
                            />

                            {/* Bottom bar */}
                            <div className="flex items-center justify-between px-5 pb-3.5 pt-0">
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleUseTemplate}
                                        disabled={isProcessing || !currentTemplate}
                                        className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors duration-200 disabled:opacity-30 disabled:hover:text-zinc-500"
                                    >
                                        <Lightbulb className="w-3.5 h-3.5" />
                                        <span>{t('story.tryTemplate')}</span>
                                    </button>
                                    {onApplyTemplate && (
                                        <>
                                            <div className="w-px h-3 bg-zinc-800" />
                                            <button
                                                type="button"
                                                onClick={() => setShowTemplatesGallery(true)}
                                                disabled={isProcessing}
                                                className="flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors duration-200 disabled:opacity-30"
                                            >
                                                <Layout className="w-3.5 h-3.5" />
                                                <span>{t('story.browseAll')}</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                                <span className="font-mono text-[10px] text-zinc-600 tabular-nums">
                                    {topic.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Smart Expand Button */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={handleSmartExpand}
                            disabled={isProcessing || !topic.trim()}
                            className="bg-zinc-900 border border-zinc-800 rounded-sm text-zinc-400 hover:text-blue-400 hover:border-blue-500/50 transition-colors duration-200 px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Smart Expand</span>
                        </button>
                        {expandMessage && (
                            <span className="absolute left-0 top-full mt-1.5 text-xs font-mono text-zinc-500 animate-pulse">
                                {expandMessage}
                            </span>
                        )}
                    </div>

                    {/* Genre Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="font-mono text-[11px] font-medium tracking-[0.15em] uppercase text-zinc-500">
                                {t('story.genre')}
                            </span>
                            {!showAllGenres && GENRES.length > 6 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllGenres(true)}
                                    className="flex items-center gap-1 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors duration-200"
                                >
                                    <span>{t('story.allCount', { count: GENRES.length })}</span>
                                    <ChevronRight className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {visibleGenres.map((g) => {
                                const Icon = g.icon;
                                const isSelected = genre === g.id;
                                return (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => setGenre(g.id)}
                                        disabled={isProcessing}
                                        className={`
                                            flex items-center gap-2 px-3 py-1.5 rounded-sm
                                            border transition-colors duration-200
                                            disabled:opacity-40 disabled:cursor-not-allowed
                                            ${isSelected
                                                ? 'bg-blue-500/10 border-blue-500/50'
                                                : 'border-zinc-800 hover:border-zinc-600'
                                            }
                                        `}
                                    >
                                        <Icon
                                            className={`w-3.5 h-3.5 transition-colors duration-200 ${
                                                isSelected ? 'text-blue-400' : 'text-zinc-600'
                                            }`}
                                        />
                                        <span
                                            className={`text-[13px] font-medium transition-colors duration-200 ${
                                                isSelected ? 'text-blue-400' : 'text-zinc-500'
                                            }`}
                                        >
                                            {t(`story.genres.${g.id}`)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Submit */}
                    <div>
                        <button
                            type="submit"
                            disabled={!topic.trim() || isProcessing}
                            className={`
                                w-full flex items-center justify-center gap-3
                                px-8 py-3 rounded-sm
                                font-mono text-sm font-medium
                                transition-colors duration-200
                                ${topic.trim() && !isProcessing
                                    ? 'bg-white text-black hover:bg-zinc-200'
                                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                }
                            `}
                        >
                            {isProcessing ? (
                                <>
                                    <div className="w-4 h-4 rounded-sm border-2 border-current border-t-transparent animate-spin" />
                                    <span>{t('story.buildingStory')}</span>
                                </>
                            ) : (
                                <>
                                    <span>{t('story.beginStory')}</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Templates Gallery Modal */}
            <AnimatePresence>
                {showTemplatesGallery && onApplyTemplate && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                        onClick={() => setShowTemplatesGallery(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.97, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.97, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="w-full max-w-5xl h-[80vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <TemplatesGallery
                                onApplyTemplate={(state) => {
                                    onApplyTemplate(state);
                                    setShowTemplatesGallery(false);
                                }}
                                onClose={() => setShowTemplatesGallery(false)}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default IdeaView;
