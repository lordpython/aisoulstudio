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

/**
 * Get deterministic but varied Ken Burns movement based on asset index/time.
 * Uses better hash distribution across 10 movements.
 */
function getKenBurnsMovement(assetTime: number): KenBurnsMovement {
    const movements: KenBurnsMovement[] = [
        'zoom_in', 'zoom_out',
        'pan_left', 'pan_right', 'pan_up', 'pan_down',
        'zoom_in_pan_left', 'zoom_in_pan_right',
        'zoom_out_pan_up', 'zoom_out_pan_down',
    ];
    // Better hash: multiply by prime for more spread across sequential times
    const index = Math.floor(assetTime * 7.3) % movements.length;
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

    // Get natural dimensions
    const naturalWidth =
        asset.type === "video"
            ? (element as HTMLVideoElement).videoWidth
            : (element as HTMLImageElement).width;
    const naturalHeight =
        asset.type === "video"
            ? (element as HTMLVideoElement).videoHeight
            : (element as HTMLImageElement).height;

    // Validate dimensions (fallback for edge cases)
    if (naturalWidth === 0 || naturalHeight === 0) {
        console.warn(`[Transitions] Invalid asset dimensions (${naturalWidth}x${naturalHeight}), skipping frame`);
        ctx.restore();
        return;
    }

    // Handle Video Seek with reliable seeking
    if (asset.type === "video") {
        const vid = element as HTMLVideoElement;
        if (vid.duration && isFinite(vid.duration)) {
            // Loop logic: absolute time relative to slide start
            // offsetTime allows "peeking" into next slide for crossfade
            const relativeTime = currentTime + offsetTime - asset.time;
            // Ensure positive modulo for loop
            const targetTime = ((relativeTime % vid.duration) + vid.duration) % vid.duration;

            // Use reliable seeking with proper event handling
            await seekVideoToTime(vid, targetTime);
        }
    }

    // Base scale to cover canvas
    const baseScale = Math.max(width / naturalWidth, height / naturalHeight);
    
    if (useModernEffects) {
        // Get varied Ken Burns movement based on asset timing
        const movement = getKenBurnsMovement(asset.time);
        const intensity = 0.18; // 18% movement range (was 12%)
        const panDistance = 80; // pixels for pan movements (was 40)
        // Apply ease-in-out for organic camera motion
        const p = easeInOutCubic(progress);

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
            const naturalWidth = currentAsset.type === "video"
                ? (element as HTMLVideoElement).videoWidth
                : (element as HTMLImageElement).width;
            const naturalHeight = currentAsset.type === "video"
                ? (element as HTMLVideoElement).videoHeight
                : (element as HTMLImageElement).height;
            const scale = Math.max(width / naturalWidth, height / naturalHeight);
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
