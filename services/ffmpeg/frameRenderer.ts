/**
 * Frame Renderer Module
 *
 * Main frame composition orchestrator that combines visuals, subtitles,
 * visualizer, and overlays into a single rendered frame.
 */

import { SongData } from "../../types";
import { LAYOUT_PRESETS } from "../../constants/layout";
import { isRTL, reshapeArabicText } from "../../lib/utils";
import { ExportConfig, RenderAsset } from "./exportConfig";
import { renderTextWithWipe } from "./textRenderer";
import { renderVisualizerLayer } from "./visualizer";
import { drawAsset, applyTransition } from "./transitions";

/**
 * Get zone bounds from normalized coordinates
 */
function getZoneBounds(
    zone: { x: number; y: number; width: number; height: number },
    canvasWidth: number,
    canvasHeight: number
): { x: number; y: number; width: number; height: number } {
    return {
        x: zone.x * canvasWidth,
        y: zone.y * canvasHeight,
        width: zone.width * canvasWidth,
        height: zone.height * canvasHeight,
    };
}

/**
 * Render a complete frame to canvas
 */
export async function renderFrameToCanvas(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    currentTime: number,
    assets: RenderAsset[],
    subtitles: SongData["parsedSubtitles"],
    frequencyData: Uint8Array | null,
    previousFrequencyData: Uint8Array | null,
    config: ExportConfig
): Promise<void> {
    // 1. Background (Black)
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    // Layout zones
    const layoutPreset =
        config.orientation === "portrait"
            ? LAYOUT_PRESETS.portrait
            : LAYOUT_PRESETS.landscape;

    const zones = {
        visualizer: getZoneBounds(layoutPreset.zones.visualizer, width, height),
        text: getZoneBounds(layoutPreset.zones.text, width, height),
        translation: getZoneBounds(layoutPreset.zones.translation, width, height),
    };

    // 2. Visual Layer with Ken Burns & Transitions
    let currentIndex = 0;
    for (let i = 0; i < assets.length; i++) {
        if (currentTime >= assets[i].time) {
            currentIndex = i;
        } else {
            break;
        }
    }

    const currentAsset = assets[currentIndex];
    const nextAsset = assets[currentIndex + 1];

    // Calculate duration of current slide
    const slideStartTime = currentAsset?.time ?? 0;
    const slideEndTime = nextAsset ? nextAsset.time : slideStartTime + 30;
    const slideDuration = slideEndTime - slideStartTime;
    const slideProgress = (currentTime - slideStartTime) / slideDuration;

    if (currentAsset?.element) {
        const TRANSITION_DURATION = config.transitionDuration || 1.5;
        const timeUntilNext = nextAsset ? nextAsset.time - currentTime : Infinity;
        const isTransitioning = timeUntilNext < TRANSITION_DURATION && nextAsset;

        if (config.transitionType === "none" || !isTransitioning) {
            const useKenBurns = config.useModernEffects && config.transitionType !== "none";
            await drawAsset(ctx, width, height, currentAsset, currentTime, useKenBurns ? slideProgress : 0, 1, config.useModernEffects);
        } else {
            const t = 1 - timeUntilNext / TRANSITION_DURATION;
            await applyTransition({
                ctx,
                width,
                height,
                currentTime,
                currentAsset,
                nextAsset,
                slideProgress,
                transitionProgress: t,
                config,
            });
        }
    }

    // 3. Visualizer Layer
    if (frequencyData && config.contentMode === "music" && config.visualizerConfig?.enabled) {
        renderVisualizerLayer(
            ctx,
            width,
            height,
            frequencyData,
            previousFrequencyData,
            config.visualizerConfig,
            config.useModernEffects,
            { top: zones.visualizer.y, height: zones.visualizer.height }
        );
    }

    // 4. Gradient Overlay
    if (config.useModernEffects) {
        const overlayGradient = ctx.createLinearGradient(0, height, 0, 0);
        overlayGradient.addColorStop(0, "rgba(2, 6, 23, 0.95)");
        overlayGradient.addColorStop(0.3, "rgba(2, 6, 23, 0.6)");
        overlayGradient.addColorStop(0.7, "rgba(2, 6, 23, 0.2)");
        overlayGradient.addColorStop(1, "rgba(2, 6, 23, 0.4)");
        ctx.fillStyle = overlayGradient;
        ctx.fillRect(0, 0, width, height);
    } else {
        const overlayGradient = ctx.createLinearGradient(0, height, 0, height / 2);
        overlayGradient.addColorStop(0, "rgba(15, 23, 42, 0.9)");
        overlayGradient.addColorStop(1, "rgba(15, 23, 42, 0.0)");
        ctx.fillStyle = overlayGradient;
        ctx.fillRect(0, 0, width, height);
    }

    // 5. Subtitles
    const adjustedTime = currentTime + config.syncOffsetMs / 1000;
    const activeSub = subtitles.find(
        (s) => adjustedTime >= s.startTime && adjustedTime <= s.endTime
    );

    let subtitleOpacity = 1.0;
    if (config.fadeOutBeforeCut) {
        const fadeOutDuration = 0.3;
        const timeUntilCut = slideEndTime - currentTime;
        if (timeUntilCut < fadeOutDuration && timeUntilCut > 0) {
            subtitleOpacity = timeUntilCut / fadeOutDuration;
        }
    }

    if (activeSub && subtitleOpacity > 0) {
        renderSubtitles(ctx, width, height, activeSub, adjustedTime, subtitleOpacity, zones, config);
    }
}

