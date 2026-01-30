import React from 'react';
import type { ShotlistEntry, ScreenplayScene } from '@/types';
import { CheckCircle2, ImageIcon, Loader2 } from 'lucide-react';

interface StoryboardViewProps {
    shots: ShotlistEntry[];
    scenes?: ScreenplayScene[];
    scenesWithVisuals?: string[];
    onGenerateVisuals?: (sceneIndex?: number) => void;
    isProcessing?: boolean;
}

export const StoryboardView: React.FC<StoryboardViewProps> = ({
    shots,
    scenes = [],
    scenesWithVisuals = [],
    onGenerateVisuals,
    isProcessing = false,
}) => {
    if (shots.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                <ImageIcon className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">Storyboard hasn't been generated yet.</p>
                <p className="text-sm mt-2">Generate shots first, then proceed to create visuals.</p>
            </div>
        );
    }

    // Group shots by scene
    const shotsByScene = new Map<string, ShotlistEntry[]>();
    shots.forEach(shot => {
        const sceneShots = shotsByScene.get(shot.sceneId) || [];
        sceneShots.push(shot);
        shotsByScene.set(shot.sceneId, sceneShots);
    });

    // If we have scene data, render grouped by scene
    if (scenes.length > 0) {
        return (
            <div className="flex flex-col gap-8 p-6">
                {scenes.map((scene, sceneIndex) => {
                    const sceneShots = shotsByScene.get(scene.id) || [];
                    const hasVisuals = scenesWithVisuals.includes(scene.id);
                    const shotsWithImages = sceneShots.filter(s => s.imageUrl).length;
                    const totalShots = sceneShots.length;

                    return (
                        <div key={scene.id} className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
                            {/* Scene Header */}
                            <div className="px-6 py-4 bg-zinc-900/50 border-b border-zinc-800 flex items-center justify-between">
                                <div>
                                    <div className="text-blue-500 font-mono text-xs mb-1">SCENE {scene.sceneNumber}</div>
                                    <div className="text-white font-bold" dir="auto">{scene.heading}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {hasVisuals ? (
                                        <span className="flex items-center gap-1.5 text-sm text-green-400">
                                            <CheckCircle2 className="w-4 h-4" />
                                            {shotsWithImages}/{totalShots} visuals
                                        </span>
                                    ) : onGenerateVisuals ? (
                                        <button
                                            onClick={() => onGenerateVisuals(sceneIndex)}
                                            disabled={isProcessing}
                                            className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {isProcessing ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    <ImageIcon className="w-3 h-3" />
                                                    Generate Visuals
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <span className="text-xs text-zinc-500">
                                            {totalShots} shots awaiting visuals
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Shots Grid */}
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {sceneShots.map((shot) => (
                                    <ShotCard key={shot.id} shot={shot} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // Fallback: render all shots in a flat grid (original behavior)
    return (
        <div className="flex flex-col gap-8 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {shots.map((shot) => (
                    <ShotCard key={shot.id} shot={shot} />
                ))}
            </div>
        </div>
    );
};

// Extracted shot card component for reuse
const ShotCard: React.FC<{ shot: ShotlistEntry }> = ({ shot }) => (
    <div
        className="flex flex-col gap-4 bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 hover:bg-zinc-900/50 transition-colors"
    >
        <div className="flex justify-between items-center">
            <span className="text-xs font-mono text-blue-500 font-bold uppercase tracking-widest">
                Shot #{shot.shotNumber}
            </span>
            <span className="px-2 py-1 bg-zinc-800 rounded text-[10px] text-zinc-400 font-bold uppercase">
                {shot.cameraAngle}
            </span>
        </div>

        <div className="aspect-video w-full bg-zinc-800 rounded-lg overflow-hidden flex items-center justify-center relative group">
            {shot.imageUrl ? (
                <img
                    src={shot.imageUrl}
                    alt={shot.description}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
            ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-600">
                    <ImageIcon className="w-8 h-8 opacity-20" />
                    <span className="text-[10px] uppercase tracking-widest font-bold">Awaiting Generation</span>
                </div>
            )}

            <div className="absolute top-2 right-2 flex gap-1">
                {shot.movement !== 'Static' && (
                    <span className="px-1.5 py-0.5 bg-black/50 backdrop-blur-md rounded text-[9px] text-white font-bold uppercase tracking-tighter">
                        {shot.movement}
                    </span>
                )}
            </div>
        </div>

        <div className="flex flex-col gap-1">
            <h4 className="text-[10px] uppercase font-bold text-zinc-500">Action</h4>
            <p className="text-sm text-zinc-200 line-clamp-3 leading-relaxed" dir="auto">
                {shot.description}
            </p>
        </div>
    </div>
);

export default StoryboardView;
