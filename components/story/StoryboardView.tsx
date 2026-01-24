import React from 'react';
import type { ShotlistEntry } from '@/types';

interface StoryboardViewProps {
    shots: ShotlistEntry[];
}

export const StoryboardView: React.FC<StoryboardViewProps> = ({ shots }) => {
    if (shots.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                <p>Storyboard hasn't been generated yet.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {shots.map((shot) => (
                    <div
                        key={shot.id}
                        className="flex flex-col gap-4 bg-zinc-900/30 border border-zinc-800 rounded-2xl p-4 hover:bg-zinc-900/50 transition-colors"
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
                                    <svg className="w-8 h-8 opacity-20" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                                    </svg>
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
                            <p className="text-sm text-zinc-200 line-clamp-3 leading-relaxed">
                                {shot.description}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StoryboardView;
