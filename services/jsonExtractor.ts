/**
 * JSON Extractor Service
 * 
 * Robust, multi-strategy JSON extraction system for parsing LLM responses.
 * Implements multiple parsing strategies with progressive fallback and
 * comprehensive error handling.
 * 
 * Feature: agent-director-json-parsing-fix
 * Requirements: 1.1, 1.2, 1.4, 1.5, 5.4, 5.5
 */

import {
  preprocessFormatCorrection,
  needsFormatCorrection,
  responsePatternLibrary,
  type FormatCorrectionResult
} from './promptFormatService';

// --- Enums and Interfaces ---

/**
 * Extraction methods used by the JSONExtractor.
 * Listed in order of preference/reliability.
 */
export enum ExtractionMethod {
  MARKDOWN_BLOCKS = 'markdown_blocks',
  REGEX_PATTERN = 'regex_pattern',
  BRACKET_MATCHING = 'bracket_matching',
  FALLBACK_TEXT = 'fallback_text'
}

/**
 * Result of a successful JSON extraction.
 */
export interface ExtractedJSON {
  data: unknown;
  method: ExtractionMethod;
  confidence: number;
}

/**
 * Detailed error information for failed extractions.
 * Requirements: 1.3, 2.1, 2.3, 2.4
 */
export interface ParseError {
  type: 'JSON_PARSE_ERROR' | 'VALIDATION_ERROR' | 'EXTRACTION_ERROR';
  message: string;
  originalContent: string;
  attemptedMethods: ExtractionMethod[];
  suggestions: string[];
  timestamp: string;
  contentLength: number;
  failureReasons: MethodFailure[];
}

/**
 * Details about why a specific extraction method failed.
 * Requirements: 2.1, 2.3
 */
export interface MethodFailure {
  method: ExtractionMethod;
  error: string;
  attemptedAt: string;
}

/**
 * Success tracking information for extraction methods.
 * Requirements: 2.5
 */
export interface ExtractionSuccess {
  method: ExtractionMethod;
  confidence: number;
  timestamp: string;
  retryCount: number;
  processingTimeMs: number;
}

/**
 * Metrics for tracking method effectiveness.
 * Requirements: 2.5
 */
export interface MethodMetrics {
  method: ExtractionMethod;
  successCount: number;
  failureCount: number;
  averageConfidence: number;
  lastUsed: string | null;
}

/**
 * Result of JSON validation.
 * Requirements: 3.1, 3.4
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fixedData?: unknown;
  fieldErrors: FieldValidationError[];
  suggestions: string[];
}

/**
 * Detailed field-level validation error.
 * Requirements: 3.4
 */
export interface FieldValidationError {
  field: string;
  message: string;
  expectedType?: string;
  actualType?: string;
  suggestion?: string;
}

/**
 * Storyboard scene structure for validation.
 * Requirements: 3.1
 */
export interface StoryboardScene {
  scene?: number;
  prompt?: string;
  text?: string;
  mood?: string;
  timestamp?: string;
  confidence?: number;
  source?: 'llm' | 'fallback' | 'reconstructed';
}

/**
 * Storyboard structure for validation.
 * Requirements: 3.1
 */
export interface StoryboardData {
  prompts?: StoryboardScene[];
  scenes?: StoryboardScene[];
  visual_prompts?: StoryboardScene[];
  visualPrompts?: StoryboardScene[];
  storyboard?: StoryboardScene[];
  metadata?: Record<string, unknown>;
}

/**
 * Internal result type for extraction attempts.
 */
interface ExtractionAttempt {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Logger interface for customizable logging.
 * Requirements: 1.3, 2.4
 */
export interface ExtractorLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

/**
 * Default console logger implementation.
 */
const defaultLogger: ExtractorLogger = {
  info: (message, data) => console.log(`[JSONExtractor] INFO: ${message}`, data || ''),
  warn: (message, data) => console.warn(`[JSONExtractor] WARN: ${message}`, data || ''),
  error: (message, data) => console.error(`[JSONExtractor] ERROR: ${message}`, data || ''),
  debug: (message, data) => console.debug(`[JSONExtractor] DEBUG: ${message}`, data || ''),
};

// --- JSONExtractor Class ---

/**
 * JSONExtractor provides robust JSON extraction from LLM responses.
 * 
 * It implements multiple parsing strategies:
 * 1. Markdown code block extraction
 * 2. Regex-based JSON object detection
 * 3. Bracket matching for malformed JSON
 * 4. Fallback text processing
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 2.4, 2.5, 5.4, 5.5
 */
export class JSONExtractor {
  private attemptedMethods: ExtractionMethod[] = [];
  private lastError: string | null = null;
  private methodFailures: MethodFailure[] = [];
  private lastSuccess: ExtractionSuccess | null = null;
  private methodMetrics: Map<ExtractionMethod, MethodMetrics> = new Map();
  private logger: ExtractorLogger;
  private extractionStartTime: number = 0;
  private lastFormatCorrection: FormatCorrectionResult | null = null;

  constructor(logger?: ExtractorLogger) {
    this.logger = logger || defaultLogger;
    this.initializeMetrics();
  }

  /**
   * Initialize metrics for all extraction methods.
   * Requirements: 2.5
   */
  private initializeMetrics(): void {
    const methods = [
      ExtractionMethod.MARKDOWN_BLOCKS,
      ExtractionMethod.REGEX_PATTERN,
      ExtractionMethod.BRACKET_MATCHING,
      ExtractionMethod.FALLBACK_TEXT
    ];

    for (const method of methods) {
      this.methodMetrics.set(method, {
        method,
        successCount: 0,
        failureCount: 0,
        averageConfidence: 0,
        lastUsed: null
      });
    }
  }

  /**
   * Record a successful extraction for metrics tracking.
   * Requirements: 2.5
   */
  private recordSuccess(method: ExtractionMethod, confidence: number): void {
    if (!this.attemptedMethods.includes(method)) {
      this.attemptedMethods.push(method);
    }

    const metrics = this.methodMetrics.get(method);
    if (metrics) {
      const totalSuccesses = metrics.successCount + 1;
      metrics.averageConfidence = (metrics.averageConfidence * metrics.successCount + confidence) / totalSuccesses;
      metrics.successCount = totalSuccesses;
      metrics.lastUsed = new Date().toISOString();
    }

    this.lastSuccess = {
      method,
      confidence,
      timestamp: new Date().toISOString(),
      retryCount: this.attemptedMethods.length - 1,
      processingTimeMs: Date.now() - this.extractionStartTime
    };

    this.logger.info(`JSON extraction successful using ${method}`, {
      confidence,
      timeMs: this.lastSuccess.processingTimeMs
    });
  }

  /**
   * Record a failed extraction attempt for a specific method.
   * Requirements: 2.1, 2.3
   */
  private recordMethodFailure(method: ExtractionMethod, error: string): void {
    if (!this.attemptedMethods.includes(method)) {
      this.attemptedMethods.push(method);
    }

    const failure: MethodFailure = {
      method,
      error,
      attemptedAt: new Date().toISOString()
    };

    this.methodFailures.push(failure);
    this.lastError = error;

    const metrics = this.methodMetrics.get(method);
    if (metrics) {
      metrics.failureCount++;
      metrics.lastUsed = new Date().toISOString();
    }

    this.logger.warn(`JSON extraction failed using ${method}`, { error });
  }

