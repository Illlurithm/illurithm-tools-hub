/**
 * Document IR — the intermediate representation that decouples PDF
 * understanding from DOCX reconstruction.
 *
 *   PDF → understanding stages → DocumentIR → renderers
 *
 * Coordinates are normalized (0..1) against the page box so the same IR can be
 * rendered at any page size. Every block carries a reading order index, a
 * semantic region type and a confidence value so later stages (validation,
 * fallbacks, quality reporting) can reason about it.
 */

import type { PageGeometry } from "@/lib/pdf/coords";
import type {
  BackgroundAnalysis,
  BlockCandidate,
  ExtractedAnnotation,
  ExtractedFormField,
  ExtractedImage,
  ExtractedLine,
  ExtractedLink,
  ExtractedVector,
  ExtractedWord,
  ExtractionIssue,
  ExtractionSource,
  NativeTextQuality,
  PageDensity,
  Relationship,
  TypographyStats,
} from "@/lib/pdf/elements";
import type { PageRoute } from "@/lib/pdf/quality";
import type { PdfDocumentForensics, PdfTextFlags } from "@/lib/pdf-forensics";

export type {
  BackgroundAnalysis,
  BlockCandidate,
  ExtractedImage,
  ExtractedLine,
  ExtractedWord,
  Relationship,
};

export type RegionType =
  | "title"
  | "heading"
  | "subheading"
  | "paragraph"
  | "text_block"
  | "list"
  | "list_item"
  | "table"
  | "table_cell"
  | "image"
  | "figure"
  | "caption"
  | "header"
  | "footer"
  | "footnote"
  | "equation"
  | "form_field"
  | "code_block"
  | "quote"
  | "separator"
  | "unknown";

export type BBox = { x: number; y: number; w: number; h: number };

export type TextStyle = {
  fontFamily: string;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  script: "latin" | "devanagari" | "mixed";
  color?: string;
  background?: string;
  bordered?: boolean;
};

export type TextBlock = {
  id: string;
  kind: "text";
  region: RegionType;
  page: number;
  bbox: BBox;
  readingOrder: number;
  confidence: number;
  text: string;
  style: TextStyle;
};

export type ImageBlock = {
  id: string;
  kind: "image";
  region: Extract<RegionType, "image" | "figure">;
  page: number;
  bbox: BBox;
  readingOrder: number;
  confidence: number;
  /** photo | emblem | logo | qr | barcode | signature | other */
  label: string;
  /** Optional caption block id resolved by the caption stage. */
  captionId?: string;
};

export type IrBlock = TextBlock | ImageBlock;

export type IrRule = {
  bbox: BBox;
  orientation: "horizontal" | "vertical";
};

export type PageClass =
  | "native"
  | "scanned"
  | "hybrid"
  | "image_heavy"
  | "table_heavy"
  | "unknown";

export type IrPage = {
  index: number;
  name: string;
  /** Page image size in px (rendered at 2x = 144 dpi). */
  width: number;
  height: number;
  classification: PageClass;
  /** Rendered page raster, kept for image cropping and visual fallbacks. */
  pageImage: string;
  columns: number;
  blocks: IrBlock[];
  rules: IrRule[];
  /** Mean text confidence for the page (0..100). */
  confidence: number;

  // ---- Forensic extraction layer (MASTER PROMPT 02) --------------------------
  // All optional: renderers and older consumers keep working without them.

  /** Normalized page geometry: boxes, rotation, scale, coordinate system. */
  geometry?: PageGeometry;
  /** Spatially reconstructed words (native or OCR), with source + confidence. */
  words?: ExtractedWord[];
  /** Lines reconstructed from the words. */
  lines?: ExtractedLine[];
  /** Physical block candidates (geometry only, no semantics yet). */
  candidates?: BlockCandidate[];
  /** Embedded raster images, with original bytes when extraction succeeded. */
  images?: ExtractedImage[];
  /** Vector primitives useful for table/form reconstruction. */
  vectors?: ExtractedVector[];
  annotations?: ExtractedAnnotation[];
  links?: ExtractedLink[];
  formFields?: ExtractedFormField[];
  /** Per-page analysis metadata (quality, routing, density, typography). */
  analysis?: PageAnalysisMeta;
  /** Which extraction path produced the page blocks. */
  extractedBy?: ExtractionSource;
};

/** Everything the analysis layer learned about a page, kept beside the content. */
export type PageAnalysisMeta = {
  quality: NativeTextQuality;
  route: PageRoute;
  density: PageDensity;
  typography: TypographyStats;
  background: BackgroundAnalysis;
  textFlags?: PdfTextFlags;
  fontUsage?: Record<string, number>;
  hasTransparency?: boolean;
  /** Non-fatal problems encountered while extracting this page. */
  issues: ExtractionIssue[];
};

export type DocumentIR = {
  metadata: {
    fileName: string;
    pageCount: number;
    createdAt: string;
    extractor: "native" | "ocr" | "vision" | "mixed";
    languagePack: string;
    /** Document-level forensic record of the source PDF. */
    source?: PdfDocumentForensics;
  };
  pages: IrPage[];
  /** Flexible relationship graph (word→line, line→block, link→text, …). */
  relationships?: Relationship[];
};


let counter = 0;
export const nextBlockId = (prefix = "block") =>
  `${prefix}_${(counter += 1).toString().padStart(4, "0")}`;

export const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function normalizeBox(
  box: { x: number; y: number; width: number; height: number },
  page: { width: number; height: number },
): BBox {
  return {
    x: clamp01(box.x / page.width),
    y: clamp01(box.y / page.height),
    w: Math.max(0.004, clamp01(box.width / page.width)),
    h: Math.max(0.004, clamp01(box.height / page.height)),
  };
}

export const textBlocks = (page: IrPage) =>
  page.blocks.filter((block): block is TextBlock => block.kind === "text");

export const imageBlocks = (page: IrPage) =>
  page.blocks.filter((block): block is ImageBlock => block.kind === "image");

export function documentText(ir: DocumentIR) {
  return ir.pages
    .flatMap((page) =>
      [...textBlocks(page)]
        .sort((a, b) => a.readingOrder - b.readingOrder)
        .map((block) => block.text),
    )
    .join("\n");
}
