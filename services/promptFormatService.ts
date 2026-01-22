/**
 * Prompt Format Service
 * 
 * Provides format specifications, JSON schema requirements, and examples
 * for LLM prompts to encourage consistent JSON output.
 * 
 * Feature: agent-director-json-parsing-fix
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

// --- Types and Interfaces ---

/**
 * JSON Schema definition for storyboard output.
 * Requirements: 5.2
 */
export interface StoryboardJSONSchema {
  type: 'object';
  properties: {
    prompts: {
      type: 'array';
      items: {
        type: 'object';
        properties: {
          text: { type: 'string'; description: string };
          mood: { type: 'string'; description: string };
          timestamp: { type: 'string'; description: string };
        };
        required: string[];
      };
    };
  };
  required: string[];
}

/**
 * Format specification for LLM prompts.
 * Requirements: 5.1
 */
export interface FormatSpecification {
  outputFormat: 'json';
  jsonStructure: string;
  validationRules: string[];
  commonMistakes: string[];
}

/**
 * Example response for LLM prompts.
 * Requirements: 5.3
 */
export interface ResponseExample {
  description: string;
  example: string;
  notes: string[];
}

/**
 * Format correction pattern.
 * Requirements: 5.4
 */
export interface FormatCorrectionPattern {
  name: string;
  pattern: RegExp;
  correction: (...args: string[]) => string;
  description: string;
}

/**
 * Successful response pattern for library.
 * Requirements: 5.5
 */
export interface SuccessfulResponsePattern {
  id: string;
  pattern: string;
  frequency: number;
  lastSeen: string;
  characteristics: string[];
}

/**
 * Result of format correction preprocessing.
 * Requirements: 5.4
 */
export interface FormatCorrectionResult {
  corrected: string;
  wasModified: boolean;
  appliedCorrections: string[];
  confidence: number;
}

// --- JSON Schema Definitions ---

/**
 * Standard JSON schema for storyboard output.
 * Requirements: 5.2
 */
export const STORYBOARD_JSON_SCHEMA: StoryboardJSONSchema = {
  type: 'object',
  properties: {
    prompts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Detailed visual prompt (60-120 words) starting with a concrete subject'
          },
          mood: {
            type: 'string',
            description: 'Emotional tone of the scene (e.g., melancholic, hopeful, intense)'
          },
          timestamp: {
            type: 'string',
            description: 'Timestamp in MM:SS format (e.g., "01:30")'
          }
        },
        required: ['text', 'mood', 'timestamp']
      }
    }
  },
  required: ['prompts']
};

/**
 * Analysis output JSON schema.
 * Requirements: 5.2
 */
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Section name (e.g., Intro, Verse 1, Chorus)' },
          startTimestamp: { type: 'string', description: 'Start timestamp in MM:SS format' },
          endTimestamp: { type: 'string', description: 'End timestamp in MM:SS format' },
          type: { type: 'string', enum: ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'transition', 'key_point', 'conclusion'] },
          emotionalIntensity: { type: 'number', minimum: 1, maximum: 10 }
        },
        required: ['name', 'startTimestamp', 'endTimestamp', 'type', 'emotionalIntensity']
      }
    },
    emotionalArc: {
      type: 'object',
      properties: {
        opening: { type: 'string' },
        peak: { type: 'string' },
        resolution: { type: 'string' }
      },
      required: ['opening', 'peak', 'resolution']
    },
    themes: { type: 'array', items: { type: 'string' } },
    motifs: { type: 'array', items: { type: 'string' } },
    concreteMotifs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          object: { type: 'string' },
          timestamp: { type: 'string' },
          emotionalContext: { type: 'string' }
        },
        required: ['object', 'timestamp', 'emotionalContext']
      }
    }
  },
  required: ['sections', 'emotionalArc', 'themes', 'motifs']
};

// --- Format Specifications ---

/**
 * Get format specification for storyboard generation.
 * Requirements: 5.1
 */
