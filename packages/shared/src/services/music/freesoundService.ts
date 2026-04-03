/**
 * Freesound API Service
 *
 * Integrates with Freesound.org API to fetch real ambient sounds.
 * https://freesound.org/docs/api/
 *
 * QUALITY IMPROVEMENTS:
 * - Smart query building with synonyms and related terms
 * - Multi-tier fallback search strategy
 * - Quality scoring based on rating, downloads, and duration fit
 * - Minimum quality thresholds (rating >= 3.0, downloads >= 10)
 * - Better duration matching for scene requirements
 * - Expanded ambient category library
 */

// --- Configuration ---
// Access Vite environment variables (defined in vite-env.d.ts)
const getFreesoundApiKey = (): string => {
  // Try Vite's import.meta.env first (browser)
  if (typeof window !== "undefined") {
    // @ts-ignore - Vite injects this at build time
    const viteEnv = (import.meta as any).env;
    if (viteEnv?.VITE_FREESOUND_API_KEY) {
      return viteEnv.VITE_FREESOUND_API_KEY;
    }
  }
  // Fallback to process.env (Node.js/SSR)
  return process.env.VITE_FREESOUND_API_KEY || "";
};

const FREESOUND_API_KEY = getFreesoundApiKey();
const FREESOUND_API_BASE = "https://freesound.org/apiv2";

// Quality thresholds
const MIN_RATING = 3.0;        // Minimum average rating (out of 5)
const MIN_DOWNLOADS = 10;      // Minimum downloads for quality assurance
const IDEAL_DURATION_MIN = 8;  // Ideal minimum duration for ambient loops
const IDEAL_DURATION_MAX = 120; // Ideal maximum duration

// Debug log
const isBrowser = typeof window !== "undefined";
if (isBrowser) {
  console.log(`[Freesound] API Key configured: ${FREESOUND_API_KEY ? "YES" : "NO"}`);
}

// --- Types ---

export interface FreesoundSound {
  id: number;
  name: string;
  description: string;
  tags: string[];
  duration: number;
  url: string;
  previews: {
    "preview-hq-mp3": string;
    "preview-lq-mp3": string;
    "preview-hq-ogg": string;
    "preview-lq-ogg": string;
  };
  images: {
    waveform_l: string;
    waveform_m: string;
    spectral_l: string;
    spectral_m: string;
  };
  username: string;
  license: string;
  avg_rating: number;
  num_downloads: number;
}

export interface FreesoundSearchResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: FreesoundSound[];
}

export interface FreesoundSearchOptions {
  query: string;
  filter?: string;
  sort?: "score" | "duration_desc" | "duration_asc" | "created_desc" | "created_asc" | "downloads_desc" | "downloads_asc" | "rating_desc" | "rating_asc";
  pageSize?: number;
  fields?: string[];
  minDuration?: number;
  maxDuration?: number;
}

// --- API Functions ---

/**
 * Check if Freesound API is configured
 */
export function isFreesoundConfigured(): boolean {
  return !!FREESOUND_API_KEY;
}

/**
 * Search for sounds on Freesound
 */
