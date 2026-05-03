import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProductionLimiter } from '../../../packages/server/middleware/productionLimiter';

type TestExpressApp = {
  use: (...args: unknown[]) => void;
  listen: (port: number, host: string, callback: () => void) => Server;
};

type TestRouter = {
  post: (path: string, handler: (req: unknown, res: unknown) => void) => void;
  get: (path: string, handler: (req: unknown, res: unknown) => void) => void;
};

type TestExpressModule = (() => TestExpressApp) & {
  json: () => unknown;
  Router: () => TestRouter;
};

const require = createRequire(import.meta.url);
const express = require('../../../packages/server/node_modules/express/index.js') as TestExpressModule;

/**
 * Build a tiny test server that mounts the production limiter in front of a
 * stub router exposing the same paths the real router uses (POST /start,
 * GET /events/:runId, GET /session/:sessionId).
 *
 * Using a stub avoids importing the real router (which has heavy side-effect
 * imports — env, jobQueue, workerPool, Vertex AI clients).
 */
async function startTestServer() {
  const app = express();
  app.use(express.json());

  const router = express.Router();
  router.post('/start', (_req, res) => {
    (res as { status: (n: number) => { json: (o: unknown) => void } })
      .status(200).json({ ok: true, route: 'start' });
  });
  router.get('/events/:runId', (_req, res) => {
    (res as { status: (n: number) => { json: (o: unknown) => void } })
      .status(200).json({ ok: true, route: 'events' });
  });
  router.get('/session/:sessionId', (_req, res) => {
    (res as { status: (n: number) => { json: (o: unknown) => void } })
      .status(200).json({ ok: true, route: 'session' });
  });

  // Mount the limiter exactly as production does: in front of the router,
  // under the /api/production prefix.
  app.use('/api/production', createProductionLimiter(), router);

  return await new Promise<{ server: Server; baseUrl: string }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('productionLimiter middleware', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const started = await startTestServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('allows the first 5 POST /start requests and rate-limits the 6th', async () => {
    const responses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${baseUrl}/api/production/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: `test-${i}` }),
      });
      responses.push(res.status);
    }

    expect(responses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(responses[5]).toBe(429);
  });

  it('returns the documented error envelope on 429', async () => {
    // Burn through the 5 allowed requests
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/production/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    }
    const res = await fetch(`${baseUrl}/api/production/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { success: boolean; code: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('does NOT rate-limit GET /events/:runId even after 10 calls', async () => {
    const responses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${baseUrl}/api/production/events/run-${i}`);
      responses.push(res.status);
    }
    expect(responses).toEqual(Array(10).fill(200));
  });

  it('does NOT rate-limit GET /session/:sessionId even after 10 calls', async () => {
    const responses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${baseUrl}/api/production/session/sess-${i}`);
      responses.push(res.status);
    }
    expect(responses).toEqual(Array(10).fill(200));
  });

  it('GETs do not consume the POST /start budget', async () => {
    // 10 GETs first (must not count against the limiter)
    for (let i = 0; i < 10; i++) {
      await fetch(`${baseUrl}/api/production/events/run-${i}`);
    }
    // Then 5 POST /starts — all should still succeed
    const startResponses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${baseUrl}/api/production/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      startResponses.push(res.status);
    }
    expect(startResponses).toEqual([200, 200, 200, 200, 200]);
  });

  it('regression: substring matches like /start-anything would no longer leak through', async () => {
    // Sanity check that the predicate is exact-match, not substring.
    // A hypothetical /start-batch route should NOT consume the /start budget.
    const app = express();
    app.use(express.json());
    const router = express.Router();
    router.post('/start', (_req, res) => {
      (res as { status: (n: number) => { json: (o: unknown) => void } })
        .status(200).json({ ok: true });
    });
    router.post('/start-batch', (_req, res) => {
      (res as { status: (n: number) => { json: (o: unknown) => void } })
        .status(200).json({ ok: true });
    });
    app.use('/api/production', createProductionLimiter(), router);

    const { server: s2, baseUrl: url2 } = await new Promise<{ server: Server; baseUrl: string }>((resolve) => {
      const srv = app.listen(0, '127.0.0.1', () => {
        const { port } = srv.address() as AddressInfo;
        resolve({ server: srv, baseUrl: `http://127.0.0.1:${port}` });
      });
    });

    try {
      // 10 POSTs to /start-batch — none should be limited because the predicate
      // requires exact match req.path === '/start'.
      const responses: number[] = [];
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`${url2}/api/production/start-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        responses.push(res.status);
      }
      expect(responses).toEqual(Array(10).fill(200));
    } finally {
      await new Promise<void>((resolve) => s2.close(() => resolve()));
    }
  });
});
