/**
 * StoryboardView.tsx
 * Cinematic storyboard viewer — full-bleed preview with floating info panel
 * and scene-grouped thumbnail strip.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ShotlistEntry, ScreenplayScene } from '@/types';
import {
    Play, SkipBack, SkipForward,
    ChevronLeft, ChevronRight,
    Wand2, Video, Loader2, ImageIcon, Maximize2, Pencil
} from 'lucide-react';

interface StoryboardViewProps {
    shots: ShotlistEntry[];
    scenes?: ScreenplayScene[];
    scenesWithVisuals?: string[];
    onGenerateVisuals?: (sceneIndex?: number) => void;
    onGenerateVideo?: (shotId: string) => void;
    onUpdateDuration?: (shotId: string, duration: number) => void;
    onEditShot?: (shotId: string) => void;
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
    onEditShot,
    isProcessing = false,
}) => {
    const [selectedShotIndex, setSelectedShotIndex] = useState(0);
    const [localDuration, setLocalDuration] = useState<number>(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const thumbnailStripRef = useRef<HTMLDivElement>(null);

    if (!shots || shots.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="w-20 h-20 rounded-2xl bg-linear-to-br from-primary/10 to-accent/10 border border-border flex items-center justify-center">
                    <ImageIcon className="w-9 h-9 text-muted-foreground" />
                </div>
                <div className="text-center">
                    <p className="font-editorial text-lg text-foreground/70 mb-2">No Shots Available</p>
                    <p className="text-muted-foreground text-sm">
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
        }
    }, [currentShot?.id, currentShot?.durationEst]);

    // Scroll selected thumbnail into view
    useEffect(() => {
        if (thumbnailStripRef.current) {
            const selected = thumbnailStripRef.current.querySelector('[data-selected="true"]');
            if (selected) {
                selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [selectedShotIndex]);

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
            } else if (e.key === 'f' || e.key === 'F') {
                setIsFullscreen(prev => !prev);
            } else if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey) {
                const target = e.target as HTMLElement;
                const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
                if (!isEditing && onEditShot && currentShot) {
                    e.preventDefault();
                    onEditShot(currentShot.id);
                }
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

    const toggleFullscreen = () => {
        if (!document.fullscreenElement && containerRef.current) {
            containerRef.current.requestFullscreen?.();
            setIsFullscreen(true);
        } else if (document.fullscreenElement) {
            document.exitFullscreen?.();
            setIsFullscreen(false);
        }
    };

    return (
        <div ref={containerRef} className="flex flex-col h-full bg-background relative">
            {/* Main Preview Area */}
            <div className="flex-1 relative overflow-hidden min-h-0">
                {/* Full-bleed Image/Video */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentShot?.id || selectedShotIndex}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0"
                    >
                        {currentShot?.imageUrl ? (
                            <img
                                src={currentShot.imageUrl}
                                alt={currentShot.description}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-background">
                                <div className="w-20 h-20 rounded-2xl bg-linear-to-br from-primary/10 to-accent/10 border border-border flex items-center justify-center">
                                    <Wand2 className="w-9 h-9 text-muted-foreground" />
                                </div>
                                <p className="font-code text-sm text-muted-foreground uppercase tracking-widest">
                                    No Visual Generated
                                </p>
                                {onGenerateVisuals && (
                                    <button
                                        onClick={() => onGenerateVisuals()}
                                        className="px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors duration-200 shadow-lg shadow-primary/20"
                                    >
                                        Generate All Visuals
                                    </button>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Center Generate Video overlay button */}
                {currentShot?.imageUrl && onGenerateVideo && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                        <button
                            onClick={() => onGenerateVideo(currentShot.id)}
                            disabled={isProcessing}
                            className="pointer-events-auto px-6 py-3 bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-sm rounded-lg flex items-center gap-2 shadow-2xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                            Generate Video
                        </button>
                    </div>
                )}

                {/* Floating Info Panel (bottom-left) */}
                {currentShot?.imageUrl && (
                    <motion.div
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                        className="absolute bottom-4 left-4 z-20 w-[340px] max-h-[calc(100%-2rem)]"
                    >
                        <div className="bg-black/85 backdrop-blur-md border border-border rounded-xl overflow-hidden flex flex-col shadow-2xl">
                            {/* Mini thumbnail with navigation */}
                            <div className="relative aspect-video bg-secondary overflow-hidden border-b border-border">
                                <img
                                    src={currentShot.imageUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                                {/* Shot navigation overlay */}
                                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 py-2 bg-linear-to-t from-black/80 to-transparent">
                                    <button
                                        onClick={handlePrev}
                                        disabled={selectedShotIndex === 0}
                                        className="p-1 text-foreground/80 hover:text-foreground disabled:text-foreground/20 transition-colors"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <span className="font-code text-xs text-foreground/70">
                                        {selectedShotIndex + 1} / {shots.length}
                                    </span>
                                    <button
                                        onClick={handleNext}
                                        disabled={selectedShotIndex === shots.length - 1}
                                        className="p-1 text-foreground/80 hover:text-foreground disabled:text-foreground/20 transition-colors"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Shot Details */}
                            <div className="p-4 space-y-3 overflow-y-auto max-h-[280px]">
                                {/* Scene / Shot label */}
                                <h3 className="font-editorial font-semibold text-foreground text-sm">
                                    Scene {currentScene?.sceneNumber || '?'} | Shot {currentShot.shotNumber}
                                </h3>

                                {/* Description */}
                                <div>
                                    <p className="text-[11px] font-code font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                                    <p className="text-foreground/80 text-sm leading-relaxed">
                                        {currentShot.description || 'No description'}
                                    </p>
                                </div>

                                {/* Dialogue */}
                                {currentShot.dialogue && (
                                    <div>
                                        <p className="text-[11px] font-code font-semibold text-muted-foreground uppercase tracking-wider mb-1">Dialogue</p>
                                        <p className="text-foreground/80 text-sm leading-relaxed italic">
                                            {currentShot.dialogue}
                                        </p>
                                    </div>
                                )}

                                {/* Duration */}
                                <div className="flex items-center gap-3">
                                    <span className="text-[11px] font-code font-semibold text-muted-foreground uppercase tracking-wider">
                                        Duration (ERT):
                                    </span>
                                    <input
                                        type="number"
                                        value={localDuration}
                                        onChange={handleDurationChange}
                                        onBlur={handleSaveDuration}
                                        className="w-14 px-2 py-1 bg-secondary border border-border rounded-md text-foreground text-sm text-center font-code focus:outline-none focus:border-primary"
                                        min={1}
                                        max={60}
                                    />
                                </div>

                                {/* Update ERT button */}
                                <button
                                    onClick={handleSaveDuration}
                                    className="w-full py-2 bg-secondary hover:bg-muted text-foreground/80 text-sm font-medium rounded-lg border border-border transition-colors"
                                >
                                    Update ERT
                                </button>

                                {/* Edit Shot button */}
                                {onEditShot && (
                                    <button
                                        onClick={() => currentShot && onEditShot(currentShot.id)}
                                        className="w-full py-2 bg-secondary hover:bg-muted text-foreground/80 text-sm font-medium rounded-lg border border-border flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Edit Shot
                                    </button>
                                )}

                                {/* Generate Video button */}
                                <button
                                    onClick={() => currentShot && onGenerateVideo?.(currentShot.id)}
                                    disabled={isProcessing || !currentShot?.imageUrl}
                                    className="w-full py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-sm rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-accent/20"
                                >
                                    {isProcessing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Video className="w-4 h-4" />
                                    )}
                                    Generate Video
                                </button>

                                <p className="text-[10px] text-muted-foreground text-center">
                                    Video length is limited to up to 12 seconds
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Navigation Arrows */}
                <button
                    onClick={handlePrev}
                    disabled={selectedShotIndex === 0}
                    className="absolute left-0 bottom-0 z-10 p-3 text-foreground/60 hover:text-foreground disabled:text-foreground/10 transition-colors"
                    style={{ bottom: '8px', left: currentShot?.imageUrl ? '360px' : '16px' }}
                    aria-label="Previous shot"
                >
                    <SkipBack className="w-6 h-6" />
                </button>

                <button
                    onClick={() => {/* play/pause — placeholder */ }}
                    className="absolute z-10 p-3 text-foreground/60 hover:text-foreground transition-colors"
                    style={{ bottom: '8px', left: currentShot?.imageUrl ? '396px' : '52px' }}
                    aria-label="Play"
                >
                    <Play className="w-6 h-6" />
                </button>

                <button
                    onClick={handleNext}
                    disabled={selectedShotIndex === shots.length - 1}
                    className="absolute z-10 p-3 text-foreground/60 hover:text-foreground disabled:text-foreground/10 transition-colors"
                    style={{ bottom: '8px', left: currentShot?.imageUrl ? '432px' : '88px' }}
                    aria-label="Next shot"
                >
                    <SkipForward className="w-6 h-6" />
                </button>

                {/* Fullscreen toggle */}
                <button
                    onClick={toggleFullscreen}
                    className="absolute bottom-3 right-3 z-10 p-2 text-foreground/40 hover:text-foreground transition-colors"
                    aria-label="Toggle fullscreen"
                >
                    <Maximize2 className="w-5 h-5" />
                </button>
            </div>

            {/* Thumbnail Strip */}
            <div
                ref={thumbnailStripRef}
                className="h-24 shrink-0 bg-card/95 backdrop-blur border-t border-border flex items-center gap-1 px-3 overflow-x-auto no-scrollbar"
            >
                {sceneGroups.length > 0 ? (
                    sceneGroups.map((group) => (
                        <React.Fragment key={group.scene.id}>
                            {group.shots.map((shot) => {
                                const idx = shots.indexOf(shot);
                                const isSelected = idx === selectedShotIndex;
                                return (
                                    <button
                                        key={shot.id}
                                        data-selected={isSelected}
                                        onClick={() => setSelectedShotIndex(idx)}
                                        className={`
                                            relative flex-none h-16 w-24 rounded-md overflow-hidden border-2 transition-all duration-150
                                            ${isSelected
                                                ? 'border-primary ring-1 ring-primary/30 scale-105 z-10'
                                                : 'border-transparent opacity-60 hover:opacity-100 hover:border-border'
                                            }
                                        `}
                                    >
                                        {shot.imageUrl ? (
                                            <img
                                                src={shot.imageUrl}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-secondary flex items-center justify-center">
                                                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </React.Fragment>
                    ))
                ) : (
                    shots.map((shot, idx) => {
                        const isSelected = idx === selectedShotIndex;
                        return (
                            <button
                                key={shot.id}
                                data-selected={isSelected}
                                onClick={() => setSelectedShotIndex(idx)}
                                className={`
                                    relative flex-none h-16 w-24 rounded-md overflow-hidden border-2 transition-all duration-150
                                    ${isSelected
                                        ? 'border-primary ring-1 ring-primary/30 scale-105 z-10'
                                        : 'border-transparent opacity-60 hover:opacity-100 hover:border-border'
                                    }
                                `}
                            >
                                {shot.imageUrl ? (
                                    <img
                                        src={shot.imageUrl}
                                        alt=""
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-secondary flex items-center justify-center">
                                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default StoryboardView;
