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
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('/api/gemini routes', () => {
  it('proxies generateContent requests', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: () => 'hello world',
      candidates: [{ id: 'candidate-1' }],
    });

    const router = createGeminiRouter({
      generateContent: generateContent as any,
      generateImages: vi.fn() as any,
      legacyGenerate: vi.fn() as any,
      legacyImage: vi.fn() as any,
    });

    const { server, baseUrl } = await startTestServer(router);

    try {
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
    } finally {
      await closeServer(server);
    }
  });

  it('proxies generateImages requests after stripping unsupported seed config', async () => {
    const generateImages = vi.fn().mockResolvedValue({
      images: [{ url: 'https://example.com/generated.png' }],
    });

    const router = createGeminiRouter({
      generateContent: vi.fn() as any,
      generateImages: generateImages as any,
      legacyGenerate: vi.fn() as any,
      legacyImage: vi.fn() as any,
    });

    const { server, baseUrl } = await startTestServer(router);

    try {
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
        config: { aspectRatio: '16:9' },
      });
    } finally {
      await closeServer(server);
    }
  });

  it('marks legacy generate endpoint as deprecated and logs usage through headers', async () => {
    const legacyGenerate = vi.fn().mockResolvedValue({
      text: () => 'legacy',
    });

    const router = createGeminiRouter({
      generateContent: vi.fn() as any,
      generateImages: vi.fn() as any,
      legacyGenerate: legacyGenerate as any,
      legacyImage: vi.fn() as any,
    });

    const { server, baseUrl } = await startTestServer(router);

    try {
      const response = await fetch(`${baseUrl}/api/gemini/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'legacy prompt',
          options: { temperature: 0.4 },
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get('deprecation')).toBe('true');
      expect(response.headers.get('link')).toContain('/api/gemini/proxy/generateContent');
      expect(legacyGenerate).toHaveBeenCalledWith('legacy prompt', { temperature: 0.4 });
    } finally {
      await closeServer(server);
    }
  });
});
