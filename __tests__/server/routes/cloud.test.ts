import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createCloudRouter } from '../../../packages/server/routes/cloud';

type TestExpressApp = {
  use: (...args: unknown[]) => void;
  listen: (port: number, host: string, callback: () => void) => Server;
};

type TestExpressModule = (() => TestExpressApp) & {
  json: () => unknown;
};

const require = createRequire(import.meta.url);
const express = require('../../../packages/server/node_modules/express/index.js') as TestExpressModule;

type StoredFile = {
  body: Buffer;
  contentType: string;
};

async function startTestServer(router: ReturnType<typeof createCloudRouter>) {
  const app = express();
  app.use(express.json());
  app.use('/api/cloud', router);

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

async function closeServer(server: ReturnType<TestExpressApp['listen']>) {
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

function createMockCloudStorage() {
  const files = new Map<string, StoredFile>();

  return {
    files,
    client: {
      bucket: (_name: string) => ({
        exists: async () => [true] as [boolean],
        file: (filePath: string) => ({
          save: async (content: string) => {
            files.set(filePath, {
              body: Buffer.from(content),
              contentType: 'text/plain',
            });
          },
          createWriteStream: (options: { metadata: { contentType: string } }) => {
            const stream = new PassThrough();
            const chunks: Buffer[] = [];

            stream.on('data', (chunk) => {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });

            stream.on('finish', () => {
              files.set(filePath, {
                body: Buffer.concat(chunks),
                contentType: options.metadata.contentType,
              });
            });

            return stream;
          },
          exists: async () => [files.has(filePath)] as [boolean],
          getMetadata: async () => [{ contentType: files.get(filePath)?.contentType || 'application/octet-stream' }],
          createReadStream: () => {
            const file = files.get(filePath);
            return Readable.from(file ? [file.body] : []);
          },
        }),
      }),
    },
  };
}

describe('/api/cloud routes', () => {
  it('initializes a user-aware session path and reports status', async () => {
    const storage = createMockCloudStorage();
    const router = createCloudRouter({
      getStorageClient: async () => storage.client as any,
    });

    const { server, baseUrl } = await startTestServer(router);

    try {
      const initResponse = await fetch(`${baseUrl}/api/cloud/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'production_proj_cloud_test',
          userId: 'user_123',
        }),
      });

      expect(initResponse.ok).toBe(true);
      const initJson = await initResponse.json();
      expect(initJson.folderPath).toBe('users/user_123/projects/production_proj_cloud_test');
      expect(storage.files.has('users/user_123/projects/production_proj_cloud_test/_session_started.txt')).toBe(true);

      const statusResponse = await fetch(`${baseUrl}/api/cloud/status`);
      expect(statusResponse.ok).toBe(true);
      await expect(statusResponse.json()).resolves.toEqual({
        available: true,
        bucketName: 'aisoul-studio-storage',
      });
    } finally {
      await closeServer(server);
    }
  });

  it('uploads an asset, returns a proxy URL, and serves the uploaded file back', async () => {
    const storage = createMockCloudStorage();
    const router = createCloudRouter({
      getStorageClient: async () => storage.client as any,
    });

    const { server, baseUrl } = await startTestServer(router);

    try {
      const formData = new FormData();
      formData.append('sessionId', 'production_proj_cloud_asset');
      formData.append('assetType', 'audio');
      formData.append('filename', 'narration.wav');
      formData.append('makePublic', 'true');
      formData.append('file', new Blob(['cloud-audio'], { type: 'audio/wav' }), 'narration.wav');

      const uploadResponse = await fetch(`${baseUrl}/api/cloud/upload-asset`, {
        method: 'POST',
        body: formData,
      });

      expect(uploadResponse.ok).toBe(true);
      const uploadJson = await uploadResponse.json();
      expect(uploadJson.publicUrl).toBe('/api/cloud/file?path=production_production_proj_cloud_asset%2Faudio%2Fnarration.wav');

      const fileResponse = await fetch(`${baseUrl}${uploadJson.publicUrl}`);
      expect(fileResponse.ok).toBe(true);
      expect(fileResponse.headers.get('content-type')).toBe('audio/wav');
      await expect(fileResponse.text()).resolves.toBe('cloud-audio');
    } finally {
      await closeServer(server);
    }
  });

  it('rejects invalid cloud file paths', async () => {
    const storage = createMockCloudStorage();
    const router = createCloudRouter({
      getStorageClient: async () => storage.client as any,
    });

    const { server, baseUrl } = await startTestServer(router);

    try {
      const response = await fetch(`${baseUrl}/api/cloud/file?path=../secrets.txt`);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ success: false, error: 'Invalid file path' });
    } finally {
      await closeServer(server);
    }
  });
});
