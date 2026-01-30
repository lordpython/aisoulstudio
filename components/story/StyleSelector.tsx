/**
 * StyleSelector.tsx
 *
 * Grid of visual style cards for user selection.
 * Includes aspect ratio selector and style preview.
 */

import React from 'react';
import { Check, Palette, Monitor } from 'lucide-react';
import {
    VISUAL_STYLES,
    ASPECT_RATIOS,
    type VisualStyleKey,
    type AspectRatioId,
} from '@/constants/visualStyles';

interface StyleSelectorProps {
    selectedStyle: VisualStyleKey;
    onSelectStyle: (style: VisualStyleKey) => void;
    aspectRatio: AspectRatioId;
    onSelectAspectRatio: (ratio: AspectRatioId) => void;
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({
    selectedStyle,
    onSelectStyle,
    aspectRatio,
    onSelectAspectRatio,
}) => {
    const styles = Object.values(VISUAL_STYLES);

    // Group styles by category
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
        <div className="p-6 flex flex-col gap-8">
            {/* Header */}
            <div className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-linear-to-br from-purple-600/20 to-pink-600/20 border border-white/10 flex items-center justify-center">
                    <Palette className="w-7 h-7 text-purple-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Choose Your Visual Style</h2>
                <p className="text-zinc-400 text-sm">
                    Select a style that matches your story's mood and genre
                </p>
            </div>

            {/* Aspect Ratio Selector */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-zinc-400">
                    <Monitor className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-wider font-medium">Aspect Ratio</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {ASPECT_RATIOS.slice(0, 4).map((ratio) => {
                        const isSelected = aspectRatio === ratio.id;
                        return (
                            <button
                                key={ratio.id}
                                onClick={() => onSelectAspectRatio(ratio.id)}
                                className={`
                                    px-4 py-2 rounded-lg text-sm font-medium transition-all
                                    ${isSelected
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                                    }
                                `}
                            >
                                <span className="font-bold">{ratio.label}</span>
                                <span className="text-xs opacity-70 ml-1">({ratio.description})</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Style Grid by Category */}
            <div className="space-y-8">
                {Object.entries(stylesByCategory).map(([category, categoryStyles]) => (
                    <div key={category} className="space-y-3">
                        {/* Category Label */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wider font-bold text-zinc-500">
                                {categoryLabels[category]}
                            </span>
                            <div className="flex-1 h-px bg-zinc-800" />
                        </div>

                        {/* Style Cards Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {categoryStyles.map((style) => {
                                const isSelected = selectedStyle === style.id;
                                return (
                                    <button
                                        key={style.id}
                                        onClick={() => onSelectStyle(style.id as VisualStyleKey)}
                                        className={`
                                            relative flex flex-col overflow-hidden rounded-xl transition-all duration-200
                                            ${isSelected
                                                ? 'border-2 border-blue-500 ring-2 ring-blue-500/20 bg-zinc-900'
                                                : 'border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900'
                                            }
                                        `}
                                    >
                                        {/* Preview Area */}
                                        <div className="aspect-video relative bg-zinc-800 overflow-hidden">
                                            {/* Placeholder gradient based on style */}
                                            <div className={`
                                                absolute inset-0
                                                ${getStyleGradient(style.id)}
                                            `} />

                                            {/* Sample image if available */}
                                            {style.sampleImage && (
                                                <img
                                                    src={style.sampleImage}
                                                    alt={style.name}
                                                    className="absolute inset-0 w-full h-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            )}

                                            {/* Style name overlay */}
                                            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
                                            <div className="absolute bottom-2 left-2 text-xs font-bold text-white/80">
                                                {style.name}
                                            </div>

                                            {/* Selected checkmark */}
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                                                    <Check className="w-4 h-4 text-white" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Info Section */}
                                        <div className="p-3">
                                            <p className="text-xs text-zinc-400 line-clamp-2">
                                                {style.description}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Selected Style Preview */}
            {selectedStyle && VISUAL_STYLES[selectedStyle] && (
                <div className="mt-4 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                    <div className="flex items-start gap-4">
                        <div className="shrink-0 w-20 h-12 rounded-lg overflow-hidden">
                            <div className={`w-full h-full ${getStyleGradient(selectedStyle)}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white mb-1">
                                {VISUAL_STYLES[selectedStyle].name}
                            </h3>
                            <p className="text-xs text-zinc-400">
                                {VISUAL_STYLES[selectedStyle].description}
                            </p>
                        </div>
                        <div className="shrink-0">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold bg-blue-500/20 text-blue-400">
                                Selected
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Get a gradient placeholder for each style
 */
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
