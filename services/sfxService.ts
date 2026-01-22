/**
 * SFX Service
 * 
 * Mood-based ambient sound effects for video production.
 * Generates or selects ambient audio based on scene mood, video purpose, and visual descriptions.
 * 
 * Features:
 * - Mood-based ambient sound selection
 * - Scene-specific SFX suggestions
 * - Transition sounds between scenes
 * - Background music recommendations
 */

import { Scene, EmotionalTone, AmbientSFX, SFXCategory, SceneSFXPlan, VideoSFXPlan } from "../types";
import { VideoPurpose } from "../constants";

// Re-export types that other modules need
export type { VideoSFXPlan, SceneSFXPlan, AmbientSFX };

// --- Ambient Sound Library ---

/**
 * Pre-defined ambient sound library organized by category and mood.
 * These can be replaced with actual audio URLs or generated on-demand.
 */
const AMBIENT_LIBRARY: AmbientSFX[] = [
  // === NATURE ===
  {
    id: "desert-wind",
    name: "Desert Wind",
    description: "Gentle wind blowing across sand dunes with occasional gusts",
    category: "nature",
    moods: ["calm", "dramatic", "professional"],
    keywords: ["desert", "sand", "dune", "sahara", "arabian", "wind", "dry"],
    duration: 0,
    suggestedVolume: 0.3,
  },
  {
    id: "desert-night",
    name: "Desert Night",
    description: "Quiet desert night with distant wind and subtle insect sounds",
    category: "nature",
    moods: ["calm", "dramatic"],
    keywords: ["desert", "night", "stars", "quiet", "peaceful", "arabian"],
    duration: 0,
    suggestedVolume: 0.25,
  },
  {
    id: "ocean-waves",
    name: "Ocean Waves",
    description: "Rhythmic ocean waves crashing on shore",
    category: "nature",
    moods: ["calm", "friendly", "professional"],
    keywords: ["ocean", "sea", "beach", "waves", "water", "coast", "shore"],
    duration: 0,
    suggestedVolume: 0.35,
  },
  {
    id: "forest-ambience",
    name: "Forest Ambience",
    description: "Birds chirping, leaves rustling, peaceful forest atmosphere",
    category: "nature",
    moods: ["calm", "friendly"],
    keywords: ["forest", "trees", "birds", "nature", "woods", "peaceful"],
    duration: 0,
    suggestedVolume: 0.3,
  },
  {
    id: "rain-gentle",
    name: "Gentle Rain",
    description: "Soft rain falling with occasional distant thunder",
    category: "weather",
    moods: ["calm", "dramatic"],
    keywords: ["rain", "storm", "water", "weather", "cozy"],
    duration: 0,
    suggestedVolume: 0.35,
  },
  {
    id: "thunderstorm",
    name: "Thunderstorm",
    description: "Heavy rain with thunder and lightning",
    category: "weather",
    moods: ["dramatic", "urgent"],
    keywords: ["storm", "thunder", "lightning", "rain", "dramatic", "intense"],
    duration: 0,
    suggestedVolume: 0.4,
  },
  {
    id: "wind-howling",
    name: "Howling Wind",
    description: "Strong wind howling through mountains or buildings",
    category: "weather",
    moods: ["dramatic", "urgent"],
    keywords: ["wind", "storm", "mountain", "cold", "winter", "harsh"],
    duration: 0,
    suggestedVolume: 0.35,
  },

  // === URBAN ===
  {
    id: "city-traffic",
    name: "City Traffic",
    description: "Urban traffic sounds with cars, horns, and city bustle",
    category: "urban",
    moods: ["professional", "urgent"],
    keywords: ["city", "urban", "traffic", "cars", "street", "downtown"],
    duration: 0,
    suggestedVolume: 0.25,
  },
  {
    id: "cafe-ambience",
    name: "Café Ambience",
    description: "Coffee shop atmosphere with quiet chatter and cups clinking",
    category: "urban",
    moods: ["friendly", "calm"],
    keywords: ["cafe", "coffee", "restaurant", "social", "cozy"],
    duration: 0,
    suggestedVolume: 0.2,
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Busy marketplace with vendors and crowd murmur",
    category: "urban",
    moods: ["friendly", "professional"],
    keywords: ["market", "bazaar", "souk", "crowd", "vendors", "busy"],
    duration: 0,
    suggestedVolume: 0.25,
  },

  // === SUPERNATURAL/MYSTERY ===
  {
    id: "eerie-ambience",
    name: "Eerie Ambience",
    description: "Unsettling atmospheric sounds with subtle drones",
    category: "supernatural",
    moods: ["dramatic"],
    keywords: ["horror", "scary", "ghost", "haunted", "mystery", "dark", "eerie"],
    duration: 0,
    suggestedVolume: 0.3,
  },
  {
    id: "mystical-drone",
    name: "Mystical Drone",
    description: "Ethereal, otherworldly ambient drone",
    category: "supernatural",
    moods: ["dramatic", "calm"],
    keywords: ["magic", "mystical", "fantasy", "ethereal", "spiritual", "ancient"],
    duration: 0,
    suggestedVolume: 0.25,
  },
  {
    id: "whispers",
    name: "Distant Whispers",
    description: "Faint, unintelligible whispers creating unease",
    category: "supernatural",
    moods: ["dramatic"],
    keywords: ["ghost", "spirit", "haunted", "whisper", "scary", "horror"],
    duration: 0,
    suggestedVolume: 0.15,
  },
  {
    id: "heartbeat",
    name: "Heartbeat",
    description: "Slow, tense heartbeat building suspense",
    category: "supernatural",
    moods: ["dramatic", "urgent"],
    keywords: ["tension", "suspense", "fear", "anxiety", "thriller"],
    duration: 0,
    suggestedVolume: 0.3,
  },

  // === TRANSITIONS ===
  {
    id: "whoosh-soft",
    name: "Soft Whoosh",
    description: "Gentle transition whoosh sound",
    category: "transition",
    moods: ["friendly", "calm", "professional"],
    keywords: ["transition", "change", "scene"],
    duration: 1,
    suggestedVolume: 0.4,
  },
  {
    id: "whoosh-dramatic",
    name: "Dramatic Whoosh",
    description: "Powerful cinematic whoosh for dramatic transitions",
    category: "transition",
    moods: ["dramatic", "urgent"],
    keywords: ["transition", "dramatic", "cinematic"],
    duration: 1.5,
    suggestedVolume: 0.5,
  },
  {
    id: "impact-deep",
    name: "Deep Impact",
    description: "Low, resonant impact sound for emphasis",
    category: "transition",
    moods: ["dramatic", "urgent"],
    keywords: ["impact", "hit", "dramatic", "emphasis"],
    duration: 2,
    suggestedVolume: 0.5,
  },
  {
    id: "shimmer",
    name: "Shimmer",
    description: "Magical shimmer/sparkle transition sound",
    category: "transition",
    moods: ["friendly", "calm"],
    keywords: ["magic", "sparkle", "transition", "light"],
    duration: 1.5,
    suggestedVolume: 0.35,
  },

  // === MUSICAL BEDS ===
  {
    id: "tension-drone",
    name: "Tension Drone",
    description: "Low, building tension musical bed",
    category: "musical",
    moods: ["dramatic", "urgent"],
    keywords: ["tension", "suspense", "thriller", "dark"],
    duration: 0,
    suggestedVolume: 0.2,
  },
  {
    id: "hopeful-pad",
    name: "Hopeful Pad",
    description: "Warm, uplifting ambient pad",
    category: "musical",
    moods: ["friendly", "calm"],
    keywords: ["hope", "positive", "uplifting", "warm", "inspiring"],
    duration: 0,
    suggestedVolume: 0.2,
  },
  {
    id: "epic-strings",
    name: "Epic Strings",
    description: "Cinematic string swell for dramatic moments",
    category: "musical",
    moods: ["dramatic"],
    keywords: ["epic", "cinematic", "dramatic", "emotional", "powerful"],
    duration: 0,
    suggestedVolume: 0.25,
  },
  {
    id: "middle-eastern",
    name: "Middle Eastern Ambience",
    description: "Traditional Middle Eastern musical atmosphere",
    category: "musical",
    moods: ["dramatic", "calm", "professional"],
    keywords: ["arabic", "middle east", "oriental", "traditional", "desert", "arabian"],
    duration: 0,
    suggestedVolume: 0.2,
  },
];

