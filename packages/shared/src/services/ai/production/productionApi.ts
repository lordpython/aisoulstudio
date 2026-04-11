import type {
  ContentPlan,
  GeneratedImage,
  NarrationSegment,
  ValidationResult,
  VideoSFXPlan,
} from "../../../types";
import type { ToolError, PartialSuccessReport } from "../../agent/errorRecovery";
import {
  createInitialState,
  type ProductionState,
} from "./types";
import { buildServerUrl, resolveServerAssetUrl } from "../../cloud/serverBaseUrl";

/** @deprecated "orchestrator" is kept only for backward-compatible API requests; all modes route through the agent. */
export type ProductionMode = "agent" | "orchestrator";

export interface ProductionStartRequest {
  sessionId?: string;
  projectId?: string;
  topic: string;
  targetDuration: number;
  targetAudience?: string;
  visualStyle?: string;
  videoPurpose?: string;
  language?: string;
  veoVideoCount?: number;
  animateVisuals?: boolean;
  mode: ProductionMode;
}

export interface ProductionStartResponse {
  runId: string;
  sessionId: string;
}

export interface ProductionEvent {
  stage: string;
  message: string;
  progress?: number;
  tool?: string;
  currentScene?: number;
  totalScenes?: number;
  isComplete: boolean;
  success?: boolean;
  error?: string;
  sessionId?: string;
}

export interface ProductionNarrationSnapshot {
  sceneId: string;
  audioDuration: number;
  transcript: string;
  mimeType?: string;
  audioUrl?: string;
  audioDataUrl?: string;
}

export interface ProductionSessionSnapshot {
  sessionId: string;
  contentPlan: ContentPlan | null;
  validation: ValidationResult | null;
  narrationSegments: ProductionNarrationSnapshot[];
  visuals: GeneratedImage[];
  sfxPlan: VideoSFXPlan | null;
  errors: ToolError[];
  partialSuccessReport?: PartialSuccessReport;
  qualityScore: number;
  bestQualityScore: number;
  isComplete: boolean;
}

export async function startProductionRun(
  request: ProductionStartRequest,
): Promise<ProductionStartResponse> {
  const response = await fetch(buildServerUrl("/api/production/start"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "Failed to start production");
  }

  return response.json();
}

const SSE_MAX_RECONNECT_ATTEMPTS = 5;
const SSE_RECONNECT_BASE_MS = 1000;

const SNAPSHOT_POLL_INTERVAL_MS = 10_000;
const SNAPSHOT_POLL_MAX_ATTEMPTS = 30; // 5 minutes

export function subscribeToProductionRun(
  runId: string,
  onEvent: (event: ProductionEvent) => void,
  onError?: (error: Error) => void,
): () => void {
  let source: EventSource | null = null;
  let attempts = 0;
  let closed = false;

  function connect(): void {
    if (closed) return;

    source = new EventSource(buildServerUrl(`/api/production/events/${runId}`));

    source.onmessage = (message) => {
      attempts = 0; // reset backoff on successful message
      try {
        const event = JSON.parse(message.data) as ProductionEvent;
        onEvent(event);

        // Stop reconnecting once the run has finished
        if (event.isComplete) {
          closed = true;
          source?.close();
        }
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    };

    source.onerror = () => {
      source?.close();
      source = null;

      if (closed) return;

      if (attempts >= SSE_MAX_RECONNECT_ATTEMPTS) {
        onError?.(new Error("Production event stream disconnected after multiple retries"));
        return;
      }

      const delay = SSE_RECONNECT_BASE_MS * 2 ** attempts;
      attempts++;
      setTimeout(connect, delay);
    };
  }

  connect();

  return () => {
    closed = true;
    source?.close();
    source = null;
  };
}

/**
 * Poll the snapshot endpoint until the production run completes or the
 * attempt budget is exhausted. Used as a fallback when the SSE stream fails.
 */
export async function pollSnapshotUntilComplete(
  sessionId: string,
  options: {
    intervalMs?: number;
    maxAttempts?: number;
    onPoll?: (snapshot: ProductionSessionSnapshot, attempt: number) => void;
  } = {},
): Promise<ProductionSessionSnapshot> {
  const intervalMs = options.intervalMs ?? SNAPSHOT_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? SNAPSHOT_POLL_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const snapshot = await getProductionSessionSnapshot(sessionId);
      options.onPoll?.(snapshot, attempt);
      if (snapshot.isComplete) {
        return snapshot;
      }
    } catch {
      // Transient fetch errors are tolerated between polls; the loop
      // will retry until the attempt budget is exhausted.
    }

    if (attempt < maxAttempts) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `Production snapshot polling timed out after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s)`,
  );
}

