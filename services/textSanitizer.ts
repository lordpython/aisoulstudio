/**
 * Text Sanitizer Service
 *
 * Cleans narration text of metadata artifacts before TTS and subtitle rendering.
 * Extracted from useStoryGeneration hook for testability and reuse.
 */

/**
 * Aggressive cleaning for TTS input.
 * Strips all markdown, metadata labels, screenplay directions, and formatting.
 */
export function cleanForTTS(text: string): string {
    return applyCommonPatterns(text);
}

/**
 * Cleaning for subtitle display.
 * Same as TTS cleaning plus length constraints and sentence-level pagination.
 */
export function cleanForSubtitles(
    text: string,
    maxCharsPerChunk = 80,
    minDisplayTimeSec = 1.5,
): { chunks: string[]; minDisplayTime: number } {
    const cleaned = applyCommonPatterns(text);
    if (!cleaned) return { chunks: [], minDisplayTime: minDisplayTimeSec };

    // Split into sentences — support English and Arabic punctuation
    const sentences = cleaned.match(/[^.!?،؛]+[.!?،؛]+/g) || [cleaned];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        if (current && (current + ' ' + trimmed).length > maxCharsPerChunk) {
            chunks.push(current);
            current = trimmed;
        } else {
            current = current ? current + ' ' + trimmed : trimmed;
        }
    }
    if (current) chunks.push(current);

    // Enforce 2-line max: if a chunk is very long, split at midpoint
    const finalChunks: string[] = [];
    for (const chunk of chunks) {
        if (chunk.length > maxCharsPerChunk * 1.5) {
            const mid = chunk.lastIndexOf(' ', Math.floor(chunk.length / 2));
            if (mid > 0) {
                finalChunks.push(chunk.substring(0, mid).trim());
                finalChunks.push(chunk.substring(mid + 1).trim());
                continue;
            }
        }
        finalChunks.push(chunk);
    }

    return { chunks: finalChunks, minDisplayTime: minDisplayTimeSec };
}

/**
 * Core regex patterns applied to both TTS and subtitle text.
 */
function applyCommonPatterns(text: string): string {
    return text
        // Markdown patterns
        .replace(/\*\*[^*]*?\*\*:?\s*/g, '')           // **Label:** bold patterns
        .replace(/\*\*/g, '')                            // Remaining ** markers
        .replace(/\*([^*]*?)\*/g, '$1')                  // *italic* → content
        .replace(/#{1,6}\s+/g, '')                       // # headings
        .replace(/`([^`]*?)`/g, '$1')                    // `code` → content

        // Scene/screenplay directions
        .replace(/\[([^\]]*?)\]:?\s*/g, '')              // [Scene Direction:] brackets
        .replace(/\((?:Note|Direction|SFX|Sound|Music|Pause)[^)]*?\)\s*/g, '') // (Note: ...) parentheticals
        .replace(/\bINT\.\s*/g, '')                      // INT. screenplay prefix
        .replace(/\bEXT\.\s*/g, '')                      // EXT. screenplay prefix
        .replace(/Scene\s*\d+\s*[:.]?\s*/gi, '')         // "Scene 3:" headers

        // Arabic-specific metadata (order matters: المشهد before مشهد to prevent partial match)
        .replace(/المشهد\s*[\d٠-٩]*\s*[:.]?\s*/g, '')    // المشهد ١:
        .replace(/مشهد\s*[٠-٩\d]+\s*[:.]?\s*/g, '')      // مشهد ٣:
        .replace(/النقطة السردية[^:]*:\s*/g, '')           // Arabic narrative labels
        .replace(/الخطاف العاطفي[^:]*:\s*/g, '')          // الخطاف العاطفي: (Emotional Hook)
        .replace(/الراوي\s*[:.]?\s*/g, '')               // الراوي: (Narrator:)
        .replace(/وصف\s*المشهد\s*[:.]?\s*/g, '')         // وصف المشهد: (Scene description:)

        // English metadata labels (safety net for labels that survive prompt fixes)
        .replace(/\bEmotional Hook\s*:\s*/gi, '')         // Emotional Hook:
        .replace(/\bNarrative Beat\s*:\s*/gi, '')         // Narrative Beat:
        .replace(/\bKey Beat\s*:\s*/gi, '')               // Key Beat:
        .replace(/\bHook\s*:\s*/gi, '')                   // Hook:
        .replace(/\bBeat\s*:\s*/gi, '')                   // Beat:

        // Structural patterns
        .replace(/^---+\s*$/gm, '')                      // Horizontal rules
        .replace(/^>\s*/gm, '')                           // Blockquotes
        .replace(/^\s*[-–—*+]\s+/gm, '')                 // Bullets/dashes
        .replace(/\s*[0-9\u0660-\u0669\u06F0-\u06F9]+\.\s*\*{0,2}\s*$/, '') // Trailing "٢. **"

        // Whitespace normalization
        .replace(/\n+/g, ' ')                            // Newlines → spaces
        .replace(/\s{2,}/g, ' ')                         // Collapse whitespace
        .trim();
}