export async function searchSounds(options: FreesoundSearchOptions): Promise<FreesoundSearchResult> {
  if (!FREESOUND_API_KEY) {
    throw new Error("Freesound API key not configured. Add VITE_FREESOUND_API_KEY to .env.local");
  }

  const {
    query,
    filter,
    sort = "rating_desc",
    pageSize = 5,
    fields = ["id", "name", "description", "tags", "duration", "url", "previews", "images", "username", "license", "avg_rating", "num_downloads"],
    minDuration,
    maxDuration,
  } = options;

  // Build filter string
  const filterParts: string[] = [];
  if (filter) filterParts.push(filter);
  if (minDuration !== undefined) filterParts.push(`duration:[${minDuration} TO *]`);
  if (maxDuration !== undefined) filterParts.push(`duration:[* TO ${maxDuration}]`);
  
  const params = new URLSearchParams({
    query,
    token: FREESOUND_API_KEY,
    sort,
    page_size: String(pageSize),
    fields: fields.join(","),
  });

  if (filterParts.length > 0) {
    params.set("filter", filterParts.join(" AND "));
  }

  const url = `${FREESOUND_API_BASE}/search/text/?${params.toString()}`;
  
  console.log(`[Freesound] Searching: "${query}"`);

  const response = await fetch(url);
  
  if (!response.ok) {
    const error = await response.text();
    console.error("[Freesound] Search failed:", error);
    throw new Error(`Freesound search failed: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[Freesound] Found ${data.count} results for "${query}"`);
  
  return data;
}

/**
 * Get a specific sound by ID
 */
export async function getSound(soundId: number): Promise<FreesoundSound> {
  if (!FREESOUND_API_KEY) {
    throw new Error("Freesound API key not configured");
  }

  const fields = ["id", "name", "description", "tags", "duration", "url", "previews", "images", "username", "license", "avg_rating", "num_downloads"];
  
  const params = new URLSearchParams({
    token: FREESOUND_API_KEY,
    fields: fields.join(","),
  });

  const url = `${FREESOUND_API_BASE}/sounds/${soundId}/?${params.toString()}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to get sound ${soundId}: ${response.status}`);
  }

  return response.json();
}

// --- Quality Scoring ---

/**
 * Calculate quality score for a sound based on multiple factors.
 * Score range: 0-100
 */
function calculateQualityScore(
  sound: FreesoundSound,
  targetDuration?: number
): number {
  let score = 0;

  // Rating component (0-40 points)
  // Rating is 0-5, normalize to 0-40
  const ratingScore = (sound.avg_rating / 5) * 40;
  score += ratingScore;

  // Download popularity component (0-30 points)
  // Log scale for downloads (10 = 10pts, 100 = 20pts, 1000+ = 30pts)
  const downloadScore = Math.min(30, Math.log10(Math.max(1, sound.num_downloads)) * 10);
  score += downloadScore;

  // Duration fit component (0-30 points)
  if (targetDuration) {
    // Perfect match = 30 points, decreasing as it deviates
    const durationRatio = sound.duration / targetDuration;
    if (durationRatio >= 0.8 && durationRatio <= 2.0) {
      // Within ideal range
      score += 30;
    } else if (durationRatio >= 0.5 && durationRatio <= 3.0) {
      // Acceptable range
      score += 20;
    } else if (durationRatio >= 0.3) {
      // Usable
      score += 10;
    }
  } else {
    // No target duration, prefer sounds in ideal range
    if (sound.duration >= IDEAL_DURATION_MIN && sound.duration <= IDEAL_DURATION_MAX) {
      score += 30;
    } else if (sound.duration >= 5) {
      score += 15;
    }
  }

  return Math.round(score);
}

/**
 * Filter sounds by minimum quality standards
 */
function filterByQuality(sounds: FreesoundSound[], strict: boolean = true): FreesoundSound[] {
  return sounds.filter((sound) => {
    // Must have a preview URL
    if (!sound.previews?.["preview-hq-mp3"] && !sound.previews?.["preview-lq-mp3"]) {
      return false;
    }

    if (strict) {
      // Strict quality requirements
      if (sound.avg_rating < MIN_RATING) return false;
      if (sound.num_downloads < MIN_DOWNLOADS) return false;
    } else {
      // Relaxed requirements for fallback
      if (sound.avg_rating < 2.0) return false;
      if (sound.num_downloads < 3) return false;
    }

    return true;
  });
}

/**
 * Sort sounds by quality score
 */
function sortByQuality(sounds: FreesoundSound[], targetDuration?: number): FreesoundSound[] {
  return [...sounds].sort((a, b) => {
    const scoreA = calculateQualityScore(a, targetDuration);
    const scoreB = calculateQualityScore(b, targetDuration);
    return scoreB - scoreA;
  });
}

// --- Synonym and Related Terms ---

/**
 * Expand search terms with synonyms and related words
 */
