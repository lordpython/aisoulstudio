/**
 * JSONExtractor Class
 *
 * Robust, multi-strategy JSON extraction from LLM responses.
 * Implements progressive fallback through multiple parsing strategies.
 */

import type {
  ExtractedJSON,
  ParseError,
  MethodFailure,
  ExtractionSuccess,
  MethodMetrics,
  ValidationResult,
  FieldValidationError,
  StoryboardScene,
  StoryboardData,
  ExtractorLogger,
} from './types';
import { ExtractionMethod, defaultLogger } from './types';

export class JSONExtractor {
  private attemptedMethods: ExtractionMethod[] = [];
  private lastError: string | null = null;
  private methodFailures: MethodFailure[] = [];
  private lastSuccess: ExtractionSuccess | null = null;
  private methodMetrics: Map<ExtractionMethod, MethodMetrics> = new Map();
  private logger: ExtractorLogger;
  private extractionStartTime: number = 0;

  constructor(logger?: ExtractorLogger) {
    this.logger = logger || defaultLogger;
    this.initializeMetrics();
  }

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
    if (jsonBlockMatch && jsonBlockMatch[1]) {
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
    if (codeBlockMatch && codeBlockMatch[1]) {
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
    if (objMatch && objMatch[1]) {
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
    if (arrMatch && arrMatch[1]) {
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
        .replace(/^[\s\S]*?(?=[\[{])/, '')
        .replace(/[\]}][^}\]]*$/, (match) => match[0] ?? "")
        .trim();

      if (cleaned.length > 0) {
        const parsed = JSON.parse(this.sanitizeJsonString(cleaned));
        this.recordSuccess(ExtractionMethod.FALLBACK_TEXT, 0.6);
        return { data: parsed, method: ExtractionMethod.FALLBACK_TEXT, confidence: 0.6 };
      }
    } catch (e) {
      this.recordMethodFailure(ExtractionMethod.FALLBACK_TEXT, String(e));
    }

    // Strategy 8: Repair truncated JSON
    try {
      const fromBrace = content.indexOf('{');
      if (fromBrace !== -1) {
        const partial = content
          .substring(fromBrace)
          .replace(/[\]}][^}\]]*$/, (match) => match[0] ?? "")
          .trim();

        for (const suffix of [']}', ']}}', '}]}', '}}']) {
          try {
            const repaired = partial + suffix;
            const parsed = JSON.parse(repaired);
            if (parsed?.prompts && Array.isArray(parsed.prompts) && parsed.prompts.length > 0) {
              this.recordSuccess(ExtractionMethod.BRACKET_MATCHING, 0.65);
              return { data: parsed, method: ExtractionMethod.BRACKET_MATCHING, confidence: 0.65 };
            }
          } catch (_) { /* try next suffix */ }
        }
      }
    } catch (e) {
      this.recordMethodFailure(ExtractionMethod.BRACKET_MATCHING, String(e));
    }

    return null;
  }

  /**
   * Extract JSON and validate with a custom validator function.
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
      .replace(/,(\s*[\]}])/g, '$1');
  }

  getAttemptedMethods(): ExtractionMethod[] {
    return [...this.attemptedMethods];
  }

  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Create a structured parse error with comprehensive diagnostic information.
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

  getLastSuccess(): ExtractionSuccess | null {
    return this.lastSuccess;
  }

  getMethodFailures(): MethodFailure[] {
    return [...this.methodFailures];
  }

  getMethodMetrics(): Map<ExtractionMethod, MethodMetrics> {
    return new Map(this.methodMetrics);
  }

  getMetricsForMethod(method: ExtractionMethod): MethodMetrics | undefined {
    return this.methodMetrics.get(method);
  }

  resetMetrics(): void {
    this.initializeMetrics();
  }

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

  wasRetryRequired(): boolean {
    return this.lastSuccess !== null && this.lastSuccess.retryCount > 0;
  }

  getRetryCount(): number {
    return this.lastSuccess?.retryCount || 0;
  }

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

  // --- Validation Methods ---

  private static readonly STORYBOARD_ARRAY_FIELDS = ['prompts', 'scenes', 'visual_prompts', 'visualPrompts', 'storyboard'];
  private static readonly SCENE_TEXT_FIELDS = ['prompt', 'text', 'description', 'content'];
  private static readonly MIN_PROMPT_LENGTH = 10;

  validateStoryboard(json: unknown): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fieldErrors: [],
      suggestions: []
    };

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

    const arrayValue = obj[foundArrayField as keyof StoryboardData];

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

    if (!result.isValid && result.suggestions.length === 0) {
      result.suggestions.push('Review the storyboard structure and ensure all required fields are present');
    }

    return result;
  }

  private validateScene(scene: unknown, index: number, arrayField: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fieldErrors: [],
      suggestions: []
    };

    const fieldPrefix = `${arrayField}[${index}]`;

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

  attemptReconstruction(json: unknown, validationResult: ValidationResult): ValidationResult {
    const result = { ...validationResult };

    if (!json || typeof json !== 'object') {
      return result;
    }

    const obj = json as Record<string, unknown>;
    const fixedData: StoryboardData = {};
    let wasFixed = false;

    for (const field of JSONExtractor.STORYBOARD_ARRAY_FIELDS) {
      if (obj[field] !== undefined) {
        const value = obj[field];

        if (Array.isArray(value)) {
          fixedData.prompts = this.normalizeScenes(value);
          wasFixed = true;
          break;
        }

        if (typeof value === 'object' && value !== null) {
          fixedData.prompts = this.normalizeScenes([value]);
          wasFixed = true;
          break;
        }
      }
    }

    if (!wasFixed && this.looksLikeScene(obj)) {
      fixedData.prompts = this.normalizeScenes([obj]);
      wasFixed = true;
    }

    if (obj.metadata && typeof obj.metadata === 'object') {
      fixedData.metadata = obj.metadata as Record<string, unknown>;
    }

    if (wasFixed && fixedData.prompts && fixedData.prompts.length > 0) {
      result.fixedData = fixedData;
      result.suggestions.push('Data was automatically reconstructed - please verify the results');
    }

    return result;
  }

  private looksLikeScene(obj: Record<string, unknown>): boolean {
    return JSONExtractor.SCENE_TEXT_FIELDS.some(field =>
      typeof obj[field] === 'string' && (obj[field] as string).length > 0
    );
  }

  private normalizeScenes(scenes: unknown[]): StoryboardScene[] {
    return scenes
      .filter(scene => scene && typeof scene === 'object')
      .map((scene, index) => {
        const sceneObj = scene as Record<string, unknown>;
        const normalized: StoryboardScene = {
          scene: index + 1
        };

        for (const field of JSONExtractor.SCENE_TEXT_FIELDS) {
          if (typeof sceneObj[field] === 'string') {
            normalized.prompt = sceneObj[field] as string;
            break;
          }
        }

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

  // --- Content Sanitization ---

  private static readonly HARMFUL_PATTERNS: { pattern: RegExp; replacement: string; description: string }[] = [
    { pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, replacement: '', description: 'script tags' },
    { pattern: /javascript:/gi, replacement: '', description: 'javascript: protocol' },
    { pattern: /on\w+\s*=/gi, replacement: '', description: 'event handlers' },
    { pattern: /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, replacement: '', description: 'iframe tags' },
    { pattern: /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, replacement: '', description: 'object tags' },
    { pattern: /<embed\b[^>]*>/gi, replacement: '', description: 'embed tags' },
    { pattern: /<link\b[^>]*>/gi, replacement: '', description: 'link tags' },
    { pattern: /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, replacement: '', description: 'style tags' },
    { pattern: /data:\s*[^,]*;base64,/gi, replacement: '', description: 'base64 data URIs' },
    { pattern: /;\s*DROP\s+TABLE/gi, replacement: '', description: 'SQL DROP statements' },
    { pattern: /;\s*DELETE\s+FROM/gi, replacement: '', description: 'SQL DELETE statements' },
    { pattern: /;\s*INSERT\s+INTO/gi, replacement: '', description: 'SQL INSERT statements' },
    { pattern: /;\s*UPDATE\s+\w+\s+SET/gi, replacement: '', description: 'SQL UPDATE statements' },
    { pattern: /\$\([^)]+\)/g, replacement: '', description: 'shell command substitution' },
    { pattern: /`[^`]+`/g, replacement: '', description: 'backtick command execution' },
    { pattern: /\|\s*\w+/g, replacement: '', description: 'pipe commands' },
  ];

  private static readonly SANITIZABLE_FIELDS = ['prompt', 'text', 'description', 'content', 'mood', 'style'];

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

    return json;
  }

  sanitizeString(str: string): string {
    let sanitized = str;

    for (const { pattern, replacement } of JSONExtractor.HARMFUL_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement);
    }

    sanitized = sanitized.replace(/\0/g, '');
    sanitized = sanitized.replace(/[\r\n]+/g, '\n').trim();

    return sanitized;
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = this.sanitizeString(key);
      sanitized[sanitizedKey] = this.sanitizeJSON(value);
    }

    return sanitized;
  }

  sanitizeStoryboard(storyboard: StoryboardData): StoryboardData {
    const sanitized: StoryboardData = {};

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

    if (storyboard.metadata) {
      sanitized.metadata = this.sanitizeJSON(storyboard.metadata) as Record<string, unknown>;
    }

    return sanitized;
  }

  private sanitizeScene(scene: StoryboardScene): StoryboardScene {
    const sanitized: StoryboardScene = {};

    for (const field of JSONExtractor.SANITIZABLE_FIELDS) {
      const value = scene[field as keyof StoryboardScene];
      if (typeof value === 'string') {
        (sanitized as Record<string, unknown>)[field] = this.sanitizeString(value);
      }
    }

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

  detectHarmfulContent(str: string): { isHarmful: boolean; detectedPatterns: string[] } {
    const detectedPatterns: string[] = [];

    for (const { pattern, description } of JSONExtractor.HARMFUL_PATTERNS) {
      if (pattern.test(str)) {
        detectedPatterns.push(description);
        pattern.lastIndex = 0;
      }
    }

    return {
      isHarmful: detectedPatterns.length > 0,
      detectedPatterns
    };
  }

  sanitizeAndValidate(json: unknown): { sanitized: unknown; validation: ValidationResult } {
    const sanitized = this.sanitizeJSON(json);
    const validation = this.validateStoryboard(sanitized);

    return { sanitized, validation };
  }

  // --- Validation Error Reporting ---

  formatValidationReport(validation: ValidationResult): string {
    const lines: string[] = [];

    lines.push('=== Validation Report ===');
    lines.push(`Status: ${validation.isValid ? 'VALID' : 'INVALID'}`);
    lines.push('');

    if (validation.errors.length > 0) {
      lines.push('Errors:');
      for (const error of validation.errors) {
        lines.push(`  \u274C ${error}`);
      }
      lines.push('');
    }

    if (validation.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of validation.warnings) {
        lines.push(`  \u26A0\uFE0F ${warning}`);
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
        lines.push(`  \uD83D\uDCA1 ${suggestion}`);
      }
      lines.push('');
    }

    if (validation.fixedData) {
      lines.push('Note: Automatic reconstruction was attempted. Please verify the results.');
    }

    return lines.join('\n');
  }

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
      suggestions: [...new Set(allSuggestions)],
      timestamp: new Date().toISOString(),
      contentLength: 0,
      failureReasons: validation.fieldErrors.map(fe => ({
        method: ExtractionMethod.MARKDOWN_BLOCKS,
        error: `${fe.field}: ${fe.message}`,
        attemptedAt: new Date().toISOString()
      }))
    };
  }

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

  getFieldErrors(validation: ValidationResult, fieldPattern: RegExp): FieldValidationError[] {
    return validation.fieldErrors.filter(fe => fieldPattern.test(fe.field));
  }

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

    merged.suggestions = [...new Set(merged.suggestions)];

    return merged;
  }
}
