/**
 * Word / line / block-candidate reconstruction.
 *
 * Pure functions: raw text spans (native PDF runs or OCR words, in image pixel
 * coordinates) become spatially ordered words, then lines, then physical block
 * candidates. No semantic labelling happens here — that is the job of the
 * structure stage.
 *
 * The reconstruction is deliberately conservative:
 *  - a span is never assumed to be a word (`Gov` + `ernment` merges back);
 *  - a word is never assumed to be a whole span (`Government of Maharashtra`
 *    inside a single run splits into three words);
 *  - Unicode is only trimmed/collapsed, never normalized destructively.
 */

import { imageBoxToNormalized, transformRotation, type Box } from "./coords";
import {
  fontInfo,
  nextElementId,
  rotationIsUpright,
  type BlockCandidate,
  type ExtractedLine,
  type ExtractedWord,
  type ExtractionSource,
  type FontInfo,
  type TextVisibility,
  type TypographyStats,
  type WritingDirection,
} from "./elements";

/** A raw text observation in rendered-image pixel coordinates. */
export type RawTextSpan = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font?: string;
  fontName?: string;
  bold?: boolean;
  italic?: boolean;
  unmapped?: boolean;
  direction?: WritingDirection;
  /** Text matrix, used to recover rotation when the parser exposes it. */
  transform?: number[];
  rotation?: number;
  color?: string;
  visibility?: TextVisibility;
  confidence?: number | null;
};

export type PageSize = { width: number; height: number };

export type ReconstructOptions = {
  page: number;
  size: PageSize;
  source: ExtractionSource;
  /** Points per pixel of the raster (the app renders at 2 px per pt). */
  ptPerPx?: number;
};

const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_STRONG = /[A-Za-z\u0900-\u097F\u0400-\u04FF]/;

/** Detects the writing direction from the characters themselves. */
export function detectDirection(text: string, fallback?: WritingDirection): WritingDirection {
  if (fallback === "ttb" || fallback === "btt") return fallback;
  const rtl = (text.match(RTL) ?? []).length;
  const ltr = (text.match(LTR_STRONG) ?? []).length;
  if (rtl > 0 && rtl >= ltr) return "rtl";
  if (ltr > 0) return "ltr";
  return fallback ?? "ltr";
}

export const spanRotation = (span: RawTextSpan) =>
  span.rotation ?? transformRotation(span.transform);

const ptFromPx = (px: number, ptPerPx: number) =>
  Math.max(4, Math.round(px * ptPerPx * 10) / 10);

function spanFont(span: RawTextSpan, sizePt: number): FontInfo {
  return fontInfo({
    ...(span.fontName ? { rawName: span.fontName } : {}),
    ...(span.font ? { family: span.font } : {}),
    sizePt,
    ...(span.bold ? { bold: true } : {}),
    ...(span.italic ? { italic: true } : {}),
  });
}

const sameStyle = (a: FontInfo, b: FontInfo) =>
  a.family === b.family && a.bold === b.bold && a.italic === b.italic;

/** Groups spans into visual rows using glyph-centre overlap (baseline aware). */
export function groupRows(spans: RawTextSpan[]): RawTextSpan[][] {
  const sorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: RawTextSpan[][] = [];
  for (const span of sorted) {
    const row = rows[rows.length - 1];
    const ref = row?.[row.length - 1];
    const sameRow =
      ref &&
      spanRotation(ref) === spanRotation(span) &&
      Math.abs(span.y + span.height / 2 - (ref.y + ref.height / 2)) <=
        Math.min(ref.height, span.height) * 0.45;
    if (sameRow) row!.push(span);
    else rows.push([span]);
  }
  return rows.map((row) => [...row].sort((a, b) => a.x - b.x));
}

type Token = { text: string; x: number; width: number; leadingSpace: boolean };

/**
 * Splits a span into whitespace-delimited tokens, estimating each token box from
 * the character distribution of the run (the only option when the parser does
 * not expose per-glyph boxes).
 */
export function tokenizeSpan(span: RawTextSpan): Token[] {
  const chars = Array.from(span.str);
  if (chars.length === 0) return [];
  const perChar = span.width / chars.length;
  const tokens: Token[] = [];
  let current: Token | null = null;
  let sawSpace = false;

  chars.forEach((char, index) => {
    if (/\s/.test(char)) {
      current = null;
      sawSpace = true;
      return;
    }
    if (!current) {
      current = {
        text: char,
        x: span.x + perChar * index,
        width: perChar,
        leadingSpace: sawSpace || tokens.length > 0,
      };
      tokens.push(current);
      sawSpace = false;
      return;
    }
    current.text += char;
    current.width += perChar;
  });

  return tokens;
}

