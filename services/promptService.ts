/**
 * Prompt Service
 * Handles prompt generation and refinement for image/video generation.
 */

import { Type } from "@google/genai";
import { ImagePrompt } from "../types";
import { parseSRTTimestamp } from "../utils/srtParser";
import { ai, MODELS, withRetry } from "./shared/apiClient";
import { CAMERA_ANGLES, LIGHTING_MOODS, VideoPurpose } from "../constants";

// Re-export from extracted modules for backward compatibility
export { getSystemPersona, type Persona, type PersonaType } from './prompt/personaData';
export { getStyleEnhancement, type StyleEnhancement } from './prompt/styleEnhancements';

// --- Types ---

export type PromptRefinementIntent =
  | "auto"
  | "more_detailed"
  | "more_cinematic"
  | "more_consistent_subject"
  | "shorten"
  | "fix_repetition";

// --- Lint Issue Types ---

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

interface PromptResponseItem {
  text: string;
  mood: string;
  timestamp: string;
}

// --- Helper Functions ---

/**
 * Normalize a string for similarity comparison.
 */
export function normalizeForSimilarity(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`"'.,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Count words in a string.
 */
export function countWords(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/**
 * Calculate Jaccard similarity between two strings.
 */
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

// NOTE: getSystemPersona and getStyleEnhancement have been moved to
// ./prompt/personaData.ts and ./prompt/styleEnhancements.ts respectively

/**
 * Lint a prompt for common issues.
 */
export function lintPrompt(params: {
  promptText: string;
  globalSubject?: string;
  previousPrompts?: string[];
}): PromptLintIssue[] {
  const { promptText, globalSubject, previousPrompts } = params;
  const issues: PromptLintIssue[] = [];

  const words = countWords(promptText);

  // Reduced threshold from 18 to 10 - modern models (Imagen 3, Flux) perform better with concise prompts
  if (words < 10) {
    issues.push({
      code: "too_short",
      message:
        "Prompt is very short; add setting, lighting, camera/composition, and mood to reduce generic outputs.",
      severity: "warn",
    });
  }

  if (words > 180) {
    issues.push({
      code: "too_long",
      message:
        "Prompt is very long; consider removing redundant adjectives to reduce model confusion.",
      severity: "warn",
    });
  }

  const norm = normalizeForSimilarity(promptText);

  // Check if prompt starts with a concrete subject (article + noun pattern)
  const leadingSubjectPattern = /^(a|an|the|two|three|several|many|some|all|every|their|his|her|its|our|\w+ed|\w+ing)\s+\w+/i;
  const trimmedPrompt = promptText.trim();
  if (!leadingSubjectPattern.test(trimmedPrompt) && words > 5) {
    // If it doesn't match the pattern but starts with a capital letter + word, it might be a noun
    // We only flag if it looks like a preposition or weak start
    const firstWord = trimmedPrompt.split(/\s+/)[0].toLowerCase();
    const weakStarts = ["in", "through", "on", "at", "by", "with", "from", "when", "while", "during", "beneath", "under", "above"];

    if (weakStarts.includes(firstWord)) {
      issues.push({
        code: "no_leading_subject",
        message:
          `Prompt starts with a preposition ("${firstWord}"). It should start with a concrete subject (e.g., 'A lone figure...', 'The vintage car...', 'Weathered hands...')`,
        severity: "warn",
      });
    }
  }

  if (/\btext\b|\bsubtitles\b|\bcaption\b|\btypography\b|\blabel\b|\bwords\b|\btitle\b/.test(norm)) {
    issues.push({
      code: "contains_text_instruction",
      message:
        "Prompt mentions text/subtitles/typography/labels; this often causes unwanted text in images.",
      severity: "warn",
    });
  }

  if (/\blogo\b|\bwatermark\b|\bbrand\b/.test(norm)) {
    issues.push({
      code: "contains_logos_watermarks",
      message:
        "Prompt mentions logos/watermarks/brands; this often increases unwanted marks in images.",
      severity: "warn",
    });
  }

  const hasVisualAnchors =
    /\b(lighting|lit|glow|neon|sunset|dawn|fog|mist|smoke)\b/.test(norm) ||
    /\b(close-up|wide shot|medium shot|portrait|overhead|low angle|high angle)\b/.test(
      norm,
    ) ||
    /\b(color palette|palette|monochrome|pastel|vibrant|muted)\b/.test(norm) ||
    /\b(depth of field|bokeh|lens|35mm|50mm|anamorphic)\b/.test(norm);

  if (!hasVisualAnchors) {
    issues.push({
      code: "weak_visual_specificity",
      message:
        "Prompt lacks visual anchors (camera, lighting, palette). Add at least 1–2 to improve composition consistency.",
      severity: "warn",
    });
  }

  if (globalSubject && globalSubject.trim().length > 0) {
    const subjNorm = normalizeForSimilarity(globalSubject);
    const promptNorm = normalizeForSimilarity(promptText);

    // Extract meaningful tokens from global subject (length >= 3)
    const subjectTokens = subjNorm.split(" ").filter(t => t.length >= 3);

    // Common subject synonyms to avoid false positives for "person"
    const personSynonyms = ["person", "figure", "character", "individual", "man", "woman", "human", "someone", "somebody"];

    // Check if prompt contains any of the important subject tokens
    const foundTokens = subjectTokens.filter(t => {
      // Direct match
      if (promptNorm.includes(t)) return true;

      // If subject is a person, allow common synonyms
      if (personSynonyms.includes(t)) {
        return personSynonyms.some(s => promptNorm.includes(s));
      }

      // Basic root matching for verbs (e.g., walking -> walk)
      if (t.endsWith("ing") && promptNorm.includes(t.slice(0, -3))) return true;
      if (t.endsWith("s") && promptNorm.includes(t.slice(0, -1))) return true;

      return false;
    });

    const missingRatio = 1 - (foundTokens.length / subjectTokens.length);

    // If more than 70% of the subject is missing, flag it
    // But allow drift if the prompt is long and detailed (might be atmospheric)
    if (missingRatio > 0.7 && words < 100) {
      issues.push({
        code: "missing_subject",
        message:
          `Prompt doesn't strongly reference the Global Subject ("${globalSubject}"). This can cause character/object drift.`,
        severity: "warn",
      });
    }
  }

  if (previousPrompts && previousPrompts.length > 0) {
    const sims = previousPrompts.map((p) => jaccardSimilarity(p, promptText));
    const maxSim = Math.max(...sims);
    if (maxSim >= 0.72) {
      issues.push({
        code: "repetitive",
        message:
          "Prompt is very similar to another scene; vary setting/camera/lighting to avoid repetitive images.",
        severity: "warn",
      });
    }
  }

  // Generic conflict detection - flag common cliche tropes
  // But skip for action-oriented styles where conflict is expected
  const conflictPatterns = /\b(arguing|slamming|yelling|fighting|screaming\s+at|shouting\s+match|couple\s+fighting|heated\s+argument|angry\s+confrontation)\b/i;
  if (conflictPatterns.test(norm)) {
    // Note: This check is style-agnostic in lintPrompt. The caller should consider
    // suppressing this warning for action/anime styles where conflict is intentional.
    issues.push({
      code: "generic_conflict",
      message:
        "Generic conflict imagery detected (arguing, fighting). Consider visual metaphors: glass breaking, door closing, wilting flower, fading photograph, storm clouds gathering.",
      severity: "warn",
    });
  }

  return issues;
}

