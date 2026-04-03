/**
 * Prompt Service — Linting, similarity, and issue types
 */

import { normalizeForSimilarity, countWords } from "../../utils/textProcessing";

export interface MotionPromptResult {
  camera_motion: string;
  subject_physics: string;
  combined: string;
}

export type PromptRefinementIntent =
  | "auto"
  | "more_detailed"
  | "more_cinematic"
  | "more_consistent_subject"
  | "shorten"
  | "fix_repetition";

export type PromptLintIssueCode =
  | "too_short"
  | "too_long"
  | "repetitive"
  | "missing_subject"
  | "no_leading_subject"
  | "contains_text_instruction"
  | "contains_logos_watermarks"
  | "weak_visual_specificity"
  | "generic_conflict";

export interface PromptLintIssue {
  code: PromptLintIssueCode;
  message: string;
  severity: "warn" | "error";
}

export function jaccardSimilarity(a: string, b: string): number {
  const sa = new Set(normalizeForSimilarity(a).split(" ").filter(Boolean));
  const sb = new Set(normalizeForSimilarity(b).split(" ").filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;

  let inter = 0;
  Array.from(sa).forEach(w => { if (sb.has(w)) inter++; });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function lintPrompt(params: {
  promptText: string;
  globalSubject?: string;
  previousPrompts?: string[];
}): PromptLintIssue[] {
  const { promptText, globalSubject, previousPrompts } = params;
  const issues: PromptLintIssue[] = [];
  const words = countWords(promptText);
  const norm = normalizeForSimilarity(promptText);

  if (words < 10) {
    issues.push({ code: "too_short", message: "Prompt is very short; add setting, lighting, camera/composition, and mood to reduce generic outputs.", severity: "warn" });
  }

  if (words > 180) {
    issues.push({ code: "too_long", message: "Prompt is very long; consider removing redundant adjectives to reduce model confusion.", severity: "warn" });
  }

  const trimmedPrompt = promptText.trim();
  const leadingSubjectPattern = /^(a|an|the|two|three|several|many|some|all|every|their|his|her|its|our|\w+ed|\w+ing)\s+\w+/i;
  if (!leadingSubjectPattern.test(trimmedPrompt) && words > 5) {
    const firstWord = trimmedPrompt.split(/\s+/)[0]?.toLowerCase();
    const weakStarts = ["in", "through", "on", "at", "by", "with", "from", "when", "while", "during", "beneath", "under", "above"];
    if (firstWord && weakStarts.includes(firstWord)) {
      issues.push({ code: "no_leading_subject", message: `Prompt starts with a preposition ("${firstWord}"). It should start with a concrete subject (e.g., 'A lone figure...', 'The vintage car...', 'Weathered hands...')`, severity: "warn" });
    }
  }

  if (/\btext\b|\bsubtitles\b|\bcaption\b|\btypography\b|\blabel\b|\bwords\b|\btitle\b/.test(norm)) {
    issues.push({ code: "contains_text_instruction", message: "Prompt mentions text/subtitles/typography/labels; this often causes unwanted text in images.", severity: "warn" });
  }

  if (/\blogo\b|\bwatermark\b|\bbrand\b/.test(norm)) {
    issues.push({ code: "contains_logos_watermarks", message: "Prompt mentions logos/watermarks/brands; this often increases unwanted marks in images.", severity: "warn" });
  }

  const hasLighting = /\b(lighting|lit|glow|neon|sunset|dawn|fog|mist|smoke|backlight|sidelight|rim light|golden hour|blue hour|ambient|diffused|harsh|soft light|volumetric)\b/.test(norm);
  const hasQualityLighting = /\b(golden hour|blue hour|backlight|sidelight|rim light|volumetric|diffused|harsh direct|soft diffused|dappled|ambient glow|fire flicker|candlelight|moonlight)\b/.test(norm);
  const hasCameraAngle = /\b(close-up|wide shot|medium shot|portrait|overhead|low angle|high angle|bird.?s?.?eye|dutch angle|eye level|over.?the.?shoulder|tracking|dolly|crane|steadicam|handheld|establishing shot|extreme close-up)\b/.test(norm);
  const hasColorPalette = /\b(color palette|palette|monochrome|pastel|vibrant|muted|teal|orange|amber|crimson|slate|desaturated|warm tones|cool tones)\b/.test(norm);
  const hasLensDepth = /\b(depth of field|bokeh|lens|35mm|50mm|anamorphic|shallow focus|deep focus|rack focus)\b/.test(norm);
  const hasVisualAnchors = hasLighting || hasCameraAngle || hasColorPalette || hasLensDepth;

  if (!hasVisualAnchors) {
    issues.push({ code: "weak_visual_specificity", message: "Prompt lacks visual anchors (camera, lighting, palette). Add at least 1–2 to improve composition consistency.", severity: "warn" });
  }

  if (!hasCameraAngle && words > 20) {
    issues.push({ code: "weak_visual_specificity", message: "Prompt missing camera angle/shot type. Add one of: close-up, wide shot, medium shot, low angle, high angle, bird's eye, dutch angle, over-the-shoulder, tracking shot.", severity: "warn" });
  }

  if (hasLighting && !hasQualityLighting && words > 30) {
    issues.push({ code: "weak_visual_specificity", message: "Prompt has generic lighting. Specify quality: golden hour, backlight, rim light, soft diffused, harsh direct, volumetric, dappled through leaves, etc.", severity: "warn" });
  }

  if (globalSubject && globalSubject.trim().length > 0) {
    const firstTwentyWords = promptText.trim().split(/\s+/).slice(0, 20).join(" ").toLowerCase();
    const exactSubject = globalSubject.trim().toLowerCase();
    if (!firstTwentyWords.includes(exactSubject)) {
      issues.push({ code: "missing_subject", message: `Prompt MUST start with the exact Global Subject "${globalSubject}" in the first 20 words. Current first 20 words: "${firstTwentyWords}"`, severity: "error" });
    }
  }

  if (previousPrompts && previousPrompts.length > 0) {
    const maxSim = Math.max(...previousPrompts.map(p => jaccardSimilarity(p, promptText)));
    if (maxSim >= 0.72) {
      issues.push({ code: "repetitive", message: "Prompt is very similar to another scene; vary setting/camera/lighting to avoid repetitive images.", severity: "warn" });
    }
  }

  const conflictPatterns = /\b(arguing|slamming|yelling|fighting|screaming\s+at|shouting\s+match|couple\s+fighting|heated\s+argument|angry\s+confrontation)\b/i;
  if (conflictPatterns.test(norm)) {
    issues.push({ code: "generic_conflict", message: "Generic conflict imagery detected (arguing, fighting). Consider visual metaphors: glass breaking, door closing, wilting flower, fading photograph, storm clouds gathering.", severity: "warn" });
  }

  return issues;
}
