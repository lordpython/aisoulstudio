/**
 * ProductionView Component
 * 
 * Modern redesign matching SaaS video creation interfaces.
 * Features step indicator, tabbed input, visual cards, and style gallery.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft,
    Wand2,
    FileText,
    Sparkles,
    Monitor,
    Smartphone,
    Clock,
    Play,
    Settings2,
    ChevronDown,
    Download,
    Image as ImageIcon,
    Film,
    Loader2,
    Check,
    RotateCcw,
    Volume2,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn, isRTL, getTextDirection } from "@/lib/utils";
import { AgentProgress } from "./AgentProgress";
import { SceneEditor } from "./SceneEditor";
import { VideoTimeline } from "./TimelineEditor";
import { useVideoProductionRefactored } from "@/hooks/useVideoProductionRefactored";
import { AppState, SongData, SubtitleItem, ImagePrompt, GeneratedImage } from "@/types";
import { ART_STYLES, VIDEO_PURPOSES, CONTENT_LANGUAGES, type VideoPurpose, type LanguageCode } from "@/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VideoExportModal } from "./VideoExportModal";
import { QualityDashboard } from "./QualityDashboard";
import { MusicGeneratorModal } from "./MusicGeneratorModal";
import { Music } from "lucide-react";
import { splitTextIntoSegments } from "@/services/subtitleService";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

interface ProductionViewProps {
    onBack: () => void;
    className?: string;
}

// Step configuration
const STEPS = [
    { id: 1, label: "Script", icon: FileText },
    { id: 2, label: "Visuals", icon: ImageIcon },
    { id: 3, label: "Generate", icon: Sparkles },
];

// Style presets with thumbnails
const STYLE_PRESETS = [
    { id: "default", name: "Default", color: "from-cyan-500 to-blue-500" },
    { id: "cinematic", name: "Cinematic", color: "from-amber-500 to-orange-500" },
    { id: "photorealistic", name: "Photorealistic", color: "from-emerald-500 to-teal-500" },
    { id: "mysterious", name: "Mysterious", color: "from-purple-500 to-violet-500" },
    { id: "anime", name: "Anime", color: "from-pink-500 to-rose-500" },
    { id: "watercolor", name: "Watercolor", color: "from-sky-500 to-indigo-500" },
];

/**
 * Skeleton loading component for scenes list
 * Shows animated placeholders while content is being generated
 */
function SceneListSkeleton() {
    return (
        <div className="space-y-4" role="status" aria-label="Loading scenes">
            {/* Project Header Skeleton */}
            <div className="bg-[#0a0a0f]/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6">
                <Skeleton className="h-7 w-64 mb-3" />
                <div className="flex gap-3">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-24" />
                </div>
            </div>

            {/* Scene Cards Skeletons */}
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className="bg-[#0a0a0f]/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5"
                >
                    <div className="flex gap-4">
                        {/* Image placeholder */}
                        <Skeleton variant="rectangular" className="w-32 h-24 rounded-lg shrink-0" />

                        {/* Content */}
                        <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-8" />
                                <Skeleton className="h-5 w-32" />
                            </div>
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                            <div className="flex gap-2 pt-2">
                                <Skeleton className="h-8 w-20" />
                                <Skeleton className="h-8 w-20" />
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            <span className="sr-only">Loading scene content...</span>
        </div>
    );
}