export function getStoryboardFormatSpecification(): FormatSpecification {
  return {
    outputFormat: 'json',
    jsonStructure: `{
  "prompts": [
    {
      "text": "string (60-120 words, starts with concrete subject)",
      "mood": "string (emotional tone)",
      "timestamp": "string (MM:SS format)"
    }
  ]
}`,
    validationRules: [
      'Output MUST be valid JSON - no markdown code blocks, no extra text',
      'The "prompts" array MUST contain the exact number of items requested',
      'Each prompt "text" MUST be 60-120 words and start with a concrete subject noun',
      'Each "timestamp" MUST be in MM:SS format (e.g., "01:30")',
      'Each "mood" MUST be a single descriptive word or short phrase',
      'Do NOT include trailing commas after the last item in arrays or objects',
      'Do NOT include comments in the JSON output',
      'All string values MUST use double quotes, not single quotes'
    ],
    commonMistakes: [
      'Wrapping JSON in markdown code blocks (```json ... ```)',
      'Adding explanatory text before or after the JSON',
      'Using single quotes instead of double quotes',
      'Including trailing commas',
      'Forgetting required fields',
      'Using incorrect timestamp format (use MM:SS, not HH:MM:SS)',
      'Starting prompts with prepositions instead of concrete subjects'
    ]
  };
}

/**
 * Get format specification for analysis output.
 * Requirements: 5.1
 */
export function getAnalysisFormatSpecification(): FormatSpecification {
  return {
    outputFormat: 'json',
    jsonStructure: `{
  "sections": [
    {
      "name": "string",
      "startTimestamp": "MM:SS",
      "endTimestamp": "MM:SS",
      "type": "intro|verse|chorus|bridge|outro|...",
      "emotionalIntensity": number (1-10)
    }
  ],
  "emotionalArc": {
    "opening": "string",
    "peak": "string",
    "resolution": "string"
  },
  "themes": ["string"],
  "motifs": ["string"],
  "concreteMotifs": [
    {
      "object": "string",
      "timestamp": "MM:SS",
      "emotionalContext": "string"
    }
  ]
}`,
    validationRules: [
      'Output MUST be valid JSON - no markdown code blocks',
      'The "type" field MUST be lowercase (e.g., "verse" not "Verse")',
      'Timestamps MUST be in MM:SS format',
      'emotionalIntensity MUST be a number between 1 and 10',
      'All required fields must be present'
    ],
    commonMistakes: [
      'Using capitalized type values (use "verse" not "Verse")',
      'Omitting the concreteMotifs array',
      'Using HH:MM:SS format instead of MM:SS',
      'Wrapping output in markdown code blocks'
    ]
  };
}

// --- Response Examples ---

/**
 * Get example responses for storyboard generation.
 * Requirements: 5.3
 */
export function getStoryboardExamples(): ResponseExample[] {
  return [
    {
      description: 'Correct storyboard output with 3 prompts',
      example: `{
  "prompts": [
    {
      "text": "A weathered wooden door slowly creaks open, revealing a dimly lit hallway with peeling wallpaper and dust motes floating in a single beam of afternoon light. The camera holds at eye level, capturing the texture of aged brass doorknob and the shadow patterns cast across worn floorboards. Atmosphere of quiet abandonment and nostalgic melancholy.",
      "mood": "melancholic",
      "timestamp": "00:15"
    },
    {
      "text": "A lone figure in a vintage leather jacket stands at the edge of a rain-slicked rooftop, city lights blurring into bokeh circles below. Medium shot from behind, emphasizing isolation against the vast urban sprawl. Neon signs reflect off wet concrete, creating pools of magenta and teal. Cold wind suggested by slightly lifted collar.",
      "mood": "contemplative",
      "timestamp": "00:45"
    },
    {
      "text": "Weathered hands carefully unfold a yellowed photograph, fingers trembling slightly. Extreme close-up reveals the texture of aged paper and faded ink. Soft window light illuminates dust particles suspended in air. The image within the photo remains partially obscured, suggesting memory and loss.",
      "mood": "nostalgic",
      "timestamp": "01:15"
    }
  ]
}`,
      notes: [
        'Each prompt starts with a concrete subject (door, figure, hands)',
        'Prompts are 60-120 words with specific visual details',
        'Timestamps are in MM:SS format',
        'No markdown code blocks or extra text',
        'Valid JSON with proper formatting'
      ]
    }
  ];
}

