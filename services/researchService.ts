/**
 * Research Service
 *
 * Performs parallel web/knowledge queries for content-heavy formats.
 * Uses the Parallel Execution Engine for concurrent query execution,
 * aggregates and deduplicates results, and prioritizes reference documents.
 *
 * Requirements: 3.5, 7.2, 7.6, 11.1–11.6, 20.2, 22.2
 */

import { ParallelExecutionEngine, Task } from './parallelExecutionEngine';
import { ai, MODELS } from './shared/apiClient';
import { Type } from '@google/genai';

// Grounded response shape (candidates[0].groundingMetadata)
interface GroundingChunk {
  web?: { uri?: string; title?: string };
}
interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunk[];
}

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface ResearchQuery {
  topic: string;
  language: 'ar' | 'en';
  depth: 'shallow' | 'medium' | 'deep';
  sources: ('web' | 'knowledge-base' | 'references')[];
  maxResults: number;
  referenceDocuments?: IndexedDocument[];
}

export interface ResearchResult {
  sources: Source[];
  summary: string;
  citations: Citation[];
  confidence: number;
  /** True when some queries failed but partial results were returned */
  partial?: boolean;
  /** Number of queries that failed */
  failedQueries?: number;
}

export interface Source {
  id: string;
  title: string;
  content: string;
  url?: string;
  type: 'web' | 'knowledge-base' | 'reference';
  relevance: number;
  language: 'ar' | 'en';
}

export interface Citation {
  sourceId: string;
  text: string;
  position: number;
}

export interface IndexedDocument {
  id: string;
  filename: string;
  content: string;
  chunks: string[];
  metadata: Record<string, any>;
}

// ============================================================================
// Constants
// ============================================================================

/** Number of parallel sub-queries per depth level */
const DEPTH_QUERY_COUNTS: Record<ResearchQuery['depth'], number> = {
  shallow: 3,
  medium: 5,
  deep: 8,
};

/** Content chunk size in characters for document indexing */
const CHUNK_SIZE = 1000;

/**
 * Jaccard similarity threshold above which two sources are considered duplicates.
 * Property 12: sources with similarity > 0.9 are deduplicated.
 */
const DEDUP_SIMILARITY_THRESHOLD = 0.9;

/** Relevance score assigned to reference document sources (highest priority) */
const REFERENCE_RELEVANCE_BASE = 1.0;

/** Maximum relevance score for web/knowledge-base sources */
const QUERY_RELEVANCE_MAX = 0.85;

/** Sub-query aspect templates for diversifying research coverage */
const QUERY_ASPECTS_EN = [
  'overview and definition',
  'historical background and context',
  'current state and recent developments',
  'key facts and statistics',
  'expert analysis and perspectives',
  'related topics and connections',
  'challenges and controversies',
  'future implications and trends',
];

const QUERY_ASPECTS_AR = [
  'نظرة عامة وتعريف',
  'الخلفية التاريخية والسياق',
  'الوضع الراهن والتطورات الأخيرة',
  'الحقائق والإحصائيات الرئيسية',
  'التحليل وآراء الخبراء',
  'الموضوعات ذات الصلة والروابط',
  'التحديات والجدل',
  'الآثار المستقبلية والاتجاهات',
];

// ============================================================================
// Research Service
// ============================================================================

export class ResearchService {
  private engine: ParallelExecutionEngine;

