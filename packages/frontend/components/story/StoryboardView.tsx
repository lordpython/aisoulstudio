/**
 * StoryboardView.tsx
 * Cinematic storyboard viewer — full-bleed preview with floating info panel
 * and scene-grouped thumbnail strip.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ShotlistEntry, ScreenplayScene } from '@/types';
import {
    Play, Pause, SkipBack, SkipForward,
    ChevronLeft, ChevronRight,
    Wand2, Video, Loader2, ImageIcon, Maximize2, Pencil, Mic, RefreshCw, Film, HelpCircle, X
} from 'lucide-react';

interface ProcessingShotInfo {
    progress: number;
    preview?: string;
}

interface ShotNarrationInfo {
    audioUrl: string;
    duration: number;
    text: string;
}

interface StoryboardViewProps {
    shots: ShotlistEntry[];
    scenes?: ScreenplayScene[];
    scenesWithVisuals?: string[];
    onGenerateVisuals?: (sceneIndex?: number) => void;
    onGenerateVideo?: (shotId: string) => void;
    onUpdateDuration?: (shotId: string, duration: number) => void;
    onEditShot?: (shotId: string) => void;
    onReorderShots?: (fromIndex: number, toIndex: number) => void;
    isProcessing?: boolean;
    /** WebSocket processing progress per shot */
    processingShots?: Map<string, ProcessingShotInfo>;
    /** Per-shot narration audio map */
    shotNarrationMap?: Map<string, ShotNarrationInfo>;
    /** Animated shot video URLs — shotId -> videoUrl */
    animatedShotVideos?: Map<string, string>;
}

interface SceneGroup {
    scene: ScreenplayScene;
    shots: ShotlistEntry[];
}

/** Render a thumbnail with optional processing overlay and video badge */
function ShotThumbnail({
    shot,
    index,
    isSelected,
    onClick,
    processingInfo,
    hasVideo,
    isDragging,
    isDropTarget,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
}: {
    shot: ShotlistEntry;
    index: number;
    isSelected: boolean;
    onClick: () => void;
    processingInfo?: ProcessingShotInfo;
    hasVideo: boolean;
    isDragging?: boolean;
    isDropTarget?: boolean;
    onDragStart?: (e: React.DragEvent, index: number) => void;
    onDragOver?: (e: React.DragEvent, index: number) => void;
    onDragEnd?: () => void;
    onDrop?: (e: React.DragEvent, index: number) => void;
}) {
    const imgSrc = processingInfo?.preview || shot.imageUrl;
    return (
        <button
            data-selected={isSelected}
            data-shot-index={index}
            draggable
            onDragStart={(e) => onDragStart?.(e, index)}
            onDragOver={(e) => onDragOver?.(e, index)}
            onDragEnd={onDragEnd}
            onDrop={(e) => onDrop?.(e, index)}
            onClick={onClick}
            className={`
                relative flex-none h-16 w-24 rounded-md overflow-hidden border-2 transition-all duration-150 cursor-grab
                ${isSelected
                    ? 'border-primary ring-1 ring-primary/30 scale-105 z-10'
                    : 'border-transparent opacity-60 hover:opacity-100 hover:border-border'
                }
                ${isDragging ? 'opacity-30 scale-95' : ''}
                ${isDropTarget ? 'border-l-4 border-l-primary border-t-0 border-r-0 border-b-0' : ''}
            `}
        >
            {imgSrc ? (
                <img src={imgSrc} alt="" className="w-full h-full object-cover pointer-events-none" />
            ) : (
                <div className="w-full h-full bg-secondary flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                </div>
            )}
            {/* Processing progress ring overlay */}
            {processingInfo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20" />
                        <circle
                            cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2"
                            className="text-primary"
                            strokeDasharray={`${processingInfo.progress * 94.25} 94.25`}
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
            )}
            {/* Video badge */}
            {hasVideo && !processingInfo && (
                <div className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded">
                    <Video className="w-3 h-3 text-accent" />
                </div>
            )}
        </button>
    );
}

