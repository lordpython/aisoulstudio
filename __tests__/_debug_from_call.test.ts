import { describe, it, expect, vi } from 'vitest';

const { mockChainInvoke, fromCallLog } = vi.hoisted(() => ({
    mockChainInvoke: vi.fn(),
    fromCallLog: [] as string[],
}));

vi.mock('../../packages/shared/src/services/shared/apiClient', () => ({
    API_KEY: 'test-api-key',
    MODELS: { TEXT: 'gemini-test-model', IMAGE: 'img', VIDEO: 'vid', TTS: 'tts' },
}));
vi.mock('@langchain/google-genai', () => ({
    ChatGoogleGenerativeAI: vi.fn(() => ({ invoke: vi.fn() })),
}));
vi.mock('@langchain/core/prompts', () => ({
    ChatPromptTemplate: { fromMessages: vi.fn(() => ({ pipe: vi.fn(), invoke: vi.fn() })) },
}));
vi.mock('@langchain/core/runnables', () => {
    const from = vi.fn((arr: unknown) => {
        fromCallLog.push('MOCK from called with arr length: ' + (Array.isArray(arr) ? arr.length : 'not array'));
        return { invoke: mockChainInvoke };
    });
    return {
        RunnableSequence: { from },
        RunnableLambda: vi.fn().mockImplementation(({ func }: { func: unknown }) => ({ func })),
    };
});
vi.mock('../../packages/shared/src/services/prompt/personaData', () => ({
    getSystemPersona: vi.fn(() => ({ name: 'T', role: 'R', coreRule: 'C', visualPrinciples: [], avoidList: [] })),
}));
vi.mock('../../packages/shared/src/services/prompt/styleEnhancements', () => ({
    getStyleEnhancement: vi.fn(() => ({ mediumDescription: 'Cinematic', keywords: ['a','b','c','d','e'] })),
}));
vi.mock('../../packages/shared/src/services/prompt/vibeLibrary', () => ({
    getVibeTerms: vi.fn(() => [{ id: 'visceral-dread' }]),
    SCENARIO_TEMPLATES: [],
}));
vi.mock('../../packages/shared/src/services/textSanitizer', () => ({
    cleanForTTS: vi.fn((t: string) => t),
}));
vi.mock('../../packages/shared/src/services/tripletUtils', () => ({
    getEffectiveLegacyTone: vi.fn(() => 'professional'),
}));

import { generateContentPlan } from './../packages/shared/src/services/contentPlannerService';

describe('debug from call', () => {
    it('checks if from was called', async () => {
        mockChainInvoke.mockResolvedValue({
            title: 'T', totalDuration: 10, targetAudience: 'A', overallTone: 'calm',
            scenes: [{ id: 's1', name: 'N', duration: 10, visualDescription: 'V', narrationScript: 'S' }],
        });
        try { await generateContentPlan('test topic'); } catch(e) { /* expected */ }
        console.log('fromCallLog:', fromCallLog);
        console.log('mockChainInvoke calls:', mockChainInvoke.mock.calls.length);
    });
});
