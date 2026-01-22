/**
 * Subtitle Style Service
 * 
 * Provides theme-based subtitle styling that matches video content type.
 * Supports multiple preset themes with customizable colors, fonts, and effects.
 */

import { VideoPurpose } from "../constants";
import { EmotionalTone } from "../types";

/**
 * Subtitle style configuration for rendering
 */
export interface SubtitleStyle {
    /** Font family */
    fontFamily: string;
    /** Base font size (will be scaled based on video resolution) */
    fontSize: number;
    /** Primary text color (hex) */
    color: string;
    /** Text outline/stroke color (hex, optional) */
    strokeColor?: string;
    /** Stroke width in pixels */
    strokeWidth?: number;
    /** Shadow color (hex, optional) */
    shadowColor?: string;
    /** Shadow blur radius */
    shadowBlur?: number;
    /** Shadow offset X */
    shadowOffsetX?: number;
    /** Shadow offset Y */
    shadowOffsetY?: number;
    /** Background bar color (rgba) */
    backgroundColor?: string;
    /** Text glow effect color (for special effects) */
    glowColor?: string;
    /** Glow blur radius */
    glowRadius?: number;
    /** Letter spacing adjustment */
    letterSpacing?: number;
    /** Line height multiplier */
    lineHeight?: number;
    /** Text alignment */
    textAlign?: 'left' | 'center' | 'right';
    /** Vertical position (0-1, where 0=top, 1=bottom) */
    verticalPosition?: number;
    /** Enable text animation */
    animated?: boolean;
}

/**
 * Subtitle theme names
 */
export type SubtitleTheme =
    | 'documentary'
    | 'cinematic'
    | 'horror'
    | 'kids'
    | 'social'
    | 'romantic'
    | 'sci-fi'
    | 'minimalist'
    | 'retro'
    | 'neon';

/**
 * Predefined subtitle style themes
 */
export const SUBTITLE_THEMES: Record<SubtitleTheme, SubtitleStyle> = {
    documentary: {
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: 42,
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 2,
        shadowColor: 'rgba(0, 0, 0, 0.7)',
        shadowBlur: 4,
        shadowOffsetX: 2,
        shadowOffsetY: 2,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        lineHeight: 1.3,
        textAlign: 'center',
        verticalPosition: 0.85,
    },
    cinematic: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 44,
        color: '#F5F5F5',
        strokeColor: '#1A1A1A',
        strokeWidth: 1,
        shadowColor: 'rgba(0, 0, 0, 0.8)',
        shadowBlur: 8,
        shadowOffsetX: 0,
        shadowOffsetY: 3,
        letterSpacing: 1,
        lineHeight: 1.4,
        textAlign: 'center',
        verticalPosition: 0.88,
    },
    horror: {
        fontFamily: '"Creepster", "Chiller", cursive, serif',
        fontSize: 48,
        color: '#FF3333',
        strokeColor: '#8B0000',
        strokeWidth: 2,
        shadowColor: 'rgba(139, 0, 0, 0.9)',
        shadowBlur: 15,
        shadowOffsetX: 0,
        shadowOffsetY: 5,
        glowColor: '#FF0000',
        glowRadius: 20,
        letterSpacing: 2,
        lineHeight: 1.2,
        textAlign: 'center',
        verticalPosition: 0.80,
    },
    kids: {
        fontFamily: '"Comic Sans MS", "Bubblegum Sans", cursive',
        fontSize: 50,
        color: '#FFFF00',
        strokeColor: '#FF6600',
        strokeWidth: 4,
        shadowColor: 'rgba(255, 102, 0, 0.8)',
        shadowBlur: 0,
        shadowOffsetX: 4,
        shadowOffsetY: 4,
        lineHeight: 1.3,
        textAlign: 'center',
        verticalPosition: 0.82,
        animated: true,
    },
    social: {
        fontFamily: '"Montserrat", "Roboto", sans-serif',
        fontSize: 38,
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 3,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowBlur: 2,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        lineHeight: 1.2,
        textAlign: 'center',
        verticalPosition: 0.90,
    },
    romantic: {
        fontFamily: '"Playfair Display", "Didot", serif',
        fontSize: 40,
        color: '#FFE4E1',
        strokeColor: '#8B4557',
        strokeWidth: 1,
        shadowColor: 'rgba(139, 69, 87, 0.6)',
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        glowColor: 'rgba(255, 182, 193, 0.5)',
        glowRadius: 15,
        letterSpacing: 1,
        lineHeight: 1.5,
        textAlign: 'center',
        verticalPosition: 0.85,
    },
    'sci-fi': {
        fontFamily: '"Orbitron", "Share Tech Mono", monospace',
        fontSize: 36,
        color: '#00FFFF',
        strokeColor: '#003366',
        strokeWidth: 2,
        shadowColor: 'rgba(0, 255, 255, 0.5)',
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        glowColor: '#00FFFF',
        glowRadius: 25,
        letterSpacing: 3,
        lineHeight: 1.3,
        textAlign: 'center',
        verticalPosition: 0.88,
    },
    minimalist: {
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        fontSize: 36,
        color: '#FFFFFF',
        strokeWidth: 0,
        shadowColor: 'rgba(0, 0, 0, 0.3)',
        shadowBlur: 2,
        shadowOffsetX: 0,
        shadowOffsetY: 1,
        lineHeight: 1.4,
        textAlign: 'center',
        verticalPosition: 0.90,
    },
    retro: {
        fontFamily: '"VT323", "Press Start 2P", monospace',
        fontSize: 32,
        color: '#00FF00',
        strokeColor: '#003300',
        strokeWidth: 2,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        lineHeight: 1.2,
        textAlign: 'center',
        verticalPosition: 0.85,
    },
    neon: {
        fontFamily: '"Neon", "Broadway", sans-serif',
        fontSize: 44,
        color: '#FF00FF',
        strokeColor: '#660066',
        strokeWidth: 1,
        shadowColor: 'rgba(255, 0, 255, 0.9)',
        shadowBlur: 20,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        glowColor: '#FF00FF',
        glowRadius: 30,
        letterSpacing: 2,
        lineHeight: 1.3,
        textAlign: 'center',
        verticalPosition: 0.85,
    },
};

