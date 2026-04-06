/**
 * Production Slice — Scene data, playback state, user profile, auth
 */

import type { StateCreator } from 'zustand';
import type { AppStore } from '../appStore';
import { Scene, SongData, AppState } from '../../types';
import { uiLogger } from '../../services/infrastructure/logger';

const log = uiLogger.child('AppStore');

export interface ProductionSlice {
    songData: SongData | null;
    productionAppState: AppState;
    scenes: Scene[];
    currentSceneIndex: number;

    setSongData: (data: SongData | null) => void;
    setProductionAppState: (state: AppState) => void;
    setScenes: (scenes: Scene[]) => void;
    updateScene: (index: number, updates: Partial<Scene>) => void;
    setCurrentSceneIndex: (index: number) => void;

    userProfile: {
        preferences: {
            defaultStyle?: string;
            defaultDuration?: number;
            preferredLanguage?: string;
        };
        history: {
            totalVideosCreated: number;
            totalMusicGenerated: number;
            mostUsedStyles: Record<string, number>;
        };
    };

    updateUserProfile: (updates: Partial<ProductionSlice['userProfile']>) => void;
    trackVideoCreation: (params: { style: string; duration: number }) => void;
    trackMusicGeneration: () => void;

    currentUser: {
        uid: string;
        email: string | null;
        displayName: string | null;
        photoURL: string | null;
        isAuthenticated: boolean;
    } | null;
    currentProjectId: string | null;

    setCurrentUser: (user: ProductionSlice['currentUser']) => void;
    setCurrentProjectId: (projectId: string | null) => void;
    clearCurrentUser: () => void;
}

export const createProductionSlice: StateCreator<AppStore, [], [], ProductionSlice> = (set) => ({
    songData: null,
    productionAppState: AppState.IDLE,
    scenes: [],
    currentSceneIndex: 0,

    setSongData: (songData: SongData | null) => set({ songData }),
    setProductionAppState: (productionAppState: AppState) => set({ productionAppState }),
    setScenes: (scenes: Scene[]) => set({ scenes }),
    updateScene: (index: number, updates: Partial<Scene>) => set((state) => ({
        scenes: state.scenes.map((s, i) => i === index ? { ...s, ...updates } : s),
    })),
    setCurrentSceneIndex: (currentSceneIndex: number) => set({ currentSceneIndex }),

    userProfile: {
        preferences: {},
        history: {
            totalVideosCreated: 0,
            totalMusicGenerated: 0,
            mostUsedStyles: {},
        },
    },

    updateUserProfile: (updates: Partial<ProductionSlice['userProfile']>) => set((state) => ({
        userProfile: { ...state.userProfile, ...updates },
    })),

    trackVideoCreation: (params: { style: string; duration: number }) => set((state) => {
        const newHistory = {
            ...state.userProfile.history,
            totalVideosCreated: state.userProfile.history.totalVideosCreated + 1,
            mostUsedStyles: {
                ...state.userProfile.history.mostUsedStyles,
                [params.style]: (state.userProfile.history.mostUsedStyles[params.style] || 0) + 1,
            },
        };

        const newPreferences = { ...state.userProfile.preferences };
        const styleCount = newHistory.mostUsedStyles[params.style];
        if (styleCount && styleCount >= 3 && !newPreferences.defaultStyle) {
            newPreferences.defaultStyle = params.style;
            log.info(`Auto-set default style to ${params.style}`);
        }

        return { userProfile: { preferences: newPreferences, history: newHistory } };
    }),

    trackMusicGeneration: () => set((state) => ({
        userProfile: {
            ...state.userProfile,
            history: {
                ...state.userProfile.history,
                totalMusicGenerated: state.userProfile.history.totalMusicGenerated + 1,
            },
        },
    })),

    currentUser: null,
    currentProjectId: null,

    setCurrentUser: (user: ProductionSlice['currentUser']) => set({ currentUser: user }),
    setCurrentProjectId: (projectId: string | null) => set({ currentProjectId: projectId }),
    clearCurrentUser: () => set({ currentUser: null, currentProjectId: null }),
});
