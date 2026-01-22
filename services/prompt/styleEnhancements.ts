/**
 * Style Enhancements
 * 
 * Style-specific technique keywords for authentic visual representation.
 * Extracted from promptService.ts for modularity.
 */

export interface StyleEnhancement {
    keywords: string[];
    mediumDescription: string;
}

/**
 * Style enhancement definitions for all art styles.
 */
const STYLE_ENHANCEMENTS: Record<string, StyleEnhancement> = {
    cinematic: {
        keywords: [
            "35mm film grain",
            "anamorphic lens flare",
            "shallow depth of field",
            "professional color grading",
            "dramatic three-point lighting",
            "cinematic aspect ratio",
            "volumetric light rays",
        ],
        mediumDescription: "cinematic movie still with professional cinematography, anamorphic lens characteristics, and dramatic lighting",
    },
    anime: {
        keywords: [
            "screentone shading",
            "speed lines",
            "expressive oversized eyes",
            "dynamic action poses",
            "cel-shaded flat colors",
            "clean ink linework",
            "shoujo sparkle effects",
            "dramatic wind hair movement",
        ],
        mediumDescription: "high-quality Japanese animation style with clean linework, cel shading, and Studio Ghibli-inspired aesthetic",
    },
    manga: {
        keywords: [
            "screentone shading",
            "speed lines",
            "expressive oversized eyes",
            "dynamic action poses",
            "cel-shaded flat colors",
            "clean ink linework",
            "shoujo sparkle effects",
            "dramatic wind hair movement",
        ],
        mediumDescription: "high-quality Japanese animation style with clean linework, cel shading, and Studio Ghibli-inspired aesthetic",
    },
    cyberpunk: {
        keywords: [
            "neon tube lighting",
            "holographic displays",
            "rain-slicked reflective streets",
            "chromatic aberration",
            "glitch artifacts",
            "teal and magenta color palette",
            "high contrast noir shadows",
            "retrofuturistic technology",
        ],
        mediumDescription: "futuristic cyberpunk aesthetic with neon-drenched cityscapes, rain effects, and Blade Runner-inspired atmosphere",
    },
    watercolor: {
        keywords: [
            "bleeding color edges",
            "wet-on-wet technique",
            "cold-pressed Arches paper texture",
            "pigment granulation",
            "transparent color washes",
            "soft diffused edges",
            "visible water bloom effects",
            "raw paper white highlights",
        ],
        mediumDescription: "authentic watercolor painting on textured paper with visible pigment flow, soft bleeding edges, and transparent washes",
    },
    aquarelle: {
        keywords: [
            "bleeding color edges",
            "wet-on-wet technique",
            "cold-pressed Arches paper texture",
            "pigment granulation",
            "transparent color washes",
            "soft diffused edges",
            "visible water bloom effects",
            "raw paper white highlights",
        ],
        mediumDescription: "authentic watercolor painting on textured paper with visible pigment flow, soft bleeding edges, and transparent washes",
    },
    oil: {
        keywords: [
            "impasto knife texture",
            "linseed oil sheen",
            "canvas weave texture",
            "thick paint ridges",
            "visible brushstroke direction",
            "rich saturated pigments",
            "chiaroscuro modeling",
            "glazed translucent layers",
        ],
        mediumDescription: "traditional oil painting on stretched canvas with visible impasto brushwork, rich pigment saturation, and classical technique",
    },
    pixel: {
        keywords: [
            "limited color palette",
            "dithering patterns",
            "aliased hard edges",
            "sprite-based characters",
            "8-bit or 16-bit aesthetic",
            "tile-based backgrounds",
            "scanline overlay",
            "CRT screen curvature",
        ],
        mediumDescription: "authentic retro pixel art with limited palette, dithering techniques, and nostalgic 16-bit video game aesthetic",
    },
    surreal: {
        keywords: [
            "impossible geometry",
            "melting clocks motif",
            "dreamlike distortion",
            "juxtaposed scale",
            "floating objects",
            "Dalí-esque symbolism",
            "Magritte-style paradox",
            "uncanny valley atmosphere",
        ],
        mediumDescription: "surrealist art style with dreamlike impossible imagery, symbolic juxtapositions, and Dalí/Magritte-inspired composition",
    },
    "dark fantasy": {
        keywords: [
            "grimdark atmosphere",
            "gothic architecture",
            "volumetric fog and mist",
            "flickering torchlight",
            "eldritch horror elements",
            "weathered stone textures",
            "blood moon lighting",
            "chiaroscuro shadows",
        ],
        mediumDescription: "dark fantasy art with gothic atmosphere, grimdark aesthetic, detailed textures, and ominous eldritch mood",
    },
    commercial: {
        keywords: [
            "studio softbox lighting",
            "infinity curve background",
            "product hero shot",
            "macro detail focus",
            "clean negative space",
            "aspirational lifestyle context",
            "high-key professional lighting",
            "advertisement composition",
        ],
        mediumDescription: "professional commercial photography with studio lighting, clean backgrounds, and product-focused hero composition",
    },
    ad: {
        keywords: [
            "studio softbox lighting",
            "infinity curve background",
            "product hero shot",
            "macro detail focus",
            "clean negative space",
            "aspirational lifestyle context",
            "high-key professional lighting",
            "advertisement composition",
        ],
        mediumDescription: "professional commercial photography with studio lighting, clean backgrounds, and product-focused hero composition",
    },
    minimalist: {
        keywords: [
            "flat vector shapes",
            "isometric perspective",
            "clean white background",
            "limited color palette",
            "geometric simplification",
            "infographic clarity",
            "sans-serif aesthetic",
            "educational diagram style",
        ],
        mediumDescription: "clean minimalist illustration with flat design, isometric elements, and educational infographic clarity",
    },
    tutorial: {
        keywords: [
            "flat vector shapes",
            "isometric perspective",
            "clean white background",
            "limited color palette",
            "geometric simplification",
            "infographic clarity",
            "sans-serif aesthetic",
            "educational diagram style",
        ],
        mediumDescription: "clean minimalist illustration with flat design, isometric elements, and educational infographic clarity",
    },
    comic: {
        keywords: [
            "bold ink outlines",
            "halftone dot patterns",
            "dynamic action lines",
            "Ben-Day dots shading",
            "vibrant superhero colors",
            "dramatic foreshortening",
            "Kirby crackle energy",
            "word balloon composition space",
        ],
        mediumDescription: "American comic book style with bold ink outlines, halftone patterns, dynamic action poses, and vibrant superhero aesthetic",
    },
    corporate: {
        keywords: [
            "Memphis design elements",
            "flat vector illustration",
            "professional blue tones",
            "clean geometric shapes",
            "tech startup aesthetic",
            "trustworthy composition",
            "modern sans-serif style",
            "abstract blob backgrounds",
        ],
        mediumDescription: "modern corporate design with Memphis style elements, flat vectors, and professional tech-startup aesthetic",
    },
    brand: {
        keywords: [
            "Memphis design elements",
            "flat vector illustration",
            "professional blue tones",
            "clean geometric shapes",
            "tech startup aesthetic",
            "trustworthy composition",
            "modern sans-serif style",
            "abstract blob backgrounds",
        ],
        mediumDescription: "modern corporate design with Memphis style elements, flat vectors, and professional tech-startup aesthetic",
    },
    photo: {
        keywords: [
            "DSLR 50mm lens",
            "natural ambient lighting",
            "shallow depth of field bokeh",
            "raw unedited appearance",
            "realistic skin texture",
            "natural color temperature",
            "documentary photography style",
            "candid moment capture",
        ],
        mediumDescription: "hyper-realistic photography with DSLR quality, natural lighting, and authentic documentary-style capture",
    },
    realistic: {
        keywords: [
            "DSLR 50mm lens",
            "natural ambient lighting",
            "shallow depth of field bokeh",
            "raw unedited appearance",
            "realistic skin texture",
            "natural color temperature",
            "documentary photography style",
            "candid moment capture",
        ],
        mediumDescription: "hyper-realistic photography with DSLR quality, natural lighting, and authentic documentary-style capture",
    },
    noir: {
        keywords: [
            "chiaroscuro lighting",
            "venetian blind shadows",
            "high contrast black and white",
            "cigarette smoke wisps",
            "rain-slicked streets",
            "fedora silhouettes",
            "1940s detective aesthetic",
            "expressionist angles",
        ],
        mediumDescription: "classic film noir cinematography with dramatic shadows, high contrast, and 1940s detective atmosphere",
    },
    charcoal: {
        keywords: [
            "paper grain texture",
            "smudged graphite gradients",
            "gestural mark-making",
            "tonal value range",
            "cross-hatching technique",
            "erased highlights",
            "vine charcoal softness",
            "fixative spray texture",
        ],
        mediumDescription: "hand-drawn sketch with visible paper texture, smudged charcoal gradients, and natural media characteristics",
    },
    sketch: {
        keywords: [
            "paper grain texture",
            "smudged graphite gradients",
            "gestural mark-making",
            "tonal value range",
            "cross-hatching technique",
            "erased highlights",
            "vine charcoal softness",
            "fixative spray texture",
        ],
        mediumDescription: "hand-drawn sketch with visible paper texture, smudged charcoal gradients, and natural media characteristics",
    },
    pencil: {
        keywords: [
            "paper grain texture",
            "smudged graphite gradients",
            "gestural mark-making",
            "tonal value range",
            "cross-hatching technique",
            "erased highlights",
            "vine charcoal softness",
            "fixative spray texture",
        ],
        mediumDescription: "hand-drawn sketch with visible paper texture, smudged charcoal gradients, and natural media characteristics",
    },
};

// Default fallback style
const DEFAULT_STYLE: StyleEnhancement = {
    keywords: [
        "cinematic depth of field",
        "professional color grading",
        "anamorphic lens characteristics",
        "dramatic atmospheric lighting",
    ],
    mediumDescription: "cinematic visual style with professional cinematography and dramatic composition",
};

/**
 * Get style-specific technique keywords to inject into prompts.
 */
/**
 * Get style-specific technique keywords to inject into prompts.
 */
export function getStyleEnhancement(style: string | undefined | null): StyleEnhancement {
    if (!style) {
        return DEFAULT_STYLE;
    }

    const styleLower = style.toLowerCase();

    // Check for exact matches first
    if (STYLE_ENHANCEMENTS[styleLower]) {
        return STYLE_ENHANCEMENTS[styleLower];
    }

    // Check for partial matches
    for (const [key, value] of Object.entries(STYLE_ENHANCEMENTS)) {
        if (styleLower.includes(key) || key.includes(styleLower)) {
            return value;
        }
    }

    return DEFAULT_STYLE;
}
