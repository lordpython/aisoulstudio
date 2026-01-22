import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CSSProperties } from "react";
import ArabicReshaper from "arabic-reshaper";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Reshapes Arabic text for proper rendering in Canvas.
 * Arabic letters have different forms (initial, medial, final, isolated)
 * that must be connected properly. Canvas doesn't do this natively.
 */
export function reshapeArabicText(text: string): string {
  if (!text || !isRTL(text)) return text;
  try {
    return ArabicReshaper.convertArabic(text);
  } catch (error) {
    console.warn('[reshapeArabicText] Failed to reshape Arabic text:', error);
    return text;
  }
}

/**
 * RTL Unicode ranges:
 * - Arabic: \u0600-\u06FF, \u0750-\u077F, \u08A0-\u08FF, \uFB50-\uFDFF, \uFE70-\uFEFF
 * - Hebrew: \u0590-\u05FF, \uFB1D-\uFB4F
 * - Syriac: \u0700-\u074F
 * - Thaana (Maldivian): \u0780-\u07BF
 * - N'Ko: \u07C0-\u07FF
 */
const RTL_REGEX =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF\uFB1D-\uFB4F\u0700-\u074F\u0780-\u07BF\u07C0-\u07FF]/;

/**
 * Detects if a string contains RTL (right-to-left) characters.
 * Supports Arabic, Hebrew, Farsi, Urdu, Syriac, Thaana, and N'Ko scripts.
 */
export function isRTL(text: string): boolean {
  if (!text) return false;
  return RTL_REGEX.test(text);
}

/**
 * Returns the appropriate text direction ('rtl' or 'ltr') for the given text.
 */
export function getTextDirection(text: string): "rtl" | "ltr" {
  return isRTL(text) ? "rtl" : "ltr";
}

/**
 * Returns CSS properties for proper RTL/LTR text rendering.
 */
export function getDirectionStyles(text: string): CSSProperties {
  const dir = getTextDirection(text);
  return {
    direction: dir,
    textAlign: dir === "rtl" ? "right" : "left",
    unicodeBidi: "isolate",
  };
}

export function applyPolyfills(ctx: CanvasRenderingContext2D) {
  if (!ctx.roundRect) {
    ctx.roundRect = function (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
    ) {
      if (typeof r === "number") {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
      } else {
        this.rect(x, y, w, h);
      }
    };
  }
}
