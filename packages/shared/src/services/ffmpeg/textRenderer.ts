/**
 * Text Renderer Module
 *
 * Handles text/subtitle rendering with karaoke-style word reveal animations.
 * Supports RTL languages (Arabic, Hebrew) and multiple reveal directions.
 */

import { ExportConfig } from "./exportConfig";

/**
 * Calculate word reveal progress for wipe animation
 * Note: For RTL text, we no longer reverse indices - the rendering handles RTL positioning
 * 
 * Enhanced: Uses actual word timing data instead of hardcoded 0.3s duration
 * for precise sync with narration/TTS output.
 */
export function calculateWordRevealProgress(
    currentTime: number,
    subtitle: { words?: { startTime: number; endTime: number; word: string }[] },
    _isRTL: boolean // kept for API compatibility but no longer used for reversal
): number[] {
    if (!subtitle.words || subtitle.words.length === 0) {
        return [1]; // Full reveal for non-word-timed
    }

    const progress: number[] = [];

    subtitle.words.forEach((word, idx) => {
        const wordStart = word.startTime;
        const wordEnd = word.endTime;
        
        // Calculate actual duration from timestamp data for precise sync
        const actualDuration = Math.max(0.1, wordEnd - wordStart); // Min 100ms to avoid division issues

        // Use natural index - RTL positioning is handled in rendering
        if (currentTime < wordStart) {
            progress[idx] = 0;
        } else if (currentTime >= wordEnd) {
            progress[idx] = 1;
        } else {
            // Reveal based on actual word duration from timing data
            progress[idx] = Math.min(1, (currentTime - wordStart) / actualDuration);
        }
    });

    return progress;
}

/**
 * Render text with directional wipe animation
 * Draws both inactive (ghost) and active (revealed) text with professional styling
 */
export function renderTextWithWipe(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    progress: number, // 0-1 animation progress
    revealDirection: NonNullable<ExportConfig["textAnimationConfig"]>["revealDirection"],
    isTextRTL: boolean
): void {
    const textWidth = ctx.measureText(text).width;
    const clipHeight = fontSize * 1.6;
    const clipTop = y - clipHeight / 2;

    // If text is RTL, force RTL unless caller explicitly chooses a center wipe.
    const effectiveDirection =
        (isTextRTL && (revealDirection === "ltr" || revealDirection === "rtl"))
            ? "rtl"
            : revealDirection;

    const clamped = Math.max(0, Math.min(1, progress));

    // First, draw the ghost (inactive) text - full width, dimmed
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillText(text, x, y);
    ctx.restore();

    // Then draw the revealed (active) text with clipping
    if (clamped > 0) {
        ctx.save();
        ctx.beginPath();

        if (effectiveDirection === "rtl") {
            // RTL: Reveal from right to left
            const revealWidth = textWidth * clamped;
            ctx.rect(x + textWidth - revealWidth, clipTop, revealWidth, clipHeight);
        } else if (effectiveDirection === "ltr") {
            // LTR: Reveal from left to right
            const revealWidth = textWidth * clamped;
            ctx.rect(x, clipTop, revealWidth, clipHeight);
        } else if (effectiveDirection === "center-out") {
            // Center-out: expand from center
            const revealWidth = textWidth * clamped;
            const left = x + (textWidth - revealWidth) / 2;
            ctx.rect(left, clipTop, revealWidth, clipHeight);
        } else {
            // center-in: shrink towards center (reverse feel)
            const revealWidth = textWidth * (1 - clamped);
            const left = x + (textWidth - revealWidth) / 2;
            ctx.rect(left, clipTop, revealWidth, clipHeight);
        }

        ctx.clip();

        // Draw bright white revealed text with glow
        ctx.shadowColor = "rgba(255, 215, 100, 0.8)";
        ctx.shadowBlur = 15;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x, y);
        ctx.restore();
    }
}
