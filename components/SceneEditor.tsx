/**
 * SceneEditor Component
 * 
 * Editable scene cards for reviewing and modifying content plans.
 * Allows editing visual descriptions, narration scripts, and timing.
 */

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
    GripVertical,
    Trash2,
    Plus,
    Play,
    Pause,
    Clock,
    Image,
    Mic,
    ChevronDown,
    ChevronUp,
    Eye,
    Download,
    RefreshCw,
    Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, isRTL, getTextDirection } from "@/lib/utils";
import { Scene, EmotionalTone, TransitionType } from "@/types";

interface SceneEditorProps {
    scenes: Scene[];
    onChange: (scenes: Scene[]) => void;
    onPlayNarration?: (sceneId: string) => void;
    onRegenerateNarration?: (sceneId: string) => Promise<void>;
    playingSceneId?: string | null;
    regeneratingSceneId?: string | null;
    visuals?: Record<string, string>; // sceneId -> imageUrl
    narrationUrls?: Record<string, string>; // sceneId -> audioUrl
    className?: string;
}

interface SceneCardProps {
    scene: Scene;
    index: number;
    isExpanded: boolean;
    isPlaying: boolean;
    isRegenerating: boolean;
    imageUrl?: string;
    audioUrl?: string;
    onToggleExpand: () => void;
    onChange: (updates: Partial<Scene>) => void;
    onDelete: () => void;
    onPlayNarration?: () => void;
    onRegenerateNarration?: () => void;
    onDownloadAudio?: () => void;
}

const EMOTIONAL_TONES: EmotionalTone[] = ["professional", "dramatic", "friendly", "urgent", "calm"];
const TRANSITIONS: TransitionType[] = ["none", "fade", "dissolve", "zoom", "slide"];

