/**
 * Dynamic Model Discovery for deAPI.
 *
 * Fetches available models from GET /api/v1/client/models at runtime,
 * caches them with TTL, and provides type-safe lookups.
 *
 * Hardcoded slugs in models.ts serve as fallback when the API is unavailable.
 * Design: stale-while-revalidate, dedup, non-blocking on failure.
 */

import { API_BASE, API_KEY, withExponentialBackoff } from './config';
import { mediaLogger } from '../../infrastructure/logger';

const log = mediaLogger.child('DeAPI:Discovery');

// ─── Types ──────────────────────────────────────────────────────────────────

/** All inference types supported by deAPI. */
export type InferenceType =
  | 'txt2img' | 'img2img'
  | 'txt2video' | 'img2video' | 'aud2video'
  | 'txt2audio' | 'predict'
  | 'img-rmbg' | 'img-upscale'
  | 'transcribe' | 'img2txt'
  | 'txt2music' | 'txt2embedding'
  | 'videos_replace'
  | 'prompt/image' | 'prompt/video' | 'prompt/image2image' | 'prompt/speech';

/** Normalized model data from the deAPI /models endpoint. */
export interface DiscoveredModel {
  readonly slug: string;
  readonly name: string;
  readonly inferenceTypes: readonly InferenceType[];
  readonly limits: {
    readonly minWidth: number;
    readonly maxWidth: number;
    readonly minHeight: number;
    readonly maxHeight: number;
    readonly minSteps: number;
    readonly maxSteps: number;
    readonly resolutionStep?: number;
  };
  readonly features: {
    readonly supportsGuidance: boolean;
    readonly supportsSteps: boolean;
    readonly supportsNegativePrompt: boolean;
    readonly supportsLastFrame: boolean;
    readonly supportsCustomOutputSize: boolean;
  };
  readonly defaults: {
    readonly width: number;
    readonly height: number;
    readonly steps: number;
    readonly guidance?: number;
    readonly negativePrompt?: string;
  };
  readonly loras: ReadonlyArray<{ readonly name: string; readonly displayName: string }>;
  readonly languages: ReadonlyArray<{
    readonly name: string;
    readonly slug: string;
    readonly voices: ReadonlyArray<{ readonly name: string; readonly slug: string; readonly gender: string }>;
  }> | null;
  /** When this model was discovered (epoch ms). 0 for fallback models. */
  readonly discoveredAt: number;
  /** Whether data came from the live API or hardcoded fallback. */
  readonly source: 'api' | 'fallback';
}

// ─── Raw API Response Shape ─────────────────────────────────────────────────

interface RawModelInfo {
  limits?: Record<string, number>;
  features?: Record<string, boolean>;
  defaults?: Record<string, unknown>;
}

interface RawLora {
  name: string;
  display_name: string;
}

interface RawLanguage {
  name: string;
  slug: string;
  voices?: Array<{ name: string; slug: string; gender: string }>;
}

interface RawModel {
  slug: string;
  name: string;
  inference_types: string[];
  info?: RawModelInfo;
  loras: RawLora[] | null;
  languages: RawLanguage[] | null;
}

interface RawModelsPage {
  data: RawModel[];
  meta?: { current_page: number; last_page: number; total: number };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function normalize(raw: RawModel): DiscoveredModel {
  const info = raw.info ?? {};
  const limits = info.limits ?? {};
  const features = info.features ?? {};
  const defaults = info.defaults ?? {};

  return Object.freeze({
    slug: raw.slug,
    name: raw.name,
    inferenceTypes: Object.freeze(raw.inference_types as InferenceType[]),
    limits: Object.freeze({
      minWidth: limits.min_width ?? 256,
      maxWidth: limits.max_width ?? 2048,
      minHeight: limits.min_height ?? 256,
      maxHeight: limits.max_height ?? 2048,
      minSteps: limits.min_steps ?? 1,
      maxSteps: limits.max_steps ?? 10,
      resolutionStep: limits.resolution_step,
    }),
    features: Object.freeze({
      supportsGuidance: features.supports_guidance ?? false,
      supportsSteps: features.supports_steps ?? true,
      supportsNegativePrompt: features.supports_negative_prompt ?? false,
      supportsLastFrame: features.supports_last_frame ?? false,
      supportsCustomOutputSize: features.supports_custom_output_size ?? false,
    }),
    defaults: Object.freeze({
      width: (defaults.width as number) ?? 768,
      height: (defaults.height as number) ?? 768,
      steps: (defaults.steps as number) ?? 4,
      guidance: defaults.guidance as number | undefined,
      negativePrompt: defaults.negative_prompt as string | undefined,
    }),
    loras: Object.freeze(
      (raw.loras ?? []).map((l) => Object.freeze({ name: l.name, displayName: l.display_name })),
    ),
    languages: raw.languages
      ? Object.freeze(
          raw.languages.map((lang) =>
            Object.freeze({
              name: lang.name,
              slug: lang.slug,
              voices: Object.freeze(lang.voices ?? []),
            }),
          ),
        )
      : null,
    discoveredAt: Date.now(),
    source: 'api' as const,
  });
}

// ─── Registry ───────────────────────────────────────────────────────────────

class DeApiModelRegistry {
  private cache = new Map<string, DiscoveredModel>();
  private cacheTimestamp = 0;
  private fetchPromise: Promise<void> | null = null;
  private initialized = false;

