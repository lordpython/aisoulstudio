/**
 * Navigation Slice — Route tracking, production persistence
 */

import type { StateCreator } from 'zustand';
import type {
    NavigationState, PersistedProductionState, SerializedNarrationSegment,
    AppStore,
} from '../appStore';
import { ContentPlan, NarrationSegment, VideoSFXPlan } from '../../types';
import { uiLogger } from '../../services/infrastructure/logger';

const log = uiLogger.child('AppStore');

/**
 * Convert Base64 string back to Blob.
 * Returns null on failure instead of throwing.
 */
function base64ToBlob(base64: string, mimeType: string = 'audio/wav'): Blob | null {
    if (!base64 || base64.length === 0) {
        return null;
    }

    try {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    } catch (error) {
        log.error('Failed to convert Base64 to Blob', error);
        return null;
    }
}

export interface NavigationSlice {
    navigationState: NavigationState;
    persistedProduction: PersistedProductionState | null;

    setLastRoute: (route: string) => void;
    setHasUnsavedChanges: (hasChanges: boolean) => void;
    persistProductionState: (state: {
        contentPlan: ContentPlan | null;
        narrationSegments: NarrationSegment[];
        sfxPlan: VideoSFXPlan | null;
        topic: string;
        visualStyle: string;
        targetDuration: number;
    }) => Promise<void>;
    clearPersistedProduction: () => void;
    getPersistedNarrationSegments: () => Promise<NarrationSegment[]>;
}

export const createNavigationSlice: StateCreator<AppStore, [], [], NavigationSlice> = (set, get) => ({
    navigationState: {
        lastRoute: '/',
        lastVisitedAt: Date.now(),
        hasUnsavedChanges: false,
    },
    persistedProduction: null,

    setLastRoute: (route: string) => set((state) => ({
        navigationState: {
            ...state.navigationState,
            lastRoute: route,
            lastVisitedAt: Date.now(),
        },
    })),

    setHasUnsavedChanges: (hasChanges: boolean) => set((state) => ({
        navigationState: {
            ...state.navigationState,
            hasUnsavedChanges: hasChanges,
        },
    })),

    persistProductionState: async ({ contentPlan, narrationSegments, sfxPlan, topic, visualStyle, targetDuration }) => {
        const serializedSegments: SerializedNarrationSegment[] = narrationSegments.map((segment) => ({
            sceneId: segment.sceneId,
            audioDuration: segment.audioDuration,
            transcript: segment.transcript,
        }));

        set({
            persistedProduction: {
                contentPlan,
                narrationSegments: serializedSegments,
                sfxPlan,
                topic,
                visualStyle,
                targetDuration,
            },
            navigationState: {
                lastRoute: '/studio',
                lastVisitedAt: Date.now(),
                hasUnsavedChanges: false,
            },
        });
    },

    clearPersistedProduction: () => set({
        persistedProduction: null,
        navigationState: {
            lastRoute: '/',
            lastVisitedAt: Date.now(),
            hasUnsavedChanges: false,
        },
    }),

    getPersistedNarrationSegments: async () => {
        const state = get();
        if (!state.persistedProduction?.narrationSegments) {
            return [];
        }

        return state.persistedProduction.narrationSegments.map((segment) => {
            let audioBlob: Blob | undefined;
            if (segment.audioBase64) {
                try {
                    audioBlob = base64ToBlob(segment.audioBase64) ?? undefined;
                } catch (err) {
                    log.warn(`Failed to deserialize audio for scene: ${segment.sceneId}`, err);
                }
            }
            return {
                sceneId: segment.sceneId,
                audioDuration: segment.audioDuration,
                transcript: segment.transcript,
                audioBlob: audioBlob || new Blob(),
            };
        });
    },
});