/**
 * Get purpose-specific instructions for prompt generation.
 */
export const getPurposeGuidance = (purpose: VideoPurpose): string => {
  const guidance: Record<VideoPurpose, string> = {
    music_video: `
PURPOSE: Music Video (Cinematic, Emotional)
- Create dramatic, emotionally resonant scenes that amplify the music's feeling
- Use cinematic compositions with depth and layers
- Match visual intensity to musical intensity (verse=calm, chorus=dynamic)
- Aim for 4-6 second average scene duration
- Include atmospheric elements (particles, light rays, reflections)`,

    social_short: `
PURPOSE: Social Media Short (TikTok/Reels/Shorts)
- Bold, eye-catching visuals that pop on small screens
- High contrast, vibrant colors, immediate visual impact
- Fast-paced energy, dynamic compositions
- Vertical-friendly framing (subject centered, minimal side detail)
- Trendy aesthetics, modern and relatable imagery`,

    documentary: `
PURPOSE: Documentary/Educational
- Realistic, grounded visuals that inform and explain
- B-roll style imagery that supports narration
- Clear, unambiguous scenes that illustrate concepts
- Professional, trustworthy aesthetic
- Mix of wide establishing shots and detail close-ups`,

    commercial: `
PURPOSE: Commercial/Advertisement
- Clean, polished, aspirational imagery
- Product/subject should be hero of each frame
- Lifestyle-oriented scenes showing benefits/emotions
- Professional lighting, minimal distractions
- Call-to-action friendly compositions`,

    podcast_visual: `
PURPOSE: Podcast/Audio Visualization
- Ambient, non-distracting background visuals
- Abstract or environmental scenes
- Calm, steady imagery that doesn't compete with spoken content
- Subtle movement potential, meditative quality
- Longer scene durations (8-15 seconds)`,

    lyric_video: `
PURPOSE: Lyric Video
- Compositions with clear negative space for text overlay
- Avoid busy centers where lyrics will appear
- Backgrounds that provide contrast for readability
- Thematic imagery that supports but doesn't overwhelm
- Consider lower-third and center-frame text placement areas`,

    storytelling: `
PURPOSE: Storytelling/Narrative
- Narrative-driven imagery that follows a story arc
- Character-focused scenes with emotional depth
- Settings that establish time, place, and mood
- Visual metaphors and symbolic imagery
- Dramatic lighting to enhance storytelling moments`,

    educational: `
PURPOSE: Educational Content
- Clear, informative visuals that support learning
- Diagrams and illustrative imagery when appropriate
- Professional, trustworthy aesthetic
- Consistent visual language throughout
- Balance between engaging and instructional`,

    horror_mystery: `
PURPOSE: Horror/Mystery
- Dark, atmospheric, and suspenseful imagery
- Use of shadows, fog, and low-key lighting
- Unsettling compositions with negative space
- Subtle hints of danger or the unknown
- Moody color palettes (desaturated, cool tones)`,

    travel: `
PURPOSE: Travel/Nature
- Stunning landscape and scenic imagery
- Wide establishing shots that capture scale
- Cultural and environmental authenticity
- Golden hour and natural lighting preferred
- Sense of wonder and exploration`,

    motivational: `
PURPOSE: Motivational/Inspirational
- Uplifting, empowering imagery
- Dynamic compositions suggesting progress
- Warm, hopeful lighting
- Aspirational subjects and settings
- Visual metaphors for growth and achievement`,

    news_report: `
PURPOSE: News Report/Journalistic
- Factual, objective visual style
- Clear, unambiguous imagery
- Professional, trustworthy aesthetic
- B-roll that supports factual narration
- Neutral color grading, minimal stylization`,
  };

  return guidance[purpose] || guidance.music_video;
};