function SceneCard({
    scene,
    index,
    isExpanded,
    isPlaying,
    isRegenerating,
    imageUrl,
    audioUrl,
    onToggleExpand,
    onChange,
    onDelete,
    onPlayNarration,
    onRegenerateNarration,
    onDownloadAudio,
}: SceneCardProps) {
    const handleDownloadAudio = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (audioUrl) {
            const a = document.createElement('a');
            a.href = audioUrl;
            a.download = `${scene.name.replace(/\s+/g, '_')}_narration.wav`;
            a.click();
        }
    };

    return (
        <Reorder.Item
            value={scene}
            className="glass-panel rounded-xl overflow-hidden mb-3"
        >
            {/* Header */}
            <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={onToggleExpand}
            >
                <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />

                <div className="w-8 h-8 rounded-full bg-linear-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-sm font-bold">
                    {index + 1}
                </div>

                <div className="flex-1 min-w-0">
                    <Input
                        value={scene.name}
                        onChange={(e) => onChange({ name: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                            "bg-transparent border-none p-0 h-auto text-base font-medium focus:ring-0",
                            isRTL(scene.name) && "text-right"
                        )}
                        dir={getTextDirection(scene.name)}
                        placeholder="Scene name... | اسم المشهد..."
                    />
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Clock className="w-4 h-4" />
                    <Input
                        type="number"
                        value={scene.duration}
                        onChange={(e) => onChange({ duration: parseInt(e.target.value) || 0 })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-16 bg-white/5 border-white/10 h-7 text-center rounded-md"
                        min={1}
                        max={120}
                    />
                    <span>sec</span>
                </div>

                <div className="flex items-center gap-1">
                    {onPlayNarration && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); onPlayNarration(); }}
                            className="h-8 w-8 p-0"
                        >
                            {isPlaying ? (
                                <Pause className="w-4 h-4 text-cyan-400" />
                            ) : (
                                <Play className="w-4 h-4" />
                            )}
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="h-8 w-8 p-0 hover:text-red-400"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                    {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                </div>
            </div>

            {/* Expanded content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 pt-0 space-y-4 border-t border-white/10">
                            {/* Generated Image Preview */}
                            {imageUrl && (
                                <div className="mb-4">
                                    <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                                        <Eye className="w-4 h-4" />
                                        Generated Image
                                    </label>
                                    <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900">
                                        <img
                                            src={imageUrl}
                                            alt={scene.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Audio Preview & Download */}
                            {audioUrl && (
                                <div className="mb-4">
                                    <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                                        <Mic className="w-4 h-4" />
                                        Narration Audio
                                    </label>
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/30">
                                        <audio
                                            src={audioUrl}
                                            controls
                                            className="flex-1 h-8"
                                        />
                                        <Button
                                            size="sm"
                                            variant="glass"
                                            onClick={handleDownloadAudio}
                                            className="gap-2"
                                        >
                                            <Download className="w-4 h-4" />
                                            Download
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Visual Description */}
                            <div>
                                <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                                    <Image className="w-4 h-4" />
                                    Visual Description
                                </label>
                                <Textarea
                                    value={scene.visualDescription}
                                    onChange={(e) => onChange({ visualDescription: e.target.value })}
                                    placeholder="Describe what should be shown visually... | صف ما يجب عرضه بصريًا..."
                                    className={cn(
                                        "min-h-[80px] bg-white/5 border-white/10 focus:border-primary/50 rounded-xl",
                                        isRTL(scene.visualDescription) && "text-right"
                                    )}
                                    dir={getTextDirection(scene.visualDescription)}
                                />
                                <p className={cn(
                                    "text-xs text-slate-500 mt-1",
                                    isRTL(scene.visualDescription) && "text-right"
                                )}>
                                    {scene.visualDescription.length}/200 characters
                                </p>
                            </div>

                            {/* Narration Script */}
                            <div>
                                <label className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                                    <Mic className="w-4 h-4" />
                                    Narration Script
                                </label>
                                <Textarea
                                    value={scene.narrationScript}
                                    onChange={(e) => onChange({ narrationScript: e.target.value })}
                                    placeholder="Write what should be spoken... | اكتب ما يجب قوله..."
                                    className={cn(
                                        "min-h-[100px] bg-white/5 border-white/10 focus:border-primary/50 rounded-xl",
                                        isRTL(scene.narrationScript) && "text-right"
                                    )}
                                    dir={getTextDirection(scene.narrationScript)}
                                />
                                <div className={cn(
                                    "flex items-center justify-between mt-2",
                                    isRTL(scene.narrationScript) && "flex-row-reverse"
                                )}>
                                    <p className="text-xs text-slate-500">
                                        ~{Math.ceil(scene.narrationScript.split(/\s+/).length / 2.5)} seconds of speech
                                    </p>
                                    {onRegenerateNarration && (
                                        <Button
                                            size="sm"
                                            variant="glass"
                                            onClick={onRegenerateNarration}
                                            disabled={isRegenerating}
                                            className="gap-2 h-8"
                                        >
                                            {isRegenerating ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    <RefreshCw className="w-3 h-3" />
                                                    Regenerate TTS
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Tone and Transition */}
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-sm text-slate-400 mb-2 block">Emotional Tone</label>
                                    <Select
                                        value={scene.emotionalTone}
                                        onValueChange={(v) => onChange({ emotionalTone: v as EmotionalTone })}
                                    >
                                        <SelectTrigger className="glass-button w-full border-white/10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {EMOTIONAL_TONES.map((tone) => (
                                                <SelectItem key={tone} value={tone}>
                                                    {tone.charAt(0).toUpperCase() + tone.slice(1)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex-1">
                                    <label className="text-sm text-slate-400 mb-2 block">Transition</label>
                                    <Select
                                        value={scene.transitionTo || "dissolve"}
                                        onValueChange={(v) => onChange({ transitionTo: v as TransitionType })}
                                    >
                                        <SelectTrigger className="glass-button w-full border-white/10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TRANSITIONS.map((t) => (
                                                <SelectItem key={t} value={t}>
                                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Reorder.Item>
    );
}

export function SceneEditor({
    scenes,
    onChange,
    onPlayNarration,
    onRegenerateNarration,
    playingSceneId,
    regeneratingSceneId,
    visuals = {},
    narrationUrls = {},
    className,
}: SceneEditorProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleSceneChange = useCallback((id: string, updates: Partial<Scene>) => {
        onChange(scenes.map(s => s.id === id ? { ...s, ...updates } : s));
    }, [scenes, onChange]);

    const handleDelete = useCallback((id: string) => {
        onChange(scenes.filter(s => s.id !== id));
    }, [scenes, onChange]);

    const handleAddScene = useCallback(() => {
        const newScene: Scene = {
            id: `scene-${Date.now()}`,
            name: `Scene ${scenes.length + 1}`,
            duration: 15,
            visualDescription: "",
            narrationScript: "",
            emotionalTone: "friendly",
            transitionTo: "dissolve",
        };
        onChange([...scenes, newScene]);
        setExpandedId(newScene.id);
    }, [scenes, onChange]);

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    return (
        <div className={cn("space-y-4", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Scenes</h3>
                    <p className="text-sm text-slate-400">
                        {scenes.length} scenes • {Math.floor(totalDuration / 60)}:{String(totalDuration % 60).padStart(2, '0')} total
                    </p>
                </div>
                <Button onClick={handleAddScene} size="sm" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Scene
                </Button>
            </div>

            {/* Scene list */}
            <Reorder.Group
                axis="y"
                values={scenes}
                onReorder={onChange}
                className="space-y-2"
            >
                {scenes.map((scene, index) => (
                    <SceneCard
                        key={scene.id}
                        scene={scene}
                        index={index}
                        isExpanded={expandedId === scene.id}
                        isPlaying={playingSceneId === scene.id}
                        isRegenerating={regeneratingSceneId === scene.id}
                        imageUrl={visuals[scene.id]}
                        audioUrl={narrationUrls[scene.id]}
                        onToggleExpand={() => setExpandedId(expandedId === scene.id ? null : scene.id)}
                        onChange={(updates) => handleSceneChange(scene.id, updates)}
                        onDelete={() => handleDelete(scene.id)}
                        onPlayNarration={onPlayNarration ? () => onPlayNarration(scene.id) : undefined}
                        onRegenerateNarration={onRegenerateNarration ? () => onRegenerateNarration(scene.id) : undefined}
                    />
                ))}
            </Reorder.Group>

            {scenes.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                    <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No scenes yet. Click "Add Scene" to get started.</p>
                </div>
            )}
        </div>
    );
}

export default SceneEditor;
