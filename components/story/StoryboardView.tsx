/**
 * StoryboardView.tsx
 * Visual storyboard viewer with scene-grouped timeline strip.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ShotlistEntry, ScreenplayScene } from '@/types';
import {
    Play, SkipBack, SkipForward, Clock,
    ChevronLeft, ChevronRight,
    Wand2, Video, Loader2, ImageIcon
} from 'lucide-react';

interface StoryboardViewProps {
    shots: ShotlistEntry[];
    scenes?: ScreenplayScene[];
    scenesWithVisuals?: string[];
    onGenerateVisuals?: (sceneIndex?: number) => void;
    onGenerateVideo?: (shotId: string) => void;
    onUpdateDuration?: (shotId: string, duration: number) => void;
    isProcessing?: boolean;
}

interface SceneGroup {
    scene: ScreenplayScene;
    shots: ShotlistEntry[];
}

export const StoryboardView: React.FC<StoryboardViewProps> = ({
    shots,
    scenes = [],
    onGenerateVisuals,
    onGenerateVideo,
    onUpdateDuration,
    isProcessing = false,
}) => {
    const [selectedShotIndex, setSelectedShotIndex] = useState(0);
    const [localDuration, setLocalDuration] = useState<number>(0);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    if (!shots || shots.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <ImageIcon className="w-16 h-16 text-zinc-800" />
                <div className="text-center">
                    <p className="font-sans text-lg text-zinc-400 mb-2">No Shots Available</p>
                    <p className="text-zinc-600 text-sm">
                        Generate a shot list to begin storyboarding
                    </p>
                </div>
            </div>
        );
    }

    const currentShot = shots[selectedShotIndex];
    const currentScene = currentShot ? scenes.find(s => s.id === currentShot.sceneId) : undefined;

    // Group shots by scene for the timeline strip
    const sceneGroups = useMemo<SceneGroup[]>(() => {
        if (scenes.length === 0) return [];
        return scenes
            .map(scene => ({
                scene,
                shots: shots.filter(s => s.sceneId === scene.id),
            }))
            .filter(g => g.shots.length > 0);
    }, [scenes, shots]);

    useEffect(() => {
        if (currentShot) {
            setLocalDuration(currentShot.durationEst || 5);
            setIsDescriptionExpanded(false);
        }
    }, [currentShot?.id, currentShot?.durationEst]);

    const handleNext = () => {
        if (selectedShotIndex < shots.length - 1) {
            setSelectedShotIndex(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (selectedShotIndex > 0) {
            setSelectedShotIndex(prev => prev - 1);
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrev();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                handleNext();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedShotIndex, shots.length]);

    const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            setLocalDuration(val);
        }
    };

    const handleSaveDuration = () => {
        if (onUpdateDuration && currentShot) {
            onUpdateDuration(currentShot.id, localDuration);
        }
    };

    return (
        <div className="flex flex-col h-full bg-black">
            {/* Main Preview Area */}
            <div className="flex-1 relative flex overflow-hidden group">
                {/* Image/Video Display */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentShot?.id || selectedShotIndex}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="w-full h-full relative"
                        >
                            {currentShot?.imageUrl ? (
                                <img
                                    src={currentShot.imageUrl}
                                    alt={currentShot.description}
                                    className="w-full h-full object-contain"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-zinc-950">
                                    <Wand2 className="w-16 h-16 text-zinc-800" />
                                    <p className="font-mono text-sm text-zinc-700 uppercase tracking-widest">
                                        No Visual Generated
                                    </p>
                                    {onGenerateVisuals && (
                                        <button
                                            onClick={() => onGenerateVisuals()}
                                            className="px-6 py-3 rounded-sm bg-blue-500 hover:bg-blue-600 text-white font-sans text-sm font-medium transition-colors duration-200"
                                        >
                                            Generate All Visuals
                                        </button>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Overlay Controls */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent p-8 pt-24 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                    <div className="max-w-4xl mx-auto flex items-end gap-8">
                        {/* Shot Info */}
                        <div className="flex-1 space-y-4">
                            {/* Badges */}
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1.5 bg-zinc-900 rounded-sm text-xs font-mono text-blue-400 border border-zinc-800">
                                    Scene {currentScene?.sceneNumber || '?'} | Shot {currentShot?.shotNumber || '?'}
                                </span>
                                {currentShot?.cameraAngle && (
                                    <span className="px-3 py-1.5 bg-zinc-900 text-orange-400 rounded-sm text-xs font-mono uppercase border border-zinc-800">
                                        {currentShot.cameraAngle}
                                    </span>
                                )}
                            </div>

                            {/* Description */}
                            <div className="relative">
                                <h3
                                    className={`font-sans text-xl text-zinc-100 leading-snug transition-all duration-200 ${
                                        !isDescriptionExpanded && currentShot?.description && currentShot.description.length > 150
                                            ? 'line-clamp-3'
                                            : ''
                                    }`}
                                >
                                    {currentShot?.description || 'No description'}
                                </h3>
                                {currentShot?.description && currentShot.description.length > 150 && (
                                    <button
                                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                        className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-wide"
                                    >
                                        {isDescriptionExpanded ? '− Show Less' : '+ Show More'}
                                    </button>
                                )}
                            </div>

                            {/* Duration Control */}
                            <div className="flex flex-col gap-2">
                                <label
                                    htmlFor="shot-duration-input"
                                    className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest"
                                >
                                    Shot Duration
                                </label>
                                <div className="flex items-center gap-4 bg-zinc-900 w-fit px-4 py-2 rounded-sm border border-zinc-800">
                                    <Clock className="w-4 h-4 text-zinc-600" />
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                const newDuration = Math.max(1, localDuration - 1);
                                                setLocalDuration(newDuration);
                                                if (onUpdateDuration && currentShot) {
                                                    onUpdateDuration(currentShot.id, newDuration);
                                                }
                                            }}
                                            className="w-6 h-6 flex items-center justify-center rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors duration-200"
                                            aria-label="Decrease duration"
                                        >
                                            -
                                        </button>
                                        <input
                                            id="shot-duration-input"
                                            type="number"
                                            value={localDuration}
                                            onChange={handleDurationChange}
                                            onBlur={handleSaveDuration}
                                            className="w-16 bg-transparent border-b border-zinc-700 text-zinc-100 text-center font-mono focus:outline-none focus:border-blue-500"
                                            min={1}
                                            max={60}
                                            aria-label="Shot duration in seconds"
                                        />
                                        <button
                                            onClick={() => {
                                                const newDuration = Math.min(60, localDuration + 1);
                                                setLocalDuration(newDuration);
                                                if (onUpdateDuration && currentShot) {
                                                    onUpdateDuration(currentShot.id, newDuration);
                                                }
                                            }}
                                            className="w-6 h-6 flex items-center justify-center rounded-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors duration-200"
                                            aria-label="Increase duration"
                                        >
                                            +
                                        </button>
                                    </div>
                                    <span className="font-mono text-xs text-zinc-600">sec</span>
                                </div>
                            </div>
                        </div>

                        {/* Generate Video Button */}
                        <button
                            onClick={() => currentShot && onGenerateVideo?.(currentShot.id)}
                            disabled={isProcessing || !currentShot?.imageUrl}
                            className="h-14 px-8 rounded-sm bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-3 font-sans text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
                        >
                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                            Generate Video
                        </button>
                    </div>
                </div>

                {/* Left/Right Navigation */}
                <button
                    onClick={handlePrev}
                    disabled={selectedShotIndex === 0}
                    className="absolute left-0 inset-y-0 w-24 bg-gradient-to-r from-black/80 to-transparent flex items-center justify-start pl-4 opacity-0 hover:opacity-100 transition-opacity duration-200 disabled:hidden z-10"
                    aria-label="Previous shot (Left arrow key)"
                >
                    <div className="p-3 bg-zinc-900 rounded-sm border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors duration-200">
                        <ChevronLeft className="w-6 h-6" />
                    </div>
                </button>

                <button
                    onClick={handleNext}
                    disabled={selectedShotIndex === shots.length - 1}
                    className="absolute right-0 inset-y-0 w-24 bg-gradient-to-l from-black/80 to-transparent flex items-center justify-end pr-4 opacity-0 hover:opacity-100 transition-opacity duration-200 disabled:hidden z-10"
                    aria-label="Next shot (Right arrow key)"
                >
                    <div className="p-3 bg-zinc-900 rounded-sm border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors duration-200">
                        <ChevronRight className="w-6 h-6" />
                    </div>
                </button>
            </div>

            {/* Timeline Strip — Grouped by Scene */}
            <div className="h-52 border-t border-zinc-800 bg-zinc-950 flex flex-col">
                {/* Timeline Header */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800">
                    <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-zinc-500">
                            {selectedShotIndex + 1} / {shots.length} FRAMES
                        </span>
                    </div>

                    {/* Transport Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrev}
                            disabled={selectedShotIndex === 0}
                            className="p-2 hover:bg-zinc-800 rounded-sm text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors duration-200"
                        >
                            <SkipBack className="w-4 h-4" />
                        </button>
                        <button className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-sm transition-colors duration-200">
                            <Play className="w-4 h-4 fill-current" />
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={selectedShotIndex === shots.length - 1}
                            className="p-2 hover:bg-zinc-800 rounded-sm text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors duration-200"
                        >
                            <SkipForward className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="w-16" />
                </div>

                {/* Thumbnails — Scene Grouped */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-3 flex gap-1 no-scrollbar">
                    {sceneGroups.length > 0 ? (
                        sceneGroups.map((group) => (
                            <div key={group.scene.id} className="flex-none flex flex-col">
                                {/* Scene label */}
                                <div className="px-2 pb-1">
                                    <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
                                        SC {String(group.scene.sceneNumber).padStart(2, '0')}
                                    </span>
                                </div>
                                {/* Shot thumbnails for this scene */}
                                <div className="flex gap-1.5">
                                    {group.shots.map((shot) => {
                                        const idx = shots.indexOf(shot);
                                        const isSelected = idx === selectedShotIndex;
                                        return (
                                            <button
                                                key={shot.id}
                                                onClick={() => setSelectedShotIndex(idx)}
                                                className={`
                                                    relative flex-none w-40 h-24 rounded-sm overflow-hidden border-2 transition-all duration-200
                                                    ${isSelected
                                                        ? 'border-blue-500 ring-1 ring-blue-500/20 z-10'
                                                        : 'border-zinc-800 opacity-60 hover:opacity-100'
                                                    }
                                                    touch-manipulation
                                                `}
                                            >
                                                {shot.imageUrl ? (
                                                    <img
                                                        src={shot.imageUrl}
                                                        alt=""
                                                        className={`w-full h-full object-cover ${isSelected ? '' : 'grayscale-[30%]'} transition-all duration-200`}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                                        <Wand2 className="w-5 h-5 text-zinc-800" />
                                                    </div>
                                                )}

                                                {/* Gradient overlay */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />

                                                {/* Duration Badge */}
                                                <div className="absolute bottom-1 right-2 flex items-center gap-1 font-mono text-[10px] text-zinc-400">
                                                    <Clock className="w-3 h-3" /> {shot.durationEst}s
                                                </div>

                                                {/* Shot Number */}
                                                <div className="absolute top-1 left-2 px-1.5 py-0.5 bg-black/80 rounded-sm text-[9px] font-mono text-blue-400">
                                                    #{shot.shotNumber}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    ) : (
                        // Fallback: flat list if no scene grouping available
                        shots.map((shot, idx) => {
                            const isSelected = idx === selectedShotIndex;
                            return (
                                <button
                                    key={shot.id}
                                    onClick={() => setSelectedShotIndex(idx)}
                                    className={`
                                        relative flex-none w-40 h-24 rounded-sm overflow-hidden border-2 transition-all duration-200
                                        ${isSelected
                                            ? 'border-blue-500 ring-1 ring-blue-500/20 z-10'
                                            : 'border-zinc-800 opacity-60 hover:opacity-100'
                                        }
                                        touch-manipulation
                                    `}
                                >
                                    {shot.imageUrl ? (
                                        <img
                                            src={shot.imageUrl}
                                            alt=""
                                            className={`w-full h-full object-cover ${isSelected ? '' : 'grayscale-[30%]'} transition-all duration-200`}
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                            <Wand2 className="w-5 h-5 text-zinc-800" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                                    <div className="absolute bottom-1 right-2 flex items-center gap-1 font-mono text-[10px] text-zinc-400">
                                        <Clock className="w-3 h-3" /> {shot.durationEst}s
                                    </div>
                                    <div className="absolute top-1 left-2 px-1.5 py-0.5 bg-black/80 rounded-sm text-[9px] font-mono text-blue-400">
                                        #{shot.shotNumber}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default StoryboardView;
