/**
 * Document Parser Service
 *
 * Parses reference documents (PDF, TXT, DOCX) into indexed chunks
 * for use by the Research Service and Narrative Engine.
 *
 * Requirements: 22.1, 22.4, 22.5
 *
 * React-free for Node.js compatibility.
 */

// ============================================================================
// Types
// ============================================================================

export interface IndexedDocument {
  id: string;
  filename: string;
  content: string;
  chunks: string[];
  metadata: Record<string, any>;
}

const SUPPORTED_TYPES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

const SUPPORTED_EXTENSIONS = ['.txt', '.pdf', '.docx'] as const;

// ============================================================================
// Public API
// ============================================================================

export function getSupportedTypes(): string[] {
  return [...SUPPORTED_TYPES];
}

/**
 * Parse a File into an IndexedDocument.
 * Throws descriptive errors on failure with filename context.
 */
export async function parseDocument(file: File): Promise<IndexedDocument> {
  const filename = file.name;
  const extension = getExtension(filename);

  if (!isSupportedExtension(extension)) {
    throw new DocumentParseError(
      filename,
      `Unsupported file type '${extension}'. Supported types: ${SUPPORTED_EXTENSIONS.join(', ')}`,
    );
  }

  try {
    let content: string;

    if (extension === '.txt') {
      content = await parseTxt(file);
    } else if (extension === '.docx') {
      content = await parseDocx(file);
    } else if (extension === '.pdf') {
      content = await parsePdf(file);
    } else {
      throw new Error(`No parser for extension '${extension}'`);
    }

    if (!content.trim()) {
      throw new DocumentParseError(filename, 'Document is empty or contains no extractable text');
    }

    const chunks = chunkContent(content);

    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      filename,
      content,
      chunks,
      metadata: {
        size: file.size,
        type: file.type || extension,
        chunkCount: chunks.length,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        parsedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof DocumentParseError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    throw new DocumentParseError(filename, `Failed to parse: ${msg}`);
  }
}

/**
 * Split content into chunks of approximately `chunkSize` characters
 * at sentence boundaries.
 */
export function chunkContent(content: string, chunkSize: number = 500): string[] {
  if (!content.trim()) return [];

  const sentences = content.match(/[^.!?]+[.!?]+\s*/g) ?? [content];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

// ============================================================================
// Parsers
// ============================================================================

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  // Use arrayBuffer() if available (modern browsers), fallback to FileReader pattern
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  // Fallback for environments where File.arrayBuffer is not available (e.g., jsdom)
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function parseTxt(file: File): Promise<string> {
  const buffer = await readFileAsArrayBuffer(file);
  return new TextDecoder('utf-8').decode(buffer);
}

async function parseDocx(file: File): Promise<string> {
  // DOCX files are ZIP archives containing XML
  // We look for word/document.xml and extract text from <w:t> tags
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const bytes = new Uint8Array(arrayBuffer);

  // Minimal ZIP parser to find word/document.xml
  const xmlContent = await extractDocxXml(bytes);
  if (!xmlContent) {
    throw new Error('Could not find word/document.xml in DOCX archive');
  }

  // Extract text from <w:t> and <w:t xml:space="preserve"> tags
  const textMatches = xmlContent.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
  const texts: string[] = [];

  for (const match of textMatches) {
    const inner = match.replace(/<[^>]+>/g, '');
    if (inner) texts.push(inner);
  }

  // Also extract paragraph breaks from <w:p> boundaries
  let result = '';
  const paragraphs = xmlContent.split(/<\/w:p>/);
  for (const para of paragraphs) {
    const paraTexts = para.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
    const paraContent = paraTexts.map(m => m.replace(/<[^>]+>/g, '')).join('');
    if (paraContent.trim()) {
      result += paraContent + '\n';
    }
  }

  return result.trim() || texts.join(' ');
}

async function parsePdf(file: File): Promise<string> {
  // Browser-side PDF text extraction is limited.
  // We attempt basic text extraction from the PDF stream.
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const bytes = new Uint8Array(arrayBuffer);
  const text = extractPdfText(bytes);

  if (!text.trim()) {
    // Fall back to indicating that server-side parsing is needed
    return `[PDF: ${file.name}] This PDF requires server-side parsing for full text extraction. File size: ${file.size} bytes.`;
  }

  return text;
}

// ============================================================================
// DOCX ZIP Extraction (minimal)
// ============================================================================

async function extractDocxXml(bytes: Uint8Array): Promise<string | null> {
  // Find the word/document.xml entry in the ZIP
  // ZIP local file headers start with 0x504B0304
  const decoder = new TextDecoder('utf-8');
  const target = 'word/document.xml';

  let offset = 0;
  while (offset < bytes.length - 30) {
    // Check for local file header signature
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4B &&
        bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04) {

      const fnameLen = bytes[offset + 26]! | (bytes[offset + 27]! << 8);
      const extraLen = bytes[offset + 28]! | (bytes[offset + 29]! << 8);
      const compMethod = bytes[offset + 8]! | (bytes[offset + 9]! << 8);
      const compSize = bytes[offset + 18]! | (bytes[offset + 19]! << 8) |
                       (bytes[offset + 20]! << 16) | (bytes[offset + 21]! << 24);

      const fname = decoder.decode(bytes.slice(offset + 30, offset + 30 + fnameLen));
      const dataStart = offset + 30 + fnameLen + extraLen;

      if (fname === target) {
        if (compMethod === 0) {
          // Stored (no compression)
          return decoder.decode(bytes.slice(dataStart, dataStart + compSize));
        }
        // Compressed — try DecompressionStream if available
        if (typeof DecompressionStream !== 'undefined') {
          try {
            const compressed = bytes.slice(dataStart, dataStart + compSize);
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(compressed);
            writer.close();
            const reader = ds.readable.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            const totalLen = chunks.reduce((s, c) => s + c.length, 0);
            const result = new Uint8Array(totalLen);
            let pos = 0;
            for (const chunk of chunks) {
              result.set(chunk, pos);
              pos += chunk.length;
            }
            return decoder.decode(result);
          } catch {
            return null;
          }
        }
        return null;
      }

      offset = dataStart + compSize;
    } else {
      offset++;
    }
  }

  return null;
}

// ============================================================================
// PDF Text Extraction (basic)
// ============================================================================

function extractPdfText(bytes: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(bytes);

  // Extract text from PDF text objects: BT ... ET blocks with Tj/TJ operators
  const texts: string[] = [];
  const btBlocks = raw.match(/BT[\s\S]*?ET/g) ?? [];

  for (const block of btBlocks) {
    // Match Tj operator (show string)
    const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g) ?? [];
    for (const tj of tjMatches) {
      const inner = tj.match(/\(([^)]*)\)/)?.[1];
      if (inner) texts.push(inner);
    }

    // Match TJ operator (show array of strings)
    const tjArrayMatches = block.match(/\[([^\]]*)\]\s*TJ/g) ?? [];
    for (const tja of tjArrayMatches) {
      const strings = tja.match(/\(([^)]*)\)/g) ?? [];
      for (const s of strings) {
        const inner = s.match(/\(([^)]*)\)/)?.[1];
        if (inner) texts.push(inner);
      }
    }
  }

  return texts.join(' ').replace(/\\n/g, '\n').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// Helpers
// ============================================================================

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function isSupportedExtension(ext: string): ext is typeof SUPPORTED_EXTENSIONS[number] {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

export class DocumentParseError extends Error {
  constructor(
    public readonly filename: string,
    message: string,
  ) {
    super(`Document parsing failed for '${filename}': ${message}`);
    this.name = 'DocumentParseError';
  }
}