/**
 * Map video purpose to recommended subtitle theme
 */
const PURPOSE_THEME_MAP: Partial<Record<VideoPurpose, SubtitleTheme>> = {
    documentary: 'documentary',
    music_video: 'cinematic',
    social_short: 'social',
    commercial: 'minimalist',
    podcast_visual: 'documentary',
    lyric_video: 'neon',
    tutorial: 'minimalist',
    vlog: 'social',
    news: 'documentary',
    entertainment: 'cinematic',
};

/**
 * Map emotional tone to theme adjustments
 */
const TONE_THEME_MAP: Partial<Record<EmotionalTone, SubtitleTheme>> = {
    dramatic: 'cinematic',
    calm: 'minimalist',
    urgent: 'social',
    professional: 'documentary',
    friendly: 'social',
};

/**
 * Get the best subtitle style for given context
 * 
 * @param purpose - Video purpose (optional)
 * @param tone - Emotional tone (optional)
 * @param overrideTheme - Explicit theme override (optional)
 * @returns SubtitleStyle configuration
 */
export function getSubtitleStyle(
    purpose?: VideoPurpose,
    tone?: EmotionalTone,
    overrideTheme?: SubtitleTheme
): SubtitleStyle {
    // If explicit theme provided, use it
    if (overrideTheme && SUBTITLE_THEMES[overrideTheme]) {
        return SUBTITLE_THEMES[overrideTheme];
    }

    // Try to match by purpose first
    if (purpose && PURPOSE_THEME_MAP[purpose]) {
        return SUBTITLE_THEMES[PURPOSE_THEME_MAP[purpose]!];
    }

    // Fall back to tone-based selection
    if (tone && TONE_THEME_MAP[tone]) {
        return SUBTITLE_THEMES[TONE_THEME_MAP[tone]!];
    }

    // Default to documentary style
    return SUBTITLE_THEMES.documentary;
}

/**
 * Apply a subtitle style to canvas context for rendering
 */
export function applySubtitleStyle(
    ctx: CanvasRenderingContext2D,
    style: SubtitleStyle,
    scale: number = 1
): void {
    // Font
    ctx.font = `${Math.round(style.fontSize * scale)}px ${style.fontFamily}`;
    ctx.textAlign = style.textAlign || 'center';
    ctx.textBaseline = 'middle';

    // Text color
    ctx.fillStyle = style.color;

    // Shadow
    if (style.shadowColor) {
        ctx.shadowColor = style.shadowColor;
        ctx.shadowBlur = (style.shadowBlur || 0) * scale;
        ctx.shadowOffsetX = (style.shadowOffsetX || 0) * scale;
        ctx.shadowOffsetY = (style.shadowOffsetY || 0) * scale;
    }

    // Stroke
    if (style.strokeColor && style.strokeWidth && style.strokeWidth > 0) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth * scale;
    }
}

/**
 * Get available theme names
 */
export function getAvailableThemes(): SubtitleTheme[] {
    return Object.keys(SUBTITLE_THEMES) as SubtitleTheme[];
}
