/**
 * Image Style Guide - Structured JSON prompts for image generation
 *
 * Replaces ad-hoc string concatenation with a typed JSON object that gets
 * serialized as the prompt text sent to image models (Imagen, DeAPI Flux, Gemini).
 *
 * Inspired by: https://dev.to/worldlinetech/json-style-guides-for-controlled-image-generation
 */

import { getStyleEnhancement } from "./styleEnhancements";
import {
  IMAGE_STYLE_MODIFIERS,
  DEFAULT_NEGATIVE_CONSTRAINTS,
} from "../../constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageStyleGuideSubject {
  type: string; // "person" | "object" | "animal" | "environment"
  description: string;
  position?: string; // "center" | "left-third" | "foreground" etc.
  pose?: string;
  expression?: string;
  interaction?: string;
}

export interface ImageStyleGuide {
  scene: string;
  subjects: ImageStyleGuideSubject[];
  style: {
    preset: string;
    keywords: string[];
    medium: string;
  };
  color_palette: string[];
  lighting: {
    source: string;
    quality: string;
    direction?: string;
  };
  mood: string;
  background: string;
  composition: {
    shot_type: string;
    camera_angle: string;
    framing?: string;
  };
  camera: {
    lens?: string;
    depth_of_field?: string;
    focus?: string;
  };
  textures?: string[];
  effects?: string[];
  avoid: string[];
}

// ---------------------------------------------------------------------------
// Per-style default tables
// ---------------------------------------------------------------------------

interface StyleDefaults {
  lighting: ImageStyleGuide["lighting"];
  color_palette: string[];
  textures: string[];
  effects: string[];
  camera: ImageStyleGuide["camera"];
  composition: ImageStyleGuide["composition"];
  mood: string;
}

