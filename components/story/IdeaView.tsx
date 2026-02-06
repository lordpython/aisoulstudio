import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Heart, Laugh, Skull, Rocket, Search, Sword, Film, Ghost, Crown, Baby, Plane, BookOpen, Lightbulb, Wand2, ChevronDown, Layout } from 'lucide-react';
import { staggerContainer, staggerItem, cardHover, filmReelSpin } from '@/lib/cinematicMotion';
import { TemplatesGallery } from './TemplatesGallery';
import type { StoryState } from '@/types';

interface IdeaViewProps {
    initialTopic?: string;
    onGenerate: (topic: string, genre: string) => void;
    onApplyTemplate?: (state: Partial<StoryState>) => void;
    isProcessing?: boolean;
}

// Extended genre list with more options
const GENRES = [
    { id: 'Drama', label: 'Drama', icon: Heart, gradient: 'from-rose-900/40 to-rose-950/60', description: 'Emotional, character-driven narratives' },
    { id: 'Comedy', label: 'Comedy', icon: Laugh, gradient: 'from-amber-900/40 to-amber-950/60', description: 'Humor and lighthearted stories' },
    { id: 'Thriller', label: 'Thriller', icon: Skull, gradient: 'from-slate-800/40 to-slate-950/60', description: 'Suspense and tension' },
    { id: 'Sci-Fi', label: 'Sci-Fi', icon: Rocket, gradient: 'from-cyan-900/40 to-cyan-950/60', description: 'Futuristic and technological themes' },
    { id: 'Mystery', label: 'Mystery', icon: Search, gradient: 'from-violet-900/40 to-violet-950/60', description: 'Puzzles and investigations' },
    { id: 'Action', label: 'Action', icon: Sword, gradient: 'from-orange-900/40 to-orange-950/60', description: 'High-energy sequences' },
    { id: 'Horror', label: 'Horror', icon: Ghost, gradient: 'from-gray-900/40 to-gray-950/60', description: 'Fear and supernatural elements' },
    { id: 'Fantasy', label: 'Fantasy', icon: Wand2, gradient: 'from-purple-900/40 to-purple-950/60', description: 'Magic and mythical worlds' },
    { id: 'Romance', label: 'Romance', icon: Heart, gradient: 'from-pink-900/40 to-pink-950/60', description: 'Love stories and relationships' },
    { id: 'Historical', label: 'Historical', icon: Crown, gradient: 'from-yellow-900/40 to-yellow-950/60', description: 'Period pieces and true events' },
    { id: 'Documentary', label: 'Documentary', icon: BookOpen, gradient: 'from-emerald-900/40 to-emerald-950/60', description: 'Educational and factual content' },
    { id: 'Animation', label: 'Animation', icon: Baby, gradient: 'from-blue-900/40 to-blue-950/60', description: 'Animated storytelling' },
];

