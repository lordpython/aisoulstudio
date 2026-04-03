/**
 * Director Service — Analyzer agent (content analysis → structured sections, arc, visual scenes)
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AnalysisSchema, AnalysisOutput, DirectorConfig, createModel } from "./schemas";

function createAnalyzerTemplate(contentType: "lyrics" | "story"): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    ["system", `You are a professional content analyst and ART DIRECTOR specializing in ${contentType} analysis.
Your task is to analyze the provided content and create art-directed VISUAL SCENES with full cinematic prompts.

CONTENT TYPE: ${contentType}

ANALYSIS REQUIREMENTS:

1. SECTIONS (REQUIRED): Divide the content into logical sections
   - For lyrics: intro, verse, pre-chorus, chorus, bridge, outro
   - For story: intro, key_point, transition, conclusion
   - Each section needs: name, startTimestamp (MM:SS), endTimestamp (MM:SS), type, emotionalIntensity (1-10)

2. EMOTIONAL ARC (REQUIRED): Identify the overall emotional journey
   - opening: The initial emotional state/mood
   - peak: The most intense emotional moment
   - resolution: How the emotion resolves at the end

3. THEMES: Identify 3-6 key visual themes

4. MOTIFS: Identify 2-4 recurring visual motifs for consistency

5. VISUAL SCENES (CRITICAL - ART DIRECTOR MODE):
   You are an ART DIRECTOR, not an object spotter. For each key moment in the content:

   A. IDENTIFY THE SUBJECT:
      - WHO is this about? (Historical figure, prophet, spiritual being, human archetype)
      - WHAT story is being told? (Journey, sacrifice, transformation, revelation)
      - WHEN in history/mythology does this take place?

   B. CRAFT A FULL VISUAL PROMPT (60-100 words) that includes:
      - SUBJECT: Start with the main figure/element (e.g., "A bearded prophet in flowing robes...")
      - SETTING: Where are they? (e.g., "...standing atop a windswept mountain...")
      - LIGHTING: Dramatic light direction (e.g., "...bathed in golden rays breaking through storm clouds...")
      - ATMOSPHERE: Environmental mood (e.g., "...mist swirling at his feet, ancient stone altar visible...")
      - COMPOSITION: Camera angle and framing (e.g., "...shot from below, emphasizing divine connection...")

   C. PROVIDE CONTEXT:
      - What does this scene represent in the larger narrative?
      - Why is this moment visually significant?

   Generate 5-10 visualScenes distributed across the content duration.

OUTPUT FORMAT:
Return a valid JSON object (NO markdown code blocks, NO backtick wrapper) with ALL these fields:
- "sections": array of section objects with name, startTimestamp, endTimestamp, type, emotionalIntensity
- "emotionalArc": object with opening, peak, resolution strings
- "themes": array of theme strings
- "motifs": array of motif strings (recurring visual elements for consistency)
- "visualScenes": array of objects with visualPrompt, subjectContext, timestamp, emotionalTone

CRITICAL RULES:
- ALL fields are REQUIRED - sections, emotionalArc, themes, motifs, visualScenes
- Each visualScene.visualPrompt MUST be 60-100 words with full artistic direction
- Timestamps MUST be in MM:SS format (e.g., "01:30")
- Return ONLY the JSON object, no markdown formatting
- If content has no clear sections, create at least one section covering the full duration`],
    ["human", `Analyze this content and return the complete JSON structure with sections, emotionalArc, themes, motifs, and visualScenes:

{content}`],
  ]);
}

export function createAnalyzerChain(contentType: "lyrics" | "story", config?: DirectorConfig) {
  const model = createModel(config).withStructuredOutput(AnalysisSchema, {
    name: "content_analysis",
  });
  const template = createAnalyzerTemplate(contentType);
  return template.pipe(model);
}

export async function runAnalyzer(
  content: string,
  contentType: "lyrics" | "story",
  config?: DirectorConfig
): Promise<AnalysisOutput> {
  const chain = createAnalyzerChain(contentType, config);

  try {
    const result = await chain.invoke({ content });

    if (result.visualScenes && result.visualScenes.length > 0) {
      console.log(`[Analyzer] Generated ${result.visualScenes.length} visual scenes:`);
      result.visualScenes.forEach((scene, i) => {
        const wordCount = scene.visualPrompt?.split(/\s+/).filter(Boolean).length || 0;
        const isFragment = wordCount < 30;
        console.log(`  Scene ${i + 1}: ${wordCount} words ${isFragment ? "⚠️ FRAGMENT" : "✓"} | Tone: ${scene.emotionalTone}`);
        if (isFragment && scene.visualPrompt) {
          console.log(`    Preview: "${scene.visualPrompt.substring(0, 80)}..."`);
        }
      });
    } else {
      console.warn("[Analyzer] No visualScenes generated - Storyboarder will create from scratch");
    }

    return result;
  } catch (error) {
    console.warn("[Analyzer] Parsing failed, attempting to provide defaults:", error);

    const defaultAnalysis: AnalysisOutput = {
      sections: [{
        name: "Full Content",
        startTimestamp: "00:00",
        endTimestamp: "03:00",
        type: contentType === "lyrics" ? "verse" : "key_point",
        emotionalIntensity: 5,
      }],
      emotionalArc: {
        opening: "Establishing mood",
        peak: "Emotional climax",
        resolution: "Conclusion",
      },
      themes: ["Visual storytelling", "Emotional journey"],
      motifs: ["Light and shadow", "Movement"],
      visualScenes: [],
    };

    return defaultAnalysis;
  }
}