// --- Video Purpose to SFX Mapping ---

const PURPOSE_SFX_PREFERENCES: Record<VideoPurpose, {
  preferredCategories: SFXCategory[];
  transitionStyle: "soft" | "dramatic" | "none";
  useBackgroundMusic: boolean;
  masterVolume: number;
}> = {
  documentary: {
    preferredCategories: ["ambient", "nature", "urban"],
    transitionStyle: "soft",
    useBackgroundMusic: false,
    masterVolume: 0.3,
  },
  storytelling: {
    preferredCategories: ["ambient", "nature", "supernatural", "musical"],
    transitionStyle: "dramatic",
    useBackgroundMusic: true,
    masterVolume: 0.35,
  },
  horror_mystery: {
    preferredCategories: ["supernatural", "weather", "musical"],
    transitionStyle: "dramatic",
    useBackgroundMusic: true,
    masterVolume: 0.4,
  },
  music_video: {
    preferredCategories: ["musical", "ambient"],
    transitionStyle: "none",
    useBackgroundMusic: false,
    masterVolume: 0.2,
  },
  social_short: {
    preferredCategories: ["transition", "action"],
    transitionStyle: "dramatic",
    useBackgroundMusic: false,
    masterVolume: 0.4,
  },
  commercial: {
    preferredCategories: ["musical", "ambient"],
    transitionStyle: "soft",
    useBackgroundMusic: true,
    masterVolume: 0.25,
  },
  podcast_visual: {
    preferredCategories: ["ambient"],
    transitionStyle: "none",
    useBackgroundMusic: false,
    masterVolume: 0.15,
  },
  lyric_video: {
    preferredCategories: ["musical"],
    transitionStyle: "none",
    useBackgroundMusic: false,
    masterVolume: 0.2,
  },
  educational: {
    preferredCategories: ["ambient", "musical"],
    transitionStyle: "soft",
    useBackgroundMusic: true,
    masterVolume: 0.2,
  },
  travel: {
    preferredCategories: ["nature", "ambient", "urban"],
    transitionStyle: "soft",
    useBackgroundMusic: true,
    masterVolume: 0.3,
  },
  motivational: {
    preferredCategories: ["musical", "ambient"],
    transitionStyle: "dramatic",
    useBackgroundMusic: true,
    masterVolume: 0.3,
  },
  news_report: {
    preferredCategories: ["ambient"],
    transitionStyle: "none",
    useBackgroundMusic: false,
    masterVolume: 0.15,
  },
};

