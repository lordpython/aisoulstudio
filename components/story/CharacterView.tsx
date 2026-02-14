import React from 'react';
import type { CharacterProfile, ConsistencyReport } from '@/types';
import { ShieldCheck, AlertCircle, UserPlus, Trash2, RotateCcw, ImagePlus, User, Sparkles } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';

interface CharacterViewProps {
    characters: CharacterProfile[];
    reports?: Record<string, ConsistencyReport>;
    onVerify?: (name: string) => void;
    isProcessing?: boolean;
    onAdd?: () => void;
    onEdit?: (character: CharacterProfile) => void;
    onDelete?: (characterId: string) => void;
    onGenerateImage?: (characterId: string) => void;
}

export const CharacterView: React.FC<CharacterViewProps> = ({
    characters,
    reports = {},
    onVerify,
    isProcessing = false,
    onAdd,
    onEdit,
    onDelete,
    onGenerateImage
}) => {
    const { t } = useLanguage();

    return (
        <div className="flex flex-col h-full bg-black">
            {/* Header */}
            <div className="flex justify-between items-center bg-zinc-950 border-b border-zinc-800 px-8 py-5">
                <div className="flex items-center gap-6">
                    <div>
                        <h2 className="font-sans text-xl font-medium tracking-tight text-zinc-100">
                            Characters
                        </h2>
                        <p className="text-zinc-500 text-xs mt-1">
                            Story ensemble
                        </p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-sm px-2 py-1">
                        <span className="font-mono text-xs text-blue-400">
                            {characters.length} MEMBER{characters.length !== 1 ? 'S' : ''}
                        </span>
                    </div>
                </div>
            </div>

            {/* Grid Content */}
            <div className="flex-1 p-8 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {characters.map((char) => {
                        const report = reports[char.name];
                        return (
                            <div
                                key={char.id}
                                className="group relative bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden hover:-translate-y-0.5 transition-transform duration-200 ease-out"
                            >
                                {/* Portrait Area - 2:3 Aspect */}
                                <div className="aspect-[2/3] w-full relative overflow-hidden bg-zinc-950">
                                    {char.referenceImageUrl ? (
                                        <img
                                            src={char.referenceImageUrl}
                                            alt={char.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                            <User className="w-16 h-16 text-zinc-800" />
                                            <span className="font-mono text-[10px] text-zinc-700 uppercase tracking-widest">
                                                No Portrait
                                            </span>
                                        </div>
                                    )}

                                    {/* Name Plate */}
                                    <div className="absolute bottom-0 left-0 right-0 bg-zinc-950/90 p-3 border-t border-zinc-800">
                                        <h3 className="font-sans text-base font-medium text-zinc-100 leading-tight" dir="auto">
                                            {char.name}
                                        </h3>
                                        <p className="font-mono text-xs text-blue-400 mt-0.5" dir="auto">
                                            {char.role || 'Character'}
                                        </p>
                                    </div>

                                    {/* Consistency Score Badge */}
                                    {report && (
                                        <div className="absolute top-3 left-3">
                                            <div className={`
                                                px-2 py-1 rounded-sm
                                                font-mono text-[10px] uppercase tracking-wider
                                                flex items-center gap-1.5
                                                backdrop-blur-md border
                                                ${report.isConsistent
                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                    : 'bg-orange-500/10 border-orange-500/30 text-orange-400'}
                                            `}>
                                                {report.isConsistent
                                                    ? <ShieldCheck className="w-3 h-3" />
                                                    : <AlertCircle className="w-3 h-3" />
                                                }
                                                <span>{Math.round(report.score)}%</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Hover Actions Overlay */}
                                    <div className="
                                        absolute inset-0
                                        bg-black/80
                                        opacity-0 group-hover:opacity-100
                                        transition-opacity duration-200 ease-out
                                        flex items-center justify-center gap-3
                                    ">
                                        {onVerify && (
                                            <button
                                                onClick={() => onVerify(char.name)}
                                                disabled={isProcessing}
                                                className="rounded-sm bg-zinc-900 border border-zinc-800 p-2.5 text-zinc-400 hover:text-blue-400 transition-colors duration-200"
                                                title={t('story.verifyContinuity')}
                                            >
                                                {isProcessing
                                                    ? <div className="w-5 h-5 rounded-sm border-2 border-zinc-700 border-t-blue-400 animate-spin" />
                                                    : <RotateCcw className="w-5 h-5" />
                                                }
                                            </button>
                                        )}
                                        {onGenerateImage && (
                                            <button
                                                onClick={() => onGenerateImage(char.id)}
                                                disabled={isProcessing}
                                                className="bg-blue-500 text-white rounded-sm p-2.5 transition-colors duration-200"
                                                title={char.referenceImageUrl ? "Regenerate Portrait" : "Generate Portrait"}
                                            >
                                                {isProcessing
                                                    ? <div className="w-5 h-5 rounded-sm border-2 border-white/30 border-t-white animate-spin" />
                                                    : <ImagePlus className="w-5 h-5" />
                                                }
                                            </button>
                                        )}
                                        {onEdit && (
                                            <button
                                                onClick={() => onEdit(char)}
                                                className="rounded-sm bg-zinc-900 border border-zinc-800 p-2.5 text-zinc-400 hover:text-blue-400 transition-colors duration-200"
                                            >
                                                <Sparkles className="w-5 h-5" />
                                            </button>
                                        )}
                                        {onDelete && (
                                            <button
                                                onClick={() => onDelete(char.id)}
                                                className="rounded-sm p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors duration-200"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Add New Card */}
                    {onAdd && (
                        <button
                            onClick={onAdd}
                            className="
                                group relative
                                flex flex-col items-center justify-center
                                aspect-[2/3]
                                bg-zinc-950
                                rounded-sm
                                border border-dashed border-zinc-800
                                hover:border-blue-500/50
                                hover:-translate-y-0.5
                                transition-all duration-200 ease-out
                            "
                        >
                            <div className="
                                w-16 h-16 rounded-sm
                                bg-zinc-900 border border-zinc-800
                                flex items-center justify-center
                                mb-4
                            ">
                                <UserPlus className="w-7 h-7 text-zinc-500 group-hover:text-zinc-300 transition-colors duration-200" />
                            </div>
                            <span className="font-sans text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors duration-200">
                                Add Character
                            </span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CharacterView;
