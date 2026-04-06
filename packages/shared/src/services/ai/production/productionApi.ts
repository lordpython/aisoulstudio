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

const SSE_MAX_RECONNECT_ATTEMPTS = 3;
const SSE_RECONNECT_BASE_MS = 1000;

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
    const response = await fetch(resolveServerAssetUrl(segment.audioUrl));
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
