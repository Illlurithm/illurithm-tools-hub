/**
 * Shared types for the cloud Vision OCR layout pipeline.
 *
 * Coordinates are normalized (0..1) against the page image so the same document
 * description can be rendered at any page size.
 */

export type VisionAlign = "left" | "center" | "right";

export type VisionTextBlock = {
  type: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  font_size_pt: number;
  bold: boolean;
  align: VisionAlign;
  script: "latin" | "devanagari" | "mixed";
  /** Cell background fill as a hex colour (e.g. "#4A4A4A") when the source cell is shaded. */
  bg_color?: string;
  /** Text colour as a hex colour when it is not near-black. */
  text_color?: string;
  /** True when the source text sits inside a printed rectangular form cell. */
  bordered?: boolean;
};

export type VisionImageBlock = {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  /** photo | emblem | logo | qr | barcode | signature | other */
  label: string;
};

export type VisionBlock = VisionTextBlock | VisionImageBlock;

export type VisionRule = {
  /** Normalized position/length of a horizontal rule or table grid line. */
  x: number;
  y: number;
  w: number;
  orientation: "horizontal" | "vertical";
};

export type VisionPage = {
  name: string;
  /** Page image size in pixels (used for cropping and page geometry). */
  width: number;
  height: number;
  blocks: VisionBlock[];
  rules: VisionRule[];
};

/** Unicode-safe font fallbacks so Devanagari never renders as boxes in Word. */
export const LATIN_FONT = "Arial";
export const DEVANAGARI_FONT = "Noto Sans Devanagari";
export const DEVANAGARI_FALLBACKS = ["Nirmala UI", "Mangal", "Arial Unicode MS"];

export const hasDevanagari = (value: string) => /[\u0900-\u097F]/.test(value);

export function fontFor(text: string) {
  return hasDevanagari(text) ? DEVANAGARI_FONT : LATIN_FONT;
}

/** Language hint sent to the Vision model, derived from the UI language pack. */
export const VISION_LANGUAGE_HINTS: Record<string, string> = {
  en: "English",
  en_hi_mr: "English, Hindi and Marathi (Devanagari script)",
  en_es: "English and Spanish",
};

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Groups blocks that share a horizontal band into visual rows (top-to-bottom). */
export function groupRows(blocks: VisionBlock[]): VisionBlock[][] {
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: VisionBlock[][] = [];

  for (const block of sorted) {
    const row = rows[rows.length - 1];
    if (row) {
      const top = Math.min(...row.map((b) => b.y));
      const bottom = Math.max(...row.map((b) => b.y + b.h));
      const overlap = Math.min(bottom, block.y + block.h) - Math.max(top, block.y);
      const shortest = Math.min(bottom - top, block.h);
      if (overlap > shortest * 0.45) {
        row.push(block);
        continue;
      }
    }
    rows.push([block]);
  }

  return rows.map((row) => row.sort((a, b) => a.x - b.x));
}
