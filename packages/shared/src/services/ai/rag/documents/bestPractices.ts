/**
 * Video Production Best Practices
 * 
 * Guidelines and best practices for video production.
 * Used by the knowledge base for RAG (Retrieval-Augmented Generation).
 */

export interface BestPractice {
  title: string;
  content: string;
  keywords: string[];
}

export const BEST_PRACTICES: Record<string, BestPractice> = {
  pacing: {
    title: "Video Pacing Guidelines",
    content: `
# Video Pacing Best Practices

## Duration Guidelines

### 30-Second Videos
**Purpose:** Quick, punchy content for social media
- 3-4 scenes maximum
- Fast cuts and high energy
- Single, clear message
- Hook in first 2 seconds
- Strong call-to-action at end

**Scene Duration:**
- 6-8 seconds per scene
- No scene longer than 10 seconds
- Quick transitions

**Best For:**
- Social media ads
- Product teasers
- Quick tips
- Announcements

### 60-Second Videos
**Purpose:** Standard format for most content
- 5-7 scenes
- Moderate pacing
- 2-3 key points
- Introduction, body, conclusion

**Scene Duration:**
- 8-12 seconds per scene
- Minimum 5 seconds (enough to register)
- Maximum 15 seconds (before attention wanes)

**Best For:**
- Explainer videos
- Product demos
- Social media content
- Brand stories

### 90-Second Videos
**Purpose:** Detailed exploration with breathing room
- 8-10 scenes
- Allow time for information absorption
- Full story arc
- Multiple supporting points

**Scene Duration:**
- 9-13 seconds per scene
- Can have longer establishing shots
- Vary lengths for rhythm

**Best For:**
- Tutorials
- Case studies
- Detailed explanations
- Narrative content

### 180-Second Videos (3 minutes)
**Purpose:** Comprehensive, in-depth content
- 12-15 scenes
- Detailed exploration
- Multiple examples
- Full narrative structure

**Scene Duration:**
- 10-15 seconds per scene
- Longer scenes for complex information
- Strategic pacing variations

**Best For:**
- Educational content
- Documentaries
- Detailed tutorials
- Thought leadership

## Scene Duration Principles

**Minimum Duration: 5 seconds**
- Anything shorter doesn't register
- Viewer needs time to process
- Exception: rapid montages

**Sweet Spot: 8-12 seconds**
- Comfortable viewing time
- Enough for information absorption
- Maintains engagement

**Maximum Duration: 20 seconds**
- Beyond this, attention wanes
- Break into multiple scenes
- Exception: establishing shots or key moments

## Transition Guidelines

### Fast Cuts
**When to Use:**
- High energy content
- Action sequences
- Montages
- Building excitement

**Timing:**
- 0.5-1 second transitions
- Quick fades or cuts
- Minimal transition effects

### Smooth Transitions
**When to Use:**
- Calm, reflective content
- Scene changes in same location
- Related content flow
- Professional presentations

**Timing:**
- 1-2 second transitions
- Crossfades or dissolves
- Smooth, unobtrusive

### Dramatic Transitions
**When to Use:**
- Major topic shifts
- Time passage
- Location changes
- Emotional shifts

**Timing:**
- 2-3 second transitions
- Fade to black
- Wipes or special effects
- Music cues

## Rhythm and Flow

### Building Tension
- Start with longer scenes
- Gradually shorten scene duration
- Increase cut frequency
- Build to climax

### Releasing Tension
- Slow down after climax
- Longer, calmer scenes
- Gentle transitions
- Resolution and conclusion

### Maintaining Interest
- Vary scene lengths
- Mix wide and close shots
- Alternate pacing
- Strategic pauses

## Matching Pacing to Music

### Fast Tempo (120+ BPM)
- Quick cuts on beat
- High energy scenes
- Short scene durations
- Rhythmic editing

### Medium Tempo (80-120 BPM)
- Standard pacing
- Cuts on major beats
- Balanced scene lengths
- Natural flow

### Slow Tempo (<80 BPM)
- Longer scenes
- Gentle transitions
- Contemplative pacing
- Emotional resonance

## Common Pacing Mistakes

**Too Fast:**
- Viewer can't process information
- Feels chaotic and overwhelming
- Important details missed
- Exhausting to watch

**Too Slow:**
- Viewer loses interest
- Feels boring and dragging
- Attention wanders
- Drop-off increases

**Inconsistent:**
- Confusing rhythm
- Unclear intent
- Jarring experience
- Unprofessional feel

## Platform-Specific Considerations

### Social Media (Instagram, TikTok)
- Front-load hook (first 2 seconds)
- Fast pacing throughout
- 15-30 second optimal length
- Vertical format considerations

### YouTube
- Longer form acceptable
- Can build gradually
- 60-180 seconds common
- Retention metrics important

### Professional/Corporate
- Measured, professional pace
- Clear information hierarchy
- 60-120 seconds typical
- Quality over speed
    `,
    keywords: [
      "pacing",
      "duration",
      "timing",
      "rhythm",
      "transitions",
      "scene length",
      "tempo",
      "flow",
      "editing",
    ],
  },

  narration: {
    title: "Narration Best Practices",
    content: `
# Narration Guidelines

## Voice Selection

### Professional Voice
**Characteristics:**
- Authoritative and clear
- Measured delivery
- Proper enunciation
- Neutral accent (or appropriate regional)

**Best For:**
- Corporate videos
- Educational content
- Documentaries
- Formal presentations

**Delivery Speed:** 140-160 words per minute

### Friendly Voice
**Characteristics:**
- Warm and conversational
- Approachable tone
- Natural inflection
- Relatable delivery

**Best For:**
- Tutorials
- Product demos
- Social media content
- Brand storytelling

**Delivery Speed:** 150-170 words per minute

### Dramatic Voice
**Characteristics:**
- Emotional and intense
- Dynamic range
- Theatrical delivery
- Strong emphasis

**Best For:**
- Movie trailers
- Dramatic content
- Storytelling
- Emotional appeals

**Delivery Speed:** 120-140 words per minute (with pauses)

### Calm Voice
**Characteristics:**
- Soothing and gentle
- Slow, measured pace
- Soft delivery
- Relaxing tone

**Best For:**
- Meditation content
- Relaxation videos
- ASMR
- Bedtime stories

**Delivery Speed:** 100-120 words per minute

## Script Writing for Voice-Over

### Write for the Ear, Not the Eye
- Use short sentences (10-15 words)
- Avoid complex sentence structures
- Use contractions naturally
- Write how people speak

**Bad:** "The utilization of this methodology facilitates optimization."
**Good:** "This method helps you optimize."

### Active Voice
- More engaging and direct
- Easier to understand
- Stronger impact

**Passive:** "The video was created by our team."
**Active:** "Our team created the video."

### Avoid Jargon
- Use simple, clear language
- Explain technical terms
- Consider audience knowledge level
- Define acronyms on first use

### Conversational Tone
- Use "you" and "we"
- Ask rhetorical questions
- Include natural pauses
- Sound human, not robotic

## Pacing and Delivery

### Words Per Minute Guidelines

**Slow (100-120 WPM):**
- Meditation, relaxation
- Complex technical content
- Emotional, dramatic moments
- Allows time for processing

**Standard (140-160 WPM):**
- Most professional content
- Educational videos
- Documentaries
- Comfortable listening pace

**Fast (160-180 WPM):**
- Energetic content
- Youth-oriented material
- Exciting announcements
- Time-constrained content

**Very Fast (180+ WPM):**
- Disclaimers (legal requirement)
- High-energy commercials
- Rapid-fire information
- Not recommended for main content

### Strategic Pauses

**Short Pause (0.5-1 second):**
- Between sentences
- After commas
- Natural breathing points

**Medium Pause (1-2 seconds):**
- Between paragraphs
- Topic transitions
- Before important points

**Long Pause (2-3 seconds):**
- Major section breaks
- Dramatic effect
- Allow visual focus
- Emotional moments

## Emphasis and Inflection

### Stress Key Words
- Emphasize important information
- Vary pitch for interest
- Use volume strategically
- Avoid monotone delivery

### Emotional Matching
- Match tone to content
- Convey appropriate emotion
- Authentic delivery
- Connect with audience

### Question Inflection
- Rising tone for questions
- Engage audience
- Create curiosity
- Prompt thinking

## Technical Considerations

### Audio Quality
- Professional microphone
- Quiet recording environment
- Pop filter for plosives
- Proper mic technique

### Recording Tips
- Warm up voice before recording
- Stay hydrated
- Maintain consistent distance from mic
- Record multiple takes
- Leave room for editing

### Post-Production
- Remove mouth clicks and breaths
- Normalize audio levels
- Add subtle compression
- EQ for clarity
- De-ess if needed

## Matching Narration to Visuals

### Sync Points
- Align narration with visual changes
- Match emphasis to key visuals
- Time pauses with transitions
- Coordinate with music

### Avoid Redundancy
- Don't describe what's obvious
- Add context and meaning
- Complement visuals
- Provide additional information

### Leave Space
- Allow visuals to breathe
- Not every moment needs narration
- Strategic silence is powerful
- Let music and visuals tell story

## Common Narration Mistakes

**Too Fast:**
- Audience can't keep up
- Information overload
- Feels rushed and stressful
- Reduces comprehension

**Too Slow:**
- Boring and tedious
- Audience loses interest
- Wastes time
- Feels condescending

**Monotone:**
- Lacks engagement
- Sounds robotic
- Loses audience attention
- No emotional connection

**Over-Emphasized:**
- Sounds fake and theatrical
- Distracting from content
- Loses credibility
- Annoying to listen to

**Poor Audio Quality:**
- Unprofessional
- Hard to understand
- Distracting
- Reduces trust

## Language and Localization

### English Narration
- Clear, neutral accent
- Proper pronunciation
- Standard grammar
- International comprehension

### Arabic Narration
- Modern Standard Arabic for formal
- Dialect consideration for casual
- Right-to-left text coordination
- Cultural sensitivity

### Multilingual Considerations
- Professional translation
- Native speaker review
- Cultural adaptation
- Timing adjustments for language length
    `,
    keywords: [
      "narration",
      "voice",
      "script",
      "audio",
      "delivery",
      "pacing",
      "voice-over",
      "speaking",
      "pronunciation",
    ],
  },

  camera: {
    title: "Camera Angles and Lighting",
    content: `
# Camera Angles and Lighting Best Practices

## Camera Angles

### Wide Establishing Shot
**Purpose:** Set context, show location, establish scale
**When to Use:**
- Opening scenes
- New locations
- Showing relationships between elements
- Creating sense of space

**Framing:**
- Show full environment
- Include horizon or reference points
- Consider rule of thirds
- Allow breathing room

### Medium Shot
**Purpose:** Main content delivery, balanced view
**When to Use:**
- Dialogue and narration
- Product demonstrations
- Most general content
- Comfortable viewing distance

**Framing:**
- Waist up for people
- Object with context
- Balanced composition
- Clear subject focus

### Close-Up
**Purpose:** Emphasis, emotion, detail
**When to Use:**
- Emotional moments
- Important details
- Product features
- Facial expressions

**Framing:**
- Fill frame with subject
- Minimal background
- Sharp focus
- Intimate feel

### Extreme Close-Up
**Purpose:** Intense detail, dramatic effect
**When to Use:**
- Product details
- Texture and craftsmanship
- Dramatic moments
- Artistic shots

**Framing:**
- Partial subject
- Abstract composition
- Macro detail
- Strong impact

### Low Angle
**Purpose:** Power, importance, dominance
**When to Use:**
- Hero shots
- Authority figures
- Impressive subjects
- Dramatic effect

**Effect:**
- Subject appears larger
- Commanding presence
- Viewer looks up
- Sense of awe

### High Angle
**Purpose:** Vulnerability, overview, context
**When to Use:**
- Showing layout
- Vulnerable moments
- Establishing geography
- Aerial views

**Effect:**
- Subject appears smaller
- Viewer looks down
- Comprehensive view
- God's eye perspective

### Dutch Angle (Tilted)
**Purpose:** Tension, unease, dynamism
**When to Use:**
- Action sequences
- Psychological tension
- Artistic expression
- Breaking monotony

**Effect:**
- Disorienting
- Dynamic energy
- Unconventional
- Attention-grabbing

### Over-the-Shoulder
**Purpose:** Conversation, perspective, immersion
**When to Use:**
- Dialogue scenes
- Point of view shots
- Interactive content
- Creating connection

**Framing:**
- Partial foreground subject
- Clear view of main subject
- Depth and dimension
- Relationship establishment

## Lighting Moods

### Golden Hour Warm
**Characteristics:**
- Soft, warm sunlight
- Long, gentle shadows
- Orange/golden tones
- Flattering on subjects

**Best For:**
- Outdoor scenes
- Romantic content
- Nostalgic feel
- Natural beauty

**Time:** 1 hour after sunrise, 1 hour before sunset

### Cool Blue Moonlight
**Characteristics:**
- Blue color temperature
- Mysterious atmosphere
- Soft shadows
- Ethereal quality

**Best For:**
- Night scenes
- Mysterious content
- Calm, contemplative mood
- Fantasy elements

**Technique:** Blue gels or color grading

### Dramatic Chiaroscuro
**Characteristics:**
- Strong contrast
- Defined shadows
- Directional light
- Sculptural quality

**Best For:**
- Dramatic content
- Film noir style
- Artistic expression
- Intense emotions

**Technique:** Single strong light source, minimal fill

### Soft Diffused Overcast
**Characteristics:**
- Even, soft light
- Minimal shadows
- Gentle, flattering
- Natural feel

**Best For:**
- Interviews
- Product photography
- Gentle, calm content
- Consistent lighting

**Technique:** Overcast day or large diffusers

### Harsh Midday Sun
**Characteristics:**
- Strong, direct light
- Hard shadows
- High contrast
- Challenging for subjects

**Best For:**
- Desert scenes
- Harsh environments
- Specific artistic intent
- Generally avoid for people

**Technique:** Use reflectors or fill light to soften

### Neon-Lit Urban Glow
**Characteristics:**
- Colorful artificial light
- Cyberpunk aesthetic
- Mixed color temperatures
- Modern, edgy feel

**Best For:**
- Urban content
- Tech videos
- Modern, trendy content
- Night cityscapes

**Technique:** Practical neon lights or colored gels

### Candlelit Warmth
**Characteristics:**
- Warm, flickering light
- Intimate atmosphere
- Soft, romantic
- Historical feel

**Best For:**
- Romantic scenes
- Historical content
- Intimate moments
- Cozy atmosphere

**Technique:** Actual candles or warm, dimmed lights

### Silhouette Backlighting
**Characteristics:**
- Subject in shadow
- Bright background
- Dramatic outline
- Mysterious identity

**Best For:**
- Dramatic reveals
- Anonymous subjects
- Artistic expression
- Sunset scenes

**Technique:** Expose for background, subject in shadow

### Foggy Haze
**Characteristics:**
- Diffused, atmospheric
- Reduced contrast
- Dreamy quality
- Depth through layers

**Best For:**
- Mysterious content
- Fantasy elements
- Atmospheric scenes
- Depth creation

**Technique:** Fog machine or natural fog

### Studio Three-Point
**Characteristics:**
- Professional setup
- Controlled lighting
- Even, flattering
- Clean look

**Best For:**
- Interviews
- Product videos
- Professional content
- Consistent quality

**Technique:** Key light, fill light, back light

## Combining Angles and Lighting

### Cinematic Combination
- Wide establishing with golden hour
- Medium shots with soft diffused
- Close-ups with dramatic chiaroscuro
- Varied angles for visual interest

### Documentary Combination
- Natural lighting throughout
- Mix of wide and medium shots
- Authentic, unmanipulated feel
- Consistent lighting approach

### Dramatic Combination
- Low angles with dramatic lighting
- High contrast chiaroscuro
- Dutch angles for tension
- Silhouettes and shadows

### Professional Combination
- Eye-level medium shots
- Studio three-point lighting
- Clean, consistent look
- Minimal artistic interpretation
    `,
    keywords: [
      "camera",
      "angles",
      "lighting",
      "cinematography",
      "framing",
      "composition",
      "mood",
      "atmosphere",
    ],
  },
};
