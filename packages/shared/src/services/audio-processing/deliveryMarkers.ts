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
 * Gemini TTS natively supports a small set of inline tags. For markers that
 * map to native tags, keep them inline to preserve position. For markers with
 * no native equivalent, extract to prose instructions (legacy behavior).
 *
 * Native Gemini TTS inline tags (per Google docs + cookbook):
 * - [short pause], [long pause]
 * - [breath]
 * - [whisper]   (scope = following phrase)
 * - [laughs], [yawn], [gasp], [sighs], [chuckles], [sobs], [coughs]  (instantaneous)
 * - [excitedly], [shouting], [sarcastic], [tired], [bored]  (style directives, mid-sentence)
 *
 * Markers kept as prose (no native equivalent):
 * - [emphasis], [low-tone], [rising-tension], [slow]
 */

// Instantaneous/one-shot tags — emit as-is, no scope.
const NATIVE_INSTANT_TAGS = [
    "breath", "laughs", "laugh", "yawn", "gasp", "sighs", "sigh",
    "chuckles", "chuckle", "sobs", "sob", "coughs", "cough",
];

// Style directive tags — also emit as-is; the model scopes to following content.
const NATIVE_STYLE_TAGS = [
    "excitedly", "shouting", "shouts", "sarcastic", "sarcastically",
    "tired", "bored", "angry", "sad", "happily",
];
export interface GeminiMarkerResult {
  /** Text with Google-native tags inline, non-native wrappers stripped to content. */
  inlineText: string;
  /** Prose instructions for markers with no native equivalent. */
  proseInstructions: string;
}

export function convertMarkersForGemini(script: string): GeminiMarkerResult {
  if (!script) return { inlineText: "", proseInstructions: "" };

  let text = script;
  const proseParts: string[] = [];

  // Native inline mappings — keep position, replace our syntax with Google's.
  text = text.replace(/\[pause:\s*long\]/gi, "[long pause]");
  text = text.replace(/\[pause:\s*(short|medium|beat)\]/gi, "[short pause]");
  // [breath] is already native.

  // Normalize any wrapped form of native instant/style tags to the native
  // directive form: [TAG]X[/TAG]  →  [TAG] X
  // This keeps cookbook-style inline tags (e.g. [excitedly], [shouting], [gasp])
  // working even if upstream generators accidentally emitted the wrapped variant.
  const nativePassthrough = [...NATIVE_INSTANT_TAGS, ...NATIVE_STYLE_TAGS];
  for (const tag of nativePassthrough) {
    const wrappedRe = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[/${tag}\\]`, "gi");
    text = text.replace(wrappedRe, (_m, content) => {
      const inner = String(content).trim();
      return inner ? `[${tag}] ${inner}` : `[${tag}]`;
    });
  }

  // [whisper]...[/whisper] — Google's [whisper] is a leading directive.
  // Emit `[whisper] <content>` and hope the model scopes to the phrase.
  text = text.replace(/\[whisper\]([\s\S]*?)\[\/whisper\]/gi, (_m, content) => {
    return `[whisper] ${String(content).trim()}`;
  });

  // Non-native wrapped markers — strip tags, record prose.
  const proseWrappers: { re: RegExp; label: string }[] = [
    { re: /\[emphasis\]([\s\S]*?)\[\/emphasis\]/gi, label: "Emphasize" },
    { re: /\[low-tone\]([\s\S]*?)\[\/low-tone\]/gi, label: "Drop to a lower register for" },
    { re: /\[rising-tension\]([\s\S]*?)\[\/rising-tension\]/gi, label: "Build rising tension through" },
    { re: /\[slow\]([\s\S]*?)\[\/slow\]/gi, label: "Slow down delivery for" },
  ];
  for (const { re, label } of proseWrappers) {
    text = text.replace(re, (_m, content) => {
      const inner = String(content).trim();
      if (inner) proseParts.push(`${label} "${inner}"`);
      return inner;
    });
  }

  const cleaned = text.replace(/\s{2,}/g, " ").trim();
  const proseInstructions = proseParts.length > 0 ? proseParts.join(". ") + "." : "";
  return { inlineText: cleaned, proseInstructions };
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
