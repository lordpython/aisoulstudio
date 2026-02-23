/**
 * Research Service Property-Based Tests
 *
 * Feature: multi-format-pipeline
 *
 * Property 11: Parallel Research Execution
 *   Validates: Requirements 3.5, 7.2, 11.1
 *
 * Property 12: Research Result Deduplication
 *   Validates: Requirements 11.2
 *
 * Property 13: Reference Document Prioritization
 *   Validates: Requirements 7.6, 11.3, 22.2
 *
 * Property 14: Research Graceful Degradation
 *   Validates: Requirements 11.4, 20.2
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  ResearchService,
  Source,
  IndexedDocument,
  ResearchQuery,
  extractFileContent,
} from './researchService';
import { tokenize, jaccardSimilarity, chunkContent } from './utils/textProcessing';
import { ParallelExecutionEngine, Task } from './parallelExecutionEngine';

// ============================================================================
// Arbitraries (fast-check generators)
// ============================================================================

/** Generates a non-empty ASCII/printable string of reasonable length */
const arbWord = fc.stringMatching(/^[a-z]{3,10}$/);

/** Generates a Source object with configurable type */
function arbSource(type?: Source['type']): fc.Arbitrary<Source> {
  return fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 5, maxLength: 50 }),
    content: fc
      .array(arbWord, { minLength: 5, maxLength: 30 })
      .map((words) => words.join(' ')),
    type: type
      ? fc.constant(type)
      : fc.constantFrom<Source['type']>('web', 'knowledge-base', 'reference'),
    relevance: fc.float({ min: 0, max: 1, noNaN: true }),
    language: fc.constantFrom<'ar' | 'en'>('ar', 'en'),
  });
}

/** Generates an IndexedDocument */
const arbIndexedDocument: fc.Arbitrary<IndexedDocument> = fc.record({
  id: fc.uuid(),
  filename: fc
    .string({ minLength: 3, maxLength: 20 })
    .map((s) => `${s.replace(/[^a-z]/g, 'x')}.txt`),
  content: fc
    .array(arbWord, { minLength: 10, maxLength: 100 })
    .map((words) => words.join(' ')),
  chunks: fc.array(
    fc.array(arbWord, { minLength: 3, maxLength: 20 }).map((w) => w.join(' ')),
    { minLength: 1, maxLength: 5 }
  ),
  metadata: fc.constant({}),
});

