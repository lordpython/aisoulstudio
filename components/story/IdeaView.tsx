import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Heart, Laugh, Skull, Rocket, Search, Sword, Film } from 'lucide-react';
import { staggerContainer, staggerItem, cardHover, filmReelSpin } from '@/lib/cinematicMotion';

interface IdeaViewProps {
    initialTopic?: string;
    onGenerate: (topic: string, genre: string) => void;
    isProcessing?: boolean;
}

const GENRES = [
    { id: 'Drama', label: 'Drama', icon: Heart, gradient: 'from-rose-900/40 to-rose-950/60' },
    { id: 'Comedy', label: 'Comedy', icon: Laugh, gradient: 'from-amber-900/40 to-amber-950/60' },
    { id: 'Thriller', label: 'Thriller', icon: Skull, gradient: 'from-slate-800/40 to-slate-950/60' },
    { id: 'Sci-Fi', label: 'Sci-Fi', icon: Rocket, gradient: 'from-cyan-900/40 to-cyan-950/60' },
    { id: 'Mystery', label: 'Mystery', icon: Search, gradient: 'from-violet-900/40 to-violet-950/60' },
    { id: 'Action', label: 'Action', icon: Sword, gradient: 'from-orange-900/40 to-orange-950/60' },
];

export const IdeaView: React.FC<IdeaViewProps> = ({
    initialTopic = '',
    onGenerate,
    isProcessing = false
}) => {
    const [topic, setTopic] = useState(initialTopic);
    const [genre, setGenre] = useState('Drama');

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
                    </div>

                    {/* Genre Selection - Poster Cards */}
                    <div>
                        <label className="block font-display text-sm text-[var(--cinema-silver)]/70 mb-4 tracking-widest uppercase">
                            Select Genre
                        </label>
                        <motion.div
                            variants={staggerContainer}
                            initial="initial"
                            animate="animate"
                            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                        >
                            {GENRES.map((g) => {
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
        </div>
    );
};

export default IdeaView;