// --- Core Functions ---

/**
 * Extract keywords from scene visual description and narration.
 */
function extractSceneKeywords(scene: Scene): string[] {
  const text = `${scene.visualDescription} ${scene.narrationScript} ${scene.name}`.toLowerCase();

  // Common keyword patterns
  const keywords: string[] = [];

  // Nature keywords
  if (/desert|sand|dune|sahara/i.test(text)) keywords.push("desert");
  if (/ocean|sea|beach|wave|coast/i.test(text)) keywords.push("ocean");
  if (/forest|tree|wood|jungle/i.test(text)) keywords.push("forest");
  if (/mountain|hill|peak|cliff/i.test(text)) keywords.push("mountain");
  if (/rain|storm|thunder/i.test(text)) keywords.push("rain", "storm");
  if (/wind|breeze|gust/i.test(text)) keywords.push("wind");
  if (/night|dark|moon|star/i.test(text)) keywords.push("night");

  // Urban keywords
  if (/city|urban|street|traffic/i.test(text)) keywords.push("city", "urban");
  if (/market|bazaar|souk|shop/i.test(text)) keywords.push("market");
  if (/cafe|coffee|restaurant/i.test(text)) keywords.push("cafe");

  // Mood keywords
  if (/ghost|spirit|haunt|eerie|creepy/i.test(text)) keywords.push("ghost", "eerie");
  if (/magic|mystical|ancient|spell/i.test(text)) keywords.push("magic", "mystical");
  if (/horror|scary|fear|terror/i.test(text)) keywords.push("horror", "scary");
  if (/tension|suspense|thriller/i.test(text)) keywords.push("tension", "suspense");
  if (/hope|positive|uplift|inspir/i.test(text)) keywords.push("hope", "inspiring");
  if (/epic|dramatic|powerful/i.test(text)) keywords.push("epic", "dramatic");

  // Cultural keywords
  if (/arab|middle east|oriental|kuwait|egypt/i.test(text)) keywords.push("arabic", "middle east");
  if (/asian|japan|china|korea/i.test(text)) keywords.push("asian");

  return [...new Set(keywords)];
}