  /**
   * Extract JSON from content using simplified robust strategies.
   * Native JSON mode in Gemini makes complex regex/bracket matching obsolete.
   * Enhanced with additional fallback strategies for edge cases.
   */
  async extractJSON(content: string): Promise<ExtractedJSON | null> {
    this.attemptedMethods = [];
    this.methodFailures = [];
    this.lastError = null;
    this.lastSuccess = null;
    this.extractionStartTime = Date.now();

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return null;
    }

    // Strategy 1: Direct Parse (Most likely with native JSON mode)
    try {
      const sanitized = this.sanitizeJsonString(content);
      const parsed = JSON.parse(sanitized);
      this.recordSuccess(ExtractionMethod.REGEX_PATTERN, 1.0);
      return { data: parsed, method: ExtractionMethod.REGEX_PATTERN, confidence: 1.0 };
    } catch (e) {
      this.recordMethodFailure(ExtractionMethod.REGEX_PATTERN, String(e));
    }

    // Strategy 2: Markdown Code Blocks (```json ... ```)
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonBlockMatch) {
      try {
        const jsonStr = jsonBlockMatch[1].trim();
        const parsed = JSON.parse(this.sanitizeJsonString(jsonStr));
        this.recordSuccess(ExtractionMethod.MARKDOWN_BLOCKS, 0.95);
        return { data: parsed, method: ExtractionMethod.MARKDOWN_BLOCKS, confidence: 0.95 };
      } catch (e) {
        this.recordMethodFailure(ExtractionMethod.MARKDOWN_BLOCKS, String(e));
      }
    }

