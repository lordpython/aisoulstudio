/**
 * Prompt Service
 * Handles prompt generation and refinement for image/video generation.
 */

import { Type } from "@google/genai";
import { ImagePrompt } from "../types";
import { parseSRTTimestamp } from "../utils/srtParser";
import { ai, MODELS, withRetry } from "./shared/apiClient";
import { CAMERA_ANGLES, LIGHTING_MOODS, VideoPurpose } from "../constants";
import type { ImageStyleGuide } from "./prompt/imageStyleGuide";
import { normalizeForSimilarity, countWords } from "./utils/textProcessing";

// --- NEW STYLE INJECTOR ---

/**
 * Forces a consistent visual style across all assets to prevent "Style Soup".
 */
export function injectMasterStyle(basePrompt: string, stylePreset: string = "cinematic"): string {
    // 1. Clean the prompt of conflicting instructions
    let cleanPrompt = basePrompt.replace(/photorealistic|cartoon|3d render|sketch/gi, "").trim();

    // 2. Dynamic style prefix based on stylePreset
    const stylePrefixes: Record<string, string> = {
        "cinematic": "Cinematic film shot",
        "anime": "Anime-style illustration",
        "watercolor": "Watercolor painting",
        "sketch": "Pencil sketch drawing",
        "oil painting": "Oil painting on canvas",
        "photorealistic": "Photorealistic photograph",
        "documentary": "Documentary-style photograph",
        "noir": "Film noir shot",
        "vaporwave": "Vaporwave aesthetic",
        "cyberpunk": "Cyberpunk-themed visual",
        "fantasy": "Fantasy art illustration",
        "manga": "Manga-style drawing",
        "comic book": "Comic book illustration",
        "3d render": "3D rendered image",
        "pixel art": "Pixel art creation",
        "chibi": "Chibi-style art",
        "steampunk": "Steampunk illustration",
        "gothic": "Gothic art style",
        "minimalist": "Minimalist design",
        "abstract": "Abstract art piece",
        "vintage": "Vintage-style photograph"
    };

    // Get the appropriate prefix, default to the style name if not found
    const prefix = stylePrefixes[stylePreset.toLowerCase()] || `${stylePreset} aesthetic`;

    // 3. Define the Master Style (The "Glue")
    // This ensures consistent colors, lighting, and texture across all generated clips.
    const MASTER_STYLE = `${prefix}, ${stylePreset} aesthetic, consistent color grading, soft volumetric lighting, 35mm film grain, high coherence, highly detailed, 8k resolution. Negative prompt: text, watermark, bad quality, distorted, cgi artifacts, cartoon.`;

    // 4. Combine
    return `${cleanPrompt}. ${MASTER_STYLE}`;
}

// Re-export from extracted modules for backward compatibility
export { getSystemPersona, type Persona, type PersonaType } from './prompt/personaData';
export { getStyleEnhancement, type StyleEnhancement } from './prompt/styleEnhancements';
export { normalizeForSimilarity, countWords };

// --- Motion Prompt Result ---

/**
 * Structured result from generateMotionPrompt().
 * Separates camera movement from subject/environment physics to avoid
 * instruction dilution in video models that conflate the two.
 */
