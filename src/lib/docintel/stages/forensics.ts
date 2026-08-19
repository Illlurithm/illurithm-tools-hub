/**
 * PDF forensic analysis stage.
 *
 *   page items → forensic record → page geometry normalization
 *              → word / line / block-candidate reconstruction
 *              → typography + density + background analysis
 *              → native-text quality score → native-vs-OCR route
 *
 * This stage only *observes*: it produces the normalized record of everything
 * the PDF itself exposes. Interpretation (reading order, semantics, tables)
 * happens in later stages.
 *
 * Failures are isolated per page: a page that cannot be inspected yields an
 * empty forensic record plus an issue entry, and the document continues.
 */

import type { PdfPageItem } from "@/lib/pdf-to-png-store";
import type { PdfDocumentForensics, PdfPageForensics } from "@/lib/pdf-forensics";
import { RENDER_SCALE } from "@/lib/pdf-to-png";
import {
  normalizeRotation,
  pageGeometry,
  rotateNormalizedBox,
  rotatePageSize,
  type PageGeometry,
} from "@/lib/pdf/coords";
import {
  type BackgroundAnalysis,
  type BlockCandidate,
  type ExtractedAnnotation,
  type ExtractedFormField,
  type ExtractedImage,
  type ExtractedLine,
  type ExtractedLink,
  type ExtractedVector,
  type ExtractedWord,
  type ExtractionIssue,
  type NativeTextQuality,
  type PageDensity,
  type Relationship,
  type TypographyStats,
} from "@/lib/pdf/elements";
import {
  reconstructBlockCandidates,
  reconstructLines,
  reconstructWords,
  typographyStats,
  type RawTextSpan,
} from "@/lib/pdf/reconstruct";
import {
  backgroundAnalysis,
  markDuplicateWords,
  markWatermarkCandidates,
  nativeTextQuality,
  pageDensity,
  routePage,
  type PageRoute,
} from "@/lib/pdf/quality";
import type { Stage } from "../pipeline";

export type ForensicPage = {
  item: PdfPageItem;
  /** Index within the selected pages. */
  index: number;
  pageNumber: number;
  geometry: PageGeometry;
  /** Native words/lines/blocks — empty when the page has no text layer. */
  words: ExtractedWord[];
  lines: ExtractedLine[];
  candidates: BlockCandidate[];
  images: ExtractedImage[];
  vectors: ExtractedVector[];
  annotations: ExtractedAnnotation[];
  links: ExtractedLink[];
  formFields: ExtractedFormField[];
  quality: NativeTextQuality;
  density: PageDensity;
  typography: TypographyStats;
  background: BackgroundAnalysis;
  route: PageRoute;
  forensics?: PdfPageForensics;
  issues: ExtractionIssue[];
  relationships: Relationship[];
};

export type ForensicDocument = {
  fileName: string;
  document?: PdfDocumentForensics;
  pages: ForensicPage[];
};

/** Fallback geometry for items that carry no forensic record (e.g. re-used state). */
function geometryFromItem(item: PdfPageItem): PageGeometry {
  const logical = rotatePageSize(item, item.rotation);
  return pageGeometry({
    cropBox: [0, 0, logical.width / RENDER_SCALE, logical.height / RENDER_SCALE],
    userRotation: normalizeRotation(item.rotation),
    renderScale: RENDER_SCALE,
    imageWidth: logical.width,
    imageHeight: logical.height,
  });
}

const spansOf = (item: PdfPageItem): RawTextSpan[] =>
  (item.text ?? []).map((span) => ({
    str: span.str,
    x: span.x,
    y: span.y,
    width: span.width,
    height: span.height,
    ...(span.font ? { font: span.font } : {}),
    ...(span.fontName ? { fontName: span.fontName } : {}),
    ...(span.bold ? { bold: true } : {}),
    ...(span.italic ? { italic: true } : {}),
    ...(span.unmapped ? { unmapped: true } : {}),
    ...(span.direction ? { direction: span.direction } : {}),
    ...(span.transform ? { transform: span.transform } : {}),
    ...(span.rotation !== undefined ? { rotation: span.rotation } : {}),
    ...(span.color ? { color: span.color } : {}),
    ...(span.visibility ? { visibility: span.visibility } : {}),
    confidence: null,
  }));