const TERM_EXPANSIONS: Record<string, string[]> = {
  // Nature
  forest: ["woods", "jungle", "trees", "woodland"],
  ocean: ["sea", "waves", "beach", "coastal"],
  rain: ["rainfall", "rainy", "precipitation", "drizzle"],
  wind: ["breeze", "gust", "windy", "blowing"],
  thunder: ["thunderstorm", "storm", "lightning"],
  desert: ["sand", "arid", "sahara", "dunes"],
  river: ["stream", "creek", "water", "flowing"],
  birds: ["birdsong", "chirping", "songbirds", "avian"],
  night: ["nocturnal", "nighttime", "evening", "dark"],

  // Urban
  city: ["urban", "downtown", "metropolitan", "street"],
  traffic: ["cars", "vehicles", "highway", "road"],
  cafe: ["coffee", "restaurant", "bistro", "coffeehouse"],
  crowd: ["people", "chatter", "murmur", "voices"],

  // Mood/Atmosphere
  ambient: ["atmosphere", "atmospheric", "background", "soundscape"],
  eerie: ["creepy", "spooky", "haunting", "unsettling"],
  tension: ["suspense", "tense", "dramatic", "ominous"],
  peaceful: ["calm", "relaxing", "serene", "tranquil"],
  epic: ["cinematic", "dramatic", "orchestral", "grand"],
  mystical: ["magical", "ethereal", "fantasy", "enchanted"],
  hopeful: ["uplifting", "positive", "inspiring", "warm"],

  // Technical
  drone: ["pad", "sustained", "tone", "hum"],
  loop: ["loopable", "seamless", "repeating"],
  transition: ["swoosh", "sweep", "pass"],
};

/**
 * Build enhanced search query with synonyms
 */
function buildEnhancedQuery(baseQuery: string, includeSynonyms: boolean = true): string {
  if (!includeSynonyms) return baseQuery;

  const words = baseQuery.toLowerCase().split(/\s+/);
  const expandedTerms: string[] = [];

  for (const word of words) {
    expandedTerms.push(word);
    const synonyms = TERM_EXPANSIONS[word];
    if (synonyms && synonyms.length > 0 && synonyms[0]) {
      // Add first synonym only to avoid overly broad searches
      expandedTerms.push(synonyms[0]);
    }
  }

  // Remove duplicates and join
  return [...new Set(expandedTerms)].join(" ");
}

// --- Ambient Sound Search Queries ---

/**
 * Pre-defined search queries for different ambient categories
 * Enhanced with synonyms, better filters, and quality preferences
 */
