/**
 * refineAndCompressPrompt Tests
 *
 * Verifies the merged refine + compress Gemini call:
 * - Short-circuit when no refinement is needed (no LLM call).
 * - Successful parse returns both refinedPrompt and compressedPrompt.
 * - Malformed JSON falls back to original promptText.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('../../packages/shared/src/services/shared/apiClient', () => ({
  ai: {
    models: {
      generateContent: mockGenerateContent,
    },
  },
  MODELS: {
    TEXT: 'gemini-test-model',
    IMAGE: 'imagen-test-model',
    VIDEO: 'veo-test-model',
    TTS: 'tts-test-model',
  },
  withRetry: <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

import { refineAndCompressPrompt } from '../../packages/shared/src/services/content/promptService/generation';

describe('refineAndCompressPrompt', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it('short-circuits without calling Gemini when intent=auto and prompt is clean', async () => {
    // A long, well-formed prompt with leading subject + visual anchors triggers no
    // lint issues that gate refinement, so the function should return immediately.
    const cleanPrompt =
      'A lone weathered fisherman stands on a rocky shore at golden hour, ' +
      'wide shot, soft diffused backlight catching the spray of crashing waves, ' +
      'muted teal and amber color palette, 35mm anamorphic lens, shallow depth of field, ' +
      'cinematic film grain, contemplative mood with seabirds wheeling overhead.';

    const result = await refineAndCompressPrompt({
      promptText: cleanPrompt,
      style: 'Cinematic',
      intent: 'auto',
    });

    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(result.refinedPrompt).toBe(cleanPrompt.trim());
    expect(result.compressedPrompt).toBe(cleanPrompt.trim());
  });

  it('returns both refined and compressed forms from a successful Gemini response', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        refinedPrompt:
          'A lone fisherman in oilskins stands on rain-slick black basalt at dawn, ' +
          'wide cinematic shot, golden rim light through sea spray, muted teal and amber palette, ' +
          'shallow 35mm depth of field, contemplative mood.',
        compressedPrompt:
          'lone fisherman, oilskins, rain-slick basalt, dawn, wide shot, golden rim light, sea spray, muted teal amber palette, 35mm shallow focus, contemplative cinematic',
      }),
    });

    const result = await refineAndCompressPrompt({
      promptText: 'fisherman on rocks',
      style: 'Cinematic',
      intent: 'more_cinematic',
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.refinedPrompt).toContain('fisherman');
    expect(result.refinedPrompt).toContain('golden rim light');
    expect(result.compressedPrompt).toContain('lone fisherman');
    expect(result.compressedPrompt).toContain('shallow focus');
  });

  it('falls back to original promptText when Gemini returns malformed JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'this is not valid json {{{',
    });

    const original = 'fisherman on rocks';
    const result = await refineAndCompressPrompt({
      promptText: original,
      style: 'Cinematic',
      intent: 'more_cinematic',
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.refinedPrompt).toBe(original);
    expect(result.compressedPrompt).toBe(original);
  });

  it('falls back to original promptText when Gemini returns empty text', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '' });

    const original = 'fisherman on rocks';
    const result = await refineAndCompressPrompt({
      promptText: original,
      style: 'Cinematic',
      intent: 'more_cinematic',
    });

    expect(result.refinedPrompt).toBe(original);
    expect(result.compressedPrompt).toBe(original);
  });
});