/**
 * Get example responses for analysis output.
 * Requirements: 5.3
 */
export function getAnalysisExamples(): ResponseExample[] {
  return [
    {
      description: 'Correct analysis output',
      example: `{
  "sections": [
    {
      "name": "Intro",
      "startTimestamp": "00:00",
      "endTimestamp": "00:30",
      "type": "intro",
      "emotionalIntensity": 3
    },
    {
      "name": "Verse 1",
      "startTimestamp": "00:30",
      "endTimestamp": "01:15",
      "type": "verse",
      "emotionalIntensity": 5
    }
  ],
  "emotionalArc": {
    "opening": "Quiet introspection",
    "peak": "Emotional breakthrough",
    "resolution": "Peaceful acceptance"
  },
  "themes": ["loss", "memory", "hope"],
  "motifs": ["fading light", "empty rooms", "old photographs"],
  "concreteMotifs": [
    {
      "object": "candle",
      "timestamp": "00:45",
      "emotionalContext": "Represents fading hope and isolation"
    }
  ]
}`,
      notes: [
        'Type values are lowercase (intro, verse, not Intro, Verse)',
        'Timestamps in MM:SS format',
        'emotionalIntensity is a number, not a string',
        'concreteMotifs captures literal objects from the content'
      ]
    }
  ];
}

// --- Format Correction Patterns ---

/**
 * Patterns for correcting common format issues before parsing.
 * Requirements: 5.4
 */
