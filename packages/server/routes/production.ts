import { Router, Response, Request } from 'express';
import {
  createInitialState,
  type ProductionState,
  type ProductionProgress as AgentProgress,
} from '@studio/shared/src/services/ai/production/types';
import { generateSessionId } from '@studio/shared/src/services/ai/production/utils';
import { productionStore } from '@studio/shared/src/services/ai/production/store';
import {
  cloudAutosave,
} from '@studio/shared/src/services/cloud/cloudStorageService';
import {
  type ProductionEvent,
  type ProductionSessionSnapshot,
  type ProductionStartRequest,
} from '@studio/shared/src/services/orchestration/productionApi';
import { resolveServerAssetUrl } from '@studio/shared/src/services/cloud/serverBaseUrl';
import { createLogger } from '@studio/shared/src/services/infrastructure/logger';
import type {
  ProductionConfig,
  ProductionProgress as OrchestratorProgress,
  ProductionResult,
} from '@studio/shared/src/services/orchestration/agentOrchestrator';
import type { ToolError } from '@studio/shared/src/services/agent/errorRecovery';

const productionLog = createLogger('ProductionRoute');

type AgentRunner = (
  userRequest: string,
  onProgress?: (progress: AgentProgress) => void,
  options?: { sessionId?: string | null },
) => Promise<ProductionState | null>;

type OrchestratorRunner = (
  input: string | { topic: string },
  config?: ProductionConfig,
  onProgress?: (progress: OrchestratorProgress) => void,
  signal?: AbortSignal,
) => Promise<ProductionResult>;

interface ProductionRouteDependencies {
  runAgent: AgentRunner;
  runOrchestrator: OrchestratorRunner;
  buildSnapshot: (sessionId: string, state: ProductionState) => Promise<ProductionSessionSnapshot>;
  initSession: (sessionId: string) => Promise<unknown>;
}

interface ProductionRunRecord {
  runId: string;
  sessionId: string;
  status: 'running' | 'completed' | 'failed';
  events: ProductionEvent[];
  listeners: Set<Response>;
}

const runs = new Map<string, ProductionRunRecord>();
const snapshots = new Map<string, ProductionSessionSnapshot>();

async function defaultRunAgent(
  userRequest: string,
  onProgress?: (progress: AgentProgress) => void,
  options?: { sessionId?: string | null },
): Promise<ProductionState | null> {
  const { runProductionAgentWithSubagents } = await import('@studio/shared/src/services/ai/production/agentCore');
  return runProductionAgentWithSubagents(userRequest, onProgress, options);
}

async function defaultRunOrchestrator(
  input: string | { topic: string },
  config?: ProductionConfig,
  onProgress?: (progress: OrchestratorProgress) => void,
  signal?: AbortSignal,
): Promise<ProductionResult> {
  const { runProductionPipeline } = await import('@studio/shared/src/services/orchestration/agentOrchestrator');
  return runProductionPipeline(input, config, onProgress, signal);
}

function createRun(runId: string, sessionId: string): ProductionRunRecord {
  const record: ProductionRunRecord = {
    runId,
    sessionId,
    status: 'running',
    events: [],
    listeners: new Set<Response>(),
  };
  runs.set(runId, record);
  return record;
}

const MAX_EVENTS_PER_RUN = 500;

