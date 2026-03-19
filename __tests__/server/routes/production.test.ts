import express from '../../../packages/server/node_modules/express/index.js';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProductionRouter } from '../../../packages/server/routes/production';
import { createInitialState } from '../../../packages/shared/src/services/ai/production/types';
import { productionStore } from '../../../packages/shared/src/services/ai/production/store';
import type { ProductionSessionSnapshot } from '../../../packages/shared/src/services/productionApi';

async function startTestServer(router: ReturnType<typeof createProductionRouter>) {
  const app = express();
  app.use(express.json());
  app.use('/api/production', router);

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

async function readFirstSseChunk(baseUrl: string, runId: string): Promise<string> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/production/events/${runId}`, {
    signal: controller.signal,
  });

  const reader = response.body?.getReader();
  if (!reader) {
    controller.abort();
    return '';
  }

  const decoder = new TextDecoder();
  let output = '';

  while (!output.includes('Production complete')) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value || new Uint8Array(), { stream: true });
  }

  controller.abort();
  return output;
}

afterEach(() => {
  productionStore.clear();
});

describe('/api/production routes', () => {
  it('starts orchestrator runs, streams events, and returns the final session snapshot', async () => {
    const snapshot: ProductionSessionSnapshot = {
      sessionId: 'production_proj_route_test',
      contentPlan: {
        title: 'Route Test',
        totalDuration: 60,
        targetAudience: 'General audience',
        overallTone: 'documentary',
        scenes: [],
      },
      validation: {
        approved: true,
        score: 90,
        issues: [],
        suggestions: [],
      },
      narrationSegments: [],
      visuals: [],
      sfxPlan: null,
      errors: [],
      qualityScore: 90,
      bestQualityScore: 90,
      isComplete: true,
    };

    const runOrchestrator = vi.fn(async (_topic, _config, onProgress) => {
      onProgress?.({
        stage: 'content_planning',
        progress: 35,
        message: 'Planning scenes',
      } as any);

      productionStore.set(snapshot.sessionId, {
        ...createInitialState(),
        contentPlan: snapshot.contentPlan,
        validation: snapshot.validation,
        isComplete: true,
      });

      return {
        contentPlan: snapshot.contentPlan!,
        narrationSegments: [],
        visuals: [],
        sfxPlan: null,
        validation: snapshot.validation!,
        success: true,
        errors: [],
      };
    });

    const router = createProductionRouter({
      runOrchestrator: runOrchestrator as any,
      runAgent: vi.fn() as any,
      buildSnapshot: vi.fn().mockResolvedValue(snapshot),
      initSession: vi.fn().mockResolvedValue(true),
    });

    const { server, baseUrl } = await startTestServer(router);

    try {
      const startResponse = await fetch(`${baseUrl}/api/production/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: snapshot.sessionId,
          projectId: 'proj_route_test',
          topic: 'Route Test',
          targetDuration: 60,
          mode: 'orchestrator',
        }),
      });

      expect(startResponse.ok).toBe(true);
      const started = await startResponse.json();
      expect(started.sessionId).toBe(snapshot.sessionId);

      await new Promise((resolve) => setTimeout(resolve, 25));

      const sessionResponse = await fetch(`${baseUrl}/api/production/session/${snapshot.sessionId}`);
      expect(sessionResponse.ok).toBe(true);
      const sessionJson = await sessionResponse.json();
      expect(sessionJson).toEqual(snapshot);

      const eventChunk = await readFirstSseChunk(baseUrl, started.runId);
      expect(eventChunk).toContain('Planning scenes');
      expect(eventChunk).toContain('Production complete');

      expect(runOrchestrator).toHaveBeenCalledTimes(1);
    } finally {
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
  });

  it('passes the canonical session id into agent-mode runs', async () => {
    const snapshot: ProductionSessionSnapshot = {
      sessionId: 'production_proj_agent_test',
      contentPlan: null,
      validation: null,
      narrationSegments: [],
      visuals: [],
      sfxPlan: null,
      errors: [],
      qualityScore: 0,
      bestQualityScore: 0,
      isComplete: true,
    };

    const runAgent = vi.fn(async (_request, onProgress, options) => {
      onProgress?.({
        stage: 'content_tool_call',
        tool: 'plan_video',
        message: 'Planning with canonical session',
        isComplete: false,
        sessionId: options?.sessionId,
      });

      return {
        ...createInitialState(),
        isComplete: true,
      };
    });

    const router = createProductionRouter({
      runAgent: runAgent as any,
      runOrchestrator: vi.fn() as any,
      buildSnapshot: vi.fn().mockResolvedValue(snapshot),
      initSession: vi.fn().mockResolvedValue(true),
    });

    const { server, baseUrl } = await startTestServer(router);

    try {
      const response = await fetch(`${baseUrl}/api/production/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: snapshot.sessionId,
          projectId: 'proj_agent_test',
          topic: 'Agent Test',
          targetDuration: 45,
          mode: 'agent',
        }),
      });

      expect(response.ok).toBe(true);
      const started = await response.json();
      expect(started.sessionId).toBe(snapshot.sessionId);
      await vi.waitFor(() => {
        expect(runAgent).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Function),
          { sessionId: snapshot.sessionId },
        );
      });
    } finally {
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
  });
});
