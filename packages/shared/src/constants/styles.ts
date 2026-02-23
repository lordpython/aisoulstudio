/**
 * Art styles available for image and video generation.
 * Used in the sidebar style selector and passed to generation services.
 */
export const ART_STYLES = [
  "Cinematic",
  "Anime / Manga",
  "Cyberpunk",
  "Watercolor",
  "Oil Painting",
  "Pixel Art",
  "Surrealist",
  "Dark Fantasy",
  "Commercial / Ad",
  "Minimalist / Tutorial",
  "Comic Book",
  "Corporate / Brand",
  "Photorealistic",
] as const;

export type ArtStyle = (typeof ART_STYLES)[number];

/**
 * Style modifiers for image generation.
 * These are appended to prompts to achieve the desired visual style.
 */
export const IMAGE_STYLE_MODIFIERS: Record<string, string> = {
  Cinematic:
    "Cinematic movie still, 35mm film grain, anamorphic lens flare, hyper-realistic, dramatic lighting, 8k resolution",
  "Anime / Manga":
    "High-quality Anime style, Studio Ghibli aesthetic, vibrant colors, detailed backgrounds, cel shaded, expressive",
  Cyberpunk:
    "Futuristic cyberpunk city style, neon lights, rain-slicked streets, high contrast, blade runner vibe, technological",
  Watercolor:
    "Soft watercolor painting, artistic brush strokes, paper texture, bleeding colors, dreamy atmosphere",
  "Oil Painting":
    "Classic oil painting, thick impasto, visible brushwork, texture, rich colors, classical composition",
  "Pixel Art":
    "High quality pixel art, 16-bit retro game style, dithering, vibrant colors",
  Surrealist:
    "Surrealist art style, dreamlike, Dali-esque, impossible geometry, symbolic, mysterious",
  "Dark Fantasy":
    "Dark fantasy art, grimdark, gothic atmosphere, misty, detailed textures, eldritch",
  "Commercial / Ad":
    "Professional product photography, studio lighting, clean background, macro details, commercial aesthetic, 4k, sharp focus, advertising standard",
  "Minimalist / Tutorial":
    "Clean vector illustration, flat design, isometric perspective, white background, educational style, clear visibility, infographic aesthetic",
  "Comic Book":
    "American comic book style, dynamic action lines, bold ink outlines, halftone patterns, vibrant superhero colors, expressive",
  "Corporate / Brand":
    "Modern corporate memphis style, flat vector, clean lines, professional, trustworthy, blue and white color palette, tech startup aesthetic",
  Photorealistic:
    "Raw photo, hyper-realistic, DSLR, 50mm lens, depth of field, natural lighting, unedited footage style",
};

/**
 * Style modifiers for video generation.
 * These are optimized for motion and animation effects.
 */
export const VIDEO_STYLE_MODIFIERS: Record<string, string> = {
  Cinematic:
    "Cinematic movie shot, slow camera movement, 35mm film grain, hyper-realistic, dramatic lighting, 8k resolution",
  "Anime / Manga":
    "High-quality Anime animation, Studio Ghibli style, moving clouds, wind effects, vibrant colors",
  Cyberpunk:
    "Futuristic cyberpunk city, neon lights flickering, rain falling, flying cars, high contrast",
  Watercolor:
    "Animated watercolor painting, flowing paint, artistic brush strokes, paper texture, bleeding colors",
  "Oil Painting":
    "Living oil painting, shifting textures, visible brushwork, classical composition",
  "Pixel Art":
    "Animated pixel art, 16-bit retro game loop, dithering, vibrant colors",
  Surrealist:
    "Surrealist dreamscape, morphing shapes, impossible geometry, mysterious atmosphere",
  "Dark Fantasy":
    "Dark fantasy atmosphere, rolling fog, flickering torches, grimdark, detailed textures",
  "Commercial / Ad":
    "Professional product b-roll, smooth slider shot, studio lighting, clean background, 4k",
  "Minimalist / Tutorial":
    "Clean motion graphics, animated vector illustration, flat design, smooth transitions",
  "Comic Book":
    "Motion comic style, dynamic action, bold ink outlines, halftone patterns",
  "Corporate / Brand":
    "Modern corporate motion graphics, kinetic typography background, clean lines, professional",
  Photorealistic:
    "Raw video footage, handheld camera, natural lighting, unedited style",
};
