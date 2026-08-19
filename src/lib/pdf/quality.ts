/**
 * Native-text quality, duplicate/hidden-text detection, page density and
 * background/watermark analysis.
 *
 * All functions are pure so the routing decisions they drive are testable.
 * Nothing here deletes content: duplicates and watermark candidates are only
 * *marked*, and the downstream stages decide what to do with them.
 */

import { boxOverlapRatio, type Box } from "./coords";
import type {
  BackgroundAnalysis,
  BlockCandidate,
  ExtractedAnnotation,
  ExtractedImage,
  ExtractedLine,
  ExtractedVector,
  ExtractedWord,
  NativeTextQuality,
  PageDensity,
} from "./elements";

/** Characters that mean the glyph→Unicode mapping failed. */
const SUSPICIOUS = /[\uFFFD\u25A1\u25AF\u0000-\u0008\uE000-\uF8FF]/;

const isSuspicious = (text: string) =>
  SUSPICIOUS.test(text) || /^[\u093E-\u094D\u0900-\u0903]/.test(text.trim());

const area = (box: Box) => Math.max(0, box.width) * Math.max(0, box.height);

const boxIsValid = (box: Box) =>
  Number.isFinite(box.x) &&
  Number.isFinite(box.y) &&
  box.width > 0 &&
  box.height > 0 &&
  box.x >= -0.05 &&
  box.y >= -0.05 &&
  box.x + box.width <= 1.05 &&
  box.y + box.height <= 1.05;

/** Union-free coverage estimate: summed word area, capped at the page. */
const coverageOf = (boxes: Box[]) => Math.min(1, boxes.reduce((sum, box) => sum + area(box), 0));

const normalizeForCompare = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Marks words that duplicate another word: same normalized text at (nearly) the
 * same place. Nothing is removed — later stages read `duplicateOf`.
 */
export function markDuplicateWords(words: ExtractedWord[]): { duplicates: number } {
  const buckets = new Map<string, ExtractedWord[]>();
  for (const word of words) {
    const key = normalizeForCompare(word.text);
    if (!key) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(word);
    buckets.set(key, bucket);
  }

  let duplicates = 0;
  buckets.forEach((bucket) => {
    if (bucket.length < 2) return;
    for (let i = 1; i < bucket.length; i += 1) {
      const current = bucket[i]!;
      const original = bucket
        .slice(0, i)
        .find((candidate) => boxOverlapRatio(candidate.box, current.box) > 0.6);
      if (original && !current.duplicateOf) {
        current.duplicateOf = original.id;
        duplicates += 1;
      }
    }
  });

  return { duplicates };
}

/**
 * Marks native words that an OCR pass re-read at the same place, so the same
 * sentence never lands twice in the DOCX. Both records stay in the IR.
 */
export function linkOcrDuplicates(
  nativeWords: ExtractedWord[],
  ocrWords: ExtractedWord[],
): { matched: number } {
  let matched = 0;
  for (const ocr of ocrWords) {
    const twin = nativeWords.find(
      (native) =>
        normalizeForCompare(native.text) === normalizeForCompare(ocr.text) &&
        boxOverlapRatio(native.box, ocr.box) > 0.4,
    );
    if (twin) {
      ocr.duplicateOf = twin.id;
      matched += 1;
    }
  }
  return { matched };
}

/**
 * Scores how trustworthy the native text layer of a page is (0..1) from real
 * signals. A page with no text scores 0; glyph soup, invalid boxes, hidden text
 * layers and thin coverage all pull the score down.
 */
