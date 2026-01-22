import { SubtitleItem } from "../types";

export const parseSRT = (srt: string): SubtitleItem[] => {
  const subtitles: SubtitleItem[] = [];
  const lines = srt.replace(/\r\n/g, '\n').split('\n');

  let currentSub: Partial<SubtitleItem> = {};
  let collectingText = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines unless they signify end of a block
    if (!line) {
      if (collectingText && currentSub.startTime !== undefined && currentSub.endTime !== undefined && currentSub.text) {
        subtitles.push(currentSub as SubtitleItem);
        currentSub = {};
        collectingText = false;
      }
      continue;
    }

    // Check if line is a timestamp line (contains --> or ->)
    if (line.includes('-->') || line.includes('->')) {
      // If we were already collecting text, push the previous subtitle
      if (collectingText && currentSub.startTime !== undefined && currentSub.endTime !== undefined && currentSub.text) {
        subtitles.push(currentSub as SubtitleItem);
        currentSub = {};
      }

      const parts = line.split(/-->|->/).map(s => s.trim());
      if (parts.length >= 2) {
        const startTime = parseSRTTimestamp(parts[0]);
        const endTime = parseSRTTimestamp(parts[1]);

        if (startTime !== null && endTime !== null) {
          currentSub.startTime = startTime;
          currentSub.endTime = endTime;

          // Guess ID if not set by looking at previous line
          if (!currentSub.id) {
            const prevLine = i > 0 ? lines[i - 1].trim() : '';
            if (/^\d+$/.test(prevLine)) {
              currentSub.id = parseInt(prevLine);
            } else {
              currentSub.id = subtitles.length + 1;
            }
          }
          collectingText = true;
          currentSub.text = ''; // Ready to collect text
          continue;
        }
      }
    }

    // Check if line is a numeric ID (and we are not currently reading text for a sub)
    if (/^\d+$/.test(line) && !collectingText) {
      currentSub.id = parseInt(line);
      continue;
    }

    // Collect Text
    if (collectingText) {
      currentSub.text = currentSub.text ? `${currentSub.text}\n${line}` : line;
    }
  }

  // Push final subtitle if loop ends
  if (collectingText && currentSub.startTime !== undefined && currentSub.endTime !== undefined && currentSub.text) {
    subtitles.push(currentSub as SubtitleItem);
  }

  return subtitles;
};

// Helper for various timestamp formats
// Supports: 
// HH:MM:SS,mmm (Standard)
// HH:MM:SS.mmm
// MM:SS:mmm (Common model output for short clips)
// MM:SS,mmm
export const parseSRTTimestamp = (timeStr: string): number | null => {
  if (!timeStr) return null;

  // Handle clean up
  const cleanStr = timeStr.trim();

  // Replace all commas with dots for consistency
  const normalized = cleanStr.replace(',', '.');

  // Split by colon
  const parts = normalized.split(':');

  let seconds = 0;

  if (parts.length === 4) {
    // HH:MM:SS:mmm (colon used for ms separator)
    seconds += parseFloat(parts[0]) * 3600;
    seconds += parseFloat(parts[1]) * 60;
    seconds += parseFloat(parts[2]);
    seconds += parseFloat(parts[3]) / 1000;
  } else if (parts.length === 3) {
    // Ambiguous: HH:MM:SS or MM:SS:mmm
    const p1 = parseFloat(parts[0]);
    const p2 = parseFloat(parts[1]);
    const p3Str = parts[2];
    const p3 = parseFloat(p3Str);

    // Check if the 3rd part looks like milliseconds (3 digits, no decimal)
    // or if its value is >= 60 (which is invalid for seconds).
    // Example: "00:26:477" -> p3=477. p3 >= 60. Treat as ms.
    // Example: "00:00:20.500" -> p3=20.5. p3 < 60. Treat as seconds.

    const isMilliseconds = !p3Str.includes('.') && (p3 >= 60 || p3Str.length === 3);

    if (isMilliseconds) {
      // MM:SS:mmm
      seconds += p1 * 60;
      seconds += p2;
      // If it's 3 digits like 477, it's 477ms. If it's 020, it's 20ms.
      // But usually MM:SS:mmm means milliseconds part is integer 0-999.
      seconds += p3 / 1000;
    } else {
      // HH:MM:SS
      seconds += p1 * 3600;
      seconds += p2 * 60;
      seconds += p3;
    }
  } else if (parts.length === 2) {
    // MM:SS
    seconds += parseFloat(parts[0]) * 60;
    seconds += parseFloat(parts[1]);
  } else {
    return null;
  }

  return isNaN(seconds) ? null : seconds;
};

/**
 * Converts seconds to SRT timestamp format (HH:MM:SS,mmm)
 */
const formatSRTTimestamp = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

/**
 * Converts structured SubtitleItem[] back to SRT string format
 */
export const subtitlesToSRT = (subtitles: SubtitleItem[]): string => {
  return subtitles.map((sub, index) => {
    const id = sub.id || index + 1;
    const start = formatSRTTimestamp(sub.startTime);
    const end = formatSRTTimestamp(sub.endTime);
    return `${id}\n${start} --> ${end}\n${sub.text}`;
  }).join('\n\n');
};
