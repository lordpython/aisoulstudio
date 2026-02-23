/**
 * LockWarningDialog.tsx
 * Warning dialog for screenplay locking with cost breakdown.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Film, X, Info } from 'lucide-react';
import { useLanguage } from '@/i18n/useLanguage';

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
    const { t } = useLanguage();

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden"
                    >
                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-zinc-600 hover:text-zinc-300 transition-colors duration-200 z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="relative p-8">
                            {/* Icon */}
                            <div className="flex justify-center mb-6">
                                <div className="relative">
                                    <div className="w-16 h-16 rounded-sm bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
                                        <Film className="w-8 h-8 text-orange-400" />
                                    </div>
                                    {/* Lock badge */}
                                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-sm bg-blue-500 flex items-center justify-center">
                                        <Lock className="w-3.5 h-3.5 text-white" />
                                    </div>
                                </div>
                            </div>

                            {/* Title */}
                            <h2 className="font-sans text-2xl font-medium tracking-tight text-zinc-100 text-center mb-3">
                                {t('story.lock_dialog.lockTheScript')}
                            </h2>

                            {/* Warning Message */}
                            <p className="text-zinc-500 text-sm text-center mb-8">
                                {t('story.lock_dialog.scriptFinalized')}
                            </p>

                            {/* Cost Breakdown */}
                            <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-5 mb-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                                        {t('story.lock_dialog.productionEstimate')}
                                    </span>
                                    <div className="flex-1 h-px bg-zinc-800" />
                                </div>

                                <div className="space-y-3">
                                    {sceneCount > 0 && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-zinc-500 text-sm">{t('story.scenes')}</span>
                                            <span className="font-mono text-zinc-200">{sceneCount}</span>
                                        </div>
                                    )}
                                    {estimatedShots > 0 && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-zinc-500 text-sm">{t('story.lock_dialog.estimatedShots')}</span>
                                            <span className="font-mono text-zinc-200">~{estimatedShots}</span>
                                        </div>
                                    )}
                                    <div className="h-px bg-zinc-800 my-3" />
                                    <div className="flex justify-between items-center">
                                        <span className="text-zinc-500 text-sm">{t('story.lock_dialog.totalBudget')}</span>
                                        <span className="font-sans text-xl text-blue-400">
                                            ${estimatedCost.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Info Note */}
                            <div className="flex items-start gap-3 mb-8 p-4 bg-blue-500/5 border border-blue-500/20 rounded-sm">
                                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                                <p className="text-zinc-500 text-sm">
                                    {t('story.lock_dialog.shotBreakdownInfo')}
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-4">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-6 py-3.5 rounded-sm text-zinc-300 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 transition-colors duration-200"
                                >
                                    {t('story.lock_dialog.backToEdit')}
                                </button>
                                <button
                                    onClick={onConfirmLock}
                                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-sm bg-blue-500 hover:bg-blue-600 text-white font-mono text-sm font-medium transition-colors duration-200"
                                >
                                    <Lock className="w-4 h-4" />
                                    {t('story.lock_dialog.lockAndBegin')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default LockWarningDialog;
