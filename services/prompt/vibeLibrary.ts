/**
 * Vibe Library
 *
 * Categorized vocabulary of 100+ vibe terms across 7 categories.
 * Used by the content planner to inject creative vocabulary into prompts,
 * and by the narrator to build rich Director's Notes.
 *
 * React-free — safe for Node.js usage.
 */

import type { InstructionTriplet } from "../../types";

export type VibeAxis = "emotion" | "cinematic" | "atmosphere";

export type VibeCategory =
  | "2026-tech"
  | "emotional-states"
  | "cinematic-styles"
  | "environmental-textures"
  | "cultural-moods"
  | "temporal-aesthetics"
  | "sonic-landscapes";

export interface VibeTerm {
  id: string;
  label: string;
  category: VibeCategory;
  axis: VibeAxis;
  promptFragment: string;
  compatiblePurposes?: string[];
}

export const VIBE_LIBRARY: VibeTerm[] = [
  // === 2026-tech ===
  { id: "liquid-glass", label: "Liquid Glass", category: "2026-tech", axis: "atmosphere", promptFragment: "translucent liquid-glass surfaces refracting ambient light" },
  { id: "neural-lace", label: "Neural Lace", category: "2026-tech", axis: "atmosphere", promptFragment: "thread-thin neural-lace filaments pulsing with data" },
  { id: "digital-distortion", label: "Digital Distortion", category: "2026-tech", axis: "cinematic", promptFragment: "glitch-scan digital distortion fragments across the frame" },
  { id: "holographic-decay", label: "Holographic Decay", category: "2026-tech", axis: "atmosphere", promptFragment: "holographic projections flickering and decaying at the edges" },
  { id: "quantum-shimmer", label: "Quantum Shimmer", category: "2026-tech", axis: "atmosphere", promptFragment: "quantum shimmer of probability fields warping visible light" },
  { id: "synthetic-bloom", label: "Synthetic Bloom", category: "2026-tech", axis: "cinematic", promptFragment: "synthetic bloom overexposure on chrome and glass surfaces" },
  { id: "data-rain", label: "Data Rain", category: "2026-tech", axis: "atmosphere", promptFragment: "cascading streams of luminous data-rain in the air" },
  { id: "circuit-veins", label: "Circuit Veins", category: "2026-tech", axis: "atmosphere", promptFragment: "circuit-vein patterns glowing beneath translucent skin" },
  { id: "pixel-erosion", label: "Pixel Erosion", category: "2026-tech", axis: "cinematic", promptFragment: "edges of reality dissolving into pixel erosion" },
  { id: "chrome-reflection", label: "Chrome Reflection", category: "2026-tech", axis: "cinematic", promptFragment: "hyper-sharp chrome reflections warping the surrounding environment" },
  { id: "void-static", label: "Void Static", category: "2026-tech", axis: "atmosphere", promptFragment: "void-static interference bleeding through the visual plane" },
  { id: "bio-luminescent-tech", label: "Bio-Luminescent Tech", category: "2026-tech", axis: "atmosphere", promptFragment: "bio-luminescent technology pulsing with organic rhythms" },
  { id: "signal-decay", label: "Signal Decay", category: "2026-tech", axis: "cinematic", promptFragment: "signal decay artifacts and noise distorting the broadcast" },

  // === emotional-states ===
  { id: "visceral-dread", label: "Visceral Dread", category: "emotional-states", axis: "emotion", promptFragment: "a gut-punch of visceral dread, breath caught in the throat", compatiblePurposes: ["horror_mystery", "storytelling"] },
  { id: "stoic-resignation", label: "Stoic Resignation", category: "emotional-states", axis: "emotion", promptFragment: "quiet stoic resignation, accepting what cannot be changed", compatiblePurposes: ["documentary", "storytelling"] },
  { id: "melancholy", label: "Melancholy", category: "emotional-states", axis: "emotion", promptFragment: "deep melancholy weighing on every syllable", compatiblePurposes: ["storytelling", "documentary", "music_video"] },
  { id: "euphoric-wonder", label: "Euphoric Wonder", category: "emotional-states", axis: "emotion", promptFragment: "breathless euphoric wonder at the impossible made real", compatiblePurposes: ["travel", "motivational", "documentary"] },
  { id: "bittersweet-longing", label: "Bittersweet Longing", category: "emotional-states", axis: "emotion", promptFragment: "bittersweet longing for what was and what might have been", compatiblePurposes: ["storytelling", "music_video"] },
  { id: "seething-rage", label: "Seething Rage", category: "emotional-states", axis: "emotion", promptFragment: "barely contained seething rage beneath a calm surface", compatiblePurposes: ["storytelling", "horror_mystery"] },
  { id: "cold-detachment", label: "Cold Detachment", category: "emotional-states", axis: "emotion", promptFragment: "clinical cold detachment, observing without feeling", compatiblePurposes: ["documentary", "news_report"] },
  { id: "nostalgic-warmth", label: "Nostalgic Warmth", category: "emotional-states", axis: "emotion", promptFragment: "gentle nostalgic warmth, like sunlight through old glass", compatiblePurposes: ["storytelling", "documentary", "travel"] },
  { id: "feral-joy", label: "Feral Joy", category: "emotional-states", axis: "emotion", promptFragment: "wild feral joy, untamed and unashamed" },
  { id: "hollow-grief", label: "Hollow Grief", category: "emotional-states", axis: "emotion", promptFragment: "hollow grief echoing in an empty chest", compatiblePurposes: ["storytelling"] },
  { id: "electric-anticipation", label: "Electric Anticipation", category: "emotional-states", axis: "emotion", promptFragment: "electric anticipation crackling before the reveal", compatiblePurposes: ["commercial", "social_short"] },
  { id: "quiet-defiance", label: "Quiet Defiance", category: "emotional-states", axis: "emotion", promptFragment: "quiet defiance, refusing to bend or break", compatiblePurposes: ["motivational", "storytelling"] },
  { id: "sacred-awe", label: "Sacred Awe", category: "emotional-states", axis: "emotion", promptFragment: "sacred awe in the presence of something vast", compatiblePurposes: ["documentary", "travel"] },
  { id: "paranoid-unease", label: "Paranoid Unease", category: "emotional-states", axis: "emotion", promptFragment: "creeping paranoid unease, something is watching", compatiblePurposes: ["horror_mystery"] },

  // === cinematic-styles ===
  { id: "dutch-angle", label: "Dutch Angle", category: "cinematic-styles", axis: "cinematic", promptFragment: "tilted dutch angle creating visual unease and disorientation" },
  { id: "anamorphic-flare", label: "Anamorphic Flare", category: "cinematic-styles", axis: "cinematic", promptFragment: "horizontal anamorphic lens flares streaking across frame" },
  { id: "chiaroscuro-lighting", label: "Chiaroscuro", category: "cinematic-styles", axis: "cinematic", promptFragment: "chiaroscuro lighting with sharp contrast between shadow and light" },
  { id: "slow-push-in", label: "Slow Push-In", category: "cinematic-styles", axis: "cinematic", promptFragment: "gradual slow push-in building focus and intensity" },
  { id: "tracking-shot", label: "Tracking Shot", category: "cinematic-styles", axis: "cinematic", promptFragment: "fluid tracking shot following the subject through space" },
  { id: "handheld-float", label: "Handheld Float", category: "cinematic-styles", axis: "cinematic", promptFragment: "subtle handheld float adding organic documentary realism" },
  { id: "dolly-zoom", label: "Dolly Zoom", category: "cinematic-styles", axis: "cinematic", promptFragment: "vertigo dolly-zoom warping perspective and depth" },
  { id: "static-tripod", label: "Static Tripod", category: "cinematic-styles", axis: "cinematic", promptFragment: "locked-off static tripod stillness, letting the scene breathe" },
  { id: "crane-reveal", label: "Crane Reveal", category: "cinematic-styles", axis: "cinematic", promptFragment: "sweeping crane reveal lifting to expose the full landscape" },
  { id: "whip-pan", label: "Whip Pan", category: "cinematic-styles", axis: "cinematic", promptFragment: "energetic whip-pan snapping between subjects" },
  { id: "rack-focus", label: "Rack Focus", category: "cinematic-styles", axis: "cinematic", promptFragment: "deliberate rack-focus shifting attention between planes" },
  { id: "overhead-god-shot", label: "Overhead God Shot", category: "cinematic-styles", axis: "cinematic", promptFragment: "overhead god-shot viewing the scene from directly above" },
  { id: "low-angle-power", label: "Low Angle Power", category: "cinematic-styles", axis: "cinematic", promptFragment: "low angle shot conveying dominance and towering presence" },
  { id: "extreme-closeup", label: "Extreme Close-Up", category: "cinematic-styles", axis: "cinematic", promptFragment: "extreme close-up isolating a single detail or micro-expression" },
  { id: "pull-back-reveal", label: "Pull-Back Reveal", category: "cinematic-styles", axis: "cinematic", promptFragment: "slow pull-back reveal expanding from detail to full context" },

  // === environmental-textures ===
  { id: "ethereal-echo", label: "Ethereal Echo", category: "environmental-textures", axis: "atmosphere", promptFragment: "ethereal echo reverberating through vast empty spaces" },
  { id: "foggy-ruins", label: "Foggy Ruins", category: "environmental-textures", axis: "atmosphere", promptFragment: "thick fog rolling through crumbling ancient ruins" },
  { id: "desert-silence", label: "Desert Silence", category: "environmental-textures", axis: "atmosphere", promptFragment: "absolute desert silence, only the wind and shifting sand" },
  { id: "neon-rain", label: "Neon Rain", category: "environmental-textures", axis: "atmosphere", promptFragment: "neon-rain reflecting a thousand colors off wet asphalt" },
  { id: "server-room-hum", label: "Server Room Hum", category: "environmental-textures", axis: "atmosphere", promptFragment: "steady server-room hum of machines processing in the dark" },
  { id: "cathedral-reverb", label: "Cathedral Reverb", category: "environmental-textures", axis: "atmosphere", promptFragment: "cathedral reverb amplifying every whisper into grandeur" },
  { id: "jungle-steam", label: "Jungle Steam", category: "environmental-textures", axis: "atmosphere", promptFragment: "tropical jungle steam rising from rain-soaked canopy floor" },
  { id: "frozen-lake", label: "Frozen Lake", category: "environmental-textures", axis: "atmosphere", promptFragment: "frozen lake surface cracking under pressure, vast white expanse" },
  { id: "underground-drip", label: "Underground Drip", category: "environmental-textures", axis: "atmosphere", promptFragment: "underground cavern with echoing water drips in darkness" },
  { id: "burning-embers", label: "Burning Embers", category: "environmental-textures", axis: "atmosphere", promptFragment: "glowing embers drifting upward from smoldering remains" },
  { id: "salt-flats", label: "Salt Flats", category: "environmental-textures", axis: "atmosphere", promptFragment: "endless salt flats merging earth and sky at the horizon" },
  { id: "abandoned-factory", label: "Abandoned Factory", category: "environmental-textures", axis: "atmosphere", promptFragment: "abandoned factory with rusted machinery and shafts of dusty light" },
  { id: "coral-reef-glow", label: "Coral Reef Glow", category: "environmental-textures", axis: "atmosphere", promptFragment: "bioluminescent coral reef glowing beneath dark ocean water" },
  { id: "volcanic-ash", label: "Volcanic Ash", category: "environmental-textures", axis: "atmosphere", promptFragment: "volcanic ash drifting through air, muting colors and sound" },

  // === cultural-moods ===
  { id: "middle-eastern-dusk", label: "Middle Eastern Dusk", category: "cultural-moods", axis: "atmosphere", promptFragment: "warm Middle Eastern dusk, call to prayer echoing over rooftops", compatiblePurposes: ["documentary", "storytelling", "travel"] },
  { id: "nordic-frost", label: "Nordic Frost", category: "cultural-moods", axis: "atmosphere", promptFragment: "stark Nordic frost landscape under pale winter light", compatiblePurposes: ["documentary", "storytelling"] },
  { id: "tokyo-neon-night", label: "Tokyo Neon Night", category: "cultural-moods", axis: "atmosphere", promptFragment: "dense Tokyo neon night, electric signs reflecting in rain", compatiblePurposes: ["commercial", "social_short"] },
  { id: "mediterranean-gold", label: "Mediterranean Gold", category: "cultural-moods", axis: "atmosphere", promptFragment: "sun-drenched Mediterranean gold on whitewashed walls", compatiblePurposes: ["travel", "documentary"] },
  { id: "andean-altitude", label: "Andean Altitude", category: "cultural-moods", axis: "atmosphere", promptFragment: "high Andean altitude, thin air and vast mountain panoramas", compatiblePurposes: ["travel", "documentary"] },
  { id: "saharan-mirage", label: "Saharan Mirage", category: "cultural-moods", axis: "atmosphere", promptFragment: "Saharan mirage shimmering on the horizon, heat distortion", compatiblePurposes: ["documentary", "storytelling"] },
  { id: "amazonian-canopy", label: "Amazonian Canopy", category: "cultural-moods", axis: "atmosphere", promptFragment: "dense Amazonian canopy filtering green-gold light", compatiblePurposes: ["documentary", "travel"] },
  { id: "tibetan-monastery", label: "Tibetan Monastery", category: "cultural-moods", axis: "atmosphere", promptFragment: "serene Tibetan monastery perched above clouds at dawn", compatiblePurposes: ["documentary", "motivational"] },

  // === temporal-aesthetics ===
  { id: "golden-hour-decay", label: "Golden Hour Decay", category: "temporal-aesthetics", axis: "cinematic", promptFragment: "fading golden hour light casting long shadows as day dies" },
  { id: "midnight-blue", label: "Midnight Blue", category: "temporal-aesthetics", axis: "cinematic", promptFragment: "deep midnight blue wash over every surface, moonlight only" },
  { id: "twilight-liminal", label: "Twilight Liminal", category: "temporal-aesthetics", axis: "cinematic", promptFragment: "twilight liminal hour where day and night coexist" },
  { id: "pre-dawn-grey", label: "Pre-Dawn Grey", category: "temporal-aesthetics", axis: "cinematic", promptFragment: "pre-dawn grey light, world not yet awake, flat and quiet" },
  { id: "overcast-flat", label: "Overcast Flat", category: "temporal-aesthetics", axis: "cinematic", promptFragment: "overcast flat diffused light eliminating all shadows" },
  { id: "harsh-noon", label: "Harsh Noon", category: "temporal-aesthetics", axis: "cinematic", promptFragment: "harsh noon sun creating deep overhead shadows and blown highlights" },
  { id: "magic-hour", label: "Magic Hour", category: "temporal-aesthetics", axis: "cinematic", promptFragment: "magic hour warm glow painting everything in amber and rose" },
  { id: "blue-hour-mystery", label: "Blue Hour Mystery", category: "temporal-aesthetics", axis: "cinematic", promptFragment: "blue hour mystery, deep saturated blues before full darkness" },

  // === sonic-landscapes ===
  { id: "tension-drone", label: "Tension Drone", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "low-frequency tension drone building beneath the surface", compatiblePurposes: ["horror_mystery", "storytelling"] },
  { id: "whisper-static", label: "Whisper Static", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "barely audible whisper-static, like voices behind a wall", compatiblePurposes: ["horror_mystery"] },
  { id: "heartbeat-pulse", label: "Heartbeat Pulse", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "rhythmic heartbeat pulse driving the pace of the scene", compatiblePurposes: ["horror_mystery", "storytelling"] },
  { id: "wind-chime-decay", label: "Wind Chime Decay", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "distant wind-chime decay fading into silence" },
  { id: "industrial-grind", label: "Industrial Grind", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "harsh industrial grind of metal on metal" },
  { id: "choir-swell", label: "Choir Swell", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "ethereal choir swell rising to fill the space with voices", compatiblePurposes: ["motivational", "documentary"] },
  { id: "rain-on-metal", label: "Rain on Metal", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "staccato rain-on-metal percussion in an open structure" },
  { id: "deep-ocean-pressure", label: "Deep Ocean Pressure", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "deep ocean pressure, muffled and immense in the abyss" },
  { id: "crackling-fire", label: "Crackling Fire", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "intimate crackling fire casting dancing orange light" },
  { id: "distant-thunder", label: "Distant Thunder", category: "sonic-landscapes", axis: "atmosphere", promptFragment: "distant rolling thunder promising storms on the horizon" },
];

