/**
 * ContentPlannerService Tests
 *
 * Covers:
 * 1. ContentPlanSchema Zod validation (5 tests)
 * 2. suggestSceneCount() (4 tests)
 * 3. validateContentPlan() (6 tests)
 * 4. generateContentPlan() main function (11 tests)
 * 5. Edge cases (7 tests)
 * 6. ContentPlannerError (3 tests)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be created via vi.hoisted so they are available
// inside vi.mock factory closures (which are hoisted before variable declarations)
// ---------------------------------------------------------------------------

const { mockChainInvoke } = vi.hoisted(() => ({
    mockChainInvoke: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks — declared before imports (Vitest hoists these automatically)
// ---------------------------------------------------------------------------

vi.mock('../../packages/shared/src/services/shared/apiClient', () => ({
    API_KEY: 'test-api-key',
    MODELS: {
        TEXT: 'gemini-test-model',
        IMAGE: 'imagen-test-model',
        VIDEO: 'veo-test-model',
        TTS: 'tts-test-model',
    },
}));

vi.mock('@langchain/google-genai', () => ({
    ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
        this.invoke = vi.fn();
        return this;
    }),
}));

vi.mock('@langchain/core/prompts', () => ({
    ChatPromptTemplate: {
        fromMessages: vi.fn().mockReturnValue({
            pipe: vi.fn(),
            invoke: vi.fn(),
        }),
    },
}));

vi.mock('@langchain/core/runnables', () => {
    // RunnableSequence.from(...) returns an object whose invoke delegates to mockChainInvoke.
    // mockChainInvoke is created via vi.hoisted so it is accessible in this factory closure.
    const from = vi.fn(() => ({ invoke: mockChainInvoke }));
    return {
        RunnableSequence: { from },
        // RunnableLambda is instantiated with `new`, so the mock must use a function
        // (not an arrow function) to be a valid constructor.
        RunnableLambda: vi.fn().mockImplementation(function (this: Record<string, unknown>, fields: { func: (...a: unknown[]) => unknown }) {
            this.func = fields.func;
            return this;
        }),
    };
});

vi.mock('../../packages/shared/src/services/tracing', () => ({
    traceAsync: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('../../packages/shared/src/services/prompt/personaData', () => ({
    getSystemPersona: vi.fn().mockReturnValue({
        name: 'Test Persona',
        role: 'Director',
        coreRule: 'Be cinematic',
        visualPrinciples: ['Principle 1', 'Principle 2'],
        avoidList: ['Avoid 1'],
    }),
}));

vi.mock('../../packages/shared/src/services/prompt/styleEnhancements', () => ({
    getStyleEnhancement: vi.fn().mockReturnValue({
        mediumDescription: 'Cinematic style',
        keywords: ['dramatic', 'moody', 'high-contrast', 'sharp', 'vivid'],
    }),
}));

vi.mock('../../packages/shared/src/services/prompt/vibeLibrary', () => ({
    getVibeTerms: vi.fn().mockReturnValue([
        { id: 'visceral-dread' },
        { id: 'nostalgic-warmth' },
    ]),
    SCENARIO_TEMPLATES: [],
}));

vi.mock('../../packages/shared/src/services/textSanitizer', () => ({
    cleanForTTS: vi.fn((text: string) => text),
}));

vi.mock('../../packages/shared/src/services/tripletUtils', () => ({
    getEffectiveLegacyTone: vi.fn().mockReturnValue('professional'),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
    ContentPlanSchema,
    ContentPlannerError,
    suggestSceneCount,
    validateContentPlan,
    generateContentPlan,
} from '../../packages/shared/src/services/contentPlannerService';
import type { ContentPlan } from '../../packages/shared/src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalParsedPlan(overrides: Record<string, unknown> = {}): unknown {
    return {
        title: 'Test Video',
        totalDuration: 30,
        targetAudience: 'General audience',
        overallTone: 'professional',
        scenes: [
            {
                id: 'scene-1',
                name: 'Intro',
                duration: 10,
                visualDescription: 'Wide shot of cityscape at golden hour, dramatic lighting',
                narrationScript: 'The city awakens.',
                emotionalTone: 'professional',
                transitionTo: 'dissolve',
            },
            {
                id: 'scene-2',
                name: 'Main',
                duration: 10,
                visualDescription: 'Close-up of hands typing on keyboard, blue light',
                narrationScript: 'Every keystroke tells a story.',
                emotionalTone: 'calm',
                transitionTo: 'fade',
            },
            {
                id: 'scene-3',
                name: 'Outro',
                duration: 10,
                visualDescription: 'Sunset over mountains, warm tones',
                narrationScript: 'The journey continues.',
                emotionalTone: 'friendly',
                transitionTo: 'none',
            },
        ],
        ...overrides,
    };
}

function makeContentPlan(overrides: Partial<ContentPlan> = {}): ContentPlan {
    return {
        title: 'Test Plan',
        totalDuration: 30,
        targetAudience: 'General audience',
        overallTone: 'professional',
        scenes: [
            {
                id: 'scene-1',
                name: 'Intro',
                duration: 10,
                visualDescription: 'Wide shot of city',
                narrationScript: 'The city awakens.',
            },
            {
                id: 'scene-2',
                name: 'Main',
                duration: 10,
                visualDescription: 'Close-up of hands',
                narrationScript: 'Every keystroke tells a story.',
            },
            {
                id: 'scene-3',
                name: 'Outro',
                duration: 10,
                visualDescription: 'Sunset over mountains',
                narrationScript: 'The journey continues.',
            },
        ],
        ...overrides,
    };
}

function setupChainMock(resolvedValue: unknown) {
    mockChainInvoke.mockResolvedValue(resolvedValue);
}

function setupChainMockRejection(error: Error) {
    mockChainInvoke.mockRejectedValue(error);
}

// ---------------------------------------------------------------------------
// Suite 1: ContentPlanSchema Zod validation
// ---------------------------------------------------------------------------

describe('ContentPlanSchema', () => {
    it('accepts a valid minimal plan with one scene', () => {
        const plan = {
            title: 'My Video',
            totalDuration: 60,
            targetAudience: 'Adults',
            overallTone: 'calm',
            scenes: [
                {
                    id: 'scene-1',
                    name: 'Opening',
                    duration: 60,
                    visualDescription: 'A wide shot of the ocean, cinematic blue tones, soft waves',
                    narrationScript: 'The ocean never forgets.',
                },
            ],
        };
        const result = ContentPlanSchema.safeParse(plan);
        expect(result.success).toBe(true);
    });

    it('rejects a plan with no scenes (violates min(1))', () => {
        const plan = {
            title: 'Empty Plan',
            totalDuration: 30,
            targetAudience: 'Anyone',
            overallTone: 'friendly',
            scenes: [],
        };
        const result = ContentPlanSchema.safeParse(plan);
        expect(result.success).toBe(false);
    });

    it('rejects a plan missing required top-level fields', () => {
        const plan = {
            totalDuration: 30,
            scenes: [
                {
                    id: 'scene-1',
                    name: 'Intro',
                    duration: 10,
                    visualDescription: 'Sunset',
                    narrationScript: 'Beautiful.',
                },
            ],
        };
        const result = ContentPlanSchema.safeParse(plan);
        expect(result.success).toBe(false);
    });

    it('rejects a scene with invalid emotionalTone enum value', () => {
        const plan = {
            title: 'My Video',
            totalDuration: 30,
            targetAudience: 'Adults',
            overallTone: 'professional',
            scenes: [
                {
                    id: 'scene-1',
                    name: 'Intro',
                    duration: 10,
                    visualDescription: 'A sunset',
                    narrationScript: 'The end.',
                    emotionalTone: 'exciting', // invalid enum value
                },
            ],
        };
        const result = ContentPlanSchema.safeParse(plan);
        expect(result.success).toBe(false);
    });

    it('accepts optional fields (instructionTriplet, transitionTo, characters)', () => {
        const plan = {
            title: 'Rich Plan',
            totalDuration: 60,
            targetAudience: 'Film students',
            overallTone: 'dramatic',
            characters: [
                {
                    name: 'Hero',
                    appearance: 'Tall, dark-haired man in his 30s',
                    clothing: 'Black leather jacket, worn jeans',
                    distinguishingFeatures: 'Scar on left cheek',
                    consistencyKey: 'tall man, dark hair, leather jacket, scar, intense',
                },
            ],
            scenes: [
                {
                    id: 'scene-1',
                    name: 'Confrontation',
                    duration: 15,
                    visualDescription: 'Medium shot of hero in alley, neon-lit rain',
                    narrationScript: 'He had one chance to make it right.',
                    emotionalTone: 'dramatic',
                    instructionTriplet: {
                        primaryEmotion: 'visceral-dread',
                        cinematicDirection: 'slow-push-in',
                        environmentalAtmosphere: 'neon-rain',
                    },
                    transitionTo: 'dissolve',
                    ambientSfx: 'rain-gentle',
                    shotType: 'medium',
                    cameraMovement: 'zoom-in',
                    lighting: 'neon noir',
                },
            ],
        };
        const result = ContentPlanSchema.safeParse(plan);
        expect(result.success).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Suite 2: suggestSceneCount()
// ---------------------------------------------------------------------------

describe('suggestSceneCount()', () => {
    it('returns minimum of 3 for very short durations', () => {
        expect(suggestSceneCount(10)).toBe(3);
        expect(suggestSceneCount(0)).toBe(3);
    });

    it('returns a proportional count for typical durations', () => {
        // 60s / 12s per scene = 5 scenes
        expect(suggestSceneCount(60)).toBe(5);
        // 120s / 12s per scene = 10 scenes
        expect(suggestSceneCount(120)).toBe(10);
    });

    it('clamps to maximum of 20 for very long durations', () => {
        expect(suggestSceneCount(1200)).toBe(20);
        expect(suggestSceneCount(9999)).toBe(20);
    });

    it('handles the boundary exactly at 12 seconds (1 scene minimum = 3)', () => {
        // 12s / 12 = 1, clamped to min=3
        expect(suggestSceneCount(12)).toBe(3);
        // 36s / 12 = 3, exactly at minimum
        expect(suggestSceneCount(36)).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Suite 3: validateContentPlan()
// ---------------------------------------------------------------------------

describe('validateContentPlan()', () => {
    it('returns valid=true for a well-formed plan', () => {
        const plan = makeContentPlan();
        const result = validateContentPlan(plan);
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it('flags missing title', () => {
        const plan = makeContentPlan({ title: '' });
        const result = validateContentPlan(plan);
        expect(result.valid).toBe(false);
        expect(result.issues).toContain('Missing title');
    });

    it('flags empty scenes array', () => {
        const plan = makeContentPlan({ scenes: [] });
        const result = validateContentPlan(plan);
        expect(result.valid).toBe(false);
        expect(result.issues).toContain('No scenes defined');
    });

    it('flags a scene with missing visualDescription', () => {
        const plan = makeContentPlan({
            scenes: [
                {
                    id: 'scene-1',
                    name: 'Bad Scene',
                    duration: 10,
                    visualDescription: '',
                    narrationScript: 'Some narration.',
                },
            ],
        });
        const result = validateContentPlan(plan);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.includes('Missing visual description'))).toBe(true);
    });

    it('flags a scene with zero or negative duration', () => {
        const plan = makeContentPlan({
            totalDuration: 0,
            scenes: [
                {
                    id: 'scene-1',
                    name: 'Zero Duration',
                    duration: 0,
                    visualDescription: 'Some visual',
                    narrationScript: 'Some narration.',
                },
            ],
        });
        const result = validateContentPlan(plan);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.includes('Invalid duration'))).toBe(true);
    });

    it('flags when total scene duration differs significantly from plan totalDuration', () => {
        // 3 scenes × 10s = 30s, but plan says 100s → diff = 70 > 10
        const plan = makeContentPlan({ totalDuration: 100 });
        const result = validateContentPlan(plan);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.includes('differs significantly'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Suite 4: generateContentPlan() main function
// ---------------------------------------------------------------------------

describe('generateContentPlan()', () => {
    beforeEach(() => {
        mockChainInvoke.mockReset();
    });

    it('throws ContentPlannerError with INVALID_INPUT for empty content', async () => {
        await expect(generateContentPlan('')).rejects.toMatchObject({
            name: 'ContentPlannerError',
            code: 'INVALID_INPUT',
        });
    });

    it('throws ContentPlannerError with INVALID_INPUT for whitespace-only content', async () => {
        await expect(generateContentPlan('   ')).rejects.toMatchObject({
            name: 'ContentPlannerError',
            code: 'INVALID_INPUT',
        });
    });

    it('returns a ContentPlan on success', async () => {
        const mockResult = makeMinimalParsedPlan();
        setupChainMock(mockResult);

        const result = await generateContentPlan('How to make coffee');
        expect(result).toMatchObject({
            title: expect.any(String),
            totalDuration: expect.any(Number),
            scenes: expect.arrayContaining([
                expect.objectContaining({ id: expect.any(String) }),
            ]),
        });
    });

    it('passes targetDuration and sceneCount to chain invoke', async () => {
        setupChainMock(makeMinimalParsedPlan());

        await generateContentPlan('Test topic', { targetDuration: 120, sceneCount: 8 });

        expect(mockChainInvoke).toHaveBeenCalledWith(
            expect.objectContaining({ targetDuration: 120, sceneCount: 8 })
        );
    });

    it('passes custom targetAudience to chain invoke', async () => {
        setupChainMock(makeMinimalParsedPlan());

        await generateContentPlan('Topic', { targetAudience: 'Kids aged 6-10' });

        expect(mockChainInvoke).toHaveBeenCalledWith(
            expect.objectContaining({ targetAudience: 'Kids aged 6-10' })
        );
    });

    it('re-throws ContentPlannerError from chain without wrapping', async () => {
        const original = new ContentPlannerError('Parse failed', 'VALIDATION_ERROR');
        setupChainMockRejection(original);

        await expect(generateContentPlan('Topic')).rejects.toMatchObject({
            code: 'VALIDATION_ERROR',
            message: 'Parse failed',
        });
    });

    it('wraps non-ContentPlannerError from chain into AI_FAILURE', async () => {
        setupChainMockRejection(new Error('Network timeout'));

        await expect(generateContentPlan('Topic')).rejects.toMatchObject({
            name: 'ContentPlannerError',
            code: 'AI_FAILURE',
        });
    });

    it('result scenes have id, duration, visualDescription, and narrationScript', async () => {
        setupChainMock(makeMinimalParsedPlan());

        const result = await generateContentPlan('Nature documentary');
        result.scenes.forEach(scene => {
            expect(scene).toHaveProperty('id');
            expect(scene).toHaveProperty('duration');
            expect(scene).toHaveProperty('visualDescription');
            expect(scene).toHaveProperty('narrationScript');
        });
    });

    it('maps characters when present in AI output', async () => {
        const planWithCharacter = makeMinimalParsedPlan({
            characters: [
                {
                    name: 'Alice',
                    appearance: 'Young woman, red hair',
                    clothing: 'Blue dress',
                    distinguishingFeatures: 'Freckles',
                    consistencyKey: 'young woman, red hair, blue dress, freckles, bright',
                },
            ],
        });
        setupChainMock(planWithCharacter);

        const result = await generateContentPlan('Character story');
        expect(result.characters).toBeDefined();
        expect(result.characters).toHaveLength(1);
        expect(result.characters![0]).toMatchObject({ name: 'Alice', appearance: 'Young woman, red hair' });
    });

    it('uses default options when none are provided', async () => {
        setupChainMock(makeMinimalParsedPlan());

        await generateContentPlan('Simple topic');

        expect(mockChainInvoke).toHaveBeenCalledWith(
            expect.objectContaining({
                targetDuration: 60,
                sceneCount: 5,
                targetAudience: 'General audience',
            })
        );
    });

    it('accepts config object and forwards it to chain creation', async () => {
        setupChainMock(makeMinimalParsedPlan());

        // Should not throw — config is passed through without error
        await expect(
            generateContentPlan('Test', {
                config: { temperature: 0.5, maxRetries: 1, language: 'ar' },
            })
        ).resolves.toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Suite 5: Edge cases
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
    beforeEach(() => {
        mockChainInvoke.mockReset();
    });

    it('suggestSceneCount returns integer for fractional inputs', () => {
        const result = suggestSceneCount(55.5);
        expect(Number.isInteger(result)).toBe(true);
    });

    it('validateContentPlan accumulates multiple issues in one pass', () => {
        const plan: ContentPlan = {
            title: '',
            totalDuration: 999,
            targetAudience: '',
            overallTone: '',
            scenes: [
                {
                    id: 'scene-1',
                    name: 'Bad',
                    duration: -1,
                    visualDescription: '',
                    narrationScript: '',
                },
            ],
        };
        const result = validateContentPlan(plan);
        expect(result.valid).toBe(false);
        expect(result.issues.length).toBeGreaterThanOrEqual(3); // title + visual + narration + duration
    });

    it('validateContentPlan allows duration diff up to 10s without flagging', () => {
        const plan: ContentPlan = {
            title: 'My Video',
            totalDuration: 35, // scene sum = 30, diff = 5 ≤ 10
            targetAudience: 'General',
            overallTone: 'calm',
            scenes: [
                {
                    id: 's1', name: 'A', duration: 15,
                    visualDescription: 'desc', narrationScript: 'narr',
                },
                {
                    id: 's2', name: 'B', duration: 15,
                    visualDescription: 'desc', narrationScript: 'narr',
                },
            ],
        };
        const result = validateContentPlan(plan);
        expect(result.issues.some(i => i.includes('differs significantly'))).toBe(false);
    });

    it('generateContentPlan with a single-word topic succeeds', async () => {
        setupChainMock(makeMinimalParsedPlan());
        await expect(generateContentPlan('Coffee')).resolves.toBeDefined();
    });

    it('generateContentPlan with a very long topic string succeeds', async () => {
        setupChainMock(makeMinimalParsedPlan());
        const longTopic = 'A '.repeat(500) + 'story';
        await expect(generateContentPlan(longTopic)).resolves.toBeDefined();
    });

    it('generateContentPlan with Unicode/emoji topic succeeds', async () => {
        setupChainMock(makeMinimalParsedPlan());
        await expect(generateContentPlan('قصة جميلة 🌙✨')).resolves.toBeDefined();
    });

    it('ContentPlanSchema rejects visualDescription longer than 200 chars', () => {
        const longDesc = 'A'.repeat(201);
        const plan = {
            title: 'Test',
            totalDuration: 10,
            targetAudience: 'General',
            overallTone: 'calm',
            scenes: [
                {
                    id: 's1',
                    name: 'Scene',
                    duration: 10,
                    visualDescription: longDesc,
                    narrationScript: 'Hello.',
                },
            ],
        };
        const result = ContentPlanSchema.safeParse(plan);
        expect(result.success).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Suite 6: ContentPlannerError
// ---------------------------------------------------------------------------

describe('ContentPlannerError', () => {
    it('sets name, message, and code correctly', () => {
        const err = new ContentPlannerError('Something broke', 'AI_FAILURE');
        expect(err.name).toBe('ContentPlannerError');
        expect(err.message).toBe('Something broke');
        expect(err.code).toBe('AI_FAILURE');
    });

    it('stores originalError when provided', () => {
        const cause = new Error('Root cause');
        const err = new ContentPlannerError('Wrapped', 'VALIDATION_ERROR', cause);
        expect(err.originalError).toBe(cause);
    });

    it('is instanceof Error and instanceof ContentPlannerError', () => {
        const err = new ContentPlannerError('Test', 'TIMEOUT');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(ContentPlannerError);
    });
});