export const AMBIENT_SEARCH_QUERIES: Record<string, {
  query: string;
  altQueries?: string[];  // Alternative queries for fallback
  filter?: string;
  minDuration?: number;
  maxDuration?: number;
  targetDuration?: number;  // Ideal duration for quality scoring
}> = {
  // ============ NATURE ============
  "desert-wind": {
    query: "desert wind sand ambient",
    altQueries: ["wind sand dunes", "sahara wind", "arid wind ambience"],
    filter: "tag:wind OR tag:desert",
    minDuration: 10,
    targetDuration: 30,
  },
  "desert-night": {
    query: "desert night ambient quiet crickets",
    altQueries: ["night desert silence", "arid night ambience", "quiet night outdoors"],
    minDuration: 10,
    targetDuration: 30,
  },
  "ocean-waves": {
    query: "ocean waves beach ambient",
    altQueries: ["sea waves shore", "beach ocean surf", "coastal waves ambient"],
    filter: "tag:ocean OR tag:waves OR tag:beach",
    minDuration: 15,
    targetDuration: 60,
  },
  "forest-ambience": {
    query: "forest birds nature ambient",
    altQueries: ["woodland birds chirping", "nature forest soundscape", "jungle ambient birds"],
    filter: "tag:forest OR tag:nature OR tag:birds",
    minDuration: 15,
    targetDuration: 60,
  },
  "rain-gentle": {
    query: "rain gentle soft ambient",
    altQueries: ["light rain drops", "soft rainfall", "rain on window"],
    filter: "tag:rain",
    minDuration: 15,
    targetDuration: 60,
  },
  "rain-heavy": {
    query: "heavy rain downpour ambient",
    altQueries: ["rain storm heavy", "pouring rain", "monsoon rain"],
    filter: "tag:rain",
    minDuration: 15,
    targetDuration: 60,
  },
  "thunderstorm": {
    query: "thunderstorm rain thunder ambient",
    altQueries: ["thunder storm rain", "lightning thunder", "storm ambient"],
    filter: "tag:thunder OR tag:storm",
    minDuration: 15,
    targetDuration: 60,
  },
  "wind-howling": {
    query: "wind howling strong ambient",
    altQueries: ["strong wind gusts", "windy storm", "blowing wind"],
    filter: "tag:wind",
    minDuration: 10,
    targetDuration: 30,
  },
  "river-stream": {
    query: "river stream water flowing ambient",
    altQueries: ["creek water flow", "brook babbling", "stream nature"],
    filter: "tag:water OR tag:river",
    minDuration: 15,
    targetDuration: 60,
  },
  "fire-crackling": {
    query: "fire crackling campfire ambient",
    altQueries: ["fireplace crackling", "bonfire burning", "wood fire"],
    filter: "tag:fire",
    minDuration: 15,
    targetDuration: 60,
  },
  "night-crickets": {
    query: "night crickets insects ambient",
    altQueries: ["crickets chirping", "summer night insects", "cicadas night"],
    filter: "tag:night OR tag:crickets",
    minDuration: 15,
    targetDuration: 60,
  },

  // ============ URBAN ============
  "city-traffic": {
    query: "city traffic urban ambient",
    altQueries: ["street traffic cars", "urban road sounds", "downtown traffic"],
    filter: "tag:city OR tag:traffic OR tag:urban",
    minDuration: 15,
    targetDuration: 60,
  },
  "cafe-ambience": {
    query: "cafe coffee shop ambient",
    altQueries: ["coffee shop background", "restaurant ambience", "bistro chatter"],
    filter: "tag:cafe OR tag:restaurant OR tag:coffee",
    minDuration: 15,
    targetDuration: 60,
  },
  "marketplace": {
    query: "market bazaar crowd ambient",
    altQueries: ["busy market people", "street market chatter", "bazaar ambience"],
    minDuration: 15,
    targetDuration: 60,
  },
  "office-ambience": {
    query: "office ambient typing keyboard",
    altQueries: ["office background", "workplace ambient", "computer room"],
    minDuration: 10,
    targetDuration: 30,
  },
  "subway-train": {
    query: "subway train metro ambient",
    altQueries: ["underground train", "metro station", "train station ambient"],
    filter: "tag:train OR tag:subway",
    minDuration: 10,
    targetDuration: 30,
  },
  "airport": {
    query: "airport terminal ambient announcements",
    altQueries: ["airport ambience", "terminal crowd", "airport background"],
    minDuration: 15,
    targetDuration: 60,
  },

  // ============ SUPERNATURAL/MYSTERY ============
  "eerie-ambience": {
    query: "eerie horror ambient dark",
    altQueries: ["creepy atmosphere", "horror ambience", "scary dark ambient"],
    filter: "tag:horror OR tag:scary OR tag:eerie",
    minDuration: 15,
    targetDuration: 30,
  },
  "mystical-drone": {
    query: "mystical ethereal drone ambient",
    altQueries: ["magical atmosphere", "fantasy ambient", "enchanted drone"],
    filter: "tag:mystical OR tag:ethereal OR tag:fantasy",
    minDuration: 15,
    targetDuration: 60,
  },
  "whispers": {
    query: "whisper ghost eerie ambient",
    altQueries: ["ghostly whispers", "creepy whispers", "voices whisper"],
    minDuration: 3,
    maxDuration: 30,
    targetDuration: 10,
  },
  "heartbeat": {
    query: "heartbeat tension suspense",
    altQueries: ["heart beating", "pulse heartbeat", "heartbeat loop"],
    minDuration: 5,
    maxDuration: 60,
    targetDuration: 15,
  },
  "haunted-house": {
    query: "haunted house creaking ambient",
    altQueries: ["old house creaks", "spooky house", "creepy house sounds"],
    minDuration: 10,
    targetDuration: 30,
  },

  // ============ TRANSITIONS & SFX ============
  "whoosh-soft": {
    query: "whoosh soft transition swoosh",
    altQueries: ["soft swoosh", "gentle whoosh", "light transition"],
    maxDuration: 3,
    targetDuration: 1,
  },
  "whoosh-dramatic": {
    query: "whoosh cinematic dramatic",
    altQueries: ["epic whoosh", "dramatic swoosh", "big whoosh"],
    maxDuration: 5,
    targetDuration: 2,
  },
  "impact-deep": {
    query: "impact deep bass hit cinematic",
    altQueries: ["deep hit", "bass impact", "cinematic boom"],
    maxDuration: 5,
    targetDuration: 2,
  },
  "shimmer": {
    query: "shimmer sparkle magic",
    altQueries: ["magic sparkle", "fairy dust", "twinkle sound"],
    maxDuration: 5,
    targetDuration: 2,
  },
  "riser-tension": {
    query: "riser tension build cinematic",
    altQueries: ["tension riser", "build up sound", "suspense riser"],
    maxDuration: 15,
    targetDuration: 5,
  },

  // ============ MUSICAL DRONES & PADS ============
  "tension-drone": {
    query: "tension drone dark ambient",
    altQueries: ["suspense drone", "ominous pad", "dark atmosphere"],
    filter: "tag:tension OR tag:suspense OR tag:drone",
    minDuration: 15,
    targetDuration: 60,
  },
  "hopeful-pad": {
    query: "hopeful pad ambient warm",
    altQueries: ["uplifting pad", "positive ambient", "warm synth pad"],
    minDuration: 15,
    targetDuration: 60,
  },
  "sad-melancholy": {
    query: "sad melancholy ambient piano",
    altQueries: ["melancholic ambient", "sorrowful pad", "emotional ambient"],
    minDuration: 15,
    targetDuration: 60,
  },
  "epic-strings": {
    query: "epic strings cinematic orchestra",
    altQueries: ["dramatic strings", "orchestral epic", "cinematic orchestra"],
    minDuration: 10,
    targetDuration: 30,
  },
  "middle-eastern": {
    query: "middle eastern arabic ambient",
    altQueries: ["arabic music ambient", "oriental ambient", "persian atmosphere"],
    filter: "tag:arabic OR tag:oriental OR tag:middle-eastern",
    minDuration: 15,
    targetDuration: 60,
  },
  "asian-zen": {
    query: "asian zen meditation ambient",
    altQueries: ["japanese zen", "chinese ambient", "eastern meditation"],
    filter: "tag:asian OR tag:zen OR tag:meditation",
    minDuration: 15,
    targetDuration: 60,
  },
  "sci-fi-ambient": {
    query: "sci-fi ambient space futuristic",
    altQueries: ["space ambient", "futuristic drone", "science fiction atmosphere"],
    filter: "tag:sci-fi OR tag:space OR tag:futuristic",
    minDuration: 15,
    targetDuration: 60,
  },

  // ============ INDUSTRIAL & MECHANICAL ============
  "factory": {
    query: "factory industrial machinery ambient",
    altQueries: ["industrial ambient", "machinery sounds", "factory floor"],
    minDuration: 15,
    targetDuration: 60,
  },
  "clock-ticking": {
    query: "clock ticking mechanical",
    altQueries: ["ticking clock", "clockwork", "watch ticking"],
    minDuration: 5,
    maxDuration: 60,
    targetDuration: 15,
  },
};