/**
 * Score how well an SFX matches a scene.
 */
function scoreSFXMatch(sfx: AmbientSFX, scene: Scene, sceneKeywords: string[], preferences: typeof PURPOSE_SFX_PREFERENCES[VideoPurpose]): number {
  let score = 0;

  // Category preference (0-30 points)
  const categoryIndex = preferences.preferredCategories.indexOf(sfx.category);
  if (categoryIndex !== -1) {
    score += 30 - (categoryIndex * 5);
  }

  // Mood match (0-25 points)
  if (sfx.moods.includes(scene.emotionalTone)) {
    score += 25;
  }

  // Keyword match (0-45 points, 5 per match)
  const keywordMatches = sceneKeywords.filter(kw =>
    sfx.keywords.some(sfxKw => sfxKw.includes(kw) || kw.includes(sfxKw))
  );
  score += Math.min(45, keywordMatches.length * 9);

  return score;
}

/**
 * Find the best ambient SFX for a scene.
 * Prioritizes AI-suggested SFX from content planner if available.
 */
export function findAmbientForScene(
  scene: Scene,
  videoPurpose: VideoPurpose,
  excludeIds: string[] = []
): AmbientSFX | null {
  // First, check if AI suggested an SFX for this scene
  if (scene.ambientSfx) {
    const aiSuggested = AMBIENT_LIBRARY.find(sfx => sfx.id === scene.ambientSfx);
    if (aiSuggested && !excludeIds.includes(aiSuggested.id)) {
      console.log(`[SFX] Using AI-suggested SFX for scene "${scene.name}": ${aiSuggested.name}`);
      return aiSuggested;
    }
    // If AI suggested an invalid ID, log warning and fall back to keyword matching
    if (!aiSuggested) {
      console.warn(`[SFX] AI suggested unknown SFX ID "${scene.ambientSfx}" for scene "${scene.name}", falling back to keyword matching`);
    }
  }

  const preferences = PURPOSE_SFX_PREFERENCES[videoPurpose];
  const sceneKeywords = extractSceneKeywords(scene);

  // Filter to ambient/loopable sounds only
  const candidates = AMBIENT_LIBRARY.filter(sfx =>
    sfx.duration === 0 && // Loopable
    sfx.category !== "transition" &&
    !excludeIds.includes(sfx.id)
  );

  if (candidates.length === 0) return null;

  // Score and sort
  const scored = candidates.map(sfx => ({
    sfx,
    score: scoreSFXMatch(sfx, scene, sceneKeywords, preferences),
  })).sort((a, b) => b.score - a.score);

  // Return best match if score is above threshold
  if (scored[0].score >= 20) {
    return scored[0].sfx;
  }

  return null;
}

