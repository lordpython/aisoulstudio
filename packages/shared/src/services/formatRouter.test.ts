/**
 * Format Router Unit Tests
 * 
 * Tests for format validation, pipeline loading, and parameter passing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FormatRouter, FormatRouterError, FormatRouterErrorCode, type FormatPipeline, type PipelineRequest, type PipelineResult } from './formatRouter';
import { formatRegistry } from './formatRegistry';
import type { VideoFormat, FormatMetadata } from '../types';

describe('FormatRouter', () => {
  let router: FormatRouter;

  beforeEach(() => {
    router = new FormatRouter();
  });

  describe('validateFormat', () => {
    it('should validate existing format IDs', () => {
      expect(router.validateFormat('youtube-narrator')).toBe(true);
      expect(router.validateFormat('advertisement')).toBe(true);
      expect(router.validateFormat('movie-animation')).toBe(true);
    });

    it('should throw FORMAT_NOT_FOUND for invalid format ID', () => {
      expect(() => router.validateFormat('invalid-format')).toThrow(FormatRouterError);
      
      try {
        router.validateFormat('invalid-format');
      } catch (error) {
        expect(error).toBeInstanceOf(FormatRouterError);
        expect((error as FormatRouterError).code).toBe(FormatRouterErrorCode.FORMAT_NOT_FOUND);
        expect((error as FormatRouterError).message).toContain('invalid-format');
        expect((error as FormatRouterError).message).toContain('Available formats');
      }
    });

    it('should throw INVALID_FORMAT for empty or non-string format ID', () => {
      expect(() => router.validateFormat('')).toThrow(FormatRouterError);
      expect(() => router.validateFormat(null as any)).toThrow(FormatRouterError);
      expect(() => router.validateFormat(undefined as any)).toThrow(FormatRouterError);
      
      try {
        router.validateFormat('');
      } catch (error) {
        expect(error).toBeInstanceOf(FormatRouterError);
        expect((error as FormatRouterError).code).toBe(FormatRouterErrorCode.INVALID_FORMAT);
      }
    });
  });

  describe('registerPipeline and getFormatPipeline', () => {
    it('should register and retrieve a pipeline', () => {
      const mockPipeline: FormatPipeline = {
        execute: async () => ({ success: true }),
        getMetadata: () => formatRegistry.getFormat('youtube-narrator')!
      };

      router.registerPipeline('youtube-narrator', mockPipeline);
      
      const retrieved = router.getFormatPipeline('youtube-narrator');
      expect(retrieved).toBe(mockPipeline);
    });

    it('should throw PIPELINE_NOT_FOUND when pipeline not registered', () => {
      expect(() => router.getFormatPipeline('advertisement')).toThrow(FormatRouterError);
      
      try {
        router.getFormatPipeline('advertisement');
      } catch (error) {
        expect(error).toBeInstanceOf(FormatRouterError);
        expect((error as FormatRouterError).code).toBe(FormatRouterErrorCode.PIPELINE_NOT_FOUND);
        expect((error as FormatRouterError).message).toContain('advertisement');
        expect((error as FormatRouterError).message).toContain('not found');
      }
    });

    it('should validate format exists before checking pipeline', () => {
      expect(() => router.getFormatPipeline('invalid-format' as VideoFormat)).toThrow(FormatRouterError);
      
      try {
        router.getFormatPipeline('invalid-format' as VideoFormat);
      } catch (error) {
        expect((error as FormatRouterError).code).toBe(FormatRouterErrorCode.FORMAT_NOT_FOUND);
      }
    });
  });

  describe('dispatch', () => {
    let mockPipeline: FormatPipeline;
    let mockRequest: PipelineRequest;

    beforeEach(() => {
      mockPipeline = {
        execute: async (request: PipelineRequest) => ({ 
          success: true, 
          videoUrl: 'https://example.com/video.mp4' 
        }),
        getMetadata: () => formatRegistry.getFormat('youtube-narrator')!
      };

      mockRequest = {
        formatId: 'youtube-narrator',
        idea: 'Test video idea',
        language: 'en',
        userId: 'user123',
        projectId: 'project456'
      };

      router.registerPipeline('youtube-narrator', mockPipeline);
    });

    it('should successfully dispatch to registered pipeline', async () => {
      const result = await router.dispatch(mockRequest);
      
      expect(result.success).toBe(true);
      expect(result.videoUrl).toBe('https://example.com/video.mp4');
    });

    it('should validate language support', async () => {
      const invalidRequest = {
        ...mockRequest,
        language: 'fr' as any // French not supported
      };

      await expect(router.dispatch(invalidRequest)).rejects.toThrow(FormatRouterError);
      
      try {
        await router.dispatch(invalidRequest);
      } catch (error) {
        expect((error as FormatRouterError).code).toBe(FormatRouterErrorCode.VALIDATION_FAILED);
        expect((error as FormatRouterError).message).toContain('Language');
        expect((error as FormatRouterError).message).toContain('not supported');
      }
    });

    it('should validate genre if provided', async () => {
      const invalidGenreRequest = {
        ...mockRequest,
        genre: 'InvalidGenre'
      };

      await expect(router.dispatch(invalidGenreRequest)).rejects.toThrow(FormatRouterError);
      
      try {
        await router.dispatch(invalidGenreRequest);
      } catch (error) {
        expect((error as FormatRouterError).code).toBe(FormatRouterErrorCode.VALIDATION_FAILED);
        expect((error as FormatRouterError).message).toContain('Genre');
        expect((error as FormatRouterError).message).toContain('not applicable');
      }
    });

    it('should accept valid genre', async () => {
      const validGenreRequest = {
        ...mockRequest,
        genre: 'Educational' // Valid for youtube-narrator
      };

      const result = await router.dispatch(validGenreRequest);
      expect(result.success).toBe(true);
    });

    it('should call pipeline validate method if available', async () => {
      let validateCalled = false;
      
      const pipelineWithValidation: FormatPipeline = {
        execute: async () => ({ success: true }),
        validate: async () => {
          validateCalled = true;
          return true;
        },
        getMetadata: () => formatRegistry.getFormat('advertisement')!
      };

      router.registerPipeline('advertisement', pipelineWithValidation);

      const request: PipelineRequest = {
        formatId: 'advertisement',
        idea: 'Test ad',
        language: 'en',
        userId: 'user123',
        projectId: 'project456'
      };

      await router.dispatch(request);
      expect(validateCalled).toBe(true);
    });

    it('should throw VALIDATION_FAILED if pipeline validation fails', async () => {
      const pipelineWithFailingValidation: FormatPipeline = {
        execute: async () => ({ success: true }),
        validate: async () => false,
        getMetadata: () => formatRegistry.getFormat('advertisement')!
      };

      router.registerPipeline('advertisement', pipelineWithFailingValidation);

      const request: PipelineRequest = {
        formatId: 'advertisement',
        idea: 'Test ad',
        language: 'en',
        userId: 'user123',
        projectId: 'project456'
      };

      await expect(router.dispatch(request)).rejects.toThrow(FormatRouterError);
      
      try {
        await router.dispatch(request);
      } catch (error) {
        expect((error as FormatRouterError).code).toBe(FormatRouterErrorCode.VALIDATION_FAILED);
      }
    });

    it('should wrap execution errors in FormatRouterError', async () => {
      const failingPipeline: FormatPipeline = {
        execute: async () => {
          throw new Error('Pipeline execution failed');
        },
        getMetadata: () => formatRegistry.getFormat('shorts')!
      };

      router.registerPipeline('shorts', failingPipeline);

      const request: PipelineRequest = {
        formatId: 'shorts',
        idea: 'Test short',
        language: 'en',
        userId: 'user123',
        projectId: 'project456'
      };

      await expect(router.dispatch(request)).rejects.toThrow(FormatRouterError);
      
      try {
        await router.dispatch(request);
      } catch (error) {
        expect((error as FormatRouterError).code).toBe(FormatRouterErrorCode.EXECUTION_FAILED);
        expect((error as FormatRouterError).message).toContain('Pipeline execution failed');
      }
    });
  });

  describe('deprecation support', () => {
    it('should allow dispatching to deprecated format but include warning', async () => {
      // Deprecate a format
      formatRegistry.deprecateFormat('shorts', 'Use youtube-narrator instead');

      const mockPipeline: FormatPipeline = {
        execute: async () => ({ success: true }),
        getMetadata: () => formatRegistry.getFormat('shorts')!
      };

      router.registerPipeline('shorts', mockPipeline);

      const request: PipelineRequest = {
        formatId: 'shorts',
        idea: 'Test short',
        language: 'en',
        userId: 'user123',
        projectId: 'project456'
      };

      const result = await router.dispatch(request);
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.warnings![0]).toContain('deprecated');
      expect(result.warnings![0]).toContain('Use youtube-narrator instead');

      // Clean up: un-deprecate for other tests
      const format = formatRegistry.getFormat('shorts')!;
      format.deprecated = false;
      format.deprecationMessage = undefined;
    });

    it('should return no warnings for non-deprecated format', async () => {
      const mockPipeline: FormatPipeline = {
        execute: async () => ({ success: true }),
        getMetadata: () => formatRegistry.getFormat('youtube-narrator')!
      };

      router.registerPipeline('youtube-narrator', mockPipeline);

      const request: PipelineRequest = {
        formatId: 'youtube-narrator',
        idea: 'Test video',
        language: 'en',
        userId: 'user123',
        projectId: 'project456'
      };

      const result = await router.dispatch(request);
      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should still validate deprecated formats as valid', () => {
      formatRegistry.deprecateFormat('music-video');
      expect(router.validateFormat('music-video')).toBe(true);

      // Clean up
      const format = formatRegistry.getFormat('music-video')!;
      format.deprecated = false;
      format.deprecationMessage = undefined;
    });
  });

  describe('hasPipeline and getRegisteredPipelines', () => {
    it('should check if pipeline is registered', () => {
      expect(router.hasPipeline('youtube-narrator')).toBe(false);
      
      const mockPipeline: FormatPipeline = {
        execute: async () => ({ success: true }),
        getMetadata: () => formatRegistry.getFormat('youtube-narrator')!
      };

      router.registerPipeline('youtube-narrator', mockPipeline);
      
      expect(router.hasPipeline('youtube-narrator')).toBe(true);
    });

    it('should return list of registered pipelines', () => {
      expect(router.getRegisteredPipelines()).toEqual([]);

      const mockPipeline1: FormatPipeline = {
        execute: async () => ({ success: true }),
        getMetadata: () => formatRegistry.getFormat('youtube-narrator')!
      };

      const mockPipeline2: FormatPipeline = {
        execute: async () => ({ success: true }),
        getMetadata: () => formatRegistry.getFormat('advertisement')!
      };

      router.registerPipeline('youtube-narrator', mockPipeline1);
      router.registerPipeline('advertisement', mockPipeline2);

      const registered = router.getRegisteredPipelines();
      expect(registered).toHaveLength(2);
      expect(registered).toContain('youtube-narrator');
      expect(registered).toContain('advertisement');
    });
  });
});
