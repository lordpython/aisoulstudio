/**
 * TTS Delivery Markers
 *
 * Converts inline narration markers like [pause: long] and [emphasis]
 * into Gemini-compatible Director's Note instructions while stripping
 * them from the spoken text.
 *
 * Supported markers:
 * - [pause: short|medium|long|beat] — Insert a pause
 * - [emphasis]...[/emphasis]         — Stress/emphasize enclosed text
 * - [low-tone]...[/low-tone]         — Speak in a lower register
 * - [whisper]...[/whisper]            — Whisper enclosed text
 * - [rising-tension]...[/rising-tension] — Gradually increase intensity
 * - [slow]...[/slow]                 — Slow down delivery
 * - [breath]                          — Take a natural breath
 *
 * React-free — safe for Node.js usage.
 */

export interface DeliveryMarkerResult {
  /** Director's Note instructions extracted from markers */
  directorInstructions: string;
  /** Clean text with all markers stripped */
  cleanText: string;
}

interface MarkerMatch {
  instruction: string;
  originalText: string;
  cleanReplacement: string;
}

/**
 * Pause marker: [pause: short|medium|long|beat]
 */
function processPauseMarkers(text: string): MarkerMatch[] {
  const matches: MarkerMatch[] = [];
  const pauseRegex = /\[pause:\s*(short|medium|long|beat)\]/gi;
  let match;

  while ((match = pauseRegex.exec(text)) !== null) {
    const duration = match[1]!.toLowerCase();
    const durationMap: Record<string, string> = {
      short: "Take a brief half-second pause",
      medium: "Pause for one second, letting the moment settle",
      long: "Take a long two-second dramatic pause",
      beat: "Hold for a beat, as if considering what to say next",
    };

    matches.push({
      instruction: durationMap[duration] ?? "Pause briefly",
      originalText: match[0],
      cleanReplacement: " ",
    });
  }

  return matches;
}

/**
 * Emphasis marker: [emphasis]...[/emphasis]
 */
function processEmphasisMarkers(text: string): MarkerMatch[] {
  const matches: MarkerMatch[] = [];
  const emphasisRegex = /\[emphasis\](.*?)\[\/emphasis\]/gi;
  let match;

  while ((match = emphasisRegex.exec(text)) !== null) {
    const content = match[1] ?? "";
    matches.push({
      instruction: `Emphasize and stress the words "${content}" with extra vocal weight`,
      originalText: match[0],
      cleanReplacement: content,
    });
  }

  return matches;
}

/**
 * Low-tone marker: [low-tone]...[/low-tone]
 */
function processLowToneMarkers(text: string): MarkerMatch[] {
  const matches: MarkerMatch[] = [];
  const lowToneRegex = /\[low-tone\](.*?)\[\/low-tone\]/gi;
  let match;

  while ((match = lowToneRegex.exec(text)) !== null) {
    const content = match[1] ?? "";
    matches.push({
      instruction: `Drop to a lower, deeper register for "${content}"`,
      originalText: match[0],
      cleanReplacement: content,
    });
  }

  return matches;
}

/**
 * Whisper marker: [whisper]...[/whisper]
 */
function processWhisperMarkers(text: string): MarkerMatch[] {
  const matches: MarkerMatch[] = [];
  const whisperRegex = /\[whisper\](.*?)\[\/whisper\]/gi;
  let match;

  while ((match = whisperRegex.exec(text)) !== null) {
    const content = match[1] ?? "";
    matches.push({
      instruction: `Whisper the words "${content}" in a hushed, intimate tone`,
      originalText: match[0],
      cleanReplacement: content,
    });
  }

  return matches;
}

/**
 * Rising-tension marker: [rising-tension]...[/rising-tension]
 */
function processRisingTensionMarkers(text: string): MarkerMatch[] {
  const matches: MarkerMatch[] = [];
  const risingRegex = /\[rising-tension\](.*?)\[\/rising-tension\]/gi;
  let match;

  while ((match = risingRegex.exec(text)) !== null) {
    const content = match[1] ?? "";
    matches.push({
      instruction: `Gradually increase intensity and urgency through "${content}"`,
      originalText: match[0],
      cleanReplacement: content,
    });
  }

  return matches;
}

/**
 * Slow marker: [slow]...[/slow]
 */
function processSlowMarkers(text: string): MarkerMatch[] {
  const matches: MarkerMatch[] = [];
  const slowRegex = /\[slow\](.*?)\[\/slow\]/gi;
  let match;

  while ((match = slowRegex.exec(text)) !== null) {
    const content = match[1] ?? "";
    matches.push({
      instruction: `Slow down and deliver "${content}" with deliberate pacing`,
      originalText: match[0],
      cleanReplacement: content,
    });
  }

  return matches;
}

/**
 * Breath marker: [breath]
 */
function processBreathMarkers(text: string): MarkerMatch[] {
  const matches: MarkerMatch[] = [];
  const breathRegex = /\[breath\]/gi;
  let match;

  while ((match = breathRegex.exec(text)) !== null) {
    matches.push({
      instruction: "Take a natural audible breath",
      originalText: match[0],
      cleanReplacement: " ",
    });
  }

  return matches;
}

/**
 * Convert all delivery markers in a script into Director's Note instructions
 * and return the cleaned text.
 */
export function convertMarkersToDirectorNote(script: string): DeliveryMarkerResult {
  if (!script) {
    return { directorInstructions: "", cleanText: "" };
  }

  // Collect all marker matches
  const allMatches: MarkerMatch[] = [
    ...processPauseMarkers(script),
    ...processEmphasisMarkers(script),
    ...processLowToneMarkers(script),
    ...processWhisperMarkers(script),
    ...processRisingTensionMarkers(script),
    ...processSlowMarkers(script),
    ...processBreathMarkers(script),
  ];

  if (allMatches.length === 0) {
    return { directorInstructions: "", cleanText: script };
  }

  // Build director instructions
  const instructions = allMatches.map(m => m.instruction);
  const directorInstructions = instructions.join(". ") + ".";

  // Strip markers from text
  let cleanText = script;
  for (const match of allMatches) {
    cleanText = cleanText.replace(match.originalText, match.cleanReplacement);
  }

  // Clean up extra whitespace
  cleanText = cleanText.replace(/\s{2,}/g, " ").trim();

  return { directorInstructions, cleanText };
}
