/**
 * LockWarningDialog.tsx
 *
 * Warning dialog that appears before shot breakdown generation.
 * Informs user that the story will be locked and shows estimated generation cost.
 */

import React from 'react';
import { Lock, AlertTriangle, X } from 'lucide-react';

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
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md mx-4 bg-zinc-900 border-2 border-amber-500/50 rounded-2xl shadow-2xl shadow-amber-500/10 overflow-hidden">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-6">
                    {/* Warning Icon */}
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                            <AlertTriangle className="w-8 h-8 text-amber-500" />
                        </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-xl font-bold text-white text-center mb-2">
                        Lock Your Screenplay?
                    </h2>

                    {/* Warning Message */}
                    <p className="text-zinc-400 text-sm text-center mb-6">
                        Your story will be <span className="text-amber-400 font-semibold">locked</span> and cannot be edited after this point.
                        Shot breakdown and image generation will begin.
                    </p>

                    {/* Cost Breakdown */}
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 mb-6">
                        <div className="flex items-center gap-2 mb-3">
                            <Lock className="w-4 h-4 text-zinc-500" />
                            <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
                                Estimated Generation Cost
                            </span>
                        </div>

                        <div className="space-y-2">
                            {sceneCount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-400">Scenes</span>
                                    <span className="text-white">{sceneCount}</span>
                                </div>
                            )}
                            {estimatedShots > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-400">Estimated Shots</span>
                                    <span className="text-white">~{estimatedShots}</span>
                                </div>
                            )}
                            <div className="border-t border-zinc-700 my-2" />
                            <div className="flex justify-between">
                                <span className="text-zinc-300 font-medium">Total Estimate</span>
                                <span className="text-xl font-bold text-emerald-400">
                                    ${estimatedCost.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Info Note */}
                    <div className="flex items-start gap-2 mb-6 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-300">
                            This action will generate shot breakdowns and prepare for image generation.
                            Costs may vary based on final shot count.
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-6 py-3 rounded-xl font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all"
                        >
                            Back to Edit
                        </button>
                        <button
                            onClick={onConfirmLock}
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all"
                        >
                            <Lock className="w-4 h-4" />
                            Lock & Continue
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LockWarningDialog;