  constructor(engine?: ParallelExecutionEngine) {
    this.engine = engine ?? new ParallelExecutionEngine();
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Research a topic by executing multiple queries in parallel.
   * Returns aggregated, deduplicated, and prioritized sources.
   * On partial failure, returns available results with `partial: true`.
   *
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
   */
  async research(query: ResearchQuery): Promise<ResearchResult> {
    const tasks = this.buildTasks(query);

    // Execute all queries concurrently (Req 11.1)
    const results = await this.engine.execute(tasks, {
      concurrencyLimit: 5,
      retryAttempts: 2,
      retryDelay: 1000,
      exponentialBackoff: true,
    });

    // Collect sources — partial failure handled by gathering successful results (Req 11.4)
    const allSources: Source[] = [];
    let failedCount = 0;

    for (const result of results) {
      if (result.success && result.data) {
        allSources.push(...result.data);
      } else {
        failedCount++;
      }
    }

    // Deduplicate results (Req 11.2)
    const uniqueSources = this.deduplicateSources(allSources);

    // Sort: references first with highest relevance, then by relevance desc (Req 11.3)
    const sortedSources = this.sortSources(uniqueSources);

    // Limit to maxResults
    const limitedSources = sortedSources.slice(0, query.maxResults);

    const summary = this.buildSummary(limitedSources, query.topic, query.language);
    const citations = this.buildCitations(limitedSources);
    const confidence = this.calculateConfidence(limitedSources, failedCount, tasks.length);

    return {
      sources: limitedSources,
      summary,
      citations,
      confidence,
      partial: failedCount > 0,
      failedQueries: failedCount,
    };
  }

  /**
   * Extract text from uploaded File objects, chunk them, and return IndexedDocuments.
   * Documents that fail to parse are skipped (logged only) — no exception thrown.
   *
   * Requirements: 11.3, 22.1, 22.2, 22.4, 22.5
   */
  async prioritizeReferences(documents: File[]): Promise<IndexedDocument[]> {
    const indexed: IndexedDocument[] = [];

    for (const doc of documents) {
      try {
        const content = await extractFileContent(doc);
        const chunks = chunkContent(content, CHUNK_SIZE);

        indexed.push({
          id: crypto.randomUUID(),
          filename: doc.name,
          content,
          chunks,
          metadata: {
            type: doc.type,
            size: doc.size,
            lastModified: doc.lastModified,
          },
        });
      } catch (err) {
        // Graceful: log and continue (Req 22.5)
        console.warn(`[ResearchService] Failed to parse "${doc.name}":`, err);
      }
    }

    return indexed;
  }

  // --------------------------------------------------------------------------
  // Task Building
  // --------------------------------------------------------------------------

  private buildTasks(query: ResearchQuery): Task<Source[]>[] {
    const tasks: Task<Source[]>[] = [];
    const aspects = query.language === 'ar' ? QUERY_ASPECTS_AR : QUERY_ASPECTS_EN;
    const queryCount = DEPTH_QUERY_COUNTS[query.depth];

    // Web and knowledge-base queries (Req 11.5)
    const needsKnowledgeQuery =
      query.sources.includes('web') || query.sources.includes('knowledge-base');

    if (needsKnowledgeQuery) {
      const type = query.sources.includes('web') ? 'web' : 'knowledge-base';

      for (let i = 0; i < queryCount; i++) {
        const aspect = aspects[i % aspects.length];
        const subQuery = `${query.topic} — ${aspect}`;

        tasks.push({
          id: `query-${i}`,
          type: 'research',
          priority: 1,
          retryable: true,
          timeout: 30_000,
          execute: () => this.executeKnowledgeQuery(subQuery, query.topic, query.language, type),
        });
      }
    }

    // Reference document queries — higher priority than web results (Req 11.3)
    if (query.sources.includes('references') && query.referenceDocuments?.length) {
      for (let i = 0; i < query.referenceDocuments.length; i++) {
        const doc = query.referenceDocuments[i]!;

        tasks.push({
          id: `ref-${i}`,
          type: 'research',
          priority: 2, // Higher than web queries
          retryable: false,
          timeout: 10_000,
          execute: () => this.executeReferenceQuery(doc, query.topic, query.language),
        });
      }
    }

    return tasks;
  }

  // --------------------------------------------------------------------------
  // Query Executors
  // --------------------------------------------------------------------------

  /**
   * Query Gemini for factual content about a topic aspect.
   * Used for both 'web' and 'knowledge-base' source types.
   */
  async executeKnowledgeQuery(
    subQuery: string,
    topic: string,
    language: 'ar' | 'en',
    type: 'web' | 'knowledge-base'
  ): Promise<Source[]> {
    const langInstruction =
      language === 'ar'
        ? 'Respond entirely in Arabic.'
        : 'Respond entirely in English.';

    const prompt =
      language === 'ar'
        ? `أنت باحث متخصص. قدم معلومات موثوقة وشاملة حول: "${subQuery}".
استجب بتنسيق JSON مع المصادر التالية. ${langInstruction}`
        : `You are a specialized researcher. Provide reliable and comprehensive information about: "${subQuery}".
Respond with JSON containing research sources. ${langInstruction}`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        sources: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              relevance: { type: Type.NUMBER },
            },
            required: ['title', 'content', 'relevance'],
          },
        },
      },
      required: ['sources'],
    };

    const response = await ai.models.generateContent({
      model: MODELS.TEXT_GROUNDED,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    // Extract real web sources from grounding metadata (when available)
    const groundingMeta = (response.candidates?.[0] as { groundingMetadata?: GroundingMetadata } | undefined)
      ?.groundingMetadata;
    const groundedUrls: Record<number, string> = {};
    if (groundingMeta?.groundingChunks) {
      groundingMeta.groundingChunks.forEach((chunk, i) => {
        if (chunk.web?.uri) groundedUrls[i] = chunk.web.uri;
      });
    }

    const raw: { sources?: Array<{ title: string; content: string; relevance: number }> } =
      JSON.parse(response.text ?? '{"sources":[]}');

    return (raw.sources ?? []).map((s, i) => ({
      id: crypto.randomUUID(),
      title: s.title,
      content: s.content,
      url: groundedUrls[i],
      type,
      relevance: Math.min(QUERY_RELEVANCE_MAX, Math.max(0, s.relevance ?? 0.5)),
      language,
    }));
  }

  /**
   * Convert an IndexedDocument into Source records for the results.
   * Reference documents always get the highest relevance score.
   */
  async executeReferenceQuery(
    doc: IndexedDocument,
    topic: string,
    language: 'ar' | 'en'
  ): Promise<Source[]> {
    // Use the most relevant chunks (first N that mention the topic, or all chunks)
    const relevantChunks = doc.chunks.filter((c) =>
      c.toLowerCase().includes(topic.toLowerCase())
    );
    const chunksToUse = relevantChunks.length > 0 ? relevantChunks : doc.chunks;

    return chunksToUse.map((chunk, idx) => ({
      id: crypto.randomUUID(),
      title: `${doc.filename} — Part ${idx + 1}`,
      content: chunk,
      type: 'reference' as const,
      relevance: REFERENCE_RELEVANCE_BASE,
      language,
    }));
  }

  // --------------------------------------------------------------------------
  // Deduplication
  // --------------------------------------------------------------------------

  /**
   * Remove sources whose content similarity exceeds DEDUP_SIMILARITY_THRESHOLD.
   * Keeps the first occurrence (or reference type when there's a tie).
   *
   * Property 12: sources with Jaccard similarity > 90% are removed.
   */
  deduplicateSources(sources: Source[]): Source[] {
    const unique: Source[] = [];

    for (const candidate of sources) {
      const isDuplicate = unique.some(
        (existing) => jaccardSimilarity(tokenize(existing.content), tokenize(candidate.content)) > DEDUP_SIMILARITY_THRESHOLD
      );

      if (!isDuplicate) {
        unique.push(candidate);
      }
    }

    return unique;
  }

  // --------------------------------------------------------------------------
  // Sorting
  // --------------------------------------------------------------------------

  /**
   * Sort sources: 'reference' type first, then by relevance descending.
   *
   * Property 13: reference documents appear first and have higher relevance.
   */
  sortSources(sources: Source[]): Source[] {
    return [...sources].sort((a, b) => {
      // References always come first
      if (a.type === 'reference' && b.type !== 'reference') return -1;
      if (b.type === 'reference' && a.type !== 'reference') return 1;
      // Then sort by relevance descending
      return b.relevance - a.relevance;
    });
  }

  // --------------------------------------------------------------------------
  // Summary & Citations
  // --------------------------------------------------------------------------

  private buildSummary(sources: Source[], topic: string, language: 'ar' | 'en'): string {
    if (sources.length === 0) {
      return language === 'ar'
        ? `لم يتم العثور على معلومات كافية حول: ${topic}`
        : `No sufficient information found for: ${topic}`;
    }

    // Concatenate top-3 source snippets as a simple summary
    const snippets = sources
      .slice(0, 3)
      .map((s) => s.content.slice(0, 200))
      .join(' ... ');

    return language === 'ar'
      ? `ملخص البحث حول "${topic}": ${snippets}`
      : `Research summary for "${topic}": ${snippets}`;
  }

  private buildCitations(sources: Source[]): Citation[] {
    return sources.map((source, idx) => ({
      sourceId: source.id,
      text: source.title,
      position: idx,
    }));
  }

  private calculateConfidence(
    sources: Source[],
    failedCount: number,
    totalTasks: number
  ): number {
    if (totalTasks === 0) return 0;
    if (sources.length === 0) return 0;

    const successRate = 1 - failedCount / totalTasks;
    const avgRelevance =
      sources.reduce((sum, s) => sum + s.relevance, 0) / sources.length;

    return Math.min(1, successRate * avgRelevance);
  }
}

