/** PDFAnalyzer + DocumentClassifier: decides which extraction path a page needs. */

import type { PdfPageItem } from "@/lib/pdf-to-png-store";
import type { PageClass } from "../ir";
import type { Stage, StageContext } from "../pipeline";

export type PageAnalysis = {
  item: PdfPageItem;
  index: number;
  classification: PageClass;
  /** Ratio of correctly mapped native glyphs (0..1). */
  nativeQuality: number;
  /** True when native text can be trusted without OCR. */
  nativeReliable: boolean;
};

export type DocumentAnalysis = {
  fileName: string;
  pages: PageAnalysis[];
  /** Document-level classification derived from the page mix. */
  documentClass: PageClass;
};

export function analyzePage(item: PdfPageItem, index: number): PageAnalysis {
  const spans = (item.text ?? []).filter((span) => span.str.trim().length > 0);
  const mapped = spans.filter((span) => !span.unmapped);
  const nativeQuality = spans.length === 0 ? 0 : mapped.length / spans.length;
  const nativeReliable = spans.length > 0 && item.rotation === 0 && nativeQuality >= 0.96;

  let classification: PageClass = "unknown";
  if (spans.length === 0) classification = "scanned";
  else if (nativeReliable) classification = "native";
  else classification = "hybrid";

  return { item, index, classification, nativeQuality, nativeReliable };
}

export const classifyStage: Stage<
  { items: PdfPageItem[]; fileName: string },
  DocumentAnalysis
> = {
  name: "classifier",
  state: "analyzing",
  async run({ items, fileName }, ctx: StageContext) {
    const selected = items.filter((item) => item.selected);
    if (selected.length === 0) throw new Error("Select at least one page first.");

    const pages = selected.map((item, index) => analyzePage(item, index));
    const scanned = pages.filter((page) => page.classification !== "native").length;
    const documentClass: PageClass =
      scanned === 0 ? "native" : scanned === pages.length ? "scanned" : "hybrid";

    ctx.logger.info("classifier", "document classified", {
      pages: pages.length,
      documentClass,
      scannedPages: scanned,
    });

    return { fileName, pages, documentClass };
  },
};
