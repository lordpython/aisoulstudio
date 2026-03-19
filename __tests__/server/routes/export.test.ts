import express from '../../../packages/server/node_modules/express/index.js';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import exportRouter from '../../../packages/server/routes/export';
import { cleanupSession } from '../../../packages/server/utils/index.js';
import { deleteJob } from '../../../packages/server/services/jobQueue/jobStore.js';
import { jobQueue } from '../../../packages/server/services/jobQueue/index.js';

const createdSessions: string[] = [];
const createdJobs: string[] = [];

async function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/export', exportRouter);

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

afterEach(async () => {
  for (const sessionId of createdSessions.splice(0)) {
    cleanupSession(sessionId);
  }

  for (const jobId of createdJobs.splice(0)) {
    await deleteJob(jobId);
  }
});

describe('/api/export routes', () => {
  it('initializes an export job and reports status for that job', async () => {
    const { server, baseUrl } = await startTestServer();

    try {
      const formData = new FormData();
      formData.append('audio', new Blob(['fake-audio'], { type: 'audio/mpeg' }), 'audio.mp3');
      formData.append('totalFrames', '12');
      formData.append('fps', '24');

      const initResponse = await fetch(`${baseUrl}/api/export/init`, {
        method: 'POST',
        body: formData,
      });

      expect(initResponse.ok).toBe(true);
      const initJson = await initResponse.json();
      createdSessions.push(initJson.sessionId);
      createdJobs.push(initJson.jobId);

      const statusResponse = await fetch(`${baseUrl}/api/export/status/${initJson.jobId}`);
      expect(statusResponse.ok).toBe(true);
      const statusJson = await statusResponse.json();

      expect(statusJson.jobId).toBe(initJson.jobId);
      expect(statusJson.status).toBe('pending');
      expect(statusJson.totalFrames).toBe(12);
    } finally {
      await closeServer(server);
    }
  });

  it('streams SSE progress updates for active export jobs', async () => {
    const { server, baseUrl } = await startTestServer();

    try {
      const formData = new FormData();
      formData.append('audio', new Blob(['fake-audio'], { type: 'audio/mpeg' }), 'audio.mp3');

      const initResponse = await fetch(`${baseUrl}/api/export/init`, {
        method: 'POST',
        body: formData,
      });

      expect(initResponse.ok).toBe(true);
      const initJson = await initResponse.json();
      createdSessions.push(initJson.sessionId);
      createdJobs.push(initJson.jobId);

      const controller = new AbortController();
      const streamPromise = (async () => {
        const response = await fetch(`${baseUrl}/api/export/events/${initJson.jobId}`, {
          signal: controller.signal,
        });

        const reader = response.body?.getReader();
        expect(reader).toBeTruthy();

        const decoder = new TextDecoder();
        let output = '';

        while (!output.includes('Rendering frames')) {
          const { value, done } = await reader!.read();
          if (done) break;
          output += decoder.decode(value || new Uint8Array(), { stream: true });
        }

        controller.abort();
        return output;
      })();

      await new Promise((resolve) => setTimeout(resolve, 25));
      await jobQueue.updateJobProgress(initJson.jobId, 55, 10, 'Rendering frames');

      const streamOutput = await streamPromise;
      expect(streamOutput).toContain('"progress":55');
      expect(streamOutput).toContain('Rendering frames');
    } finally {
      await closeServer(server);
    }
  });
});