const STYLE_DEFAULTS: Record<string, StyleDefaults> = {
  cinematic: {
    lighting: { source: "golden hour", quality: "soft diffused", direction: "backlit" },
    color_palette: ["warm amber", "deep shadow", "desaturated teal"],
    textures: ["35mm film grain"],
    effects: ["anamorphic lens flare", "bokeh"],
    camera: { lens: "35mm", depth_of_field: "shallow", focus: "subject" },
    composition: { shot_type: "medium shot", camera_angle: "eye-level", framing: "rule of thirds" },
    mood: "dramatic cinematic",
  },
  "anime / manga": {
    lighting: { source: "soft ambient", quality: "cel-shaded flat", direction: "front-lit" },
    color_palette: ["vibrant saturated", "pastel highlights", "deep ink shadows"],
    textures: ["clean linework", "screentone shading"],
    effects: ["speed lines", "sparkle effects"],
    camera: { lens: "50mm", depth_of_field: "deep", focus: "character" },
    composition: { shot_type: "medium shot", camera_angle: "slightly low angle", framing: "dynamic diagonal" },
    mood: "expressive anime",
  },
  cyberpunk: {
    lighting: { source: "neon tube lighting", quality: "harsh directional", direction: "side-lit" },
    color_palette: ["teal", "magenta", "electric blue", "deep black"],
    textures: ["rain-slicked asphalt", "holographic sheen"],
    effects: ["chromatic aberration", "glitch artifacts", "lens flare"],
    camera: { lens: "35mm", depth_of_field: "selective", focus: "subject" },
    composition: { shot_type: "wide shot", camera_angle: "low angle", framing: "asymmetric" },
    mood: "dystopian neon",
  },
  watercolor: {
    lighting: { source: "natural daylight", quality: "soft diffused" },
    color_palette: ["transparent washes", "bleeding edges", "raw paper white"],
    textures: ["cold-pressed paper", "pigment granulation"],
    effects: ["water bloom", "wet-on-wet bleed"],
    camera: { depth_of_field: "deep" },
    composition: { shot_type: "medium shot", camera_angle: "eye-level", framing: "organic" },
    mood: "dreamy ethereal",
  },
  "oil painting": {
    lighting: { source: "studio north light", quality: "warm directional", direction: "side-lit" },
    color_palette: ["rich saturated pigments", "warm earthy tones", "deep shadows"],
    textures: ["canvas weave", "impasto knife texture", "thick paint ridges"],
    effects: ["linseed oil sheen", "glazed translucent layers"],
    camera: { depth_of_field: "deep" },
    composition: { shot_type: "portrait", camera_angle: "eye-level", framing: "classical" },
    mood: "rich classical",
  },
  "pixel art": {
    lighting: { source: "flat ambient", quality: "uniform" },
    color_palette: ["limited 16-color palette", "vibrant primaries"],
    textures: ["dithering patterns", "aliased hard edges"],
    effects: ["scanline overlay", "CRT curvature"],
    camera: { depth_of_field: "deep" },
    composition: { shot_type: "wide shot", camera_angle: "isometric", framing: "tile-based" },
    mood: "nostalgic retro",
  },
  surrealist: {
    lighting: { source: "impossible light sources", quality: "dreamlike diffused" },
    color_palette: ["muted earth tones", "unexpected accent colors"],
    textures: ["smooth hyper-real surfaces"],
    effects: ["melting distortion", "floating objects"],
    camera: { lens: "wide angle", depth_of_field: "deep" },
    composition: { shot_type: "wide shot", camera_angle: "eye-level", framing: "center framing" },
    mood: "uncanny dreamlike",
  },
  "dark fantasy": {
    lighting: { source: "flickering torchlight", quality: "volumetric", direction: "backlit" },
    color_palette: ["deep crimson", "charcoal black", "sickly green"],
    textures: ["weathered stone", "rusted metal"],
    effects: ["volumetric fog", "blood moon glow"],
    camera: { lens: "35mm", depth_of_field: "shallow", focus: "subject" },
    composition: { shot_type: "medium shot", camera_angle: "low angle", framing: "asymmetric" },
    mood: "ominous gothic",
  },
  "commercial / ad": {
    lighting: { source: "studio softbox", quality: "high-key professional", direction: "front-lit" },
    color_palette: ["clean whites", "brand accent colors"],
    textures: ["smooth pristine surfaces"],
    effects: ["subtle rim light"],
    camera: { lens: "85mm", depth_of_field: "shallow", focus: "product" },
    composition: { shot_type: "hero shot", camera_angle: "eye-level", framing: "center framing" },
    mood: "aspirational clean",
  },
  "minimalist / tutorial": {
    lighting: { source: "flat ambient", quality: "uniform even" },
    color_palette: ["limited palette", "clean whites", "accent color"],
    textures: ["flat vector", "clean geometric"],
    effects: [],
    camera: { depth_of_field: "deep" },
    composition: { shot_type: "wide shot", camera_angle: "isometric", framing: "center framing" },
    mood: "clear educational",
  },
  "comic book": {
    lighting: { source: "dramatic spot light", quality: "harsh directional" },
    color_palette: ["vibrant primaries", "bold black outlines"],
    textures: ["halftone dots", "Ben-Day dots"],
    effects: ["Kirby crackle energy", "dynamic action lines"],
    camera: { depth_of_field: "deep" },
    composition: { shot_type: "dynamic angle", camera_angle: "low angle", framing: "dramatic foreshortening" },
    mood: "energetic heroic",
  },
  "corporate / brand": {
    lighting: { source: "soft ambient", quality: "even professional" },
    color_palette: ["professional blue", "clean white", "light gray"],
    textures: ["flat vector", "clean geometric shapes"],
    effects: ["abstract blob backgrounds"],
    camera: { depth_of_field: "deep" },
    composition: { shot_type: "medium shot", camera_angle: "eye-level", framing: "balanced" },
    mood: "trustworthy professional",
  },
  photorealistic: {
    lighting: { source: "natural ambient", quality: "soft diffused" },
    color_palette: ["natural color temperature", "true-to-life tones"],
    textures: ["realistic skin texture", "natural material surfaces"],
    effects: ["shallow depth bokeh"],
    camera: { lens: "50mm", depth_of_field: "shallow", focus: "subject" },
    composition: { shot_type: "medium shot", camera_angle: "eye-level", framing: "rule of thirds" },
    mood: "authentic documentary",
  },
  // Special preset for character reference sheets
  character_sheet: {
    lighting: { source: "studio softbox", quality: "soft diffused", direction: "rim light accent" },
    color_palette: ["neutral tones", "clean whites"],
    textures: [],
    effects: [],
    camera: { lens: "85mm", depth_of_field: "shallow", focus: "subject" },
    composition: { shot_type: "medium shot", camera_angle: "eye-level", framing: "center framing" },
    mood: "neutral professional",
  },
};