/**
 * Reconstructs words from raw spans. Spans are joined back together when they
 * are visually contiguous and share a style; runs containing whitespace are
 * split into separate words.
 */
export function reconstructWords(
  spans: RawTextSpan[],
  options: ReconstructOptions,
): ExtractedWord[] {
  const ptPerPx = options.ptPerPx ?? 0.5;
  const usable = spans.filter((span) => span.str.trim().length > 0);
  const indexOf = new Map<RawTextSpan, number>();
  spans.forEach((span, index) => indexOf.set(span, index));

  const words: ExtractedWord[] = [];
  /** Pixel boxes are tracked outside the elements while words are still merging. */
  const pxBoxes = new Map<string, Box>();

  for (const row of groupRows(usable)) {
    let previous: { word: ExtractedWord; right: number; font: FontInfo } | null = null;

    for (const span of row) {
      const sizePt = ptFromPx(span.height, ptPerPx);
      const font = spanFont(span, sizePt);
      const rotation = spanRotation(span);
      const spanIndex = indexOf.get(span) ?? -1;
      const tokens = tokenizeSpan(span);

      tokens.forEach((token, tokenIndex) => {
        const gap = previous ? token.x - previous.right : Number.POSITIVE_INFINITY;
        const glued =
          previous !== null &&
          tokenIndex === 0 &&
          !token.leadingSpace &&
          gap <= span.height * (sameStyle(previous.font, font) ? 0.16 : 0.05) &&
          gap > -span.height * 0.6;

        if (glued && previous) {
          const word = previous.word;
          word.text += token.text;
          const right = Math.max(previous.right, token.x + token.width);
          const box = pxBoxes.get(word.id);
          if (box) {
            box.width = right - box.x;
            box.height = Math.max(box.height, span.height);
            box.y = Math.min(box.y, span.y);
          }
          word.spans.push(spanIndex);
          if (span.unmapped) word.unmapped = true;
          previous.right = right;
          return;
        }

        const pxBox: Box = {
          x: token.x,
          y: span.y,
          width: Math.max(1, token.width),
          height: Math.max(1, span.height),
        };
        const word: ExtractedWord = {
          id: nextElementId("w"),
          kind: "TEXT",
          page: options.page,
          text: token.text,
          box: { ...pxBox },
          font,
          direction: detectDirection(token.text, span.direction),
          rotation,
          ...(span.color ? { color: span.color } : {}),
          visibility: span.visibility ?? "unknown",
          source: options.source,
          confidence: span.confidence ?? null,
          spans: [spanIndex],
          ...(span.unmapped ? { unmapped: true } : {}),
        };
        words.push(word);
        pxBoxes.set(word.id, pxBox);
        previous = { word, right: pxBox.x + pxBox.width, font };
      });
    }
  }

  // Normalize geometry once, after all merging is done.
  for (const word of words) {
    const px = pxBoxes.get(word.id);
    if (px) word.box = imageBoxToNormalized(px, options.size);
    word.text = word.text.replace(/\s+/g, " ").trim();
  }



  return words.filter((word) => word.text.length > 0);
}

/** Pixel box of a word, recovered from the normalized box. */
const pxOf = (box: Box, size: PageSize) => ({
  x: box.x * size.width,
  y: box.y * size.height,
  width: box.width * size.width,
  height: box.height * size.height,
});

const unionBox = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
};

const dominantFont = (words: ExtractedWord[]): FontInfo => {
  const counts = new Map<string, { font: FontInfo; chars: number }>();
  for (const word of words) {
    const key = `${word.font.family}|${word.font.sizePt}|${word.font.bold}|${word.font.italic}`;
    const entry = counts.get(key) ?? { font: word.font, chars: 0 };
    entry.chars += word.text.length;
    counts.set(key, entry);
  }
  let best = words[0]?.font ?? fontInfo({ sizePt: 10 });
  let top = -1;
  counts.forEach((entry) => {
    if (entry.chars > top) {
      top = entry.chars;
      best = entry.font;
    }
  });
  return best;
};

