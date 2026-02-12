/**
 * Unit tests for DeAPI Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables before importing the module
vi.mock('import.meta', () => ({
  env: {
    VITE_DEAPI_API_KEY: 'test-api-key',
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock FileReader
class MockFileReader {
  result: string = 'data:video/mp4;base64,test-video-data';
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  
  readAsDataURL() {
    setTimeout(() => {
      if (this.onloadend) this.onloadend();
    }, 0);
  }
}
global.FileReader = MockFileReader as any;

describe('DeAPI Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Txt2ImgParams Interface', () => {
    it('should support all documented parameters', async () => {
      const params = {
        prompt: 'a beautiful sunset',
        model: 'Flux1schnell' as const,
        width: 1024,
        height: 768,
        guidance: 3.5,
        steps: 4,
        seed: 12345,
        negative_prompt: 'blurry, low quality',
        loras: 'test-lora',
        webhook_url: 'https://example.com/webhook',
      };

      // Mock successful response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            request_id: 'test-request-id',
            status: 'done',
            result_url: 'https://storage.example.com/image.png',
          },
        }),
      });

      // Mock image download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['test-image-data'], { type: 'image/png' }),
      });

      const { generateImageWithDeApi } = await import('../../services/deapiService');
      await generateImageWithDeApi(params);

      // Verify the request was made with all parameters
      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs).toBeDefined();
      if (callArgs && callArgs[1]) {
        const body = JSON.parse(callArgs[1].body);
        
        expect(body.prompt).toBe('a beautiful sunset');
        expect(body.model).toBe('Flux1schnell');
        expect(body.width).toBe(1024);
        expect(body.height).toBe(768);
        expect(body.guidance).toBe(3.5);
        expect(body.steps).toBe(4);
        expect(body.seed).toBe(12345);
        expect(body.negative_prompt).toBe('blurry, low quality');
        expect(body.loras).toBe('test-lora');
        expect(body.webhook_url).toBe('https://example.com/webhook');
      }
    });
  });

  describe('Txt2VideoParams Interface', () => {
    it('should support webhook_url parameter', async () => {
      const params = {
        prompt: 'a cat playing piano',
        model: 'Ltxv_13B_0_9_8_Distilled_FP8',
        width: 768,
        height: 432,
        guidance: 3,
        steps: 1,
        frames: 120,
        fps: 30,
        seed: -1,
        webhook_url: 'https://example.com/webhook',
      };

      // Mock successful response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            request_id: 'test-request-id',
            status: 'done',
            result_url: 'https://storage.example.com/video.mp4',
          },
        }),
      });

      // Mock video download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['test-video-data'], { type: 'video/mp4' }),
      });

      const { generateVideoWithDeApi } = await import('../../services/deapiService');
      await generateVideoWithDeApi(params, '16:9');

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Img2VideoParams Interface', () => {
    it('should support last_frame_image and webhook_url parameters', async () => {
      const base64Image = 'data:image/png;base64,test-image-data';
      const lastFrameImage = 'data:image/png;base64,test-last-frame';
      const prompt = 'animate this image';
      const options = {
        last_frame_image: lastFrameImage,
        webhook_url: 'https://example.com/webhook',
      };

      // Mock fetch for base64ToBlob calls (first_frame_image and last_frame_image)
      // and for API response and video download
      mockFetch.mockImplementation(async (url: string) => {
        if (url.startsWith('data:')) {
          return {
            ok: true,
            blob: async () => new Blob(['test-image-data'], { type: 'image/png' }),
          };
        }
        if (url.includes('storage.example.com')) {
          // Mock video download
          return {
            ok: true,
            blob: async () => new Blob(['test-video-data'], { type: 'video/mp4' }),
          };
        }
        // Mock API response
        return {
          ok: true,
          json: async () => ({
            data: {
              request_id: 'test-request-id',
              status: 'done',
              result_url: 'https://storage.example.com/video.mp4',
            },
          }),
        };
      });

      const { animateImageWithDeApi } = await import('../../services/deapiService');
      await animateImageWithDeApi(base64Image, prompt, '16:9', undefined, undefined, options);

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Model Recommendations', () => {
    it('should export model recommendations', async () => {
      const { MODEL_RECOMMENDATIONS } = await import('../../services/deapiService');
      
      expect(MODEL_RECOMMENDATIONS.speed).toBe('Flux1schnell');
      expect(MODEL_RECOMMENDATIONS.storyboard).toBe('Flux_2_Klein_4B_BF16');
      expect(MODEL_RECOMMENDATIONS.quality).toBe('ZImageTurbo_INT8');
    });
  });

  describe('Rate Limiter', () => {
    it('should export rate limiter functions', async () => {
      const { getImg2VideoWaitTime, getImg2VideoQueueLength } = await import('../../services/deapiService');
      
      expect(typeof getImg2VideoWaitTime).toBe('function');
      expect(typeof getImg2VideoQueueLength).toBe('function');
      expect(getImg2VideoQueueLength()).toBe(0);
    });
  });

  describe('Tier Detection', () => {
    it('should export tier detection functions', async () => {
      const { detectTier, getRecommendedConcurrency, getCurrentTier } = await import('../../services/deapiService');
      
      expect(typeof detectTier).toBe('function');
      expect(typeof getRecommendedConcurrency).toBe('function');
      expect(typeof getCurrentTier).toBe('function');
      
      // Test tier detection
      expect(detectTier(true)).toBe('basic');
      expect(detectTier(false)).toBe('basic'); // Still basic until 20+ successes
    });

    it('should return appropriate concurrency for tiers', async () => {
      const { getRecommendedConcurrency } = await import('../../services/deapiService');
      
      const concurrency = getRecommendedConcurrency();
      expect(concurrency).toBeGreaterThanOrEqual(1);
      expect(concurrency).toBeLessThanOrEqual(10);
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate batch costs correctly', async () => {
      const { estimateBatchCost } = await import('../../services/deapiService');
      
      const estimate = estimateBatchCost(10, 5, '16:9');
      
      expect(estimate.imageCount).toBe(10);
      expect(estimate.videoCount).toBe(5);
      expect(estimate.estimatedCostUSD).toBeGreaterThan(0);
      expect(estimate.breakdown.images).toBeGreaterThan(0);
      expect(estimate.breakdown.videos).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const { generateImageWithDeApi } = await import('../../services/deapiService');
      
      await expect(generateImageWithDeApi({
        prompt: 'test',
      })).rejects.toThrow();
    });

    it('should handle rate limiting (429)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '60' }),
        text: async () => 'Rate limit exceeded',
      });

      const { generateImageWithDeApi } = await import('../../services/deapiService');
      
      await expect(generateImageWithDeApi({
        prompt: 'test',
      })).rejects.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should export configuration check functions', async () => {
      const { isDeApiConfigured, getDeApiConfigMessage } = await import('../../services/deapiService');
      
      expect(typeof isDeApiConfigured).toBe('function');
      expect(typeof getDeApiConfigMessage).toBe('function');
    });
  });
});
