/**
 * Transitions Module
 *
 * Handles scene-to-scene transition effects including fade, dissolve, zoom, and slide.
 * Also includes Ken Burns effect for image zoom during scenes.
 *
 * Enhanced with reliable video frame extraction using proper seeking.
 */

import { RenderAsset, ExportConfig } from "./exportConfig";
import { seekVideoToTime, getCachedFrame, cacheFrame } from "./assetLoader";
import { ffmpegLogger } from '../infrastructure/logger';

const log = ffmpegLogger.child('Transitions');

/**
 * Ken Burns movement types for visual variety.
 * Includes compound movements for more cinematic camera motion.
 */
type KenBurnsMovement =
    | 'zoom_in' | 'zoom_out'
    | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down'
    | 'zoom_in_pan_left' | 'zoom_in_pan_right'
    | 'zoom_out_pan_up' | 'zoom_out_pan_down';

/**
 * Ease-in-out cubic for organic camera motion
 */
function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const EASING_LUT_SIZE = 1024;
const EASING_LUT = Array.from(
    { length: EASING_LUT_SIZE },
    (_unused, index) => easeInOutCubic(index / (EASING_LUT_SIZE - 1))
);

function sampleEase(t: number): number {
    if (t <= 0) return EASING_LUT[0] ?? 0;
    if (t >= 1) return EASING_LUT[EASING_LUT_SIZE - 1] ?? 1;

    const scaled = t * (EASING_LUT_SIZE - 1);
    const low = Math.floor(scaled);
    const high = Math.min(EASING_LUT_SIZE - 1, low + 1);
    const frac = scaled - low;
    const lowValue = EASING_LUT[low] ?? 0;
    const highValue = EASING_LUT[high] ?? 1;
    return lowValue + (highValue - lowValue) * frac;
}

/**
 * Get deterministic but varied Ken Burns movement based on asset index/time.
 * Uses better hash distribution across 10 movements.
 */
