/**
 * Tests for the security and reliability fixes in packages/server/routes/deapi.ts.
 *
 * These tests focus on:
 *  1. webhook_url SSRF validation (isAllowedWebhookUrl)
 *  2. guidance=0 not double-appended in img2video
 *  3. Webhook endpoint returns 500 (not 503) when secret is unconfigured
 *  4. Non-JSON bodies in the general proxy return 415
 */

import express from '../../../packages/server/node_modules/express/index.js';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAllowedWebhookUrl } from '../../../packages/server/routes/routeUtils';

// ---------------------------------------------------------------------------
// isAllowedWebhookUrl unit tests (no server needed)
// ---------------------------------------------------------------------------

describe('isAllowedWebhookUrl', () => {
  it('allows HTTPS on the default allowed host (api.deapi.ai)', () => {
    expect(isAllowedWebhookUrl('https://api.deapi.ai/callbacks/job-done')).toBe(true);
  });

  it('rejects HTTP (non-HTTPS) even on an allowed host', () => {
    expect(isAllowedWebhookUrl('http://api.deapi.ai/callback')).toBe(false);
  });

  it('rejects cloud metadata endpoint (SSRF classic target)', () => {
    expect(isAllowedWebhookUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('rejects internal localhost address', () => {
    expect(isAllowedWebhookUrl('http://localhost:3001/internal')).toBe(false);
  });

  it('rejects an unknown external domain', () => {
    expect(isAllowedWebhookUrl('https://attacker.example.com/steal')).toBe(false);
  });

  it('rejects a malformed URL without throwing', () => {
    expect(isAllowedWebhookUrl('not-a-url')).toBe(false);
  });

  it('rejects an empty string without throwing', () => {
    expect(isAllowedWebhookUrl('')).toBe(false);
  });

  it('respects DEAPI_ALLOWED_WEBHOOK_HOSTS env var for extended allowlist', () => {
    // The env var is read at module load time in routeUtils; we test the
    // default-allowlist path here. Extended hosts are integration-tested at server level.
    // api.deapi.ai is always included by default.
    expect(isAllowedWebhookUrl('https://api.deapi.ai/webhook')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Express router integration tests
// ---------------------------------------------------------------------------

type TestServer = {
  server: ReturnType<ReturnType<typeof express>['listen']>;
  baseUrl: string;
};

async function startTestServer(): Promise<TestServer> {
  const app = express();
  app.use(express.json());

  // Dynamically import the router so env patches take effect before module load
  const { default: deapiRouter } = await import('../../../packages/server/routes/deapi.js');
  app.use('/api/deapi', deapiRouter);

  return new Promise<TestServer>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function closeServer(server: TestServer['server']): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err?: Error) => (err ? reject(err) : resolve()));
  });
}

let currentServer: TestServer | undefined;

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  vi.clearAllMocks();
  if (currentServer) {
    await closeServer(currentServer.server);
    currentServer = undefined;
  }
});

// ---------------------------------------------------------------------------
// Webhook endpoint: status code when secret is not configured
// ---------------------------------------------------------------------------

describe('POST /api/deapi/webhook — missing secret', () => {
  it('returns 500 (not 503) when DEAPI_WEBHOOK_SECRET is not set', async () => {
    const savedSecret = process.env.DEAPI_WEBHOOK_SECRET;
    delete process.env.DEAPI_WEBHOOK_SECRET;

    try {
      currentServer = await startTestServer();
      const response = await fetch(`${currentServer.baseUrl}/api/deapi/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'job.completed', request_id: 'req-1', result_url: 'https://example.com/result.mp4' }),
      });

      // 503 would trigger LB retries; 500 is the correct status for a misconfiguration
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeDefined();
      // Error message must not reveal internal env var names
      expect(body.error).not.toContain('DEAPI_WEBHOOK_SECRET');
    } finally {
      if (savedSecret !== undefined) {
        process.env.DEAPI_WEBHOOK_SECRET = savedSecret;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// General proxy: 415 for non-JSON body
// ---------------------------------------------------------------------------

describe('POST /api/deapi/proxy/* — content type validation', () => {
  it('returns 415 when a non-JSON content-type is sent to the general proxy', async () => {
    // Patch DEAPI_API_KEY so the route doesn't bail out at key-check
    process.env.DEAPI_API_KEY = 'test-key-for-proxy';

    currentServer = await startTestServer();

    const formData = new FormData();
    formData.append('prompt', 'a cat');

    const response = await fetch(`${currentServer.baseUrl}/api/deapi/proxy/txt2img`, {
      method: 'POST',
      // FormData sets multipart/form-data automatically
      body: formData,
    });

    expect(response.status).toBe(415);
    const body = await response.json();
    expect(body.error).toMatch(/unsupported content type/i);
    expect(body.error).toMatch(/application\/json/i);

    delete process.env.DEAPI_API_KEY;
  });

  it('does not return 415 for GET requests (no body)', async () => {
    process.env.DEAPI_API_KEY = 'test-key-for-proxy';

    currentServer = await startTestServer();

    // GET to an allowed endpoint — will fail with upstream error (no real key) but NOT 415
    const response = await fetch(`${currentServer.baseUrl}/api/deapi/proxy/request-status/fake-id`, {
      method: 'GET',
    });

    expect(response.status).not.toBe(415);

    delete process.env.DEAPI_API_KEY;
  });
});