export const FORMAT_CORRECTION_PATTERNS: FormatCorrectionPattern[] = [
  {
    name: 'remove_markdown_json_blocks',
    pattern: /```json\s*([\s\S]*?)```/gi,
    correction: (match: string) => {
      const inner = match.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '');
      return inner.trim();
    },
    description: 'Remove markdown JSON code block wrappers'
  },
  {
    name: 'remove_markdown_blocks',
    pattern: /```\s*([\s\S]*?)```/gi,
    correction: (match: string) => {
      const inner = match.replace(/```\s*/gi, '');
      return inner.trim();
    },
    description: 'Remove generic markdown code block wrappers'
  },
  {
    name: 'fix_trailing_commas_array',
    pattern: /,(\s*\])/g,
    correction: () => '$1',
    description: 'Remove trailing commas before closing brackets'
  },
  {
    name: 'fix_trailing_commas_object',
    pattern: /,(\s*\})/g,
    correction: () => '$1',
    description: 'Remove trailing commas before closing braces'
  },
  {
    name: 'fix_single_quotes',
    pattern: /'([^']+)'(\s*:)/g,
    correction: (match: string) => match.replace(/'/g, '"'),
    description: 'Convert single-quoted keys to double quotes'
  },
  {
    name: 'remove_js_comments',
    pattern: /\/\/[^\n]*/g,
    correction: () => '',
    description: 'Remove JavaScript-style single-line comments'
  },
  {
    name: 'remove_multiline_comments',
    pattern: /\/\*[\s\S]*?\*\//g,
    correction: () => '',
    description: 'Remove multi-line comments'
  },
  {
    name: 'fix_unquoted_keys',
    pattern: /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g,
    correction: (match: string, prefix: string, key: string, suffix: string) => `${prefix}"${key}"${suffix}`,
    description: 'Quote unquoted object keys'
  },
  {
    name: 'normalize_newlines_in_strings',
    pattern: /("(?:[^"\\]|\\.)*")/g,
    correction: (match: string) => {
      // Replace literal newlines inside strings with \n
      return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    },
    description: 'Escape newlines inside string values'
  },
  {
    name: 'remove_leading_text',
    pattern: /^[^{[]*(?=[{[])/,
    correction: () => '',
    description: 'Remove any text before the JSON starts'
  },
  {
    name: 'remove_trailing_text',
    pattern: /(?<=[}\]])[^}\]]*$/,
    correction: () => '',
    description: 'Remove any text after the JSON ends'
  }
];

// --- Successful Response Pattern Library ---

/**
 * Library of successful response patterns.
 * Requirements: 5.5
 */
class ResponsePatternLibrary {
  private patterns: Map<string, SuccessfulResponsePattern> = new Map();

  /**
   * Add a successful response pattern to the library.
   */
  addPattern(response: string, characteristics: string[]): void {
    const id = this.generatePatternId(response);
    const existing = this.patterns.get(id);

    if (existing) {
      existing.frequency++;
      existing.lastSeen = new Date().toISOString();
    } else {
      this.patterns.set(id, {
        id,
        pattern: this.extractPattern(response),
        frequency: 1,
        lastSeen: new Date().toISOString(),
        characteristics
      });
    }
  }

  /**
   * Get the most common successful patterns.
   */
  getTopPatterns(limit: number = 5): SuccessfulResponsePattern[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * Check if a response matches known successful patterns.
   */
  matchesKnownPattern(response: string): boolean {
    const responsePattern = this.extractPattern(response);
    return this.patterns.has(this.generatePatternId(response)) ||
      Array.from(this.patterns.values()).some(p =>
        this.patternSimilarity(p.pattern, responsePattern) > 0.8
      );
  }

  /**
   * Get pattern characteristics for a response.
   */
  getPatternCharacteristics(response: string): string[] {
    const characteristics: string[] = [];

    // Check structure
    if (response.includes('"prompts"')) {
      characteristics.push('has_prompts_array');
    }
    if (response.includes('"sections"')) {
      characteristics.push('has_sections_array');
    }
    if (response.includes('"text"')) {
      characteristics.push('has_text_field');
    }
    if (response.includes('"mood"')) {
      characteristics.push('has_mood_field');
    }
    if (response.includes('"timestamp"')) {
      characteristics.push('has_timestamp_field');
    }

    // Check format
    if (!response.includes('```')) {
      characteristics.push('no_markdown_blocks');
    }
    if (response.trim().startsWith('{') || response.trim().startsWith('[')) {
      characteristics.push('starts_with_json');
    }

    return characteristics;
  }

  /**
   * Generate a unique ID for a pattern.
   */
  private generatePatternId(response: string): string {
    const characteristics = this.getPatternCharacteristics(response);
    return characteristics.sort().join('|');
  }

  /**
   * Extract a structural pattern from a response.
   */
  private extractPattern(response: string): string {
    // Simplify the response to its structural pattern
    return response
      .replace(/"[^"]*"/g, '""')  // Replace string values
      .replace(/\d+/g, '0')       // Replace numbers
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .trim();
  }

  /**
   * Calculate similarity between two patterns.
   */
  private patternSimilarity(pattern1: string, pattern2: string): number {
    const tokens1 = new Set(pattern1.split(/\s+/));
    const tokens2 = new Set(pattern2.split(/\s+/));

    let intersection = 0;
    tokens1.forEach(t => { if (tokens2.has(t)) intersection++; });

    const union = tokens1.size + tokens2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Clear the pattern library.
   */
  clear(): void {
    this.patterns.clear();
  }

  /**
   * Get the total number of patterns.
   */
  get size(): number {
    return this.patterns.size;
  }
}

// Singleton instance
export const responsePatternLibrary = new ResponsePatternLibrary();

// --- Format Correction Preprocessing ---

/**
 * Attempt to fix common formatting issues before parsing.
 * Requirements: 5.4
 * 
 * @param content - The raw LLM response content
 * @returns FormatCorrectionResult with corrected content and metadata
 */
export function preprocessFormatCorrection(content: string): FormatCorrectionResult {
  if (!content || typeof content !== 'string') {
    return {
      corrected: content || '',
      wasModified: false,
      appliedCorrections: [],
      confidence: 0
    };
  }

  let corrected = content;
  const appliedCorrections: string[] = [];

  // Apply each correction pattern
  for (const pattern of FORMAT_CORRECTION_PATTERNS) {
    const before = corrected;

    if (pattern.name === 'fix_unquoted_keys') {
      // Special handling for unquoted keys pattern
      corrected = corrected.replace(pattern.pattern, (...args: string[]) => {
        return pattern.correction(...args);
      });
    } else if (pattern.name === 'remove_markdown_json_blocks' || pattern.name === 'remove_markdown_blocks') {
      // Extract content from markdown blocks
      const matches = corrected.match(pattern.pattern);
      if (matches && matches.length > 0) {
        // Take the first match and extract the content
        corrected = pattern.correction(matches[0]);
        appliedCorrections.push(pattern.name);
      }
    } else {
      corrected = corrected.replace(pattern.pattern, pattern.correction as unknown as string);
    }

    if (corrected !== before) {
      if (!appliedCorrections.includes(pattern.name)) {
        appliedCorrections.push(pattern.name);
      }
    }
  }

  // Trim whitespace
  corrected = corrected.trim();

  // Calculate confidence based on corrections applied
  let confidence = 1.0;
  if (appliedCorrections.length > 0) {
    // Reduce confidence based on number of corrections needed
    confidence = Math.max(0.5, 1.0 - (appliedCorrections.length * 0.1));
  }

  // Verify the result looks like valid JSON
  if (!corrected.startsWith('{') && !corrected.startsWith('[')) {
    confidence = Math.min(confidence, 0.3);
  }

  return {
    corrected,
    wasModified: appliedCorrections.length > 0,
    appliedCorrections,
    confidence
  };
}

/**
 * Check if content needs format correction.
 * Requirements: 5.4
 */
export function needsFormatCorrection(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  // Check for common issues
  const issues = [
    content.includes('```'),           // Markdown code blocks
    /,\s*[\]}]/.test(content),         // Trailing commas
    /'[^']+'\s*:/.test(content),       // Single-quoted keys
    /\/\//.test(content),              // JS comments
    /\/\*/.test(content),              // Multi-line comments
    !content.trim().startsWith('{') && !content.trim().startsWith('[')  // Doesn't start with JSON
  ];

  return issues.some(issue => issue);
}

