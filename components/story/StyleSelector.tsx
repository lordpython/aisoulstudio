/**
 * StyleSelector.tsx
 * Editorial-style visual style gallery with cinematic presentation.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Film, RectangleHorizontal, Cpu } from 'lucide-react';
import {
    VISUAL_STYLES,
    ASPECT_RATIOS,
    type VisualStyleKey,
    type AspectRatioId,
} from '@/constants/visualStyles';
import { staggerContainer, staggerItem } from '@/lib/cinematicMotion';

interface StyleSelectorProps {
    selectedStyle: VisualStyleKey;
    onSelectStyle: (style: VisualStyleKey) => void;
    aspectRatio: AspectRatioId;
    onSelectAspectRatio: (ratio: AspectRatioId) => void;
    imageProvider?: 'gemini' | 'deapi';
    onSelectImageProvider?: (provider: 'gemini' | 'deapi') => void;
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({
    selectedStyle,
    onSelectStyle,
    aspectRatio,
    onSelectAspectRatio,
    imageProvider = 'gemini',
    onSelectImageProvider,
}) => {
    const styles = Object.values(VISUAL_STYLES);

    const stylesByCategory = {
        cinematic: styles.filter(s => s.category === 'cinematic'),
        artistic: styles.filter(s => s.category === 'artistic'),
        stylized: styles.filter(s => s.category === 'stylized'),
        modern: styles.filter(s => s.category === 'modern'),
    };

    const categoryLabels: Record<string, string> = {
        cinematic: 'Cinematic',
        artistic: 'Artistic',
        stylized: 'Stylized',
        modern: 'Modern',
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            {/* Cinematic Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-12"
            >
                <div className="flex items-center justify-center gap-4 mb-6">
                    <div className="w-12 h-px bg-[var(--cinema-spotlight)]/30" />
                    <Film className="w-6 h-6 text-[var(--cinema-spotlight)]" />
                    <div className="w-12 h-px bg-[var(--cinema-spotlight)]/30" />
                </div>
                <h2 className="font-display text-4xl text-[var(--cinema-silver)] tracking-tight mb-3">
                    VISUAL DIRECTION
                </h2>
                <p className="font-script italic text-[var(--cinema-silver)]/60 text-lg">
                    Choose a style that matches your story's mood
                </p>
            </motion.div>

            {/* Aspect Ratio Selector - Film Frame Style */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mb-12"
            >
                <div className="flex items-center gap-3 mb-4">
                    <RectangleHorizontal className="w-4 h-4 text-[var(--cinema-silver)]/40" />
                    <span className="font-mono text-xs text-[var(--cinema-silver)]/40 uppercase tracking-widest">
                        Frame Ratio
                    </span>
                </div>
                <div className="flex flex-wrap gap-3">
                    {ASPECT_RATIOS.slice(0, 4).map((ratio) => {
                        const isSelected = aspectRatio === ratio.id;
                        return (
                            <motion.button
                                key={ratio.id}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onSelectAspectRatio(ratio.id)}
                                className={`
                                    group relative px-5 py-3 rounded-lg transition-all duration-300
                                    ${isSelected
                                        ? 'bg-[var(--cinema-spotlight)]/20 border-2 border-[var(--cinema-spotlight)] shadow-[0_0_20px_var(--glow-spotlight)]'
                                        : 'bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10 hover:border-[var(--cinema-silver)]/30'
                                    }
                                `}
                            >
                                <span className={`
                                    font-display text-lg transition-colors
                                    ${isSelected ? 'text-[var(--cinema-spotlight)]' : 'text-[var(--cinema-silver)]'}
                                `}>
                                    {ratio.label}
                                </span>
                                <span className={`
                                    ml-2 font-script italic text-sm
                                    ${isSelected ? 'text-[var(--cinema-spotlight)]/70' : 'text-[var(--cinema-silver)]/40'}
                                `}>
                                    {ratio.description}
                                </span>
                            </motion.button>
                        );
                    })}
                </div>
            </motion.div>

            {/* Image Provider Selector */}
            {onSelectImageProvider && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="mb-12"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <Cpu className="w-4 h-4 text-[var(--cinema-silver)]/40" />
                        <span className="font-mono text-xs text-[var(--cinema-silver)]/40 uppercase tracking-widest">
                            Image Engine
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {([
                            { id: 'gemini' as const, label: 'Imagen 4', desc: 'Google AI (default)' },
                            { id: 'deapi' as const, label: 'FLUX.2 Klein', desc: 'DeAPI, fast generation' },
                        ]).map((provider) => {
                            const isSelected = imageProvider === provider.id;
                            return (
                                <motion.button
                                    key={provider.id}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => onSelectImageProvider(provider.id)}
                                    className={`
                                        group relative px-5 py-3 rounded-lg transition-all duration-300
                                        ${isSelected
                                            ? 'bg-[var(--cinema-spotlight)]/20 border-2 border-[var(--cinema-spotlight)] shadow-[0_0_20px_var(--glow-spotlight)]'
                                            : 'bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/10 hover:border-[var(--cinema-silver)]/30'
                                        }
                                    `}
                                >
                                    <span className={`
                                        font-display text-lg transition-colors
                                        ${isSelected ? 'text-[var(--cinema-spotlight)]' : 'text-[var(--cinema-silver)]'}
                                    `}>
                                        {provider.label}
                                    </span>
                                    <span className={`
                                        ml-2 font-script italic text-sm
                                        ${isSelected ? 'text-[var(--cinema-spotlight)]/70' : 'text-[var(--cinema-silver)]/40'}
                                    `}>
                                        {provider.desc}
                                    </span>
                                </motion.button>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* Style Grid by Category */}
            <div className="space-y-12">
                {Object.entries(stylesByCategory).map(([category, categoryStyles], catIdx) => (
                    <motion.div
                        key={category}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + catIdx * 0.1 }}
                    >
                        {/* Category Label - Editorial Divider */}
                        <div className="flex items-center gap-4 mb-6">
                            <span className="font-mono text-xs text-[var(--cinema-silver)]/40 uppercase tracking-[0.2em]">
                                {categoryLabels[category]}
                            </span>
                            <div className="flex-1 h-px bg-[var(--cinema-silver)]/10" />
                        </div>

                        {/* Style Cards Grid */}
                        <motion.div
                            variants={staggerContainer}
                            initial="initial"
                            animate="animate"
                            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
                        >
                            {categoryStyles.map((style) => {
                                const isSelected = selectedStyle === style.id;
                                return (
                                    <motion.button
                                        key={style.id}
                                        variants={staggerItem}
                                        whileHover={{ y: -6, scale: 1.02 }}
                                        onClick={() => onSelectStyle(style.id as VisualStyleKey)}
                                        className={`
                                            group relative flex flex-col overflow-hidden rounded-lg transition-all duration-300
                                            ${isSelected
                                                ? 'border-2 border-[var(--cinema-spotlight)] ring-2 ring-[var(--cinema-spotlight)]/20 shadow-[0_0_30px_var(--glow-spotlight)]'
                                                : 'border border-[var(--cinema-silver)]/10 hover:border-[var(--cinema-silver)]/30'
                                            }
                                        `}
                                    >
                                        {/* Preview Area with Letterbox */}
                                        <div className="aspect-video relative overflow-hidden bg-[var(--cinema-void)]">
                                            {/* Gradient Background */}
                                            <div className={`absolute inset-0 ${getStyleGradient(style.id)}`} />

                                            {/* Film Grain Overlay */}
                                            <div className="absolute inset-0 opacity-20 mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20200%20200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter%20id%3D%22noise%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.85%22%20numOctaves%3D%224%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23noise)%22%2F%3E%3C%2Fsvg%3E')]" />

                                            {/* Letterbox Bars */}
                                            <div className="absolute top-0 inset-x-0 h-[8%] bg-[var(--cinema-void)]" />
                                            <div className="absolute bottom-0 inset-x-0 h-[8%] bg-[var(--cinema-void)]" />

                                            {/* Sample Image */}
                                            {style.sampleImage && (
                                                <img
                                                    src={style.sampleImage}
                                                    alt={style.name}
                                                    className="absolute inset-0 w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-500"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            )}

                                            {/* Vignette */}
                                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,var(--cinema-void)_100%)] opacity-60" />

                                            {/* Style Name Overlay */}
                                            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-[var(--cinema-void)] to-transparent">
                                                <span className="font-display text-sm text-[var(--cinema-silver)] drop-shadow-lg">
                                                    {style.name}
                                                </span>
                                            </div>

                                            {/* Selection Checkmark */}
                                            {isSelected && (
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[var(--cinema-spotlight)] flex items-center justify-center shadow-lg"
                                                >
                                                    <Check className="w-4 h-4 text-[var(--cinema-void)]" />
                                                </motion.div>
                                            )}
                                        </div>

                                        {/* Description */}
                                        <div className="p-3 bg-[var(--cinema-celluloid)]">
                                            <p className="font-script italic text-xs text-[var(--cinema-silver)]/60 line-clamp-2">
                                                {style.description}
                                            </p>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </motion.div>
                    </motion.div>
                ))}
            </div>

            {/* Selected Style Preview */}
            {selectedStyle && VISUAL_STYLES[selectedStyle] && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-12 p-6 bg-[var(--cinema-celluloid)] border border-[var(--cinema-spotlight)]/20 rounded-lg shadow-editorial"
                >
                    <div className="flex items-center gap-6">
                        {/* Mini Preview */}
                        <div className="shrink-0 w-24 h-14 rounded overflow-hidden relative">
                            <div className={`w-full h-full ${getStyleGradient(selectedStyle)}`} />
                            <div className="absolute top-0 inset-x-0 h-[10%] bg-[var(--cinema-void)]" />
                            <div className="absolute bottom-0 inset-x-0 h-[10%] bg-[var(--cinema-void)]" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-display text-xl text-[var(--cinema-silver)] mb-1">
                                {VISUAL_STYLES[selectedStyle].name}
                            </h3>
                            <p className="font-script italic text-sm text-[var(--cinema-silver)]/60">
                                {VISUAL_STYLES[selectedStyle].description}
                            </p>
                        </div>

                        {/* Badge */}
                        <div className="shrink-0">
                            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[var(--cinema-spotlight)]/10 border border-[var(--cinema-spotlight)]/30">
                                <Check className="w-4 h-4 text-[var(--cinema-spotlight)]" />
                                <span className="font-mono text-xs text-[var(--cinema-spotlight)] uppercase tracking-wider">
                                    Selected
                                </span>
                            </span>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
};

function getStyleGradient(styleId: string): string {
    const gradients: Record<string, string> = {
        CINEMATIC: 'bg-gradient-to-br from-amber-900/40 to-slate-900/60',
        NOIR: 'bg-gradient-to-br from-zinc-700 to-black',
        COMIC: 'bg-gradient-to-br from-red-500/30 to-yellow-500/30',
        ANIME: 'bg-gradient-to-br from-pink-500/30 to-blue-500/30',
        WATERCOLOR: 'bg-gradient-to-br from-blue-300/30 to-pink-300/30',
        OIL_PAINTING: 'bg-gradient-to-br from-amber-700/40 to-rose-800/40',
        CYBERPUNK: 'bg-gradient-to-br from-purple-600/40 to-cyan-500/40',
        DARK_FANTASY: 'bg-gradient-to-br from-slate-800 to-purple-950',
        PHOTOREALISTIC: 'bg-gradient-to-br from-emerald-800/30 to-blue-800/30',
        PIXEL_ART: 'bg-gradient-to-br from-green-500/30 to-blue-500/30',
        MINIMALIST: 'bg-gradient-to-br from-zinc-200/20 to-zinc-400/20',
        SURREALIST: 'bg-gradient-to-br from-orange-500/30 to-indigo-600/40',
    };

    return gradients[styleId] || 'bg-gradient-to-br from-zinc-700 to-zinc-900';
}

export default StyleSelector;
