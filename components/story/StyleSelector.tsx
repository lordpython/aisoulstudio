/**
 * StyleSelector.tsx
 * Visual style gallery with sharp utility design.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Check, RectangleHorizontal, Cpu } from 'lucide-react';
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
            {/* Header */}
            <div className="mb-12">
                <h2 className="font-sans text-2xl font-medium tracking-tight text-zinc-100 mb-2">
                    Visual Direction
                </h2>
                <p className="text-zinc-500 text-sm">
                    Choose a style that matches your story's mood
                </p>
            </div>

            {/* Aspect Ratio Selector */}
            <div className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                    <RectangleHorizontal className="w-4 h-4 text-zinc-600" />
                    <span className="font-mono text-xs text-zinc-600 uppercase tracking-widest">
                        Frame Ratio
                    </span>
                </div>
                <div className="flex flex-wrap gap-3">
                    {ASPECT_RATIOS.slice(0, 4).map((ratio) => {
                        const isSelected = aspectRatio === ratio.id;
                        return (
                            <button
                                key={ratio.id}
                                onClick={() => onSelectAspectRatio(ratio.id)}
                                className={`
                                    px-5 py-3 rounded-sm transition-colors duration-200
                                    ${isSelected
                                        ? 'bg-blue-500/10 border border-blue-500/50 text-blue-400'
                                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                                    }
                                `}
                            >
                                <span className="font-sans text-sm font-medium">
                                    {ratio.label}
                                </span>
                                <span className={`ml-2 text-xs ${isSelected ? 'text-blue-400/70' : 'text-zinc-600'}`}>
                                    {ratio.description}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Image Provider Selector */}
            {onSelectImageProvider && (
                <div className="mb-12">
                    <div className="flex items-center gap-3 mb-4">
                        <Cpu className="w-4 h-4 text-zinc-600" />
                        <span className="font-mono text-xs text-zinc-600 uppercase tracking-widest">
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
                                <button
                                    key={provider.id}
                                    onClick={() => onSelectImageProvider(provider.id)}
                                    className={`
                                        px-5 py-3 rounded-sm transition-colors duration-200
                                        ${isSelected
                                            ? 'bg-blue-500/10 border border-blue-500/50 text-blue-400'
                                            : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                                        }
                                    `}
                                >
                                    <span className="font-sans text-sm font-medium">
                                        {provider.label}
                                    </span>
                                    <span className={`ml-2 text-xs ${isSelected ? 'text-blue-400/70' : 'text-zinc-600'}`}>
                                        {provider.desc}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Style Grid by Category */}
            <div className="space-y-12">
                {Object.entries(stylesByCategory).map(([category, categoryStyles]) => (
                    <div key={category}>
                        {/* Category Label */}
                        <div className="flex items-center gap-4 mb-6">
                            <span className="font-mono text-xs text-zinc-600 uppercase tracking-[0.2em]">
                                {categoryLabels[category]}
                            </span>
                            <div className="flex-1 h-px bg-zinc-800" />
                        </div>

                        {/* Style Cards Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                            {categoryStyles.map((style) => {
                                const isSelected = selectedStyle === style.id;
                                return (
                                    <button
                                        key={style.id}
                                        onClick={() => onSelectStyle(style.id as VisualStyleKey)}
                                        className={`
                                            group relative flex flex-col overflow-hidden rounded-sm transition-all duration-200 ease-out
                                            hover:-translate-y-0.5
                                            ${isSelected
                                                ? 'border-2 border-blue-500 ring-1 ring-blue-500/20'
                                                : 'border border-zinc-800 hover:border-zinc-600'
                                            }
                                        `}
                                    >
                                        {/* Preview Area */}
                                        <div className="aspect-video relative overflow-hidden bg-zinc-950">
                                            {/* Gradient Background */}
                                            <div className={`absolute inset-0 ${getStyleGradient(style.id)}`} />

                                            {/* Sample Image */}
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

                                            {/* Style Name Overlay */}
                                            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black to-transparent">
                                                <span className="font-sans text-sm font-medium text-zinc-100">
                                                    {style.name}
                                                </span>
                                            </div>

                                            {/* Selection Checkmark */}
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-6 h-6 rounded-sm bg-blue-500 flex items-center justify-center">
                                                    <Check className="w-3.5 h-3.5 text-white" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Description */}
                                        <div className="p-3 bg-zinc-900">
                                            <p className="text-xs text-zinc-500 line-clamp-2">
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
                <div className="mt-12 p-6 bg-zinc-900 border border-zinc-800 rounded-sm">
                    <div className="flex items-center gap-6">
                        {/* Mini Preview */}
                        <div className="shrink-0 w-24 h-14 rounded-sm overflow-hidden relative">
                            <div className={`w-full h-full ${getStyleGradient(selectedStyle)}`} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-sans text-lg font-medium text-zinc-100 mb-1">
                                {VISUAL_STYLES[selectedStyle].name}
                            </h3>
                            <p className="text-sm text-zinc-500">
                                {VISUAL_STYLES[selectedStyle].description}
                            </p>
                        </div>

                        {/* Badge */}
                        <div className="shrink-0">
                            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-blue-500/10 border border-blue-500/30">
                                <Check className="w-4 h-4 text-blue-400" />
                                <span className="font-mono text-xs text-blue-400 uppercase tracking-wider">
                                    Selected
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
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
