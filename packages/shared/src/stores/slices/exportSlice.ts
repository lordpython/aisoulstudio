/**
 * Export Slice — Video export settings and progress
 */

import type { StateCreator } from 'zustand';
import type { ExportFormat, ExportQuality, AppStore } from '../appStore';

export interface ExportSlice {
    exportFormat: ExportFormat;
    exportQuality: ExportQuality;
    exportAspectRatio: '16:9' | '9:16' | '1:1';
    includeAudio: boolean;
    isExporting: boolean;
    exportProgress: number;
    exportedUrl: string | null;

    setExportFormat: (format: ExportFormat) => void;
    setExportQuality: (quality: ExportQuality) => void;
    setExportAspectRatio: (ratio: '16:9' | '9:16' | '1:1') => void;
    setIncludeAudio: (include: boolean) => void;
    startExport: () => void;
    setExportProgress: (progress: number) => void;
    completeExport: (url: string) => void;
    cancelExport: () => void;
}

export const createExportSlice: StateCreator<AppStore, [], [], ExportSlice> = (set) => ({
    exportFormat: 'mp4',
    exportQuality: 'standard',
    exportAspectRatio: '16:9',
    includeAudio: true,
    isExporting: false,
    exportProgress: 0,
    exportedUrl: null,

    setExportFormat: (exportFormat: ExportFormat) => set({ exportFormat }),
    setExportQuality: (exportQuality: ExportQuality) => set({ exportQuality }),
    setExportAspectRatio: (exportAspectRatio: '16:9' | '9:16' | '1:1') => set({ exportAspectRatio }),
    setIncludeAudio: (includeAudio: boolean) => set({ includeAudio }),
    startExport: () => set({ isExporting: true, exportProgress: 0, exportedUrl: null }),
    setExportProgress: (exportProgress: number) => set({ exportProgress }),
    completeExport: (exportedUrl: string) => set({ isExporting: false, exportProgress: 100, exportedUrl }),
    cancelExport: () => set({ isExporting: false, exportProgress: 0 }),
});