// ============================================================================
// File Content Extraction (browser + Node compatible)
// ============================================================================

/**
 * Extract text content from a File object.
 * Supports: text/plain, application/pdf (basic), and application/vnd.openxmlformats-officedocument.wordprocessingml.document (DOCX stub).
 *
 * Requirements: 22.1, 22.4, 22.5
 */
export async function extractFileContent(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (file.type === 'text/plain' || name.endsWith('.txt') || name.endsWith('.md')) {
    return readFileAsText(file);
  }

  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    // Basic PDF: read as text (works for simple/searchable PDFs without binary decoding)
    const text = await readFileAsText(file);
    // Strip binary artifacts — keep only printable ASCII and spaces
    return text.replace(/[^\x20-\x7E\n\r\t\u0600-\u06FF]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    // DOCX: read as text (simplified — strips XML tags)
    const text = await readFileAsText(file);
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  throw new Error(
    `Unsupported file format: "${file.name}". Supported formats: PDF, TXT, DOCX.`
  );
}

function readFileAsText(file: File): Promise<string> {
  // Browser environment
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsText(file, 'utf-8');
    });
  }

  // Node.js / server environment
  return file.text();
}

/**
 * Split content into chunks of approximately `chunkSize` characters,
 * breaking on word boundaries where possible.
 */
export function chunkContent(content: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    let end = Math.min(start + chunkSize, content.length);

    // Break on word boundary (space) if not at end
    if (end < content.length) {
      const lastSpace = content.lastIndexOf(' ', end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }

    const chunk = content.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    start = end + 1;
  }

  return chunks;
}

// ============================================================================
// Text Similarity Utilities
// ============================================================================

/**
 * Tokenize text into a set of lowercase word tokens.
 * Used for Jaccard similarity computation.
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

/**
 * Compute Jaccard similarity between two token sets.
 * Returns a value in [0, 1] where 1 = identical.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return intersection / union;
}

// ============================================================================
// Singleton Export
// ============================================================================

export const researchService = new ResearchService();