export function nativeTextQuality(input: {
  words: ExtractedWord[];
  lines: ExtractedLine[];
  /** True when the page paints a full-page raster (scanned page signature). */
  hasFullPageImage?: boolean;
}): NativeTextQuality {
  const { words, lines } = input;
  const reasons: string[] = [];
  const charCount = words.reduce((sum, word) => sum + word.text.length, 0);

  if (words.length === 0) {
    return {
      score: 0,
      charCount: 0,
      wordCount: 0,
      lineCount: 0,
      coverage: 0,
      suspiciousRatio: 0,
      invalidBoxRatio: 0,
      duplicateRatio: 0,
      hiddenRatio: 0,
      reasons: ["no native text layer"],
    };
  }

  const suspiciousChars = words
    .filter((word) => word.unmapped || isSuspicious(word.text))
    .reduce((sum, word) => sum + word.text.length, 0);
  const suspiciousRatio = charCount > 0 ? suspiciousChars / charCount : 0;
  const invalidBoxRatio = words.filter((word) => !boxIsValid(word.box)).length / words.length;
  const duplicateRatio = words.filter((word) => word.duplicateOf).length / words.length;
  const hiddenRatio = words.filter((word) => word.visibility === "hidden").length / words.length;
  const coverage = coverageOf(words.map((word) => word.box));

  let score = 1;
  if (suspiciousRatio > 0) {
    score -= Math.min(1, suspiciousRatio * 1.6);
    reasons.push(`unmapped glyphs ${(suspiciousRatio * 100).toFixed(0)}%`);
  }
  if (invalidBoxRatio > 0) {
    score -= Math.min(0.5, invalidBoxRatio * 2);
    reasons.push(`invalid boxes ${(invalidBoxRatio * 100).toFixed(0)}%`);
  }
  if (hiddenRatio > 0.5) {
    score -= 0.15;
    reasons.push("mostly hidden text layer");
  }
  if (duplicateRatio > 0.3) {
    score -= 0.1;
    reasons.push("many duplicate text objects");
  }
  // Very little text on a page that is otherwise a picture means the text layer
  // is furniture (page numbers, stamps), not the page content.
  if (input.hasFullPageImage && charCount < 200) {
    score -= 0.45;
    reasons.push("full-page image with a thin text layer");
  }
  if (charCount < 24) {
    score -= 0.3;
    reasons.push("very few characters");
  }
  if (coverage < 0.005 && charCount < 120) {
    score -= 0.15;
    reasons.push("negligible text coverage");
  }

  return {
    score: Math.max(0, Math.min(1, Number(score.toFixed(3)))),
    charCount,
    wordCount: words.length,
    lineCount: lines.length,
    coverage: Number(coverage.toFixed(4)),
    suspiciousRatio: Number(suspiciousRatio.toFixed(3)),
    invalidBoxRatio: Number(invalidBoxRatio.toFixed(3)),
    duplicateRatio: Number(duplicateRatio.toFixed(3)),
    hiddenRatio: Number(hiddenRatio.toFixed(3)),
    reasons,
  };
}

/** Native text is used as-is above this score; below it the page goes to OCR. */
export const NATIVE_QUALITY_THRESHOLD = 0.72;

export type PageRoute = {
  /** "native" | "ocr" | "hybrid" — how the page should be read. */
  route: "native" | "ocr" | "hybrid";
  reason: string;
};

/**
 * Page-level native-vs-OCR routing. Decided per page, never for the whole file,
 * so hybrid documents read each page the right way.
 */
export function routePage(input: {
  quality: NativeTextQuality;
  hasFullPageImage: boolean;
  imageAreaRatio: number;
  ocrEnabled: boolean;
}): PageRoute {
  if (!input.ocrEnabled) {
    return input.quality.score >= NATIVE_QUALITY_THRESHOLD
      ? { route: "native", reason: "native text is reliable" }
      : { route: "native", reason: "OCR disabled — native text used as-is" };
  }
  if (input.quality.wordCount === 0)
    return { route: "ocr", reason: "no native text layer" };
  if (input.quality.score >= NATIVE_QUALITY_THRESHOLD) {
    // Native text is good, but a large picture region may still hide content.
    if (input.imageAreaRatio > 0.35 && input.quality.coverage < 0.06)
      return { route: "hybrid", reason: "reliable native text plus large image regions" };
    return { route: "native", reason: `native quality ${input.quality.score}` };
  }
  return {
    route: "ocr",
    reason: `native quality ${input.quality.score} (${input.quality.reasons.join(", ")})`,
  };
}

