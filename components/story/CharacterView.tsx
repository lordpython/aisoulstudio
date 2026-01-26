import React from 'react';
import type { CharacterProfile, ConsistencyReport } from '@/types';
import { ShieldCheck, AlertCircle, Lightbulb } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';

interface CharacterViewProps {
    characters: CharacterProfile[];
    reports?: Record<string, ConsistencyReport>;
    onVerify?: (name: string) => void;
    isProcessing?: boolean;
}

export const CharacterView: React.FC<CharacterViewProps> = ({
    characters,
    reports = {},
    onVerify,
    isProcessing = false
}) => {
    const { t } = useLanguage();

    if (characters.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                <p>{t('story.charactersEmpty')}</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {characters.map((char) => {
                const report = reports[char.name];

                return (
                    <div
                        key={char.id}
                        className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-all group flex flex-col"
                    >
                        {char.referenceImageUrl ? (
                            <div className="aspect-square w-full relative overflow-hidden">
                                <img
                                    src={char.referenceImageUrl}
                                    alt={char.name}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent flex items-end p-4">
                                    <div>
                                        <h3 className="text-white font-bold text-lg">{char.name}</h3>
                                        <p className="text-blue-400 text-xs uppercase tracking-widest">{char.role}</p>
                                    </div>
                                </div>

                                {report && (
                                    <div className="absolute top-3 right-3">
                                        <div className={`
                                            px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-md
                                            ${report.isConsistent ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}
                                        `}>
                                            {report.isConsistent ? <ShieldCheck className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                            {t('story.continuity')}: {report.score}%
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="aspect-square w-full bg-zinc-800 flex items-center justify-center p-4 text-center">
                                <div>
                                    <h3 className="text-white font-bold text-lg">{char.name}</h3>
                                    <p className="text-blue-400 text-xs uppercase tracking-widest mb-2">{char.role}</p>
                                    <div className="h-2 w-full bg-zinc-700 rounded animate-pulse" />
                                </div>
                            </div>
                        )}

                        <div className="p-4 flex-1">
                            <h4 className="text-xs uppercase font-bold text-zinc-500 mb-2">{t('story.visualDescription')}</h4>
                            <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                                {char.visualDescription}
                            </p>

                            {report && (
                                <div className="mt-4 pt-4 border-t border-zinc-800/50 space-y-3">
                                    {report.issues.length > 0 && (
                                        <div className="space-y-1">
                                            <div className="text-[10px] uppercase font-black text-amber-500 flex items-center gap-1">
                                                <AlertCircle className="w-2.5 h-2.5" /> {t('story.issuesFound')}
                                            </div>
                                            <ul className="text-xs text-zinc-400 list-disc list-inside">
                                                {report.issues.map((issue) => (
                                                    <li key={issue}>{issue}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {report.suggestions.length > 0 && (
                                        <div className="space-y-1">
                                            <div className="text-[10px] uppercase font-black text-blue-400 flex items-center gap-1">
                                                <Lightbulb className="w-2.5 h-2.5" /> {t('story.suggestions')}
                                            </div>
                                            <ul className="text-xs text-zinc-400 list-disc list-inside italic">
                                                {report.suggestions.map((s) => (
                                                    <li key={s}>{s}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-3 bg-zinc-900/80 border-t border-zinc-800">
                            <button
                                onClick={() => onVerify?.(char.name)}
                                disabled={isProcessing}
                                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                            >
                                {isProcessing ? (
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                )}
                                {isProcessing ? t('story.verifying') : t('story.verifyContinuity')}
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default CharacterView;