    // Strategy 3: Generic Code Blocks (``` ... ```)
    const codeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        const jsonStr = codeBlockMatch[1].trim();
        const parsed = JSON.parse(this.sanitizeJsonString(jsonStr));
        this.recordSuccess(ExtractionMethod.MARKDOWN_BLOCKS, 0.9);
        return { data: parsed, method: ExtractionMethod.MARKDOWN_BLOCKS, confidence: 0.9 };
      } catch (e) {
        this.recordMethodFailure(ExtractionMethod.MARKDOWN_BLOCKS, String(e));
      }
    }

    // Strategy 4: First complete JSON object {...}
    const objMatch = content.match(/(\{[\s\S]*\})/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(this.sanitizeJsonString(objMatch[1]));
        this.recordSuccess(ExtractionMethod.REGEX_PATTERN, 0.8);
        return { data: parsed, method: ExtractionMethod.REGEX_PATTERN, confidence: 0.8 };
      } catch (e) {
        this.recordMethodFailure(ExtractionMethod.REGEX_PATTERN, String(e));
      }
    }

    // Strategy 5: First complete JSON array [...]
    const arrMatch = content.match(/(\[[\s\S]*\])/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(this.sanitizeJsonString(arrMatch[1]));
        this.recordSuccess(ExtractionMethod.REGEX_PATTERN, 0.75);
        return { data: parsed, method: ExtractionMethod.REGEX_PATTERN, confidence: 0.75 };
      } catch (e) {
        this.recordMethodFailure(ExtractionMethod.REGEX_PATTERN, String(e));
      }
    }

    // Strategy 6: Fix common JSON issues and retry
    try {
      const fixed = this.fixCommonJsonIssues(content);
      // Try to find JSON after fixing
      const fixedObjMatch = fixed.match(/(\{[\s\S]*\})/);
      const fixedArrMatch = fixed.match(/(\[[\s\S]*\])/);
      const toTry = fixedObjMatch?.[1] || fixedArrMatch?.[1];

      if (toTry) {
        const parsed = JSON.parse(toTry);
        this.recordSuccess(ExtractionMethod.BRACKET_MATCHING, 0.7);
        return { data: parsed, method: ExtractionMethod.BRACKET_MATCHING, confidence: 0.7 };
      }
    } catch (e) {
      this.recordMethodFailure(ExtractionMethod.BRACKET_MATCHING, String(e));
    }

    // Strategy 7: Strip everything before first [ or { and after last ] or }
    try {
      const cleaned = content
        .replace(/^[\s\S]*?(?=[\[{])/, '') // Remove everything before first [ or {
        .replace(/[\]}][^}\]]*$/, (match) => match[0]) // Keep only up to last ] or }
        .trim();

      if (cleaned.length > 0) {
        const parsed = JSON.parse(this.sanitizeJsonString(cleaned));
        this.recordSuccess(ExtractionMethod.FALLBACK_TEXT, 0.6);
        return { data: parsed, method: ExtractionMethod.FALLBACK_TEXT, confidence: 0.6 };
      }
    } catch (e) {
      this.recordMethodFailure(ExtractionMethod.FALLBACK_TEXT, String(e));
    }

    return null;
  }

  /**
   * Extract JSON and validate with a custom validator function.
   * Useful with Zod schemas or custom validation logic.
   *
   * @param content - Raw string response from LLM
   * @param validate - Validation function that throws on invalid data
   * @returns Validated data or null
   */
  async extractAndValidate<T>(
    content: string,
    validate: (data: unknown) => T
  ): Promise<{ data: T; method: ExtractionMethod; confidence: number } | null> {
    const extracted = await this.extractJSON(content);
    if (!extracted) return null;

    try {
      const validated = validate(extracted.data);
      return {
        data: validated,
        method: extracted.method,
        confidence: extracted.confidence,
      };
    } catch (error) {
      this.logger.warn('Validation failed after extraction', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Sanitize JSON string by handling common formatting issues.
   */
  sanitizeJsonString(jsonStr: string): string {
    return jsonStr
      .replace(/[\x00-\x1F\x7F]/g, (char) => {
        switch (char) {
          case '\n': return '\\n';
          case '\r': return '\\r';
          case '\t': return '\\t';
          default: return '';
        }
      })
      .trim();
  }

  /**
   * Fix common JSON formatting issues.
   */
  fixCommonJsonIssues(jsonStr: string): string {
    return this.sanitizeJsonString(jsonStr)
      .replace(/,(\s*[\]}])/g, '$1'); // Only keep trailing comma fix
  }

  /**
   * Get the list of attempted extraction methods.
   */
  getAttemptedMethods(): ExtractionMethod[] {
    return [...this.attemptedMethods];
  }

  /**
   * Get the last error message.
   */
  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Create a structured parse error with comprehensive diagnostic information.
   * Requirements: 1.3, 2.1, 2.3
   */
  createParseError(content: string): ParseError {
    return {
      type: 'EXTRACTION_ERROR',
      message: this.lastError || 'Unknown extraction error',
      originalContent: content,
      attemptedMethods: this.getAttemptedMethods(),
      suggestions: this.generateSuggestions(content),
      timestamp: new Date().toISOString(),
      contentLength: content?.length || 0,
      failureReasons: [...this.methodFailures]
    };
  }

  /**
   * Get the last successful extraction information.
   * Requirements: 2.5
   */
  getLastSuccess(): ExtractionSuccess | null {
    return this.lastSuccess;
  }

  /**
   * Get method failures from the last extraction attempt.
   * Requirements: 2.1, 2.3
   */
  getMethodFailures(): MethodFailure[] {
    return [...this.methodFailures];
  }

  /**
   * Get metrics for all extraction methods.
   * Requirements: 2.5
   */
  getMethodMetrics(): Map<ExtractionMethod, MethodMetrics> {
    return new Map(this.methodMetrics);
  }

  /**
   * Get metrics for a specific extraction method.
   * Requirements: 2.5
   */
  getMetricsForMethod(method: ExtractionMethod): MethodMetrics | undefined {
    return this.methodMetrics.get(method);
  }

  /**
   * Reset all metrics (useful for testing).
   */
  resetMetrics(): void {
    this.initializeMetrics();
  }

  /**
   * Get a summary of method effectiveness for optimization.
   * Requirements: 2.5
   */
  getMethodEffectivenessSummary(): {
    mostEffective: ExtractionMethod | null;
    leastEffective: ExtractionMethod | null;
    totalExtractions: number;
    overallSuccessRate: number;
  } {
    let mostEffective: ExtractionMethod | null = null;
    let leastEffective: ExtractionMethod | null = null;
    let highestSuccessRate = -1;
    let lowestSuccessRate = 2;
    let totalSuccesses = 0;
    let totalAttempts = 0;

    for (const [method, metrics] of this.methodMetrics) {
      const total = metrics.successCount + metrics.failureCount;
      if (total === 0) continue;

      totalSuccesses += metrics.successCount;
      totalAttempts += total;

      const successRate = metrics.successCount / total;

      if (successRate > highestSuccessRate) {
        highestSuccessRate = successRate;
        mostEffective = method;
      }

      if (successRate < lowestSuccessRate) {
        lowestSuccessRate = successRate;
        leastEffective = method;
      }
    }

    return {
      mostEffective,
      leastEffective,
      totalExtractions: totalAttempts,
      overallSuccessRate: totalAttempts > 0 ? totalSuccesses / totalAttempts : 0
    };
  }

  /**
   * Check if the last extraction required retries.
   * Requirements: 2.5
   */
  wasRetryRequired(): boolean {
    return this.lastSuccess !== null && this.lastSuccess.retryCount > 0;
  }

  /**
   * Get the number of retries from the last extraction.
   * Requirements: 2.5
   */
  getRetryCount(): number {
    return this.lastSuccess?.retryCount || 0;
  }

  /**
   * Generate suggestions for fixing JSON issues.
   */
  private generateSuggestions(content: string): string[] {
    const suggestions: string[] = [];

    if (!content.includes('{') && !content.includes('[')) {
      suggestions.push('Content does not appear to contain JSON. Ensure the LLM response includes JSON data.');
    }

    if (content.includes('```') && !content.includes('```json')) {
      suggestions.push('JSON may be in a code block without the json language specifier.');
    }

    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      suggestions.push(`Unbalanced braces detected: ${openBraces} opening, ${closeBraces} closing.`);
    }

    if (content.includes(',]') || content.includes(',}')) {
      suggestions.push('Trailing commas detected in JSON structure.');
    }

    return suggestions;
  }

  // --- Validation Methods (Requirements: 3.1, 3.2, 3.4) ---

  /**
   * Required fields for a valid storyboard.
   * At least one of these array fields must be present.
   * Requirements: 3.1
   */
  private static readonly STORYBOARD_ARRAY_FIELDS = ['prompts', 'scenes', 'visual_prompts', 'visualPrompts', 'storyboard'];

  /**
   * Required fields for a valid scene/prompt item.
   * At least one text field must be present.
   * Requirements: 3.1
   */
  private static readonly SCENE_TEXT_FIELDS = ['prompt', 'text', 'description', 'content'];

  /**
   * Minimum prompt text length for quality validation.
   * Requirements: 3.3
   */
  private static readonly MIN_PROMPT_LENGTH = 10;

  /**
   * Validate extracted JSON against storyboard schema.
   * Checks required fields, data types, and value constraints.
   * 
   * Requirements: 3.1, 3.2, 3.4
   * 
   * @param json - The extracted JSON to validate
   * @returns ValidationResult with errors, warnings, and suggestions
   */
  validateStoryboard(json: unknown): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fieldErrors: [],
      suggestions: []
    };

    // Check if json is an object
    if (!json || typeof json !== 'object') {
      result.isValid = false;
      result.errors.push('JSON must be an object');
      result.fieldErrors.push({
        field: 'root',
        message: 'Expected an object but received ' + (json === null ? 'null' : typeof json),
        expectedType: 'object',
        actualType: json === null ? 'null' : typeof json,
        suggestion: 'Ensure the JSON response is a valid object with storyboard data'
      });
      return result;
    }

    const obj = json as StoryboardData;

    // Check for at least one storyboard array field
    const foundArrayField = JSONExtractor.STORYBOARD_ARRAY_FIELDS.find(field => {
      const value = obj[field as keyof StoryboardData];
      return value !== undefined;
    });

    if (!foundArrayField) {
      result.isValid = false;
      result.errors.push('Missing required storyboard array field (prompts, scenes, visual_prompts, visualPrompts, or storyboard)');
      result.fieldErrors.push({
        field: 'prompts/scenes',
        message: 'No storyboard array field found',
        expectedType: 'array',
        actualType: 'undefined',
        suggestion: 'Add a "prompts" or "scenes" array containing the visual prompts'
      });
      result.suggestions.push('Add a "prompts" array with scene objects containing "text" or "prompt" fields');
      return result;
    }

    // Get the array field value
    const arrayValue = obj[foundArrayField as keyof StoryboardData];

    // Validate it's actually an array
    if (!Array.isArray(arrayValue)) {
      result.isValid = false;
      result.errors.push(`Field "${foundArrayField}" must be an array`);
      result.fieldErrors.push({
        field: foundArrayField,
        message: `Expected array but received ${typeof arrayValue}`,
        expectedType: 'array',
        actualType: typeof arrayValue,
        suggestion: `Convert "${foundArrayField}" to an array of scene objects`
      });
      return result;
    }

    // Validate array is not empty
    if (arrayValue.length === 0) {
      result.isValid = false;
      result.errors.push(`Field "${foundArrayField}" cannot be empty`);
      result.fieldErrors.push({
        field: foundArrayField,
        message: 'Storyboard array is empty',
        expectedType: 'non-empty array',
        actualType: 'empty array',
        suggestion: 'Add at least one scene/prompt to the storyboard array'
      });
      return result;
    }

    // Validate each scene/prompt in the array
    const scenes = arrayValue as StoryboardScene[];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneValidation = this.validateScene(scene, i, foundArrayField);

      if (!sceneValidation.isValid) {
        result.isValid = false;
      }

      result.errors.push(...sceneValidation.errors);
      result.warnings.push(...sceneValidation.warnings);
      result.fieldErrors.push(...sceneValidation.fieldErrors);
      result.suggestions.push(...sceneValidation.suggestions);
    }

    // Validate metadata if present
    if (obj.metadata !== undefined) {
      if (typeof obj.metadata !== 'object' || obj.metadata === null) {
        result.warnings.push('Metadata field should be an object');
        result.fieldErrors.push({
          field: 'metadata',
          message: 'Expected object but received ' + (obj.metadata === null ? 'null' : typeof obj.metadata),
          expectedType: 'object',
          actualType: obj.metadata === null ? 'null' : typeof obj.metadata,
          suggestion: 'Convert metadata to an object with key-value pairs'
        });
      }
    }

    // Add general suggestions if there are errors
    if (!result.isValid && result.suggestions.length === 0) {
      result.suggestions.push('Review the storyboard structure and ensure all required fields are present');
    }

    return result;
  }

  /**
   * Validate a single scene/prompt object.
   * 
   * Requirements: 3.1, 3.3, 3.4
   * 
   * @param scene - The scene object to validate
   * @param index - The index of the scene in the array
   * @param arrayField - The name of the parent array field
   * @returns ValidationResult for this scene
   */
  private validateScene(scene: unknown, index: number, arrayField: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fieldErrors: [],
      suggestions: []
    };

    const fieldPrefix = `${arrayField}[${index}]`;

    // Check if scene is an object
    if (!scene || typeof scene !== 'object') {
      result.isValid = false;
      result.errors.push(`${fieldPrefix}: Scene must be an object`);
      result.fieldErrors.push({
        field: fieldPrefix,
        message: 'Expected object but received ' + (scene === null ? 'null' : typeof scene),
        expectedType: 'object',
        actualType: scene === null ? 'null' : typeof scene,
        suggestion: 'Convert scene to an object with prompt/text fields'
      });
      return result;
    }

    const sceneObj = scene as StoryboardScene;

    // Check for at least one text field
    const foundTextField = JSONExtractor.SCENE_TEXT_FIELDS.find(field => {
      const value = sceneObj[field as keyof StoryboardScene];
      return value !== undefined && value !== null && value !== '';
    });

    if (!foundTextField) {
      result.isValid = false;
      result.errors.push(`${fieldPrefix}: Missing required text field (prompt, text, description, or content)`);
      result.fieldErrors.push({
        field: `${fieldPrefix}.prompt/text`,
        message: 'No text content found in scene',
        expectedType: 'string',
        actualType: 'undefined',
        suggestion: 'Add a "prompt" or "text" field with the visual description'
      });
      return result;
    }

    // Get the text value and validate it
    const textValue = sceneObj[foundTextField as keyof StoryboardScene];

    if (typeof textValue !== 'string') {
      result.isValid = false;
      result.errors.push(`${fieldPrefix}.${foundTextField}: Must be a string`);
      result.fieldErrors.push({
        field: `${fieldPrefix}.${foundTextField}`,
        message: `Expected string but received ${typeof textValue}`,
        expectedType: 'string',
        actualType: typeof textValue,
        suggestion: 'Convert the prompt/text value to a string'
      });
      return result;
    }

    // Check minimum prompt length (quality requirement)
    if (textValue.trim().length < JSONExtractor.MIN_PROMPT_LENGTH) {
      result.warnings.push(`${fieldPrefix}.${foundTextField}: Prompt text is very short (${textValue.trim().length} chars), may not generate quality images`);
      result.fieldErrors.push({
        field: `${fieldPrefix}.${foundTextField}`,
        message: `Prompt text is too short (minimum ${JSONExtractor.MIN_PROMPT_LENGTH} characters recommended)`,
        expectedType: `string (min ${JSONExtractor.MIN_PROMPT_LENGTH} chars)`,
        actualType: `string (${textValue.trim().length} chars)`,
        suggestion: 'Add more descriptive details to the prompt for better image generation'
      });
    }

    // Validate scene number if present
    if (sceneObj.scene !== undefined) {
      if (typeof sceneObj.scene !== 'number') {
        result.warnings.push(`${fieldPrefix}.scene: Should be a number`);
        result.fieldErrors.push({
          field: `${fieldPrefix}.scene`,
          message: `Expected number but received ${typeof sceneObj.scene}`,
          expectedType: 'number',
          actualType: typeof sceneObj.scene,
          suggestion: 'Convert scene number to a numeric value'
        });
      }
    }

    // Validate mood if present
    if (sceneObj.mood !== undefined && typeof sceneObj.mood !== 'string') {
      result.warnings.push(`${fieldPrefix}.mood: Should be a string`);
      result.fieldErrors.push({
        field: `${fieldPrefix}.mood`,
        message: `Expected string but received ${typeof sceneObj.mood}`,
        expectedType: 'string',
        actualType: typeof sceneObj.mood,
        suggestion: 'Convert mood to a string value'
      });
    }

    // Validate timestamp if present
    if (sceneObj.timestamp !== undefined && typeof sceneObj.timestamp !== 'string') {
      result.warnings.push(`${fieldPrefix}.timestamp: Should be a string`);
      result.fieldErrors.push({
        field: `${fieldPrefix}.timestamp`,
        message: `Expected string but received ${typeof sceneObj.timestamp}`,
        expectedType: 'string',
        actualType: typeof sceneObj.timestamp,
        suggestion: 'Convert timestamp to a string format (e.g., "00:01:30")'
      });
    }

    // Validate confidence if present
    if (sceneObj.confidence !== undefined) {
      if (typeof sceneObj.confidence !== 'number') {
        result.warnings.push(`${fieldPrefix}.confidence: Should be a number`);
        result.fieldErrors.push({
          field: `${fieldPrefix}.confidence`,
          message: `Expected number but received ${typeof sceneObj.confidence}`,
          expectedType: 'number',
          actualType: typeof sceneObj.confidence,
          suggestion: 'Convert confidence to a numeric value between 0 and 1'
        });
      } else if (sceneObj.confidence < 0 || sceneObj.confidence > 1) {
        result.warnings.push(`${fieldPrefix}.confidence: Should be between 0 and 1`);
        result.fieldErrors.push({
          field: `${fieldPrefix}.confidence`,
          message: `Confidence value ${sceneObj.confidence} is out of range`,
          expectedType: 'number (0-1)',
          actualType: `number (${sceneObj.confidence})`,
          suggestion: 'Normalize confidence to a value between 0 and 1'
        });
      }
    }

    // Validate source if present
    if (sceneObj.source !== undefined) {
      const validSources = ['llm', 'fallback', 'reconstructed'];
      if (typeof sceneObj.source !== 'string' || !validSources.includes(sceneObj.source)) {
        result.warnings.push(`${fieldPrefix}.source: Should be one of: ${validSources.join(', ')}`);
        result.fieldErrors.push({
          field: `${fieldPrefix}.source`,
          message: `Invalid source value: ${sceneObj.source}`,
          expectedType: `"llm" | "fallback" | "reconstructed"`,
          actualType: typeof sceneObj.source === 'string' ? `"${sceneObj.source}"` : typeof sceneObj.source,
          suggestion: 'Use one of the valid source values: llm, fallback, or reconstructed'
        });
      }
    }

    return result;
  }

  /**
   * Attempt to reconstruct or fix invalid storyboard data.
   * 
   * Requirements: 3.2
   * 
   * @param json - The invalid JSON to attempt to fix
   * @param validationResult - The validation result with errors
   * @returns Updated ValidationResult with fixedData if reconstruction was possible
   */
  attemptReconstruction(json: unknown, validationResult: ValidationResult): ValidationResult {
    const result = { ...validationResult };

    if (!json || typeof json !== 'object') {
      return result;
    }

    const obj = json as Record<string, unknown>;
    const fixedData: StoryboardData = {};
    let wasFixed = false;

    // Try to find and normalize the prompts array
    for (const field of JSONExtractor.STORYBOARD_ARRAY_FIELDS) {
      if (obj[field] !== undefined) {
        const value = obj[field];

        // If it's already an array, use it
        if (Array.isArray(value)) {
          fixedData.prompts = this.normalizeScenes(value);
          wasFixed = true;
          break;
        }

        // If it's a single object, wrap it in an array
        if (typeof value === 'object' && value !== null) {
          fixedData.prompts = this.normalizeScenes([value]);
          wasFixed = true;
          break;
        }
      }
    }

    // If no array field found, check if the object itself looks like a scene
    if (!wasFixed && this.looksLikeScene(obj)) {
      fixedData.prompts = this.normalizeScenes([obj]);
      wasFixed = true;
    }

    // Copy metadata if present
    if (obj.metadata && typeof obj.metadata === 'object') {
      fixedData.metadata = obj.metadata as Record<string, unknown>;
    }

    if (wasFixed && fixedData.prompts && fixedData.prompts.length > 0) {
      result.fixedData = fixedData;
      result.suggestions.push('Data was automatically reconstructed - please verify the results');
    }

    return result;
  }

  /**
   * Check if an object looks like a scene/prompt.
   */
  private looksLikeScene(obj: Record<string, unknown>): boolean {
    return JSONExtractor.SCENE_TEXT_FIELDS.some(field =>
      typeof obj[field] === 'string' && (obj[field] as string).length > 0
    );
  }

  /**
   * Normalize an array of scenes to ensure consistent structure.
   */
  private normalizeScenes(scenes: unknown[]): StoryboardScene[] {
    return scenes
      .filter(scene => scene && typeof scene === 'object')
      .map((scene, index) => {
        const sceneObj = scene as Record<string, unknown>;
        const normalized: StoryboardScene = {
          scene: index + 1
        };

        // Find and copy the text field
        for (const field of JSONExtractor.SCENE_TEXT_FIELDS) {
          if (typeof sceneObj[field] === 'string') {
            normalized.prompt = sceneObj[field] as string;
            break;
          }
        }

        // Copy other fields if present
        if (typeof sceneObj.mood === 'string') {
          normalized.mood = sceneObj.mood;
        }
        if (typeof sceneObj.timestamp === 'string') {
          normalized.timestamp = sceneObj.timestamp;
        }
        if (typeof sceneObj.confidence === 'number') {
          normalized.confidence = sceneObj.confidence;
        }
        if (typeof sceneObj.source === 'string') {
          normalized.source = sceneObj.source as 'llm' | 'fallback' | 'reconstructed';
        }

        return normalized;
      })
      .filter(scene => scene.prompt !== undefined);
  }

  // --- Content Sanitization Methods (Requirements: 3.5) ---

  /**
   * Patterns for potentially harmful content that should be removed or neutralized.
   * Requirements: 3.5
   */
  private static readonly HARMFUL_PATTERNS: { pattern: RegExp; replacement: string; description: string }[] = [
    // Script injection patterns
    { pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, replacement: '', description: 'script tags' },
    { pattern: /javascript:/gi, replacement: '', description: 'javascript: protocol' },
    { pattern: /on\w+\s*=/gi, replacement: '', description: 'event handlers' },

    // HTML injection patterns
    { pattern: /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, replacement: '', description: 'iframe tags' },
    { pattern: /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, replacement: '', description: 'object tags' },
    { pattern: /<embed\b[^>]*>/gi, replacement: '', description: 'embed tags' },
    { pattern: /<link\b[^>]*>/gi, replacement: '', description: 'link tags' },
    { pattern: /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, replacement: '', description: 'style tags' },

    // Data URI patterns (potential for embedded malicious content)
    { pattern: /data:\s*[^,]*;base64,/gi, replacement: '', description: 'base64 data URIs' },

    // SQL injection patterns (basic)
    { pattern: /;\s*DROP\s+TABLE/gi, replacement: '', description: 'SQL DROP statements' },
    { pattern: /;\s*DELETE\s+FROM/gi, replacement: '', description: 'SQL DELETE statements' },
    { pattern: /;\s*INSERT\s+INTO/gi, replacement: '', description: 'SQL INSERT statements' },
    { pattern: /;\s*UPDATE\s+\w+\s+SET/gi, replacement: '', description: 'SQL UPDATE statements' },

    // Command injection patterns
    { pattern: /\$\([^)]+\)/g, replacement: '', description: 'shell command substitution' },
    { pattern: /`[^`]+`/g, replacement: '', description: 'backtick command execution' },
    { pattern: /\|\s*\w+/g, replacement: '', description: 'pipe commands' },
  ];

  /**
   * Fields that should be sanitized in storyboard data.
   * Requirements: 3.5
   */
  private static readonly SANITIZABLE_FIELDS = ['prompt', 'text', 'description', 'content', 'mood', 'style'];

  /**
   * Sanitize extracted JSON to remove potentially harmful content.
   * 
   * Requirements: 3.5
   * 
   * @param json - The JSON data to sanitize
   * @returns Sanitized JSON data
   */
  sanitizeJSON(json: unknown): unknown {
    if (json === null || json === undefined) {
      return json;
    }

    if (typeof json === 'string') {
      return this.sanitizeString(json);
    }

    if (Array.isArray(json)) {
      return json.map(item => this.sanitizeJSON(item));
    }

    if (typeof json === 'object') {
      return this.sanitizeObject(json as Record<string, unknown>);
    }

    // Primitives (number, boolean) pass through unchanged
    return json;
  }

  /**
   * Sanitize a string value by removing harmful patterns.
   * 
   * Requirements: 3.5
   * 
   * @param str - The string to sanitize
   * @returns Sanitized string
   */
  sanitizeString(str: string): string {
    let sanitized = str;

    for (const { pattern, replacement } of JSONExtractor.HARMFUL_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement);
    }

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Normalize whitespace (but preserve intentional formatting)
    sanitized = sanitized.replace(/[\r\n]+/g, '\n').trim();

    return sanitized;
  }

  /**
   * Sanitize an object by sanitizing all string fields.
   * 
   * Requirements: 3.5
   * 
   * @param obj - The object to sanitize
   * @returns Sanitized object
   */
  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Sanitize the key itself
      const sanitizedKey = this.sanitizeString(key);

      // Recursively sanitize the value
      sanitized[sanitizedKey] = this.sanitizeJSON(value);
    }

    return sanitized;
  }

  /**
   * Sanitize storyboard data specifically, with field-aware sanitization.
   * 
   * Requirements: 3.5
   * 
   * @param storyboard - The storyboard data to sanitize
   * @returns Sanitized storyboard data
   */
  sanitizeStoryboard(storyboard: StoryboardData): StoryboardData {
    const sanitized: StoryboardData = {};

    // Sanitize each array field if present
    if (storyboard.prompts && Array.isArray(storyboard.prompts)) {
      sanitized.prompts = storyboard.prompts.map(scene => this.sanitizeScene(scene));
    }
    if (storyboard.scenes && Array.isArray(storyboard.scenes)) {
      sanitized.scenes = storyboard.scenes.map(scene => this.sanitizeScene(scene));
    }
    if (storyboard.visual_prompts && Array.isArray(storyboard.visual_prompts)) {
      sanitized.visual_prompts = storyboard.visual_prompts.map(scene => this.sanitizeScene(scene));
    }
    if (storyboard.visualPrompts && Array.isArray(storyboard.visualPrompts)) {
      sanitized.visualPrompts = storyboard.visualPrompts.map(scene => this.sanitizeScene(scene));
    }
    if (storyboard.storyboard && Array.isArray(storyboard.storyboard)) {
      sanitized.storyboard = storyboard.storyboard.map(scene => this.sanitizeScene(scene));
    }

    // Sanitize metadata if present
    if (storyboard.metadata) {
      sanitized.metadata = this.sanitizeJSON(storyboard.metadata) as Record<string, unknown>;
    }

    return sanitized;
  }

  /**
   * Sanitize a single scene/prompt object.
   * 
   * Requirements: 3.5
   * 
   * @param scene - The scene to sanitize
   * @returns Sanitized scene
   */
  private sanitizeScene(scene: StoryboardScene): StoryboardScene {
    const sanitized: StoryboardScene = {};

    // Copy and sanitize text fields
    for (const field of JSONExtractor.SANITIZABLE_FIELDS) {
      const value = scene[field as keyof StoryboardScene];
      if (typeof value === 'string') {
        (sanitized as Record<string, unknown>)[field] = this.sanitizeString(value);
      }
    }

    // Copy non-string fields directly
    if (typeof scene.scene === 'number') {
      sanitized.scene = scene.scene;
    }
    if (typeof scene.confidence === 'number') {
      sanitized.confidence = scene.confidence;
    }
    if (scene.source && ['llm', 'fallback', 'reconstructed'].includes(scene.source)) {
      sanitized.source = scene.source;
    }
    if (typeof scene.timestamp === 'string') {
      sanitized.timestamp = this.sanitizeString(scene.timestamp);
    }

    return sanitized;
  }

  /**
   * Check if a string contains potentially harmful content.
   * 
   * Requirements: 3.5
   * 
   * @param str - The string to check
   * @returns Object with isHarmful flag and detected patterns
   */
  detectHarmfulContent(str: string): { isHarmful: boolean; detectedPatterns: string[] } {
    const detectedPatterns: string[] = [];

    for (const { pattern, description } of JSONExtractor.HARMFUL_PATTERNS) {
      if (pattern.test(str)) {
        detectedPatterns.push(description);
        // Reset regex lastIndex for global patterns
        pattern.lastIndex = 0;
      }
    }

    return {
      isHarmful: detectedPatterns.length > 0,
      detectedPatterns
    };
  }

  /**
   * Sanitize and validate JSON in one operation.
   * 
   * Requirements: 3.1, 3.5
   * 
   * @param json - The JSON to sanitize and validate
   * @returns Object with sanitized data and validation result
   */
  sanitizeAndValidate(json: unknown): { sanitized: unknown; validation: ValidationResult } {
    const sanitized = this.sanitizeJSON(json);
    const validation = this.validateStoryboard(sanitized);

    return { sanitized, validation };
  }

  // --- Validation Error Reporting Methods (Requirements: 3.4) ---

  /**
   * Generate a human-readable validation error report.
   * 
   * Requirements: 3.4
   * 
   * @param validation - The validation result to format
   * @returns Formatted error report string
   */
  formatValidationReport(validation: ValidationResult): string {
    const lines: string[] = [];

    lines.push('=== Validation Report ===');
    lines.push(`Status: ${validation.isValid ? 'VALID' : 'INVALID'}`);
    lines.push('');

    if (validation.errors.length > 0) {
      lines.push('Errors:');
      for (const error of validation.errors) {
        lines.push(`  ❌ ${error}`);
      }
      lines.push('');
    }

    if (validation.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of validation.warnings) {
        lines.push(`  ⚠️ ${warning}`);
      }
      lines.push('');
    }

    if (validation.fieldErrors.length > 0) {
      lines.push('Field Details:');
      for (const fieldError of validation.fieldErrors) {
        lines.push(`  Field: ${fieldError.field}`);
        lines.push(`    Message: ${fieldError.message}`);
        if (fieldError.expectedType) {
          lines.push(`    Expected: ${fieldError.expectedType}`);
        }
        if (fieldError.actualType) {
          lines.push(`    Actual: ${fieldError.actualType}`);
        }
        if (fieldError.suggestion) {
          lines.push(`    Suggestion: ${fieldError.suggestion}`);
        }
        lines.push('');
      }
    }

    if (validation.suggestions.length > 0) {
      lines.push('Suggestions:');
      for (const suggestion of validation.suggestions) {
        lines.push(`  💡 ${suggestion}`);
      }
      lines.push('');
    }

    if (validation.fixedData) {
      lines.push('Note: Automatic reconstruction was attempted. Please verify the results.');
    }

    return lines.join('\n');
  }

  /**
   * Create a structured validation error for API responses.
   * 
   * Requirements: 3.4
   * 
   * @param validation - The validation result
   * @returns Structured error object suitable for API responses
   */
  createValidationError(validation: ValidationResult): ParseError {
    const primaryError = validation.errors[0] || 'Validation failed';
    const allSuggestions = [
      ...validation.suggestions,
      ...validation.fieldErrors
        .filter(fe => fe.suggestion)
        .map(fe => fe.suggestion as string)
    ];

    return {
      type: 'VALIDATION_ERROR',
      message: primaryError,
      originalContent: '',
      attemptedMethods: [],
      suggestions: [...new Set(allSuggestions)], // Deduplicate
      timestamp: new Date().toISOString(),
      contentLength: 0,
      failureReasons: validation.fieldErrors.map(fe => ({
        method: ExtractionMethod.MARKDOWN_BLOCKS, // Placeholder
        error: `${fe.field}: ${fe.message}`,
        attemptedAt: new Date().toISOString()
      }))
    };
  }

  /**
   * Get a summary of validation issues for quick display.
   * 
   * Requirements: 3.4
   * 
   * @param validation - The validation result
   * @returns Summary object with counts and primary issues
   */
  getValidationSummary(validation: ValidationResult): {
    isValid: boolean;
    errorCount: number;
    warningCount: number;
    primaryError: string | null;
    primarySuggestion: string | null;
  } {
    return {
      isValid: validation.isValid,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      primaryError: validation.errors[0] || null,
      primarySuggestion: validation.suggestions[0] ||
        validation.fieldErrors.find(fe => fe.suggestion)?.suggestion || null
    };
  }

  /**
   * Check if validation result has specific field errors.
   * 
   * Requirements: 3.4
   * 
   * @param validation - The validation result
   * @param fieldPattern - Regex pattern to match field names
   * @returns Array of matching field errors
   */
  getFieldErrors(validation: ValidationResult, fieldPattern: RegExp): FieldValidationError[] {
    return validation.fieldErrors.filter(fe => fieldPattern.test(fe.field));
  }

  /**
   * Merge multiple validation results into one.
   * Useful when validating multiple parts of a complex structure.
   * 
   * Requirements: 3.4
   * 
   * @param results - Array of validation results to merge
   * @returns Merged validation result
   */
  mergeValidationResults(...results: ValidationResult[]): ValidationResult {
    const merged: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fieldErrors: [],
      suggestions: []
    };

    for (const result of results) {
      if (!result.isValid) {
        merged.isValid = false;
      }
      merged.errors.push(...result.errors);
      merged.warnings.push(...result.warnings);
      merged.fieldErrors.push(...result.fieldErrors);
      merged.suggestions.push(...result.suggestions);

      if (result.fixedData && !merged.fixedData) {
        merged.fixedData = result.fixedData;
      }
    }

    // Deduplicate suggestions
    merged.suggestions = [...new Set(merged.suggestions)];

    return merged;
  }

}

// --- Fallback Processing System (Requirements: 4.1, 4.2, 4.3, 4.4, 4.5) ---

/**
 * Fallback notification callback type.
 * Requirements: 4.4
 */
export type FallbackNotificationCallback = (notification: FallbackNotification) => void;

/**
 * Fallback notification structure.
 * Requirements: 4.4
 */
export interface FallbackNotification {
  type: 'fallback_used';
  message: string;
  originalContentPreview: string;
  extractedPromptCount: number;
  timestamp: string;
  reducedFunctionality: string[];
}

/**
 * Fallback usage metrics.
 * Requirements: 4.5
 */
export interface FallbackMetrics {
  totalFallbackUsages: number;
  successfulFallbacks: number;
  failedFallbacks: number;
  averagePromptsExtracted: number;
  lastFallbackTimestamp: string | null;
  fallbackReasons: Map<string, number>;
}

/**
 * Basic storyboard structure generated by fallback processing.
 * Requirements: 4.2
 */
export interface BasicStoryboard {
  prompts: StoryboardScene[];
  metadata: {
    source: 'fallback';
    extractionMethod: 'text_based';
    confidence: number;
    originalContentLength: number;
    processingTimestamp: string;
    warnings: string[];
  };
}

/**
 * Result of text-based prompt extraction.
 * Requirements: 4.1
 */
export interface TextExtractionResult {
  prompts: string[];
  emotionalContent: string[];
  sceneDescriptions: string[];
  confidence: number;
}

/**
 * FallbackProcessor provides alternative processing when primary JSON extraction fails.
 * 
 * It implements:
 * 1. Text-based prompt extraction from unstructured content
 * 2. Basic storyboard generation from extracted prompts
 * 3. Semantic information preservation
 * 4. User notification system
 * 5. Metrics tracking
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
export class FallbackProcessor {
  private metrics: FallbackMetrics;
  private notificationCallbacks: FallbackNotificationCallback[] = [];
  private logger: ExtractorLogger;

  constructor(logger?: ExtractorLogger) {
    this.logger = logger || defaultLogger;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize fallback metrics.
   * Requirements: 4.5
   */
  private initializeMetrics(): FallbackMetrics {
    return {
      totalFallbackUsages: 0,
      successfulFallbacks: 0,
      failedFallbacks: 0,
      averagePromptsExtracted: 0,
      lastFallbackTimestamp: null,
      fallbackReasons: new Map()
    };
  }

  /**
   * Register a callback for fallback notifications.
   * Requirements: 4.4
   */
  registerNotificationCallback(callback: FallbackNotificationCallback): void {
    this.notificationCallbacks.push(callback);
  }

  /**
   * Unregister a notification callback.
   * Requirements: 4.4
   */
  unregisterNotificationCallback(callback: FallbackNotificationCallback): void {
    const index = this.notificationCallbacks.indexOf(callback);
    if (index > -1) {
      this.notificationCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify all registered callbacks about fallback usage.
   * Requirements: 4.4
   */
  private notifyFallbackUsed(notification: FallbackNotification): void {
    for (const callback of this.notificationCallbacks) {
      try {
        callback(notification);
      } catch (error) {
        this.logger.error('Notification callback error', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Extract visual prompts from unstructured text content.
   * Identifies scene descriptions, emotional content, and visual elements.
   * 
   * Requirements: 4.1, 4.2
   * 
   * @param content - The unstructured text content to process
   * @returns TextExtractionResult with extracted prompts and metadata
   */
  extractPromptsFromText(content: string): TextExtractionResult {
    const result: TextExtractionResult = {
      prompts: [],
      emotionalContent: [],
      sceneDescriptions: [],
      confidence: 0
    };

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return result;
    }

    // Patterns for identifying visual/scene descriptions
    const visualPatterns = [
      // Scene descriptions with visual keywords
      /(?:scene|visual|image|picture|shot|frame|view|setting)[\s:]+([^.!?\n]{15,200})/gi,
      // Descriptions starting with visual verbs
      /(?:show|display|depict|illustrate|portray|capture|reveal)s?\s+([^.!?\n]{15,200})/gi,
      // "A/An/The [adjective] [noun]" patterns (common in prompts)
      /(?:^|\.\s+)((?:a|an|the)\s+(?:\w+\s+){1,5}(?:scene|landscape|portrait|view|moment|setting)[^.!?\n]{10,150})/gi,
      // Descriptive sentences with visual adjectives
      /([^.!?\n]*(?:beautiful|stunning|dramatic|serene|vibrant|dark|bright|colorful|moody|atmospheric)[^.!?\n]{15,150})/gi,
    ];

    // Patterns for emotional content
    const emotionalPatterns = [
      /(?:mood|emotion|feeling|atmosphere|tone)[\s:]+([^.!?\n]{5,100})/gi,
      /(?:evokes?|conveys?|expresses?|captures?)\s+(?:a\s+)?(?:sense\s+of\s+)?([^.!?\n]{5,100})/gi,
      /(?:melancholic|hopeful|intense|peaceful|dramatic|serene|joyful|somber|nostalgic|ethereal)[^.!?\n]{0,50}/gi,
    ];

    // Extract visual prompts
    const extractedPrompts = new Set<string>();
    for (const pattern of visualPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const prompt = (match[1] || match[0]).trim();
        if (prompt.length >= 15 && prompt.length <= 300) {
          extractedPrompts.add(this.cleanPromptText(prompt));
        }
      }
    }

    // Extract emotional content
    const extractedEmotions = new Set<string>();
    for (const pattern of emotionalPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const emotion = (match[1] || match[0]).trim();
        if (emotion.length >= 3 && emotion.length <= 100) {
          extractedEmotions.add(emotion.toLowerCase());
        }
      }
    }

    // If no patterns matched, try sentence-based extraction
    if (extractedPrompts.size === 0) {
      const sentences = this.extractSentences(content);
      for (const sentence of sentences) {
        if (this.looksLikeVisualDescription(sentence)) {
          extractedPrompts.add(this.cleanPromptText(sentence));
        }
      }
    }

    // Extract scene descriptions (numbered or labeled sections)
    const scenePatterns = [
      /(?:scene\s*\d+|part\s*\d+|section\s*\d+)[\s:]+([^.!?\n]{15,200})/gi,
      /(?:\d+\.\s*)([^.!?\n]{15,200})/gi,
      /(?:intro|verse|chorus|bridge|outro)[\s:]+([^.!?\n]{15,200})/gi,
    ];

    for (const pattern of scenePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const scene = (match[1] || match[0]).trim();
        if (scene.length >= 15) {
          result.sceneDescriptions.push(this.cleanPromptText(scene));
        }
      }
    }

    result.prompts = Array.from(extractedPrompts);
    result.emotionalContent = Array.from(extractedEmotions);

    // Calculate confidence based on extraction quality
    result.confidence = this.calculateExtractionConfidence(result, content);

    return result;
  }

  /**
   * Clean and normalize prompt text.
   */
  private cleanPromptText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
      .trim();
  }

  /**
   * Extract sentences from content.
   */
  private extractSentences(content: string): string[] {
    // Split on sentence boundaries
    const sentences = content.split(/(?<=[.!?])\s+/);
    return sentences
      .map(s => s.trim())
      .filter(s => s.length >= 15 && s.length <= 300);
  }

  /**
   * Check if a sentence looks like a visual description.
   */
  private looksLikeVisualDescription(sentence: string): boolean {
    const visualKeywords = [
      'scene', 'visual', 'image', 'picture', 'view', 'landscape',
      'portrait', 'setting', 'background', 'foreground', 'color',
      'light', 'shadow', 'sky', 'ocean', 'mountain', 'forest',
      'city', 'room', 'person', 'figure', 'silhouette'
    ];

    const visualAdjectives = [
      'beautiful', 'stunning', 'dramatic', 'serene', 'vibrant',
      'dark', 'bright', 'colorful', 'moody', 'atmospheric',
      'ethereal', 'mystical', 'peaceful', 'intense', 'soft'
    ];

    const lowerSentence = sentence.toLowerCase();

    const hasVisualKeyword = visualKeywords.some(kw => lowerSentence.includes(kw));
    const hasVisualAdjective = visualAdjectives.some(adj => lowerSentence.includes(adj));

    return hasVisualKeyword || hasVisualAdjective;
  }

  /**
   * Calculate confidence score for extraction result.
   */
  private calculateExtractionConfidence(result: TextExtractionResult, originalContent: string): number {
    let confidence = 0;

    // Base confidence from prompt count
    if (result.prompts.length > 0) {
      confidence += Math.min(0.3, result.prompts.length * 0.1);
    }

    // Bonus for emotional content
    if (result.emotionalContent.length > 0) {
      confidence += Math.min(0.2, result.emotionalContent.length * 0.05);
    }

    // Bonus for scene descriptions
    if (result.sceneDescriptions.length > 0) {
      confidence += Math.min(0.2, result.sceneDescriptions.length * 0.05);
    }

    // Bonus for content coverage
    const totalExtractedLength = result.prompts.join(' ').length +
      result.sceneDescriptions.join(' ').length;
    const coverageRatio = totalExtractedLength / originalContent.length;
    confidence += Math.min(0.3, coverageRatio);

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Generate a basic storyboard structure from text prompts.
   * Preserves semantic information during conversion.
   * 
   * Requirements: 4.2, 4.3
   * 
   * @param content - The original text content
   * @param reason - The reason fallback was triggered
   * @returns BasicStoryboard with generated scenes
   */
  generateBasicStoryboard(content: string, reason: string = 'json_extraction_failed'): BasicStoryboard {
    const startTime = Date.now();
    const extraction = this.extractPromptsFromText(content);

    const storyboard: BasicStoryboard = {
      prompts: [],
      metadata: {
        source: 'fallback',
        extractionMethod: 'text_based',
        confidence: extraction.confidence,
        originalContentLength: content.length,
        processingTimestamp: new Date().toISOString(),
        warnings: []
      }
    };

    // Combine prompts and scene descriptions
    const allPrompts = [...extraction.prompts, ...extraction.sceneDescriptions];

    // Remove duplicates while preserving order
    const uniquePrompts = [...new Set(allPrompts)];

    // Generate scenes from extracted prompts
    for (let i = 0; i < uniquePrompts.length; i++) {
      const prompt = uniquePrompts[i];
      const scene: StoryboardScene = {
        scene: i + 1,
        prompt: prompt,
        source: 'fallback',
        confidence: extraction.confidence
      };

      // Try to associate emotional content with scenes
      if (extraction.emotionalContent.length > 0) {
        const moodIndex = i % extraction.emotionalContent.length;
        scene.mood = extraction.emotionalContent[moodIndex];
      }

      storyboard.prompts.push(scene);
    }

    // If no prompts were extracted, create a minimal storyboard from content
    if (storyboard.prompts.length === 0) {
      storyboard.metadata.warnings.push('No visual prompts could be extracted from content');

      // Try to create at least one scene from the content
      const trimmedContent = content.trim();
      if (trimmedContent.length >= 15) {
        const fallbackPrompt = trimmedContent.length > 200
          ? trimmedContent.substring(0, 200) + '...'
          : trimmedContent;

        storyboard.prompts.push({
          scene: 1,
          prompt: fallbackPrompt,
          source: 'fallback',
          confidence: 0.1
        });
        storyboard.metadata.warnings.push('Created minimal scene from raw content');
      }
    }

    // Update metrics
    this.updateMetrics(storyboard.prompts.length, reason, storyboard.prompts.length > 0);

    // Send notification
    this.notifyFallbackUsed({
      type: 'fallback_used',
      message: `Fallback processing was used because: ${reason}. ${storyboard.prompts.length} prompts were extracted.`,
      originalContentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      extractedPromptCount: storyboard.prompts.length,
      timestamp: new Date().toISOString(),
      reducedFunctionality: this.getReducedFunctionalityList(storyboard)
    });

    this.logger.info('Fallback storyboard generated', {
      promptCount: storyboard.prompts.length,
      confidence: storyboard.metadata.confidence,
      processingTimeMs: Date.now() - startTime,
      reason
    });

    return storyboard;
  }

  /**
   * Get list of reduced functionality when using fallback.
   * Requirements: 4.4
   */
  private getReducedFunctionalityList(storyboard: BasicStoryboard): string[] {
    const reduced: string[] = [];

    if (storyboard.metadata.confidence < 0.5) {
      reduced.push('Low confidence in extracted prompts - results may not match original intent');
    }

    if (storyboard.prompts.length === 0) {
      reduced.push('No prompts could be extracted - storyboard is empty');
    } else if (storyboard.prompts.length < 3) {
      reduced.push('Limited number of prompts extracted - storyboard may be incomplete');
    }

    if (!storyboard.prompts.some(p => p.mood)) {
      reduced.push('Emotional/mood information could not be extracted');
    }

    if (storyboard.metadata.warnings.length > 0) {
      reduced.push('Processing warnings occurred - review storyboard carefully');
    }

    return reduced;
  }

  /**
   * Update fallback metrics.
   * Requirements: 4.5
   */
  private updateMetrics(promptCount: number, reason: string, success: boolean): void {
    this.metrics.totalFallbackUsages++;
    this.metrics.lastFallbackTimestamp = new Date().toISOString();

    if (success) {
      this.metrics.successfulFallbacks++;
      // Update average prompts extracted
      const totalPrompts = this.metrics.averagePromptsExtracted * (this.metrics.successfulFallbacks - 1) + promptCount;
      this.metrics.averagePromptsExtracted = totalPrompts / this.metrics.successfulFallbacks;
    } else {
      this.metrics.failedFallbacks++;
    }

    // Track fallback reasons
    const currentCount = this.metrics.fallbackReasons.get(reason) || 0;
    this.metrics.fallbackReasons.set(reason, currentCount + 1);
  }

  /**
   * Get current fallback metrics.
   * Requirements: 4.5
   */
  getMetrics(): FallbackMetrics {
    return {
      ...this.metrics,
      fallbackReasons: new Map(this.metrics.fallbackReasons)
    };
  }

  /**
   * Reset fallback metrics.
   * Requirements: 4.5
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  /**
   * Get a summary of fallback usage for monitoring.
   * Requirements: 4.5
   */
  getMetricsSummary(): {
    totalUsages: number;
    successRate: number;
    averagePrompts: number;
    topReasons: { reason: string; count: number }[];
  } {
    const topReasons = Array.from(this.metrics.fallbackReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalUsages: this.metrics.totalFallbackUsages,
      successRate: this.metrics.totalFallbackUsages > 0
        ? this.metrics.successfulFallbacks / this.metrics.totalFallbackUsages
        : 0,
      averagePrompts: this.metrics.averagePromptsExtracted,
      topReasons
    };
  }

  /**
   * Process content with fallback when JSON extraction fails.
   * This is the main entry point for fallback processing.
   * 
   * Requirements: 4.1, 4.2, 4.3, 4.4
   * 
   * @param content - The content that failed JSON extraction
   * @param extractionError - The error from JSON extraction
   * @returns BasicStoryboard or null if fallback also fails
   */
  processWithFallback(content: string, extractionError: string): BasicStoryboard | null {
    this.logger.info('Starting fallback processing', {
      contentLength: content.length,
      extractionError
    });

    try {
      const storyboard = this.generateBasicStoryboard(content, extractionError);

      if (storyboard.prompts.length === 0) {
        this.logger.warn('Fallback processing produced no prompts');
        return null;
      }

      return storyboard;
    } catch (error) {
      this.logger.error('Fallback processing failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      this.updateMetrics(0, 'fallback_error', false);
      return null;
    }
  }
}

// Export singleton instances for convenience
export const jsonExtractor = new JSONExtractor();
export const fallbackProcessor = new FallbackProcessor();
