import express from '../../../packages/server/node_modules/express/index.js';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiRouter } from '../../../packages/server/routes/gemini';

async function startTestServer(router: ReturnType<typeof createGeminiRouter>) {
  const app = express();
  app.use(express.json());
  app.use('/api/gemini', router);

  return await new Promise<{ server: ReturnType<typeof app.listen>; baseUrl: string }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function closeServer(server: ReturnType<express.Express['listen']>) {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) { reject(error); return; }
      resolve();
    });
  });
}

let currentServer: ReturnType<express.Express['listen']> | undefined;

afterEach(async () => {
  vi.clearAllMocks();
  if (currentServer) {
    await closeServer(currentServer);
    currentServer = undefined;
  }
});

describe('/api/gemini routes', () => {
  it('proxies generateContent and serializes text getter to plain string', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: () => 'hello world',
      candidates: [{ id: 'candidate-1' }],
    });

    const { server, baseUrl } = await startTestServer(
      createGeminiRouter({ generateContent: generateContent as any }),
    );
    currentServer = server;

    const response = await fetch(`${baseUrl}/api/gemini/proxy/generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: 'hello' }] }],
        config: { temperature: 0.2 },
      }),
    });

    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.text).toBe('hello world');
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: 'hello' }] }],
      config: { temperature: 0.2 },
    });
  });

  it('returns 400 when model is missing from generateContent', async () => {
    const { server, baseUrl } = await startTestServer(
      createGeminiRouter({ generateContent: vi.fn() as any }),
    );
    currentServer = server;

    const response = await fetch(`${baseUrl}/api/gemini/proxy/generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/model/i);
  });

  it('proxies generateImages and strips unsupported seed param', async () => {
    const generateImages = vi.fn().mockResolvedValue({
      images: [{ url: 'https://example.com/generated.png' }],
    });

    const { server, baseUrl } = await startTestServer(
      createGeminiRouter({ generateImages: generateImages as any }),
    );
    currentServer = server;

    const response = await fetch(`${baseUrl}/api/gemini/proxy/generateImages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'imagen-4.0-fast-generate-001',
        prompt: 'a sunrise over the ocean',
        config: { aspectRatio: '16:9', seed: 1234 },
      }),
    });

    expect(response.ok).toBe(true);
    expect(generateImages).toHaveBeenCalledWith({
      model: 'imagen-4.0-fast-generate-001',
      prompt: 'a sunrise over the ocean',
      config: { aspectRatio: '16:9' }, // seed stripped
    });
  });

  it('returns 400 when prompt is missing from generateImages', async () => {
    const { server, baseUrl } = await startTestServer(
      createGeminiRouter({ generateImages: vi.fn() as any }),
    );
    currentServer = server;

    const response = await fetch(`${baseUrl}/api/gemini/proxy/generateImages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'imagen-4.0-fast-generate-001' }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/prompt/i);
  });

  it('returns 404 for the removed legacy /generate endpoint', async () => {
    const { server, baseUrl } = await startTestServer(createGeminiRouter());
    currentServer = server;

    const response = await fetch(`${baseUrl}/api/gemini/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'legacy prompt' }),
    });

    expect(response.status).toBe(404);
  });

  it('does not leak stack traces in generateContent error responses', async () => {
    const generateContent = vi.fn().mockRejectedValue(
      Object.assign(new Error('Upstream API failure'), { stack: 'Error: Upstream API failure\n    at /packages/server/routes/gemini.ts:55:10' }),
    );

    const { server, baseUrl } = await startTestServer(
      createGeminiRouter({ generateContent: generateContent as any }),
    );
    currentServer = server;

    const response = await fetch(`${baseUrl}/api/gemini/proxy/generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-flash', contents: [{ parts: [{ text: 'hi' }] }] }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).not.toHaveProperty('details');
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('gemini.ts');
  });

  it('does not leak stack traces in generateImages error responses', async () => {
    const generateImages = vi.fn().mockRejectedValue(
      Object.assign(new Error('Image generation failed'), { stack: 'Error: Image generation failed\n    at /packages/server/routes/gemini.ts:120:10' }),
    );

    const { server, baseUrl } = await startTestServer(
      createGeminiRouter({ generateImages: generateImages as any }),
    );
    currentServer = server;

    const response = await fetch(`${baseUrl}/api/gemini/proxy/generateImages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'imagen-4.0-fast-generate-001', prompt: 'a cat' }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).not.toHaveProperty('details');
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('gemini.ts');
  });

  it('includes a UUID errorId in error responses for log correlation', async () => {
    const generateContent = vi.fn().mockRejectedValue(new Error('Some error'));

    const { server, baseUrl } = await startTestServer(
      createGeminiRouter({ generateContent: generateContent as any }),
    );
    currentServer = server;

    const response = await fetch(`${baseUrl}/api/gemini/proxy/generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-flash', contents: [{ parts: [{ text: 'hi' }] }] }),
    });

    const body = await response.json();
    expect(body).toHaveProperty('errorId');
    expect(typeof body.errorId).toBe('string');
    // UUID v4 format
    expect(body.errorId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