/**
 * Search for ambient sound by category ID
 * Enhanced with multi-tier fallback and quality scoring
 */
export async function searchAmbientSound(
  categoryId: string,
  sceneDuration?: number
): Promise<FreesoundSound | null> {
  const searchConfig = AMBIENT_SEARCH_QUERIES[categoryId];

  if (!searchConfig) {
    console.warn(`[Freesound] No search config for category: ${categoryId}`);
    // Try a generic search with the category name
    return searchGenericAmbient(categoryId, sceneDuration);
  }

  const targetDuration = sceneDuration || searchConfig.targetDuration;

  try {
    // Tier 1: Primary query with enhanced terms
    const enhancedQuery = buildEnhancedQuery(searchConfig.query, true);
    console.log(`[Freesound] Searching "${categoryId}" with: "${enhancedQuery}"`);

    let result = await searchSounds({
      query: enhancedQuery,
      filter: searchConfig.filter,
      minDuration: searchConfig.minDuration,
      maxDuration: searchConfig.maxDuration,
      sort: "downloads_desc", // Start with popular sounds
      pageSize: 15,
    });

    // Apply quality filtering and scoring
    let qualitySounds = filterByQuality(result.results, true);
    qualitySounds = sortByQuality(qualitySounds, targetDuration);

    if (qualitySounds.length > 0) {
      const selected = qualitySounds[0];
      if (!selected) return null;
      const score = calculateQualityScore(selected, targetDuration);
      console.log(`[Freesound] ✓ Found "${selected.name}" (score: ${score}, ${selected.duration.toFixed(1)}s, ★${selected.avg_rating.toFixed(1)})`);
      return selected;
    }

    // Tier 2: Try alternative queries
    if (searchConfig.altQueries && searchConfig.altQueries.length > 0) {
      for (const altQuery of searchConfig.altQueries) {
        console.log(`[Freesound] Fallback query: "${altQuery}"`);

        result = await searchSounds({
          query: altQuery,
          minDuration: searchConfig.minDuration,
          maxDuration: searchConfig.maxDuration,
          sort: "rating_desc",
          pageSize: 10,
        });

        qualitySounds = filterByQuality(result.results, true);
        qualitySounds = sortByQuality(qualitySounds, targetDuration);

        if (qualitySounds.length > 0) {
          const selected = qualitySounds[0];
          if (!selected) continue;
          const score = calculateQualityScore(selected, targetDuration);
          console.log(`[Freesound] ✓ Found via alt query: "${selected.name}" (score: ${score})`);
          return selected;
        }
      }
    }

    // Tier 3: Simplified primary query (first 2 words)
    const simplifiedQuery = searchConfig.query.split(" ").slice(0, 2).join(" ");
    console.log(`[Freesound] Simplified query: "${simplifiedQuery}"`);

    result = await searchSounds({
      query: simplifiedQuery,
      minDuration: searchConfig.minDuration,
      maxDuration: searchConfig.maxDuration,
      sort: "rating_desc",
      pageSize: 10,
    });

    // Relax quality requirements for fallback
    qualitySounds = filterByQuality(result.results, false);
    qualitySounds = sortByQuality(qualitySounds, targetDuration);

    if (qualitySounds.length > 0) {
      const selected = qualitySounds[0];
      if (!selected) return null;
      console.log(`[Freesound] ✓ Found via simplified: "${selected.name}"`);
      return selected;
    }

    // Tier 4: Just the category name
    const categoryQuery = categoryId.replace(/-/g, " ");
    console.log(`[Freesound] Final fallback: "${categoryQuery}"`);

    result = await searchSounds({
      query: categoryQuery,
      sort: "downloads_desc",
      pageSize: 10,
    });

    qualitySounds = filterByQuality(result.results, false);
    if (qualitySounds.length > 0) {
      const selected = qualitySounds[0];
      if (!selected) return null;
      console.log(`[Freesound] ✓ Found via category name: "${selected.name}"`);
      return selected;
    }

    console.warn(`[Freesound] ✗ No results for "${categoryId}" (all fallbacks exhausted)`);
    return null;
  } catch (error) {
    console.error(`[Freesound] Error searching for ${categoryId}:`, error);
    return null;
  }
}