/**
 * Enhanced prompt generation instruction with visual storytelling.
 * Now injects rich style keywords from styleEnhancements.ts for authentic visual representation.
 * Also injects persona data from personaData.ts for purpose-specific director guidance.
 */
export const getPromptGenerationInstruction = (
  style: string,
  mode: "lyrics" | "story",
  content: string,
  globalSubject: string = "",
  purpose: VideoPurpose = "music_video",
) => {
  // Import style enhancement data for rich visual keywords
  const { getStyleEnhancement } = require('./prompt/styleEnhancements');
  const { getSystemPersona } = require('./prompt/personaData');
  const styleData = getStyleEnhancement(style);
  const persona = getSystemPersona(purpose);

  const contentType =
    mode === "lyrics" ? "song lyrics" : "spoken-word/narrative transcript";
  const purposeGuidance = getPurposeGuidance(purpose);

  // Build rich style block with actual technique keywords
  const richStyleBlock = `
ART STYLE: "${style}"
VISUAL GUIDELINES (MANDATORY - apply to ALL prompts):
${styleData.keywords.map((k: string) => `- ${k}`).join('\n')}
AESTHETIC GOAL: ${styleData.mediumDescription}`;

  // Build persona block with director-specific guidance
  const personaBlock = `
DIRECTOR PERSONA: ${persona.name} (${persona.role})
CORE DIRECTIVE: ${persona.coreRule}
VISUAL PRINCIPLES:
${persona.visualPrinciples.map((p: string) => `- ${p}`).join('\n')}
STRICTLY AVOID:
${persona.avoidList.map((a: string) => `- ${a}`).join('\n')}`;

  const subjectBlock = globalSubject.trim()
    ? `
MAIN SUBJECT (must appear consistently in relevant scenes):
"${globalSubject}"
- Keep this subject's appearance, clothing, and key features consistent
- Reference specific visual details (hair color, outfit, distinguishing features)
- The subject should be the visual anchor across scenes
- CRITICAL: Every prompt MUST start with "${globalSubject}" or a direct reference to them`
    : `
MAIN SUBJECT: None specified
- Create cohesive scenes with consistent environmental/thematic elements
- If characters appear, maintain their appearance across scenes`;

  const structureGuidance =
    mode === "lyrics"
      ? `
SONG STRUCTURE ANALYSIS:
1. Identify sections: Intro, Verse, Pre-Chorus, Chorus, Bridge, Outro
2. Verses = introspective, storytelling, character moments
3. Choruses = emotional peaks, dynamic visuals, wider shots
4. Bridge = visual contrast, unexpected angle or setting
5. Match energy: quiet sections → intimate close-ups; loud sections → epic wide shots`
      : `
NARRATIVE STRUCTURE ANALYSIS:
1. Identify segments: Introduction, Key Points, Transitions, Conclusion
2. Opening = establishing context, setting the scene
3. Main content = illustrating concepts, showing examples
4. Transitions = visual bridges between ideas
5. Conclusion = reinforcing main message, memorable closing image`;

  const visualVariety = `
VISUAL VARIETY REQUIREMENTS:
- Camera angles to use across scenes: ${CAMERA_ANGLES.slice(0, 6).join(", ")}
- Lighting variations: ${LIGHTING_MOODS.slice(0, 5).join(", ")}
- NEVER repeat the same camera angle in consecutive scenes
- Create an emotional arc: establish → build → climax → resolve
- Each prompt must specify: subject, action/pose, setting, lighting, camera angle, mood`;

  return `You are a professional music video director and visual storyteller creating an image storyboard.
${personaBlock}

TASK: Analyze this ${contentType} and generate a visual storyboard with detailed image prompts.
${richStyleBlock}
${subjectBlock}
${purposeGuidance}
${structureGuidance}
${visualVariety}

PROMPT WRITING RULES:
1. FORMAT: "[Subject Description], [Action], [Environment], [Lighting/Style]"
2. If a Global Subject is defined ("${globalSubject}"), every prompt MUST start with exactly that phrase.
   - CORRECT: "${globalSubject || 'The subject'} standing in a neon rainstorm..."
   - INCORRECT: "A lonely figure standing..." (Ambiguous - causes subject drift)
   - INCORRECT: "Neon rain falls on ${globalSubject || 'the subject'}..." (Passive - subject not leading)
3. EVERY prompt MUST begin with a concrete subject noun (e.g., "A lone figure...", "A vintage car...", "A glowing orb...", "Weathered hands...")
4. Each prompt must be 40-120 words with SPECIFIC visual details
5. MANDATORY CHECKLIST for each prompt (include ALL of these):
   - Subject: WHO or WHAT is in the scene (concrete noun, not abstract)
   - Action/Pose: What the subject is doing
   - Setting: WHERE the scene takes place
   - Lighting: Type and quality (e.g., "golden hour backlighting", "harsh overhead fluorescent", "soft diffused window light")
   - Texture: At least one tactile detail (e.g., "weathered wood grain", "rain-slicked asphalt", "velvet fabric")
   - Camera: Shot type and angle (e.g., "extreme close-up at eye level", "wide establishing shot from low angle")
   - Atmosphere: Mood and ambient details
6. NEVER include text, titles, lyrics, subtitles, captions, labels, typography, written words, or UI elements inside the image - this is a CRITICAL requirement
7. NO generic phrases like "beautiful", "stunning", "amazing" - be SPECIFIC with descriptors
8. Reference the main subject by their specific features, not just "the subject"
9. Vary compositions: rule-of-thirds, centered, symmetrical, asymmetrical
10. Include sensory details: textures, materials, weather, time of day

EMOTIONAL ARC:
- Scene 1-2: Establish mood and setting (wide shots, context)
- Scene 3-5: Build intensity (medium shots, character focus)
- Scene 6-8: Peak emotion (dynamic angles, close-ups, action)
- Scene 9-12: Resolution/reflection (pull back, contemplative)

CONTENT TO ANALYZE:
${content.slice(0, 15000)}

OUTPUT: Generate 8-12 prompts as JSON with 'prompts' array.
Each item: { "text": "detailed visual prompt starting with concrete subject", "mood": "emotional tone", "timestamp": "MM:SS" }

Timestamps should align with natural section breaks in the content.`;
};

