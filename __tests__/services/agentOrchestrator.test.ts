/**
 * Agent Orchestrator Tests
 *
 * Covers:
 * - Stage ordering and execution flow
 * - Progress callbacks (stage, progress, message, currentScene, totalScenes)
 * - Skip flags (skipNarration, skipVisuals, skipValidation)
 * - Graceful degradation on narration, visual, SFX, and validation failures
 * - Cancellation via AbortController
 * - OrchestratorError shape and properties
 * - stageToAppState mapping for all stages
 * - Edge cases: empty topic, single scene, missing config, concurrent abort
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports so Vitest hoists them correctly
// ---------------------------------------------------------------------------

vi.mock('../../packages/shared/src/services/content/contentPlannerService', () => ({
    generateContentPlan: vi.fn(),
}));

vi.mock('../../packages/shared/src/services/media/narratorService', () => ({
    narrateAllScenes: vi.fn(),
}));

vi.mock('../../packages/shared/src/services/content/editorService', () => ({
    validateContentPlan: vi.fn(),
    syncDurationsToNarration: vi.fn((plan: any) => plan),
}));

vi.mock('../../packages/shared/src/services/media/imageService', () => ({
    generateImageFromPrompt: vi.fn(),
}));

vi.mock('../../packages/shared/src/services/media/deapiService', () => ({
    animateImageWithDeApi: vi.fn(),
    isDeApiConfigured: vi.fn(() => false),
    applyStyleConsistency: vi.fn(),
}));

vi.mock('../../packages/shared/src/services/deapiPromptService', () => ({
    enhanceVideoPrompt: vi.fn((p: string) => Promise.resolve(p)),
}));

vi.mock('../../packages/shared/src/services/videoService', () => ({
    generateProfessionalVideo: vi.fn(),
}));

vi.mock('../../packages/shared/src/services/content/promptService', () => ({
    generateMotionPrompt: vi.fn(),
}));

vi.mock('../../packages/shared/src/services/music/sfxService', () => ({
    generateVideoSFXPlan: vi.fn(),
    generateVideoSFXPlanWithAudio: vi.fn(),
    isSFXAudioAvailable: vi.fn(() => false),
}));

vi.mock('../../packages/shared/src/services/content/tripletUtils', () => ({
    getEffectiveLegacyTone: vi.fn(() => 'professional'),
}));

vi.mock('../../packages/shared/src/services/tracing', () => ({
    traceAsync: <TArgs extends unknown[], TReturn>(
        fn: (...args: TArgs) => Promise<TReturn>,
        _name?: string,
        _opts?: unknown
    ) => fn,
    isTracingEnabled: vi.fn(() => false),
}));

vi.mock('../../packages/shared/src/services/ai/production/store', () => ({
    initializeProductionSession: vi.fn(),
    productionStore: new Map(),
    updateProductionSession: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
    runProductionPipeline,
    stageToAppState,
    OrchestratorError,
    type ProductionProgress,
    type ProductionStage,
} from '../../packages/shared/src/services/orchestration/agentOrchestrator';

import { generateContentPlan } from '../../packages/shared/src/services/content/contentPlannerService';
import { narrateAllScenes } from '../../packages/shared/src/services/media/narratorService';
import { validateContentPlan, syncDurationsToNarration } from '../../packages/shared/src/services/content/editorService';
import { generateImageFromPrompt } from '../../packages/shared/src/services/media/imageService';
import { isDeApiConfigured } from '../../packages/shared/src/services/media/deapiService';
import { generateVideoSFXPlan, isSFXAudioAvailable } from '../../packages/shared/src/services/music/sfxService';
import { AppState } from '../../packages/shared/src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockScene = (id = 'scene-1', name = 'Scene One') => ({
    id,
    name,
    duration: 10,
    visualDescription: `Visual description for ${name}`,
    narrationScript: `Narration for ${name}`,
    emotionalTone: 'professional' as const,
});

const mockContentPlan = (sceneCount = 2) => ({
    title: 'Test Video',
    totalDuration: sceneCount * 10,
    targetAudience: 'General',
    scenes: Array.from({ length: sceneCount }, (_, i) =>
        mockScene(`scene-${i + 1}`, `Scene ${i + 1}`)
    ),
    overallTone: 'professional',
});

const mockNarrationSegment = (sceneId: string) => ({
    sceneId,
    audioBlob: new Blob(['audio'], { type: 'audio/mp3' }),
    audioDuration: 8,
    transcript: `Transcript for ${sceneId}`,
});

const mockValidation = (approved = true, score = 85) => ({
    approved,
    score,
    issues: [],
    suggestions: [],
});

const mockSfxPlan = () => ({
    scenes: [],
    backgroundMusic: null,
    masterVolume: 1.0,
});

/** Sets up all mocks for a happy-path run */
function setupHappyPath(sceneCount = 2) {
    const plan = mockContentPlan(sceneCount);

    vi.mocked(generateContentPlan).mockResolvedValue(plan);

    vi.mocked(narrateAllScenes).mockImplementation(
        async (scenes: any[], _config: any, onScene?: (idx: number, total: number) => void) => {
            const segments = scenes.map((s: any) => mockNarrationSegment(s.id));
            onScene?.(scenes.length - 1, scenes.length);
            return segments;
        }
    );

    vi.mocked(generateImageFromPrompt).mockResolvedValue('https://example.com/image.jpg');

    vi.mocked(generateVideoSFXPlan).mockReturnValue(mockSfxPlan() as any);

    vi.mocked(validateContentPlan).mockResolvedValue(mockValidation());

    vi.mocked(syncDurationsToNarration).mockImplementation((p: any) => p);

    return plan;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('runProductionPipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(isDeApiConfigured).mockReturnValue(false);
        vi.mocked(isSFXAudioAvailable).mockReturnValue(false);
    });

    // -----------------------------------------------------------------------
    // Suite 1: Happy-path pipeline execution
    // -----------------------------------------------------------------------

    describe('1. Happy-path pipeline execution', () => {
        it('returns success=true when all stages complete', async () => {
            setupHappyPath();

            const result = await runProductionPipeline('test topic', {
                skipNarration: false,
                skipVisuals: false,
                skipValidation: false,
            });

            expect(result.success).toBe(true);
            expect(result.contentPlan).toBeDefined();
            expect(result.contentPlan.scenes).toHaveLength(2);
        });

        it('populates narrationSegments with one segment per scene', async () => {
            setupHappyPath(3);

            const result = await runProductionPipeline('test topic');

            expect(result.narrationSegments).toHaveLength(3);
            result.narrationSegments.forEach((seg, i) => {
                expect(seg.sceneId).toBe(`scene-${i + 1}`);
            });
        });

        it('populates visuals with one entry per scene', async () => {
            setupHappyPath(2);

            const result = await runProductionPipeline('test topic');

            expect(result.visuals).toHaveLength(2);
            result.visuals.forEach((v) => {
                expect(v.imageUrl).toBe('https://example.com/image.jpg');
            });
        });

        it('accepts a topic object { topic: string }', async () => {
            setupHappyPath();

            const result = await runProductionPipeline({ topic: 'object topic' });

            expect(result.success).toBe(true);
            expect(vi.mocked(generateContentPlan)).toHaveBeenCalledWith(
                'object topic',
                expect.any(Object)
            );
        });

        it('returns an empty errors array on a clean run', async () => {
            setupHappyPath();

            const result = await runProductionPipeline('test topic');

            expect(result.errors).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // Suite 2: Stage ordering
    // -----------------------------------------------------------------------

    describe('2. Stage ordering', () => {
        it('calls content planner before narrator', async () => {
            const order: string[] = [];
            setupHappyPath();

            vi.mocked(generateContentPlan).mockImplementation(async (...args) => {
                order.push('content_planning');
                return mockContentPlan();
            });

            vi.mocked(narrateAllScenes).mockImplementation(async () => {
                order.push('narrating');
                return [mockNarrationSegment('scene-1'), mockNarrationSegment('scene-2')];
            });

            vi.mocked(generateImageFromPrompt).mockImplementation(async () => {
                order.push('generating_visuals');
                return 'https://example.com/image.jpg';
            });

            vi.mocked(validateContentPlan).mockImplementation(async () => {
                order.push('validating');
                return mockValidation();
            });

            await runProductionPipeline('test topic');

            expect(order.indexOf('content_planning')).toBeLessThan(order.indexOf('narrating'));
            expect(order.indexOf('narrating')).toBeLessThan(order.indexOf('generating_visuals'));
            expect(order.indexOf('generating_visuals')).toBeLessThan(order.indexOf('validating'));
        });

        it('calls SFX planning after visual generation but before validation', async () => {
            const order: string[] = [];
            setupHappyPath();

            vi.mocked(generateImageFromPrompt).mockImplementation(async () => {
                order.push('visual');
                return 'https://img.example.com/img.jpg';
            });

            vi.mocked(generateVideoSFXPlan).mockImplementation(() => {
                order.push('sfx');
                return mockSfxPlan() as any;
            });

            vi.mocked(validateContentPlan).mockImplementation(async () => {
                order.push('validation');
                return mockValidation();
            });

            await runProductionPipeline('test topic');

            const visualIdx = order.lastIndexOf('visual');
            const sfxIdx = order.indexOf('sfx');
            const validIdx = order.indexOf('validation');

            expect(sfxIdx).toBeGreaterThan(visualIdx);
            expect(sfxIdx).toBeLessThan(validIdx);
        });
    });

    // -----------------------------------------------------------------------
    // Suite 3: Progress callbacks
    // -----------------------------------------------------------------------

    describe('3. Progress callbacks', () => {
        it('fires a content_planning progress event with progress=0 first', async () => {
            setupHappyPath();
            const events: ProductionProgress[] = [];

            await runProductionPipeline('test topic', {}, (p) => events.push(p));

            const first = events[0];
            expect(first).toBeDefined();
            expect(first!.stage).toBe('content_planning');
            expect(first!.progress).toBe(0);
        });

        it('fires a complete progress event at the end', async () => {
            setupHappyPath();
            const events: ProductionProgress[] = [];

            await runProductionPipeline('test topic', {}, (p) => events.push(p));

            const last = events[events.length - 1];
            expect(last).toBeDefined();
            expect(last!.stage).toBe('complete');
            expect(last!.progress).toBe(100);
        });

        it('fires narrating events with currentScene and totalScenes', async () => {
            setupHappyPath(3);
            const events: ProductionProgress[] = [];

            await runProductionPipeline('test topic', {}, (p) => events.push(p));

            const narratingEvents = events.filter((e) => e.stage === 'narrating');
            const withScene = narratingEvents.filter((e) => e.currentScene !== undefined);
            expect(withScene.length).toBeGreaterThan(0);

            withScene.forEach((e) => {
                expect(e.totalScenes).toBe(3);
                expect(e.currentScene).toBeGreaterThanOrEqual(1);
            });
        });

        it('fires generating_visuals events for each scene', async () => {
            setupHappyPath(2);
            const events: ProductionProgress[] = [];

            await runProductionPipeline('test topic', {}, (p) => events.push(p));

            const visualEvents = events.filter((e) => e.stage === 'generating_visuals');
            expect(visualEvents.length).toBeGreaterThan(0);
        });

        it('fires validating events when validation is not skipped', async () => {
            setupHappyPath();
            const events: ProductionProgress[] = [];

            await runProductionPipeline('test topic', { skipValidation: false }, (p) => events.push(p));

            const validatingEvents = events.filter((e) => e.stage === 'validating');
            expect(validatingEvents.length).toBeGreaterThanOrEqual(1);
        });

        it('does NOT fire narrating events when skipNarration=true', async () => {
            setupHappyPath();
            const events: ProductionProgress[] = [];

            await runProductionPipeline('test topic', { skipNarration: true }, (p) => events.push(p));

            const narratingEvents = events.filter((e) => e.stage === 'narrating');
            expect(narratingEvents).toHaveLength(0);
        });

        it('does NOT fire generating_visuals events when skipVisuals=true', async () => {
            setupHappyPath();
            const events: ProductionProgress[] = [];

            await runProductionPipeline('test topic', { skipVisuals: true }, (p) => events.push(p));

            const visualEvents = events.filter((e) => e.stage === 'generating_visuals');
            expect(visualEvents).toHaveLength(0);
        });

        it('progress values are between 0 and 100 inclusive', async () => {
            setupHappyPath();
            const events: ProductionProgress[] = [];

            await runProductionPipeline('test topic', {}, (p) => events.push(p));

            events.forEach((e) => {
                expect(e.progress).toBeGreaterThanOrEqual(0);
                expect(e.progress).toBeLessThanOrEqual(100);
            });
        });
    });

    // -----------------------------------------------------------------------
    // Suite 4: Skip flags
    // -----------------------------------------------------------------------

    describe('4. Skip flags', () => {
        it('skipNarration=true does not call narrateAllScenes', async () => {
            setupHappyPath();

            await runProductionPipeline('test topic', { skipNarration: true });

            expect(vi.mocked(narrateAllScenes)).not.toHaveBeenCalled();
        });

        it('skipNarration=true produces empty narrationSegments', async () => {
            setupHappyPath();

            const result = await runProductionPipeline('test topic', { skipNarration: true });

            expect(result.narrationSegments).toHaveLength(0);
        });

        it('skipVisuals=true does not call generateImageFromPrompt', async () => {
            setupHappyPath();

            await runProductionPipeline('test topic', { skipVisuals: true });

            expect(vi.mocked(generateImageFromPrompt)).not.toHaveBeenCalled();
        });

        it('skipVisuals=true creates placeholder visuals (empty imageUrl)', async () => {
            setupHappyPath(2);

            const result = await runProductionPipeline('test topic', { skipVisuals: true });

            expect(result.visuals).toHaveLength(2);
            result.visuals.forEach((v) => {
                expect(v.imageUrl).toBe('');
            });
        });

        it('skipValidation=true does not call validateContentPlan', async () => {
            setupHappyPath();

            await runProductionPipeline('test topic', { skipValidation: true });

            expect(vi.mocked(validateContentPlan)).not.toHaveBeenCalled();
        });

        it('skipValidation=true sets validation score to 100 and approved=true', async () => {
            setupHappyPath();

            const result = await runProductionPipeline('test topic', { skipValidation: true });

            expect(result.validation.approved).toBe(true);
            expect(result.validation.score).toBe(100);
        });

        it('all three skips together still returns success=true', async () => {
            setupHappyPath();

            const result = await runProductionPipeline('test topic', {
                skipNarration: true,
                skipVisuals: true,
                skipValidation: true,
            });

            // With skipNarration and skipVisuals both true, success depends on hasContent
            // Content plan exists, skips count as "satisfied" per pipeline logic
            expect(result.contentPlan).toBeDefined();
            expect(result.success).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Suite 5: Graceful degradation
    // -----------------------------------------------------------------------

    describe('5. Graceful degradation', () => {
        it('continues without narration when narrateAllScenes throws', async () => {
            setupHappyPath();
            vi.mocked(narrateAllScenes).mockRejectedValue(new Error('TTS service unavailable'));

            const result = await runProductionPipeline('test topic', { skipNarration: false });

            // Should not throw — graceful degradation
            expect(result.narrationSegments).toHaveLength(0);
            expect(result.errors?.some((e) => e.includes('Narration failed'))).toBe(true);
        });

        it('records narration failure error message', async () => {
            setupHappyPath();
            vi.mocked(narrateAllScenes).mockRejectedValue(new Error('quota exceeded'));

            const result = await runProductionPipeline('test topic');

            expect(result.errors?.some((e) => e.includes('quota exceeded'))).toBe(true);
        });

        it('continues with placeholder when generateImageFromPrompt throws', async () => {
            setupHappyPath();
            vi.mocked(generateImageFromPrompt).mockRejectedValue(new Error('Imagen API error'));

            const result = await runProductionPipeline('test topic', { skipNarration: true });

            expect(result.visuals).toHaveLength(2);
            result.visuals.forEach((v) => {
                expect(v.imageUrl).toBe('');
            });
        });

        it('records visual generation failure errors', async () => {
            setupHappyPath();
            // Use a non-retryable error message to avoid exponential backoff delays in tests
            vi.mocked(generateImageFromPrompt).mockRejectedValue(new Error('image generation refused'));

            const result = await runProductionPipeline('test topic', { skipNarration: true });

            expect(result.errors?.some((e) => e.includes('image generation refused'))).toBe(true);
        }, 30000);

        it('continues with empty sfxPlan when SFX planning fails', async () => {
            setupHappyPath();
            vi.mocked(generateVideoSFXPlan).mockImplementation(() => {
                throw new Error('SFX service down');
            });

            const result = await runProductionPipeline('test topic', {
                skipNarration: true,
                skipVisuals: true,
            });

            expect(result.sfxPlan).not.toBeNull();
            expect(result.sfxPlan!.scenes).toEqual([]);
        });

        it('records SFX failure error message', async () => {
            setupHappyPath();
            vi.mocked(generateVideoSFXPlan).mockImplementation(() => {
                throw new Error('Freesound unavailable');
            });

            const result = await runProductionPipeline('test topic', {
                skipNarration: true,
                skipVisuals: true,
            });

            expect(result.errors?.some((e) => e.includes('SFX planning failed'))).toBe(true);
        });

        it('uses fallback validation when validateContentPlan throws', async () => {
            setupHappyPath();
            vi.mocked(validateContentPlan).mockRejectedValue(new Error('Editor agent timeout'));

            const result = await runProductionPipeline('test topic', {
                skipNarration: true,
                skipVisuals: true,
            });

            // Fallback: approved=true with conservative score
            expect(result.validation.approved).toBe(true);
            expect(result.validation.score).toBe(70);
        });

        it('records validation failure error message', async () => {
            setupHappyPath();
            // Use a non-retryable error message to avoid exponential backoff delays in tests
            vi.mocked(validateContentPlan).mockRejectedValue(new Error('validation parse error'));

            const result = await runProductionPipeline('test topic', {
                skipNarration: true,
                skipVisuals: true,
            });

            expect(result.errors?.some((e) => e.includes('Validation failed'))).toBe(true);
        }, 30000);

        it('partial visual failure still fills result.visuals for successful scenes', async () => {
            // 3-scene plan: scene 1 fails, scenes 2+3 succeed
            const plan = mockContentPlan(3);
            vi.mocked(generateContentPlan).mockResolvedValue(plan);
            vi.mocked(narrateAllScenes).mockResolvedValue([]);
            vi.mocked(generateVideoSFXPlan).mockReturnValue(mockSfxPlan() as any);
            vi.mocked(validateContentPlan).mockResolvedValue(mockValidation());
            vi.mocked(syncDurationsToNarration).mockImplementation((p: any) => p);

            let callCount = 0;
            vi.mocked(generateImageFromPrompt).mockImplementation(async () => {
                callCount++;
                if (callCount === 1) throw new Error('first scene failed');
                return 'https://img.example.com/ok.jpg';
            });

            const result = await runProductionPipeline('test topic', { skipNarration: true });

            expect(result.visuals).toHaveLength(3);
            const successes = result.visuals.filter((v) => v.imageUrl !== '');
            expect(successes).toHaveLength(2);
        });
    });

    // -----------------------------------------------------------------------
    // Suite 6: Cancellation via AbortController
    // -----------------------------------------------------------------------

    describe('6. Cancellation via AbortController', () => {
        it('throws OrchestratorError when signal is aborted before pipeline starts', async () => {
            setupHappyPath();

            // Abort before pipeline starts content planning
            vi.mocked(generateContentPlan).mockImplementation(async () => {
                throw new Error('Production pipeline was cancelled');
            });

            const controller = new AbortController();
            controller.abort();

            await expect(
                runProductionPipeline('test topic', {}, undefined, controller.signal)
            ).rejects.toThrow(OrchestratorError);
        });

        it('throws OrchestratorError with "cancelled" in message when aborted', async () => {
            setupHappyPath();

            vi.mocked(generateContentPlan).mockImplementation(async () => {
                throw new Error('Production pipeline was cancelled');
            });

            const controller = new AbortController();
            controller.abort();

            let thrownError: unknown;
            try {
                await runProductionPipeline('test topic', {}, undefined, controller.signal);
            } catch (err) {
                thrownError = err;
            }

            expect(thrownError).toBeInstanceOf(OrchestratorError);
            expect((thrownError as OrchestratorError).message).toContain('cancelled');
        });

        it('OrchestratorError from cancellation has a stage property', async () => {
            vi.mocked(generateContentPlan).mockImplementation(async () => {
                throw new Error('Production pipeline was cancelled');
            });

            const controller = new AbortController();
            controller.abort();

            let thrownError: unknown;
            try {
                await runProductionPipeline('test topic', {}, undefined, controller.signal);
            } catch (err) {
                thrownError = err;
            }

            expect((thrownError as OrchestratorError).stage).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Suite 7: OrchestratorError shape
    // -----------------------------------------------------------------------

    describe('7. OrchestratorError shape', () => {
        it('is an instance of Error', () => {
            const err = new OrchestratorError('msg', 'content_planning');
            expect(err).toBeInstanceOf(Error);
        });

        it('has name "OrchestratorError"', () => {
            const err = new OrchestratorError('msg', 'content_planning');
            expect(err.name).toBe('OrchestratorError');
        });

        it('exposes the stage it was created with', () => {
            const err = new OrchestratorError('msg', 'narrating');
            expect(err.stage).toBe('narrating');
        });

        it('exposes originalError when provided', () => {
            const original = new Error('root cause');
            const err = new OrchestratorError('wrapped', 'validating', original);
            expect(err.originalError).toBe(original);
        });

        it('originalError is undefined when not provided', () => {
            const err = new OrchestratorError('msg', 'complete');
            expect(err.originalError).toBeUndefined();
        });

        it('message is accessible', () => {
            const err = new OrchestratorError('something broke', 'generating_visuals');
            expect(err.message).toBe('something broke');
        });

        it('wraps a non-OrchestratorError from a fatal pipeline failure', async () => {
            vi.mocked(generateContentPlan).mockRejectedValue(new Error('fatal API error'));

            let thrownError: unknown;
            try {
                await runProductionPipeline('test topic');
            } catch (err) {
                thrownError = err;
            }

            expect(thrownError).toBeInstanceOf(OrchestratorError);
            expect((thrownError as OrchestratorError).originalError).toBeInstanceOf(Error);
            expect((thrownError as OrchestratorError).originalError!.message).toBe('fatal API error');
        });

        it('throws OrchestratorError (not plain Error) when content planning fails', async () => {
            vi.mocked(generateContentPlan).mockRejectedValue(new Error('content plan error'));

            await expect(runProductionPipeline('test topic')).rejects.toBeInstanceOf(OrchestratorError);
        });
    });

    // -----------------------------------------------------------------------
    // Suite 8: stageToAppState mapping
    // -----------------------------------------------------------------------

    describe('8. stageToAppState mapping', () => {
        const cases: Array<[ProductionStage, AppState]> = [
            ['content_planning', AppState.CONTENT_PLANNING],
            ['narrating', AppState.NARRATING],
            ['generating_visuals', AppState.GENERATING_PROMPTS],
            ['animating_visuals', AppState.GENERATING_PROMPTS],
            ['applying_style_consistency', AppState.IDLE],
            ['validating', AppState.VALIDATING],
            ['adjusting', AppState.VALIDATING],
            ['complete', AppState.READY],
        ];

        cases.forEach(([stage, expectedAppState]) => {
            it(`maps "${stage}" → AppState.${expectedAppState}`, () => {
                expect(stageToAppState(stage)).toBe(expectedAppState);
            });
        });

        it('returns AppState.IDLE for an unknown stage value', () => {
            expect(stageToAppState('unknown_stage' as ProductionStage)).toBe(AppState.IDLE);
        });
    });

    // -----------------------------------------------------------------------
    // Suite 9: SFX planning stage
    // -----------------------------------------------------------------------

    describe('9. SFX planning stage', () => {
        it('attaches a non-null sfxPlan to the result on success', async () => {
            setupHappyPath();

            const result = await runProductionPipeline('test topic', {
                skipNarration: true,
                skipVisuals: true,
            });

            expect(result.sfxPlan).not.toBeNull();
        });

        it('sfxPlan has scenes array', async () => {
            setupHappyPath();

            const result = await runProductionPipeline('test topic', {
                skipNarration: true,
                skipVisuals: true,
            });

            expect(Array.isArray(result.sfxPlan!.scenes)).toBe(true);
        });

        it('passes video purpose from contentPlannerConfig to SFX planner', async () => {
            setupHappyPath();

            await runProductionPipeline('test topic', {
                skipNarration: true,
                skipVisuals: true,
                contentPlannerConfig: { videoPurpose: 'educational' } as any,
            });

            expect(vi.mocked(generateVideoSFXPlan)).toHaveBeenCalledWith(
                expect.any(Array),
                'educational'
            );
        });

        it('defaults video purpose to "documentary" when not specified', async () => {
            setupHappyPath();

            await runProductionPipeline('test topic', {
                skipNarration: true,
                skipVisuals: true,
            });

            expect(vi.mocked(generateVideoSFXPlan)).toHaveBeenCalledWith(
                expect.any(Array),
                'documentary'
            );
        });
    });

    // -----------------------------------------------------------------------
    // Suite 10: Edge cases
    // -----------------------------------------------------------------------

    describe('10. Edge cases', () => {
        it('handles a single-scene content plan without throwing', async () => {
            vi.mocked(generateContentPlan).mockResolvedValue(mockContentPlan(1));
            vi.mocked(narrateAllScenes).mockResolvedValue([mockNarrationSegment('scene-1')]);
            vi.mocked(generateImageFromPrompt).mockResolvedValue('https://img.example.com/a.jpg');
            vi.mocked(generateVideoSFXPlan).mockReturnValue(mockSfxPlan() as any);
            vi.mocked(validateContentPlan).mockResolvedValue(mockValidation());
            vi.mocked(syncDurationsToNarration).mockImplementation((p: any) => p);

            const result = await runProductionPipeline('single scene topic');

            expect(result.success).toBe(true);
            expect(result.visuals).toHaveLength(1);
        });

        it('handles empty topic string (passes it through to content planner)', async () => {
            setupHappyPath();

            await runProductionPipeline('');

            expect(vi.mocked(generateContentPlan)).toHaveBeenCalledWith('', expect.any(Object));
        });

        it('merges provided config over defaults without mutating the original config', async () => {
            setupHappyPath();
            const config = { sceneCount: 4, targetDuration: 30 };
            const originalConfig = { ...config };

            await runProductionPipeline('test topic', config);

            expect(config).toEqual(originalConfig);
        });

        it('passes sceneCount from config to generateContentPlan', async () => {
            setupHappyPath();

            await runProductionPipeline('test topic', { sceneCount: 7 });

            expect(vi.mocked(generateContentPlan)).toHaveBeenCalledWith(
                'test topic',
                expect.objectContaining({ sceneCount: 7 })
            );
        });

        it('passes targetDuration from config to generateContentPlan', async () => {
            setupHappyPath();

            await runProductionPipeline('test topic', { targetDuration: 120 });

            expect(vi.mocked(generateContentPlan)).toHaveBeenCalledWith(
                'test topic',
                expect.objectContaining({ targetDuration: 120 })
            );
        });

        it('works with no onProgress callback (undefined)', async () => {
            setupHappyPath();

            await expect(runProductionPipeline('test topic', {}, undefined)).resolves.not.toThrow();
        });

        it('result.validation is always defined on success', async () => {
            setupHappyPath();

            const result = await runProductionPipeline('test topic');

            expect(result.validation).toBeDefined();
            expect(typeof result.validation.score).toBe('number');
            expect(typeof result.validation.approved).toBe('boolean');
        });

        it('syncs scene durations to narration when narration succeeds', async () => {
            setupHappyPath(2);

            await runProductionPipeline('test topic');

            expect(vi.mocked(syncDurationsToNarration)).toHaveBeenCalledTimes(1);
        });

        it('does NOT sync durations when narration segments are empty (graceful degradation path)', async () => {
            setupHappyPath(2);
            vi.mocked(narrateAllScenes).mockRejectedValue(new Error('TTS down'));

            await runProductionPipeline('test topic');

            expect(vi.mocked(syncDurationsToNarration)).not.toHaveBeenCalled();
        });

        it('handles a large scene count (10 scenes) without throwing', async () => {
            const bigPlan = mockContentPlan(10);
            vi.mocked(generateContentPlan).mockResolvedValue(bigPlan);
            vi.mocked(narrateAllScenes).mockResolvedValue(
                bigPlan.scenes.map((s) => mockNarrationSegment(s.id))
            );
            vi.mocked(generateImageFromPrompt).mockResolvedValue('https://img.example.com/x.jpg');
            vi.mocked(generateVideoSFXPlan).mockReturnValue(mockSfxPlan() as any);
            vi.mocked(validateContentPlan).mockResolvedValue(mockValidation());
            vi.mocked(syncDurationsToNarration).mockImplementation((p: any) => p);

            const result = await runProductionPipeline('large scale topic');

            expect(result.success).toBe(true);
            expect(result.visuals).toHaveLength(10);
        });
    });
});