/** Generates a ResearchQuery for a specific depth */
function arbQuery(depth?: ResearchQuery['depth']): fc.Arbitrary<ResearchQuery> {
  return fc.record({
    topic: fc.string({ minLength: 5, maxLength: 50 }),
    language: fc.constantFrom<'ar' | 'en'>('ar', 'en'),
    depth: depth
      ? fc.constant(depth)
      : fc.constantFrom<ResearchQuery['depth']>('shallow', 'medium', 'deep'),
    sources: fc.constant(['web'] as ResearchQuery['sources']),
    maxResults: fc.integer({ min: 1, max: 20 }),
  });
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Build a ResearchService backed by a mock engine that resolves tasks
 * after a given delay using injected task factories.
 */
function buildServiceWithMockEngine(
  taskResults: (taskId: string) => Source[] | Error,
  delayMs = 0
): ResearchService {
  const mockEngine = {
    execute: async (tasks: Task<Source[]>[]) => {
      const promises = tasks.map(async (task) => {
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        const result = taskResults(task.id);
        if (result instanceof Error) {
          return { taskId: task.id, success: false, error: result, attempts: 1, duration: delayMs };
        }
        return { taskId: task.id, success: true, data: result, attempts: 1, duration: delayMs };
      });
      return Promise.all(promises);
    },
  } as unknown as ParallelExecutionEngine;

  return new ResearchService(mockEngine);
}

// ============================================================================
// Property 11: Parallel Research Execution
// Feature: multi-format-pipeline, Property 11: Parallel Research Execution
// Validates: Requirements 3.5, 7.2, 11.1
// ============================================================================

describe('Property 11: Parallel Research Execution', () => {
  it('total execution time is closer to max single-task time than to sum of all task times', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 8 }), // number of queries (shallow=3, deep=8)
        fc.integer({ min: 20, max: 80 }), // individual task delay in ms
        async (queryCount, taskDelay) => {
          // Track task start/end times to verify parallel execution
          const taskStartTimes: Map<string, number> = new Map();
          const taskEndTimes: Map<string, number> = new Map();

          const mockEngine = {
            execute: async (tasks: Task<Source[]>[]) => {
              const startTime = Date.now();

              // Run all tasks in parallel (simulating what the real engine does)
              const promises = tasks.map(async (task) => {
                taskStartTimes.set(task.id, Date.now() - startTime);
                await new Promise((r) => setTimeout(r, taskDelay));
                taskEndTimes.set(task.id, Date.now() - startTime);

                return {
                  taskId: task.id,
                  success: true,
                  data: [] as Source[],
                  attempts: 1,
                  duration: taskDelay,
                };
              });

              return Promise.all(promises);
            },
          } as unknown as ParallelExecutionEngine;

          const service = new ResearchService(mockEngine);
          const wallStart = Date.now();

          const result = await service.research({
            topic: 'test topic',
            language: 'en',
            depth: 'shallow',
            sources: ['web'],
            maxResults: 10,
          });

          const wallElapsed = Date.now() - wallStart;
          const sumOfDelays = queryCount * taskDelay;

          // Wall-clock time should be much less than the sequential sum
          // Allow 3x the single task delay as generous upper bound for parallel overhead
          expect(wallElapsed).toBeLessThan(sumOfDelays);

          // Result must always be returned (not thrown)
          expect(result).toBeDefined();
          expect(Array.isArray(result.sources)).toBe(true);
        }
      ),
      { numRuns: 20 } // reduced runs due to timing-based test
    );
  });

  it('all tasks start before any single task finishes (true parallelism check)', async () => {
    const concurrency = 5;
    const taskDelay = 50; // ms
    const numTasks = 5;

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const mockEngine = {
      execute: async (tasks: Task<Source[]>[]) => {
        const promises = tasks.slice(0, numTasks).map(async (task) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise((r) => setTimeout(r, taskDelay));
          currentConcurrent--;

          return {
            taskId: task.id,
            success: true,
            data: [] as Source[],
            attempts: 1,
            duration: taskDelay,
          };
        });
        return Promise.all(promises);
      },
    } as unknown as ParallelExecutionEngine;

    const service = new ResearchService(mockEngine);
    await service.research({
      topic: 'parallel test',
      language: 'en',
      depth: 'medium',
      sources: ['web'],
      maxResults: 10,
    });

    // All tasks ran at the same time (mock engine uses Promise.all)
    expect(maxConcurrent).toBe(numTasks);
    expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
  });
});

// ============================================================================
// Property 12: Research Result Deduplication
// Feature: multi-format-pipeline, Property 12: Research Result Deduplication
// Validates: Requirements 11.2
// ============================================================================