export function pageDensity(input: {
  words: ExtractedWord[];
  lines: ExtractedLine[];
  blocks: BlockCandidate[];
  images: ExtractedImage[];
  vectors: ExtractedVector[];
  annotations: ExtractedAnnotation[];
  links: { length: number };
  formFields: { length: number };
}): PageDensity {
  const textAreaRatio = coverageOf(input.blocks.map((block) => block.box));
  const imageAreaRatio = coverageOf(input.images.map((image) => image.box));
  const vectorAreaRatio = coverageOf(input.vectors.map((vector) => vector.box));
  const rules = input.vectors.filter((vector) => vector.shape === "line");

  let profile: PageDensity["profile"] = "mixed";
  if (input.words.length === 0 && input.images.length === 0 && input.vectors.length === 0)
    profile = "blank";
  else if (input.formFields.length > 3) profile = "form_heavy";
  else if (rules.length >= 8 && input.words.length > 20) profile = "table_heavy";
  else if (textAreaRatio > imageAreaRatio * 2 && input.words.length > 20) profile = "mostly_text";
  else if (imageAreaRatio > 0.5 && input.words.length < 40) profile = "mostly_image";

  return {
    textAreaRatio: Number(textAreaRatio.toFixed(4)),
    imageAreaRatio: Number(imageAreaRatio.toFixed(4)),
    vectorAreaRatio: Number(vectorAreaRatio.toFixed(4)),
    textElementCount: input.words.length + input.lines.length,
    wordCount: input.words.length,
    lineCount: input.lines.length,
    blockCount: input.blocks.length,
    imageCount: input.images.length,
    vectorCount: input.vectors.length,
    annotationCount: input.annotations.length,
    linkCount: input.links.length,
    formFieldCount: input.formFields.length,
    profile,
  };
}

const FULL_PAGE = 0.82;

export function backgroundAnalysis(input: {
  images: ExtractedImage[];
  vectors: ExtractedVector[];
}): BackgroundAnalysis {
  const fullPageImage = input.images.some(
    (image) => image.box.width >= FULL_PAGE && image.box.height >= FULL_PAGE,
  );
  const largeBackgroundObject =
    fullPageImage ||
    input.vectors.some(
      (vector) =>
        vector.shape !== "line" && vector.box.width >= FULL_PAGE && vector.box.height >= FULL_PAGE,
    );
  return { fullPageImage, largeBackgroundObject, watermarkCandidateIds: [] };
}

/**
 * Flags large elements that repeat at the same geometry on several pages — the
 * signature of a watermark or a page frame. Candidates are only marked.
 */
export function markWatermarkCandidates(
  pages: { index: number; images: ExtractedImage[]; vectors: ExtractedVector[] }[],
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (pages.length < 2) return result;

  type Entry = { page: number; id: string; box: Box };
  const entries: Entry[] = [];
  for (const page of pages) {
    for (const image of page.images)
      if (area(image.box) > 0.08) entries.push({ page: page.index, id: image.id, box: image.box });
    for (const vector of page.vectors)
      if (vector.shape !== "line" && area(vector.box) > 0.15)
        entries.push({ page: page.index, id: vector.id, box: vector.box });
  }

  for (const entry of entries) {
    const repeats = new Set(
      entries
        .filter(
          (other) => other.page !== entry.page && boxOverlapRatio(other.box, entry.box) > 0.85,
        )
        .map((other) => other.page),
    );
    if (repeats.size >= 1 && pages.length >= 2) {
      const list = result.get(entry.page) ?? [];
      list.push(entry.id);
      result.set(entry.page, list);
    }
  }

  return result;
}
