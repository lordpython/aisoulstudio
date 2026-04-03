export * from './linting';
export * from './purposeGuidance';
export * from './generation';

// injectMasterStyle — style injector
export function injectMasterStyle(basePrompt: string, stylePreset: string = "cinematic"): string {
  let cleanPrompt = basePrompt.replace(/photorealistic|cartoon|3d render|sketch/gi, "").trim();

  const stylePrefixes: Record<string, string> = {
    "cinematic": "Cinematic film shot",
    "anime": "Anime-style illustration",
    "watercolor": "Watercolor painting",
    "sketch": "Pencil sketch drawing",
    "oil painting": "Oil painting on canvas",
    "photorealistic": "Photorealistic photograph",
    "documentary": "Documentary-style photograph",
    "noir": "Film noir shot",
    "vaporwave": "Vaporwave aesthetic",
    "cyberpunk": "Cyberpunk-themed visual",
    "fantasy": "Fantasy art illustration",
    "manga": "Manga-style drawing",
    "comic book": "Comic book illustration",
    "3d render": "3D rendered image",
    "pixel art": "Pixel art creation",
    "chibi": "Chibi-style art",
    "steampunk": "Steampunk illustration",
    "gothic": "Gothic art style",
    "minimalist": "Minimalist design",
    "abstract": "Abstract art piece",
    "vintage": "Vintage-style photograph",
  };

  const prefix = stylePrefixes[stylePreset.toLowerCase()] || `${stylePreset} aesthetic`;
  const MASTER_STYLE = `${prefix}, ${stylePreset} aesthetic, consistent color grading, soft volumetric lighting, 35mm film grain, high coherence, highly detailed, 8k resolution. Negative prompt: text, watermark, bad quality, distorted, cgi artifacts, cartoon.`;
  return `${cleanPrompt}. ${MASTER_STYLE}`;
}

// Re-exports from existing sub-modules for backward compat
export { getSystemPersona, type Persona, type PersonaType } from '../../prompt/personaData';
export { getStyleEnhancement, type StyleEnhancement } from '../../prompt/styleEnhancements';
export { normalizeForSimilarity, countWords } from '../../utils/textProcessing';