function broadcastEvent(record: ProductionRunRecord, event: ProductionEvent): void {
  record.events.push(event);

  // Rolling window: evict oldest events when the queue exceeds the cap.
  // This prevents unbounded memory growth on long productions.
  if (record.events.length > MAX_EVENTS_PER_RUN) {
    record.events.splice(0, record.events.length - MAX_EVENTS_PER_RUN);
  }

  for (const listener of record.listeners) {
    listener.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function normalizeProgressEvent(
  event: Partial<ProductionEvent> & Pick<ProductionEvent, 'stage' | 'message'>,
  sessionId: string,
): ProductionEvent {
  return {
    stage: event.stage,
    message: event.message,
    progress: event.progress,
    tool: event.tool,
    currentScene: event.currentScene,
    totalScenes: event.totalScenes,
    isComplete: false,
    success: event.success,
    error: event.error,
    sessionId: event.sessionId || sessionId,
  };
}

function buildCanonicalSessionId(request: ProductionStartRequest): string {
  if (request.sessionId) {
    return request.sessionId;
  }

  if (request.projectId) {
    return `production_${request.projectId}`;
  }

  return generateSessionId();
}

function validateStartRequest(body: Partial<ProductionStartRequest>): string | null {
  if (!body.topic?.trim()) {
    return 'topic is required';
  }

  if (!body.mode || (body.mode !== 'agent' && body.mode !== 'orchestrator')) {
    return 'mode must be "agent" or "orchestrator"';
  }

  if (!body.targetDuration || body.targetDuration < 10 || body.targetDuration > 600) {
    return 'targetDuration must be between 10 and 600 seconds';
  }

  return null;
}

function buildUserRequest(request: ProductionStartRequest): string {
  return `Create a ${request.targetDuration} second ${request.videoPurpose || 'documentary'} video about: ${request.topic}.
Style: ${request.visualStyle || 'Cinematic'}. Language: ${request.language === 'auto' ? 'detect from topic' : (request.language || 'auto')}.
Target audience: ${request.targetAudience || 'General audience'}.
${request.targetDuration > 300 ? 'This is a long video, use appropriate number of scenes.' : ''}
${request.animateVisuals ? 'IMPORTANT: The user wants VIDEO, so you MUST use the animate_image tool for every scene.' : ''}
${(request.veoVideoCount || 0) > 0 ? `IMPORTANT: Use generate_visuals with veoVideoCount=${request.veoVideoCount} to generate professional videos for the first ${request.veoVideoCount} scenes.` : ''}`;
}

function mapOrchestratorErrors(errors: string[] | undefined): ToolError[] {
  return (errors || []).map((message) => ({
    tool: 'agent_orchestrator',
    error: message,
    category: 'fatal',
    timestamp: Date.now(),
    retryCount: 0,
    recoverable: false,
  }));
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mimeType = blob.type || 'application/octet-stream';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function buildProductionSnapshot(
  sessionId: string,
  state: ProductionState,
): Promise<ProductionSessionSnapshot> {
  const narrationSegments = await Promise.all(
    state.narrationSegments.map(async (segment) => {
      const audioUrl = await cloudAutosave.saveNarrationWithUrl(sessionId, segment.audioBlob, segment.sceneId);

      return {
        sceneId: segment.sceneId,
        audioDuration: segment.audioDuration,
        transcript: segment.transcript,
        mimeType: segment.audioBlob.type || 'audio/wav',
        audioUrl: audioUrl || undefined,
        audioDataUrl: audioUrl ? undefined : await blobToDataUrl(segment.audioBlob),
      };
    }),
  );

  const visuals = await Promise.all(
    state.visuals.map(async (visual) => {
      if (!visual.imageUrl) {
        return visual;
      }

      if (visual.type === 'video') {
        const videoSource = resolveServerAssetUrl(visual.videoUrl || visual.imageUrl);
        const stableUrl = await cloudAutosave.saveAnimatedVideoWithUrl(sessionId, videoSource, visual.promptId);

        if (!stableUrl) {
          return {
            ...visual,
            imageUrl: resolveServerAssetUrl(visual.imageUrl),
            videoUrl: visual.videoUrl ? resolveServerAssetUrl(visual.videoUrl) : visual.videoUrl,
          };
        }

        return {
          ...visual,
          imageUrl: stableUrl,
          videoUrl: stableUrl,
        };
      }

      const stableUrl = await cloudAutosave.saveImageWithUrl(
        sessionId,
        resolveServerAssetUrl(visual.imageUrl),
        visual.promptId,
      );

      return {
        ...visual,
        imageUrl: stableUrl || resolveServerAssetUrl(visual.imageUrl),
      };
    }),
  );

  const snapshot: ProductionSessionSnapshot = {
    sessionId,
    contentPlan: state.contentPlan,
    validation: state.validation,
    narrationSegments,
    visuals,
    sfxPlan: state.sfxPlan,
    errors: state.errors,
    partialSuccessReport: state.partialSuccessReport,
    qualityScore: state.qualityScore,
    bestQualityScore: state.bestQualityScore,
    isComplete: state.isComplete,
  };

  productionStore.set(sessionId, {
    ...state,
    visuals,
  });

  return snapshot;
}

async function executeProductionRun(
  record: ProductionRunRecord,
  request: ProductionStartRequest,
  deps: ProductionRouteDependencies,
): Promise<void> {
  const { sessionId } = record;

  broadcastEvent(record, {
    stage: 'starting',
    message: 'Production queued on server...',
    isComplete: false,
    sessionId,
  });

  try {
    await deps.initSession(sessionId);

    if (request.mode === 'agent') {
      const state = await deps.runAgent(
        buildUserRequest(request),
        (event) => {
          broadcastEvent(record, normalizeProgressEvent(event, sessionId));
        },
        { sessionId },
      );

      if (!state) {
        throw new Error('Production agent returned no session state');
      }

      const snapshot = await deps.buildSnapshot(sessionId, state);
      snapshots.set(sessionId, snapshot);
    } else {
      const result = await deps.runOrchestrator(
        request.topic,
        {
          sessionId,
          targetDuration: request.targetDuration,
          sceneCount: Math.max(3, Math.floor(request.targetDuration / 12)),
          targetAudience: request.targetAudience,
          visualStyle: request.visualStyle,
          animateVisuals: request.animateVisuals,
          veoVideoCount: request.veoVideoCount,
          contentPlannerConfig: {
            videoPurpose: (request.videoPurpose || 'documentary') as any,
            visualStyle: request.visualStyle || 'Cinematic',
            language: request.language || 'auto',
          },
          narratorConfig: {
            videoPurpose: (request.videoPurpose || 'documentary') as any,
            language: request.language || 'auto',
          },
        },
        (event) => {
          broadcastEvent(record, normalizeProgressEvent(event, sessionId));
        },
      );

      const state = productionStore.get(sessionId) || {
        ...createInitialState(),
        contentPlan: result.contentPlan,
        validation: result.validation,
        narrationSegments: result.narrationSegments,
        visuals: result.visuals,
        sfxPlan: result.sfxPlan,
        errors: mapOrchestratorErrors(result.errors),
        qualityScore: result.validation.score,
        bestQualityScore: result.validation.score,
        isComplete: result.success,
      };

      const snapshot = await deps.buildSnapshot(sessionId, state);
      snapshots.set(sessionId, snapshot);
    }

    record.status = 'completed';
    broadcastEvent(record, {
      stage: 'complete',
      message: 'Production complete',
      isComplete: true,
      success: true,
      sessionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record.status = 'failed';
    productionLog.error('Production run failed:', error);
    broadcastEvent(record, {
      stage: 'error',
      message,
      error: message,
      isComplete: true,
      success: false,
      sessionId,
    });
  }
}

export function createProductionRouter(
  overrides: Partial<ProductionRouteDependencies> = {},
): Router {
  const router = Router();
  const deps: ProductionRouteDependencies = {
    runAgent: defaultRunAgent,
    runOrchestrator: defaultRunOrchestrator,
    buildSnapshot: buildProductionSnapshot,
    initSession: async (sessionId: string) => cloudAutosave.initSession(sessionId),
    ...overrides,
  };

  router.post('/start', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Partial<ProductionStartRequest>;
    const validationError = validateStartRequest(body);

    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const request: ProductionStartRequest = {
      ...body,
      mode: body.mode!,
      topic: body.topic!,
      targetDuration: body.targetDuration!,
    };

    const sessionId = buildCanonicalSessionId(request);
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const record = createRun(runId, sessionId);

    void executeProductionRun(record, { ...request, sessionId }, deps);

    res.json({ runId, sessionId });
  });

  router.get('/events/:runId', (req: Request<{ runId: string }>, res: Response): void => {
    const { runId } = req.params;
    const record = runs.get(runId);

    if (!record) {
      res.status(404).json({ success: false, error: 'Production run not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    record.listeners.add(res);
    res.write(': connected\n\n');

    for (const event of record.events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      record.listeners.delete(res);
      res.end();
    });
  });

  router.get('/session/:sessionId', async (req: Request<{ sessionId: string }>, res: Response): Promise<void> => {
    const { sessionId } = req.params;

    if (snapshots.has(sessionId)) {
      res.json(snapshots.get(sessionId));
      return;
    }

    const state = productionStore.get(sessionId);
    if (!state) {
      res.status(404).json({ success: false, error: 'Production session not found' });
      return;
    }

    const snapshot = await deps.buildSnapshot(sessionId, state);
    snapshots.set(sessionId, snapshot);
    res.json(snapshot);
  });

  return router;
}

export default createProductionRouter();
