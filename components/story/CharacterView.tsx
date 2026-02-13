import React from 'react';
import { motion } from 'framer-motion';
import type { CharacterProfile, ConsistencyReport } from '@/types';
import { ShieldCheck, AlertCircle, UserPlus, Trash2, RotateCcw, ImagePlus, User, Sparkles } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';
import { staggerContainer, staggerItem } from '@/lib/cinematicMotion';

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
        <div className="flex flex-col h-full bg-[var(--cinema-void)]">
            {/* Cinematic Header */}
            <div className="flex justify-between items-center px-8 py-6 border-b border-[var(--cinema-silver)]/5 bg-[var(--cinema-celluloid)]/50">
                <div className="flex items-center gap-6">
                    <div>
                        <h2 className="font-display text-3xl text-[var(--cinema-silver)] tracking-tight">
                            THE CAST
                        </h2>
                        <p className="font-script italic text-[var(--cinema-silver)]/50 text-sm mt-1">
                            Your story's ensemble
                        </p>
                    </div>
                    <div className="px-3 py-1.5 rounded bg-[var(--cinema-spotlight)]/10 border border-[var(--cinema-spotlight)]/20">
                        <span className="font-mono text-xs text-[var(--cinema-spotlight)]">
                            {characters.length} MEMBER{characters.length !== 1 ? 'S' : ''}
                        </span>
                    </div>
                </div>
            </div>

            {/* Grid Content */}
            <div className="flex-1 p-8 overflow-y-auto">
                <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
                >
                    {characters.map((char) => {
                        const report = reports[char.name];
                        return (
                            <motion.div
                                key={char.id}
                                variants={staggerItem}
                                whileHover={{ y: -8, scale: 1.02 }}
                                className="group relative bg-[var(--cinema-celluloid)] rounded-lg overflow-hidden border border-[var(--cinema-silver)]/10 hover:border-[var(--cinema-spotlight)]/30 transition-all duration-500 shadow-editorial"
                            >
                                {/* Headshot Image Area - 2:3 Aspect */}
                                <div className="aspect-[2/3] w-full relative overflow-hidden bg-[var(--cinema-void)]">
                                    {char.referenceImageUrl ? (
                                        <img
                                            src={char.referenceImageUrl}
                                            alt={char.name}
                                            className="
                                                w-full h-full object-cover
                                                grayscale-[30%] group-hover:grayscale-0
                                                group-hover:scale-105
                                                transition-all duration-700
                                            "
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                            <User className="w-16 h-16 text-[var(--cinema-silver)]/10" />
                                            <span className="font-mono text-[10px] text-[var(--cinema-silver)]/20 uppercase tracking-widest">
                                                No Portrait
                                            </span>
                                        </div>
                                    )}

                                    {/* Vignette Overlay */}
                                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--cinema-void)_100%)] opacity-70" />

                                    {/* Bottom Gradient for Name */}
                                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--cinema-void)] via-[var(--cinema-void)]/80 to-transparent" />

                                    {/* Name Plate */}
                                    <div className="absolute bottom-0 left-0 right-0 p-4">
                                        <h3 className="font-display text-xl text-[var(--cinema-silver)] leading-tight" dir="auto">
                                            {char.name}
                                        </h3>
                                        <p className="font-script italic text-[var(--cinema-spotlight)] text-sm mt-1" dir="auto">
                                            {char.role || 'Character'}
                                        </p>
                                    </div>

                                    {/* Consistency Score Badge - Film Strip Style */}
                                    {report && (
                                        <div className="absolute top-3 left-3">
                                            <div className={`
                                                px-2 py-1 rounded
                                                text-[10px] font-mono uppercase tracking-wider
                                                flex items-center gap-1.5
                                                backdrop-blur-md border
                                                ${report.isConsistent
                                                    ? 'bg-emerald-900/80 text-emerald-300 border-emerald-700/50'
                                                    : 'bg-amber-900/80 text-amber-300 border-amber-700/50'}
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
                                        bg-[var(--cinema-void)]/80
                                        opacity-0 group-hover:opacity-100
                                        transition-opacity duration-300
                                        flex items-center justify-center gap-3
                                    ">
                                        {onVerify && (
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => onVerify(char.name)}
                                                disabled={isProcessing}
                                                className="
                                                    p-3 rounded-full
                                                    bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/20
                                                    text-[var(--cinema-silver)] hover:text-[var(--cinema-spotlight)]
                                                    transition-colors
                                                "
                                                title={t('story.verifyContinuity')}
                                            >
                                                {isProcessing
                                                    ? <div className="w-5 h-5 rounded-full border-2 border-[var(--cinema-silver)]/30 border-t-[var(--cinema-spotlight)] animate-spin" />
                                                    : <RotateCcw className="w-5 h-5" />
                                                }
                                            </motion.button>
                                        )}
                                        {onGenerateImage && (
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => onGenerateImage(char.id)}
                                                disabled={isProcessing}
                                                className="
                                                    p-3 rounded-full
                                                    btn-cinematic
                                                "
                                                title={char.referenceImageUrl ? "Regenerate Portrait" : "Generate Portrait"}
                                            >
                                                {isProcessing
                                                    ? <div className="w-5 h-5 rounded-full border-2 border-[var(--cinema-silver)]/30 border-t-[var(--cinema-spotlight)] animate-spin" />
                                                    : <ImagePlus className="w-5 h-5" />
                                                }
                                            </motion.button>
                                        )}
                                        {onEdit && (
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => onEdit(char)}
                                                className="
                                                    p-3 rounded-full
                                                    bg-[var(--cinema-celluloid)] border border-[var(--cinema-silver)]/20
                                                    text-[var(--cinema-silver)] hover:text-[var(--cinema-spotlight)]
                                                    transition-colors
                                                "
                                            >
                                                <Sparkles className="w-5 h-5" />
                                            </motion.button>
                                        )}
                                        {onDelete && (
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => onDelete(char.id)}
                                                className="
                                                    p-3 rounded-full
                                                    bg-[var(--cinema-velvet)]/20 border border-[var(--cinema-velvet)]/30
                                                    text-[var(--cinema-velvet)] hover:bg-[var(--cinema-velvet)]/40
                                                    transition-colors
                                                "
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </motion.button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}

                    {/* Add New Card - Cinematic Style */}
                    {onAdd && (
                        <motion.button
                            variants={staggerItem}
                            onClick={onAdd}
                            whileHover={{ y: -8, scale: 1.02 }}
                            className="
                                group relative
                                flex flex-col items-center justify-center
                                aspect-[2/3]
                                bg-[var(--cinema-celluloid)]/30
                                rounded-lg
                                border-2 border-dashed border-[var(--cinema-silver)]/10
                                hover:border-[var(--cinema-spotlight)]/40
                                hover:bg-[var(--cinema-celluloid)]/50
                                transition-all duration-300
                            "
                        >
                            <motion.div
                                whileHover={{ rotate: 90 }}
                                transition={{ duration: 0.3 }}
                                className="
                                    w-16 h-16 rounded-full
                                    bg-[var(--cinema-void)]
                                    border border-[var(--cinema-silver)]/10
                                    group-hover:border-[var(--cinema-spotlight)]/30
                                    flex items-center justify-center
                                    mb-4 transition-colors
                                "
                            >
                                <UserPlus className="w-7 h-7 text-[var(--cinema-silver)]/30 group-hover:text-[var(--cinema-spotlight)] transition-colors" />
                            </motion.div>
                            <span className="font-display text-lg text-[var(--cinema-silver)]/40 group-hover:text-[var(--cinema-silver)] transition-colors">
                                Add to Cast
                            </span>
                            <span className="font-script italic text-sm text-[var(--cinema-silver)]/20 mt-1">
                                New character
                            </span>
                        </motion.button>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default CharacterView;
