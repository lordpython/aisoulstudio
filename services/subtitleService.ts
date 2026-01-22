/**
 * Subtitle Service
 * 
 * Handles text segmentation and subtitle timing logic.
 * Extracted from ProductionView to adhere to Single Responsibility Principle.
 */

import { SubtitleItem } from "@/types";

interface SegmentationOptions {
    maxWordsPerSegment?: number;
    delimiters?: RegExp;
}

/**
 * Split long text into shorter segments (max ~8 words per segment)
 * Uses sentence-based splitting first, then word-based chunking
 * This keeps subtitles readable and prevents long text blocks
 */
export function splitTextIntoSegments(
    text: string,
    totalDuration: number,
    options: SegmentationOptions = {}
): { text: string; duration: number }[] {
    const {
        maxWordsPerSegment = 8,
        delimiters = /([.!?،؟])\s*/g
    } = options;

    // First split by sentence delimiters
    const sentences = text.split(delimiters).filter(s => s.trim().length > 0);

    // Recombine sentences with their delimiters
    const sentenceChunks: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i];
        const delimiter = sentences[i + 1] || '';
        if (sentence.trim()) {
            sentenceChunks.push((sentence + delimiter).trim());
        }
    }

    // If no sentence delimiters found, treat whole text as one chunk
    if (sentenceChunks.length === 0) {
        sentenceChunks.push(text.trim());
    }

    const finalSegments: string[] = [];

    sentenceChunks.forEach(chunk => {
        const words = chunk.split(/\s+/).filter(w => w.length > 0);
        if (words.length <= maxWordsPerSegment) {
            finalSegments.push(chunk);
        } else {
            // Split long sentences by word count
            for (let i = 0; i < words.length; i += maxWordsPerSegment) {
                const segmentWords = words.slice(i, i + maxWordsPerSegment);
                finalSegments.push(segmentWords.join(' '));
            }
        }
    });

    // Calculate duration per segment based on word count ratio
    const totalWords = text.split(/\s+/).filter(w => w.length > 0).length;
    return finalSegments.map(segment => {
        const segmentWords = segment.split(/\s+/).filter(w => w.length > 0).length;
        const ratio = totalWords > 0 ? segmentWords / totalWords : 1 / finalSegments.length;
        return {
            text: segment,
            duration: totalDuration * ratio,
        };
    });
}