export const StoryboardView: React.FC<StoryboardViewProps> = ({
    shots,
    scenes = [],
    onGenerateVisuals,
    onGenerateVideo,
    onUpdateDuration,
    onEditShot,
    onReorderShots,
    isProcessing = false,
    processingShots,
    shotNarrationMap,
    animatedShotVideos,
}) => {
    const [selectedShotIndex, setSelectedShotIndex] = useState(0);
    const [localDuration, setLocalDuration] = useState<number>(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    // Feature 2: Keyboard shortcuts overlay
    const [showShortcuts, setShowShortcuts] = useState(false);
    // Feature 5: Scene-level collapse/expand
    const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set());
    // Feature 6: Export preview (rough cut playback)
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [previewElapsedTime, setPreviewElapsedTime] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const thumbnailStripRef = useRef<HTMLDivElement>(null);
    const narrationAudioRef = useRef<HTMLAudioElement>(null);
    const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const previewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    const currentVideoUrl = animatedShotVideos?.get(currentShot?.id || '');
    const currentNarration = shotNarrationMap?.get(currentShot?.id || '');

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

    // Feature 3: Total duration for timeline bar
    const totalDuration = useMemo(() => {
        return shots.reduce((sum, shot) => sum + (shot.durationEst || 5), 0);
    }, [shots]);

    // Feature 3: Scene colors for timeline bar (5 rotating colors)
    const sceneColors = [
        'bg-blue-500',
        'bg-emerald-500',
        'bg-amber-500',
        'bg-purple-500',
        'bg-rose-500',
    ];

    // Feature 5: Toggle scene collapse
    const toggleSceneCollapse = useCallback((sceneId: string) => {
        setCollapsedScenes(prev => {
            const next = new Set(prev);
            if (next.has(sceneId)) {
                next.delete(sceneId);
            } else {
                next.add(sceneId);
            }
            return next;
        });
    }, []);

    // Feature 6: Start export preview (rough cut playback)
    const startPreview = useCallback(() => {
        setSelectedShotIndex(0);
        setIsPreviewMode(true);
        setPreviewElapsedTime(0);
        setIsPlaying(true);
    }, []);

    // Feature 6: Stop preview
    const stopPreview = useCallback(() => {
        setIsPreviewMode(false);
        setIsPlaying(false);
        setPreviewElapsedTime(0);
        if (previewTimerRef.current) {
            clearInterval(previewTimerRef.current);
            previewTimerRef.current = null;
        }
    }, []);

    // Feature 6: Preview timer for elapsed time tracking
    useEffect(() => {
        if (isPreviewMode && isPlaying) {
            previewTimerRef.current = setInterval(() => {
                setPreviewElapsedTime(prev => {
                    const next = prev + 0.1;
                    if (next >= totalDuration) {
                        stopPreview();
                        return prev;
                    }
                    return next;
                });
            }, 100);
        }
        return () => {
            if (previewTimerRef.current) {
                clearInterval(previewTimerRef.current);
                previewTimerRef.current = null;
            }
        };
    }, [isPreviewMode, isPlaying, totalDuration, stopPreview]);

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

    const handleNext = useCallback(() => {
        setSelectedShotIndex(prev => {
            if (prev < shots.length - 1) return prev + 1;
            return prev;
        });
    }, [shots.length]);

    const handlePrev = useCallback(() => {
        setSelectedShotIndex(prev => {
            if (prev > 0) return prev - 1;
            return prev;
        });
    }, []);

    // --- Feature 3: Play/Pause auto-advance slideshow ---
    const togglePlay = useCallback(() => {
        setIsPlaying(prev => !prev);
    }, []);

    useEffect(() => {
        if (isPlaying) {
            const durationMs = (currentShot?.durationEst || 5) * 1000;
            playIntervalRef.current = setInterval(() => {
                setSelectedShotIndex(prev => {
                    if (prev >= shots.length - 1) {
                        // Reached last shot — stop playing
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, durationMs);
        }
        return () => {
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
            }
        };
    }, [isPlaying, selectedShotIndex, currentShot?.durationEst, shots.length]);

    // Auto-play narration audio when slideshow is playing or shot changes
    useEffect(() => {
        if (narrationAudioRef.current && currentNarration?.audioUrl) {
            if (isPlaying) {
                narrationAudioRef.current.src = currentNarration.audioUrl;
                narrationAudioRef.current.play().catch(() => { /* autoplay may be blocked */ });
            } else {
                narrationAudioRef.current.pause();
            }
        }
    }, [isPlaying, selectedShotIndex, currentNarration?.audioUrl]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent): void => {
            // Feature 2: Close shortcuts overlay on Escape
            if (e.key === 'Escape') {
                if (showShortcuts) {
                    setShowShortcuts(false);
                    return;
                }
                if (isPreviewMode) {
                    stopPreview();
                    return;
                }
            }
            // Feature 2: Toggle shortcuts overlay on ?
            if (e.key === '?') {
                e.preventDefault();
                setShowShortcuts(prev => !prev);
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrev();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                handleNext();
            } else if (e.key === ' ') {
                e.preventDefault();
                togglePlay();
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
    }, [selectedShotIndex, shots.length, handleNext, handlePrev, togglePlay, onEditShot, currentShot, showShortcuts, isPreviewMode, stopPreview]);

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

    // --- Feature 1: Drag-to-reorder handlers ---
    const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
        setDragFromIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragFromIndex !== null && index !== dragOverIndex) {
            setDragOverIndex(index);
        }
    }, [dragFromIndex, dragOverIndex]);

    const handleDragEnd = useCallback(() => {
        setDragFromIndex(null);
        setDragOverIndex(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        if (dragFromIndex !== null && dragFromIndex !== toIndex && onReorderShots) {
            onReorderShots(dragFromIndex, toIndex);
            // Update selected index if the dragged shot was selected
            if (selectedShotIndex === dragFromIndex) {
                setSelectedShotIndex(toIndex);
            } else if (dragFromIndex < selectedShotIndex && toIndex >= selectedShotIndex) {
                setSelectedShotIndex(selectedShotIndex - 1);
            } else if (dragFromIndex > selectedShotIndex && toIndex <= selectedShotIndex) {
                setSelectedShotIndex(selectedShotIndex + 1);
            }
        }
        setDragFromIndex(null);
        setDragOverIndex(null);
    }, [dragFromIndex, onReorderShots, selectedShotIndex]);

    return (
        <div ref={containerRef} className="flex flex-col h-full bg-background relative">
            {/* Hidden audio element for narration playback during slideshow */}
            <audio ref={narrationAudioRef} className="hidden" />

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
                        {/* Feature 5: Show video if shot has animation, else show image */}
                        {currentVideoUrl ? (
                            <video
                                src={currentVideoUrl}
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                            />
                        ) : currentShot?.imageUrl ? (
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
                            {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : currentVideoUrl ? (
                                <RefreshCw className="w-4 h-4" />
                            ) : (
                                <Video className="w-4 h-4" />
                            )}
                            {currentVideoUrl ? 'Regenerate Video' : 'Generate Video'}
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
                            <div className="p-4 space-y-3 overflow-y-auto max-h-[320px]">
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

                                {/* Feature 4: Per-shot audio preview */}
                                {currentNarration && (
                                    <div>
                                        <p className="text-[11px] font-code font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                            <Mic className="w-3 h-3 inline mr-1" />
                                            Narration
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <audio
                                                controls
                                                src={currentNarration.audioUrl}
                                                className="w-full h-8 [&::-webkit-media-controls-panel]:bg-secondary"
                                            />
                                            <span className="text-[10px] font-code text-muted-foreground whitespace-nowrap">
                                                {currentNarration.duration.toFixed(1)}s
                                            </span>
                                        </div>
                                    </div>
                                )}

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

                                {/* Generate Video button — Feature 5: text changes when video exists */}
                                <button
                                    onClick={() => currentShot && onGenerateVideo?.(currentShot.id)}
                                    disabled={isProcessing || !currentShot?.imageUrl}
                                    className="w-full py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-sm rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-accent/20"
                                >
                                    {isProcessing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : currentVideoUrl ? (
                                        <RefreshCw className="w-4 h-4" />
                                    ) : (
                                        <Video className="w-4 h-4" />
                                    )}
                                    {currentVideoUrl ? 'Regenerate Video' : 'Generate Video'}
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

                {/* Feature 3: Play/Pause button */}
                <button
                    onClick={togglePlay}
                    className="absolute z-10 p-3 text-foreground/60 hover:text-foreground transition-colors"
                    style={{ bottom: '8px', left: currentShot?.imageUrl ? '396px' : '52px' }}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
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

                {/* Feature 6: Export preview button (Film icon) */}
                <button
                    onClick={isPreviewMode ? stopPreview : startPreview}
                    className={`absolute bottom-3 right-14 z-10 p-2 transition-colors ${isPreviewMode ? 'text-accent' : 'text-foreground/40 hover:text-foreground'}`}
                    aria-label={isPreviewMode ? 'Stop preview' : 'Start rough cut preview'}
                    title="Rough cut preview"
                >
                    <Film className="w-5 h-5" />
                </button>

                {/* Feature 2: Keyboard shortcuts button */}
                <button
                    onClick={() => setShowShortcuts(prev => !prev)}
                    className="absolute bottom-3 right-26 z-10 p-2 text-foreground/40 hover:text-foreground transition-colors"
                    aria-label="Show keyboard shortcuts"
                    title="Keyboard shortcuts (?)"
                >
                    <HelpCircle className="w-5 h-5" />
                </button>

                {/* Feature 6: Preview mode elapsed time overlay */}
                {isPreviewMode && (
                    <div className="absolute top-4 left-4 z-20 px-3 py-1.5 bg-black/80 backdrop-blur-sm rounded-lg border border-border">
                        <span className="font-mono text-sm text-foreground">
                            {Math.floor(previewElapsedTime / 60)}:{String(Math.floor(previewElapsedTime % 60)).padStart(2, '0')} / {Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}
                        </span>
                    </div>
                )}

                {/* Feature 2: Keyboard shortcuts overlay */}
                <AnimatePresence>
                    {showShortcuts && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowShortcuts(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-card border border-border rounded-xl p-6 shadow-2xl max-w-sm"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-editorial text-lg text-foreground">Keyboard Shortcuts</h3>
                                    <button onClick={() => setShowShortcuts(false)} className="text-muted-foreground hover:text-foreground">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between gap-8">
                                        <span className="text-muted-foreground">Navigate shots</span>
                                        <div className="flex gap-1">
                                            <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono">←</kbd>
                                            <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono">→</kbd>
                                        </div>
                                    </div>
                                    <div className="flex justify-between gap-8">
                                        <span className="text-muted-foreground">Play / Pause</span>
                                        <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono">Space</kbd>
                                    </div>
                                    <div className="flex justify-between gap-8">
                                        <span className="text-muted-foreground">Fullscreen</span>
                                        <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono">F</kbd>
                                    </div>
                                    <div className="flex justify-between gap-8">
                                        <span className="text-muted-foreground">Edit shot</span>
                                        <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono">E</kbd>
                                    </div>
                                    <div className="flex justify-between gap-8">
                                        <span className="text-muted-foreground">Show shortcuts</span>
                                        <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono">?</kbd>
                                    </div>
                                    <div className="flex justify-between gap-8">
                                        <span className="text-muted-foreground">Close overlay</span>
                                        <kbd className="px-2 py-0.5 bg-secondary rounded text-xs font-mono">Esc</kbd>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Feature 3: Shot duration timeline bar */}
            <div className="h-6 shrink-0 bg-card/50 border-t border-border flex items-center px-3 gap-0.5">
                {sceneGroups.length > 0 ? (
                    sceneGroups.map((group, groupIdx) => {
                        const sceneDuration = group.shots.reduce((sum, s) => sum + (s.durationEst || 5), 0);
                        const widthPercent = (sceneDuration / totalDuration) * 100;
                        const isCollapsed = collapsedScenes.has(group.scene.id);
                        return (
                            <React.Fragment key={group.scene.id}>
                                {/* Scene segment with shots */}
                                <div
                                    className={`relative h-3 rounded-sm flex gap-0.5 overflow-hidden cursor-pointer ${sceneColors[groupIdx % sceneColors.length]}`}
                                    style={{ width: `${widthPercent}%` }}
                                    onClick={() => {
                                        // Navigate to first shot of this scene
                                        const firstShotIdx = shots.findIndex(s => s.sceneId === group.scene.id);
                                        if (firstShotIdx !== -1) setSelectedShotIndex(firstShotIdx);
                                    }}
                                    title={`Scene ${group.scene.sceneNumber}: ${sceneDuration.toFixed(1)}s`}
                                >
                                    {/* Shot segments within scene */}
                                    {group.shots.map((shot) => {
                                        const shotWidth = ((shot.durationEst || 5) / sceneDuration) * 100;
                                        const shotIdx = shots.indexOf(shot);
                                        const isSelected = shotIdx === selectedShotIndex;
                                        return (
                                            <div
                                                key={shot.id}
                                                className={`h-full transition-opacity ${isSelected ? 'ring-1 ring-white/50' : ''} ${isCollapsed ? 'opacity-50' : ''}`}
                                                style={{ width: `${shotWidth}%` }}
                                            />
                                        );
                                    })}
                                </div>
                            </React.Fragment>
                        );
                    })
                ) : (
                    // Fallback: single scene with all shots
                    shots.map((shot, idx) => {
                        const widthPercent = ((shot.durationEst || 5) / totalDuration) * 100;
                        return (
                            <div
                                key={shot.id}
                                className={`h-3 rounded-sm cursor-pointer ${idx === selectedShotIndex ? 'bg-primary ring-1 ring-white/50' : 'bg-primary/50'}`}
                                style={{ width: `${widthPercent}%` }}
                                onClick={() => setSelectedShotIndex(idx)}
                                title={`Shot ${shot.shotNumber}: ${(shot.durationEst || 5).toFixed(1)}s`}
                            />
                        );
                    })
                )}
                {/* Total duration label */}
                <span className="ml-auto pl-2 text-xs font-mono text-muted-foreground whitespace-nowrap">
                    {Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}
                </span>
            </div>

            {/* Thumbnail Strip with Feature 5: Scene-level collapse/expand */}
            <div
                ref={thumbnailStripRef}
                className="h-24 shrink-0 bg-card/95 backdrop-blur border-t border-border flex items-center gap-1 px-3 overflow-x-auto no-scrollbar"
            >
                {sceneGroups.length > 0 ? (
                    sceneGroups.map((group, groupIdx) => {
                        const isCollapsed = collapsedScenes.has(group.scene.id);
                        return (
                            <React.Fragment key={group.scene.id}>
                                {/* Feature 5: Clickable scene label divider */}
                                <button
                                    onClick={() => toggleSceneCollapse(group.scene.id)}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-mono transition-colors shrink-0 ${isCollapsed ? 'bg-primary/20 text-primary' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                                    title={isCollapsed ? 'Expand scene' : 'Collapse scene'}
                                >
                                    <span className={`transition-transform ${isCollapsed ? 'rotate-90' : ''}`}>▶</span>
                                    <span>SCENE {group.scene.sceneNumber}</span>
                                    {isCollapsed && (
                                        <span className="text-muted-foreground">({group.shots.length} shots)</span>
                                    )}
                                </button>
                                {/* Feature 5: Show thumbnails only if not collapsed */}
                                {!isCollapsed && group.shots.map((shot) => {
                                    const idx = shots.indexOf(shot);
                                    return (
                                        <ShotThumbnail
                                            key={shot.id}
                                            shot={shot}
                                            index={idx}
                                            isSelected={idx === selectedShotIndex}
                                            onClick={() => setSelectedShotIndex(idx)}
                                            processingInfo={processingShots?.get(shot.id)}
                                            hasVideo={!!animatedShotVideos?.get(shot.id)}
                                            isDragging={dragFromIndex === idx}
                                            isDropTarget={dragOverIndex === idx}
                                            onDragStart={handleDragStart}
                                            onDragOver={handleDragOver}
                                            onDragEnd={handleDragEnd}
                                            onDrop={handleDrop}
                                        />
                                    );
                                })}
                            </React.Fragment>
                        );
                    })
                ) : (
                    shots.map((shot, idx) => (
                        <ShotThumbnail
                            key={shot.id}
                            shot={shot}
                            index={idx}
                            isSelected={idx === selectedShotIndex}
                            onClick={() => setSelectedShotIndex(idx)}
                            processingInfo={processingShots?.get(shot.id)}
                            hasVideo={!!animatedShotVideos?.get(shot.id)}
                            isDragging={dragFromIndex === idx}
                            isDropTarget={dragOverIndex === idx}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDragEnd={handleDragEnd}
                            onDrop={handleDrop}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export default StoryboardView;