/**
 * Wait for a production run to complete, preferring the SSE event stream but
 * falling back to snapshot polling if the stream fails.
 *
 * Returns the final snapshot (always fetched from the snapshot endpoint so
 * the caller has a consistent shape regardless of which code path completed).
 *
 * @param runId      The production run identifier from `startProductionRun`.
 * @param sessionId  The session identifier from `startProductionRun`.
 *                   Required because SSE may never emit an event that carries
 *                   it, so polling fallback needs it up-front.
 * @param onEvent    Called for every streamed SSE event (progress updates).
 * @param onError    Called when a non-fatal error occurs (e.g. SSE parse failure).
 */
export async function waitForProductionCompletion(
  runId: string,
  sessionId: string,
  onEvent?: (event: ProductionEvent) => void,
  onError?: (error: Error) => void,
): Promise<ProductionSessionSnapshot> {
  let unsubscribe = () => {};

  type SseResult =
    | { ok: true; event: ProductionEvent }
    | { ok: false; error: Error; isRunFailure: boolean };

  const sseResult = await new Promise<SseResult>((resolve) => {
    unsubscribe = subscribeToProductionRun(
      runId,
      (event) => {
        onEvent?.(event);
        if (event.isComplete) {
          unsubscribe();
          if (event.success === false) {
            // The run itself failed — polling will not help
            resolve({ ok: false, error: new Error(event.error || event.message), isRunFailure: true });
          } else {
            resolve({ ok: true, event });
          }
        }
      },
      (streamError) => {
        // The SSE connection itself failed — the run may still be running
        onError?.(streamError);
        unsubscribe();
        resolve({ ok: false, error: streamError, isRunFailure: false });
      },
    );
  });

  if (sseResult.ok) {
    return getProductionSessionSnapshot(sessionId);
  }

  // Genuine run failure reported by the server — don't poll, surface the error immediately
  if (sseResult.isRunFailure) {
    throw sseResult.error;
  }

  // SSE connection failed (not a run failure). Probe the snapshot endpoint —
  // the run may have completed while the stream was down.
  try {
    const snapshot = await pollSnapshotUntilComplete(sessionId);
    return snapshot;
  } catch (pollError) {
    // Neither SSE nor polling succeeded; prefer surfacing the SSE error since
    // it is usually the more actionable signal.
    throw sseResult.error instanceof Error ? sseResult.error : pollError;
  }
}

export async function getProductionSessionSnapshot(
  sessionId: string,
): Promise<ProductionSessionSnapshot> {
  const response = await fetch(buildServerUrl(`/api/production/session/${sessionId}`));

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "Failed to load production session");
  }

  return response.json();
}

function dataUrlToBlob(dataUrl: string, mimeType?: string): Blob {
  const [, base64 = ""] = dataUrl.split(",", 2);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType || "audio/wav" });
}

async function hydrateNarrationSegment(
  segment: ProductionNarrationSnapshot,
): Promise<NarrationSegment> {
  if (segment.audioDataUrl) {
    return {
      sceneId: segment.sceneId,
      audioBlob: dataUrlToBlob(segment.audioDataUrl, segment.mimeType),
      audioDuration: segment.audioDuration,
      transcript: segment.transcript,
    };
  }

  if (segment.audioUrl) {
    const response = await fetch(resolveServerAssetUrl(segment.audioUrl), {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch narration for scene ${segment.sceneId}`);
    }

    return {
      sceneId: segment.sceneId,
      audioBlob: await response.blob(),
      audioDuration: segment.audioDuration,
      transcript: segment.transcript,
    };
  }

  return {
    sceneId: segment.sceneId,
    audioBlob: new Blob([], { type: segment.mimeType || "audio/wav" }),
    audioDuration: segment.audioDuration,
    transcript: segment.transcript,
  };
}

export async function hydrateProductionSessionSnapshot(
  snapshot: ProductionSessionSnapshot,
): Promise<ProductionState> {
  const narrationSegments = await Promise.all(
    snapshot.narrationSegments.map(hydrateNarrationSegment),
  );

  return {
    ...createInitialState(),
    contentPlan: snapshot.contentPlan,
    validation: snapshot.validation,
    narrationSegments,
    visuals: snapshot.visuals.map((visual) => ({
      ...visual,
      imageUrl: resolveServerAssetUrl(visual.imageUrl),
      videoUrl: visual.videoUrl ? resolveServerAssetUrl(visual.videoUrl) : visual.videoUrl,
    })),
    sfxPlan: snapshot.sfxPlan,
    errors: snapshot.errors,
    partialSuccessReport: snapshot.partialSuccessReport,
    qualityScore: snapshot.qualityScore,
    bestQualityScore: snapshot.bestQualityScore,
    isComplete: snapshot.isComplete,
  };
}
