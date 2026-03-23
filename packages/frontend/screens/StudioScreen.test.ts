import { describe, expect, it } from 'vitest';
import { canOpenStudioEditor, parseStudioParams } from './StudioScreen';

describe('parseStudioParams', () => {
  it('parses supported studio route params', () => {
    const params = new URLSearchParams(
      'mode=story&style=Cinematic&duration=90&topic=Ancient%20Egypt&projectId=proj_123'
    );

    expect(parseStudioParams(params)).toEqual({
      mode: 'story',
      style: 'Cinematic',
      duration: 90,
      topic: 'Ancient Egypt',
      projectId: 'proj_123',
    });
  });

  it('ignores unsupported mode values while preserving other params', () => {
    const params = new URLSearchParams('mode=unsupported&style=Documentary&topic=Space');

    expect(parseStudioParams(params)).toEqual({
      mode: undefined,
      style: 'Documentary',
      duration: undefined,
      topic: 'Space',
      projectId: undefined,
    });
  });
});

describe('canOpenStudioEditor', () => {
  it('returns true when any supported editor source has content', () => {
    expect(canOpenStudioEditor({ pipelineScreenplayCount: 1 })).toBe(true);
    expect(canOpenStudioEditor({ storyBreakdownCount: 2 })).toBe(true);
    expect(canOpenStudioEditor({ contentPlanSceneCount: 3 })).toBe(true);
  });

  it('returns false when no editor source has content', () => {
    expect(canOpenStudioEditor({})).toBe(false);
    expect(canOpenStudioEditor({ pipelineScreenplayCount: 0, storyBreakdownCount: 0, contentPlanSceneCount: 0 })).toBe(false);
  });
});
