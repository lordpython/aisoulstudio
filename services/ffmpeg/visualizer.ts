/**
 * Visualizer Module
 *
 * Renders audio frequency visualizer as a mirrored spectrum display.
 * Supports multiple color schemes and configurable opacity/height.
 */

import { ExportConfig } from "./exportConfig";

/**
 * Render refined visualizer layer with reduced opacity and constrained height
 */
export function renderVisualizerLayer(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frequencyData: Uint8Array,
    previousFrequencyData: Uint8Array | null,
    config: NonNullable<ExportConfig["visualizerConfig"]>,
    useModernEffects: boolean,
    zone?: { top: number; height: number }
): void {
    const bufferLength = frequencyData.length;

    const zoneTop = zone?.top ?? 0;
    const zoneHeight = zone?.height ?? height;
    const baselineY = zoneTop + zoneHeight;

    const maxHeight = Math.min(zoneHeight, height * config.maxHeightRatio);
    const barWidth = config.barWidth;
    const barGap = config.barGap;

    ctx.save();

    // Hard clip to the visualizer zone so it never invades the lyric zone.
    ctx.beginPath();
    ctx.rect(0, zoneTop, width, zoneHeight);
    ctx.clip();

    // Set reduced opacity
    ctx.globalAlpha = config.opacity;

    // Create gradient based on color scheme
    const gradient = ctx.createLinearGradient(0, baselineY, 0, baselineY - maxHeight);

    switch (config.colorScheme) {
        case "cyan-purple":
            gradient.addColorStop(0, `rgba(34, 211, 238, ${config.opacity * 0.5})`);
            gradient.addColorStop(0.5, `rgba(34, 211, 238, ${config.opacity * 0.8})`);
            gradient.addColorStop(1, `rgba(167, 139, 250, ${config.opacity})`);
            break;
        case "rainbow":
            gradient.addColorStop(0, `rgba(255, 0, 0, ${config.opacity})`);
            gradient.addColorStop(0.2, `rgba(255, 165, 0, ${config.opacity})`);
            gradient.addColorStop(0.4, `rgba(255, 255, 0, ${config.opacity})`);
            gradient.addColorStop(0.6, `rgba(0, 255, 0, ${config.opacity})`);
            gradient.addColorStop(0.8, `rgba(0, 0, 255, ${config.opacity})`);
            gradient.addColorStop(1, `rgba(128, 0, 128, ${config.opacity})`);
            break;
        case "monochrome":
            gradient.addColorStop(0, `rgba(255, 255, 255, ${config.opacity * 0.3})`);
            gradient.addColorStop(1, `rgba(255, 255, 255, ${config.opacity})`);
            break;
    }

    ctx.fillStyle = gradient;

    // Optional: subtle glow for modern effects
    if (useModernEffects) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(34, 211, 238, ${config.opacity * 0.3})`;
    }

    // Render mirrored spectrum
    const centerX = width / 2;

    for (let i = 0; i < bufferLength; i++) {
        const freqVal = frequencyData[i];
        if (freqVal === undefined) continue;

        let value = freqVal;

        if (previousFrequencyData) {
            const prevVal = previousFrequencyData[i];
            if (prevVal !== undefined) {
                value = (value + prevVal) / 2;
            }
        }

        const barHeight = (value / 255) * maxHeight;

        if (barHeight > 0) {
            const offset = i * (barWidth + barGap);
            const radius = barWidth / 2;

            // Right side
            ctx.beginPath();
            if (useModernEffects) {
                ctx.roundRect(
                    centerX + offset,
                    baselineY - barHeight,
                    barWidth,
                    barHeight,
                    [radius, radius, 0, 0]
                );
            } else {
                ctx.rect(centerX + offset, baselineY - barHeight, barWidth, barHeight);
            }
            ctx.fill();

            // Left side (mirrored)
            ctx.beginPath();
            if (useModernEffects) {
                ctx.roundRect(
                    centerX - offset - barWidth,
                    baselineY - barHeight,
                    barWidth,
                    barHeight,
                    [radius, radius, 0, 0]
                );
            } else {
                ctx.rect(centerX - offset - barWidth, baselineY - barHeight, barWidth, barHeight);
            }
            ctx.fill();
        }
    }

    ctx.restore();
}
