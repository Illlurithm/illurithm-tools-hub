/**
 * Normalized extraction element model.
 *
 * These are the *observation* records of the forensic layer: everything the
 * engine could learn about a page before any semantic interpretation happens.
 * Every element carries a stable id, its geometry, where it came from
 * (`source`) and — only when it is genuinely known — a confidence value.
 *
 * Confidence is `number | null`: `null` means "the source does not provide a
 * confidence", never a fabricated score.
 */

import type { Box, PdfRect, Rotation } from "./coords";

export type ExtractionSource =
  | "native_pdf"
  | "ocr"
  | "embedded_image"
  | "rendered_crop"
  | "annotation"
  | "vector"
  | "form"
  | "hybrid"
  | "derived";

export type WritingDirection = "ltr" | "rtl" | "ttb" | "btt";

export type ElementKind = "TEXT" | "IMAGE" | "VECTOR" | "ANNOTATION" | "FORM" | "UNKNOWN";

export type FontInfo = {
  /** Font name as written in the PDF (may carry a subset prefix). */
  rawName: string;
  /** Office-safe family resolved for rendering. */
  family: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  /** True when the name carries a `ABCDEF+` subset prefix. */
  subset: boolean;
  /** True when no usable name was exposed by the parser. */
  unknown: boolean;
};

export type TextVisibility = "visible" | "hidden" | "unknown";

/** A word reconstructed from one or more native spans / OCR words. */
export type ExtractedWord = {
  id: string;
  kind: "TEXT";
  page: number;
  text: string;
  /** Normalized IR box. */
  box: Box;
  font: FontInfo;
  direction: WritingDirection;
  /** Text rotation in degrees (0 for normal horizontal text). */
  rotation: number;
  color?: string;
  visibility: TextVisibility;
  source: ExtractionSource;
  confidence: number | null;
  /** True when another element carries the same text at the same place. */
  duplicateOf?: string;
  /** Indexes of the raw spans this word was reconstructed from. */
  spans: number[];
};

export type ExtractedLine = {
  id: string;
  page: number;
  text: string;
  box: Box;
  wordIds: string[];
  direction: WritingDirection;
  rotation: number;
  /** Dominant font of the line. */
  font: FontInfo;
  source: ExtractionSource;
  confidence: number | null;
  visibility: TextVisibility;
};

/** Physical-proximity block candidate — NOT a semantic paragraph/heading. */
export type BlockCandidate = {
  id: string;
  page: number;
  kind: ElementKind;
  box: Box;
  lineIds: string[];
  text: string;
  source: ExtractionSource;
  confidence: number | null;
};

export type ExtractedImage = {
  id: string;
  page: number;
  box: Box;
  /** Intrinsic pixel size of the embedded image when exposed. */
  pixelWidth?: number;
  pixelHeight?: number;
  format?: string;
  colorSpace?: string;
  /** Parser object id of the image XObject. */
  ref?: string;
  /** Data URL of the extracted bytes, when extraction succeeded. */
  dataUrl?: string;
  rotation: number;
  /** Painting order on the page (lower paints first). */
  zOrder: number;
  isMask?: boolean;
  source: ExtractionSource;
};

export type ExtractedVector = {
  id: string;
  page: number;
  box: Box;
  shape: "line" | "rect" | "path";
  orientation?: "horizontal" | "vertical";
  fillColor?: string;
  strokeColor?: string;
  zOrder: number;
  source: "vector";
};

export type ExtractedAnnotation = {
  id: string;
  page: number;
  subtype: string;
  box: Box;
  contents?: string;
  url?: string;
  rect?: PdfRect;
  source: "annotation";
};

export type ExtractedLink = {
  id: string;
  page: number;
  box: Box;
  url: string;
  /** Text found under the link rectangle, when any. */
  visibleText: string;
  annotationId?: string;
  source: "annotation";
};

export type ExtractedFormField = {
  id: string;
  page: number;
  box: Box;
  fieldName: string;
  fieldType: string;
  fieldValue?: string;
  options?: string[];
  readOnly?: boolean;
  source: "form";
};

export type TypographyStats = {
  /** Rounded font size → number of characters set at that size. */
  sizeHistogram: Record<string, number>;
  modalSizePt: number | null;
  medianSizePt: number | null;
  minSizePt: number | null;
  maxSizePt: number | null;
  /** Distinct rounded size clusters, most used first. */
  sizeClusters: number[];
  families: Record<string, number>;
  boldChars: number;
  italicChars: number;
  totalChars: number;
};

export type PageDensity = {
  textAreaRatio: number;
  imageAreaRatio: number;
  vectorAreaRatio: number;
  textElementCount: number;
  wordCount: number;
  lineCount: number;
  blockCount: number;
  imageCount: number;
  vectorCount: number;
  annotationCount: number;
  linkCount: number;
  formFieldCount: number;
  profile:
    | "blank"
    | "mostly_text"
    | "mostly_image"
    | "mixed"
    | "table_heavy"
    | "form_heavy";
};

export type BackgroundAnalysis = {
  fullPageImage: boolean;
  largeBackgroundObject: boolean;
  /** Repeated large/low-opacity elements that look like a watermark. */
  watermarkCandidateIds: string[];
};

export type NativeTextQuality = {
  /** 0..1 — derived from the signals below, never a constant. */
  score: number;
  charCount: number;
  wordCount: number;
  lineCount: number;
  /** Fraction of the page area covered by native text boxes. */
  coverage: number;
  /** Fraction of characters that are replacement/unmapped glyph soup. */
  suspiciousRatio: number;
  /** Fraction of spans with an invalid/degenerate box. */
  invalidBoxRatio: number;
  duplicateRatio: number;
  hiddenRatio: number;
  reasons: string[];
};

export type ExtractionIssue = {
  page: number;
  stage: string;
  error: string;
  fallback?: string;
  recovered: boolean;
};

/** Untyped, flexible relationship graph between extracted objects. */
export type Relationship = {
  type:
    | "word_line"
    | "line_block"
    | "block_page"
    | "image_page"
    | "link_text"
    | "annotation_page"
    | "caption_candidate"
    | "duplicate_of"
    | "ocr_of";
  from: string;
  to: string;
  confidence?: number | null;
};

let sequence = 0;
export const nextElementId = (prefix: string) =>
  `${prefix}_${(sequence += 1).toString(36).padStart(5, "0")}`;
export const resetElementIds = () => {
  sequence = 0;
};

const SUBSET_PREFIX = /^[A-Z]{6}\+/;

export function fontInfo(input: {
  rawName?: string;
  family?: string;
  sizePt: number;
  bold?: boolean;
  italic?: boolean;
}): FontInfo {
  const rawName = (input.rawName ?? "").trim();
  return {
    rawName,
    family: input.family || "Arial",
    sizePt: input.sizePt,
    bold: Boolean(input.bold),
    italic: Boolean(input.italic),
    subset: SUBSET_PREFIX.test(rawName),
    unknown: rawName.length === 0,
  };
}

export const rotationIsUpright = (rotation: number) => {
  const rot = ((rotation % 360) + 360) % 360;
  return rot < 5 || rot > 355;
};

export type { Box, Rotation };