/**
 * Get transition sound based on video purpose and mood.
 */
export function getTransitionSound(
  videoPurpose: VideoPurpose,
  mood: EmotionalTone
): AmbientSFX | null {
  const preferences = PURPOSE_SFX_PREFERENCES[videoPurpose];

  if (preferences.transitionStyle === "none") {
    return null;
  }

  const transitions = AMBIENT_LIBRARY.filter(sfx => sfx.category === "transition");

  if (preferences.transitionStyle === "dramatic") {
    return transitions.find(t => t.id === "whoosh-dramatic" || t.id === "impact-deep") || null;
  }

  return transitions.find(t => t.id === "whoosh-soft" || t.id === "shimmer") || null;
}

/**
 * Generate a complete SFX plan for a video.
 */
export function generateVideoSFXPlan(
  scenes: Scene[],
  videoPurpose: VideoPurpose
): VideoSFXPlan {
  const preferences = PURPOSE_SFX_PREFERENCES[videoPurpose];
  const usedAmbientIds: string[] = [];

  const scenePlans: SceneSFXPlan[] = scenes.map((scene, index) => {
    // Find ambient for this scene
    const ambient = findAmbientForScene(scene, videoPurpose, usedAmbientIds);
    if (ambient) {
      usedAmbientIds.push(ambient.id);
    }

    // Get transition sounds
    const transitionIn = index > 0 ? getTransitionSound(videoPurpose, scene.emotionalTone) : null;
    const transitionOut = index < scenes.length - 1 ? getTransitionSound(videoPurpose, scene.emotionalTone) : null;

    return {
      sceneId: scene.id,
      ambientTrack: ambient,
      transitionIn,
      transitionOut,
      accentSounds: [], // Can be expanded for specific accent sounds
    };
  });

  // Find background music if enabled
  let backgroundMusic: AmbientSFX | null = null;
  if (preferences.useBackgroundMusic) {
    const musicalBeds = AMBIENT_LIBRARY.filter(sfx => sfx.category === "musical");
    // Find one that matches the overall mood
    const dominantMood = scenes[0]?.emotionalTone || "professional";
    backgroundMusic = musicalBeds.find(m => m.moods.includes(dominantMood)) || musicalBeds[0] || null;
  }

  return {
    scenes: scenePlans,
    backgroundMusic,
    masterVolume: preferences.masterVolume,
  };
}

/**
 * Get SFX suggestions for a scene (for UI display).
 */
export function getSFXSuggestionsForScene(
  scene: Scene,
  videoPurpose: VideoPurpose,
  limit: number = 5
): AmbientSFX[] {
  const preferences = PURPOSE_SFX_PREFERENCES[videoPurpose];
  const sceneKeywords = extractSceneKeywords(scene);

  const candidates = AMBIENT_LIBRARY.filter(sfx =>
    sfx.duration === 0 && sfx.category !== "transition"
  );

  const scored = candidates.map(sfx => ({
    sfx,
    score: scoreSFXMatch(sfx, scene, sceneKeywords, preferences),
  })).sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.sfx);
}

/**
 * Get all available ambient sounds.
 */
export function getAllAmbientSounds(): AmbientSFX[] {
  return AMBIENT_LIBRARY.filter(sfx => sfx.category !== "transition");
}

/**
 * Get all transition sounds.
 */
export function getAllTransitionSounds(): AmbientSFX[] {
  return AMBIENT_LIBRARY.filter(sfx => sfx.category === "transition");
}

/**
 * Get ambient sounds by category.
 */
export function getAmbientByCategory(category: SFXCategory): AmbientSFX[] {
  return AMBIENT_LIBRARY.filter(sfx => sfx.category === category);
}