/**
 * Generic ambient search for categories not in the predefined list
 */
async function searchGenericAmbient(
  query: string,
  targetDuration?: number
): Promise<FreesoundSound | null> {
  const cleanQuery = query.replace(/-/g, " ").toLowerCase();
  console.log(`[Freesound] Generic search: "${cleanQuery}"`);

  try {
    // Try with "ambient" added
    let result = await searchSounds({
      query: `${cleanQuery} ambient`,
      sort: "downloads_desc",
      pageSize: 15,
      minDuration: 5,
    });

    let qualitySounds = filterByQuality(result.results, false);
    qualitySounds = sortByQuality(qualitySounds, targetDuration);

    if (qualitySounds.length > 0) {
      const selected = qualitySounds[0];
      return selected ?? null;
    }

    // Try without "ambient"
    result = await searchSounds({
      query: cleanQuery,
      sort: "downloads_desc",
      pageSize: 10,
      minDuration: 3,
    });

    qualitySounds = filterByQuality(result.results, false);
    if (qualitySounds.length > 0) {
      const selected = qualitySounds[0];
      return selected ?? null;
    }

    return null;
  } catch (error) {
    console.error(`[Freesound] Generic search failed:`, error);
    return null;
  }
}

/**
 * Get preview URL for a sound (HQ MP3)
 */
