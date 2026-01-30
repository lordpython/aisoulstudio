/**
 * Visual Styles for Story Mode
 *
 * Comprehensive style definitions with prompt modifiers for image generation.
 * Each style includes aesthetic descriptions and generation parameters.
 */

export interface VisualStyle {
    id: string;
    name: string;
    description: string;
    promptSuffix: string;
    negativePrompt: string;
    aspectRatios: ('16:9' | '4:3' | '2.35:1' | '9:16' | '1:1')[];
    sampleImage?: string;
    category: 'cinematic' | 'artistic' | 'stylized' | 'modern';
}

export const VISUAL_STYLES: Record<string, VisualStyle> = {
    CINEMATIC: {
        id: 'CINEMATIC',
        name: 'Cinematic',
        description: 'Film-quality realism with dramatic lighting',
        promptSuffix: ', cinematic lighting, film grain, 35mm lens, dramatic shadows, color graded, anamorphic lens flare, movie still, 8k resolution',
        negativePrompt: 'cartoon, illustration, 3d render, anime, low quality, blurry',
        aspectRatios: ['16:9', '2.35:1', '4:3'],
        sampleImage: '/samples/cinematic.jpg',
        category: 'cinematic',
    },

    NOIR: {
        id: 'NOIR',
        name: 'Film Noir',
        description: 'High-contrast black and white with dramatic shadows',
        promptSuffix: ', film noir, black and white, high contrast, dramatic shadows, venetian blind lighting, 1940s detective movie aesthetic, rain-soaked streets, moody atmosphere',
        negativePrompt: 'color, bright, cheerful, cartoon, anime, low quality',
        aspectRatios: ['16:9', '4:3', '2.35:1'],
        sampleImage: '/samples/noir.jpg',
        category: 'cinematic',
    },

    COMIC: {
        id: 'COMIC',
        name: 'Comic Book',
        description: 'Bold ink outlines with halftone patterns',
        promptSuffix: ', comic book style, bold ink outlines, halftone patterns, vibrant superhero colors, dynamic action pose, speech bubble ready, Marvel/DC aesthetic',
        negativePrompt: 'photorealistic, 3d render, soft edges, blurry, muted colors',
        aspectRatios: ['16:9', '4:3', '1:1'],
        sampleImage: '/samples/comic.jpg',
        category: 'stylized',
    },

    ANIME: {
        id: 'ANIME',
        name: 'Anime',
        description: 'Japanese animation style with expressive characters',
        promptSuffix: ', anime style, Studio Ghibli aesthetic, cel shaded, vibrant colors, detailed backgrounds, expressive eyes, Japanese animation, key visual quality',
        negativePrompt: 'photorealistic, western cartoon, 3d render, low quality, sketch',
        aspectRatios: ['16:9', '4:3'],
        sampleImage: '/samples/anime.jpg',
        category: 'stylized',
    },

    WATERCOLOR: {
        id: 'WATERCOLOR',
        name: 'Watercolor',
        description: 'Soft brushstrokes with bleeding colors',
        promptSuffix: ', watercolor painting, soft brushstrokes, paper texture, bleeding colors, dreamy atmosphere, artistic, impressionistic, delicate',
        negativePrompt: 'photorealistic, sharp edges, digital, 3d render, harsh lighting',
        aspectRatios: ['16:9', '4:3', '1:1'],
        sampleImage: '/samples/watercolor.jpg',
        category: 'artistic',
    },

    OIL_PAINTING: {
        id: 'OIL_PAINTING',
        name: 'Oil Painting',
        description: 'Classical texture with visible brushwork',
        promptSuffix: ', oil painting, thick impasto, visible brushwork, rich colors, classical composition, museum quality, canvas texture, Rembrandt lighting',
        negativePrompt: 'digital art, smooth, photorealistic, flat colors, anime',
        aspectRatios: ['16:9', '4:3', '1:1'],
        sampleImage: '/samples/oil-painting.jpg',
        category: 'artistic',
    },

    CYBERPUNK: {
        id: 'CYBERPUNK',
        name: 'Cyberpunk',
        description: 'Neon-lit futuristic cityscapes',
        promptSuffix: ', cyberpunk style, neon lights, rain-slicked streets, holographic ads, futuristic technology, Blade Runner aesthetic, high contrast, purple and cyan',
        negativePrompt: 'natural, pastoral, historical, bright daylight, cartoon',
        aspectRatios: ['16:9', '2.35:1'],
        sampleImage: '/samples/cyberpunk.jpg',
        category: 'modern',
    },

    DARK_FANTASY: {
        id: 'DARK_FANTASY',
        name: 'Dark Fantasy',
        description: 'Gothic atmosphere with eldritch elements',
        promptSuffix: ', dark fantasy, grimdark, gothic atmosphere, misty, detailed textures, eldritch horror, medieval fantasy, dramatic lighting, moody',
        negativePrompt: 'bright, cheerful, modern, cartoon, anime, low quality',
        aspectRatios: ['16:9', '4:3', '2.35:1'],
        sampleImage: '/samples/dark-fantasy.jpg',
        category: 'stylized',
    },

    PHOTOREALISTIC: {
        id: 'PHOTOREALISTIC',
        name: 'Photorealistic',
        description: 'Raw photography with natural lighting',
        promptSuffix: ', raw photo, hyperrealistic, DSLR, 50mm lens, natural lighting, depth of field, unedited, documentary style, National Geographic quality',
        negativePrompt: 'illustration, painting, cartoon, anime, artistic, stylized',
        aspectRatios: ['16:9', '4:3', '2.35:1'],
        sampleImage: '/samples/photorealistic.jpg',
        category: 'cinematic',
    },

    PIXEL_ART: {
        id: 'PIXEL_ART',
        name: 'Pixel Art',
        description: 'Retro 16-bit game aesthetic',
        promptSuffix: ', pixel art, 16-bit, retro game style, dithering, vibrant colors, nostalgic, SNES aesthetic, limited color palette',
        negativePrompt: 'photorealistic, smooth, high resolution, 3d render, modern',
        aspectRatios: ['16:9', '4:3', '1:1'],
        sampleImage: '/samples/pixel-art.jpg',
        category: 'stylized',
    },

    MINIMALIST: {
        id: 'MINIMALIST',
        name: 'Minimalist',
        description: 'Clean vectors with flat design',
        promptSuffix: ', minimalist, flat design, vector illustration, clean lines, limited color palette, modern, geometric, professional, simple shapes',
        negativePrompt: 'detailed, photorealistic, complex, busy, textured, realistic',
        aspectRatios: ['16:9', '1:1', '4:3'],
        sampleImage: '/samples/minimalist.jpg',
        category: 'modern',
    },

    SURREALIST: {
        id: 'SURREALIST',
        name: 'Surrealist',
        description: 'Dreamlike imagery with impossible geometry',
        promptSuffix: ', surrealist art, dreamlike, Salvador Dali style, impossible geometry, melting objects, symbolic imagery, mysterious atmosphere, subconscious',
        negativePrompt: 'realistic, normal, mundane, photographic, simple',
        aspectRatios: ['16:9', '4:3', '1:1'],
        sampleImage: '/samples/surrealist.jpg',
        category: 'artistic',
    },
} as const;

