/**
 * Director Service — Storyboarder agent (analysis → image prompts)
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { VideoPurpose, CAMERA_ANGLES, LIGHTING_MOODS } from "../../../constants";
import { getPurposeGuidance, getSystemPersona, getStyleEnhancement, injectMasterStyle } from "../promptService";
import { GEMINI_API_KEY, MODELS, withRetry } from "../../shared/apiClient";
import { contentLogger } from '../../infrastructure/logger';

import {
  AnalysisOutput,
  StoryboardSchema,
  StoryboardOutput,
  DirectorConfig,
  DirectorServiceError,
  LANGCHAIN_VERBOSE,
  createModel,
} from "./schemas";

const log = contentLogger.child('Storyboarder');

export type StoryboardProgressCallback = (progress: {
  stage: "generating" | "complete";
  partialResult?: Partial<StoryboardOutput>;
  finalResult?: StoryboardOutput;
}) => void;

function createStoryboarderTemplate(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    ["system", `{personaInstructions}

ART STYLE: {style}
{styleEnhancement}

{purposeGuidance}

GLOBAL SUBJECT: {globalSubject}
{subjectGuidance}

CRITICAL: If a GLOBAL SUBJECT is provided, you MUST use it as the main subject in almost every scene. Don't wander away from the subject.

VISUAL SCENES (ART-DIRECTED FOUNDATIONS):
{visualScenes}

YOUR ROLE AS STORYBOARDER:
The Analyzer has provided art-directed visual scene foundations. Your job is to:
1. USE these scenes as the backbone of your storyboard
2. ENHANCE each visualPrompt with additional cinematic details (depth, motion hints, micro-textures)
3. INTERPOLATE between scenes - create transitional frames that maintain visual continuity
4. EXPAND the visual language - if a scene shows "golden light", carry that through nearby scenes
5. MAINTAIN the subjectContext - keep the subject/figure consistent across scenes

DO NOT:
- Ignore the visualScenes and create entirely new concepts
- Contradict the subjectContext (if it's about a prophet, don't show a robot)
- Change the emotional tone without narrative reason

INTERPOLATION GUIDELINES:
- If you have fewer visualScenes than targetAssetCount, create transitional scenes between them
- Transitional scenes should maintain subject consistency while varying camera angle/lighting
- Use the emotionalTone field to guide the mood of interpolated scenes

AVAILABLE CAMERA ANGLES: {cameraAngles}
AVAILABLE LIGHTING MOODS: {lightingMoods}

CONTENT ANALYSIS:
{analysis}

=== VISUAL DESCRIPTION REQUIREMENTS ===

Your prompts must be PURE VISUAL DESCRIPTIONS suitable for photorealistic image generation.
Focus EXCLUSIVELY on these elements:

1. SUBJECT (MANDATORY FIRST ELEMENT):
   Start every prompt with a concrete, tangible subject:
   "A bearded man with weathered skin...", "A thick white candle...", "Weathered hands with calloused fingers..."

2. PHYSICAL DETAILS:
   - Materials: leather, wood grain, polished metal, rough stone, flowing silk
   - Textures: cracked, smooth, glistening, dusty, rain-slicked, velvet
   - Colors: specific hues (amber, slate grey, crimson, muted teal)

3. LIGHTING (REQUIRED):
   Every prompt must specify lighting:
   - Direction: backlighting, side lighting, overhead, rim light
   - Quality: soft diffused, harsh direct, dappled through leaves, golden hour warmth
   - Source: single shaft of light, multiple practicals, ambient glow, fire flicker

4. CAMERA & COMPOSITION:
   - Shot type: extreme close-up, medium shot, wide establishing, over-the-shoulder
   - Angle: low angle looking up, eye level, bird's eye, Dutch angle
   - Depth: shallow focus with bokeh, deep focus, rack focus point

5. ATMOSPHERE & ENVIRONMENT:
   - Particles: dust motes, smoke wisps, rain droplets, floating embers
   - Weather: overcast, golden hour, blue hour, stormy
   - Setting details: crumbling walls, polished floors, overgrown paths

6. MOTION HINTS (for video generation):
   - Camera: "slow dolly forward", "gentle crane up", "steady tracking left"
   - Environmental: "smoke drifting", "curtains billowing", "leaves falling"

=== QUALITY GUIDELINES ===

- Be SPECIFIC: "warm amber light filtering through dusty air" NOT "beautiful lighting"
- Be CINEMATIC: Think like a cinematographer describing a single film frame
- Be TACTILE: Include at least one texture that viewers could imagine touching
- Be CONSISTENT: Maintain subject appearance across scenes
- VARY COMPOSITIONS: Never repeat the same camera angle in consecutive scenes

=== EMOTIONAL ARC GUIDANCE ===

- Opening scenes (1-2): Establish mood with wide shots, environmental context
- Building scenes (3-5): Medium shots, character/subject focus, increasing detail
- Peak scenes (6-8): Dynamic angles, intimate close-ups, maximum visual intensity
- Resolution scenes (9+): Pull back, contemplative wide shots, fading light

=== OUTPUT REQUIREMENTS (CRITICAL - READ CAREFULLY) ===

Generate EXACTLY {targetAssetCount} prompts as a JSON object with a "prompts" array.

Each prompt object MUST have:
- "text": A COMPLETE visual description that is EXACTLY 60-120 words long
  ⚠️ MINIMUM 60 WORDS - shorter prompts will be rejected
  ⚠️ Every "text" field MUST start with a concrete, visible subject (person, object, place)
  ⚠️ Every "text" field MUST include: subject + setting + lighting + camera angle + atmosphere

  EXAMPLE of correct length (78 words):
  "A weathered merchant with sun-darkened skin and silver-streaked beard stands behind ancient bronze scales in a dusty marketplace stall, late afternoon golden light filtering through tattered canvas overhead, deep shadows pooling in the wooden stall corners, camera positioned at eye level capturing the intensity of his focused gaze, dust motes floating in amber light rays, worn leather pouch of coins on the counter, atmosphere of quiet dignity and timeless commerce"

- "mood": single word or short phrase for emotional tone
- "timestamp": MM:SS format, distributed across the content duration
- "negativePrompt" (optional): Elements to AVOID in this scene (e.g., "blurry, low quality, text overlay, watermark, modern objects")

Also include a top-level "globalNegativePrompt" string — elements to avoid in ALL scenes.
Common global negatives: "blurry, low resolution, text, watermark, logo, deformed, disfigured, bad anatomy, extra limbs, duplicate, cropped"

DO NOT output short phrases like "a somber tone" or "by a steady hand" - these are INVALID.
Each "text" must be a COMPLETE, DETAILED scene description.`],
    ["human", `Create the visual storyboard based on the analysis provided. Generate exactly {targetAssetCount} prompts.

CRITICAL: Each prompt "text" field MUST be 60-120 words. Count your words. Short fragments will be rejected.

Use the visualScenes as foundations and enhance them with full cinematic detail including: subject, setting, lighting direction, camera angle, atmospheric elements, and textures.`],
  ]);
}

export function createStoryboarderChain(config?: DirectorConfig) {
  const model = createModel(config).withStructuredOutput(StoryboardSchema, {
    name: "storyboard",
  });
  const template = createStoryboarderTemplate();
  return template.pipe(model);
}

function buildStoryboarderInput(
  analysis: AnalysisOutput,
  style: string,
  videoPurpose: VideoPurpose,
  globalSubject: string,
  targetAssetCount: number
) {
  const persona = getSystemPersona(videoPurpose);
  const personaInstructions = `You are ${persona.name}, a ${persona.role}.

YOUR CORE RULE:
${persona.coreRule}

YOUR VISUAL PRINCIPLES:
${persona.visualPrinciples.map((p: string) => `- ${p}`).join('\n')}

WHAT TO AVOID:
${persona.avoidList.map((a: string) => `- ${a}`).join('\n')}`;

  const styleData = getStyleEnhancement(style);
  const styleEnhancement = `MEDIUM AUTHENTICITY (apply these characteristics):
${styleData.keywords.map((k: string) => `- ${k}`).join('\n')}
Overall: ${styleData.mediumDescription}`;

  const purposeGuidance = getPurposeGuidance(videoPurpose);
  const subjectGuidance = globalSubject.trim()
    ? `Keep this subject's appearance consistent across scenes.`
    : `Create cohesive scenes with consistent environmental elements.`;

  const visualScenes = analysis.visualScenes && analysis.visualScenes.length > 0
    ? analysis.visualScenes.map((scene, i) =>
        `SCENE ${i + 1} [${scene.timestamp}] - ${scene.emotionalTone}:
      Subject: ${scene.subjectContext}
      Visual: ${scene.visualPrompt}`
      ).join('\n\n')
    : "No visual scenes provided - create cinematic scenes based on themes and emotional arc.";

  return {
    style,
    personaInstructions,
    styleEnhancement,
    purposeGuidance,
    globalSubject: globalSubject || "None specified",
    subjectGuidance,
    visualScenes,
    cameraAngles: CAMERA_ANGLES.join(", "),
    lightingMoods: LIGHTING_MOODS.join(", "),
    analysis: JSON.stringify(analysis, null, 2),
    targetAssetCount,
  };
}

// --- Prompt Quality Scoring ---

interface PromptScore {
  index: number;
  total: number;
  wordCount: number;
  hasSubject: boolean;
  hasLighting: boolean;
  hasCamera: boolean;
  pass: boolean;
}

const LIGHTING_KEYWORDS = /\b(light|lighting|lit|shadow|glow|ray|beam|backlight|rim\s*light|golden\s*hour|blue\s*hour|ambient|candle|fire|sun|moon|neon|lamp|torch|dawn|dusk|overcast|diffused|harsh|soft\s*light)\b/i;
const CAMERA_KEYWORDS = /\b(close-up|wide\s*shot|medium\s*shot|establishing|tracking|dolly|crane|pan|tilt|low\s*angle|high\s*angle|bird.s\s*eye|dutch\s*angle|over-the-shoulder|pov|aerial|bokeh|shallow\s*focus|deep\s*focus|extreme\s*close)/i;
const SUBJECT_KEYWORDS = /^(a |an |the |two |three |\w+ed |\w+ing )/i;

function scorePrompt(text: string, index: number): PromptScore {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const hasSubject = SUBJECT_KEYWORDS.test(text.trim());
  const hasLighting = LIGHTING_KEYWORDS.test(text);
  const hasCamera = CAMERA_KEYWORDS.test(text);

  // Score: word count (0-40), subject (0-20), lighting (0-20), camera (0-20)
  const wcScore = Math.min(40, Math.round((wordCount / 60) * 40));
  const total = wcScore + (hasSubject ? 20 : 0) + (hasLighting ? 20 : 0) + (hasCamera ? 20 : 0);

  return { index, total, wordCount, hasSubject, hasLighting, hasCamera, pass: total >= 50 };
}

export async function runStoryboarder(
  analysis: AnalysisOutput,
  style: string,
  videoPurpose: VideoPurpose,
  globalSubject: string = "",
  config?: DirectorConfig
): Promise<StoryboardOutput> {
  const targetAssetCount = config?.targetAssetCount || 10;
  const chain = createStoryboarderChain(config);
  const input = buildStoryboarderInput(analysis, style, videoPurpose, globalSubject, targetAssetCount);

  const result = await withRetry(() => chain.invoke(input), 2, 2000);

  if (result.prompts) {
    result.prompts = result.prompts.map(prompt => ({
      ...prompt,
      text: injectMasterStyle(prompt.text, style)
    }));

    // Score all prompts
    const scores = result.prompts.map((p, i) => scorePrompt(p.text || '', i));
    const failedIndices = scores.filter(s => !s.pass);

    scores.forEach(s => {
      log.debug(`  Prompt ${s.index + 1}: ${s.total}/100 (${s.wordCount}w, subj:${s.hasSubject}, light:${s.hasLighting}, cam:${s.hasCamera}) ${s.pass ? 'PASS' : 'FAIL'}`);
    });

    // Selective retry: only re-generate failed prompts
    if (failedIndices.length > 0 && config?.maxRetries && config.maxRetries > 0) {
      log.info(`${failedIndices.length}/${scores.length} prompts below quality threshold. Retrying full batch...`);
      const retryConfig = { ...config, maxRetries: config.maxRetries - 1 };

      try {
        const retryResult = await runStoryboarder(analysis, style, videoPurpose, globalSubject, retryConfig);
        const retryScores = retryResult.prompts?.map((p, i) => scorePrompt(p.text || '', i)) ?? [];
        const retryFailCount = retryScores.filter(s => !s.pass).length;

        if (retryFailCount < failedIndices.length) {
          log.info(`Retry improved quality: ${failedIndices.length} → ${retryFailCount} failures`);
          return retryResult;
        } else {
          log.warn(`Retry did not improve (${retryFailCount} failures), keeping original`);
        }
      } catch (retryError) {
        log.warn('Retry failed', retryError);
      }
    }

    if (failedIndices.length > 0) {
      log.warn(`Final result: ${failedIndices.length} prompts below quality threshold`);
    }
  }

  return result;
}

export async function streamStoryboarder(
  analysis: AnalysisOutput,
  style: string,
  videoPurpose: VideoPurpose,
  globalSubject: string = "",
  onProgress?: StoryboardProgressCallback,
  config?: DirectorConfig
): Promise<StoryboardOutput> {
  const targetAssetCount = config?.targetAssetCount || 10;
  const mergedConfig = { model: MODELS.TEXT, temperature: 0.7, maxRetries: 2, targetAssetCount: 10, ...config };

  const model = new ChatGoogleGenerativeAI({
    apiKey: GEMINI_API_KEY,
    model: mergedConfig.model,
    temperature: mergedConfig.temperature,
    maxOutputTokens: 65536,
    verbose: LANGCHAIN_VERBOSE,
  }).withStructuredOutput(StoryboardSchema, { name: "storyboard" });

  const template = createStoryboarderTemplate();
  const chain = template.pipe(model);
  const input = buildStoryboarderInput(analysis, style, videoPurpose, globalSubject, targetAssetCount);

  // Accumulate streamed chunks - each chunk may be a partial delta
  const accumulated: Partial<StoryboardOutput> = {};
  onProgress?.({ stage: "generating" });

  try {
    const stream = await chain.stream(input);
    for await (const chunk of stream) {
      const partial = chunk as Partial<StoryboardOutput>;
      // Merge prompts array instead of overwriting
      if (partial.prompts && partial.prompts.length > 0) {
        accumulated.prompts = [...(accumulated.prompts ?? []), ...partial.prompts];
        onProgress?.({
          stage: "generating",
          partialResult: { prompts: accumulated.prompts },
        });
      }
      // Merge other fields (globalNegativePrompt, etc.)
      if (partial.globalNegativePrompt) {
        accumulated.globalNegativePrompt = partial.globalNegativePrompt;
      }
    }

    const result = accumulated as StoryboardOutput;

    if (!result.prompts || result.prompts.length === 0) {
      throw new DirectorServiceError(
        "Streaming produced no prompts",
        "OUTPUT_PARSING_FAILED",
        "storyboarder"
      );
    }

    result.prompts = result.prompts.map(prompt => ({
      ...prompt,
      text: injectMasterStyle(prompt.text, style)
    }));

    onProgress?.({ stage: "complete", finalResult: result });
    return result;
  } catch (error) {
    log.error('Stream: Structured output failed', error);

    throw new DirectorServiceError(
      `Failed to stream storyboard: ${error instanceof Error ? error.message : String(error)}`,
      "OUTPUT_PARSING_FAILED",
      "storyboarder"
    );
  }
}