export function getPreviewUrl(sound: FreesoundSound): string {
  return sound.previews["preview-hq-mp3"] || sound.previews["preview-lq-mp3"];
}

/**
 * Cache for fetched sounds to avoid repeated API calls
 */
const soundCache = new Map<string, FreesoundSound>();

/**
 * Get ambient sound with caching
 */
export async function getAmbientSoundCached(categoryId: string): Promise<FreesoundSound | null> {
  // Check cache first
  if (soundCache.has(categoryId)) {
    const cached = soundCache.get(categoryId);
    return cached ?? null;
  }

  const sound = await searchAmbientSound(categoryId);
  
  if (sound) {
    soundCache.set(categoryId, sound);
  }

  return sound;
}

/**
 * Clear the sound cache
 */
export function clearSoundCache(): void {
  soundCache.clear();
}

/**
 * Preload sounds for a list of category IDs
 */
export async function preloadSounds(categoryIds: string[]): Promise<Map<string, FreesoundSound>> {
  const results = new Map<string, FreesoundSound>();
  
  // Fetch in parallel with rate limiting (max 3 concurrent)
  const chunks: string[][] = [];
  for (let i = 0; i < categoryIds.length; i += 3) {
    chunks.push(categoryIds.slice(i, i + 3));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (id) => {
      const sound = await getAmbientSoundCached(id);
      if (sound) {
        results.set(id, sound);
      }
    });
    
    await Promise.all(promises);
    
    // Small delay between chunks to respect rate limits
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}


/**
 * Test function to verify Freesound API is working.
 * Can be called from browser console: testFreesoundAPI()
 */
export async function testFreesoundAPI(): Promise<void> {
  console.log("=== Freesound API Test ===");
  console.log(`API Key configured: ${isFreesoundConfigured() ? "YES" : "NO"}`);
  
  if (!isFreesoundConfigured()) {
    console.error("❌ Freesound API key not found. Add VITE_FREESOUND_API_KEY to .env.local");
    return;
  }

  try {
    console.log("Testing search for 'desert wind ambient'...");
    const result = await searchSounds({
      query: "desert wind ambient",
      pageSize: 2,
    });
    
    console.log(`✅ Search successful! Found ${result.count} results`);
    
    if (result.results.length > 0) {
      const sound = result.results[0];
      if (!sound) {
        console.error("❌ First result is undefined");
        return;
      }
      console.log(`First result: "${sound.name}" (${sound.duration.toFixed(1)}s)`);
      console.log(`Preview URL: ${sound.previews["preview-hq-mp3"]}`);
      
      // Test playing the audio
      console.log("Testing audio playback...");
      const audio = new Audio(sound.previews["preview-hq-mp3"]);
      audio.volume = 0.3;
      await audio.play();
      console.log("✅ Audio playing! (will stop in 3 seconds)");
      
      setTimeout(() => {
        audio.pause();
        console.log("Audio stopped.");
      }, 3000);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Expose to window for console testing
if (typeof window !== "undefined") {
  (window as any).testFreesoundAPI = testFreesoundAPI;
}