/** Applies the user's workspace rotation to every normalized box of a page. */
function applyUserRotation<T extends { box: { x: number; y: number; width: number; height: number } }>(
  elements: T[],
  rotation: number,
): T[] {
  if (normalizeRotation(rotation) === 0) return elements;
  return elements.map((element) => ({
    ...element,
    box: rotateNormalizedBox(element.box, rotation),
  }));
}

/** Finds the visible text sitting under each link rectangle. */
function attachLinkText(links: ExtractedLink[], lines: ExtractedLine[]): Relationship[] {
  const relationships: Relationship[] = [];
  for (const link of links) {
    const hit = lines.find((line) => {
      const x = Math.max(
        0,
        Math.min(line.box.x + line.box.width, link.box.x + link.box.width) -
          Math.max(line.box.x, link.box.x),
      );
      const y = Math.max(
        0,
        Math.min(line.box.y + line.box.height, link.box.y + link.box.height) -
          Math.max(line.box.y, link.box.y),
      );
      const smallest = Math.min(
        line.box.width * line.box.height,
        link.box.width * link.box.height,
      );
      return smallest > 0 && (x * y) / smallest > 0.35;
    });
    if (hit) {
      link.visibleText = hit.text;
      relationships.push({ type: "link_text", from: link.id, to: hit.id });
    }
  }
  return relationships;
}

function inspectOne(
  item: PdfPageItem,
  index: number,
  ocrEnabled: boolean,
): ForensicPage {
  const issues: ExtractionIssue[] = [];
  const pageNumber = index + 1;
  const forensics = item.forensics;
  const geometry: PageGeometry = forensics
    ? { ...forensics.geometry, userRotation: normalizeRotation(item.rotation) }
    : geometryFromItem(item);
  const logical = rotatePageSize(
    { width: geometry.imageWidth, height: geometry.imageHeight },
    item.rotation,
  );

  for (const issue of forensics?.issues ?? [])
    issues.push({
      page: pageNumber,
      stage: `forensics:${issue.scan}`,
      error: issue.error,
      recovered: true,
    });

  let words: ExtractedWord[] = [];
  let lines: ExtractedLine[] = [];
  let candidates: BlockCandidate[] = [];
  try {
    words = reconstructWords(spansOf(item), {
      page: pageNumber,
      size: { width: geometry.imageWidth, height: geometry.imageHeight },
      source: "native_pdf",
      ptPerPx: 1 / geometry.renderScale,
    });
    words = applyUserRotation(words, item.rotation);
    lines = reconstructLines(words, { page: pageNumber, size: logical });
    candidates = reconstructBlockCandidates(lines, { page: pageNumber });
  } catch (error) {
    issues.push({
      page: pageNumber,
      stage: "native-reconstruction",
      error: error instanceof Error ? error.message : String(error),
      fallback: "OCR",
      recovered: true,
    });
    words = [];
    lines = [];
    candidates = [];
  }

  markDuplicateWords(words);

  const images = applyUserRotation(forensics?.images ?? [], item.rotation);
  const vectors = applyUserRotation(forensics?.vectors ?? [], item.rotation);
  const annotations = applyUserRotation(forensics?.annotations ?? [], item.rotation);
  const links = applyUserRotation(forensics?.links ?? [], item.rotation);
  const formFields = applyUserRotation(forensics?.formFields ?? [], item.rotation);

  const background = backgroundAnalysis({ images, vectors });
  if (forensics?.textFlags.hiddenTextLayer)
    for (const word of words) word.visibility = "hidden";

  const quality = nativeTextQuality({
    words,
    lines,
    hasFullPageImage: background.fullPageImage,
  });
  const density = pageDensity({
    words,
    lines,
    blocks: candidates,
    images,
    vectors,
    annotations,
    links,
    formFields,
  });
  const route = routePage({
    quality,
    hasFullPageImage: background.fullPageImage,
    imageAreaRatio: density.imageAreaRatio,
    ocrEnabled,
  });

  const relationships: Relationship[] = [
    ...lines.flatMap((line) =>
      line.wordIds.map((wordId) => ({ type: "word_line" as const, from: wordId, to: line.id })),
    ),
    ...candidates.flatMap((block) =>
      block.lineIds.map((lineId) => ({ type: "line_block" as const, from: lineId, to: block.id })),
    ),
    ...images.map((image) => ({
      type: "image_page" as const,
      from: image.id,
      to: `page_${pageNumber}`,
    })),
    ...annotations.map((annotation) => ({
      type: "annotation_page" as const,
      from: annotation.id,
      to: `page_${pageNumber}`,
    })),
    ...words
      .filter((word) => word.duplicateOf)
      .map((word) => ({
        type: "duplicate_of" as const,
        from: word.id,
        to: word.duplicateOf!,
      })),
    ...attachLinkText(links, lines),
  ];

  return {
    item,
    index,
    pageNumber,
    geometry,
    words,
    lines,
    candidates,
    images,
    vectors,
    annotations,
    links,
    formFields,
    quality,
    density,
    typography: typographyStats(words),
    background,
    route,
    ...(forensics ? { forensics } : {}),
    issues,
    relationships,
  };
}

