import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheFrame, clearFrameCache, getCachedFrame, getFrameCacheStats } from '../../../packages/shared/src/services/ffmpeg/assetLoader';

function createBitmap(width: number, height: number): { bitmap: ImageBitmap; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const bitmap = {
    width,
    height,
    close,
  } as unknown as ImageBitmap;

  return { bitmap, close };
}

describe('assetLoader frame cache', () => {
  beforeEach(() => {
    clearFrameCache();
  });

  it('evicts the least recently used frames to stay within the byte budget', () => {
    const frameA = createBitmap(6000, 6000);
    const frameB = createBitmap(6000, 6000);
    const frameC = createBitmap(6000, 6000);

    cacheFrame('video-a', 0, frameA.bitmap);
    cacheFrame('video-b', 0, frameB.bitmap);

    // Touch A so B becomes the oldest cached frame.
    expect(getCachedFrame('video-a', 0)).toBe(frameA.bitmap);

    cacheFrame('video-c', 0, frameC.bitmap);

    expect(getCachedFrame('video-b', 0)).toBeNull();
    expect(getCachedFrame('video-a', 0)).toBe(frameA.bitmap);
    expect(getCachedFrame('video-c', 0)).toBe(frameC.bitmap);
    expect(frameB.close).toHaveBeenCalledTimes(1);

    const stats = getFrameCacheStats();
    expect(stats.size).toBe(2);
    expect(stats.bytes).toBeLessThanOrEqual(stats.maxBytes);
  });

  it('clears cached frames and releases bitmaps', () => {
    const frame = createBitmap(5000, 5000);

    cacheFrame('video-a', 0, frame.bitmap);
    expect(getFrameCacheStats().size).toBe(1);

    clearFrameCache();

    expect(getFrameCacheStats().size).toBe(0);
    expect(getFrameCacheStats().bytes).toBe(0);
    expect(frame.close).toHaveBeenCalledTimes(1);
  });
});
