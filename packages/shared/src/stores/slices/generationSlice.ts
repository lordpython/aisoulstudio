/**
 * Generation Slice — Pipeline progress and stage tracking
 */

import type { StateCreator } from 'zustand';
import type { GenerationStage, AppStore } from '../appStore';

export interface GenerationSlice {
    generationStage: GenerationStage;
    generationProgress: number;
    generationMessage: string;
    generationError: string | null;
    isGeneratingImages: boolean;
    isGeneratingMusic: boolean;
    isTranscribing: boolean;

    setGenerationStage: (stage: GenerationStage) => void;
    setGenerationProgress: (progress: number, message?: string) => void;
    setGenerationError: (error: string | null) => void;
    startImageGeneration: () => void;
    completeImageGeneration: () => void;
    startMusicGeneration: () => void;
    completeMusicGeneration: () => void;
    startTranscription: () => void;
    completeTranscription: () => void;
}

export const createGenerationSlice: StateCreator<AppStore, [], [], GenerationSlice> = (set) => ({
    generationStage: 'idle',
    generationProgress: 0,
    generationMessage: '',
    generationError: null,
    isGeneratingImages: false,
    isGeneratingMusic: false,
    isTranscribing: false,

    setGenerationStage: (generationStage: GenerationStage) => set({ generationStage }),
    setGenerationProgress: (generationProgress: number, generationMessage?: string) => set({ generationProgress, generationMessage: generationMessage ?? '' }),
    setGenerationError: (generationError: string | null) => set({ generationError, generationStage: generationError ? 'error' : 'idle' }),
    startImageGeneration: () => set({ isGeneratingImages: true, generationStage: 'generating-images' }),
    completeImageGeneration: () => set({ isGeneratingImages: false, generationStage: 'idle' }),
    startMusicGeneration: () => set({ isGeneratingMusic: true, generationStage: 'generating-music' }),
    completeMusicGeneration: () => set({ isGeneratingMusic: false, generationStage: 'idle' }),
    startTranscription: () => set({ isTranscribing: true, generationStage: 'transcribing' }),
    completeTranscription: () => set({ isTranscribing: false, generationStage: 'idle' }),
});
