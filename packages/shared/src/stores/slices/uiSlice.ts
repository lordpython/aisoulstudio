/**
 * UI Slice — Panel/modal visibility, view modes
 */

import type { StateCreator } from 'zustand';
import type { PanelType, ViewMode, AppStore } from '../appStore';

export interface UISlice {
    activePanel: PanelType;
    viewMode: ViewMode;
    isMusicModalOpen: boolean;
    isExportModalOpen: boolean;
    isSettingsModalOpen: boolean;

    setActivePanel: (panel: PanelType) => void;
    setViewMode: (mode: ViewMode) => void;
    openPanel: (panel: PanelType) => void;
    closePanel: () => void;
    toggleMusicModal: (open?: boolean) => void;
    toggleExportModal: (open?: boolean) => void;
    toggleSettingsModal: (open?: boolean) => void;
}

export const createUISlice: StateCreator<AppStore, [], [], UISlice> = (set) => ({
    activePanel: null,
    viewMode: 'simple',
    isMusicModalOpen: false,
    isExportModalOpen: false,
    isSettingsModalOpen: false,

    setActivePanel: (activePanel: PanelType) => set({ activePanel }),
    setViewMode: (viewMode: ViewMode) => set({ viewMode }),
    openPanel: (panel: PanelType) => set({ activePanel: panel }),
    closePanel: () => set({ activePanel: null }),
    toggleMusicModal: (open?: boolean) => set((state) => ({ isMusicModalOpen: open ?? !state.isMusicModalOpen })),
    toggleExportModal: (open?: boolean) => set((state) => ({ isExportModalOpen: open ?? !state.isExportModalOpen })),
    toggleSettingsModal: (open?: boolean) => set((state) => ({ isSettingsModalOpen: open ?? !state.isSettingsModalOpen })),
});