function getKenBurnsMovement(assetId: string): KenBurnsMovement {
    const movements: KenBurnsMovement[] = [
        'zoom_in', 'zoom_out',
        'pan_left', 'pan_right', 'pan_up', 'pan_down',
        'zoom_in_pan_left', 'zoom_in_pan_right',
        'zoom_out_pan_up', 'zoom_out_pan_down',
    ];
    let hash = 2166136261;
    for (let i = 0; i < assetId.length; i++) {
        hash ^= assetId.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    const index = Math.abs(hash) % movements.length;
    return movements[index] || 'zoom_in';
}

/**
 * Draw a single asset with Ken Burns effect and opacity
 * Enhanced with varied movement types (zoom in/out, pan directions)
 * Uses reliable video seeking with proper event handling
 */
export async function drawAsset(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    asset: RenderAsset,
    currentTime: number,
    progress: number,
    opacity: number,
    useModernEffects: boolean,
    offsetTime: number = 0
): Promise<void> {
    ctx.save();
    ctx.globalAlpha = opacity;

    let scale: number;
    let x: number;
    let y: number;
    let drawWidth: number;
    let drawHeight: number;
    const element = asset.element;
    const naturalWidth = asset.naturalWidth;
    const naturalHeight = asset.naturalHeight;

    // Validate dimensions (fallback for edge cases)
    if (naturalWidth === 0 || naturalHeight === 0) {
        log.warn(`Invalid asset dimensions (${naturalWidth}x${naturalHeight}), skipping frame`);
        ctx.restore();
        return;
    }

    // Handle Video Seek with reliable seeking
    if (asset.type === "video") {
        const vid = element as HTMLVideoElement;
        if (vid.duration && isFinite(vid.duration)) {
            const relativeTime = currentTime + offsetTime - asset.time;

            // If asset has a nativeDuration and relative time exceeds it,
            // freeze on the last frame instead of looping (Issue 6: desync fix)
            let targetTime: number;
            if (asset.nativeDuration && relativeTime > asset.nativeDuration) {
                // Freeze on last frame (slightly before end to avoid black frame)
                targetTime = Math.max(0, asset.nativeDuration - 0.05);
            } else {
                // Normal loop behavior for music mode / short clips
                targetTime = ((relativeTime % vid.duration) + vid.duration) % vid.duration;
            }

            await seekVideoToTime(vid, targetTime);
        }
    }

    // Base scale to cover canvas
    const baseScale = asset.baseScale > 0
        ? asset.baseScale
        : Math.max(width / naturalWidth, height / naturalHeight);
    
    if (useModernEffects) {
        // Get varied Ken Burns movement based on asset timing
        const movement = getKenBurnsMovement(asset.id);
        const intensity = 0.18; // 18% movement range (was 12%)
        const panDistance = 80; // pixels for pan movements (was 40)
        // Apply ease-in-out for organic camera motion
        const p = sampleEase(progress);

        switch (movement) {
            case 'zoom_in':
                scale = baseScale * (1.0 + p * intensity);
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2;
                break;

            case 'zoom_out':
                scale = baseScale * (1.0 + intensity - p * intensity);
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2;
                break;

            case 'pan_left':
                scale = baseScale * 1.15;
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2 - (p * panDistance);
                y = (height - drawHeight) / 2;
                break;

            case 'pan_right':
                scale = baseScale * 1.15;
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2 + (p * panDistance);
                y = (height - drawHeight) / 2;
                break;

            case 'pan_up':
                scale = baseScale * 1.15;
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2 - (p * panDistance);
                break;

            case 'pan_down':
                // FIX: was adjusting x instead of y
                scale = baseScale * 1.15;
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2 + (p * panDistance);
                break;

            case 'zoom_in_pan_left':
                scale = baseScale * (1.0 + p * intensity);
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2 - (p * panDistance * 0.6);
                y = (height - drawHeight) / 2;
                break;

            case 'zoom_in_pan_right':
                scale = baseScale * (1.0 + p * intensity);
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2 + (p * panDistance * 0.6);
                y = (height - drawHeight) / 2;
                break;

            case 'zoom_out_pan_up':
                scale = baseScale * (1.0 + intensity - p * intensity);
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2 - (p * panDistance * 0.6);
                break;

            case 'zoom_out_pan_down':
                scale = baseScale * (1.0 + intensity - p * intensity);
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2 + (p * panDistance * 0.6);
                break;

            default:
                scale = baseScale * (1.0 + p * intensity);
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2;
        }
    } else {
        // Static fill
        scale = baseScale;
        drawWidth = naturalWidth * scale;
        drawHeight = naturalHeight * scale;
        x = (width - drawWidth) / 2;
        y = (height - drawHeight) / 2;
    }

    ctx.drawImage(element, x, y, drawWidth, drawHeight);
    ctx.restore();
}

export interface TransitionContext {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    currentTime: number;
    currentAsset: RenderAsset;
    nextAsset: RenderAsset;
    slideProgress: number;
    transitionProgress: number; // 0-1, how far into the transition
    config: ExportConfig;
}

/**
 * Apply transition effect between two assets
 */
export async function applyTransition(context: TransitionContext): Promise<void> {
    const {
        ctx,
        width,
        height,
        currentTime,
        currentAsset,
        nextAsset,
        slideProgress,
        transitionProgress: t,
        config,
    } = context;

    const timeUntilNext = nextAsset.time - currentTime;

    switch (config.transitionType) {
        case "fade": {
            // Fade through black
            if (t < 0.5) {
                // First half: fade out current to black
                await drawAsset(ctx, width, height, currentAsset, currentTime, slideProgress, 1 - t * 2, config.useModernEffects);
            } else {
                // Second half: fade in next from black
                await drawAsset(ctx, width, height, nextAsset, currentTime, 0, (t - 0.5) * 2, config.useModernEffects, -timeUntilNext);
            }
            break;
        }

        case "dissolve": {
            // Cross-dissolve (blend both)
            await drawAsset(ctx, width, height, currentAsset, currentTime, slideProgress, 1, config.useModernEffects);
            await drawAsset(ctx, width, height, nextAsset, currentTime, 0, t, config.useModernEffects, -timeUntilNext);
            break;
        }

        case "zoom": {
            // Zoom into current, then show next
            ctx.save();
            const zoomScale = 1 + t * 0.5; // Zoom up to 1.5x
            const centerX = width / 2;
            const centerY = height / 2;
            ctx.translate(centerX, centerY);
            ctx.scale(zoomScale, zoomScale);
            ctx.translate(-centerX, -centerY);
            ctx.globalAlpha = 1 - t;

            // Draw current (zooming in and fading out)
            const element = currentAsset.element;
            const naturalWidth = currentAsset.naturalWidth;
            const naturalHeight = currentAsset.naturalHeight;
            const scale = currentAsset.baseScale > 0
                ? currentAsset.baseScale
                : Math.max(width / naturalWidth, height / naturalHeight);
            const drawWidth = naturalWidth * scale;
            const drawHeight = naturalHeight * scale;
            const x = (width - drawWidth) / 2;
            const y = (height - drawHeight) / 2;
            ctx.drawImage(element, x, y, drawWidth, drawHeight);
            ctx.restore();

            // Draw next (fading in underneath)
            await drawAsset(ctx, width, height, nextAsset, currentTime, 0, t, config.useModernEffects, -timeUntilNext);
            break;
        }

        case "slide": {
            // Slide left - current slides out left, next slides in from right
            const slideOffset = t * width;

            // Draw current (sliding left)
            ctx.save();
            ctx.translate(-slideOffset, 0);
            await drawAsset(ctx, width, height, currentAsset, currentTime, slideProgress, 1, config.useModernEffects);
            ctx.restore();

            // Draw next (sliding in from right)
            ctx.save();
            ctx.translate(width - slideOffset, 0);
            await drawAsset(ctx, width, height, nextAsset, currentTime, 0, 1, config.useModernEffects, -timeUntilNext);
            ctx.restore();
            break;
        }

        default: {
            // Fallback: simple dissolve
            await drawAsset(ctx, width, height, currentAsset, currentTime, slideProgress, 1, config.useModernEffects);
            await drawAsset(ctx, width, height, nextAsset, currentTime, 0, t, config.useModernEffects, -timeUntilNext);
        }
    }
}
