/**
 * Prompt Service — Purpose guidance and prompt generation instructions
 */

import { CAMERA_ANGLES, LIGHTING_MOODS, VideoPurpose } from "../../../constants";

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

export const getPromptGenerationInstruction = (
  style: string,
  mode: "lyrics" | "story",
  content: string,
  globalSubject: string = "",
  purpose: VideoPurpose = "music_video",
) => {
  const { getStyleEnhancement } = require('../prompt/styleEnhancements');
  const { getSystemPersona } = require('../prompt/personaData');
  const styleData = getStyleEnhancement(style);
  const persona = getSystemPersona(purpose);

  const contentType = mode === "lyrics" ? "song lyrics" : "spoken-word/narrative transcript";
  const purposeGuidance = getPurposeGuidance(purpose);

  const richStyleBlock = `
ART STYLE: "${style}"
VISUAL GUIDELINES (MANDATORY - apply to ALL prompts):
${styleData.keywords.map((k: string) => `- ${k}`).join('\n')}
AESTHETIC GOAL: ${styleData.mediumDescription}`;

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

  const structureGuidance = mode === "lyrics"
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
