/**
 * Story Pipeline Tests
 *
 * Covers:
 * - estimateDurationSeconds: basic calculation, zero input, large input
 * - validateDurationConstraint: valid range, too short, too long, exact boundaries
 * - countScriptWords: empty scenes, action only, dialogue only, mixed, whitespace edge cases
 * - buildBreakdownPrompt: returns string containing topic, auto language detection, research block,
 *   reference block, genre, explicit language override
 * - buildScreenplayPrompt: returns string with act data, research block, reference block
 * - generateVoiceoverScripts: LLM success, LLM failure fallback, empty scene list
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — hoisted before subject imports
// ---------------------------------------------------------------------------

vi.mock('../../packages/shared/src/services/shared/apiClient', () => ({
  GEMINI_API_KEY: 'test-key',
  MODELS: { TEXT: 'gemini-test', IMAGE: 'imagen-test', VIDEO: 'veo-test', TTS: 'tts-test' },
  ai: {},
}));

vi.mock('../../packages/shared/src/services/logger', () => ({
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

vi.mock('../../packages/shared/src/services/textSanitizer', () => ({
  cleanForTTS: vi.fn((text: string) => text),
}));

vi.mock('../../packages/shared/src/services/languageDetector', () => ({
  detectLanguage: vi.fn().mockReturnValue('en'),
}));

// Mock templateLoader to return controllable templates
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

// Mock formatRegistry to return a controlled format
vi.mock('../../packages/shared/src/services/formatRegistry', () => ({
  formatRegistry: {
    getFormat: vi.fn((_id: string) => ({
      id: 'movie-animation',
      name: 'Movie Animation',
      durationRange: { min: 300, max: 1800 },
    })),
  },
}));

// Mock LangChain ChatGoogleGenerativeAI — use vi.hoisted so these refs are available
// when the vi.mock factory is hoisted to the top of the module by Vitest.
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

// Mock other heavy deps so the module loads cleanly
vi.mock('../../packages/shared/src/services/imageService', () => ({
  generateImageFromPrompt: vi.fn(),
}));
vi.mock('../../packages/shared/src/services/prompt/imageStyleGuide', () => ({
  buildImageStyleGuide: vi.fn(() => 'style-guide'),
}));
vi.mock('../../packages/shared/src/services/cloudStorageService', () => ({
  cloudAutosave: vi.fn(),
}));
vi.mock('../../packages/shared/src/services/parallelExecutionEngine', () => ({
  ParallelExecutionEngine: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue([]),
  })),
}));

// ---------------------------------------------------------------------------
// Subject imports (after mocks)
// ---------------------------------------------------------------------------

import {
  estimateDurationSeconds,
  validateDurationConstraint,
  countScriptWords,
  buildBreakdownPrompt,
  buildScreenplayPrompt,
  generateVoiceoverScripts,
} from '../../packages/shared/src/services/ai/storyPipeline';
import type { ScreenplayScene, FormatMetadata } from '../../packages/shared/src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene(
  id: string,
  action: string,
  dialogue: Array<{ speaker: string; text: string }> = []
): ScreenplayScene {
  return {
    id,
    sceneNumber: 1,
    heading: 'INT. ROOM - DAY',
    action,
    dialogue,
    charactersPresent: [],
  };
}

function makeFormatMeta(min: number, max: number): FormatMetadata {
  return {
    id: 'movie-animation',
    name: 'Movie Animation',
    description: 'Test format',
    icon: 'film',
    durationRange: { min, max },
    aspectRatio: '16:9',
    applicableGenres: ['Drama'],
    checkpointCount: 3,
    concurrencyLimit: 2,
    requiresResearch: false,
    supportedLanguages: ['en', 'ar'],
  };
}

// ---------------------------------------------------------------------------
// estimateDurationSeconds
// ---------------------------------------------------------------------------

describe('estimateDurationSeconds', () => {
  const WORDS_PER_SECOND = 140 / 60; // ~2.333

  it('returns ceil(wordCount / wps) for a typical word count', () => {
    const words = 140; // exactly 60 seconds at 140 wpm
    expect(estimateDurationSeconds(words)).toBe(60);
  });

  it('returns 0 for zero words', () => {
    expect(estimateDurationSeconds(0)).toBe(0);
  });

  it('rounds up fractional seconds', () => {
    // 1 word → 1 / 2.333... ≈ 0.43 → ceil = 1
    expect(estimateDurationSeconds(1)).toBe(1);
  });

  it('handles large word counts (10k words)', () => {
    const words = 10000;
    const expected = Math.ceil(words / WORDS_PER_SECOND);
    expect(estimateDurationSeconds(words)).toBe(expected);
  });

  it('is deterministic for same input', () => {
    expect(estimateDurationSeconds(500)).toBe(estimateDurationSeconds(500));
  });
});

// ---------------------------------------------------------------------------
// validateDurationConstraint
// ---------------------------------------------------------------------------

describe('validateDurationConstraint', () => {
  // 140 wpm = 140/60 wps; 300 words → ceil(300 / 2.333) = ceil(128.57) = 129 seconds
  it('returns valid:true when duration falls within format range', () => {
    const meta = makeFormatMeta(60, 600); // 1-10 min
    // 200 words → ~86 seconds — well within range
    const result = validateDurationConstraint(200, meta);
    expect(result.valid).toBe(true);
    expect(result.estimatedSeconds).toBeGreaterThan(0);
    expect(result.message).toBeUndefined();
  });

  it('returns valid:false when script is too short', () => {
    const meta = makeFormatMeta(300, 1800); // 5-30 min
    // 1 word → 1 second — well below 300 seconds minimum
    const result = validateDurationConstraint(1, meta);
    expect(result.valid).toBe(false);
    expect(result.estimatedSeconds).toBeLessThan(300);
    expect(result.message).toContain('too short');
    expect(result.message).toContain('Movie Animation');
  });

  it('returns valid:false when script is too long', () => {
    const meta = makeFormatMeta(60, 120); // 1-2 min
    // 5000 words → >2000 seconds — far above 120 second maximum
    const result = validateDurationConstraint(5000, meta);
    expect(result.valid).toBe(false);
    expect(result.estimatedSeconds).toBeGreaterThan(120);
    expect(result.message).toContain('too long');
    expect(result.message).toContain('Movie Animation');
  });

  it('is valid at exactly the minimum boundary', () => {
    const meta = makeFormatMeta(60, 600);
    // Find a word count that produces exactly 60 seconds
    // ceil(words / 2.333) = 60  →  words = 60 * 2.333... = 140
    const result = validateDurationConstraint(140, meta);
    expect(result.valid).toBe(true);
    expect(result.estimatedSeconds).toBe(60);
  });

  it('is valid at exactly the maximum boundary', () => {
    const meta = makeFormatMeta(60, 600);
    // ceil(words / 2.333) = 600  →  words = 600 * 2.333... = 1400
    const result = validateDurationConstraint(1400, meta);
    expect(result.valid).toBe(true);
    expect(result.estimatedSeconds).toBe(600);
  });

  it('exposes estimatedSeconds even on invalid result', () => {
    const meta = makeFormatMeta(300, 1800);
    const result = validateDurationConstraint(10, meta);
    expect(result.estimatedSeconds).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// countScriptWords
// ---------------------------------------------------------------------------

describe('countScriptWords', () => {
  it('returns 0 for an empty scene array', () => {
    expect(countScriptWords([])).toBe(0);
  });

  it('counts words in action only (no dialogue)', () => {
    const scenes = [makeScene('s1', 'The hero runs away quickly')]; // 5 words
    expect(countScriptWords(scenes)).toBe(5);
  });

  it('counts words in dialogue only (empty action)', () => {
    const scenes = [
      makeScene('s1', '', [
        { speaker: 'Hero', text: 'I will return' }, // 3 words
        { speaker: 'Villain', text: 'No you will not' }, // 4 words
      ]),
    ];
    expect(countScriptWords(scenes)).toBe(7);
  });

  it('sums action and dialogue words', () => {
    const scenes = [
      makeScene('s1', 'The sun sets slowly', [ // 4 words
        { speaker: 'A', text: 'Goodbye old world' }, // 3 words
      ]),
    ];
    expect(countScriptWords(scenes)).toBe(7);
  });

  it('accumulates across multiple scenes', () => {
    const scenes = [
      makeScene('s1', 'One two three'),   // 3 words
      makeScene('s2', 'Four five six'),   // 3 words
    ];
    expect(countScriptWords(scenes)).toBe(6);
  });

  it('ignores extra whitespace in action text', () => {
    const scenes = [makeScene('s1', '  hello   world  ')]; // 2 words despite extra spaces
    expect(countScriptWords(scenes)).toBe(2);
  });

  it('ignores extra whitespace in dialogue text', () => {
    const scenes = [makeScene('s1', '', [{ speaker: 'A', text: '  one   two  ' }])];
    expect(countScriptWords(scenes)).toBe(2);
  });

  it('returns 0 when action and dialogue are all empty strings', () => {
    const scenes = [makeScene('s1', '', [{ speaker: 'A', text: '' }])];
    expect(countScriptWords(scenes)).toBe(0);
  });

  it('handles large number of scenes (performance sanity check)', () => {
    const scenes = Array.from({ length: 1000 }, (_, i) =>
      makeScene(`s${i}`, 'one two three four five') // 5 words each
    );
    expect(countScriptWords(scenes)).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// buildBreakdownPrompt
// ---------------------------------------------------------------------------

describe('buildBreakdownPrompt', () => {
  it('returns a non-empty string', () => {
    const result = buildBreakdownPrompt('A story about a robot');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the topic in the prompt', () => {
    const result = buildBreakdownPrompt('A story about a robot');
    expect(result).toContain('A story about a robot');
  });

  it('includes the genre when provided', () => {
    const result = buildBreakdownPrompt('A story', { genre: 'Drama' });
    expect(result).toContain('Drama');
  });

  it('defaults genre to General when not provided', () => {
    const result = buildBreakdownPrompt('A story');
    expect(result).toContain('General');
  });

  it('auto-detects Arabic language from Arabic topic text', () => {
    const result = buildBreakdownPrompt('قصة عن الحياة');
    expect(result).toContain('Arabic');
  });

  it('uses explicit English language override', () => {
    const result = buildBreakdownPrompt('Some topic', { language: 'en' });
    expect(result).toContain('English');
  });

  it('uses explicit Arabic language override regardless of topic', () => {
    const result = buildBreakdownPrompt('English topic here', { language: 'ar' });
    expect(result).toContain('Arabic');
  });

  it('includes research block when researchSummary is provided', () => {
    const result = buildBreakdownPrompt('Topic', {
      researchSummary: 'Key findings here',
    });
    expect(result).toContain('Key findings here');
    expect(result).toContain('RESEARCH CONTEXT');
  });

  it('includes citations when both researchSummary and researchCitations are provided', () => {
    const result = buildBreakdownPrompt('Topic', {
      researchSummary: 'Summary',
      researchCitations: 'Cite1, Cite2',
    });
    expect(result).toContain('Cite1, Cite2');
  });

  it('does not include citations block when only researchSummary is provided', () => {
    const result = buildBreakdownPrompt('Topic', {
      researchSummary: 'Summary',
    });
    expect(result).not.toContain('Citations:');
  });

  it('includes reference material block when referenceContent is provided', () => {
    const result = buildBreakdownPrompt('Topic', {
      referenceContent: 'Primary source text here',
    });
    expect(result).toContain('Primary source text here');
  });

  it('omits research block when researchSummary is absent', () => {
    const result = buildBreakdownPrompt('Topic');
    expect(result).not.toContain('RESEARCH CONTEXT');
  });

  it('uses provided formatId (passed to loadTemplate)', async () => {
    const { loadTemplate } = await import(
      '../../packages/shared/src/services/prompt/templateLoader'
    );
    buildBreakdownPrompt('Topic', { formatId: 'documentary' });
    expect(loadTemplate).toHaveBeenCalledWith('documentary', 'breakdown');
  });

  it('defaults to movie-animation format when no formatId is provided', async () => {
    const { loadTemplate } = await import(
      '../../packages/shared/src/services/prompt/templateLoader'
    );
    vi.clearAllMocks();
    buildBreakdownPrompt('Topic');
    expect(loadTemplate).toHaveBeenCalledWith('movie-animation', 'breakdown');
  });
});

// ---------------------------------------------------------------------------
// buildScreenplayPrompt
// ---------------------------------------------------------------------------

describe('buildScreenplayPrompt', () => {
  const sampleActs = [
    { title: 'Act One', emotionalHook: 'Wonder', narrativeBeat: 'Hero discovers the truth' },
    { title: 'Act Two', emotionalHook: 'Fear', narrativeBeat: 'Hero faces the enemy' },
    { title: 'Act Three', emotionalHook: 'Triumph', narrativeBeat: 'Hero overcomes all odds' },
  ];

  it('returns a non-empty string', () => {
    const result = buildScreenplayPrompt(sampleActs);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes act titles in the prompt', () => {
    const result = buildScreenplayPrompt(sampleActs);
    expect(result).toContain('Act One');
    expect(result).toContain('Act Two');
    expect(result).toContain('Act Three');
  });

  it('includes act count', () => {
    const result = buildScreenplayPrompt(sampleActs);
    expect(result).toContain('3');
  });

  it('includes genre when provided', () => {
    const result = buildScreenplayPrompt(sampleActs, { genre: 'Thriller' });
    expect(result).toContain('Thriller');
  });

  it('defaults genre to General when not provided', () => {
    const result = buildScreenplayPrompt(sampleActs);
    expect(result).toContain('General');
  });

  it('includes language instruction for English', () => {
    const result = buildScreenplayPrompt(sampleActs, { language: 'en' });
    expect(result).toContain('English');
  });

  it('includes language instruction for Arabic', () => {
    const result = buildScreenplayPrompt(sampleActs, { language: 'ar' });
    expect(result).toContain('Arabic');
  });

  it('includes research block when researchSummary is provided', () => {
    const result = buildScreenplayPrompt(sampleActs, { researchSummary: 'Background research' });
    expect(result).toContain('Background research');
    expect(result).toContain('RESEARCH CONTEXT');
  });

  it('includes reference material when referenceContent is provided', () => {
    const result = buildScreenplayPrompt(sampleActs, { referenceContent: 'Source doc' });
    expect(result).toContain('Source doc');
  });

  it('omits research block when no researchSummary is provided', () => {
    const result = buildScreenplayPrompt(sampleActs);
    expect(result).not.toContain('RESEARCH CONTEXT');
  });

  it('uses provided formatId', async () => {
    const { loadTemplate } = await import(
      '../../packages/shared/src/services/prompt/templateLoader'
    );
    vi.clearAllMocks();
    buildScreenplayPrompt(sampleActs, { formatId: 'youtube-narrator' });
    expect(loadTemplate).toHaveBeenCalledWith('youtube-narrator', 'screenplay');
  });

  it('handles empty acts array gracefully', () => {
    const result = buildScreenplayPrompt([]);
    expect(typeof result).toBe('string');
    expect(result).toContain('0'); // actCount = 0
  });
});

// ---------------------------------------------------------------------------
// generateVoiceoverScripts
// ---------------------------------------------------------------------------

describe('generateVoiceoverScripts', () => {
  const sampleScenes: ScreenplayScene[] = [
    makeScene('scene_0', 'A lone figure walks through the desert.', [
      { speaker: 'Narrator', text: 'The world was empty.' },
    ]),
    makeScene('scene_1', 'The figure finds an oasis.'),
  ];

  beforeEach(() => {
    mockInvoke.mockReset();
    // Ensure withStructuredOutput always returns an object with invoke
    mockWithStructuredOutput.mockReturnValue({ invoke: mockInvoke });
  });

  it('returns a Map of sceneId → voiceover script on success', async () => {
    mockInvoke.mockResolvedValueOnce({
      voiceovers: [
        { sceneId: 'scene_0', script: '[breath] A lone figure walks...' },
        { sceneId: 'scene_1', script: '[slow] The oasis shimmers ahead.[/slow]' },
      ],
    });

    const result = await generateVoiceoverScripts(sampleScenes);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);
    expect(result.get('scene_0')).toContain('lone figure');
    expect(result.get('scene_1')).toContain('oasis');
  });

  it('returns an empty Map when LLM throws an error (graceful fallback)', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('LLM timeout'));

    const result = await generateVoiceoverScripts(sampleScenes);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('returns an empty Map for an empty scene list', async () => {
    mockInvoke.mockResolvedValueOnce({ voiceovers: [] });

    const result = await generateVoiceoverScripts([]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('passes emotional hooks to the LLM prompt', async () => {
    mockInvoke.mockResolvedValueOnce({
      voiceovers: [
        { sceneId: 'scene_0', script: 'Voiceover one' },
        { sceneId: 'scene_1', script: 'Voiceover two' },
      ],
    });

    await generateVoiceoverScripts(sampleScenes, ['grief', 'triumph'], 'en');

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const promptArg: string = mockInvoke.mock.calls[0][0];
    expect(promptArg).toContain('grief');
  });

  it('includes Arabic instruction when language is ar', async () => {
    mockInvoke.mockResolvedValueOnce({ voiceovers: [] });

    await generateVoiceoverScripts(sampleScenes, [], 'ar');

    const promptArg: string = mockInvoke.mock.calls[0][0];
    expect(promptArg).toContain('Arabic');
  });

  it('includes English instruction when language is en', async () => {
    mockInvoke.mockResolvedValueOnce({ voiceovers: [] });

    await generateVoiceoverScripts(sampleScenes, [], 'en');

    const promptArg: string = mockInvoke.mock.calls[0][0];
    expect(promptArg).toContain('English');
  });

  it('returns partial results if LLM returns fewer voiceovers than scenes', async () => {
    mockInvoke.mockResolvedValueOnce({
      voiceovers: [{ sceneId: 'scene_0', script: 'Only first scene' }],
    });

    const result = await generateVoiceoverScripts(sampleScenes);

    expect(result.size).toBe(1);
    expect(result.has('scene_0')).toBe(true);
    expect(result.has('scene_1')).toBe(false);
  });

  it('uses scene ids from the input as map keys', async () => {
    mockInvoke.mockResolvedValueOnce({
      voiceovers: [
        { sceneId: 'scene_0', script: 'Script A' },
        { sceneId: 'scene_1', script: 'Script B' },
      ],
    });

    const result = await generateVoiceoverScripts(sampleScenes);

    expect(result.has('scene_0')).toBe(true);
    expect(result.has('scene_1')).toBe(true);
  });
});