export type VisualStyleKey = keyof typeof VISUAL_STYLES;

/**
 * Get all visual styles as array
 */
export function getVisualStylesArray(): VisualStyle[] {
    return Object.values(VISUAL_STYLES);
}

/**
 * Get styles by category
 */
export function getStylesByCategory(category: VisualStyle['category']): VisualStyle[] {
    return Object.values(VISUAL_STYLES).filter(style => style.category === category);
}

/**
 * Get prompt suffix for a style
 */
export function getStylePromptSuffix(styleId: string): string {
    const style = VISUAL_STYLES[styleId as VisualStyleKey];
    return style?.promptSuffix || '';
}

/**
 * Get negative prompt for a style
 */
export function getStyleNegativePrompt(styleId: string): string {
    const style = VISUAL_STYLES[styleId as VisualStyleKey];
    return style?.negativePrompt || '';
}

/**
 * Available aspect ratios
 */
export const ASPECT_RATIOS = [
    { id: '16:9', label: '16:9', description: 'Standard widescreen' },
    { id: '4:3', label: '4:3', description: 'Classic TV format' },
    { id: '2.35:1', label: '2.35:1', description: 'Cinematic widescreen' },
    { id: '9:16', label: '9:16', description: 'Vertical/Mobile' },
    { id: '1:1', label: '1:1', description: 'Square' },
] as const;

export type AspectRatioId = (typeof ASPECT_RATIOS)[number]['id'];