/**
 * Analyze frame brightness to find safe zone for text placement.
 * Returns vertical offset adjustment based on brightness in lower third.
 * 
 * Algorithm:
 * 1. Sample pixels in the lower third (where subtitles typically go)
 * 2. Divide into horizontal bands
 * 3. Find the darkest band for optimal text visibility
 * 
 * @param ctx - Canvas context
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Vertical offset adjustment (negative = move up, positive = move down)
 */
function analyzeSafeTextZone(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
): { verticalOffset: number; optimalY: number; brightness: number } {
    const lowerThirdStart = Math.floor(height * 0.65);
    const sampleHeight = Math.floor(height * 0.30);

    // Get image data for lower third
    let imageData: ImageData;
    try {
        imageData = ctx.getImageData(0, lowerThirdStart, width, sampleHeight);
    } catch (e) {
        // Fallback if getImageData fails (e.g., cross-origin)
        return { verticalOffset: 0, optimalY: height * 0.85, brightness: 0.5 };
    }

    const data = imageData.data;
    const numBands = 5; // Divide lower third into 5 horizontal bands
    const bandHeight = Math.floor(sampleHeight / numBands);
    const bandBrightness: number[] = [];

    // Calculate average brightness for each band
    for (let band = 0; band < numBands; band++) {
        const bandStart = band * bandHeight;
        const bandEnd = bandStart + bandHeight;
        let totalBrightness = 0;
        let pixelCount = 0;

        // Sample every 4th column for performance
        for (let y = bandStart; y < bandEnd; y += 2) {
            for (let x = 0; x < width; x += 4) {
                const idx = (y * width + x) * 4;
                // Luminance formula: 0.299*R + 0.587*G + 0.114*B
                const r = data[idx] || 0;
                const g = data[idx + 1] || 0;
                const b = data[idx + 2] || 0;
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                totalBrightness += luminance / 255;
                pixelCount++;
            }
        }

        bandBrightness.push(pixelCount > 0 ? totalBrightness / pixelCount : 0.5);
    }

    // Find the darkest band (best for white text)
    let darkestBand = 0;
    let minBrightness = bandBrightness[0];

    for (let i = 1; i < bandBrightness.length; i++) {
        if (bandBrightness[i] < minBrightness) {
            minBrightness = bandBrightness[i];
            darkestBand = i;
        }
    }

    // Calculate optimal Y position
    const optimalY = lowerThirdStart + (darkestBand + 0.5) * bandHeight;
    const defaultY = height * 0.85;

    // Limit vertical adjustment to prevent subtitles from going too high or low
    const maxOffset = height * 0.1;
    const rawOffset = optimalY - defaultY;
    const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));

    return {
        verticalOffset: clampedOffset,
        optimalY: defaultY + clampedOffset,
        brightness: minBrightness,
    };
}

/**
 * Render subtitles with word-level karaoke highlighting
 */