  /** Fetch all models from the deAPI /models endpoint. Idempotent for concurrent callers. */
  async refresh(): Promise<void> {
    // Dedup: if a refresh is already in flight, await the same promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.doRefresh();
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    if (!API_KEY) {
      log.info('No API key configured, skipping model discovery');
      return;
    }

    try {
      const allModels = await withExponentialBackoff(
        () => this.fetchAllPages(),
        { maxRetries: 2, initialDelayMs: 500 },
      );

      const newCache = new Map<string, DiscoveredModel>();
      for (const model of allModels) {
        newCache.set(model.slug, model);
      }

      this.cache = newCache;
      this.cacheTimestamp = Date.now();
      this.initialized = true;
      log.info(`Discovered ${newCache.size} models from deAPI`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      log.warn(`Model discovery failed (will use fallbacks): ${msg}`);
    }
  }

  private async fetchAllPages(): Promise<DiscoveredModel[]> {
    const models: DiscoveredModel[] = [];
    let page = 1;
    let lastPage = 1;

    do {
      const url = `${API_BASE}/models?per_page=100&page=${page}`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      // Server-side uses Bearer token; browser goes through proxy which injects auth
      if (API_KEY && !API_BASE.startsWith('/')) {
        headers['Authorization'] = `Bearer ${API_KEY}`;
      }

      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        throw new Error(`deAPI /models returned ${resp.status}: ${await resp.text()}`);
      }

      const body: RawModelsPage = await resp.json();
      const rawModels: RawModel[] = body.data ?? [];
      for (const raw of rawModels) {
        models.push(normalize(raw));
      }

      const meta = body.meta;
      if (meta) {
        lastPage = meta.last_page;
        page = meta.current_page + 1;
      } else {
        // No pagination metadata — single page
        break;
      }
    } while (page <= lastPage);

    return models;
  }

  /** Get models matching any of the given inference types. */
  getModelsByType(...types: InferenceType[]): DiscoveredModel[] {
    const typeSet = new Set(types);
    return [...this.cache.values()].filter((m) =>
      m.inferenceTypes.some((t) => typeSet.has(t)),
    );
  }

  /** Get image models (txt2img + img2img). */
  getImageModels(): DiscoveredModel[] {
    return this.getModelsByType('txt2img', 'img2img');
  }

  /** Get video models (txt2video + img2video + aud2video). */
  getVideoModels(): DiscoveredModel[] {
    return this.getModelsByType('txt2video', 'img2video', 'aud2video');
  }

  /** Get TTS models (txt2audio + predict). */
  getTtsModels(): DiscoveredModel[] {
    return this.getModelsByType('txt2audio', 'predict');
  }

  /** Get utility models (img-rmbg, img-upscale, etc.). */
  getUtilityModels(): DiscoveredModel[] {
    return this.getModelsByType('img-rmbg', 'img-upscale', 'transcribe', 'img2txt');
  }

  /** Get music models. */
  getMusicModels(): DiscoveredModel[] {
    return this.getModelsByType('txt2music');
  }

  /** Look up a single model by slug. Returns null if not found. */
  getModelBySlug(slug: string): DiscoveredModel | null {
    return this.cache.get(slug) ?? null;
  }

  /** Force a refresh on the next access. */
  invalidate(): void {
    this.cacheTimestamp = 0;
  }

  /** Whether the cache is still within TTL. */
  isCacheFresh(): boolean {
    if (!this.initialized) return false;
    return Date.now() - this.cacheTimestamp < CACHE_TTL_MS;
  }

  /** Cache metadata for debugging. */
  getCacheInfo(): { age: number; ttl: number; modelCount: number; fresh: boolean } {
    return {
      age: this.initialized ? Date.now() - this.cacheTimestamp : 0,
      ttl: CACHE_TTL_MS,
      modelCount: this.cache.size,
      fresh: this.isCacheFresh(),
    };
  }
}

/** Singleton registry instance. */
export const deApiModelRegistry = new DeApiModelRegistry();
