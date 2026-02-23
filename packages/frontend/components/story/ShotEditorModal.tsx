/**
 * ShotEditorModal.tsx
 * Full-featured per-shot editor dialog matching the Storyboarder.ai design.
 * Opens from the StoryboardView floating panel or shot table rows.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    ChevronLeft, ChevronRight, Loader2, RefreshCw, Save, X
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import type { ShotlistEntry } from '@/types';

export interface ShotEditorModalProps {
    shot: ShotlistEntry | null;
    sceneNumber: number;
    sceneHeading: string;
    sceneLighting?: string;
    shotIndexInScene: number;
    totalShotsInScene: number;
    onClose: () => void;
    onSave: (shotId: string, updates: Partial<ShotlistEntry>) => void;
    onRetry: (shotId: string) => void;
    onNavigate: (direction: 'prev' | 'next') => void;
    isProcessing?: boolean;
}

const SHOT_TYPE_OPTIONS = [
    'Wide',
    'Medium',
    'Close-up',
    'Extreme Close-up',
    'POV',
    'Over-the-shoulder',
];

const CAMERA_ANGLE_OPTIONS = [
    'Eye-level',
    'High',
    'Low',
    'Dutch',
    "Bird's-eye",
    "Worm's-eye",
];

const MOVEMENT_OPTIONS = [
    'Static',
    'Pan',
    'Tilt',
    'Zoom',
    'Dolly',
    'Tracking',
    'Handheld',
];

const ASPECT_RATIO_OPTIONS = ['16:9', '9:16', '1:1', '4:3'];

// Local editable state mirrors the shot fields
interface LocalEdits {
    description: string;
    dialogue: string;
    durationEst: number;
    shotType: string;
    cameraAngle: string;
    movement: string;
    equipment: string;
    focalLength: string;
    aspectRatio: string;
    notes: string;
}

function shotToLocal(shot: ShotlistEntry): LocalEdits {
    return {
        description: shot.description || '',
        dialogue: shot.dialogue || '',
        durationEst: shot.durationEst ?? 5,
        shotType: shot.shotType || '',
        cameraAngle: shot.cameraAngle || '',
        movement: shot.movement || '',
        equipment: shot.equipment || '',
        focalLength: shot.focalLength || '',
        aspectRatio: shot.aspectRatio || '16:9',
        notes: shot.notes || '',
    };
}

function LabelCell({ label }: { label: string }) {
    return (
        <td className="py-2 px-3 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-500 whitespace-nowrap align-top pt-3 w-28">
            {label}
        </td>
    );
}

export const ShotEditorModal: React.FC<ShotEditorModalProps> = ({
    shot,
    sceneNumber,
    sceneHeading,
    sceneLighting,
    shotIndexInScene,
    totalShotsInScene,
    onClose,
    onSave,
    onRetry,
    onNavigate,
    isProcessing = false,
}) => {
    const [edits, setEdits] = useState<LocalEdits>(() =>
        shot ? shotToLocal(shot) : shotToLocal({} as ShotlistEntry)
    );
    const [dialogueOpen, setDialogueOpen] = useState(false);

    // Re-sync local state whenever the shot changes (navigation)
    useEffect(() => {
        if (shot) setEdits(shotToLocal(shot));
    }, [shot?.id]);

    const set = useCallback(<K extends keyof LocalEdits>(key: K, value: LocalEdits[K]) => {
        setEdits(prev => ({ ...prev, [key]: value }));
    }, []);

    const handleSave = () => {
        if (!shot) return;
        onSave(shot.id, {
            description: edits.description,
            dialogue: edits.dialogue || undefined,
            durationEst: edits.durationEst,
            shotType: edits.shotType || undefined,
            cameraAngle: edits.cameraAngle || undefined,
            movement: edits.movement || undefined,
            equipment: edits.equipment || undefined,
            focalLength: edits.focalLength || undefined,
            aspectRatio: edits.aspectRatio || undefined,
            notes: edits.notes || undefined,
        });
        onClose();
    };

    const handleRetry = () => {
        if (!shot) return;
        onRetry(shot.id);
    };

    const inputCls =
        'w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-600';
    const selectCls =
        'w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors';

    return (
        <Dialog open={!!shot} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent
                showCloseButton={false}
                className="max-w-5xl w-full bg-zinc-950 border border-zinc-800 text-zinc-100 p-0 gap-0 rounded-xl overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <DialogTitle className="text-base font-semibold text-zinc-100">
                        Edit Your Shot
                    </DialogTitle>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-sm text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex gap-0 min-h-0">
                    {/* Left: Image Preview + Navigation */}
                    <div className="w-72 shrink-0 flex flex-col bg-zinc-900/50 border-r border-zinc-800">
                        {/* Image */}
                        <div className="relative aspect-video bg-zinc-950 overflow-hidden">
                            {shot?.imageUrl ? (
                                <motion.img
                                    key={shot.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    src={shot.imageUrl}
                                    alt={shot.description}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    {isProcessing ? (
                                        <Loader2 className="w-8 h-8 text-zinc-700 animate-spin" />
                                    ) : (
                                        <div className="text-zinc-700 text-xs font-mono text-center">
                                            No visual generated
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Navigation */}
                        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 bg-zinc-900/80">
                            <button
                                onClick={() => onNavigate('prev')}
                                disabled={shotIndexInScene === 0}
                                className="p-1 text-zinc-500 hover:text-zinc-200 disabled:text-zinc-700 transition-colors"
                                aria-label="Previous shot"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="font-mono text-xs text-zinc-500">
                                {shotIndexInScene + 1} / {totalShotsInScene}
                            </span>
                            <button
                                onClick={() => onNavigate('next')}
                                disabled={shotIndexInScene >= totalShotsInScene - 1}
                                className="p-1 text-zinc-500 hover:text-zinc-200 disabled:text-zinc-700 transition-colors"
                                aria-label="Next shot"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Description textarea */}
                        <div className="p-4 flex-1 flex flex-col gap-2">
                            <label className="font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-500">
                                Description
                            </label>
                            <textarea
                                value={edits.description}
                                onChange={e => set('description', e.target.value)}
                                rows={4}
                                className={`${inputCls} resize-none flex-1`}
                                placeholder="Shot description..."
                            />
                        </div>
                    </div>

                    {/* Right: Scene info + shot metadata table */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                        {/* Scene heading */}
                        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/30">
                            <div className="flex items-center gap-3 mb-1">
                                <span className="font-mono text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-sm border border-blue-500/20 shrink-0">
                                    SCENE {sceneNumber}
                                </span>
                                <span className="font-mono text-sm font-medium text-zinc-100 truncate" dir="auto">
                                    {sceneHeading}
                                </span>
                            </div>
                            {sceneLighting && (
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />
                                    {sceneLighting}
                                </div>
                            )}
                        </div>

                        {/* Metadata table */}
                        <div className="px-4 py-4 overflow-x-auto">
                            <table className="w-full border-collapse">
                                <tbody>
                                    {/* Row 1: ERT + SIZE */}
                                    <tr>
                                        <LabelCell label="ERT (sec)" />
                                        <td className="py-2 px-3 align-top pt-3">
                                            <input
                                                type="number"
                                                value={edits.durationEst}
                                                onChange={e => set('durationEst', parseFloat(e.target.value) || 0)}
                                                className={`${inputCls} w-20 text-center`}
                                                min={1}
                                                max={120}
                                                step={0.5}
                                            />
                                        </td>
                                        <LabelCell label="Size" />
                                        <td className="py-2 px-3 align-top pt-3">
                                            <select
                                                value={edits.shotType}
                                                onChange={e => set('shotType', e.target.value)}
                                                className={selectCls}
                                            >
                                                <option value="">—</option>
                                                {SHOT_TYPE_OPTIONS.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>

                                    {/* Row 2: PERSPECTIVE + MOVEMENT */}
                                    <tr>
                                        <LabelCell label="Perspective" />
                                        <td className="py-2 px-3 align-top pt-3">
                                            <select
                                                value={edits.cameraAngle}
                                                onChange={e => set('cameraAngle', e.target.value)}
                                                className={selectCls}
                                            >
                                                <option value="">—</option>
                                                {CAMERA_ANGLE_OPTIONS.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <LabelCell label="Movement" />
                                        <td className="py-2 px-3 align-top pt-3">
                                            <select
                                                value={edits.movement}
                                                onChange={e => set('movement', e.target.value)}
                                                className={selectCls}
                                            >
                                                <option value="">—</option>
                                                {MOVEMENT_OPTIONS.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>

                                    {/* Row 3: EQUIPMENT + FOCAL LENGTH */}
                                    <tr>
                                        <LabelCell label="Equipment" />
                                        <td className="py-2 px-3 align-top pt-3">
                                            <input
                                                type="text"
                                                value={edits.equipment}
                                                onChange={e => set('equipment', e.target.value)}
                                                className={inputCls}
                                                placeholder="e.g. Tripod"
                                            />
                                        </td>
                                        <LabelCell label="Focal Length" />
                                        <td className="py-2 px-3 align-top pt-3">
                                            <input
                                                type="text"
                                                value={edits.focalLength}
                                                onChange={e => set('focalLength', e.target.value)}
                                                className={inputCls}
                                                placeholder="e.g. 35mm"
                                            />
                                        </td>
                                    </tr>

                                    {/* Row 4: ASPECT RATIO + NOTES */}
                                    <tr>
                                        <LabelCell label="Aspect Ratio" />
                                        <td className="py-2 px-3 align-top pt-3">
                                            <select
                                                value={edits.aspectRatio}
                                                onChange={e => set('aspectRatio', e.target.value)}
                                                className={selectCls}
                                            >
                                                {ASPECT_RATIO_OPTIONS.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <LabelCell label="Notes" />
                                        <td className="py-2 px-3 align-top pt-3">
                                            <input
                                                type="text"
                                                value={edits.notes}
                                                onChange={e => set('notes', e.target.value)}
                                                className={inputCls}
                                                placeholder="Production notes..."
                                            />
                                        </td>
                                    </tr>

                                    {/* Row 5: DIALOGUE (collapsible) */}
                                    <tr>
                                        <td colSpan={4} className="py-2 px-3 pt-3">
                                            <button
                                                type="button"
                                                onClick={() => setDialogueOpen(prev => !prev)}
                                                className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
                                            >
                                                <ChevronRight
                                                    className={`w-3 h-3 transition-transform ${dialogueOpen ? 'rotate-90' : ''}`}
                                                />
                                                Dialogue
                                            </button>
                                            {dialogueOpen && (
                                                <textarea
                                                    value={edits.dialogue}
                                                    onChange={e => set('dialogue', e.target.value)}
                                                    rows={3}
                                                    className={`${inputCls} mt-2 resize-none w-full`}
                                                    placeholder="Character dialogue or voice-over..."
                                                />
                                            )}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-950">
                    <button
                        type="button"
                        onClick={handleRetry}
                        disabled={isProcessing}
                        className="flex items-center gap-2 px-4 py-2 rounded-sm border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 text-sm font-medium transition-colors disabled:opacity-40"
                    >
                        {isProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        Retry
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isProcessing}
                        className="flex items-center gap-2 px-5 py-2 rounded-sm bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-40"
                    >
                        <Save className="w-4 h-4" />
                        Save
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ShotEditorModal;