export function ProductionView({ onBack, className }: ProductionViewProps) {
    const {
        appState,
        topic,
        contentPlan,
        narrationSegments,
        sfxPlan,
        validation,
        qualityReport,
        progress,
        error,
        playingSceneId,
        targetDuration,
        targetAudience,
        language,
        videoPurpose,
        visualStyle,
        musicState,
        setTopic,
        setTargetDuration,
        setTargetAudience,
        setLanguage,
        setVideoPurpose,
        setVisualStyle,
        startProduction,
        generatePlan,
        generateNarration,
        regenerateSceneNarration,
        runValidation,
        generateMusic,
        generateLyrics,
        selectTrack,
        addMusicToTimeline,
        refreshCredits,
        updateScenes,
        playNarration,
        reset,
        getAudioUrlMap,
        getVisualsMap,
        visualsMap, // Use memoized map directly
        // Extended music features
        uploadAudio,
        uploadAndCover,
        addVocals,
        addInstrumental,
        // Config
        useAgentMode,
        setUseAgentMode,
    } = useVideoProductionRefactored();

    // Track which scene is currently regenerating TTS
    const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);

    // Handler for regenerating narration with loading state
    const handleRegenerateNarration = useCallback(async (sceneId: string) => {
        setRegeneratingSceneId(sceneId);
        try {
            await regenerateSceneNarration(sceneId);
        } finally {
            setRegeneratingSceneId(null);
        }
    }, [regenerateSceneNarration]);

    const [activeTab, setActiveTab] = useState<"idea" | "script">("idea");
    const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
    const [selectedStyle, setSelectedStyle] = useState("cinematic");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [motionEffects, setMotionEffects] = useState(true);

    // Timeline playback state
    const [timelineCurrentTime, setTimelineCurrentTime] = useState(0);
    const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    // State for merged audio URL (moved before callbacks that use it)
    const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
    const mergedAudioUrlRef = useRef<string | null>(null);

    // Export modal state
    const [showExportModal, setShowExportModal] = useState(false);

    // Quality dashboard state
    const [showQualityDashboard, setShowQualityDashboard] = useState(false);

    // Music generator modal state
    const [showMusicGenerator, setShowMusicGenerator] = useState(false);

    const currentStep = !contentPlan ? 1 : !narrationSegments.length ? 2 : 3;

    const isWorking = [
        AppState.CONTENT_PLANNING,
        AppState.NARRATING,
        AppState.VALIDATING,
        AppState.GENERATING_PROMPTS,
    ].includes(appState);

    const hasContent = contentPlan !== null;

    // Timeline playback controls - now uses real audio element
    const handleTimelinePlayPause = useCallback(() => {
        if (!audioRef.current || !mergedAudioUrl) {
            console.warn("[ProductionView] No audio available for playback");
            return;
        }

        if (isTimelinePlaying) {
            audioRef.current.pause();
            setIsTimelinePlaying(false);
        } else {
            audioRef.current.play().catch(err => {
                console.error("[ProductionView] Audio play failed:", err);
            });
            setIsTimelinePlaying(true);
        }
    }, [isTimelinePlaying, mergedAudioUrl]);

    const handleTimelineSeek = useCallback((time: number) => {
        setTimelineCurrentTime(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        }
    }, []);

    // Sync audio timeupdate with timeline state
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            setTimelineCurrentTime(audio.currentTime);
        };

        const handleEnded = () => {
            setIsTimelinePlaying(false);
            setTimelineCurrentTime(0);
        };

        const handlePause = () => {
            setIsTimelinePlaying(false);
        };

        const handlePlay = () => {
            setIsTimelinePlaying(true);
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('play', handlePlay);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('play', handlePlay);
        };
    }, [mergedAudioUrl]);



    // Merge all narration audio blobs into a single audio file
    useEffect(() => {
        const mergeAudio = async () => {
            if (!contentPlan || narrationSegments.length === 0) {
                setMergedAudioUrl(null);
                return;
            }

            // Cleanup previous merged URL
            if (mergedAudioUrlRef.current) {
                URL.revokeObjectURL(mergedAudioUrlRef.current);
                mergedAudioUrlRef.current = null;
            }

            try {
                // Collect audio blobs in scene order
                const orderedBlobs: Blob[] = [];

                for (const scene of contentPlan.scenes) {
                    const narration = narrationSegments.find(n => n.sceneId === scene.id);
                    if (narration && narration.audioBlob) {
                        orderedBlobs.push(narration.audioBlob);
                    }
                }

                if (orderedBlobs.length === 0) {
                    setMergedAudioUrl(null);
                    return;
                }

                // Use the AudioMixerService to merge blobs (robust against sample rates)
                // Dynamically imported to avoid heavy load on initial render if not needed yet
                const { mergeConsecutiveAudioBlobs } = await import("@/services/audioMixerService");
                const mergedBlob = await mergeConsecutiveAudioBlobs(orderedBlobs);

                const url = URL.createObjectURL(mergedBlob);
                mergedAudioUrlRef.current = url;
                setMergedAudioUrl(url);

                console.log(`[ProductionView] Merged ${orderedBlobs.length} audio segments`);
            } catch (err) {
                console.error("[ProductionView] Failed to merge audio:", err);
                setMergedAudioUrl(null);
            }
        };

        mergeAudio();

        // Cleanup on unmount
        return () => {
            if (mergedAudioUrlRef.current) {
                URL.revokeObjectURL(mergedAudioUrlRef.current);
            }
        };
    }, [contentPlan, narrationSegments]);

    // Convert production data to SongData format for export
    const exportSongData = useMemo((): SongData | null => {
        if (!contentPlan || narrationSegments.length === 0 || !mergedAudioUrl) return null;

        // Use memoized visualsMap from hook

        // Dynamically import or just assume global availability? 
        // Better to import splitTextIntoSegments at top level, but for now I'll use it directly if imported.
        // I will use a placeholder comment here and replace the function definition line.
        // Wait, I can't await inside useMemo easily unless I make it async which useMemo isn't.
        // It's better to import `splitTextIntoSegments` at the top of the file.
        // I will rely on the `splitTextIntoSegments` function being available in scope. 
        // I will ADD the import in the next step.

        // Build subtitles from narration segments, splitting long text
        let currentTime = 0;
        const parsedSubtitles: SubtitleItem[] = [];
        let subtitleId = 1;

        contentPlan.scenes.forEach((scene) => {
            const narration = narrationSegments.find(n => n.sceneId === scene.id);
            const text = narration?.transcript || scene.narrationScript;
            const duration = narration?.audioDuration || scene.duration;

            // Split long text into shorter segments
            const textSegments = splitTextIntoSegments(text, duration);

            textSegments.forEach((segment) => {
                parsedSubtitles.push({
                    id: subtitleId++,
                    startTime: currentTime,
                    endTime: currentTime + segment.duration,
                    text: segment.text,
                });
                currentTime += segment.duration;
            });
        });

        // Build prompts from scenes
        const prompts: ImagePrompt[] = contentPlan.scenes.map((scene, index) => ({
            id: scene.id,
            text: scene.visualDescription,
            mood: scene.emotionalTone,
            timestampSeconds: parsedSubtitles[index]?.startTime || 0,
        }));

        // Build generated images from visuals map
        const generatedImages: GeneratedImage[] = [];
        Object.entries(visualsMap as Record<string, string>).forEach(([sceneId, url]) => {
            if (url) {
                generatedImages.push({
                    promptId: sceneId,
                    imageUrl: url,
                    type: url.includes('.mp4') || url.includes('video') ? 'video' : 'image',
                });
            }
        });

        return {
            fileName: contentPlan.title || 'production-video',
            audioUrl: mergedAudioUrl,
            srtContent: '', // Not needed for production mode
            parsedSubtitles,
            prompts,
            generatedImages,
        };
    }, [contentPlan, narrationSegments, visualsMap, mergedAudioUrl]);

    // Calculate scene timings for SFX mixing
    const sceneTimings = useMemo(() => {
        if (!contentPlan || narrationSegments.length === 0) return [];

        let currentTime = 0;
        return contentPlan.scenes.map((scene) => {
            const narration = narrationSegments.find(n => n.sceneId === scene.id);
            const duration = narration?.audioDuration || scene.duration;
            const timing = {
                sceneId: scene.id,
                startTime: currentTime,
                duration: duration,
            };
            currentTime += duration;
            return timing;
        });
    }, [contentPlan, narrationSegments]);

    return (
        <div className={cn(
            "min-h-screen bg-[#020205] text-white relative overflow-x-hidden selection:bg-purple-500/30 selection:text-purple-200",
            className
        )}>
            {/* Hidden audio element for timeline playback */}
            {mergedAudioUrl && (
                <audio
                    ref={audioRef}
                    src={mergedAudioUrl}
                    preload="auto"
                    className="hidden"
                />
            )}

            {/* Ambient Background Animation */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-900/20 rounded-full blur-[120px] animate-pulse-slow" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px] animate-pulse-slow delay-1000" />
                <div className="absolute top-[20%] right-[20%] w-[30%] h-[30%] bg-cyan-900/10 rounded-full blur-[100px] animate-pulse-slow delay-2000" />
            </div>

            {/* Glass Header */}
            <header className="border-b border-white/5 bg-[#0a0a0f]/60 backdrop-blur-xl sticky top-0 z-50 shadow-lg shadow-black/20">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Button
                        variant="ghost"
                        onClick={onBack}
                        className="gap-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-all group"
                    >
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        </div>
                        <span className="font-medium">Back to Home</span>
                    </Button>

                    {/* Enhanced Step Indicator */}
                    <div className="flex items-center gap-4 bg-black/20 p-1.5 rounded-full border border-white/5 backdrop-blur-md">
                        {STEPS.map((step, index) => (
                            <React.Fragment key={step.id}>
                                <div className={cn(
                                    "flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-300 relative",
                                    currentStep >= step.id
                                        ? "bg-linear-to-r from-purple-500/20 to-blue-500/20 text-white border border-white/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                                        : "text-slate-500 hover:text-slate-300"
                                )}>
                                    {currentStep > step.id ? (
                                        <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
                                            <Check className="w-3 h-3 text-green-400" />
                                        </div>
                                    ) : (
                                        <div className={cn(
                                            "w-5 h-5 rounded-full flex items-center justify-center border transition-colors",
                                            currentStep === step.id ? "bg-purple-500 text-white border-purple-500" : "bg-white/5 border-white/10"
                                        )}>
                                            <step.icon className="w-3 h-3" />
                                        </div>
                                    )}
                                    {step.label}

                                    {/* Active Glow for current step */}
                                    {currentStep === step.id && (
                                        <motion.div
                                            layoutId="step-glow"
                                            className="absolute inset-0 rounded-full bg-white/5 -z-10"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                </div>
                                {index < STEPS.length - 1 && (
                                    <div className={cn(
                                        "w-8 h-0.5 rounded-full transition-colors duration-500",
                                        currentStep > step.id ? "bg-purple-500/50" : "bg-white/5"
                                    )} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {hasContent && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={reset}
                            className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Reset Project
                        </Button>
                    )}
                </div>
            </header>

            {/* Error Display */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="max-w-6xl mx-auto px-6 pt-4"
                    >
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                            {error}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Progress Bar */}
            <AnimatePresence>
                {isWorking && progress && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="max-w-6xl mx-auto px-6 pt-4"
                    >
                        <AgentProgress progress={progress} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content Glass Container */}
            <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
                {/* Step 1: Script & Visuals Input */}
                {!hasContent && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Left Column: Input & Script */}
                        <div className="lg:col-span-7 space-y-8">

                            {/* Section Header */}
                            <div className={cn(isRTL(topic) && "text-right")} dir={topic ? getTextDirection(topic) : "ltr"}>
                                <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-linear-to-r from-white to-white/60">
                                    Script & Visuals
                                </h1>
                                <p className="text-slate-400 text-lg font-light tracking-wide">Enter your video idea or paste a script to get started.</p>
                            </div>

                            <div className="bg-[#0a0a0f]/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl ring-1 ring-white/5">
                                {/* Tab Switcher */}
                                <div className="flex p-1 bg-black/40 rounded-xl w-full mb-6 relative">
                                    <div className="absolute inset-0 rounded-xl border border-white/5 pointer-events-none" />
                                    {[
                                        { id: "idea", icon: Wand2, label: "Video Idea" },
                                        { id: "script", icon: FileText, label: "Paste Script" }
                                    ].map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id as any)}
                                            className={cn(
                                                "flex-1 py-3.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 relative z-10",
                                                activeTab === tab.id
                                                    ? "text-white shadow-sm"
                                                    : "text-slate-500 hover:text-white/80"
                                            )}
                                        >
                                            {activeTab === tab.id && (
                                                <motion.div
                                                    layoutId="input-tab"
                                                    className="absolute inset-0 bg-white/10 rounded-lg -z-10 border border-white/10"
                                                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                                                />
                                            )}
                                            <tab.icon className="w-4 h-4" />
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Script Input */}
                                <div className="relative group">
                                    <div className="absolute -inset-0.5 bg-linear-to-r from-purple-500/20 to-blue-500/20 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-lg pointer-events-none" />
                                    <Textarea
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        placeholder={activeTab === "idea"
                                            ? "Describe your video idea... e.g., 'A futuristic city where nature has taken over skyscrapers' | أدخل فكرة الفيديو..."
                                            : "Paste your script here... | الصق النص هنا..."
                                        }
                                        className={cn(
                                            "min-h-[240px] bg-black/20 border-white/10 text-white placeholder:text-slate-600 resize-none focus:border-purple-500/50 focus:ring-0 rounded-xl text-lg leading-relaxed p-6 transition-all",
                                            isRTL(topic) && "text-right"
                                        )}
                                        dir={getTextDirection(topic)}
                                        disabled={isWorking}
                                    />
                                    <div className={cn(
                                        "absolute bottom-4 text-xs font-medium text-slate-500 bg-black/40 px-3 py-1 rounded-full backdrop-blur-md border border-white/5",
                                        isRTL(topic) ? "left-4" : "right-4"
                                    )}>
                                        {topic.length} / 5000 chars
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Configuration */}
                        <div className="lg:col-span-5 space-y-6">

                            {/* Visual Style Palette */}
                            <div className="bg-[#0a0a0f]/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-xl ring-1 ring-white/5">
                                <label className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                    Artistic Style
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    {STYLE_PRESETS.map((style) => (
                                        <button
                                            key={style.id}
                                            onClick={() => setSelectedStyle(style.id)}
                                            className={cn(
                                                "relative group overflow-hidden rounded-xl transition-all duration-300 border text-left",
                                                selectedStyle === style.id
                                                    ? "ring-2 ring-purple-500 ring-offset-2 ring-offset-[#0a0a0f] border-transparent"
                                                    : "border-white/5 hover:border-white/20 opacity-70 hover:opacity-100"
                                            )}
                                        >
                                            <div className={cn("absolute inset-0 bg-linear-to-br opacity-50 transition-opacity group-hover:opacity-70", style.color)} />
                                            <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent" />

                                            <div className="relative p-3 h-20 flex flex-col justify-end">
                                                <span className="text-sm font-semibold text-white tracking-wide">{style.name}</span>
                                                {selectedStyle === style.id && (
                                                    <motion.div
                                                        layoutId="style-check"
                                                        className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center"
                                                    >
                                                        <Check className="w-3 h-3 text-white" />
                                                    </motion.div>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Settings Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Dimensions */}
                                <div className="bg-[#0a0a0f]/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5 shadow-lg group hover:border-white/10 transition-colors">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 block">
                                        Format
                                    </label>
                                    <div className="flex gap-2">
                                        {[
                                            { id: "portrait", icon: Smartphone, label: "9:16" },
                                            { id: "landscape", icon: Monitor, label: "16:9" }
                                        ].map((opt) => (
                                            <button
                                                key={opt.id}
                                                onClick={() => setOrientation(opt.id as any)}
                                                className={cn(
                                                    "flex-1 h-14 rounded-xl border text-sm font-bold transition-all flex flex-col items-center justify-center gap-1",
                                                    orientation === opt.id
                                                        ? "bg-white/10 border-purple-500/50 text-white shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                                                        : "bg-black/20 border-white/5 text-slate-500 hover:text-white/80 hover:bg-white/5"
                                                )}
                                            >
                                                <opt.icon className="w-4 h-4" />
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Duration */}
                                <div className="bg-[#0a0a0f]/40 backdrop-blur-xl border border-white/5 rounded-2xl p-5 shadow-lg group hover:border-white/10 transition-colors">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                                        <span>Duration</span>
                                        <span className="text-white">{targetDuration}s</span>
                                    </label>
                                    <div className="h-14 flex items-center justify-center">
                                        <Slider
                                            value={[targetDuration]}
                                            onValueChange={([v]) => setTargetDuration(v ?? 0)}
                                            min={15}
                                            max={300}
                                            step={15}
                                            disabled={isWorking}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Dropdowns */}
                            <div className="space-y-4">
                                <Select
                                    value={videoPurpose}
                                    onValueChange={(v) => setVideoPurpose(v as VideoPurpose)}
                                    disabled={isWorking}
                                >
                                    <SelectTrigger className="h-14 bg-[#0a0a0f]/40 border-white/10 rounded-xl text-white hover:bg-white/5 transition-colors focus:ring-purple-500/20">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                                <Film className="w-4 h-4 text-orange-400" />
                                            </div>
                                            <div className="text-left">
                                                <div className="text-xs text-slate-500 font-medium">Video Purpose</div>
                                                <SelectValue placeholder="Select purpose" />
                                            </div>
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#0a0a0f]/95 border-white/10 backdrop-blur-xl text-white">
                                        {VIDEO_PURPOSES.map((purpose) => (
                                            <SelectItem key={purpose.value} value={purpose.value} className="focus:bg-white/10 focus:text-white cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <span>{purpose.icon}</span>
                                                    <span>{purpose.label}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={language}
                                    onValueChange={(v) => setLanguage(v as LanguageCode)}
                                    disabled={isWorking}
                                >
                                    <SelectTrigger className="h-14 bg-[#0a0a0f]/40 border-white/10 rounded-xl text-white hover:bg-white/5 transition-colors focus:ring-purple-500/20">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                <span className="text-xs">🌐</span>
                                            </div>
                                            <div className="text-left">
                                                <div className="text-xs text-slate-500 font-medium">Language</div>
                                                <SelectValue placeholder="Select language" />
                                            </div>
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#0a0a0f]/95 border-white/10 backdrop-blur-xl text-white">
                                        {CONTENT_LANGUAGES.map((lang) => (
                                            <SelectItem key={lang.code} value={lang.code} className="focus:bg-white/10 focus:text-white cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <span className={lang.direction === "rtl" ? "font-arabic" : ""}>
                                                        {lang.nativeLabel}
                                                    </span>
                                                    {lang.code !== "auto" && (
                                                        <span className="text-xs text-slate-400">({lang.label})</span>
                                                    )}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Advanced Settings Toggle */}
                            <div className="border-t border-white/5 pt-4">
                                <button
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors uppercase tracking-wider group"
                                >
                                    <Settings2 className="w-4 h-4 group-hover:rotate-45 transition-transform duration-300" />
                                    Advanced Configuration
                                    <ChevronDown className={cn(
                                        "w-4 h-4 transition-transform duration-300",
                                        showAdvanced && "rotate-180"
                                    )} />
                                </button>

                                <AnimatePresence>
                                    {showAdvanced && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="mt-4 p-4 rounded-xl bg-black/20 border border-white/5 space-y-4"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400">
                                                        <Sparkles className="w-4 h-4 text-amber-400" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-white">AI Director Mode</div>
                                                        <div className="text-xs text-slate-500">Enable for complex topics & better coherence (Slower)</div>
                                                    </div>
                                                </div>
                                                <Switch
                                                    checked={useAgentMode}
                                                    onCheckedChange={setUseAgentMode}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between border-t border-white/5 pt-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400">
                                                        <Volume2 className="w-4 h-4" />
                                                    </div>
                                                    <div className="text-sm font-medium">Background Music</div>
                                                </div>
                                                <Switch disabled />
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400">
                                                        <Play className="w-4 h-4" />
                                                    </div>
                                                    <div className="text-sm font-medium">Cinematic Motion</div>
                                                </div>
                                                <Switch
                                                    checked={motionEffects}
                                                    onCheckedChange={setMotionEffects}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Generate Button */}
                            <Button
                                onClick={() => startProduction({ skipNarration: false, animateVisuals: motionEffects })}
                                disabled={!topic.trim() || isWorking}
                                size="lg"
                                className="w-full h-16 rounded-xl font-bold text-lg bg-white hover:bg-slate-200 text-black shadow-lg shadow-white/10 hover:shadow-white/20 transition-all active:scale-[0.98] mt-4"
                            >
                                {isWorking ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        Orchestrating Agents...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5 mr-3 text-purple-600" />
                                        Generate Masterpiece
                                        <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 2+: Scene Editor */}
                {hasContent && (
                    <div className="space-y-6">
                        {/* Project Header Card */}
                        <div className="bg-[#0a0a0f]/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-1.5">{contentPlan.title}</h2>
                                <div className="flex items-center gap-3 text-sm text-slate-400">
                                    <span className="bg-white/5 px-2 py-0.5 rounded text-xs border border-white/5">
                                        {contentPlan.scenes.length} Scenes
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        {Math.floor(contentPlan.totalDuration / 60)}:{String(contentPlan.totalDuration % 60).padStart(2, '0')}
                                    </span>
                                    {sfxPlan && sfxPlan.backgroundMusic && (
                                        <span className="flex items-center gap-1.5 text-purple-300">
                                            <Volume2 className="w-3.5 h-3.5" />
                                            {sfxPlan.backgroundMusic.name}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3">
                                {/* Generate Music Button */}
                                <Button
                                    onClick={() => setShowMusicGenerator(true)}
                                    disabled={isWorking}
                                    className="gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 hover:border-purple-500/40 transition-all h-10 px-6 font-medium"
                                >
                                    <Music className="w-4 h-4" />
                                    Generate Music
                                </Button>

                                {narrationSegments.length === 0 && (
                                    <Button
                                        onClick={generateNarration}
                                        disabled={isWorking}
                                        className="gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-purple-500/30 transition-all h-10 px-6 font-medium"
                                    >
                                        <Volume2 className="w-4 h-4 text-purple-400" />
                                        Generate Narration
                                    </Button>
                                )}

                                {narrationSegments.length > 0 && (
                                    <Button
                                        onClick={() => setShowExportModal(true)}
                                        className="gap-2 bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all h-10 px-6 font-semibold"
                                    >
                                        <Download className="w-4 h-4" />
                                        Export Final Video
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* SFX Plan Summary */}
                        {sfxPlan && (
                            <div className="p-4 rounded-xl bg-purple-900/10 border border-purple-500/10 backdrop-blur-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-sm">
                                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                            <span className="text-lg">🔊</span>
                                        </div>
                                        <div>
                                            <span className="block text-xs font-semibold text-purple-400 uppercase tracking-wide mb-1">Ambient Soundscape</span>
                                            <div className="flex flex-wrap gap-2">
                                                {sfxPlan.scenes
                                                    .filter(s => s.ambientTrack)
                                                    .slice(0, 4)
                                                    .map((s, i) => (
                                                        <span
                                                            key={i}
                                                            className={cn(
                                                                "px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors",
                                                                s.ambientTrack?.audioUrl
                                                                    ? "bg-green-500/20 text-green-300 border border-green-500/20"
                                                                    : "bg-purple-500/20 text-purple-300 border border-purple-500/20"
                                                            )}
                                                        >
                                                            {s.ambientTrack?.audioUrl && <Check className="w-3 h-3" />}
                                                            {s.ambientTrack?.name}
                                                        </span>
                                                    ))}
                                                {sfxPlan.scenes.filter(s => s.ambientTrack).length > 4 && (
                                                    <span className="text-purple-400 text-xs self-center font-medium bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/10">
                                                        +{sfxPlan.scenes.filter(s => s.ambientTrack).length - 4} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {sfxPlan.scenes.some(s => s.ambientTrack?.audioUrl) && (
                                        <div className="flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full border border-green-500/20">
                                            <span>Powered by Freesound</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Generated Music Display */}
                        {sfxPlan?.generatedMusic && (
                            <div className="p-4 rounded-xl bg-cyan-900/10 border border-cyan-500/10 backdrop-blur-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-sm">
                                        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                            <Music className="w-4 h-4 text-cyan-400" />
                                        </div>
                                        <div>
                                            <span className="block text-xs font-semibold text-cyan-400 uppercase tracking-wide mb-1">AI Generated Music</span>
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 flex items-center gap-1.5">
                                                    <Check className="w-3 h-3" />
                                                    {sfxPlan.generatedMusic.title}
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    {Math.floor(sfxPlan.generatedMusic.duration / 60)}:{String(Math.floor(sfxPlan.generatedMusic.duration % 60)).padStart(2, '0')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-full border border-cyan-500/20">
                                        <span>Powered by Suno AI</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Validation Score - Clickable for Quality Dashboard */}
                        {validation && (
                            <button
                                onClick={() => setShowQualityDashboard(true)}
                                className={cn(
                                    "p-4 rounded-xl border flex items-center justify-between w-full transition-all duration-300 cursor-pointer group shadow-lg",
                                    validation.score >= 80
                                        ? "bg-green-500/5 border-green-500/20 hover:border-green-500/40 hover:bg-green-500/10 shadow-green-900/10"
                                        : validation.score >= 60
                                            ? "bg-yellow-500/5 border-yellow-500/20 hover:border-yellow-500/40 hover:bg-yellow-500/10 shadow-yellow-900/10"
                                            : "bg-red-500/5 border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 shadow-red-900/10"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-10 h-10 rounded-lg flex items-center justify-center transition-colors font-bold text-lg",
                                        validation.score >= 80 ? "bg-green-500/20 text-green-400" :
                                            validation.score >= 60 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"
                                    )}>
                                        {validation.score}
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold text-white group-hover:text-white/90">Quality Score</div>
                                        <div className="text-xs text-slate-400">Click to view detailed analysis</div>
                                    </div>
                                </div>

                                <span className={cn(
                                    "flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border",
                                    validation.score >= 80 ? "bg-green-500/10 border-green-500/20 text-green-300" :
                                        validation.score >= 60 ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300" : "bg-red-500/10 border-red-500/20 text-red-300"
                                )}>
                                    View Report <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </span>
                            </button>
                        )}

                        {/* Professional Video Timeline */}
                        <VideoTimeline
                            scenes={contentPlan.scenes}
                            visuals={visualsMap}
                            narrationSegments={narrationSegments}
                            sfxPlan={sfxPlan}
                            currentTime={timelineCurrentTime}
                            duration={contentPlan.totalDuration}
                            isPlaying={isTimelinePlaying}
                            onPlayPause={handleTimelinePlayPause}
                            onSeek={handleTimelineSeek}
                            onSceneSelect={(sceneId) => {
                                // Could expand the scene in the editor
                                console.log("Selected scene:", sceneId);
                            }}
                        />

                        {/* Scene Editor */}
                        <SceneEditor
                            scenes={contentPlan.scenes}
                            onChange={updateScenes}
                            onPlayNarration={narrationSegments.length > 0 ? playNarration : undefined}
                            onRegenerateNarration={handleRegenerateNarration}
                            playingSceneId={playingSceneId}
                            regeneratingSceneId={regeneratingSceneId}
                            visuals={visualsMap}
                            narrationUrls={getAudioUrlMap()}
                        />
                    </div>
                )}
            </main>

            {/* Export Modal */}
            {exportSongData && (
                <VideoExportModal
                    isOpen={showExportModal}
                    onClose={() => setShowExportModal(false)}
                    songData={exportSongData}
                    contentMode="story"
                    sfxPlan={sfxPlan}
                    sceneTimings={sceneTimings}
                />
            )}

            {/* Quality Dashboard */}
            {qualityReport && (
                <QualityDashboard
                    report={qualityReport}
                    isOpen={showQualityDashboard}
                    onClose={() => setShowQualityDashboard(false)}
                />
            )}

            {/* Music Generator Modal */}
            <MusicGeneratorModal
                open={showMusicGenerator}
                onClose={() => setShowMusicGenerator(false)}
                onMusicGenerated={(track) => {
                    console.log("[ProductionView] Music added to timeline:", track.title);
                }}
                initialTopic={topic}
                musicState={{
                    isGenerating: musicState.isGenerating,
                    status: musicState.status,
                    progress: musicState.progress,
                    generatedTracks: musicState.generatedTracks,
                    selectedTrackId: musicState.selectedTrackId,
                    lyrics: musicState.lyrics,
                    credits: musicState.credits,
                    error: musicState.error,
                }}
                onGenerateMusic={generateMusic}
                onGenerateLyrics={generateLyrics}
                onSelectTrack={selectTrack}
                onAddToTimeline={addMusicToTimeline}
                onRefreshCredits={refreshCredits}
                onUploadAudio={uploadAudio}
                onUploadAndCover={uploadAndCover}
                onAddVocals={addVocals}
                onAddInstrumental={addInstrumental}
            />
        </div>
    );
}

export default ProductionView;