/**
 * Refine an image prompt using AI.
 */
async function refineImagePromptWithAI(params: {
  promptText: string;
  style: string;
  globalSubject?: string;
  aspectRatio?: string;
  intent?: PromptRefinementIntent;
  issues?: PromptLintIssue[];
}): Promise<string> {
  const {
    promptText,
    style,
    globalSubject = "",
    aspectRatio = "16:9",
    intent = "auto",
    issues = [],
  } = params;

  const issueSummary =
    issues.length > 0
      ? issues.map((i) => `- (${i.code}) ${i.message}`).join("\n")
      : "- (none)";

  const response = await ai.models.generateContent({
    model: MODELS.TEXT,
    contents: `You are a prompt engineer for high-quality image generation.
Rewrite the user's prompt to improve visual clarity, cinematic composition, and subject consistency while preserving intent.

Global Subject (must remain consistent across scenes):
${globalSubject ? globalSubject : "(none)"}

Chosen Style Preset:
${style}

Aspect Ratio:
${aspectRatio}

User Intent:
${intent}

Detected Issues:
${issueSummary}

Requirements:
- Output ONLY a JSON object: { "prompt": string }.
- Keep it a single prompt suitable for an image model.
- Make it vivid and specific (setting, lighting, camera/composition, color palette, mood).
- Keep style consistent with the chosen preset.
- Do NOT include any text/typography/subtitles/logos/watermarks instructions.
- If Global Subject is provided, it MUST be the primary focus. Restate its key identifiers explicitly (face, hair, outfit, materials) so the subject stays 100% consistent across scenes.
- If the subject is a person, use consistent descriptors.
- Ensure the prompt STARTS with the subject name or a concrete description of it.
- Keep length 70–130 words for maximum detail.
- Avoid repeating generic phrases like "highly detailed" or "stunning" too much.

User Prompt:
${promptText}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING },
        },
        required: ["prompt"],
      },
    },
  });

  const jsonStr = response.text;
  if (!jsonStr) return promptText;

  try {
    const parsed = JSON.parse(jsonStr) as { prompt: string };
    return parsed.prompt?.trim() ? parsed.prompt.trim() : promptText;
  } catch {
    return promptText;
  }
}


// --- Main Services ---

/**
 * Internal function to generate prompts from content.
 */
const generatePrompts = async (
  srtContent: string,
  style: string,
  mode: "lyrics" | "story",
  globalSubject: string = "",
  purpose: VideoPurpose = "music_video",
): Promise<ImagePrompt[]> => {
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: getPromptGenerationInstruction(
          style,
          mode,
          srtContent,
          globalSubject,
          purpose,
        ),
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              prompts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    mood: { type: Type.STRING },
                    timestamp: { type: Type.STRING },
                  },
                  required: ["text", "mood", "timestamp"],
                },
              },
            },
          },
        },
      });

      const jsonStr = response.text;
      if (!jsonStr) throw new Error("No prompts generated");

      const parsed = JSON.parse(jsonStr) as { prompts: PromptResponseItem[] };

      return parsed.prompts.map((p, index: number) => ({
        text: p.text,
        mood: p.mood,
        timestamp: p.timestamp,
        id: `prompt-${Date.now()}-${index}`,
        timestampSeconds: parseSRTTimestamp(p.timestamp) ?? 0,
      }));
    } catch (error) {
      console.error("Prompt generation error:", error);
      return [];
    }
  });
};

/**
 * Generate image prompts from song lyrics.
 */
export const generatePromptsFromLyrics = (
  srtContent: string,
  style: string = "Cinematic",
  globalSubject: string = "",
  purpose: VideoPurpose = "music_video",
) => generatePrompts(srtContent, style, "lyrics", globalSubject, purpose);

/**
 * Generate image prompts from story/narrative content.
 */
export const generatePromptsFromStory = (
  srtContent: string,
  style: string = "Cinematic",
  globalSubject: string = "",
  purpose: VideoPurpose = "documentary",
) => generatePrompts(srtContent, style, "story", globalSubject, purpose);

/**
 * Refine an image prompt with linting and optional AI enhancement.
 */
export const refineImagePrompt = async (params: {
  promptText: string;
  style?: string;
  globalSubject?: string;
  aspectRatio?: string;
  intent?: PromptRefinementIntent;
  previousPrompts?: string[];
}): Promise<{ refinedPrompt: string; issues: PromptLintIssue[] }> => {
  const {
    promptText,
    style = "Cinematic",
    globalSubject = "",
    aspectRatio = "16:9",
    intent = "auto",
    previousPrompts = [],
  } = params;

  const issues = lintPrompt({ promptText, globalSubject, previousPrompts });

  // Only run an AI rewrite if it looks low quality or the user explicitly requests a change.
  const shouldRefine =
    intent !== "auto" ||
    issues.some(
      (i) =>
        i.code === "too_short" ||
        i.code === "repetitive" ||
        i.code === "missing_subject",
    );

  if (!shouldRefine) {
    return { refinedPrompt: promptText.trim(), issues };
  }

  const refinedPrompt = await withRetry(async () => {
    return refineImagePromptWithAI({
      promptText,
      style,
      globalSubject,
      aspectRatio,
      intent,
      issues,
    });
  });

  return { refinedPrompt, issues };
};

/**
 * Generate a professional, cinematic video prompt for Veo 3.1.
 * Transforms a scene description into a production-quality video generation prompt
 * with camera movements, lighting, pacing, and cinematic techniques.
 *
 * @param sceneDescription - The scene's visual description
 * @param style - Art style (Cinematic, Documentary, etc.)
 * @param mood - Emotional tone of the scene
 * @param globalSubject - Subject to keep consistent
 * @param videoPurpose - Purpose of the video (documentary, commercial, etc.)
 * @param durationSeconds - Target video duration (4, 6, or 8 seconds)
 */
export const generateProfessionalVideoPrompt = async (
  sceneDescription: string,
  style: string = "Cinematic",
  mood: string = "dramatic",
  globalSubject: string = "",
  videoPurpose: string = "documentary",
  durationSeconds: number = 6,
): Promise<string> => {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODELS.TEXT,
      contents: `You are an elite cinematographer and video director creating prompts for Google Veo 3.1 (state-of-the-art AI video generation).

SCENE DESCRIPTION TO TRANSFORM:
"${sceneDescription}"

PRODUCTION PARAMETERS:
- Visual Style: ${style}
- Emotional Tone: ${mood}
- Video Purpose: ${videoPurpose}
- Duration: ${durationSeconds} seconds
${globalSubject ? `- Main Subject (MUST be featured prominently): ${globalSubject}` : ''}

YOUR TASK: Transform the scene description into a professional video generation prompt that will produce cinematic, broadcast-quality footage.

MANDATORY ELEMENTS TO INCLUDE:
1. **CAMERA WORK** (choose appropriate technique):
   - Movement: dolly in/out, tracking shot, crane up/down, steadicam follow, handheld, static with subject motion
   - Speed: slow push (contemplative), medium pace (narrative), dynamic movement (action)
   - Framing: wide establishing → medium → close-up progression, or single powerful composition

2. **LIGHTING DESIGN**:
   - Key light direction and quality (harsh, soft, diffused, directional)
   - Mood lighting (golden hour, blue hour, moonlight, neon, practical lights)
   - Contrast ratio (high contrast noir, low contrast ethereal, natural)
   - Light motivation (window light, fire glow, screen glow, sun rays)

3. **MOTION CHOREOGRAPHY**:
   - Subject movement within frame (walking, turning, gesturing, still with breath)
   - Environmental motion (wind in hair/clothes, particles, smoke, water, reflections)
   - Parallax and depth (foreground elements moving differently than background)

4. **ATMOSPHERE & ENVIRONMENT**:
   - Volumetric effects (fog, haze, dust particles, rain, snow, lens flares)
   - Environmental storytelling elements
   - Time of day and weather conditions

5. **TEMPORAL PACING**:
   - For ${durationSeconds}s video, describe a mini-arc:
     - Seconds 0-2: Establish (wide or reveal)
     - Seconds 2-4: Focus (move to subject)
     - Seconds 4-${durationSeconds}: Conclude (emotional beat or pullback)

STYLE-SPECIFIC GUIDANCE:
${style === "Cinematic" ? `
- 35mm film grain, anamorphic lens flares, 2.39:1 cinematic feel
- Deep shadows, rich highlights, film color science
- Motivated camera movement, deliberate pacing
- Production design worthy of major motion pictures` : ''}
${style === "Documentary" ? `
- Handheld authenticity with stabilization
- Natural lighting, observational approach
- Intimate close-ups, revealing wide shots
- Truth-seeking camera that follows action` : ''}
${style === "Commercial / Ad" ? `
- Pristine, polished, aspirational visuals
- Hero lighting on products/subjects
- Smooth, confident camera movements
- High production value, clean compositions` : ''}
${style === "Anime / Manga" ? `
- Anime-style dynamic camera angles
- Wind and particle effects
- Dramatic speed lines and motion blur
- Expressive character moments` : ''}

OUTPUT FORMAT:
Generate a single, detailed video prompt (150-250 words) that reads as professional direction.
Start directly with the scene action (no preamble like "A video of...").
Write in present tense, active voice.
Be specific about timing and progression within the ${durationSeconds} seconds.

Return JSON: { "videoPrompt": "your detailed prompt here" }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            videoPrompt: { type: Type.STRING },
          },
          required: ["videoPrompt"],
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) {
      // Fallback: return enhanced version of original
      return `${style} shot: ${sceneDescription}. Smooth camera movement, professional lighting, cinematic composition. ${mood} atmosphere with environmental details.`;
    }

    try {
      const parsed = JSON.parse(jsonStr) as { videoPrompt: string };
      if (parsed.videoPrompt && parsed.videoPrompt.length > 50) {
        return parsed.videoPrompt;
      }
      return `${style} shot: ${sceneDescription}. Smooth camera movement, professional lighting. ${mood} mood.`;
    } catch {
      return `${style}: ${sceneDescription}. Cinematic quality, ${mood} lighting.`;
    }
  });
};

