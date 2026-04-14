/**
 * Story Pipeline — targetDurationSeconds forwarding tests
 *
 * Verifies that targetDurationSeconds flows from StoryPipelineOptions
 * through to formatOptions passed to generateBreakdown/generateScreenplay.
 *
 * This tests Fix #2 (pipeline.ts forwarding) end-to-end through the
 * pipeline orchestrator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all heavy dependencies
// ---------------------------------------------------------------------------

vi.mock('../../packages/shared/src/services/shared/apiClient', () => ({
  GEMINI_API_KEY: 'test-key',
  MODELS: { TEXT: 'gemini-test', IMAGE: 'imagen-test', VIDEO: 'veo-test', TTS: 'tts-test' },
  ai: {},
}));

vi.mock('../../packages/shared/src/services/infrastructure/logger', () => ({
  agentLogger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock('../../packages/shared/src/services/ai/production/store', () => ({
  storyModeStore: new Map(),
}));

vi.mock('../../packages/shared/src/services/audio-processing/textSanitizer', () => ({
  cleanForTTS: vi.fn((text: string) => text),
}));

vi.mock('../../packages/shared/src/services/content/languageDetector', () => ({
  detectLanguage: vi.fn().mockReturnValue('en'),
}));

vi.mock('../../packages/shared/src/services/prompt/templateLoader', () => ({
  loadTemplate: vi.fn((_formatId: string, _phase: string) =>
    '{{idea}} {{genre}} {{language_instruction}} {{research}} {{references}} {{minDuration}} {{maxDuration}} {{breakdown}} {{actCount}}'
  ),
  substituteVariables: vi.fn((template: string, vars: Record<string, string>) => {
    return Object.entries(vars).reduce(
      (tpl, [key, val]) => tpl.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val),
      template
    );
  }),
}));

vi.mock('../../packages/shared/src/services/format/formatRegistry', () => ({
  formatRegistry: {
    getFormat: vi.fn((_id: string) => ({
      id: 'movie-animation',
      name: 'Movie Animation',
      durationRange: { min: 300, max: 1800 },
    })),
  },
}));

const { mockInvoke, mockWithStructuredOutput } = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockWithStructuredOutput = vi.fn(() => ({ invoke: mockInvoke }));
  return { mockInvoke, mockWithStructuredOutput };
});

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation(function () {
    return { withStructuredOutput: mockWithStructuredOutput };
  }),
}));

vi.mock('../../packages/shared/src/services/media/imageService', () => ({
  generateImageFromPrompt: vi.fn(),
}));
vi.mock('../../packages/shared/src/services/prompt/imageStyleGuide', () => ({
  buildImageStyleGuide: vi.fn(() => 'style-guide'),
}));
vi.mock('../../packages/shared/src/services/cloud/cloudStorageService', () => ({
  cloudAutosave: {
    initSession: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../packages/shared/src/services/orchestration/parallelExecutionEngine', () => ({
  ParallelExecutionEngine: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue([]),
  })),
}));

// ---------------------------------------------------------------------------
// Subject imports
// ---------------------------------------------------------------------------

import { runStoryPipeline } from '../../packages/shared/src/services/ai/storyPipeline';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runStoryPipeline — targetDurationSeconds forwarding', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockWithStructuredOutput.mockReturnValue({ invoke: mockInvoke });
  });

  it('passes targetDurationSeconds through to breakdown prompt', async () => {
    // Step 1 (breakdown) → returns acts
    mockInvoke.mockResolvedValueOnce({
      acts: [{ title: 'Act 1', emotionalHook: 'Curiosity', narrativeBeat: 'The journey begins' }],
    });
    // Step 2 (screenplay) → returns scenes
    mockInvoke.mockResolvedValueOnce({
      scenes: [{
        id: 's1', sceneNumber: 1, heading: 'INT. LAB', action: 'Scientist works',
        dialogue: [], charactersPresent: [],
      }],
    });
    // Step 3 (characters) → returns characters
    mockInvoke.mockResolvedValueOnce({ characters: [] });
    // Step 4 (voiceovers) → returns voiceovers
    mockInvoke.mockResolvedValueOnce({ voiceovers: [] });

    await runStoryPipeline({
      topic: 'Robots in space',
      formatId: 'movie-animation',
      targetDurationSeconds: 300,
    });

    // First LLM call is the breakdown — check its prompt
    // 300s = 5 min → min = 4.75, max = 5.25
    const breakdownPrompt: string = mockInvoke.mock.calls[0][0];
    expect(breakdownPrompt).toContain('4.75');
    expect(breakdownPrompt).toContain('5.25');
  });

  it('passes targetDurationSeconds through to screenplay prompt', async () => {
    mockInvoke.mockResolvedValueOnce({
      acts: [{ title: 'Act 1', emotionalHook: 'Curiosity', narrativeBeat: 'The journey begins' }],
    });
    mockInvoke.mockResolvedValueOnce({
      scenes: [{
        id: 's1', sceneNumber: 1, heading: 'INT. LAB', action: 'Scientist works',
        dialogue: [], charactersPresent: [],
      }],
    });
    mockInvoke.mockResolvedValueOnce({ characters: [] });
    mockInvoke.mockResolvedValueOnce({ voiceovers: [] });

    await runStoryPipeline({
      topic: 'Robots in space',
      formatId: 'movie-animation',
      targetDurationSeconds: 180,
    });

    // Second LLM call is the screenplay
    const screenplayPrompt: string = mockInvoke.mock.calls[1][0];
    expect(screenplayPrompt).toContain('Target duration:');
    expect(screenplayPrompt).toContain('2.75');
    expect(screenplayPrompt).toContain('3.25');
  });

  it('does not include duration guidance when targetDurationSeconds is omitted', async () => {
    mockInvoke.mockResolvedValueOnce({
      acts: [{ title: 'Act 1', emotionalHook: 'Curiosity', narrativeBeat: 'The journey begins' }],
    });
    mockInvoke.mockResolvedValueOnce({
      scenes: [{
        id: 's1', sceneNumber: 1, heading: 'INT. LAB', action: 'Scientist works',
        dialogue: [], charactersPresent: [],
      }],
    });
    mockInvoke.mockResolvedValueOnce({ characters: [] });
    mockInvoke.mockResolvedValueOnce({ voiceovers: [] });

    await runStoryPipeline({
      topic: 'Robots in space',
      formatId: 'movie-animation',
      // no targetDurationSeconds
    });

    // Breakdown prompt should use registry defaults (5-30)
    const breakdownPrompt: string = mockInvoke.mock.calls[0][0];
    expect(breakdownPrompt).toContain('5');
    expect(breakdownPrompt).toContain('30');

    // Screenplay prompt should not have duration guidance
    const screenplayPrompt: string = mockInvoke.mock.calls[1][0];
    expect(screenplayPrompt).not.toContain('Target duration:');
  });

  it('does not compose formatOptions when formatId is omitted (no duration forwarded)', async () => {
    mockInvoke.mockResolvedValueOnce({
      acts: [{ title: 'Act 1', emotionalHook: 'Curiosity', narrativeBeat: 'The journey begins' }],
    });
    mockInvoke.mockResolvedValueOnce({
      scenes: [{
        id: 's1', sceneNumber: 1, heading: 'INT. LAB', action: 'Scientist works',
        dialogue: [], charactersPresent: [],
      }],
    });
    mockInvoke.mockResolvedValueOnce({ characters: [] });
    mockInvoke.mockResolvedValueOnce({ voiceovers: [] });

    await runStoryPipeline({
      topic: 'Robots in space',
      // no formatId — formatOptions will be undefined
      targetDurationSeconds: 300,
    });

    // Without formatId, formatOptions is undefined → defaults are used
    // Breakdown still uses registry defaults
    const breakdownPrompt: string = mockInvoke.mock.calls[0][0];
    expect(breakdownPrompt).toContain('5');
    expect(breakdownPrompt).toContain('30');
  });
});
