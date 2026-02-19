/**
 * Format Router
 * 
 * Centralized router that dispatches pipeline requests to format-specific pipelines.
 * Validates format IDs, loads pipeline configurations, and passes parameters to pipelines.
 * 
 * Requirements: 1.2, 10.1, 10.2, 10.3, 10.5
 */

import { formatRegistry } from './formatRegistry';
import { VideoFormat, FormatMetadata } from '../types';

/**
 * Pipeline request interface
 */
export interface PipelineRequest {
  formatId: VideoFormat;
  idea: string;
  genre?: string;
  language: 'ar' | 'en';
  referenceDocuments?: File[];
  userId: string;
  projectId: string;
}

/**
 * Pipeline result interface
 */
export interface PipelineResult {
  success: boolean;
  videoUrl?: string;
  error?: string;
  partialResults?: any;
  warnings?: string[];
}

/**
 * Format-specific pipeline interface
 */
export interface FormatPipeline {
  execute(request: PipelineRequest): Promise<PipelineResult>;
  validate?(request: PipelineRequest): Promise<boolean>;
  getMetadata(): FormatMetadata;
}

/**
 * Error codes for format routing
 */
export enum FormatRouterErrorCode {
  FORMAT_NOT_FOUND = 'FORMAT_NOT_FOUND',
  INVALID_FORMAT = 'INVALID_FORMAT',
  PIPELINE_NOT_FOUND = 'PIPELINE_NOT_FOUND',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  FORMAT_DEPRECATED = 'FORMAT_DEPRECATED'
}

/**
 * Format Router error class
 */
export class FormatRouterError extends Error {
  constructor(
    public code: FormatRouterErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'FormatRouterError';
  }
}

/**
 * Format Router class
 * 
 * Dispatches pipeline requests to format-specific implementations
 */
export class FormatRouter {
  private pipelines: Map<VideoFormat, FormatPipeline> = new Map();

  /**
   * Register a format-specific pipeline
   * @param formatId Format identifier
   * @param pipeline Pipeline implementation
   */
  registerPipeline(formatId: VideoFormat, pipeline: FormatPipeline): void {
    this.pipelines.set(formatId, pipeline);
  }

  /**
   * Validate format ID against registry
   * @param formatId Format identifier to validate
   * @returns True if format is valid
   * @throws FormatRouterError if format is invalid
   */
  validateFormat(formatId: string): boolean {
    if (!formatId || typeof formatId !== 'string') {
      throw new FormatRouterError(
        FormatRouterErrorCode.INVALID_FORMAT,
        'Format ID must be a non-empty string',
        { providedFormatId: formatId }
      );
    }

    if (!formatRegistry.isValidFormat(formatId)) {
      const availableFormats = formatRegistry.getAllFormats().map(f => f.id);
      throw new FormatRouterError(
        FormatRouterErrorCode.FORMAT_NOT_FOUND,
        `Format '${formatId}' not found in registry. Available formats: ${availableFormats.join(', ')}`,
        { 
          providedFormatId: formatId,
          availableFormats 
        }
      );
    }

    return true;
  }

  /**
   * Get format-specific pipeline
   * @param formatId Format identifier
   * @returns Format pipeline implementation
   * @throws FormatRouterError if pipeline not found
   */
  getFormatPipeline(formatId: VideoFormat): FormatPipeline {
    // First validate the format exists in registry
    this.validateFormat(formatId);

    // Then check if pipeline is registered
    const pipeline = this.pipelines.get(formatId);
    if (!pipeline) {
      throw new FormatRouterError(
        FormatRouterErrorCode.PIPELINE_NOT_FOUND,
        `Pipeline implementation not found for format '${formatId}'. The format exists in the registry but no pipeline has been registered yet.`,
        { 
          formatId,
          registeredPipelines: Array.from(this.pipelines.keys())
        }
      );
    }

    return pipeline;
  }

  /**
   * Dispatch pipeline request to appropriate format pipeline
   * @param request Pipeline request with format ID and parameters
   * @returns Pipeline execution result
   * @throws FormatRouterError if validation or execution fails
   */
  async dispatch(request: PipelineRequest): Promise<PipelineResult> {
    try {
      // Validate format ID
      this.validateFormat(request.formatId);

      // Get format metadata for parameter validation
      const formatMetadata = formatRegistry.getFormat(request.formatId);
      if (!formatMetadata) {
        throw new FormatRouterError(
          FormatRouterErrorCode.FORMAT_NOT_FOUND,
          `Format metadata not found for '${request.formatId}'`
        );
      }

      // Collect warnings (e.g., deprecation)
      const warnings: string[] = [];

      // Check for deprecation — still allow execution but warn
      if (formatMetadata.deprecated) {
        const msg = formatMetadata.deprecationMessage
          ? `Format '${request.formatId}' is deprecated: ${formatMetadata.deprecationMessage}`
          : `Format '${request.formatId}' is deprecated.`;
        warnings.push(msg);
      }

      // Validate language support
      if (!formatMetadata.supportedLanguages.includes(request.language)) {
        throw new FormatRouterError(
          FormatRouterErrorCode.VALIDATION_FAILED,
          `Language '${request.language}' is not supported for format '${request.formatId}'. Supported languages: ${formatMetadata.supportedLanguages.join(', ')}`,
          {
            formatId: request.formatId,
            providedLanguage: request.language,
            supportedLanguages: formatMetadata.supportedLanguages
          }
        );
      }

      // Validate genre if provided
      if (request.genre && !formatMetadata.applicableGenres.includes(request.genre)) {
        throw new FormatRouterError(
          FormatRouterErrorCode.VALIDATION_FAILED,
          `Genre '${request.genre}' is not applicable for format '${request.formatId}'. Applicable genres: ${formatMetadata.applicableGenres.join(', ')}`,
          {
            formatId: request.formatId,
            providedGenre: request.genre,
            applicableGenres: formatMetadata.applicableGenres
          }
        );
      }

      // Get pipeline implementation
      const pipeline = this.getFormatPipeline(request.formatId);

      // Run pipeline-specific validation if available
      if (pipeline.validate) {
        const isValid = await pipeline.validate(request);
        if (!isValid) {
          throw new FormatRouterError(
            FormatRouterErrorCode.VALIDATION_FAILED,
            `Pipeline validation failed for format '${request.formatId}'`,
            { request }
          );
        }
      }

      // Execute pipeline with format-specific parameters
      const result = await pipeline.execute(request);

      // Attach warnings to result
      if (warnings.length > 0) {
        result.warnings = [...(result.warnings || []), ...warnings];
      }

      return result;

    } catch (error) {
      // Re-throw FormatRouterError as-is
      if (error instanceof FormatRouterError) {
        throw error;
      }

      // Wrap other errors
      throw new FormatRouterError(
        FormatRouterErrorCode.EXECUTION_FAILED,
        `Pipeline execution failed: ${error instanceof Error ? error.message : String(error)}`,
        { 
          originalError: error,
          request 
        }
      );
    }
  }

  /**
   * Get all registered pipeline format IDs
   * @returns Array of format IDs with registered pipelines
   */
  getRegisteredPipelines(): VideoFormat[] {
    return Array.from(this.pipelines.keys());
  }

  /**
   * Check if a pipeline is registered for a format
   * @param formatId Format identifier
   * @returns True if pipeline is registered
   */
  hasPipeline(formatId: VideoFormat): boolean {
    return this.pipelines.has(formatId);
  }
}

// Export singleton instance
export const formatRouter = new FormatRouter();
