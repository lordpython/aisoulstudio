/**
 * Text Processing Utilities
 * 
 * Consolidated text processing functions to eliminate duplication across services.
 * Previously duplicated in:
 * - services/researchService.ts
 * - services/promptService.ts
 * - services/documentParser.ts
 * 
 * @module services/utils/textProcessing
 */

/**
 * Normalizes text for similarity comparison.
 * Converts to lowercase, removes punctuation, and normalizes whitespace.
 * 
 * @param s - The input string to normalize
 * @returns Normalized string for comparison
 * 
 * @example
 * normalizeForSimilarity("Hello, World!") // "hello world"
 */
export function normalizeForSimilarity(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Counts the number of words in a string.
 * 
 * @param s - The input string
 * @returns Number of words
 * 
 * @example
 * countWords("Hello world") // 2
 * countWords("") // 0
 */
export function countWords(s: string): number {
    const t = s.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
}

/**
 * Tokenizes text into a set of lowercase words.
 * Useful for set-based similarity calculations.
 * 
 * @param text - The input text to tokenize
 * @param minTokenLength - Minimum token length to include (default: 1)
 * @returns Set of unique tokens (lowercase words)
 * 
 * @example
 * tokenize("Hello World Hello") // Set { "hello", "world" }
 * tokenize("I am a cat", 3) // Set { "cat" } - filters out short tokens
 */
export function tokenize(text: string, minTokenLength: number = 1): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .replace(/[^\w\s\u0600-\u06FF]/g, " ") // Preserve Arabic characters
            .split(/\s+/)
            .filter((w) => w.length >= minTokenLength)
    );
}

/**
 * Calculates Jaccard similarity between two sets or strings.
 * 
 * For sets: |A ∩ B| / |A ∪ B|
 * For strings: Converts to token sets first
 * 
 * @param a - First set or string
 * @param b - Second set or string
 * @returns Similarity score between 0 and 1
 * 
 * @example
 * // With sets
 * jaccardSimilarity(new Set(['a', 'b']), new Set(['b', 'c'])) // 0.333...
 * 
 * // With strings
 * jaccardSimilarity("hello world", "hello there") // 0.333...
 */
export function jaccardSimilarity(
    a: Set<string> | string,
    b: Set<string> | string
): number {
    // Convert strings to sets if needed
    const setA = typeof a === "string" ? tokenize(a) : a;
    const setB = typeof b === "string" ? tokenize(b) : b;

    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
}

/**
 * Splits content into chunks of approximately equal size.
 * Respects word boundaries when possible.
 * 
 * @param content - The content to chunk
 * @param chunkSize - Target size for each chunk in characters (default: 500)
 * @returns Array of content chunks
 * 
 * @example
 * chunkContent("Hello world this is a test", 10)
 * // ["Hello world", "this is a", "test"]
 */
export function chunkContent(content: string, chunkSize: number = 500): string[] {
    if (!content.trim()) return [];

    const chunks: string[] = [];
    const words = content.split(/\s+/);
    let currentChunk = "";

    for (const word of words) {
        // If adding this word would exceed chunk size and we have content, start new chunk
        if (currentChunk.length + word.length + 1 > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = word;
        } else {
            currentChunk = currentChunk ? `${currentChunk} ${word}` : word;
        }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

/**
 * Calculates the edit distance (Levenshtein distance) between two strings.
 * Useful for fuzzy matching and spell checking.
 * 
 * @param a - First string
 * @param b - Second string
 * @returns Number of edits needed to transform a into b
 * 
 * @example
 * editDistance("kitten", "sitting") // 3
 */
export function editDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    // Use a 1D array for space optimization (O(n) instead of O(m*n))
    const prev: number[] = new Array(n + 1).fill(0) as number[];
    const curr: number[] = new Array(n + 1).fill(0) as number[];

    // Initialize first row
    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                curr[j] = prev[j - 1]!;
            } else {
                curr[j] = 1 + Math.min(prev[j]!, curr[j - 1]!, prev[j - 1]!);
            }
        }
        // Copy current row to previous for next iteration
        for (let j = 0; j <= n; j++) prev[j] = curr[j]!;
    }

    return curr[n]!;
}

/**
 * Calculates a normalized similarity score based on edit distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 * 
 * @param a - First string
 * @param b - Second string
 * @returns Normalized similarity score
 * 
 * @example
 * editSimilarity("hello", "hallo") // 0.8
 */
export function editSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - editDistance(a, b) / maxLen;
}

/**
 * Truncates text to a maximum length, adding ellipsis if truncated.
 * Respects word boundaries when possible.
 * 
 * @param text - Text to truncate
 * @param maxLength - Maximum length including ellipsis
 * @param ellipsis - String to append when truncated (default: "...")
 * @returns Truncated text
 * 
 * @example
 * truncateText("Hello world this is a test", 15) // "Hello world..."
 */
export function truncateText(
    text: string,
    maxLength: number,
    ellipsis: string = "..."
): string {
    if (text.length <= maxLength) return text;

    const targetLength = maxLength - ellipsis.length;
    if (targetLength <= 0) return ellipsis.slice(0, maxLength);

    // Try to break at word boundary
    const breakPoint = text.lastIndexOf(" ", targetLength);
    if (breakPoint > 0 && breakPoint > targetLength - 20) {
        return text.slice(0, breakPoint).trim() + ellipsis;
    }

    return text.slice(0, targetLength).trim() + ellipsis;
}

/**
 * Removes extra whitespace and normalizes line endings.
 * 
 * @param text - Text to clean
 * @returns Cleaned text
 */
export function normalizeWhitespace(text: string): string {
    return text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Extracts the first N sentences from text.
 * 
 * @param text - Source text
 * @param count - Number of sentences to extract
 * @returns First N sentences
 */
export function extractSentences(text: string, count: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, count).map((s) => s.trim());
}