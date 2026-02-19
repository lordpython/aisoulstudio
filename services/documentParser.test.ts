/**
 * Document Parser Tests
 *
 * Property 38: Document Parsing Support (Requirements 22.1, 22.4)
 * Property 39: Document Parsing Error Handling (Requirements 22.5)
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
  parseDocument,
  chunkContent,
  getSupportedTypes,
  DocumentParseError,
} from './documentParser';

// Helper to create a mock File using happy-dom's File API
function createMockFile(
  content: string | ArrayBuffer,
  name: string,
  type: string,
): File {
  const blob = typeof content === 'string'
    ? new Blob([content], { type })
    : new Blob([content], { type });
  return new File([blob], name, { type });
}

describe('DocumentParser', () => {
  describe('getSupportedTypes', () => {
    it('should return PDF, TXT, DOCX types', () => {
      const types = getSupportedTypes();
      expect(types).toContain('text/plain');
      expect(types).toContain('application/pdf');
      expect(types).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
  });

  describe('Property 38: Document Parsing Support', () => {
    it('should parse TXT files successfully', async () => {
      const file = createMockFile(
        'This is a test document. It has multiple sentences. Testing the parser.',
        'test.txt',
        'text/plain',
      );

      const doc = await parseDocument(file);

      expect(doc.filename).toBe('test.txt');
      expect(doc.content).toContain('test document');
      expect(doc.chunks.length).toBeGreaterThan(0);
      expect(doc.id).toMatch(/^doc_/);
      expect(doc.metadata.wordCount).toBeGreaterThan(0);
    });

    it('should chunk TXT content at sentence boundaries', async () => {
      const sentences = Array.from({ length: 20 }, (_, i) =>
        `Sentence number ${i + 1} with some extra words to fill the content.`
      ).join(' ');

      const file = createMockFile(sentences, 'long.txt', 'text/plain');
      const doc = await parseDocument(file);

      expect(doc.chunks.length).toBeGreaterThan(1);
      // Each chunk should be roughly under the default chunk size
      for (const chunk of doc.chunks) {
        expect(chunk.length).toBeLessThan(1000); // generous bound
      }
    });

    it('should include metadata with word count and chunk count', async () => {
      const file = createMockFile(
        'Hello world. This is a test.',
        'meta.txt',
        'text/plain',
      );

      const doc = await parseDocument(file);

      expect(doc.metadata.wordCount).toBeGreaterThanOrEqual(5);
      expect(doc.metadata.chunkCount).toBe(doc.chunks.length);
      expect(doc.metadata.parsedAt).toBeDefined();
    });
  });

  describe('chunkContent', () => {
    it('should split content into chunks at sentence boundaries', () => {
      const content = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const chunks = chunkContent(content, 40);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(80); // generous bound for sentence overshoot
      }
    });

    it('should return empty array for empty content', () => {
      expect(chunkContent('')).toEqual([]);
      expect(chunkContent('   ')).toEqual([]);
    });

    it('should handle content without sentence endings', () => {
      const chunks = chunkContent('no sentence endings here', 10);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe('no sentence endings here');
    });
  });

  describe('Property 39: Document Parsing Error Handling', () => {
    it('should throw DocumentParseError for unsupported file types', async () => {
      const file = createMockFile('data', 'image.png', 'image/png');

      await expect(parseDocument(file)).rejects.toThrow(DocumentParseError);
      await expect(parseDocument(file)).rejects.toThrow(/Unsupported file type/);
      await expect(parseDocument(file)).rejects.toThrow(/image\.png/);
    });

    it('should throw DocumentParseError for empty TXT files', async () => {
      const file = createMockFile('', 'empty.txt', 'text/plain');

      await expect(parseDocument(file)).rejects.toThrow(DocumentParseError);
      await expect(parseDocument(file)).rejects.toThrow(/empty/i);
    });

    it('should include filename in error message', async () => {
      const file = createMockFile('', 'important-doc.txt', 'text/plain');

      try {
        await parseDocument(file);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DocumentParseError);
        expect((err as DocumentParseError).filename).toBe('important-doc.txt');
        expect((err as DocumentParseError).message).toContain('important-doc.txt');
      }
    });

    it('should not crash the pipeline on parse failure', async () => {
      const file = createMockFile('data', 'bad.xyz', 'application/octet-stream');

      // The error should be catchable, not an unhandled crash
      let caught = false;
      try {
        await parseDocument(file);
      } catch (err) {
        caught = true;
        expect(err).toBeInstanceOf(DocumentParseError);
      }
      expect(caught).toBe(true);
    });
  });
});
