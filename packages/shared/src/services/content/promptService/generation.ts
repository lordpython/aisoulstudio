/**
 * Prompt Service — AI-powered prompt generation, refinement, video prompts, and compression
 */

import { Type } from "@google/genai";
import { ImagePrompt } from "../../../types";
import { parseSRTTimestamp } from "../../../utils/srtParser";
import { ai, MODELS, withRetry } from "../../shared/apiClient";
import { VideoPurpose } from "../../../constants";
import type { ImageStyleGuide } from "../../prompt/imageStyleGuide";
import { countWords } from "../../utils/textProcessing";
import { enhanceImagePrompt } from "../../media/deapiPromptService";
import { lintPrompt, PromptLintIssue, PromptRefinementIntent, MotionPromptResult } from "./linting";
import { getPromptGenerationInstruction } from "./purposeGuidance";
import { contentLogger } from '../../infrastructure/logger';

const log = contentLogger.child('PromptGen');

interface PromptResponseItem {
  text: string;
  mood: string;
  timestamp: string;
}

// --- Internal helpers ---

async function refineImagePromptWithAI(params: {
  promptText: string;
  style: string;
  globalSubject?: string;
  aspectRatio?: string;
  intent?: PromptRefinementIntent;
  issues?: PromptLintIssue[];
}): Promise<string> {
  const { promptText, style, globalSubject = "", aspectRatio = "16:9", intent = "auto", issues = [] } = params;

  const issueSummary = issues.length > 0
    ? issues.map(i => `- (${i.code}) ${i.message}`).join("\n")
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
        properties: { prompt: { type: Type.STRING } },
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

// --- Exported functions ---

const generatePromptsInternal = async (
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
        contents: getPromptGenerationInstruction(style, mode, srtContent, globalSubject, purpose),
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
      return parsed.prompts.map((p, index) => ({
        text: p.text,
        mood: p.mood,
        timestamp: p.timestamp,
        id: `prompt-${Date.now()}-${index}`,
        timestampSeconds: parseSRTTimestamp(p.timestamp) ?? 0,
      }));
    } catch (error) {
      log.error('Prompt generation error', error);
      return [];
    }
  });
};

export const generatePromptsFromLyrics = (
  srtContent: string,
  style: string = "Cinematic",
  globalSubject: string = "",
  purpose: VideoPurpose = "music_video",
) => generatePromptsInternal(srtContent, style, "lyrics", globalSubject, purpose);

export const generatePromptsFromStory = (
  srtContent: string,
  style: string = "Cinematic",
  globalSubject: string = "",
  purpose: VideoPurpose = "documentary",
) => generatePromptsInternal(srtContent, style, "story", globalSubject, purpose);

export const refineImagePrompt = async (params: {
  promptText: string;
  style?: string;
  globalSubject?: string;
  aspectRatio?: string;
  intent?: PromptRefinementIntent;
  previousPrompts?: string[];
}): Promise<{ refinedPrompt: string; issues: PromptLintIssue[] }> => {
  const { promptText, style = "Cinematic", globalSubject = "", aspectRatio = "16:9", intent = "auto", previousPrompts = [] } = params;

  const issues = lintPrompt({ promptText, globalSubject, previousPrompts });

  const shouldRefine = intent !== "auto" || issues.some(i => i.code === "too_short" || i.code === "repetitive" || i.code === "missing_subject");

  if (!shouldRefine) return { refinedPrompt: promptText.trim(), issues };

  const geminiRefined = await withRetry(async () =>
    refineImagePromptWithAI({ promptText, style, globalSubject, aspectRatio, intent, issues })
  );

  const refinedPrompt = await enhanceImagePrompt(geminiRefined);
  return { refinedPrompt, issues };
};

export const refineImagePromptAsGuide = async (params: {
  promptText: string;
  style?: string;
  globalSubject?: string;
  aspectRatio?: string;
  intent?: PromptRefinementIntent;
  previousPrompts?: string[];
}): Promise<{ guide: Partial<ImageStyleGuide>; issues: PromptLintIssue[] }> => {
  const { promptText, style = "Cinematic", globalSubject = "", aspectRatio = "16:9", intent = "auto", previousPrompts = [] } = params;

  const issues = lintPrompt({ promptText, globalSubject, previousPrompts });

  const shouldRefine = intent !== "auto" || issues.some(i => i.code === "too_short" || i.code === "repetitive" || i.code === "missing_subject");

  if (!shouldRefine) return { guide: { scene: promptText.trim() }, issues };

  const issueSummary = issues.length > 0 ? issues.map(i => `- (${i.code}) ${i.message}`).join("\n") : "- (none)";

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
            lighting: { type: Type.OBJECT, properties: { source: { type: Type.STRING }, quality: { type: Type.STRING }, direction: { type: Type.STRING } } },
            composition: { type: Type.OBJECT, properties: { shot_type: { type: Type.STRING }, camera_angle: { type: Type.STRING }, framing: { type: Type.STRING } } },
            camera: { type: Type.OBJECT, properties: { lens: { type: Type.STRING }, depth_of_field: { type: Type.STRING }, focus: { type: Type.STRING } } },
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
          properties: { videoPrompt: { type: Type.STRING } },
          required: ["videoPrompt"],
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) return `${style} shot: ${sceneDescription}. Smooth camera movement, professional lighting, cinematic composition. ${mood} atmosphere with environmental details.`;

    try {
      const parsed = JSON.parse(jsonStr) as { videoPrompt: string };
      if (parsed.videoPrompt && parsed.videoPrompt.length > 50) return parsed.videoPrompt;
      return `${style} shot: ${sceneDescription}. Smooth camera movement, professional lighting. ${mood} mood.`;
    } catch {
      return `${style}: ${sceneDescription}. Cinematic quality, ${mood} lighting.`;
    }
  });
};

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