function renderSubtitles(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    activeSub: SongData["parsedSubtitles"][0],
    adjustedTime: number,
    subtitleOpacity: number,
    zones: { text: { x: number; y: number; width: number; height: number }; translation: { x: number; y: number; width: number; height: number } },
    config: ExportConfig
): void {
    ctx.save();
    ctx.globalAlpha = subtitleOpacity;

    const totalDuration = activeSub.endTime - activeSub.startTime;
    const lineProgress = Math.max(0, Math.min(1, (adjustedTime - activeSub.startTime) / totalDuration));

    const fontSize = config.orientation === "portrait" ? 36 : 42;
    const fontWeight = config.useModernEffects ? "600" : "bold";
    ctx.font = `${fontWeight} ${fontSize}px "Inter", "Segoe UI", "Arial", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const isTextRTL = isRTL(activeSub.text);
    const hasWordTiming = config.wordLevelHighlight && activeSub.words && activeSub.words.length > 0;

    const displayWords = hasWordTiming
        ? activeSub.words!.map((w) => isTextRTL ? reshapeArabicText(w.word) : w.word)
        : (isTextRTL ? reshapeArabicText(activeSub.text) : activeSub.text).split(" ");

    // Text wrapping
    const maxWidth = zones.text.width - (config.orientation === "portrait" ? 80 : 140);
    const wrappedLines: { words: string[]; wordIndices: number[] }[] = [];
    let currentLine: string[] = [];
    let currentLineIndices: number[] = [];
    let currentLineWidth = 0;

    displayWords.forEach((word, idx) => {
        const wordWidth = ctx.measureText(word + " ").width;
        if (currentLineWidth + wordWidth > maxWidth && currentLine.length > 0) {
            wrappedLines.push({ words: currentLine, wordIndices: currentLineIndices });
            currentLine = [word];
            currentLineIndices = [idx];
            currentLineWidth = wordWidth;
        } else {
            currentLine.push(word);
            currentLineIndices.push(idx);
            currentLineWidth += wordWidth;
        }
    });
    if (currentLine.length > 0) {
        wrappedLines.push({ words: currentLine, wordIndices: currentLineIndices });
    }

    const lineHeight = fontSize * 1.3;
    const totalTextHeight = wrappedLines.length * lineHeight;
    const baseY = zones.text.y + zones.text.height / 2 - totalTextHeight / 2;

    // Background bar
    const bgPadding = { x: 20, y: 10 };
    const maxLineWidth = Math.max(...wrappedLines.map(line => ctx.measureText(line.words.join(" ")).width));
    const bgWidth = maxLineWidth + bgPadding.x * 2;
    const bgHeight = totalTextHeight + bgPadding.y * 2;
    const bgX = zones.text.x + (zones.text.width - bgWidth) / 2;
    const bgY = baseY - bgPadding.y;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.70)";
    ctx.beginPath();
    const radius = 8;
    ctx.moveTo(bgX + radius, bgY);
    ctx.lineTo(bgX + bgWidth - radius, bgY);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
    ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
    ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight);
    ctx.lineTo(bgX + radius, bgY + bgHeight);
    ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
    ctx.lineTo(bgX, bgY + radius);
    ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Render words
    wrappedLines.forEach((lineData, lineIdx) => {
        const yPos = baseY + lineIdx * lineHeight;
        const lineText = lineData.words.join(" ");
        const lineWidth = ctx.measureText(lineText).width;

        let xPos = isTextRTL
            ? zones.text.x + (zones.text.width + lineWidth) / 2
            : zones.text.x + (zones.text.width - lineWidth) / 2;

        lineData.words.forEach((word, wordIdx) => {
            const globalWordIdx = lineData.wordIndices[wordIdx];
            const wordWidth = ctx.measureText(word).width;
            const spaceWidth = ctx.measureText(" ").width;

            if (isTextRTL) {
                xPos -= wordWidth;
            }

            // Calculate word progress
            let wordProgress = 0;
            let isActiveWord = false;
            let wordDuration = 0;

            if (hasWordTiming && activeSub.words![globalWordIdx]) {
                const wordTiming = activeSub.words![globalWordIdx];
                const wordStart = wordTiming.startTime;
                const wordEnd = wordTiming.endTime;
                wordDuration = wordEnd - wordStart;

                if (adjustedTime >= wordEnd) {
                    wordProgress = 1;
                } else if (adjustedTime >= wordStart) {
                    const revealDuration = config.textAnimationConfig?.revealDuration ?? (wordEnd - wordStart);
                    const revealWindow = Math.max(0.05, Math.min(revealDuration, wordEnd - wordStart));
                    wordProgress = (adjustedTime - wordStart) / revealWindow;
                    isActiveWord = true;
                }
            } else {
                // Fallback progress calculation
                const originalWords = hasWordTiming ? activeSub.words!.map((w) => w.word) : activeSub.text.split(" ");
                const originalFullText = originalWords.join(" ");
                const charsBefore = originalWords.slice(0, globalWordIdx).join(" ").length;
                const totalChars = originalFullText.length;
                const wordStartProgress = charsBefore / totalChars;
                const wordEndProgress = (charsBefore + word.length) / totalChars;

                if (lineProgress >= wordEndProgress) {
                    wordProgress = 1;
                } else if (lineProgress >= wordStartProgress) {
                    wordProgress = (lineProgress - wordStartProgress) / (wordEndProgress - wordStartProgress);
                    isActiveWord = true;
                }
            }

            // Render word
            if (config.textAnimationConfig) {
                renderTextWithWipe(
                    ctx,
                    word,
                    xPos,
                    yPos,
                    fontSize,
                    wordProgress,
                    config.textAnimationConfig.revealDirection,
                    isTextRTL
                );
            } else if (config.useModernEffects) {
                renderModernWord(ctx, word, xPos, yPos, wordWidth, wordProgress, isActiveWord, wordDuration, isTextRTL);
            } else {
                renderSimpleWord(ctx, word, xPos, yPos, wordProgress);
            }

            // Update position
            if (isTextRTL) {
                xPos -= spaceWidth;
            } else {
                xPos += wordWidth + spaceWidth;
            }
        });
    });

    // Translation
    if (activeSub.translation) {
        renderTranslation(ctx, width, activeSub.translation, zones.translation, config);
    }

    ctx.restore();
}

/**
 * Render word with modern glow effects
 */
function renderModernWord(
    ctx: CanvasRenderingContext2D,
    word: string,
    xPos: number,
    yPos: number,
    wordWidth: number,
    wordProgress: number,
    isActiveWord: boolean,
    wordDuration: number,
    isTextRTL: boolean
): void {
    ctx.save();

    let emphasisScale = 1.0;
    let emphasisGlow = false;
    if (isActiveWord && wordDuration > 0.5) {
        emphasisScale = 1.0 + wordProgress * 0.06;
        emphasisGlow = true;
    }

    ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.textAlign = "left";
    ctx.strokeText(word, xPos, yPos);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillText(word, xPos, yPos);

    if (wordProgress > 0) {
        ctx.save();
        if (emphasisScale > 1) {
            ctx.translate(xPos + wordWidth / 2, yPos);
            ctx.scale(emphasisScale, emphasisScale);
            ctx.translate(-(xPos + wordWidth / 2), -yPos);
        }

        let gradient: CanvasGradient;
        if (isTextRTL) {
            gradient = ctx.createLinearGradient(xPos + wordWidth, 0, xPos, 0);
        } else {
            gradient = ctx.createLinearGradient(xPos, 0, xPos + wordWidth, 0);
        }
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(Math.max(0, wordProgress - 0.05), "#ffffff");
        gradient.addColorStop(Math.min(1, wordProgress + 0.05), "rgba(255,255,255,0)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;

        if (isActiveWord || emphasisGlow) {
            ctx.shadowColor = "rgba(255, 215, 100, 0.9)";
            ctx.shadowBlur = emphasisGlow ? 30 : 20;
        }

        ctx.fillText(word, xPos, yPos);
        ctx.restore();
    }

    ctx.restore();
}

/**
 * Render word with simple styling
 */
function renderSimpleWord(
    ctx: CanvasRenderingContext2D,
    word: string,
    xPos: number,
    yPos: number,
    wordProgress: number
): void {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.textAlign = "left";
    ctx.strokeText(word, xPos, yPos);

    if (wordProgress >= 1) {
        ctx.fillStyle = "#ffffff";
    } else if (wordProgress > 0) {
        ctx.fillStyle = "#ffd700";
    } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    }
    ctx.fillText(word, xPos, yPos);
    ctx.restore();
}

/**
 * Render translation text
 */
function renderTranslation(
    ctx: CanvasRenderingContext2D,
    width: number,
    translation: string,
    zone: { x: number; y: number; width: number; height: number },
    config: ExportConfig
): void {
    const transY = zone.y + zone.height / 2;
    ctx.textAlign = "center";

    if (config.useModernEffects) {
        const transFontSize = config.orientation === "portrait" ? 36 : 42;
        ctx.font = `500 ${transFontSize}px "Inter", "Segoe UI", "Arial", sans-serif`;
        const transWidth = ctx.measureText(translation).width;
        const padding = 32;

        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.beginPath();
        ctx.roundRect(
            width / 2 - transWidth / 2 - padding,
            transY - transFontSize / 2 - 8,
            transWidth + padding * 2,
            transFontSize + 16,
            24
        );
        ctx.fill();

        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 4;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(translation, width / 2, transY + 2);
    } else {
        const transFontSize = config.orientation === "portrait" ? 32 : 38;
        ctx.font = `italic ${transFontSize}px "Inter", "Arial", sans-serif`;
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
        ctx.lineWidth = 3;
        ctx.strokeText(translation, width / 2, transY);
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.fillText(translation, width / 2, transY);
        ctx.shadowBlur = 0;
    }
}