// --- Prompt Enhancement Functions ---

/**
 * Generate format specification text for inclusion in prompts.
 * Requirements: 5.1
 */
export function generateFormatSpecificationText(type: 'storyboard' | 'analysis'): string {
  const spec = type === 'storyboard'
    ? getStoryboardFormatSpecification()
    : getAnalysisFormatSpecification();

  return `
OUTPUT FORMAT REQUIREMENTS:
- Output MUST be valid JSON only - no markdown, no code blocks, no explanatory text
- Structure: ${spec.jsonStructure.split('\n').map(l => '  ' + l).join('\n')}

VALIDATION RULES:
${spec.validationRules.map(r => `- ${r}`).join('\n')}

COMMON MISTAKES TO AVOID:
${spec.commonMistakes.map(m => `- ${m}`).join('\n')}
`;
}

/**
 * Generate example text for inclusion in prompts.
 * Requirements: 5.3
 */
export function generateExampleText(type: 'storyboard' | 'analysis'): string {
  const examples = type === 'storyboard'
    ? getStoryboardExamples()
    : getAnalysisExamples();

  if (examples.length === 0) {
    return '';
  }

  const example = examples[0];
  return `
EXAMPLE OF CORRECT OUTPUT:
${example.example}

NOTES:
${example.notes.map(n => `- ${n}`).join('\n')}
`;
}

/**
 * Generate complete format guidance for prompts.
 * Requirements: 5.1, 5.2, 5.3
 */
export function generateCompleteFormatGuidance(type: 'storyboard' | 'analysis'): string {
  const schema = type === 'storyboard' ? STORYBOARD_JSON_SCHEMA : ANALYSIS_JSON_SCHEMA;
  const specText = generateFormatSpecificationText(type);
  const exampleText = generateExampleText(type);

  return `
${specText}

JSON SCHEMA:
${JSON.stringify(schema, null, 2)}

${exampleText}

CRITICAL: Return ONLY the JSON object. No markdown, no code blocks, no additional text.
`;
}

// Note: Types are already exported inline with their definitions above
