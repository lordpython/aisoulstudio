/**
 * Director Service — Storyboarder agent (analysis → image prompts)
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { VideoPurpose, CAMERA_ANGLES, LIGHTING_MOODS } from "../../../constants";
import { getPurposeGuidance, getSystemPersona, getStyleEnhancement, injectMasterStyle } from "../promptService";
import { GEMINI_API_KEY, MODELS } from "../../shared/apiClient";
import {
  AnalysisOutput,
  StoryboardSchema,
  StoryboardOutput,
  DirectorConfig,
  DirectorServiceError,
  LANGCHAIN_VERBOSE,
  createModel,
} from "./schemas";

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

  const result = await chain.invoke(input);

  if (result.prompts) {
    console.log("[Storyboarder] Raw output prompt lengths:");
    result.prompts.forEach((p, i) => {
      const wordCount = p.text?.split(/\s+/).filter(Boolean).length || 0;
      const isFragment = wordCount < 30;
      console.log(`  Prompt ${i + 1}: ${wordCount} words ${isFragment ? "⚠️ FRAGMENT" : "✓"}`);
      if (isFragment && p.text) {
        console.log(`    Preview: "${p.text.substring(0, 80)}..."`);
      }
    });

    result.prompts = result.prompts.map(prompt => ({
      ...prompt,
      text: injectMasterStyle(prompt.text, style)
    }));
  }

  const shortPrompts = result.prompts?.filter(p => {
    const wordCount = p.text?.split(/\s+/).filter(Boolean).length || 0;
    return wordCount < 40;
  }) || [];

  if (shortPrompts.length > 0 && config?.maxRetries && config.maxRetries > 0) {
    console.log(`[Storyboarder] Found ${shortPrompts.length} short prompts (< 40 words). Retrying...`);
    const retryConfig = { ...config, targetAssetCount: Math.max(5, targetAssetCount - 2), maxRetries: config.maxRetries - 1 };

    try {
      const retryResult = await runStoryboarder(analysis, style, videoPurpose, globalSubject, retryConfig);
      const retryShortCount = retryResult.prompts?.filter(p => {
        const wordCount = p.text?.split(/\s+/).filter(Boolean).length || 0;
        return wordCount < 40;
      }).length || 0;

      if (retryShortCount === 0) {
        console.log(`[Storyboarder] Retry successful - all prompts meet 40-word minimum`);
        return retryResult;
      } else {
        console.warn(`[Storyboarder] Retry still has ${retryShortCount} short prompts, using original result`);
      }
    } catch (retryError) {
      console.warn(`[Storyboarder] Retry failed:`, retryError);
    }
  }

  if (shortPrompts.length > 0) {
    console.warn(`[Storyboarder] Final result contains ${shortPrompts.length} prompts under 40 words (quality may be reduced)`);
    shortPrompts.forEach((p, i) => {
      const wordCount = p.text?.split(/\s+/).filter(Boolean).length || 0;
      console.warn(`  Short prompt ${i + 1}: ${wordCount} words`);
    });
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
  });

  const template = createStoryboarderTemplate();
  const chain = template.pipe(model);
  const input = buildStoryboarderInput(analysis, style, videoPurpose, globalSubject, targetAssetCount);

  let fullContent = "";
  onProgress?.({ stage: "generating" });

  for await (const chunk of await chain.stream(input)) {
    const content = typeof chunk.content === "string"
      ? chunk.content
      : Array.isArray(chunk.content)
        ? chunk.content.map((c: unknown) => typeof c === "string" ? c : "").join("")
        : "";

    fullContent += content;

    try {
      const promptMatches = fullContent.match(/"text"\s*:\s*"[^"]+"/g);
      if (promptMatches && promptMatches.length > 0) {
        onProgress?.({
          stage: "generating",
          partialResult: {
            prompts: promptMatches.map(() => ({ text: "...", mood: "...", timestamp: "..." })),
          },
        });
      }
    } catch {
      // Ignore partial parsing errors
    }
  }

  try {
    let jsonStr = fullContent.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);
    const result = StoryboardSchema.parse(parsed);

    if (result.prompts) {
      result.prompts = result.prompts.map(prompt => ({
        ...prompt,
        text: injectMasterStyle(prompt.text, style)
      }));
    }

    onProgress?.({ stage: "complete", finalResult: result });
    return result;
  } catch (error) {
    console.error("[Storyboarder Stream] Failed to parse final result:", error);
    console.error("[Storyboarder Stream] Raw content:", fullContent);
    throw new DirectorServiceError(
      `Failed to parse storyboard output: ${error instanceof Error ? error.message : String(error)}`,
      "OUTPUT_PARSING_FAILED",
      "storyboarder"
    );
  }
}