/** Fallback defaults when a style is not found in the table. */
const FALLBACK_DEFAULTS: StyleDefaults = STYLE_DEFAULTS["cinematic"]!;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildImageStyleGuideParams {
  /** Scene/action description. Falls back to promptText if not provided. */
  scene?: string;
  /** Pre-built subjects array. If not provided, derived from globalSubject. */
  subjects?: ImageStyleGuideSubject[];
  /** Art-style preset name (e.g. "Cinematic", "Anime / Manga"). */
  style?: string;
  /** Global subject string — mapped to subjects[0] when subjects not given. */
  globalSubject?: string;
  /** Raw or refined prompt text — used for scene when scene is not given. */
  promptText?: string;
  /** Background override. */
  background?: string;
  /** Mood override. */
  mood?: string;
  /** Lighting override. */
  lighting?: ImageStyleGuide["lighting"];
  /** Composition override. */
  composition?: ImageStyleGuide["composition"];
  /** Camera override. */
  camera?: ImageStyleGuide["camera"];
  /** Color palette override. */
  color_palette?: string[];
  /** Extra avoid items (merged with DEFAULT_NEGATIVE_CONSTRAINTS). */
  avoid?: string[];
  /** Textures override. */
  textures?: string[];
  /** Effects override. */
  effects?: string[];
}

/**
 * Assemble a full `ImageStyleGuide` from heterogeneous sources.
 *
 * The builder merges:
 * - per-style default tables (lighting, palette, camera, …)
 * - `styleEnhancements.ts` keywords + mediumDescription
 * - `IMAGE_STYLE_MODIFIERS` string (parsed into supplemental keywords)
 * - `DEFAULT_NEGATIVE_CONSTRAINTS` → `avoid`
 * - any explicit overrides passed in params
 */
