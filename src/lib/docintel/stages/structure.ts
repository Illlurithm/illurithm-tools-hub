/**
 * Layout / reading-order / structure stage.
 *
 * Operates purely on the Document IR:
 *   column detection → reading order → header/footer detection → region typing
 *
 * Each concern is a small pure function so it can be improved (or swapped for a
 * layout model) without touching extraction or rendering.
 */

import { textBlocks, type IrPage, type DocumentIR, type RegionType } from "../ir";
import type { Stage } from "../pipeline";

/** Detects the number of text columns from horizontal block distribution. */
export function detectColumns(page: IrPage): number {
  const texts = textBlocks(page);
  if (texts.length < 8) return 1;
  const bins = new Array(10).fill(0);
  for (const block of texts) {
    const bin = Math.min(9, Math.floor((block.bbox.x + block.bbox.w / 2) * 10));
    bins[bin] += 1;
  }
  // A vertical gutter shows up as an empty band between two populated halves.
  const gutter = bins.findIndex((count, index) => index > 1 && index < 8 && count === 0);
  if (gutter === -1) return 1;
  const left = bins.slice(0, gutter).reduce((a, b) => a + b, 0);
  const right = bins.slice(gutter + 1).reduce((a, b) => a + b, 0);
  return left > texts.length * 0.2 && right > texts.length * 0.2 ? 2 : 1;
}

/** Column-aware reading order: full column top-to-bottom, then the next column. */
export function assignReadingOrder(page: IrPage, columns: number) {
  const ordered = [...page.blocks].sort((a, b) => {
    if (columns > 1) {
      const columnA = a.bbox.x + a.bbox.w / 2 < 0.5 ? 0 : 1;
      const columnB = b.bbox.x + b.bbox.w / 2 < 0.5 ? 0 : 1;
      if (columnA !== columnB) return columnA - columnB;
    }
    const rowDelta = a.bbox.y - b.bbox.y;
    if (Math.abs(rowDelta) > Math.min(a.bbox.h, b.bbox.h) * 0.5) return rowDelta;
    return a.bbox.x - b.bbox.x;
  });
  ordered.forEach((block, index) => {
    block.readingOrder = index;
  });
}

const MEAN_SIZE_HEADING = 1.35;

/** Assigns semantic region types using geometry + typography heuristics. */
export function classifyRegions(page: IrPage) {
  const texts = textBlocks(page);
  if (texts.length === 0) return;
  const sizes = texts.map((block) => block.style.fontSizePt);
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;

  for (const block of texts) {
    let region: RegionType = "paragraph";
    const centre = block.bbox.y + block.bbox.h / 2;
    const ratio = block.style.fontSizePt / (mean || 1);

    if (centre < 0.06) region = "header";
    else if (centre > 0.95) region = "footer";
    else if (ratio >= MEAN_SIZE_HEADING && centre < 0.25) region = "title";
    else if (ratio >= MEAN_SIZE_HEADING) region = "heading";
    else if (block.style.bold && ratio >= 1.1) region = "subheading";
    else if (/^\s*([-•*]|\(?\d{1,2}[.)])\s+/.test(block.text)) region = "list_item";
    else if (block.style.bordered) region = "table_cell";
    else if (/[=∑∫√±]|\^\d|_\{/.test(block.text) && block.text.length < 80) region = "equation";
    else if (block.bbox.w < 0.6 && /^(fig(ure)?|table|chart)\b/i.test(block.text)) region = "caption";

    block.region = region;
  }

  // Associate figures with the nearest caption below them.
  for (const block of page.blocks) {
    if (block.kind !== "image") continue;
    const caption = texts
      .filter((text) => text.region === "caption" && text.bbox.y >= block.bbox.y + block.bbox.h - 0.02)
      .sort((a, b) => a.bbox.y - b.bbox.y)[0];
    if (caption) block.captionId = caption.id;
  }
}

export const structureStage: Stage<DocumentIR, DocumentIR> = {
  name: "structure",
  state: "structure_analysis",
  async run(ir, ctx) {
    for (const page of ir.pages) {
      page.columns = detectColumns(page);
      assignReadingOrder(page, page.columns);
      classifyRegions(page);
    }
    ctx.logger.info("structure", "structure analysis complete", {
      multiColumnPages: ir.pages.filter((page) => page.columns > 1).length,
    });
    return ir;
  },
};
