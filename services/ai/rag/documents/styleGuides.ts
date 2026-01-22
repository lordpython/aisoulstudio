/**
 * Video Style Guides
 * 
 * Comprehensive guides for different video production styles.
 * Used by the knowledge base for RAG (Retrieval-Augmented Generation).
 */

export interface StyleGuide {
  title: string;
  content: string;
  keywords: string[];
}

export const STYLE_GUIDES: Record<string, StyleGuide> = {
  cinematic: {
    title: "Cinematic Style Guide",
    content: `
# Cinematic Video Style

## Visual Characteristics
Cinematic videos evoke the feeling of professional film production with carefully composed shots and dramatic visual storytelling.

**Key Visual Elements:**
- Wide establishing shots to set context and location
- Dramatic lighting with strong contrast (golden hour, chiaroscuro)
- Slow, deliberate camera movements (pans, tilts, tracking shots)
- Color grading with teal/orange tones or desaturated looks
- Depth of field effects to isolate subjects
- Lens flares and atmospheric elements
- Professional composition following rule of thirds

## Best Use Cases
- Documentary-style content
- Narrative storytelling
- Emotional or dramatic content
- Professional presentations
- Brand videos
- Educational content requiring gravitas

## Pacing Guidelines
**60-second videos:**
- 5-7 scenes total
- 8-12 seconds per scene
- Allow breathing room between scenes
- Build emotional arc gradually

**90-second videos:**
- 8-10 scenes total
- 9-11 seconds per scene
- More time for establishing shots
- Can develop complex narratives

**180-second videos:**
- 12-15 scenes total
- 10-15 seconds per scene
- Full story arc with setup, conflict, resolution
- Time for character development

## Camera Angles and Movement
**Establishing Shots:**
- Wide aerial/drone views for scale
- Landscape shots to set location
- Cityscape or environment overview

**Main Content:**
- Medium shots for dialogue and action
- Close-ups for emotional moments
- Over-the-shoulder for conversations
- Low angles for power and importance
- High angles for vulnerability

**Movement:**
- Slow push-ins for emphasis
- Tracking shots following subjects
- Smooth pans revealing information
- Static shots for contemplation

## Lighting Moods
**Golden Hour Warm:**
- Soft, warm sunlight
- Long shadows
- Romantic, nostalgic feel
- Best for outdoor scenes

**Dramatic Chiaroscuro:**
- Strong contrast between light and dark
- Defined shadows
- Mysterious, intense mood
- Indoor or controlled lighting

**Soft Diffused:**
- Overcast or filtered light
- Minimal shadows
- Gentle, calm atmosphere
- Interviews and talking heads

**Cool Blue Moonlight:**
- Night scenes or early morning
- Blue color temperature
- Mysterious, contemplative mood

## Narration Style
- Authoritative, measured delivery
- Professional voice talent
- Clear enunciation
- Emotional resonance matching visuals
- Pauses for dramatic effect
- 140-160 words per minute

## Common Mistakes to Avoid
- Too many quick cuts (breaks cinematic flow)
- Harsh midday lighting (unflattering)
- Shaky handheld footage (unless intentional)
- Over-saturated colors (looks amateur)
- Mismatched audio quality
- Inconsistent color grading between scenes
    `,
    keywords: [
      "cinematic",
      "dramatic",
      "professional",
      "documentary",
      "film",
      "movie",
      "storytelling",
      "emotional",
      "golden hour",
      "depth of field",
    ],
  },

  anime: {
    title: "Anime Style Guide",
    content: `
# Anime Video Style

## Visual Characteristics
Anime-style videos embrace the bold, expressive aesthetic of Japanese animation with vibrant colors and dynamic compositions.

**Key Visual Elements:**
- Bold outlines and cel-shaded appearance
- Vibrant, saturated colors with high contrast
- Exaggerated expressions and movements
- Dynamic action poses and angles
- Speed lines and impact frames
- Stylized backgrounds (often simplified)
- Dramatic lighting with strong shadows
- Particle effects and visual flourishes

## Best Use Cases
- Action-oriented content
- Youth-targeted material
- Fantasy and sci-fi topics
- Gaming-related videos
- Energetic product launches
- Tutorial content for younger audiences
- Music videos with high energy
- Explainer videos with personality

## Pacing Guidelines
**30-second videos:**
- 4-5 scenes with fast cuts
- 6-7 seconds per scene
- High energy throughout
- Single clear message

**60-second videos:**
- 6-8 scenes with dynamic pacing
- 7-10 seconds per scene
- Build to climactic moment
- Multiple action beats

**90-second videos:**
- 9-12 scenes
- 7-10 seconds per scene
- Can include slower moments for contrast
- Full story arc with setup and payoff

## Camera Angles and Movement
**Dynamic Angles:**
- Dutch angles (tilted) for tension
- Extreme low angles for power
- High angles for vulnerability
- Over-the-shoulder for confrontation

**Action Sequences:**
- Quick cuts between angles
- Close-ups on eyes and expressions
- Wide shots for full-body action
- POV shots for immersion

**Movement:**
- Fast pans and whip transitions
- Zoom-ins for emphasis
- Camera shake for impact
- Rotation for disorientation

## Color Palette
**Vibrant Primary:**
- Bold reds, blues, yellows
- High saturation
- Strong color blocking
- Complementary color schemes

**Neon Tech:**
- Cyan, magenta, purple
- Glowing effects
- Dark backgrounds with bright accents
- Cyberpunk aesthetic

**Pastel Soft:**
- Lighter, softer tones
- Slice-of-life feel
- Gentle, approachable mood
- School or everyday settings

## Visual Effects
- Speed lines for motion
- Impact stars and flashes
- Sweat drops and emotion symbols
- Background blur for focus
- Sparkles and shine effects
- Energy auras and glows
- Screen tones and patterns

## Narration Style
- Energetic, expressive delivery
- Varied pitch and tone
- Quick pacing (160-180 wpm)
- Emotional reactions
- Character voices if appropriate
- Sound effects integration

## Typography
- Bold, outlined text
- Manga-style speech bubbles
- Impact text for emphasis
- Vertical text for Japanese aesthetic
- Colorful, animated text
- Sound effect text (SFX)

## Common Mistakes to Avoid
- Dull, muted colors (breaks anime aesthetic)
- Slow, plodding pace (needs energy)
- Realistic proportions (embrace stylization)
- Static compositions (needs dynamism)
- Subtle expressions (go bold)
- Western animation style (maintain anime look)
    `,
    keywords: [
      "anime",
      "vibrant",
      "action",
      "youth",
      "dynamic",
      "energetic",
      "japanese",
      "manga",
      "colorful",
      "expressive",
    ],
  },

  documentary: {
    title: "Documentary Style Guide",
    content: `
# Documentary Video Style

## Visual Characteristics
Documentary-style videos prioritize authenticity, information, and credibility with a journalistic approach to visual storytelling.

**Key Visual Elements:**
- Realistic, authentic footage
- Natural lighting when possible
- Steady, professional camera work
- Informative graphics and text overlays
- Archival footage and photos
- Interview setups with proper framing
- B-roll footage supporting narration
- Maps, diagrams, and data visualizations

## Best Use Cases
- Educational content
- Historical topics
- Scientific explanations
- Investigative journalism
- Corporate training
- Social issues
- Biographical content
- How-to and tutorial videos

## Pacing Guidelines
**60-second videos:**
- 5-6 scenes with measured pace
- 10-12 seconds per scene
- Clear information hierarchy
- One main point with supporting details

**90-second videos:**
- 7-9 scenes
- 10-13 seconds per scene
- Allow time for information absorption
- Can introduce complexity

**180-second videos:**
- 12-15 scenes
- 12-15 seconds per scene
- Full exploration of topic
- Multiple perspectives or examples
- Conclusion and call-to-action

## Camera Angles and Movement
**Interview Setup:**
- Eye-level or slightly below
- Rule of thirds composition
- Clean background
- Proper headroom

**B-Roll:**
- Wide shots for context
- Medium shots for detail
- Close-ups for emphasis
- Smooth, motivated camera movement

**Archival Integration:**
- Ken Burns effect on photos
- Slow zooms and pans
- Proper attribution
- Quality restoration when needed

## Lighting
**Natural Light:**
- Window light for interviews
- Outdoor ambient light
- Authentic to location
- Minimal artificial enhancement

**Controlled Light:**
- Three-point lighting for interviews
- Soft, even illumination
- Avoid harsh shadows
- Professional but not theatrical

## Narration Style
- Clear, authoritative voice
- Professional tone
- Factual, informative delivery
- Well-researched content
- Proper pronunciation
- 140-160 words per minute
- Pauses for emphasis
- Conversational yet credible

## Graphics and Text
**Lower Thirds:**
- Name and title
- Location and date
- Source attribution
- Clean, readable fonts

**Data Visualization:**
- Charts and graphs
- Timelines
- Maps with annotations
- Statistics and numbers
- Infographics

**Text Overlays:**
- Key quotes
- Important facts
- Definitions
- Dates and locations

## Audio Design
- Clean dialogue recording
- Ambient sound for authenticity
- Subtle background music
- Sound effects for context
- Professional mixing
- Clear voice-over

## Research and Accuracy
- Fact-checking all claims
- Multiple sources
- Expert interviews
- Primary sources when possible
- Proper citations
- Balanced perspectives

## Common Mistakes to Avoid
- Shaky handheld footage (use stabilization)
- Poor audio quality (invest in good mics)
- Biased presentation (maintain objectivity)
- Information overload (pace revelations)
- Boring visuals (use varied B-roll)
- Unclear structure (outline clearly)
- Missing context (provide background)
    `,
    keywords: [
      "documentary",
      "educational",
      "informative",
      "factual",
      "authentic",
      "journalistic",
      "historical",
      "scientific",
      "interview",
      "research",
    ],
  },

  "oil-painting": {
    title: "Oil Painting Style Guide",
    content: `
# Oil Painting Video Style

## Visual Characteristics
Oil painting style videos emulate the rich, textured aesthetic of classical painted artwork with artistic interpretation.

**Key Visual Elements:**
- Painterly textures and brush strokes
- Rich, saturated colors
- Soft edges and blending
- Artistic interpretation over realism
- Classical composition
- Dramatic lighting (chiaroscuro)
- Timeless, elegant aesthetic
- Museum-quality presentation

## Best Use Cases
- Historical content
- Classical music videos
- Art history topics
- Literary adaptations
- Cultural heritage
- Biographical content about artists
- Romantic or poetic themes
- Luxury brand content

## Pacing Guidelines
**60-second videos:**
- 4-6 scenes
- 10-15 seconds per scene
- Slow, contemplative pace
- Allow time to appreciate visuals

**90-second videos:**
- 6-8 scenes
- 11-15 seconds per scene
- Gradual reveals
- Emotional build

**180-second videos:**
- 10-12 scenes
- 15-18 seconds per scene
- Full narrative development
- Rich visual storytelling

## Visual Techniques
**Composition:**
- Classical framing
- Golden ratio
- Balanced elements
- Depth through layers

**Color Palette:**
- Rich earth tones
- Deep shadows
- Warm highlights
- Harmonious color schemes

**Lighting:**
- Dramatic side lighting
- Soft, diffused highlights
- Deep, rich shadows
- Rembrandt lighting

## Narration Style
- Measured, refined delivery
- Literary language
- Poetic phrasing
- 120-140 words per minute
- Dramatic pauses
- Emotional resonance

## Common Mistakes to Avoid
- Modern, digital look (maintain painterly quality)
- Fast pacing (needs contemplation time)
- Harsh lighting (use soft, artistic light)
- Flat composition (create depth)
    `,
    keywords: [
      "oil painting",
      "artistic",
      "classical",
      "painterly",
      "elegant",
      "historical",
      "cultural",
      "museum",
      "fine art",
    ],
  },
};
