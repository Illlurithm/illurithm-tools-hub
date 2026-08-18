/** Quality validation stage: compares the IR against the generated DOCX. */

import { documentText, imageBlocks, textBlocks, type DocumentIR } from "../ir";
import type { Stage } from "../pipeline";

export type QualityReport = {
  pages: number;
  textBlocks: number;
  imageBlocks: number;
  characters: number;
  headings: number;
  multiColumnPages: number;
  /** Mean OCR/extraction confidence across pages (0..100). */
  meanConfidence: number;
  lowConfidenceBlocks: number;
  emptyPages: number[];
  bytes: number;
  warnings: string[];
};

export const validateStage: Stage<
  { blob: Blob; ir: DocumentIR },
  { blob: Blob; ir: DocumentIR; report: QualityReport }
> = {
  name: "validator",
  state: "validating",
  async run({ blob, ir }, ctx) {
    const texts = ir.pages.flatMap((page) => textBlocks(page));
    const images = ir.pages.flatMap((page) => imageBlocks(page));
    const confidences = texts.map((block) => block.confidence).filter((value) => value > 0);
    const emptyPages = ir.pages
      .filter((page) => page.blocks.length === 0)
      .map((page) => page.index + 1);

    const report: QualityReport = {
      pages: ir.pages.length,
      textBlocks: texts.length,
      imageBlocks: images.length,
      characters: documentText(ir).length,
      headings: texts.filter((block) =>
        ["title", "heading", "subheading"].includes(block.region),
      ).length,
      multiColumnPages: ir.pages.filter((page) => page.columns > 1).length,
      meanConfidence: confidences.length
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : 0,
      lowConfidenceBlocks: texts.filter((block) => block.confidence > 0 && block.confidence < 60)
        .length,
      emptyPages,
      bytes: blob.size,
      warnings: [],
    };

    if (blob.size < 2048) report.warnings.push("Generated document is suspiciously small.");
    if (emptyPages.length) report.warnings.push(`No content detected on page(s) ${emptyPages.join(", ")}.`);
    if (report.meanConfidence > 0 && report.meanConfidence < 70)
      report.warnings.push("Low recognition confidence — check the output against the source.");

    for (const warning of report.warnings) ctx.logger.warn("validator", warning);
    ctx.logger.info("validator", "quality report", { ...report, warnings: report.warnings.length });

    return { blob, ir, report };
  },
};
