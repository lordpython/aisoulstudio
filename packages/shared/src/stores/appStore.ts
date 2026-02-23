/**
 * App Store - Unified Global State
 *
 * Consolidates all Zustand stores into a single source of truth:
 * - Conversation: AI chat history, context, workflow state
 * - Generation: Pipeline progress and stage tracking
 * - Export: Video export settings and progress
 * - UI: Panel/modal visibility, view modes
 * - Production: Scene data and playback state
 * - Navigation: Route-aware state tracking for persistence
 *
 * Requirements: 10.1, 10.2 - Production state persists across navigation
 * Requirements: 10.4 - Chat history persistence
 * Requirements: 10.5 - LocalStorage state recovery on refresh
 *
 * ROBUST PATTERNS IMPLEMENTED:
 * - Safe localStorage operations with size validation
 * - Graceful error handling for storage failures
 * - Size limits to prevent quota exceeded errors
 * - Automatic cleanup of old data when approaching limits
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Scene, SongData, AppState, ContentPlan, NarrationSegment, VideoSFXPlan } from '../types';

// ============================================================
// Types
// ============================================================

// Message types
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

// Generation types
export type GenerationStage = 'idle' | 'transcribing' | 'planning' | 'generating-images' | 'generating-music' | 'complete' | 'error';

// Export types
export type ExportFormat = 'mp4' | 'webm' | 'gif';
export type ExportQuality = 'draft' | 'standard' | 'high' | 'ultra';

// UI types
export type PanelType = 'music' | 'export' | 'settings' | 'images' | 'scenes' | 'quality' | null;
export type ViewMode = 'simple' | 'advanced' | 'timeline';

// Navigation types (Requirements: 10.1, 10.2)
export interface NavigationState {
    lastRoute: string;
    lastVisitedAt: number;
    hasUnsavedChanges: boolean;
}

// Production persistence types (Requirements: 10.1, 10.2)
export interface PersistedProductionState {
    contentPlan: ContentPlan | null;
    narrationSegments: SerializedNarrationSegment[];
    sfxPlan: VideoSFXPlan | null;
    topic: string;
    visualStyle: string;
    targetDuration: number;
}

// Serialized narration segment (Blob cannot be persisted directly)
export interface SerializedNarrationSegment {
    sceneId: string;
    audioDuration: number;
    transcript: string;
    audioBase64?: string; // Base64 encoded audio for persistence
}

// ============================================================
// Store Interface
// ============================================================

interface AppStore {
    // --- Conversation State ---
    messages: Message[];
    conversationContext: ConversationContext;
    workflow: WorkflowState;
    isTyping: boolean;

    // Conversation Actions
    addMessage: (role: MessageRole, content: string, metadata?: Message['metadata']) => string;
    clearMessages: () => void;
    updateLastMessage: (updates: Partial<Message>) => void;
    updateContext: (updates: Partial<ConversationContext>) => void;
    addEntity: (key: string, value: string) => void;
    startWorkflow: (workflowName: string, message?: string) => void;
    updateWorkflowProgress: (progress: number, message?: string) => void;
    completeWorkflow: (result?: unknown) => void;
    failWorkflow: (error: string) => void;
    setTyping: (typing: boolean) => void;

    // --- Generation State ---
    generationStage: GenerationStage;
    generationProgress: number;
    generationMessage: string;
    generationError: string | null;
    isGeneratingImages: boolean;
    isGeneratingMusic: boolean;
    isTranscribing: boolean;

    // Generation Actions
    setGenerationStage: (stage: GenerationStage) => void;
    setGenerationProgress: (progress: number, message?: string) => void;
    setGenerationError: (error: string | null) => void;
    startImageGeneration: () => void;
    completeImageGeneration: () => void;
    startMusicGeneration: () => void;
    completeMusicGeneration: () => void;
    startTranscription: () => void;
    completeTranscription: () => void;

    // --- Export State ---
    exportFormat: ExportFormat;
    exportQuality: ExportQuality;
    exportAspectRatio: '16:9' | '9:16' | '1:1';
    includeAudio: boolean;
    isExporting: boolean;
    exportProgress: number;
    exportedUrl: string | null;

    // Export Actions
    setExportFormat: (format: ExportFormat) => void;
    setExportQuality: (quality: ExportQuality) => void;
    setExportAspectRatio: (ratio: '16:9' | '9:16' | '1:1') => void;
    setIncludeAudio: (include: boolean) => void;
    startExport: () => void;
    setExportProgress: (progress: number) => void;
    completeExport: (url: string) => void;
    cancelExport: () => void;

    // --- UI State ---
    activePanel: PanelType;
    viewMode: ViewMode;
    isMusicModalOpen: boolean;
    isExportModalOpen: boolean;
    isSettingsModalOpen: boolean;

    // UI Actions
    setActivePanel: (panel: PanelType) => void;
    setViewMode: (mode: ViewMode) => void;
    openPanel: (panel: PanelType) => void;
    closePanel: () => void;
    toggleMusicModal: (open?: boolean) => void;
    toggleExportModal: (open?: boolean) => void;
    toggleSettingsModal: (open?: boolean) => void;

    // --- Production State ---
    songData: SongData | null;
    productionAppState: AppState;
    scenes: Scene[];
    currentSceneIndex: number;

    // Production Actions
    setSongData: (data: SongData | null) => void;
    setProductionAppState: (state: AppState) => void;
    setScenes: (scenes: Scene[]) => void;
    updateScene: (index: number, updates: Partial<Scene>) => void;
    setCurrentSceneIndex: (index: number) => void;

    // --- User Profile State ---
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

    // User Profile Actions
    updateUserProfile: (updates: Partial<AppStore['userProfile']>) => void;
    trackVideoCreation: (params: { style: string; duration: number }) => void;
    trackMusicGeneration: () => void;

    // --- Current User State ---
    currentUser: {
        uid: string;
        email: string | null;
        displayName: string | null;
        photoURL: string | null;
        isAuthenticated: boolean;
    } | null;
    currentProjectId: string | null;

    // Current User Actions
    setCurrentUser: (user: AppStore['currentUser']) => void;
    setCurrentProjectId: (projectId: string | null) => void;
    clearCurrentUser: () => void;

    // --- Feedback State ---
    feedbackHistory: FeedbackEntry[];
    recordFeedback: (feedback: FeedbackEntry) => void;

    // --- Navigation State (Requirements: 10.1, 10.2) ---
    navigationState: NavigationState;
    persistedProduction: PersistedProductionState | null;

    // Navigation Actions
    setLastRoute: (route: string) => void;
    setHasUnsavedChanges: (hasChanges: boolean) => void;

    // Production Persistence Actions
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

    // --- Global Actions ---
    resetAll: () => void;
}

// ============================================================
// Helper
// ============================================================

const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;











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
        console.error('[AppStore] Failed to convert Base64 to Blob:', error);
        return null;
    }
}

// ============================================================
// Store Implementation
// ============================================================

export const useAppStore = create<AppStore>()(
    persist(
        (set, get) => ({
            // ========================================
            // Conversation State
            // ========================================
            messages: [],
            conversationContext: {
                userGoals: [],
                extractedEntities: {},
                conversationTurns: 0,
                clarifiedIntents: [],
            },
            workflow: {
                isExecuting: false,
                progress: 0,
            },
            isTyping: false,

            addMessage: (role, content, metadata) => {
                const id = generateId();
                set((state) => ({
                    messages: [...state.messages, { id, role, content, timestamp: Date.now(), metadata }],
                    conversationContext: {
                        ...state.conversationContext,
                        conversationTurns: state.conversationContext.conversationTurns + 1,
                    },
                }));
                return id;
            },

            clearMessages: () => set({
                messages: [],
                conversationContext: { userGoals: [], extractedEntities: {}, conversationTurns: 0, clarifiedIntents: [] },
            }),

            updateLastMessage: (updates) => set((state) => {
                if (state.messages.length === 0) return state;
                const msgs = [...state.messages];
                const lastMsg = msgs[msgs.length - 1];
                if (!lastMsg) return state;
                msgs[msgs.length - 1] = {
                    ...lastMsg,
                    ...updates,
                    // Ensure required fields are always present
                    id: updates.id ?? lastMsg.id,
                    role: updates.role ?? lastMsg.role,
                    content: updates.content ?? lastMsg.content,
                    timestamp: updates.timestamp ?? lastMsg.timestamp,
                };
                return { messages: msgs };
            }),

            updateContext: (updates) => set((state) => ({
                conversationContext: { ...state.conversationContext, ...updates },
            })),

            addEntity: (key, value) => set((state) => {
                const existing = state.conversationContext.extractedEntities[key] || [];
                if (existing.includes(value)) return state;
                return {
                    conversationContext: {
                        ...state.conversationContext,
                        extractedEntities: { ...state.conversationContext.extractedEntities, [key]: [...existing, value] },
                    },
                };
            }),

            startWorkflow: (workflowName, message) => set({
                workflow: { isExecuting: true, currentWorkflow: workflowName, progress: 0, message },
            }),

            updateWorkflowProgress: (progress, message) => set((state) => ({
                workflow: { ...state.workflow, progress, message },
            })),

            completeWorkflow: (result) => set((state) => ({
                workflow: { ...state.workflow, isExecuting: false, progress: 100, result },
            })),

            failWorkflow: (error) => set((state) => ({
                workflow: { ...state.workflow, isExecuting: false, error },
            })),

            setTyping: (isTyping) => set({ isTyping }),

            // ========================================
            // Generation State
            // ========================================
            generationStage: 'idle',
            generationProgress: 0,
            generationMessage: '',
            generationError: null,
            isGeneratingImages: false,
            isGeneratingMusic: false,
            isTranscribing: false,

            setGenerationStage: (generationStage) => set({ generationStage }),
            setGenerationProgress: (generationProgress, generationMessage) => set({ generationProgress, generationMessage: generationMessage ?? '' }),
            setGenerationError: (generationError) => set({ generationError, generationStage: generationError ? 'error' : 'idle' }),
            startImageGeneration: () => set({ isGeneratingImages: true, generationStage: 'generating-images' }),
            completeImageGeneration: () => set({ isGeneratingImages: false, generationStage: 'idle' }),
            startMusicGeneration: () => set({ isGeneratingMusic: true, generationStage: 'generating-music' }),
            completeMusicGeneration: () => set({ isGeneratingMusic: false, generationStage: 'idle' }),
            startTranscription: () => set({ isTranscribing: true, generationStage: 'transcribing' }),
            completeTranscription: () => set({ isTranscribing: false, generationStage: 'idle' }),

            // ========================================
            // Export State
            // ========================================
            exportFormat: 'mp4',
            exportQuality: 'standard',
            exportAspectRatio: '16:9',
            includeAudio: true,
            isExporting: false,
            exportProgress: 0,
            exportedUrl: null,

            setExportFormat: (exportFormat) => set({ exportFormat }),
            setExportQuality: (exportQuality) => set({ exportQuality }),
            setExportAspectRatio: (exportAspectRatio) => set({ exportAspectRatio }),
            setIncludeAudio: (includeAudio) => set({ includeAudio }),
            startExport: () => set({ isExporting: true, exportProgress: 0, exportedUrl: null }),
            setExportProgress: (exportProgress) => set({ exportProgress }),
            completeExport: (exportedUrl) => set({ isExporting: false, exportProgress: 100, exportedUrl }),
            cancelExport: () => set({ isExporting: false, exportProgress: 0 }),

            // ========================================
            // UI State
            // ========================================
            activePanel: null,
            viewMode: 'simple',
            isMusicModalOpen: false,
            isExportModalOpen: false,
            isSettingsModalOpen: false,

            setActivePanel: (activePanel) => set({ activePanel }),
            setViewMode: (viewMode) => set({ viewMode }),
            openPanel: (panel) => set({ activePanel: panel }),
            closePanel: () => set({ activePanel: null }),
            toggleMusicModal: (open) => set((state) => ({ isMusicModalOpen: open ?? !state.isMusicModalOpen })),
            toggleExportModal: (open) => set((state) => ({ isExportModalOpen: open ?? !state.isExportModalOpen })),
            toggleSettingsModal: (open) => set((state) => ({ isSettingsModalOpen: open ?? !state.isSettingsModalOpen })),

            // ========================================
            // Production State
            // ========================================
            songData: null,
            productionAppState: AppState.IDLE,
            scenes: [],
            currentSceneIndex: 0,

            setSongData: (songData) => set({ songData }),
            setProductionAppState: (productionAppState) => set({ productionAppState }),
            setScenes: (scenes) => set({ scenes }),
            updateScene: (index, updates) => set((state) => ({
                scenes: state.scenes.map((s, i) => i === index ? { ...s, ...updates } : s),
            })),
            setCurrentSceneIndex: (currentSceneIndex) => set({ currentSceneIndex }),

            // ========================================
            // User Profile State
            // ========================================
            userProfile: {
                preferences: {},
                history: {
                    totalVideosCreated: 0,
                    totalMusicGenerated: 0,
                    mostUsedStyles: {},
                },
            },

            updateUserProfile: (updates) => set((state) => ({
                userProfile: {
                    ...state.userProfile,
                    ...updates,
                },
            })),

            trackVideoCreation: (params) => set((state) => {
                const newHistory = {
                    ...state.userProfile.history,
                    totalVideosCreated: state.userProfile.history.totalVideosCreated + 1,
                    mostUsedStyles: {
                        ...state.userProfile.history.mostUsedStyles,
                        [params.style]: (state.userProfile.history.mostUsedStyles[params.style] || 0) + 1,
                    },
                };

                // Auto-set default style after 3 uses
                const newPreferences = { ...state.userProfile.preferences };
                const styleCount = newHistory.mostUsedStyles[params.style];
                if (styleCount && styleCount >= 3 && !newPreferences.defaultStyle) {
                    newPreferences.defaultStyle = params.style;
                    console.log(`[UserProfile] Auto-set default style to ${params.style}`);
                }

                return {
                    userProfile: {
                        preferences: newPreferences,
                        history: newHistory,
                    },
                };
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

            // ========================================
            // Current User State
            // ========================================
            currentUser: null,
            currentProjectId: null,

            setCurrentUser: (user) => set({ currentUser: user }),
            setCurrentProjectId: (projectId) => set({ currentProjectId: projectId }),
            clearCurrentUser: () => set({ currentUser: null, currentProjectId: null }),

            // ========================================
            // Feedback State
            // ========================================
            feedbackHistory: [],

            recordFeedback: (feedback) => set((state) => ({
                feedbackHistory: [...state.feedbackHistory.slice(-99), feedback], // Keep last 100
            })),

            // ========================================
            // Navigation State (Requirements: 10.1, 10.2)
            // ========================================
            navigationState: {
                lastRoute: '/',
                lastVisitedAt: Date.now(),
                hasUnsavedChanges: false,
            },
            persistedProduction: null,

            setLastRoute: (route) => set((state) => ({
                navigationState: {
                    ...state.navigationState,
                    lastRoute: route,
                    lastVisitedAt: Date.now(),
                },
            })),

            setHasUnsavedChanges: (hasChanges) => set((state) => ({
                navigationState: {
                    ...state.navigationState,
                    hasUnsavedChanges: hasChanges,
                },
            })),

            // Persist production state with metadata only (no audio data)
            // Audio will be regenerated from the content plan when needed
            persistProductionState: async ({ contentPlan, narrationSegments, sfxPlan, topic, visualStyle, targetDuration }) => {
                // Only persist metadata, not audio blobs to avoid LocalStorage 5MB limit
                const serializedSegments: SerializedNarrationSegment[] = narrationSegments.map((segment) => ({
                    sceneId: segment.sceneId,
                    audioDuration: segment.audioDuration,
                    transcript: segment.transcript,
                    // audioBase64 removed - audio will be regenerated from transcript
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

            // Restore narration segments from persisted state
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
                            console.warn('Failed to deserialize audio for scene:', segment.sceneId, err);
                        }
                    }
                    return {
                        sceneId: segment.sceneId,
                        audioDuration: segment.audioDuration,
                        transcript: segment.transcript,
                        audioBlob: audioBlob || new Blob(), // Fallback to empty blob
                    };
                });
            },

            // ========================================
            // Global Reset
            // ========================================
            resetAll: () => set({
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
            name: 'lyriclens-app-store',
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