/**
 * Scenario templates with suggested triplets per narrative arc beat.
 */
export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  arcBeats: Array<{
    beat: string;
    suggestedTriplet: InstructionTriplet;
  }>;
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: "ghost-protocol",
    name: "The Ghost Protocol",
    description: "A mystery unraveling in abandoned or haunted spaces, building from unease to revelation.",
    arcBeats: [
      { beat: "Setup", suggestedTriplet: { primaryEmotion: "paranoid-unease", cinematicDirection: "handheld-float", environmentalAtmosphere: "foggy-ruins" } },
      { beat: "Discovery", suggestedTriplet: { primaryEmotion: "electric-anticipation", cinematicDirection: "slow-push-in", environmentalAtmosphere: "underground-drip" } },
      { beat: "Confrontation", suggestedTriplet: { primaryEmotion: "visceral-dread", cinematicDirection: "dutch-angle", environmentalAtmosphere: "tension-drone" } },
      { beat: "Revelation", suggestedTriplet: { primaryEmotion: "sacred-awe", cinematicDirection: "crane-reveal", environmentalAtmosphere: "cathedral-reverb" } },
    ],
  },
  {
    id: "silent-signal",
    name: "The Silent Signal",
    description: "A technological thriller about intercepting something that was never meant to be found.",
    arcBeats: [
      { beat: "Intercept", suggestedTriplet: { primaryEmotion: "cold-detachment", cinematicDirection: "static-tripod", environmentalAtmosphere: "server-room-hum" } },
      { beat: "Decode", suggestedTriplet: { primaryEmotion: "electric-anticipation", cinematicDirection: "extreme-closeup", environmentalAtmosphere: "whisper-static" } },
      { beat: "Chase", suggestedTriplet: { primaryEmotion: "seething-rage", cinematicDirection: "tracking-shot", environmentalAtmosphere: "neon-rain" } },
      { beat: "Transmission", suggestedTriplet: { primaryEmotion: "euphoric-wonder", cinematicDirection: "pull-back-reveal", environmentalAtmosphere: "data-rain" } },
    ],
  },
  {
    id: "desert-crossing",
    name: "The Desert Crossing",
    description: "An epic journey through desolation toward something transformative.",
    arcBeats: [
      { beat: "Departure", suggestedTriplet: { primaryEmotion: "quiet-defiance", cinematicDirection: "crane-reveal", environmentalAtmosphere: "desert-silence" } },
      { beat: "Ordeal", suggestedTriplet: { primaryEmotion: "stoic-resignation", cinematicDirection: "handheld-float", environmentalAtmosphere: "saharan-mirage" } },
      { beat: "Oasis", suggestedTriplet: { primaryEmotion: "nostalgic-warmth", cinematicDirection: "slow-push-in", environmentalAtmosphere: "middle-eastern-dusk" } },
      { beat: "Arrival", suggestedTriplet: { primaryEmotion: "sacred-awe", cinematicDirection: "pull-back-reveal", environmentalAtmosphere: "golden-hour-decay" } },
    ],
  },
  {
    id: "neon-descent",
    name: "Neon Descent",
    description: "A dive into a cyberpunk underworld, from surface glamour to hidden truth.",
    arcBeats: [
      { beat: "Surface", suggestedTriplet: { primaryEmotion: "electric-anticipation", cinematicDirection: "anamorphic-flare", environmentalAtmosphere: "tokyo-neon-night" } },
      { beat: "Descent", suggestedTriplet: { primaryEmotion: "paranoid-unease", cinematicDirection: "dolly-zoom", environmentalAtmosphere: "neon-rain" } },
      { beat: "Underworld", suggestedTriplet: { primaryEmotion: "visceral-dread", cinematicDirection: "chiaroscuro-lighting", environmentalAtmosphere: "industrial-grind" } },
      { beat: "Emergence", suggestedTriplet: { primaryEmotion: "feral-joy", cinematicDirection: "whip-pan", environmentalAtmosphere: "neural-lace" } },
    ],
  },
];

