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
 * Ken Burns movement types for visual variety
 */
type KenBurnsMovement = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down';

/**
 * Get deterministic but varied Ken Burns movement based on asset index/time
 * This ensures variety across scenes while being reproducible
 */
function getKenBurnsMovement(assetTime: number): KenBurnsMovement {
    const movements: KenBurnsMovement[] = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down'];
    // Use asset start time to pick movement - deterministic but varied
    const index = Math.floor(assetTime) % movements.length;
    return movements[index];
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
        const intensity = 0.12; // 12% movement range
        const panDistance = 40; // pixels for pan movements
        
        switch (movement) {
            case 'zoom_in':
                // Classic Ken Burns: Zoom from 1.0 to 1.12
                scale = baseScale * (1.0 + progress * intensity);
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2;
                break;
                
            case 'zoom_out':
                // Reverse: Zoom from 1.12 to 1.0
                scale = baseScale * (1.0 + intensity - progress * intensity);
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2;
                break;
                
            case 'pan_left':
                // Pan from right to left (image moves left, camera pans right)
                scale = baseScale * 1.1; // Slight zoom to allow pan room
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2 - (progress * panDistance);
                y = (height - drawHeight) / 2;
                break;
                
            case 'pan_right':
                // Pan from left to right
                scale = baseScale * 1.1;
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2 + (progress * panDistance);
                y = (height - drawHeight) / 2;
                break;
                
            case 'pan_up':
                // Pan from bottom to top
                scale = baseScale * 1.1;
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2;
                y = (height - drawHeight) / 2 - (progress * panDistance);
                break;
                
            case 'pan_down':
                // Pan from top to bottom
                scale = baseScale * 1.1;
                drawWidth = naturalWidth * scale;
                drawHeight = naturalHeight * scale;
                x = (width - drawWidth) / 2 + (progress * panDistance);
                y = (height - drawHeight) / 2;
                break;
                
            default:
                // Fallback to zoom in
                scale = baseScale * (1.0 + progress * intensity);
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