export function buildImageStyleGuide(params: BuildImageStyleGuideParams = {}): ImageStyleGuide {
  const {
    scene,
    subjects,
    style = "Cinematic",
    globalSubject,
    promptText,
    background,
    mood,
    lighting,
    composition,
    camera,
    color_palette,
    avoid,
    textures,
    effects,
  } = params;

  // --- Resolve style defaults ---
  const styleLower = style.toLowerCase();
  const defaults = STYLE_DEFAULTS[styleLower] ?? FALLBACK_DEFAULTS;

  // --- Style keywords from styleEnhancements.ts ---
  const enhancement = getStyleEnhancement(style);

  // --- Supplemental keywords from IMAGE_STYLE_MODIFIERS string ---
  const modifierStr = IMAGE_STYLE_MODIFIERS[style] ?? IMAGE_STYLE_MODIFIERS["Cinematic"] ?? "";
  const modifierKeywords = modifierStr
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Merge and deduplicate keywords
  const allKeywords = [...new Set([...enhancement.keywords, ...modifierKeywords])];

  // --- Subjects ---
  let resolvedSubjects: ImageStyleGuideSubject[] = subjects ?? [];
  if (resolvedSubjects.length === 0 && globalSubject && globalSubject.trim()) {
    resolvedSubjects = [
      {
        type: "person",
        description: globalSubject,
        position: "center",
      },
    ];
  }

  // --- Scene ---
  const resolvedScene = scene ?? promptText ?? "";

  // --- Avoid (negative constraints) ---
  const negativeItems = DEFAULT_NEGATIVE_CONSTRAINTS.map((c) =>
    c.replace(/^no\s+/i, "").trim(),
  );
  const resolvedAvoid = [...new Set([...negativeItems, ...(avoid ?? [])])];

  return {
    scene: resolvedScene,
    subjects: resolvedSubjects,
    style: {
      preset: style,
      keywords: allKeywords,
      medium: enhancement.mediumDescription,
    },
    color_palette: color_palette ?? defaults.color_palette,
    lighting: lighting ?? defaults.lighting,
    mood: mood ?? defaults.mood,
    background: background ?? "",
    composition: composition ?? defaults.composition,
    camera: camera ?? defaults.camera,
    textures: textures ?? defaults.textures,
    effects: effects ?? defaults.effects,
    avoid: resolvedAvoid,
  };
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Serialize an `ImageStyleGuide` to a JSON string suitable as an image-model prompt.
 */
// ---------------------------------------------------------------------------
// Shot Breakdown Factory (Story Mode)
// ---------------------------------------------------------------------------

export interface ShotBreakdownInput {
  description: string;
  shotType: string;
  cameraAngle: string;
  movement: string;
  lighting: string;
  emotion: string;
}

export interface CharacterInput {
  name: string;
  visualDescription: string;
  facialTags?: string;
}

/**
 * Build a complete `BuildImageStyleGuideParams` from shot breakdown + character data.
 * Centralizes the mapping from story pipeline types to the style guide system.
 */
export function fromShotBreakdown(
  shot: ShotBreakdownInput,
  characters: CharacterInput[],
  style: string,
  extractedStyle?: ExtractedStyleOverride,
): ImageStyleGuide {
  // Build subjects from characters mentioned in the shot description
  const shotDescLower = shot.description.toLowerCase();
  const subjects: ImageStyleGuideSubject[] = characters
    .filter(c => shotDescLower.includes(c.name.toLowerCase()))
    .map(c => ({
      type: "person",
      description: c.facialTags
        ? c.facialTags
        : c.visualDescription.length > 150
          ? c.visualDescription.substring(0, 147) + "..."
          : c.visualDescription,
      position: "center",
      expression: shot.emotion || undefined,
      pose: inferPoseFromDescription(shot.description),
      interaction: inferInteractionFromDescription(shot.description, characters.length),
    }));

  // Map shot fields to style guide params
  const params: BuildImageStyleGuideParams = {
    scene: shot.description,
    subjects,
    style,
    mood: shot.emotion,
    lighting: {
      source: shot.lighting || "natural",
      quality: "cinematic",
      direction: inferLightingDirection(shot.lighting),
    },
    composition: {
      shot_type: mapShotType(shot.shotType),
      camera_angle: mapCameraAngle(shot.cameraAngle),
      framing: "rule of thirds",
    },
  };

  // Apply extracted style overrides for cross-shot consistency
  if (extractedStyle) {
    if (extractedStyle.colorPalette?.length) {
      params.color_palette = extractedStyle.colorPalette;
    }
    if (extractedStyle.lighting) {
      params.lighting = {
        source: extractedStyle.lighting,
        quality: "consistent",
      };
    }
    if (extractedStyle.texture) {
      params.textures = [extractedStyle.texture];
    }
    if (extractedStyle.moodKeywords?.length) {
      params.mood = extractedStyle.moodKeywords.join(", ");
    }
    if (extractedStyle.negativePrompts?.length) {
      params.avoid = extractedStyle.negativePrompts;
    }
  }

  return buildImageStyleGuide(params);
}

/** Extracted style from visualConsistencyService, used for cross-shot consistency */
export interface ExtractedStyleOverride {
  colorPalette?: string[];
  lighting?: string;
  texture?: string;
  moodKeywords?: string[];
  negativePrompts?: string[];
}

function inferPoseFromDescription(description: string): string | undefined {
  const lower = description.toLowerCase();
  if (/\b(sitting|seated|sits)\b/.test(lower)) return "sitting";
  if (/\b(standing|stands)\b/.test(lower)) return "standing";
  if (/\b(walking|walks)\b/.test(lower)) return "walking";
  if (/\b(running|runs)\b/.test(lower)) return "running";
  if (/\b(lying|lies|reclining)\b/.test(lower)) return "reclining";
  return undefined;
}

function inferInteractionFromDescription(description: string, charCount: number): string | undefined {
  if (charCount < 2) return undefined;
  const lower = description.toLowerCase();
  if (/\b(talking|speaking|conversation)\b/.test(lower)) return "in conversation";
  if (/\b(fighting|struggling)\b/.test(lower)) return "in conflict";
  if (/\b(embracing|hugging)\b/.test(lower)) return "embracing";
  if (/\b(looking at|facing)\b/.test(lower)) return "facing each other";
  return undefined;
}

function inferLightingDirection(lighting: string): string | undefined {
  const lower = (lighting || "").toLowerCase();
  if (/\b(back|rim|silhouette)\b/.test(lower)) return "backlit";
  if (/\b(side|dramatic)\b/.test(lower)) return "side-lit";
  if (/\b(top|overhead)\b/.test(lower)) return "top-lit";
  return undefined;
}

function mapShotType(shotType: string): string {
  const map: Record<string, string> = {
    "Wide": "wide shot",
    "Medium": "medium shot",
    "Close-up": "close-up",
    "Extreme Close-up": "extreme close-up",
    "POV": "POV shot",
    "Over-the-shoulder": "over-the-shoulder shot",
  };
  return map[shotType] || shotType.toLowerCase();
}

function mapCameraAngle(angle: string): string {
  const map: Record<string, string> = {
    "Eye-level": "eye-level",
    "High": "high angle",
    "Low": "low angle",
    "Dutch": "dutch angle",
    "Bird's-eye": "bird's eye view",
    "Worm's-eye": "worm's eye view",
  };
  return map[angle] || angle.toLowerCase();
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

export function serializeStyleGuide(guide: ImageStyleGuide): string {
  return JSON.stringify(guide, null, 2);
}

/**
 * Serialize an `ImageStyleGuide` into a natural-language paragraph.
 *
 * Use this for models that don't handle raw JSON well (e.g. Imagen, DeAPI Flux).
 * The output reads as a conventional image-generation prompt while carrying
 * every dimension from the guide.
 */
export function serializeStyleGuideAsText(guide: ImageStyleGuide): string {
  const parts: string[] = [];

  // Lead with subjects (most important for model attention)
  if (guide.subjects.length > 0) {
    const subjectDescriptions = guide.subjects.map((s) => {
      let desc = s.description;
      if (s.pose) desc += `, ${s.pose}`;
      if (s.expression) desc += `, ${s.expression}`;
      if (s.position) desc += `, positioned ${s.position}`;
      if (s.interaction) desc += `, ${s.interaction}`;
      return desc;
    });
    parts.push(subjectDescriptions.join("; "));
  }

  // Scene / action
  if (guide.scene) {
    parts.push(guide.scene);
  }

  // Background
  if (guide.background) {
    parts.push(`Background: ${guide.background}.`);
  }

  // Style medium
  parts.push(guide.style.medium + ".");

  // Lighting
  const lt = guide.lighting;
  parts.push(
    `Lighting: ${lt.source}, ${lt.quality}${lt.direction ? `, ${lt.direction}` : ""}.`,
  );

  // Composition + camera
  const comp = guide.composition;
  let camLine = `${comp.shot_type}, ${comp.camera_angle}`;
  if (comp.framing) camLine += `, ${comp.framing}`;
  const cam = guide.camera;
  if (cam.lens) camLine += `, ${cam.lens} lens`;
  if (cam.depth_of_field) camLine += `, ${cam.depth_of_field} depth of field`;
  if (cam.focus) camLine += `, focus on ${cam.focus}`;
  parts.push(camLine + ".");

  // Mood
  if (guide.mood) {
    parts.push(`${guide.mood} mood.`);
  }

  // Color palette
  if (guide.color_palette.length > 0) {
    parts.push(`Color palette: ${guide.color_palette.join(", ")}.`);
  }

  // Textures + effects
  const extras = [...(guide.textures ?? []), ...(guide.effects ?? [])];
  if (extras.length > 0) {
    parts.push(extras.join(", ") + ".");
  }

  // Style keywords (select a few to avoid prompt bloat)
  if (guide.style.keywords.length > 0) {
    parts.push(guide.style.keywords.slice(0, 5).join(", ") + ".");
  }

  // Avoid / negative — prefix each item with "no" for stronger negative prompting
  if (guide.avoid.length > 0) {
    const prefixed = guide.avoid.map(item =>
      item.toLowerCase().startsWith("no ") ? item : `no ${item}`
    );
    parts.push(`Avoid: ${prefixed.join(", ")}.`);
  }

  return parts.filter(Boolean).join(" ");
}
