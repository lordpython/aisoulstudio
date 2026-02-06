/**
 * SSE Client for Export Progress
 *
 * Subscribes to Server-Sent Events for real-time export progress updates.
 */

import { SERVER_URL } from './exportConfig';

export interface JobProgress {
  jobId: string;
  status: 'pending' | 'uploading' | 'queued' | 'encoding' | 'complete' | 'failed';
  progress: number;
  message: string;
  currentFrame?: number;
  totalFrames?: number;
  encodingSpeed?: string;
  estimatedTimeRemaining?: number;
  error?: string;
}

export type ProgressCallback = (progress: JobProgress) => void;
export type ErrorCallback = (error: Error) => void;

/**
 * SSE connection state
 */
export interface SSEConnection {
  isConnected: boolean;
  reconnectAttempts: number;
  lastEventTime: number;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

/**
 * Subscribe to job progress via SSE
 */
export function subscribeToJob(
  jobId: string,
  onProgress: ProgressCallback,
  onError?: ErrorCallback
): () => void {
  let eventSource: EventSource | null = null;
  let reconnectAttempts = 0;
  let isClosed = false;
  let reconnectTimeout: number | null = null;

  const connect = () => {
    if (isClosed) return;

    const url = `${SERVER_URL}/api/export/events/${jobId}`;
    console.log(`[SSE] Connecting to ${url}`);

    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log(`[SSE] Connected to job ${jobId}`);
      reconnectAttempts = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const progress = JSON.parse(event.data) as JobProgress;
        onProgress(progress);

        // Close connection on terminal states
        if (progress.status === 'complete' || progress.status === 'failed') {
          console.log(`[SSE] Job ${jobId} reached terminal state: ${progress.status}`);
          close();
        }
      } catch (error) {
        console.error('[SSE] Failed to parse message:', error);
      }
    };

    eventSource.onerror = (event) => {
      console.error(`[SSE] Connection error for job ${jobId}:`, event);

      // Close current connection
      eventSource?.close();
      eventSource = null;

      // Attempt reconnection
      if (!isClosed && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(
          `[SSE] Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
        );
        reconnectTimeout = window.setTimeout(connect, RECONNECT_DELAY_MS);
      } else if (onError && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        onError(new Error('Failed to maintain SSE connection'));
      }
    };
  };

  const close = () => {
    isClosed = true;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
      console.log(`[SSE] Disconnected from job ${jobId}`);
    }
  };

  // Start connection
  connect();

  // Return cleanup function
  return close;
}

/**
 * Poll job status (fallback for environments without SSE)
 */
export async function pollJobStatus(
  jobId: string,
  onProgress: ProgressCallback,
  intervalMs: number = 1000
): Promise<() => void> {
  let isCancelled = false;
  let timeoutId: number | null = null;

  const poll = async () => {
    if (isCancelled) return;

    try {
      const response = await fetch(`${SERVER_URL}/api/export/status/${jobId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const progress = (await response.json()) as JobProgress;
      onProgress(progress);

      // Continue polling if not in terminal state
      if (progress.status !== 'complete' && progress.status !== 'failed') {
        timeoutId = window.setTimeout(poll, intervalMs);
      }
    } catch (error) {
      console.error('[Poll] Failed to get job status:', error);
      // Retry after delay
      if (!isCancelled) {
        timeoutId = window.setTimeout(poll, intervalMs * 2);
      }
    }
  };

  // Start polling
  poll();

  // Return cancel function
  return () => {
    isCancelled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Wait for job completion (returns final status)
 */
export function waitForJobCompletion(
  jobId: string,
  onProgress?: ProgressCallback
): Promise<JobProgress> {
  return new Promise((resolve, reject) => {
    let lastProgress: JobProgress | null = null;

    const unsubscribe = subscribeToJob(
      jobId,
      (progress) => {
        lastProgress = progress;
        onProgress?.(progress);

        if (progress.status === 'complete') {
          unsubscribe();
          resolve(progress);
        } else if (progress.status === 'failed') {
          unsubscribe();
          reject(new Error(progress.error || 'Export failed'));
        }
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );

    // Timeout after 30 minutes
    setTimeout(() => {
      unsubscribe();
      if (lastProgress?.status !== 'complete' && lastProgress?.status !== 'failed') {
        reject(new Error('Export timed out'));
      }
    }, 30 * 60 * 1000);
  });
}

/**
 * Check if SSE is supported in the current environment
 */
export function isSSESupported(): boolean {
  return typeof EventSource !== 'undefined';
}
