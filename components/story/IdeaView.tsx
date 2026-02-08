import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Heart, Laugh, Skull, Rocket, Search, Sword, Ghost, Crown, Baby, BookOpen, Lightbulb, Wand2, ChevronRight, Layout, ArrowRight, Zap } from 'lucide-react';
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
    { id: 'Drama', icon: Heart, color: '#F43F5E', bg: 'rgba(244, 63, 94, 0.08)' },
    { id: 'Comedy', icon: Laugh, color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.08)' },
    { id: 'Thriller', icon: Skull, color: '#64748B', bg: 'rgba(100, 116, 139, 0.08)' },
    { id: 'Sci-Fi', icon: Rocket, color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.08)' },
    { id: 'Mystery', icon: Search, color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.08)' },
    { id: 'Action', icon: Sword, color: '#F97316', bg: 'rgba(249, 115, 22, 0.08)' },
    { id: 'Horror', icon: Ghost, color: '#6B7280', bg: 'rgba(107, 114, 128, 0.08)' },
    { id: 'Fantasy', icon: Wand2, color: '#A855F7', bg: 'rgba(168, 85, 247, 0.08)' },
    { id: 'Romance', icon: Heart, color: '#EC4899', bg: 'rgba(236, 72, 153, 0.08)' },
    { id: 'Historical', icon: Crown, color: '#D97706', bg: 'rgba(217, 119, 6, 0.08)' },
    { id: 'Documentary', icon: BookOpen, color: '#10B981', bg: 'rgba(16, 185, 129, 0.08)' },
    { id: 'Animation', icon: Baby, color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.08)' },
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
    const [textareaFocused, setTextareaFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const currentTemplate = STORY_TEMPLATES.find(t => t.genre === genre);
    const selectedGenre = GENRES.find(g => g.id === genre);
    const visibleGenres = showAllGenres ? GENRES : GENRES.slice(0, 6);

    const handleUseTemplate = () => {
        if (currentTemplate) {
            setTopic(currentTemplate.prompt);
            textareaRef.current?.focus();
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
        <div className="flex flex-col items-center min-h-[70vh] px-6 py-12">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-2xl"
            >
                {/* Minimal Header */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.5 }}
                    className="mb-10"
                >
                    <div className="flex items-center gap-3 mb-3">
                        <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #fff2, #fff1)' }}
                        >
                            <Zap className="w-3.5 h-3.5 text-white/70" />
                        </div>
                        <span className="font-editorial text-[11px] font-medium tracking-[0.2em] uppercase text-white/40">
                            {t('story.storyIdea')}
                        </span>
                    </div>
                    <h1 className="font-editorial text-3xl font-semibold text-white tracking-tight leading-tight">
                        {t('story.whatsYourStory')}
                    </h1>
                    <p className="font-editorial text-[15px] text-white/40 mt-2 leading-relaxed">
                        {t('story.describeYourConcept')}
                    </p>
                </motion.div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Textarea */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                    >
                        <div
                            className="relative rounded-xl transition-all duration-300"
                            style={{
                                background: textareaFocused
                                    ? 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))'
                                    : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                                border: `1px solid ${textareaFocused ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
                                boxShadow: textareaFocused
                                    ? '0 0 0 3px rgba(255,255,255,0.03), 0 8px 32px rgba(0,0,0,0.3)'
                                    : 'none',
                            }}
                        >
                            <textarea
                                ref={textareaRef}
                                id="topic-input"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                onFocus={() => setTextareaFocused(true)}
                                onBlur={() => setTextareaFocused(false)}
                                placeholder={t('story.placeholderStory')}
                                className="
                                    w-full min-h-[120px] px-5 py-4
                                    bg-transparent
                                    font-editorial text-[15px] text-white/90 leading-relaxed
                                    placeholder:text-white/20
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
                                        className="flex items-center gap-1.5 text-[12px] font-editorial font-medium text-white/30 hover:text-white/60 transition-colors disabled:opacity-30 disabled:hover:text-white/30"
                                    >
                                        <Lightbulb className="w-3.5 h-3.5" />
                                        <span>{t('story.tryTemplate')}</span>
                                    </button>
                                    {onApplyTemplate && (
                                        <>
                                            <div className="w-px h-3 bg-white/10" />
                                            <button
                                                type="button"
                                                onClick={() => setShowTemplatesGallery(true)}
                                                disabled={isProcessing}
                                                className="flex items-center gap-1.5 text-[12px] font-editorial font-medium text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
                                            >
                                                <Layout className="w-3.5 h-3.5" />
                                                <span>{t('story.browseAll')}</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                                <span className="font-code text-[11px] text-white/20 tabular-nums">
                                    {topic.length}
                                </span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Genre Selection */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="font-editorial text-[11px] font-medium tracking-[0.15em] uppercase text-white/35">
                                {t('story.genre')}
                            </span>
                            {!showAllGenres && GENRES.length > 6 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllGenres(true)}
                                    className="flex items-center gap-1 text-[11px] font-editorial font-medium text-white/30 hover:text-white/60 transition-colors"
                                >
                                    <span>{t('story.allCount', { count: GENRES.length })}</span>
                                    <ChevronRight className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <AnimatePresence mode="popLayout">
                                {visibleGenres.map((g, i) => {
                                    const Icon = g.icon;
                                    const isSelected = genre === g.id;
                                    return (
                                        <motion.button
                                            key={g.id}
                                            type="button"
                                            layout
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            transition={{ delay: i * 0.03, duration: 0.25 }}
                                            onClick={() => setGenre(g.id)}
                                            disabled={isProcessing}
                                            className="group relative flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                            style={{
                                                background: isSelected ? g.bg : 'transparent',
                                                border: `1px solid ${isSelected ? g.color + '30' : 'rgba(255,255,255,0.06)'}`,
                                                boxShadow: isSelected ? `0 0 20px ${g.color}10` : 'none',
                                            }}
                                            whileHover={!isProcessing ? { scale: 1.03 } : {}}
                                            whileTap={!isProcessing ? { scale: 0.97 } : {}}
                                        >
                                            <Icon
                                                className="w-3.5 h-3.5 transition-colors duration-200"
                                                style={{ color: isSelected ? g.color : 'rgba(255,255,255,0.3)' }}
                                            />
                                            <span
                                                className="font-editorial text-[13px] font-medium transition-colors duration-200"
                                                style={{ color: isSelected ? g.color : 'rgba(255,255,255,0.5)' }}
                                            >
                                                {t(`story.genres.${g.id}`)}
                                            </span>

                                            {isSelected && (
                                                <motion.div
                                                    layoutId="genre-dot"
                                                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                                                    style={{ background: g.color }}
                                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                />
                                            )}
                                        </motion.button>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* Submit */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.4 }}
                    >
                        <motion.button
                            type="submit"
                            disabled={!topic.trim() || isProcessing}
                            whileHover={!isProcessing && topic.trim() ? { y: -1 } : {}}
                            whileTap={!isProcessing && topic.trim() ? { scale: 0.99 } : {}}
                            className="
                                group w-full flex items-center justify-center gap-3
                                px-8 py-3.5 rounded-xl
                                font-editorial text-[14px] font-semibold tracking-wide
                                transition-all duration-300
                                disabled:opacity-30 disabled:cursor-not-allowed
                            "
                            style={{
                                background: topic.trim() && !isProcessing
                                    ? `linear-gradient(135deg, ${selectedGenre?.color || '#fff'}, ${selectedGenre?.color || '#fff'}cc)`
                                    : 'rgba(255,255,255,0.06)',
                                color: topic.trim() && !isProcessing ? '#000' : 'rgba(255,255,255,0.3)',
                                boxShadow: topic.trim() && !isProcessing
                                    ? `0 4px 24px ${selectedGenre?.color || '#fff'}30, 0 1px 3px rgba(0,0,0,0.3)`
                                    : 'none',
                            }}
                        >
                            {isProcessing ? (
                                <>
                                    <motion.div
                                        className="w-4 h-4 rounded-full border-2 border-current border-t-transparent"
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                                    />
                                    <span>{t('story.buildingStory')}</span>
                                </>
                            ) : (
                                <>
                                    <span>{t('story.beginStory')}</span>
                                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                                </>
                            )}
                        </motion.button>
                    </motion.div>
                </form>
            </motion.div>

            {/* Templates Gallery Modal */}
            <AnimatePresence>
                {showTemplatesGallery && onApplyTemplate && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                        onClick={() => setShowTemplatesGallery(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
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