/**
 * Generate a motion-optimized prompt for video animation.
 * Transforms a static image description into an animation-focused prompt
 * that specifies camera movements, environmental effects, and subtle animations.
 */
export const generateMotionPrompt = async (
  imagePrompt: string,
  mood: string = "cinematic",
  globalSubject: string = "",
): Promise<string> => {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODELS.TEXT,
      contents: `You are a professional video director creating motion instructions for animating a still image.

STATIC IMAGE DESCRIPTION:
${imagePrompt}

MOOD: ${mood}

${globalSubject ? `MAIN SUBJECT (keep stationary/subtle movement only): ${globalSubject}` : ""}

TASK: Generate a SHORT motion prompt (2-3 sentences max) describing:
1. Camera movement (slow zoom, pan, dolly, static with parallax)
2. Environmental motion (wind, particles, light rays, clouds, water ripples)
3. Atmospheric effects (fog drift, light flicker, dust motes)

RULES:
- Keep the main subject relatively static (subtle breathing, blinking, hair movement only)
- Focus on ENVIRONMENT and CAMERA movement, not subject action
- The animation is only 1-2 seconds, so describe subtle, looping motion
- NO scene changes, NO new elements, NO action sequences
- Use present continuous tense ("camera slowly zooms", "leaves are gently swaying")
- Keep it under 50 words

OUTPUT: Return JSON with single field "motion"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            motion: { type: Type.STRING },
          },
          required: ["motion"],
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) {
      // Fallback: generate a generic motion prompt
      return `Slow cinematic camera push-in with subtle atmospheric movement. ${mood} lighting with gentle environmental motion.`;
    }

    try {
      const parsed = JSON.parse(jsonStr) as { motion: string };
      return parsed.motion || `Slow camera movement with subtle ${mood} atmosphere.`;
    } catch {
      return `Slow cinematic camera movement with ${mood} ambiance.`;
    }
  });
};
