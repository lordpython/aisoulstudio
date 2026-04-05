/**
 * Tests for subscribeToProductionRun in productionApi.ts
 *
 * Verifies:
 * - Cleanup function closes the EventSource (no lingering connections)
 * - Reconnect logic retries up to SSE_MAX_RECONNECT_ATTEMPTS times
 * - Stops reconnecting after a complete event (isComplete === true)
 * - Parse errors are forwarded to onError
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Minimal EventSource mock ---

interface MockEventSourceInstance {
  url: string;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close: () => void;
  isClosed: () => boolean;
}

function createMockEventSourceClass() {
  const instances: MockEventSourceInstance[] = [];

  class MockEventSource {
    url: string;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    private _closed = false;

    constructor(url: string) {
      this.url = url;
      instances.push(this as unknown as MockEventSourceInstance);
    }

    close() {
      this._closed = true;
    }

    isClosed() {
      return this._closed;
    }
  }

  return { MockEventSource, instances };
}

// buildServerUrl returns the path with the configured base; in tests it's just the path.
// Must also export getServerBaseUrl because cloudStorageService.ts calls it at module load.
vi.mock('@studio/shared/src/services/cloud/serverBaseUrl', () => ({
  buildServerUrl: (path: string) => path,
  getServerBaseUrl: () => '',
  resolveServerAssetUrl: (path: string) => path,
}));

// Import after mocking so the module uses mocked buildServerUrl.
import { subscribeToProductionRun } from '@studio/shared/src/services/orchestration/productionApi';
import type { ProductionEvent } from '@studio/shared/src/services/orchestration/productionApi';

describe('subscribeToProductionRun', () => {
  let mockES: ReturnType<typeof createMockEventSourceClass>;

  beforeEach(() => {
    mockES = createMockEventSourceClass();
    vi.stubGlobal('EventSource', mockES.MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens an EventSource for the given runId', () => {
    const cleanup = subscribeToProductionRun('run_abc', vi.fn());
    expect(mockES.instances).toHaveLength(1);
    expect(mockES.instances[0].url).toContain('run_abc');
    cleanup();
  });

  it('delivers parsed events to onEvent callback', () => {
    const onEvent = vi.fn();
    subscribeToProductionRun('run_deliver', onEvent);

    const source = mockES.instances[0];
    const event: ProductionEvent = {
      stage: 'content_planning',
      message: 'Planning content',
      progress: 30,
      isComplete: false,
    };
    source.onmessage?.({ data: JSON.stringify(event) });

    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it('closes the EventSource when the returned cleanup is called', () => {
    const cleanup = subscribeToProductionRun('run_cleanup', vi.fn());
    const source = mockES.instances[0];

    expect(source.isClosed()).toBe(false);
    cleanup();
    expect(source.isClosed()).toBe(true);
  });

  it('does not reconnect after cleanup is called', () => {
    vi.useFakeTimers();
    const cleanup = subscribeToProductionRun('run_no_reconnect', vi.fn());
    cleanup();

    // Trigger an error on the initial source — should not create a new instance
    mockES.instances[0].onerror?.();
    vi.runAllTimers();

    expect(mockES.instances).toHaveLength(1);
  });

  it('reconnects with exponential back-off on error', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    subscribeToProductionRun('run_reconnect', vi.fn(), onError);

    // First error → retry after 1 000 ms
    mockES.instances[0].onerror?.();
    expect(mockES.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(mockES.instances).toHaveLength(2);

    // Second error → retry after 2 000 ms
    mockES.instances[1].onerror?.();
    vi.advanceTimersByTime(2000);
    expect(mockES.instances).toHaveLength(3);

    // Third error → retry after 4 000 ms
    mockES.instances[2].onerror?.();
    vi.advanceTimersByTime(4000);
    expect(mockES.instances).toHaveLength(4);

    // Fourth error → exhausted; onError called, no new instance
    mockES.instances[3].onerror?.();
    vi.runAllTimers();
    expect(mockES.instances).toHaveLength(4);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('retries') }));
  });

  it('stops reconnecting once a complete event is received', () => {
    vi.useFakeTimers();
    const onEvent = vi.fn();
    subscribeToProductionRun('run_complete', onEvent);

    const source = mockES.instances[0];
    const completeEvent: ProductionEvent = {
      stage: 'done',
      message: 'Production complete',
      isComplete: true,
    };
    source.onmessage?.({ data: JSON.stringify(completeEvent) });

    // Trigger an error — should not reconnect because isComplete stopped the loop
    source.onerror?.();
    vi.runAllTimers();

    expect(mockES.instances).toHaveLength(1);
    expect(onEvent).toHaveBeenCalledWith(completeEvent);
  });

  it('resets attempt counter on a successful message', () => {
    vi.useFakeTimers();
    subscribeToProductionRun('run_reset', vi.fn());

    // Fail twice (uses up 2 of 3 allowed attempts)
    mockES.instances[0].onerror?.();
    vi.advanceTimersByTime(1000);
    mockES.instances[1].onerror?.();
    vi.advanceTimersByTime(2000);

    // Receive a successful message on the third connection — resets attempt count
    const goodEvent: ProductionEvent = {
      stage: 'content_planning',
      message: 'Still going',
      isComplete: false,
    };
    mockES.instances[2].onmessage?.({ data: JSON.stringify(goodEvent) });

    // Now fail again — with reset attempts it should retry from the beginning
    mockES.instances[2].onerror?.();
    vi.advanceTimersByTime(1000); // base delay (attempts reset to 0)
    expect(mockES.instances).toHaveLength(4);
  });

  it('forwards JSON parse errors to onError', () => {
    const onError = vi.fn();
    subscribeToProductionRun('run_parse_error', vi.fn(), onError);

    mockES.instances[0].onmessage?.({ data: 'not-valid-json' });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