// --- Export Types ---
export type { SFXCategory as SFXCategoryType };


// --- Freesound Integration ---

import {
  isFreesoundConfigured,
  getAmbientSoundCached,
  getPreviewUrl,
  preloadSounds,
  FreesoundSound
} from "./freesoundService";

/**
 * Fetch real audio URLs from Freesound for an SFX plan.
 * Updates the plan in-place with actual audio URLs.
 */
export async function enrichSFXPlanWithFreesound(plan: VideoSFXPlan): Promise<VideoSFXPlan> {
  if (!isFreesoundConfigured()) {
    console.warn("[SFX] Freesound API not configured, using placeholder SFX");
    return plan;
  }

  console.log("[SFX] Fetching audio from Freesound...");

  // Collect all unique SFX IDs that need audio
  const sfxIds = new Set<string>();

  plan.scenes.forEach(scene => {
    if (scene.ambientTrack) sfxIds.add(scene.ambientTrack.id);
    if (scene.transitionIn) sfxIds.add(scene.transitionIn.id);
    if (scene.transitionOut) sfxIds.add(scene.transitionOut.id);
    scene.accentSounds.forEach(s => sfxIds.add(s.id));
  });

  if (plan.backgroundMusic) {
    sfxIds.add(plan.backgroundMusic.id);
  }

  // Fetch sounds from Freesound
  const soundMap = await preloadSounds(Array.from(sfxIds));

  console.log(`[SFX] Fetched ${soundMap.size}/${sfxIds.size} sounds from Freesound`);

  // Update plan with audio URLs
  const updateSFX = (sfx: AmbientSFX | null): AmbientSFX | null => {
    if (!sfx) return null;

    const freesoundData = soundMap.get(sfx.id);
    if (freesoundData) {
      return {
        ...sfx,
        audioUrl: getPreviewUrl(freesoundData),
        duration: freesoundData.duration,
      };
    }
    return sfx;
  };

  // Create enriched plan
  const enrichedPlan: VideoSFXPlan = {
    ...plan,
    backgroundMusic: updateSFX(plan.backgroundMusic),
    scenes: plan.scenes.map(scene => ({
      ...scene,
      ambientTrack: updateSFX(scene.ambientTrack),
      transitionIn: updateSFX(scene.transitionIn),
      transitionOut: updateSFX(scene.transitionOut),
      accentSounds: scene.accentSounds.map(s => updateSFX(s)!).filter(Boolean),
    })),
  };

  return enrichedPlan;
}

/**
 * Generate SFX plan with real Freesound audio.
 * This is the main function to use for production.
 */
export async function generateVideoSFXPlanWithAudio(
  scenes: Scene[],
  videoPurpose: VideoPurpose
): Promise<VideoSFXPlan> {
  // First generate the plan with local library
  const plan = generateVideoSFXPlan(scenes, videoPurpose);

  // Then enrich with real audio from Freesound
  const enrichedPlan = await enrichSFXPlanWithFreesound(plan);

  return enrichedPlan;
}

/**
 * Search Freesound for a specific ambient sound type.
 * Useful for custom sound selection UI.
 */
export async function searchFreesoundAmbient(
  categoryId: string
): Promise<{ sfx: AmbientSFX; freesoundData: FreesoundSound } | null> {
  if (!isFreesoundConfigured()) {
    return null;
  }

  const freesoundData = await getAmbientSoundCached(categoryId);
  if (!freesoundData) {
    return null;
  }

  // Find the matching SFX from our library
  const sfx = AMBIENT_LIBRARY.find(s => s.id === categoryId);
  if (!sfx) {
    return null;
  }

  return {
    sfx: {
      ...sfx,
      audioUrl: getPreviewUrl(freesoundData),
      duration: freesoundData.duration,
    },
    freesoundData,
  };
}

/**
 * Check if Freesound integration is available.
 */
export function isSFXAudioAvailable(): boolean {
  return isFreesoundConfigured();
}
