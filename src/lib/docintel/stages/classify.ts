/**
 * DocumentClassifier: turns the forensic record into a per-page processing route.
 *
 * Classification is PAGE level: a hybrid PDF can mix native and scanned pages and
 * each one is routed on its own measured native-text quality.
 */

import type { PdfPageItem } from "@/lib/pdf-to-png-store";
import type { PageClass } from "../ir";
import type { Stage, StageContext } from "../pipeline";
import type { ForensicDocument, ForensicPage } from "./forensics";

export type PageAnalysis = {
  item: PdfPageItem;
  index: number;
  classification: PageClass;
  /** Native text quality of the page (0..1), measured by the forensic stage. */
  nativeQuality: number;
  /** True when native text can be trusted without OCR. */
  nativeReliable: boolean;
  /** Full forensic record of the page. */
  forensic: ForensicPage;
};

export type DocumentAnalysis = {
  fileName: string;
  pages: PageAnalysis[];
  /** Document-level classification derived from the page mix. */
  documentClass: PageClass;
  forensics: ForensicDocument;
};

/** Maps measured page facts onto the IR page class. */
export function classifyPage(page: ForensicPage): PageClass {
  const { density, quality, route } = page;
  if (density.profile === "blank") return "unknown";
  if (density.profile === "form_heavy" || density.profile === "table_heavy") return "table_heavy";
  if (quality.wordCount === 0) return density.imageCount > 0 ? "scanned" : "unknown";
  if (density.profile === "mostly_image") return "image_heavy";
  if (route.route === "native") return "native";
  if (route.route === "hybrid") return "hybrid";
  return "scanned";
}

export const classifyStage: Stage<ForensicDocument, DocumentAnalysis> = {
  name: "classifier",
  state: "analyzing",
  async run(forensics, ctx: StageContext) {
    const pages: PageAnalysis[] = forensics.pages.map((page) => ({
      item: page.item,
      index: page.index,
      classification: classifyPage(page),
      nativeQuality: page.quality.score,
      nativeReliable: page.route.route === "native",
      forensic: page,
    }));

    const nonNative = pages.filter((page) => !page.nativeReliable).length;
    const documentClass: PageClass =
      nonNative === 0 ? "native" : nonNative === pages.length ? "scanned" : "hybrid";

    ctx.logger.info("classifier", "document classified", {
      pages: pages.length,
      documentClass,
      pageRoutes: forensics.pages.map((page) => `${page.pageNumber}:${page.route.route}`).join(","),
      nativeQuality: forensics.pages.map((page) => page.quality.score).join(","),
    });

    return { fileName: forensics.fileName, pages, documentClass, forensics };
  },
};