/**
 * Get vibe terms filtered by axis and optionally by video purpose.
 */
export function getVibeTerms(axis?: VibeAxis, purpose?: string): VibeTerm[] {
  let terms = VIBE_LIBRARY;

  if (axis) {
    terms = terms.filter(t => t.axis === axis);
  }

  if (purpose) {
    terms = terms.filter(t =>
      !t.compatiblePurposes || t.compatiblePurposes.includes(purpose)
    );
  }

  return terms;
}

/**
 * Look up vibe terms in the library and return their prompt fragments
 * for a given InstructionTriplet.
 */
export function tripletToPromptFragments(triplet: InstructionTriplet): {
  emotionFragment: string;
  cinematicFragment: string;
  atmosphereFragment: string;
} {
  const emotionTerm = VIBE_LIBRARY.find(t => t.id === triplet.primaryEmotion);
  const cinematicTerm = VIBE_LIBRARY.find(t => t.id === triplet.cinematicDirection);
  const atmosphereTerm = VIBE_LIBRARY.find(t => t.id === triplet.environmentalAtmosphere);

  return {
    emotionFragment: emotionTerm?.promptFragment ?? triplet.primaryEmotion,
    cinematicFragment: cinematicTerm?.promptFragment ?? triplet.cinematicDirection,
    atmosphereFragment: atmosphereTerm?.promptFragment ?? triplet.environmentalAtmosphere,
  };
}