export interface MotionPromptResult {
  /** Camera only: movement type, direction, speed (≤25 words). */
  camera_motion: string;
  /** Environment/subject: wind, particles, flame, cloth, water (≤25 words). */
  subject_physics: string;
  /** Combined string for single-string video APIs: "{camera_motion}. {subject_physics}" */
  combined: string;
}

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
    const firstWord = trimmedPrompt.split(/\s+/)[0]?.toLowerCase();
    const weakStarts = ["in", "through", "on", "at", "by", "with", "from", "when", "while", "during", "beneath", "under", "above"];

    if (firstWord && weakStarts.includes(firstWord)) {
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

  // Check for lighting quality (not just presence)
  const hasLighting = /\b(lighting|lit|glow|neon|sunset|dawn|fog|mist|smoke|backlight|sidelight|rim light|golden hour|blue hour|ambient|diffused|harsh|soft light|volumetric)\b/.test(norm);
  const hasQualityLighting = /\b(golden hour|blue hour|backlight|sidelight|rim light|volumetric|diffused|harsh direct|soft diffused|dappled|ambient glow|fire flicker|candlelight|moonlight)\b/.test(norm);

  // Check for camera angle (required)
  const hasCameraAngle = /\b(close-up|wide shot|medium shot|portrait|overhead|low angle|high angle|bird.?s?.?eye|dutch angle|eye level|over.?the.?shoulder|tracking|dolly|crane|steadicam|handheld|establishing shot|extreme close-up)\b/.test(norm);

  // Check for color/palette
  const hasColorPalette = /\b(color palette|palette|monochrome|pastel|vibrant|muted|teal|orange|amber|crimson|slate|desaturated|warm tones|cool tones)\b/.test(norm);

  // Check for lens/depth
  const hasLensDepth = /\b(depth of field|bokeh|lens|35mm|50mm|anamorphic|shallow focus|deep focus|rack focus)\b/.test(norm);

  const hasVisualAnchors = hasLighting || hasCameraAngle || hasColorPalette || hasLensDepth;

  if (!hasVisualAnchors) {
    issues.push({
      code: "weak_visual_specificity",
      message:
        "Prompt lacks visual anchors (camera, lighting, palette). Add at least 1–2 to improve composition consistency.",
      severity: "warn",
    });
  }

  // NEW: Specific check for missing camera angle
  if (!hasCameraAngle && words > 20) {
    issues.push({
      code: "weak_visual_specificity",
      message:
        "Prompt missing camera angle/shot type. Add one of: close-up, wide shot, medium shot, low angle, high angle, bird's eye, dutch angle, over-the-shoulder, tracking shot.",
      severity: "warn",
    });
  }

  // NEW: Check for lighting quality (not just presence)
  if (hasLighting && !hasQualityLighting && words > 30) {
    issues.push({
      code: "weak_visual_specificity",
      message:
        "Prompt has generic lighting. Specify quality: golden hour, backlight, rim light, soft diffused, harsh direct, volumetric, dappled through leaves, etc.",
      severity: "warn",
    });
  }

  if (globalSubject && globalSubject.trim().length > 0) {
    // ENFORCE EXACT MATCH: Check if globalSubject appears exactly in first 20 words
    const promptWords = promptText.trim().split(/\s+/).slice(0, 20);
    const firstTwentyWords = promptWords.join(" ").toLowerCase();
    const exactSubject = globalSubject.trim().toLowerCase();
    
    // Check for exact match of the globalSubject phrase
    const hasExactMatch = firstTwentyWords.includes(exactSubject);
    
    if (!hasExactMatch) {
      issues.push({
        code: "missing_subject",
        message:
          `Prompt MUST start with the exact Global Subject "${globalSubject}" in the first 20 words. Current first 20 words: "${firstTwentyWords}"`,
        severity: "error",
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

    // Story Mode Genre-Specific Guidance
    story_drama: `
PURPOSE: Drama Story
- Emotional depth and character-focused moments
- Intimate close-ups for emotional beats
- Warm, naturalistic lighting
- Subtle environmental storytelling
- Meaningful pauses and contemplative compositions`,

    story_comedy: `
PURPOSE: Comedy Story
- Bright, vibrant, energetic visuals
- Clear staging for comedic timing
- Reaction shots and character expressions
- Playful, dynamic camera angles
- Exaggerated but grounded environments`,

    story_thriller: `
PURPOSE: Thriller Story
- High tension, suspenseful atmosphere
- Noir-inspired high contrast lighting
- Claustrophobic, unsettling framing
- Deep shadows and hidden threats
- Dutch angles for psychological unease`,

    story_scifi: `
PURPOSE: Sci-Fi Story
- Futuristic, technological environments
- Neon accents and holographic elements
- Scale contrast between human and technology
- Clean, minimalist future aesthetics
- Atmospheric volumetric lighting`,

    story_action: `
PURPOSE: Action Story
- Dynamic, kinetic compositions
- Motion blur and speed emphasis
- High-energy color grading
- Clear spatial geography for action
- Impactful freeze-frame moments`,

    story_fantasy: `
PURPOSE: Fantasy Story
- Magical, immersive world-building
- Rich, saturated color palettes
- Epic scale and grandeur
- Mystical lighting effects (glows, particles)
- Mythical creatures and enchanted environments`,

    story_romance: `
PURPOSE: Romance Story
- Intimate, emotionally resonant visuals
- Soft, flattering lighting
- Warm, romantic color grading
- Two-shot compositions emphasizing connection
- Beautiful, aspirational settings`,

    story_historical: `
PURPOSE: Historical Story
- Period-accurate production design
- Natural, era-appropriate lighting
- Authentic costumes and settings
- Painterly, classical compositions
- Cultural and historical authenticity`,

    story_animation: `
PURPOSE: Animated Story
- Bold, expressive character designs
- Vibrant, stylized color palettes
- Dynamic, exaggerated compositions
- Clear silhouettes and staging
- Imaginative, fantastical environments`,
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
6. Focus ONLY on visual elements: subjects, lighting, textures, colors, camera angles, atmosphere
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
- Focus EXCLUSIVELY on visual elements: subjects, lighting, textures, colors, camera angles, atmosphere.
- If Global Subject is provided, it MUST be the primary focus. Restate its key identifiers explicitly (face, hair, outfit, materials) so the subject stays 100% consistent across scenes.
- If the subject is a person, use consistent descriptors.
- Ensure the prompt STARTS with the subject name or a concrete description of it.
- Keep length 70–130 words for maximum detail.
- Use specific visual descriptors (e.g., "amber light", "weathered oak", "muted teal") rather than generic phrases.

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
 * Refine an image prompt and return a partial ImageStyleGuide via AI.
 * The AI fills in structured fields (mood, lighting, background, composition, etc.)
 * based on the raw prompt text + style + subject context.
 *
 * Existing `refineImagePrompt()` callers are unaffected — only `imageService.ts`
 * uses this guide variant.
 */
export const refineImagePromptAsGuide = async (params: {
  promptText: string;
  style?: string;
  globalSubject?: string;
  aspectRatio?: string;
  intent?: PromptRefinementIntent;
  previousPrompts?: string[];
}): Promise<{
  guide: Partial<ImageStyleGuide>;
  issues: PromptLintIssue[];
}> => {
  const {
    promptText,
    style = "Cinematic",
    globalSubject = "",
    aspectRatio = "16:9",
    intent = "auto",
    previousPrompts = [],
  } = params;

  const issues = lintPrompt({ promptText, globalSubject, previousPrompts });

  const shouldRefine =
    intent !== "auto" ||
    issues.some(
      (i) =>
        i.code === "too_short" ||
        i.code === "repetitive" ||
        i.code === "missing_subject",
    );

  if (!shouldRefine) {
    // Return a minimal guide with just the scene text populated
    return { guide: { scene: promptText.trim() }, issues };
  }

  const issueSummary =
    issues.length > 0
      ? issues.map((i) => `- (${i.code}) ${i.message}`).join("\n")
      : "- (none)";

  const guide = await withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODELS.TEXT,
      contents: `You are a prompt engineer for high-quality image generation.
Refine the user's prompt into structured fields for a JSON style guide.

Global Subject: ${globalSubject || "(none)"}
Style Preset: ${style}
Aspect Ratio: ${aspectRatio}
User Intent: ${intent}
Detected Issues:
${issueSummary}

Requirements:
- Output a JSON object with these optional fields:
  scene (string), mood (string), background (string),
  lighting (object with source, quality, direction),
  composition (object with shot_type, camera_angle, framing),
  camera (object with lens, depth_of_field, focus),
  color_palette (array of strings),
  textures (array of strings),
  effects (array of strings).
- Only include fields where you can meaningfully improve the prompt.
- The "scene" field should be a vivid, specific rewrite of the user's prompt (70-130 words).
- If Global Subject is provided, ensure it is the primary focus in the scene.
- Be specific with visual descriptors.

User Prompt:
${promptText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scene: { type: Type.STRING },
            mood: { type: Type.STRING },
            background: { type: Type.STRING },
            lighting: {
              type: Type.OBJECT,
              properties: {
                source: { type: Type.STRING },
                quality: { type: Type.STRING },
                direction: { type: Type.STRING },
              },
            },
            composition: {
              type: Type.OBJECT,
              properties: {
                shot_type: { type: Type.STRING },
                camera_angle: { type: Type.STRING },
                framing: { type: Type.STRING },
              },
            },
            camera: {
              type: Type.OBJECT,
              properties: {
                lens: { type: Type.STRING },
                depth_of_field: { type: Type.STRING },
                focus: { type: Type.STRING },
              },
            },
            color_palette: { type: Type.ARRAY, items: { type: Type.STRING } },
            textures: { type: Type.ARRAY, items: { type: Type.STRING } },
            effects: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) return { scene: promptText.trim() } as Partial<ImageStyleGuide>;

    try {
      return JSON.parse(jsonStr) as Partial<ImageStyleGuide>;
    } catch {
      return { scene: promptText.trim() } as Partial<ImageStyleGuide>;
    }
  });

  return { guide, issues };
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
 *
 * Returns a `MotionPromptResult` with separate `camera_motion` and `subject_physics`
 * fields plus a pre-joined `combined` string for single-string APIs.
 */
export const generateMotionPrompt = async (
  imagePrompt: string,
  mood: string = "cinematic",
  globalSubject: string = "",
): Promise<MotionPromptResult> => {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODELS.TEXT,
      contents: `You are a professional video director creating motion instructions for animating a still image.

STATIC IMAGE DESCRIPTION:
${imagePrompt}

MOOD: ${mood}

${globalSubject ? `MAIN SUBJECT (keep stationary/subtle movement only): ${globalSubject}` : ""}

TASK: Generate TWO separate motion descriptions (≤25 words each):
1. camera_motion — Camera ONLY: movement type, direction, speed (e.g. "slow push-in", "gentle pan left", "static with parallax depth")
2. subject_physics — Environment/subject ONLY: wind, particles, light, cloth, water (e.g. "leaves gently swaying", "candle flame flickering", "fog drifting")

RULES:
- Keep the main subject relatively static (subtle breathing, blinking, hair movement only)
- camera_motion must describe ONLY camera behaviour — no environment or subject action
- subject_physics must describe ONLY environment/subject physical motion — no camera references
- The animation is only 1-2 seconds, so describe subtle, looping motion
- NO scene changes, NO new elements, NO action sequences
- Use present continuous tense

OUTPUT: Return JSON with fields "camera_motion" and "subject_physics"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            camera_motion: { type: Type.STRING },
            subject_physics: { type: Type.STRING },
          },
          required: ["camera_motion", "subject_physics"],
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) {
      const camera_motion = `slow cinematic push-in`;
      const subject_physics = `gentle ${mood} atmospheric movement`;
      return { camera_motion, subject_physics, combined: `${camera_motion}. ${subject_physics}` };
    }

    try {
      const parsed = JSON.parse(jsonStr) as { camera_motion: string; subject_physics: string };
      const camera_motion = parsed.camera_motion || `slow camera movement`;
      const subject_physics = parsed.subject_physics || `subtle ${mood} atmosphere`;
      return { camera_motion, subject_physics, combined: `${camera_motion}. ${subject_physics}` };
    } catch {
      const camera_motion = `slow cinematic camera movement`;
      const subject_physics = `${mood} ambiance with gentle environmental motion`;
      return { camera_motion, subject_physics, combined: `${camera_motion}. ${subject_physics}` };
    }
  });
};

/**
 * Compress a long image generation prompt into a concise keyword-first form.
 *
 * Story-mode shots can exceed 200 words after persona + style + character injection.
 * Long prompts cause "instruction dilution" where models ignore later details.
 * This compressor front-loads the critical visual elements (subject → action →
 * lighting → mood → style) and trims to ≤80 words.
 *
 * Short prompts (≤100 words) are returned unchanged to avoid unnecessary API calls.
 * All errors fall back to the original prompt — this is a non-fatal enhancement.
 */
export const compressPromptForGeneration = async (prompt: string): Promise<string> => {
  if (countWords(prompt) <= 100) return prompt;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.TEXT,
      contents: `Rewrite the following image generation prompt into comma-separated visual keywords.
Max 80 words. Front-load: subject → action/pose → lighting → mood → style keyword.
Preserve: main subject, key action, lighting quality, mood, one style keyword.
Drop: filler, repeated adjectives, verbose background descriptions.
Output ONLY the rewritten prompt as a single comma-separated line.

PROMPT:
${prompt}`,
      config: { temperature: 0.1 },
    });

    const compressed = response.text?.trim();
    if (!compressed || compressed.length < 20) return prompt;
    if (countWords(compressed) >= countWords(prompt)) return prompt;

    return compressed;
  } catch {
    return prompt;
  }
};
