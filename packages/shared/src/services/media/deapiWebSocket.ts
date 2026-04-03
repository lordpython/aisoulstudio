/**
 * DeAPI WebSocket integration via Pusher.
 *
 * Provides real-time job status updates and live preview frames during generation,
 * replacing the polling loop in deapiService.ts for browser environments.
 *
 * Requirements:
 *   - pusher-js installed (pnpm add pusher-js)
 *   - VITE_DEAPI_CLIENT_ID set in .env (your DeAPI account client ID)
 *   - Express server /api/deapi/ws-auth proxies Pusher channel auth to DeAPI
 *
 * Falls back gracefully to polling if Pusher is unavailable or client ID is missing.
 */

const PUSHER_APP_KEY = 'depin-api-prod-key';
const PUSHER_HOST = 'soketi.deapi.ai';
const PUSHER_PORT = 443;

// @ts-ignore – Vite injects import.meta.env at build time
const VITE_CLIENT_ID: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEAPI_CLIENT_ID) || '';

const isBrowser = typeof window !== 'undefined';

// ---- Types ----------------------------------------------------------------

interface JobUpdateCallback {
  onProgress?: (progress: number, preview?: string) => void;
  onComplete: (resultUrl: string) => void;
  onError: (error: Error) => void;
}

// Minimal Pusher typings so we don't need @types/pusher-js
interface PusherChannel {
  bind(event: string, callback: (data: unknown) => void): void;
  unbind_all(): void;
}

interface PusherConstructor {
  new (
    appKey: string,
    options: {
      wsHost: string;
      wsPort: number;
      forceTLS: boolean;
      cluster: string;
      enabledTransports: string[];
      authorizer: (channel: { name: string }) => {
        authorize: (
          socketId: string,
          callback: (error: Error | null, auth: unknown) => void
        ) => void;
      };
    }
  ): {
    subscribe(channelName: string): PusherChannel;
    disconnect(): void;
  };
}

// ---- Module state ---------------------------------------------------------

let pusherChannel: PusherChannel | null = null;
let pusherInit: Promise<boolean> | null = null;
const jobListeners = new Map<string, JobUpdateCallback>();

// ---- Init -----------------------------------------------------------------

async function getPusherChannel(): Promise<PusherChannel | null> {
  if (!isBrowser || !VITE_CLIENT_ID) return null;
  if (pusherChannel) return pusherChannel;

  // Coalesce concurrent init calls
  if (!pusherInit) {
    pusherInit = (async (): Promise<boolean> => {
      try {
        // Dynamic import: only loads pusher-js when actually needed in browser
        const mod = await import('pusher-js');
        const Pusher = mod.default as unknown as PusherConstructor;

        const client = new Pusher(PUSHER_APP_KEY, {
          wsHost: PUSHER_HOST,
          wsPort: PUSHER_PORT,
          forceTLS: true,
          cluster: 'mt1',
          enabledTransports: ['ws', 'wss'],
          authorizer: (channel) => ({
            authorize: async (socketId, callback) => {
              try {
                const res = await fetch('/api/deapi/ws-auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    socket_id: socketId,
                    channel_name: channel.name,
                  }),
                });
                if (!res.ok) throw new Error(`Pusher auth failed: ${res.status}`);
                callback(null, await res.json());
              } catch (err) {
                callback(err instanceof Error ? err : new Error(String(err)), null);
              }
            },
          }),
        });

        const ch = client.subscribe(`private-client.${VITE_CLIENT_ID}`);

        ch.bind('request.status.updated', (raw: unknown) => {
          const data = raw as {
            request_id?: string;
            status?: string;
            progress?: string;
            preview?: string;
            result_url?: string;
            error?: string;
          };

          if (!data.request_id) return;
          const listener = jobListeners.get(data.request_id);
          if (!listener) return;

          if (data.status === 'done' && data.result_url) {
            jobListeners.delete(data.request_id);
            listener.onComplete(data.result_url);
          } else if (data.status === 'error') {
            jobListeners.delete(data.request_id);
            listener.onError(new Error(data.error || 'Job failed at provider'));
          } else if (data.progress !== undefined || data.preview) {
            listener.onProgress?.(
              parseFloat(data.progress ?? '0'),
              data.preview ?? undefined
            );
          }
        });

        pusherChannel = ch;
        console.log(`[DeAPI WS] Connected to private-client.${VITE_CLIENT_ID}`);
        return true;
      } catch (err) {
        console.warn('[DeAPI WS] Pusher init failed, polling will be used:', err);
        pusherInit = null; // Allow retry on next call
        return false;
      }
    })();
  }

  const ok = await pusherInit;
  return ok ? pusherChannel : null;
}

// ---- Public API -----------------------------------------------------------

/**
 * Wait for a DeAPI job using WebSocket. Resolves with the result URL when done.
 * Returns null if WebSocket is unavailable (caller should fall back to polling).
 */
export async function waitForJobViaWebSocket(
  requestId: string,
  onProgress?: (progress: number, preview?: string) => void
): Promise<string | null> {
  const channel = await getPusherChannel();
  if (!channel) return null;

  return new Promise<string | null>((resolve, reject) => {
    // Safety timeout — if WS never fires, resolve null so polling takes over
    const timeout = setTimeout(() => {
      jobListeners.delete(requestId);
      console.warn(`[DeAPI WS] Job ${requestId} timed out on WebSocket — falling back to poll`);
      resolve(null);
    }, 310_000); // slightly longer than pollRequest's max to let WS win first

    jobListeners.set(requestId, {
      onProgress,
      onComplete: (url) => {
        clearTimeout(timeout);
        resolve(url);
      },
      onError: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });
  });
}

/**
 * Returns true when WebSocket is usable: running in browser with VITE_DEAPI_CLIENT_ID set.
 */
export function isWebSocketAvailable(): boolean {
  return isBrowser && Boolean(VITE_CLIENT_ID);
}
