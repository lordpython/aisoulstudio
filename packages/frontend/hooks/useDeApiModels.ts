/**
 * useDeApiModels — React hook for dynamic deAPI model discovery.
 *
 * Fetches available models on mount via the shared DeApiModelRegistry,
 * falls back to hardcoded IMAGE_MODEL_META on error.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    deApiModelRegistry,
    type DiscoveredModel,
    type InferenceType,
} from '@/services/media/deapiService/modelDiscovery';
import {
    DEAPI_IMAGE_MODELS,
    IMAGE_MODEL_META,
    type DeApiImageModel,
} from '@/services/media/deapiService/models';
import { mediaLogger } from '@/services/infrastructure/logger';

const log = mediaLogger.child('useDeApiModels');

export interface UseDeApiModelsResult {
    /** Image models (txt2img + img2img). */
    imageModels: DiscoveredModel[];
    /** Video models (txt2video, img2video, aud2video). */
    videoModels: DiscoveredModel[];
    /** TTS models (txt2audio, predict). */
    ttsModels: DiscoveredModel[];
    /** Utility models (img-rmbg, img-upscale, etc.). */
    utilityModels: DiscoveredModel[];
    /** True while initial fetch is in progress. */
    isLoading: boolean;
    /** Error message if fetch failed (null otherwise). */
    error: string | null;
    /** Manually trigger a refresh. */
    refresh: () => Promise<void>;
    /** Cache metadata for debugging. */
    cacheInfo: ReturnType<typeof deApiModelRegistry.getCacheInfo>;
}

/**
 * Build fallback DiscoveredModel[] from hardcoded IMAGE_MODEL_META.
 * Used when the API is unreachable or API key is missing.
 */
function buildFallbackImageModels(): DiscoveredModel[] {
    return (Object.values(DEAPI_IMAGE_MODELS) as string[]).map((slug) => {
        const meta = IMAGE_MODEL_META[slug as DeApiImageModel];
        return {
            slug,
            name: meta?.name ?? slug,
            inferenceTypes: ['txt2img'] as InferenceType[],
            limits: {
                minWidth: 256, maxWidth: 2048,
                minHeight: 256, maxHeight: 2048,
                minSteps: 1, maxSteps: meta?.maxSteps ?? 10,
            },
            features: {
                supportsGuidance: meta?.supportsGuidance ?? false,
                supportsSteps: true,
                supportsNegativePrompt: true,
                supportsLastFrame: false,
                supportsCustomOutputSize: false,
            },
            defaults: {
                width: 768, height: 768,
                steps: meta?.defaultSteps ?? 4,
            },
            loras: [],
            languages: null,
            discoveredAt: 0,
            source: 'fallback' as const,
        };
    });
}

export function useDeApiModels(): UseDeApiModelsResult {
    const [imageModels, setImageModels] = useState<DiscoveredModel[]>(buildFallbackImageModels);
    const [videoModels, setVideoModels] = useState<DiscoveredModel[]>([]);
    const [ttsModels, setTtsModels] = useState<DiscoveredModel[]>([]);
    const [utilityModels, setUtilityModels] = useState<DiscoveredModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadModels = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await deApiModelRegistry.refresh();

            const discovered = deApiModelRegistry.getImageModels();
            setImageModels(discovered.length > 0 ? discovered : buildFallbackImageModels());
            setVideoModels(deApiModelRegistry.getVideoModels());
            setTtsModels(deApiModelRegistry.getTtsModels());
            setUtilityModels(deApiModelRegistry.getUtilityModels());
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to load models';
            log.warn(`Model discovery error: ${msg}`);
            setError(msg);
            setImageModels(buildFallbackImageModels());
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadModels();
    }, [loadModels]);

    return {
        imageModels,
        videoModels,
        ttsModels,
        utilityModels,
        isLoading,
        error,
        refresh: loadModels,
        cacheInfo: deApiModelRegistry.getCacheInfo(),
    };
}
