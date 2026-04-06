/**
 * App Store - Unified Global State (Slice Architecture)
 *
 * Composed from focused slice modules in ./slices/:
 * - conversationSlice: AI chat history, context, workflow state, feedback
 * - generationSlice:   Pipeline progress and stage tracking
 * - exportSlice:       Video export settings and progress
 * - uiSlice:           Panel/modal visibility, view modes
 * - productionSlice:   Scene data, playback, user profile, auth
 * - navigationSlice:   Route tracking, production persistence
 *
 * Requirements: 10.1, 10.2 - Production state persists across navigation
 * Requirements: 10.4 - Chat history persistence
 * Requirements: 10.5 - LocalStorage state recovery on refresh
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppState } from '../types';
import {
    createConversationSlice,
    createGenerationSlice,
    createExportSlice,
    createUISlice,
    createProductionSlice,
    createNavigationSlice,
} from './slices';
import type { ConversationSlice } from './slices/conversationSlice';
import type { GenerationSlice } from './slices/generationSlice';
import type { ExportSlice } from './slices/exportSlice';
import type { UISlice } from './slices/uiSlice';
import type { ProductionSlice } from './slices/productionSlice';
import type { NavigationSlice } from './slices/navigationSlice';
import { Scene, SongData, ContentPlan, NarrationSegment, VideoSFXPlan } from '../types';

// ============================================================
// Types (re-exported for backward compat)
// ============================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface QuickAction {
    id: string;
    label: string;
    action: {
        type: string;
        [key: string]: unknown;
    };
    variant?: 'primary' | 'secondary';
}

export interface Message {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: number;
    quickActions?: QuickAction[];
    metadata?: {
        intent?: string;
        confidence?: number;
        workflowTriggered?: string;
        requiresClarification?: boolean;
        error?: string;
    };
}

export interface FeedbackEntry {
    messageId: string;
    userMessage: string;
    agentResponse: string;
    helpful: boolean;
    rating: number;
    comment?: string;
    timestamp: number;
}

export interface ConversationContext {
    userGoals: string[];
    extractedEntities: Record<string, string[]>;
    conversationTurns: number;
    lastIntent?: string;
    clarifiedIntents: string[];
}

export interface WorkflowState {
    isExecuting: boolean;
    currentWorkflow?: string;
    progress: number;
    message?: string;
    result?: unknown;
    error?: string;
}

export type GenerationStage = 'idle' | 'transcribing' | 'planning' | 'generating-images' | 'generating-music' | 'complete' | 'error';
export type ExportFormat = 'mp4' | 'webm' | 'gif';
export type ExportQuality = 'draft' | 'standard' | 'high' | 'ultra';
export type PanelType = 'music' | 'export' | 'settings' | 'images' | 'scenes' | 'quality' | null;
export type ViewMode = 'simple' | 'advanced' | 'timeline';

export interface NavigationState {
    lastRoute: string;
    lastVisitedAt: number;
    hasUnsavedChanges: boolean;
}

export interface PersistedProductionState {
    contentPlan: ContentPlan | null;
    narrationSegments: SerializedNarrationSegment[];
    sfxPlan: VideoSFXPlan | null;
    topic: string;
    visualStyle: string;
    targetDuration: number;
}

export interface SerializedNarrationSegment {
    sceneId: string;
    audioDuration: number;
    transcript: string;
    audioBase64?: string;
}

// ============================================================
// Composite Store Interface
// ============================================================

export interface AppStore
    extends ConversationSlice,
            GenerationSlice,
            ExportSlice,
            UISlice,
            ProductionSlice,
            NavigationSlice {
    resetAll: () => void;
}



// ============================================================
// Store Implementation — Slice Composition
// ============================================================

export const useAppStore = create<AppStore>()(
    persist(
        (...a) => ({
            ...createConversationSlice(...a),
            ...createGenerationSlice(...a),
            ...createExportSlice(...a),
            ...createUISlice(...a),
            ...createProductionSlice(...a),
            ...createNavigationSlice(...a),

            resetAll: () => a[0]({
                // Conversation
                messages: [],
                conversationContext: { userGoals: [], extractedEntities: {}, conversationTurns: 0, clarifiedIntents: [] },
                workflow: { isExecuting: false, progress: 0 },
                isTyping: false,
                // Generation
                generationStage: 'idle',
                generationProgress: 0,
                generationMessage: '',
                generationError: null,
                isGeneratingImages: false,
                isGeneratingMusic: false,
                isTranscribing: false,
                // Export
                exportFormat: 'mp4',
                exportQuality: 'standard',
                exportAspectRatio: '16:9',
                includeAudio: true,
                isExporting: false,
                exportProgress: 0,
                exportedUrl: null,
                // UI
                activePanel: null,
                viewMode: 'simple',
                isMusicModalOpen: false,
                isExportModalOpen: false,
                isSettingsModalOpen: false,
                // Production
                songData: null,
                productionAppState: AppState.IDLE,
                scenes: [],
                currentSceneIndex: 0,
                // Navigation
                navigationState: {
                    lastRoute: '/',
                    lastVisitedAt: Date.now(),
                    hasUnsavedChanges: false,
                },
                persistedProduction: null,
            }),
        }),
        {
            name: 'ai_soul_studio_app',
            // Migration: carry over data from the old storage key
            migrate: (persistedState: unknown, version: number) => {
                if (typeof window !== 'undefined') {
                    const oldKey = 'lyriclens-app-store';
                    const oldData = localStorage.getItem(oldKey);
                    if (oldData && !persistedState) {
                        try {
                            localStorage.removeItem(oldKey);
                            return JSON.parse(oldData)?.state ?? persistedState;
                        } catch { /* ignore parse errors */ }
                    }
                }
                return persistedState;
            },
            version: 1,
            partialize: (state) => ({
                // Persist conversation data (Requirements: 10.4)
                messages: state.messages.slice(-50),
                conversationContext: state.conversationContext,
                // Persist export preferences
                exportFormat: state.exportFormat,
                exportQuality: state.exportQuality,
                exportAspectRatio: state.exportAspectRatio,
                // Persist UI preferences
                viewMode: state.viewMode,
                // Persist navigation state (Requirements: 10.1, 10.2)
                navigationState: state.navigationState,
                // Persist production state (Requirements: 10.1, 10.2, 10.5)
                persistedProduction: state.persistedProduction,
                // Persist user profile
                userProfile: state.userProfile,
                // Persist current user and project
                currentUser: state.currentUser,
                currentProjectId: state.currentProjectId,
            }),
        }
    )
);

export default useAppStore;