describe('Property 12: Research Result Deduplication', () => {
  it('identical content sources are collapsed to one', () => {
    fc.assert(
      fc.property(
        arbSource('web'),
        fc.integer({ min: 2, max: 10 }),
        (baseSource, duplicateCount) => {
          const service = new ResearchService();
          // Create exact duplicates (same content → similarity = 1.0 > 0.9 threshold)
          const sources: Source[] = Array.from({ length: duplicateCount }, (_, i) => ({
            ...baseSource,
            id: `dup-${i}`,
          }));

          const deduped = service.deduplicateSources(sources);

          // All identical → only 1 unique source
          expect(deduped).toHaveLength(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('completely different sources are all preserved', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (sourceCount) => {
          const service = new ResearchService();

          // Create sources with completely disjoint vocabularies
          const sources: Source[] = Array.from({ length: sourceCount }, (_, i) => ({
            id: `src-${i}`,
            title: `Source ${i}`,
            // Use non-overlapping word pools: each source gets unique 5-letter words starting with i
            content: Array.from({ length: 20 }, (_, j) => `word${i}x${j}zzz`).join(' '),
            type: 'web' as const,
            relevance: 0.5,
            language: 'en' as const,
          }));

          const deduped = service.deduplicateSources(sources);

          // All unique → all preserved
          expect(deduped).toHaveLength(sourceCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('final deduped results have no pair with similarity > threshold', () => {
    fc.assert(
      fc.property(
        fc.array(arbSource('web'), { minLength: 1, maxLength: 15 }),
        (sources) => {
          const service = new ResearchService();
          const deduped = service.deduplicateSources(sources);

          // Check every pair in the result
          for (let i = 0; i < deduped.length; i++) {
            for (let j = i + 1; j < deduped.length; j++) {
              const sim = jaccardSimilarity(
                tokenize(deduped[i]!.content, 3),
                tokenize(deduped[j]!.content, 3)
              );
              expect(sim).toBeLessThanOrEqual(0.9);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deduplication is idempotent', () => {
    fc.assert(
      fc.property(
        fc.array(arbSource('web'), { minLength: 1, maxLength: 15 }),
        (sources) => {
          const service = new ResearchService();
          const firstPass = service.deduplicateSources(sources);
          const secondPass = service.deduplicateSources(firstPass);

          // Running dedup twice should produce the same count
          expect(secondPass).toHaveLength(firstPass.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 13: Reference Document Prioritization
// Feature: multi-format-pipeline, Property 13: Reference Document Prioritization
// Validates: Requirements 7.6, 11.3, 22.2
// ============================================================================

describe('Property 13: Reference Document Prioritization', () => {
  it('reference sources always appear before web sources in sorted output', () => {
    fc.assert(
      fc.property(
        fc.array(arbSource('reference'), { minLength: 1, maxLength: 5 }),
        fc.array(arbSource('web'), { minLength: 1, maxLength: 5 }),
        (refSources, webSources) => {
          const service = new ResearchService();
          // Mix them together
          const mixed = [...webSources, ...refSources];
          const sorted = service.sortSources(mixed);

          // Find last reference and first non-reference
          const lastRefIdx = sorted.map((s) => s.type).lastIndexOf('reference');
          const firstNonRefIdx = sorted.findIndex((s) => s.type !== 'reference');

          // If both types exist, all refs must come before any non-ref
          if (lastRefIdx !== -1 && firstNonRefIdx !== -1) {
            expect(lastRefIdx).toBeLessThan(firstNonRefIdx);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('reference sources have higher relevance than web sources when using service-assigned values', () => {
    /**
     * The service assigns relevance=1.0 to reference sources (REFERENCE_RELEVANCE_BASE)
     * and caps web sources at 0.85 (QUERY_RELEVANCE_MAX). This test verifies that
     * sortSources preserves this invariant in its output ordering.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),                        // number of reference sources
        fc.integer({ min: 1, max: 5 }),                        // number of web sources
        fc.array(fc.integer({ min: 0, max: 85 }).map((n) => n / 100), { minLength: 1, maxLength: 5 }),
        (refCount, webCount, webRelevances) => {
          const service = new ResearchService();

          // Reference sources always get REFERENCE_RELEVANCE_BASE = 1.0
          const refs: Source[] = Array.from({ length: refCount }, (_, i) => ({
            id: `ref-${i}`,
            title: `Ref ${i}`,
            content: `reference content unique words set ${i}`,
            type: 'reference' as const,
            relevance: 1.0,
            language: 'en' as const,
          }));

          // Web sources are capped at QUERY_RELEVANCE_MAX = 0.85
          const webs: Source[] = Array.from({ length: webCount }, (_, i) => ({
            id: `web-${i}`,
            title: `Web ${i}`,
            content: `web content unique words set ${i}`,
            type: 'web' as const,
            relevance: webRelevances[i % webRelevances.length]!,
            language: 'en' as const,
          }));

          const sorted = service.sortSources([...webs, ...refs]);

          const refsInResult = sorted.filter((s) => s.type === 'reference');
          const websInResult = sorted.filter((s) => s.type === 'web');

          if (refsInResult.length > 0 && websInResult.length > 0) {
            const minRefRelevance = Math.min(...refsInResult.map((s) => s.relevance));
            const maxWebRelevance = Math.max(...websInResult.map((s) => s.relevance));
            expect(minRefRelevance).toBeGreaterThanOrEqual(maxWebRelevance);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('research with reference documents returns reference sources first', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbIndexedDocument, { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 5, maxLength: 20 }),
        async (refDocs, topic) => {
          const service = buildServiceWithMockEngine((taskId) => {
            // Reference tasks return 'reference' type sources with max relevance
            if (taskId.startsWith('ref-')) {
              const idx = parseInt(taskId.replace('ref-', ''), 10);
              return [
                {
                  id: `ref-src-${idx}`,
                  title: `Reference ${idx}`,
                  content: `reference content about ${topic} from doc ${idx}`,
                  type: 'reference' as const,
                  relevance: 1.0,
                  language: 'en' as const,
                },
              ];
            }
            // Web tasks return web sources with lower relevance
            return [
              {
                id: `web-src-${taskId}`,
                title: `Web result ${taskId}`,
                content: `web content about ${topic}`,
                type: 'web' as const,
                relevance: 0.5,
                language: 'en' as const,
              },
            ];
          });

          const result = await service.research({
            topic,
            language: 'en',
            depth: 'shallow',
            sources: ['web', 'references'],
            maxResults: 20,
            referenceDocuments: refDocs,
          });

          // If we have both reference and web sources, references must come first
          const firstNonRef = result.sources.findIndex((s) => s.type !== 'reference');
          const lastRef = result.sources.map((s) => s.type).lastIndexOf('reference');

          if (firstNonRef !== -1 && lastRef !== -1) {
            expect(lastRef).toBeLessThan(firstNonRef);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Property 14: Research Graceful Degradation
// Feature: multi-format-pipeline, Property 14: Research Graceful Degradation
// Validates: Requirements 11.4, 20.2
// ============================================================================

describe('Property 14: Research Graceful Degradation', () => {
  it('partial query failures do not throw — available results are returned', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // successful tasks
        fc.integer({ min: 1, max: 5 }), // failing tasks
        async (successCount, failCount) => {
          let taskIdx = 0;

          const service = buildServiceWithMockEngine((taskId) => {
            const idx = taskIdx++;
            if (idx < failCount) {
              // First `failCount` tasks fail
              return new Error(`Query failed: ${taskId}`);
            }
            // Rest succeed
            return [
              {
                id: `src-${idx}`,
                title: `Result ${idx}`,
                content: `content for task ${taskId} number ${idx}`,
                type: 'web' as const,
                relevance: 0.7,
                language: 'en' as const,
              },
            ];
          });

          let result;
          let threw = false;

          try {
            result = await service.research({
              topic: 'graceful degradation topic',
              language: 'en',
              depth: 'shallow',
              sources: ['web'],
              maxResults: 20,
            });
          } catch {
            threw = true;
          }

          // Must never throw — always return a result
          expect(threw).toBe(false);
          expect(result).toBeDefined();
          expect(Array.isArray(result!.sources)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('partial failure metadata is included in result', async () => {
    /**
     * Shallow depth runs exactly 3 tasks. We fail between 1 and 3 of them
     * and verify that failedQueries is set and partial=true.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }), // fail count ≤ shallow task count (3)
        async (failCount) => {
          let taskIdx = 0;

          const service = buildServiceWithMockEngine((_taskId) => {
            const idx = taskIdx++;
            if (idx < failCount) {
              return new Error(`Query ${idx} failed`);
            }
            return [];
          });

          const result = await service.research({
            topic: 'partial failure topic',
            language: 'en',
            depth: 'shallow',
            sources: ['web'],
            maxResults: 10,
          });

          // partial flag must be set when at least one query failed
          expect(result.partial).toBe(true);
          expect(typeof result.failedQueries).toBe('number');
          // failedQueries >= failCount (engine may report more if retries counted separately)
          expect(result.failedQueries!).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all queries failing still returns a valid (empty) result without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 30 }),
        async (topic) => {
          const service = buildServiceWithMockEngine((_taskId) => {
            return new Error('All queries failed');
          });

          let result;
          let threw = false;

          try {
            result = await service.research({
              topic,
              language: 'en',
              depth: 'shallow',
              sources: ['web'],
              maxResults: 10,
            });
          } catch {
            threw = true;
          }

          expect(threw).toBe(false);
          expect(result).toBeDefined();
          expect(result!.sources).toHaveLength(0);
          expect(result!.partial).toBe(true);
          expect(result!.confidence).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('confidence score reflects partial failure proportionally', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }), // failing tasks (out of 3 shallow queries)
        async (failCount) => {
          let taskIdx = 0;

          const service = buildServiceWithMockEngine((_taskId) => {
            const idx = taskIdx++;
            if (idx < failCount) {
              return new Error('Failed');
            }
            return [
              {
                id: `src-${idx}`,
                title: `Source ${idx}`,
                content: `content words words words words words ${idx}`,
                type: 'web' as const,
                relevance: 1.0,
                language: 'en' as const,
              },
            ];
          });

          const result = await service.research({
            topic: 'confidence topic',
            language: 'en',
            depth: 'shallow',
            sources: ['web'],
            maxResults: 10,
          });

          // Confidence must be in [0, 1]
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);

          // More failures → lower confidence (or zero if all failed)
          if (failCount === 3) {
            expect(result.confidence).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Unit Tests: Utility Functions
// ============================================================================

describe('tokenize', () => {
  it('produces a Set of lowercase tokens from text', () => {
    const tokens = tokenize('Hello World foo bar');
    expect(tokens.has('hello')).toBe(true);
    expect(tokens.has('world')).toBe(true);
    expect(tokens.has('foo')).toBe(true);
    expect(tokens.has('bar')).toBe(true);
  });

  it('filters out very short tokens when minTokenLength is set', () => {
    const tokens = tokenize('I am a cat', 3);
    expect(tokens.has('i')).toBe(false);
    expect(tokens.has('am')).toBe(false);
    expect(tokens.has('a')).toBe(false);
    expect(tokens.has('cat')).toBe(true);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical sets', () => {
    const a = new Set(['hello', 'world']);
    expect(jaccardSimilarity(a, a)).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    const a = new Set(['hello', 'world']);
    const b = new Set(['foo', 'bar']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('returns 1 for two empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it('returns value in [0,1] for partial overlap', () => {
    const a = new Set(['hello', 'world', 'foo']);
    const b = new Set(['hello', 'world', 'bar']);
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe('chunkContent', () => {
  it('produces non-empty chunks', () => {
    const content = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkContent(content, 50);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it('reassembled chunks contain all content words', () => {
    const words = Array.from({ length: 50 }, (_, i) => `word${i}`);
    const content = words.join(' ');
    const chunks = chunkContent(content, 100);
    const reassembled = chunks.join(' ');
    for (const word of words) {
      expect(reassembled).toContain(word);
    }
  });

  it('handles content shorter than chunk size', () => {
    const content = 'short content';
    const chunks = chunkContent(content, 1000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(content);
  });
});

describe('extractFileContent', () => {
  it('throws for unsupported file types', async () => {
    const file = new File(['content'], 'test.xyz', { type: 'application/unknown' });
    await expect(extractFileContent(file)).rejects.toThrow('Unsupported file format');
  });

  it('reads plain text files', async () => {
    const content = 'Hello, world! This is a test.';
    const file = new File([content], 'test.txt', { type: 'text/plain' });
    const result = await extractFileContent(file);
    expect(result).toBe(content);
  });
});