// Story templates/prompts for inspiration
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
    const [topic, setTopic] = useState(initialTopic);
    const [genre, setGenre] = useState('Drama');
    const [showAllGenres, setShowAllGenres] = useState(false);
    const [showInspiration, setShowInspiration] = useState(false);
    const [showTemplatesGallery, setShowTemplatesGallery] = useState(false);

    // Get template for current genre
    const currentTemplate = STORY_TEMPLATES.find(t => t.genre === genre);

    // Use inspiration template
    const handleUseTemplate = () => {
        if (currentTemplate) {
            setTopic(currentTemplate.prompt);
        }
    };

    // Visible genres (first 6 or all)
    const visibleGenres = showAllGenres ? GENRES : GENRES.slice(0, 6);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (topic.trim() && !isProcessing) {
            onGenerate(topic.trim(), genre);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-8">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-3xl"
            >
                {/* Cinematic Header */}
                <div className="text-center mb-12">
                    {/* Film Reel Decoration */}
                    <div className="flex items-center justify-center gap-4 mb-6">
                        <div className="w-16 h-px bg-gradient-to-r from-transparent to-[var(--cinema-spotlight)]/50" />
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            className="w-10 h-10 rounded-full border-2 border-[var(--cinema-spotlight)]/30 flex items-center justify-center"
                        >
                            <Film className="w-5 h-5 text-[var(--cinema-spotlight)]" />
                        </motion.div>
                        <div className="w-16 h-px bg-gradient-to-l from-transparent to-[var(--cinema-spotlight)]/50" />
                    </div>

                    {/* ACT ONE Title */}
                    <h1 className="font-display text-5xl text-[var(--cinema-silver)] tracking-tight mb-3">
                        ACT ONE
                    </h1>
                    <p className="font-script text-xl italic text-[var(--cinema-silver)]/60">
                        Every great film begins with an idea...
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-10">
                    {/* Topic Input - Paper Texture Style */}
                    <div>
                        <label htmlFor="topic-input" className="block font-display text-sm text-[var(--cinema-silver)]/70 mb-3 tracking-widest uppercase">
                            Your Story
                        </label>
                        <div className="relative">
                            <textarea
                                id="topic-input"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="A detective discovers that the murder they're investigating was committed by their own future self..."
                                className="
                                    w-full h-36 px-6 py-5
                                    bg-[var(--cinema-celluloid)]
                                    border-2 border-[var(--cinema-silver)]/10
                                    rounded-lg
                                    font-script text-lg text-[var(--cinema-silver)] italic
                                    placeholder:text-[var(--cinema-silver)]/30 placeholder:not-italic
                                    focus:outline-none focus:border-[var(--cinema-spotlight)]
                                    focus:shadow-[0_0_20px_var(--glow-spotlight)]
                                    resize-none
                                    transition-all duration-300
                                "
                                disabled={isProcessing}
                                autoFocus
                            />
                            {/* Paper texture overlay */}
                            <div className="absolute inset-0 pointer-events-none rounded-lg opacity-5 bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20200%20200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter%20id%3D%22noise%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.9%22%20numOctaves%3D%224%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23noise)%22%2F%3E%3C%2Fsvg%3E')]" />
                        </div>

                        {/* Inspiration Button */}
                        <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={handleUseTemplate}
                                    disabled={isProcessing || !currentTemplate}
                                    className="flex items-center gap-2 text-sm text-[var(--cinema-spotlight)]/70 hover:text-[var(--cinema-spotlight)] transition-colors disabled:opacity-40"
                                >
                                    <Lightbulb className="w-4 h-4" />
                                    <span>Need inspiration? Try a {genre} template</span>
                                </button>
                                {onApplyTemplate && (
                                    <button
                                        type="button"
                                        onClick={() => setShowTemplatesGallery(true)}
                                        disabled={isProcessing}
                                        className="flex items-center gap-2 text-sm text-violet-400/70 hover:text-violet-400 transition-colors disabled:opacity-40"
                                    >
                                        <Layout className="w-4 h-4" />
                                        <span>Browse Templates</span>
                                    </button>
                                )}
                            </div>
                            <span className="text-xs text-[var(--cinema-silver)]/40 font-mono">
                                {topic.length} chars
                            </span>
                        </div>
                    </div>

                    {/* Genre Selection - Poster Cards */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <label className="block font-display text-sm text-[var(--cinema-silver)]/70 tracking-widest uppercase">
                                Select Genre
                            </label>
                            {!showAllGenres && GENRES.length > 6 && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllGenres(true)}
                                    className="flex items-center gap-1 text-xs text-[var(--cinema-spotlight)] hover:text-[var(--cinema-spotlight)]/80 transition-colors"
                                >
                                    <span>Show all {GENRES.length} genres</span>
                                    <ChevronDown className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        <motion.div
                            variants={staggerContainer}
                            initial="initial"
                            animate="animate"
                            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                        >
                            {visibleGenres.map((g) => {
                                const Icon = g.icon;
                                const isSelected = genre === g.id;
                                return (
                                    <motion.button
                                        key={g.id}
                                        type="button"
                                        variants={staggerItem}
                                        onClick={() => setGenre(g.id)}
                                        disabled={isProcessing}
                                        whileHover={!isProcessing ? { scale: 1.03, y: -4 } : {}}
                                        whileTap={!isProcessing ? { scale: 0.98 } : {}}
                                        className={`
                                            group relative overflow-hidden
                                            aspect-[4/3] rounded-lg
                                            bg-gradient-to-b ${g.gradient}
                                            border-2 transition-all duration-300
                                            ${isSelected
                                                ? 'border-[var(--cinema-spotlight)] shadow-[0_0_30px_var(--glow-spotlight)]'
                                                : 'border-[var(--cinema-silver)]/10 hover:border-[var(--cinema-silver)]/30'
                                            }
                                            disabled:opacity-50 disabled:cursor-not-allowed
                                        `}
                                    >
                                        {/* Vignette overlay */}
                                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--cinema-void)_100%)] opacity-60" />

                                        {/* Content */}
                                        <div className="relative z-10 h-full flex flex-col items-center justify-center gap-2 p-4">
                                            <Icon className={`
                                                w-8 h-8 transition-colors duration-300
                                                ${isSelected ? 'text-[var(--cinema-spotlight)]' : 'text-[var(--cinema-silver)]/60 group-hover:text-[var(--cinema-silver)]'}
                                            `} />
                                            <span className={`
                                                font-display text-base tracking-wide transition-colors duration-300
                                                ${isSelected ? 'text-[var(--cinema-spotlight)]' : 'text-[var(--cinema-silver)]/80'}
                                            `}>
                                                {g.label}
                                            </span>
                                        </div>

                                        {/* Selection indicator */}
                                        {isSelected && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.5 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--cinema-spotlight)] flex items-center justify-center"
                                            >
                                                <div className="w-2 h-2 rounded-full bg-[var(--cinema-void)]" />
                                            </motion.div>
                                        )}
                                    </motion.button>
                                );
                            })}
                        </motion.div>
                    </div>

                    {/* Submit Button - Cinematic Gold */}
                    <motion.button
                        type="submit"
                        disabled={!topic.trim() || isProcessing}
                        whileHover={!isProcessing && topic.trim() ? { scale: 1.02 } : {}}
                        whileTap={!isProcessing && topic.trim() ? { scale: 0.98 } : {}}
                        className="
                            w-full flex items-center justify-center gap-3
                            btn-cinematic
                            px-8 py-4 rounded-lg
                            font-display text-lg tracking-wide
                            disabled:opacity-40 disabled:cursor-not-allowed
                            disabled:hover:transform-none disabled:hover:shadow-none
                        "
                    >
                        {isProcessing ? (
                            <>
                                {/* Film Reel Spinner */}
                                <div className="relative w-6 h-6">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-0 border-2 border-[var(--cinema-void)] border-t-transparent rounded-full"
                                    />
                                    <motion.div
                                        animate={{ rotate: -360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-1 border-2 border-[var(--cinema-void)]/50 border-b-transparent rounded-full"
                                    />
                                </div>
                                <span>Developing Your Vision...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5" />
                                <span>Begin the Story</span>
                            </>
                        )}
                    </motion.button>
                </form>

                {/* Decorative Footer */}
                <div className="mt-12 flex items-center justify-center gap-4">
                    <div className="w-24 h-px bg-gradient-to-r from-transparent via-[var(--cinema-silver)]/20 to-transparent" />
                    <span className="font-mono text-[10px] text-[var(--cinema-silver)]/30 tracking-widest">
                        LYRICLENS STUDIOS
                    </span>
                    <div className="w-24 h-px bg-gradient-to-r from-transparent via-[var(--cinema-silver)]/20 to-transparent" />
                </div>
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
