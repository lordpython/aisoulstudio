/**
 * Conversation Slice — AI chat history, context, workflow state, feedback
 */

import type { StateCreator } from 'zustand';
import type {
    Message, MessageRole, ConversationContext, WorkflowState, FeedbackEntry,
    AppStore,
} from '../appStore';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

export interface ConversationSlice {
    messages: Message[];
    conversationContext: ConversationContext;
    workflow: WorkflowState;
    isTyping: boolean;
    feedbackHistory: FeedbackEntry[];

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
    recordFeedback: (feedback: FeedbackEntry) => void;
}

export const createConversationSlice: StateCreator<AppStore, [], [], ConversationSlice> = (set) => ({
    messages: [],
    conversationContext: {
        userGoals: [],
        extractedEntities: {},
        conversationTurns: 0,
        clarifiedIntents: [],
    },
    workflow: { isExecuting: false, progress: 0 },
    isTyping: false,
    feedbackHistory: [],

    addMessage: (role: MessageRole, content: string, metadata?: Message['metadata']) => {
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

    updateLastMessage: (updates: Partial<Message>) => set((state) => {
        if (state.messages.length === 0) return state;
        const msgs = [...state.messages];
        const lastMsg = msgs[msgs.length - 1];
        if (!lastMsg) return state;
        msgs[msgs.length - 1] = {
            ...lastMsg,
            ...updates,
            id: updates.id ?? lastMsg.id,
            role: updates.role ?? lastMsg.role,
            content: updates.content ?? lastMsg.content,
            timestamp: updates.timestamp ?? lastMsg.timestamp,
        };
        return { messages: msgs };
    }),

    updateContext: (updates: Partial<ConversationContext>) => set((state) => ({
        conversationContext: { ...state.conversationContext, ...updates },
    })),

    addEntity: (key: string, value: string) => set((state) => {
        const existing = state.conversationContext.extractedEntities[key] || [];
        if (existing.includes(value)) return state;
        return {
            conversationContext: {
                ...state.conversationContext,
                extractedEntities: { ...state.conversationContext.extractedEntities, [key]: [...existing, value] },
            },
        };
    }),

    startWorkflow: (workflowName: string, message?: string) => set({
        workflow: { isExecuting: true, currentWorkflow: workflowName, progress: 0, message },
    }),

    updateWorkflowProgress: (progress: number, message?: string) => set((state) => ({
        workflow: { ...state.workflow, progress, message },
    })),

    completeWorkflow: (result?: unknown) => set((state) => ({
        workflow: { ...state.workflow, isExecuting: false, progress: 100, result },
    })),

    failWorkflow: (error: string) => set((state) => ({
        workflow: { ...state.workflow, isExecuting: false, error },
    })),

    setTyping: (isTyping: boolean) => set({ isTyping }),

    recordFeedback: (feedback: FeedbackEntry) => set((state) => ({
        feedbackHistory: [...state.feedbackHistory.slice(-99), feedback],
    })),
});