const meanConfidence = (values: (number | null)[]) => {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

const visibilityOf = (words: ExtractedWord[]): TextVisibility => {
  if (words.every((word) => word.visibility === "hidden")) return "hidden";
  if (words.some((word) => word.visibility === "visible")) return "visible";
  return "unknown";
};

/**
 * Reconstructs lines from words. Words in the same visual row are split at wide
 * horizontal gaps so that table cells and label/value columns stay independent
 * lines instead of one stretched box.
 */
export function reconstructLines(
  words: ExtractedWord[],
  options: { page: number; size: PageSize; gapFactor?: number },
): ExtractedLine[] {
  const gapFactor = options.gapFactor ?? 1.4;
  const rows = groupRows(
    words.map((word) => {
      const px = pxOf(word.box, options.size);
      return { ...px, str: word.text, rotation: word.rotation, __word: word } as RawTextSpan & {
        __word: ExtractedWord;
      };
    }),
  );

  const lines: ExtractedLine[] = [];

  for (const row of rows) {
    let segment: ExtractedWord[] = [];
    let previousRight: number | null = null;
    const flush = () => {
      if (segment.length === 0) return;
      const boxes = segment.map((word) => word.box);
      const dir = detectDirection(segment.map((w) => w.text).join(" "), segment[0]?.direction);
      const ordered =
        dir === "rtl"
          ? [...segment].sort((a, b) => b.box.x - a.box.x)
          : [...segment].sort((a, b) => a.box.x - b.box.x);
      lines.push({
        id: nextElementId("l"),
        page: options.page,
        text: ordered.map((word) => word.text).join(" "),
        box: unionBox(boxes),
        wordIds: ordered.map((word) => word.id),
        direction: dir,
        rotation: segment[0]?.rotation ?? 0,
        font: dominantFont(segment),
        source: segment[0]?.source ?? "native_pdf",
        confidence: meanConfidence(segment.map((word) => word.confidence)),
        visibility: visibilityOf(segment),
      });
      segment = [];
    };

    for (const raw of row) {
      const word = (raw as RawTextSpan & { __word: ExtractedWord }).__word;
      const gap = previousRight == null ? 0 : raw.x - previousRight;
      if (segment.length > 0 && gap > raw.height * gapFactor) flush();
      segment.push(word);
      previousRight = raw.x + raw.width;
    }
    flush();
  }

  return lines;
}

/**
 * Groups lines into physical block candidates using vertical proximity and
 * horizontal overlap. These are geometry candidates only — never semantics.
 */
export function reconstructBlockCandidates(
  lines: ExtractedLine[],
  options: { page: number },
): BlockCandidate[] {
  const sorted = [...lines].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const groups: ExtractedLine[][] = [];

  for (const line of sorted) {
    const group = groups[groups.length - 1];
    const last = group?.[group.length - 1];
    const gap = last ? line.box.y - (last.box.y + last.box.height) : Number.POSITIVE_INFINITY;
    const overlap = last
      ? Math.max(
          0,
          Math.min(last.box.x + last.box.width, line.box.x + line.box.width) -
            Math.max(last.box.x, line.box.x),
        ) / Math.min(last.box.width, line.box.width)
      : 0;
    const continuous =
      last !== undefined &&
      last.rotation === line.rotation &&
      gap <= Math.max(last.box.height, line.box.height) * 0.75 &&
      overlap > 0.3;
    if (continuous) group!.push(line);
    else groups.push([line]);
  }

  return groups.map((group) => ({
    id: nextElementId("b"),
    page: options.page,
    kind: "TEXT" as const,
    box: unionBox(group.map((line) => line.box)),
    lineIds: group.map((line) => line.id),
    text: group.map((line) => line.text).join("\n"),
    source: group[0]?.source ?? "native_pdf",
    confidence: meanConfidence(group.map((line) => line.confidence)),
  }));
}

/** Font-size / family statistics used later to spot headings and body text. */
export function typographyStats(words: ExtractedWord[]): TypographyStats {
  const sizeHistogram: Record<string, number> = {};
  const families: Record<string, number> = {};
  const sizes: number[] = [];
  let boldChars = 0;
  let italicChars = 0;
  let totalChars = 0;

  for (const word of words) {
    const chars = word.text.length;
    totalChars += chars;
    const key = String(Math.round(word.font.sizePt));
    sizeHistogram[key] = (sizeHistogram[key] ?? 0) + chars;
    families[word.font.family] = (families[word.font.family] ?? 0) + chars;
    for (let i = 0; i < chars; i += 1) sizes.push(word.font.sizePt);
    if (word.font.bold) boldChars += chars;
    if (word.font.italic) italicChars += chars;
  }

  if (sizes.length === 0) {
    return {
      sizeHistogram,
      modalSizePt: null,
      medianSizePt: null,
      minSizePt: null,
      maxSizePt: null,
      sizeClusters: [],
      families,
      boldChars,
      italicChars,
      totalChars,
    };
  }

  const clusters = Object.entries(sizeHistogram)
    .sort((a, b) => b[1] - a[1])
    .map(([size]) => Number(size));
  const ordered = [...sizes].sort((a, b) => a - b);

  return {
    sizeHistogram,
    modalSizePt: clusters[0] ?? null,
    medianSizePt: ordered[Math.floor(ordered.length / 2)] ?? null,
    minSizePt: ordered[0] ?? null,
    maxSizePt: ordered[ordered.length - 1] ?? null,
    sizeClusters: clusters,
    families,
    boldChars,
    italicChars,
    totalChars,
  };
}