export const forensicsStage: Stage<{ items: PdfPageItem[]; fileName: string }, ForensicDocument> = {
  name: "pdf-forensics",
  state: "analyzing",
  async run({ items, fileName }, ctx) {
    const selected = items.filter((item) => item.selected);
    if (selected.length === 0) throw new Error("Select at least one page first.");

    const pages = selected.map((item, index) =>
      inspectOne(item, index, ctx.options.ocrEnabled),
    );

    // Watermark candidates need a cross-page view.
    const watermarks = markWatermarkCandidates(
      pages.map((page) => ({ index: page.index, images: page.images, vectors: page.vectors })),
    );
    for (const page of pages)
      page.background.watermarkCandidateIds = watermarks.get(page.index) ?? [];

    const document = selected[0]?.documentForensics;
    ctx.logger.info("pdf-forensics", "forensic analysis complete", {
      pages: pages.length,
      pdfVersion: document?.pdfVersion ?? "unknown",
      encrypted: document?.encrypted ?? false,
      acroForm: document?.hasAcroForm ?? false,
      nativeWords: pages.reduce((sum, page) => sum + page.words.length, 0),
      nativeLines: pages.reduce((sum, page) => sum + page.lines.length, 0),
      images: pages.reduce((sum, page) => sum + page.images.length, 0),
      embeddedImageBytes: pages.reduce(
        (sum, page) => sum + page.images.filter((image) => image.dataUrl).length,
        0,
      ),
      vectors: pages.reduce((sum, page) => sum + page.vectors.length, 0),
      annotations: pages.reduce((sum, page) => sum + page.annotations.length, 0),
      links: pages.reduce((sum, page) => sum + page.links.length, 0),
      formFields: pages.reduce((sum, page) => sum + page.formFields.length, 0),
      duplicateWords: pages.reduce(
        (sum, page) => sum + page.words.filter((word) => word.duplicateOf).length,
        0,
      ),
      hiddenTextPages: pages.filter((page) => page.forensics?.textFlags.hiddenTextLayer).length,
      rotatedPages: pages.filter((page) => page.geometry.rotation !== 0).length,
      watermarkPages: [...watermarks.keys()].length,
      ocrPages: pages.filter((page) => page.route.route !== "native").length,
      failedScans: pages.reduce((sum, page) => sum + page.issues.length, 0),
    });

    return { fileName, ...(document ? { document } : {}), pages };
  },
};
