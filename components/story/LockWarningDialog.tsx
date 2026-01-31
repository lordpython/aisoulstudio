/**
 * LockWarningDialog.tsx
 * Cinematic warning dialog for screenplay locking.
 * Velvet-red border, dramatic presentation.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Film, X, Info } from 'lucide-react';
import { backdropFade, modalScale } from '@/lib/cinematicMotion';

interface LockWarningDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirmLock: () => void;
    estimatedCost: number;
    sceneCount?: number;
    estimatedShots?: number;
}

export const LockWarningDialog: React.FC<LockWarningDialogProps> = ({
    isOpen,
    onClose,
    onConfirmLock,
    estimatedCost,
    sceneCount = 0,
    estimatedShots = 0,
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop with vignette */}
                    <motion.div
                        variants={backdropFade}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="absolute inset-0 bg-[var(--cinema-void)]/90 backdrop-blur-xl"
                        onClick={onClose}
                    >
                        {/* Vignette */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--cinema-void)_100%)]" />
                    </motion.div>

                    {/* Modal */}
                    <motion.div
                        variants={modalScale}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="relative w-full max-w-md mx-4 bg-[var(--cinema-celluloid)] border-2 border-[var(--cinema-velvet)] rounded-lg shadow-cinematic overflow-hidden"
                    >
                        {/* Film grain overlay */}
                        <div className="absolute inset-0 opacity-5 bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20200%20200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter%20id%3D%22noise%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.85%22%20numOctaves%3D%224%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23noise)%22%2F%3E%3C%2Fsvg%3E')] pointer-events-none" />

                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-[var(--cinema-silver)]/40 hover:text-[var(--cinema-silver)] hover:bg-[var(--cinema-void)]/50 rounded-lg transition-all z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="relative p-8">
                            {/* Icon */}
                            <div className="flex justify-center mb-6">
                                <div className="relative">
                                    <div className="w-20 h-20 rounded-full bg-[var(--cinema-velvet)]/20 border-2 border-[var(--cinema-velvet)]/40 flex items-center justify-center">
                                        <Film className="w-10 h-10 text-[var(--cinema-velvet)]" />
                                    </div>
                                    {/* Lock badge */}
                                    <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[var(--cinema-spotlight)] flex items-center justify-center shadow-lg">
                                        <Lock className="w-4 h-4 text-[var(--cinema-void)]" />
                                    </div>
                                </div>
                            </div>

                            {/* Title */}
                            <h2 className="font-display text-3xl text-[var(--cinema-silver)] text-center mb-3 tracking-tight">
                                LOCK THE SCRIPT
                            </h2>

                            {/* Warning Message */}
                            <p className="font-script italic text-[var(--cinema-silver)]/60 text-center text-lg mb-8">
                                Your screenplay will be finalized and production begins...
                            </p>

                            {/* Cost Breakdown - Cinematic Style */}
                            <div className="bg-[var(--cinema-void)]/50 border border-[var(--cinema-silver)]/10 rounded-lg p-5 mb-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-px bg-[var(--cinema-spotlight)]/30" />
                                    <span className="font-mono text-[10px] text-[var(--cinema-silver)]/40 uppercase tracking-[0.2em]">
                                        Production Estimate
                                    </span>
                                    <div className="flex-1 h-px bg-[var(--cinema-spotlight)]/30" />
                                </div>

                                <div className="space-y-3">
                                    {sceneCount > 0 && (
                                        <div className="flex justify-between items-center">
                                            <span className="font-script italic text-[var(--cinema-silver)]/60">Scenes</span>
                                            <span className="font-mono text-[var(--cinema-silver)]">{sceneCount}</span>
                                        </div>
                                    )}
                                    {estimatedShots > 0 && (
                                        <div className="flex justify-between items-center">
                                            <span className="font-script italic text-[var(--cinema-silver)]/60">Estimated Shots</span>
                                            <span className="font-mono text-[var(--cinema-silver)]">~{estimatedShots}</span>
                                        </div>
                                    )}
                                    <div className="h-px bg-[var(--cinema-silver)]/10 my-3" />
                                    <div className="flex justify-between items-center">
                                        <span className="font-display text-[var(--cinema-silver)]">Total Budget</span>
                                        <span className="font-display text-2xl text-[var(--cinema-spotlight)]">
                                            ${estimatedCost.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Info Note */}
                            <div className="flex items-start gap-3 mb-8 p-4 bg-[var(--cinema-spotlight)]/5 border border-[var(--cinema-spotlight)]/20 rounded-lg">
                                <Info className="w-4 h-4 text-[var(--cinema-spotlight)] mt-0.5 shrink-0" />
                                <p className="font-script italic text-sm text-[var(--cinema-silver)]/60">
                                    Shot breakdowns will be generated and visuals prepared for production.
                                    Final costs may vary based on shot complexity.
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-4">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onClose}
                                    className="flex-1 px-6 py-3.5 rounded-lg font-display text-[var(--cinema-silver)] bg-[var(--cinema-void)] border border-[var(--cinema-silver)]/20 hover:border-[var(--cinema-silver)]/40 transition-all"
                                >
                                    Back to Edit
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onConfirmLock}
                                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg btn-cinematic font-display"
                                >
                                    <Lock className="w-4 h-4" />
                                    Lock & Begin
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default LockWarningDialog;
