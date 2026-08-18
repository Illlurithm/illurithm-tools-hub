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
};

export type DocumentIR = {
  metadata: {
    fileName: string;
    pageCount: number;
    createdAt: string;
    extractor: "native" | "ocr" | "vision" | "mixed";
    languagePack: string;
  };
  pages: IrPage[];
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
