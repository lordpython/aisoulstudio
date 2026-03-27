import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadFrameBatch } from '../../../packages/shared/src/services/ffmpeg/exportUpload';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('exportUpload', () => {
  it('retries transient chunk upload failures before succeeding', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const batch = [
      { blob: new Blob(['frame-0']), name: 'frame000000.jpg' },
    ];

    const promise = uploadFrameBatch('session-123', batch);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/export/chunk?sessionId=session-123');
  });
});
