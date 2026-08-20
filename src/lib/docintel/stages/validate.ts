/** Quality validation stage: compares the IR against the generated DOCX. */

import { documentText, imageBlocks, textBlocks, type DocumentIR, type IrPage } from "../ir";
import type { Stage } from "../pipeline";

/** Forensic-layer metrics, derived from what the extraction core actually measured. */
export type ForensicReport = {
  /** Pages routed to each reading path by the forensic stage. */
  nativePages: number;
  ocrPages: number;
  hybridPages: number;
  /** Mean native-text-layer quality score (0..1) across pages that have one. */
  meanNativeQuality: number;
  /** Lowest native quality score seen, with the page it came from (1-based). */
  worstNativeQuality: { page: number; score: number; reasons: string[] } | null;
  words: number;
  lines: number;
  blockCandidates: number;
  duplicateWords: number;
  hiddenWords: number;
  unmappedWords: number;
  embeddedImages: number;
  vectors: number;
  annotations: number;
  links: number;
  formFields: number;
  rotatedPages: number;
  /** Page density profiles → page count. */
  profiles: Record<string, number>;
  /** Distinct font families observed, most used first (max 8). */
  fontFamilies: string[];
  /** Non-fatal extraction issues collected per page. */
  issues: { page: number; stage: string; error: string; recovered: boolean }[];
  /** True when no page exposed the forensic analysis layer. */
  unavailable: boolean;
};

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
  /** Metrics produced by the forensic extraction core. */
  forensics: ForensicReport;
  warnings: string[];
};

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/** Summarizes the forensic layer of the IR. Missing data is reported, never faked. */
export function forensicReport(pages: IrPage[]): ForensicReport {
  const analyzed = pages.filter((page) => page.analysis);
  const words = pages.flatMap((page) => page.words ?? []);
  const qualities = analyzed
    .map((page) => ({
      page: page.index + 1,
      quality: page.analysis!.quality,
    }))
    .filter((entry) => entry.quality.wordCount > 0);

  const worst = qualities.reduce<{ page: number; score: number; reasons: string[] } | null>(
    (lowest, entry) =>
      !lowest || entry.quality.score < lowest.score
        ? { page: entry.page, score: entry.quality.score, reasons: entry.quality.reasons }
        : lowest,
    null,
  );

  const profiles: Record<string, number> = {};
  for (const page of analyzed) {
    const profile = page.analysis!.density.profile;
    profiles[profile] = (profiles[profile] ?? 0) + 1;
  }

  const familyChars: Record<string, number> = {};
  for (const page of analyzed) {
    for (const [family, chars] of Object.entries(page.analysis!.typography.families)) {
      familyChars[family] = (familyChars[family] ?? 0) + chars;
    }
  }

  const routeCount = (route: "native" | "ocr" | "hybrid") =>
    analyzed.filter((page) => page.analysis!.route.route === route).length;

  return {
    nativePages: routeCount("native"),
    ocrPages: routeCount("ocr"),
    hybridPages: routeCount("hybrid"),
    meanNativeQuality: Number(mean(qualities.map((entry) => entry.quality.score)).toFixed(3)),
    worstNativeQuality: worst,
    words: words.length,
    lines: pages.reduce((sum, page) => sum + (page.lines?.length ?? 0), 0),
    blockCandidates: pages.reduce((sum, page) => sum + (page.candidates?.length ?? 0), 0),
    duplicateWords: words.filter((word) => word.duplicateOf).length,
    hiddenWords: words.filter((word) => word.visibility === "hidden").length,
    unmappedWords: words.filter((word) => word.unmapped).length,
    embeddedImages: pages.reduce((sum, page) => sum + (page.images?.length ?? 0), 0),
    vectors: pages.reduce((sum, page) => sum + (page.vectors?.length ?? 0), 0),
    annotations: pages.reduce((sum, page) => sum + (page.annotations?.length ?? 0), 0),
    links: pages.reduce((sum, page) => sum + (page.links?.length ?? 0), 0),
    formFields: pages.reduce((sum, page) => sum + (page.formFields?.length ?? 0), 0),
    rotatedPages: pages.filter(
      (page) => (page.geometry?.rotation ?? 0) !== 0 || (page.geometry?.userRotation ?? 0) !== 0,
    ).length,
    profiles,
    fontFamilies: Object.entries(familyChars)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([family]) => family),
    issues: analyzed.flatMap((page) =>
      page.analysis!.issues.map((issue) => ({
        page: issue.page,
        stage: issue.stage,
        error: issue.error,
        recovered: issue.recovered,
      })),
    ),
    unavailable: analyzed.length === 0,
  };
}

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
    const forensics = forensicReport(ir.pages);

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
      forensics,
      warnings: [],
    };

    if (blob.size < 2048) report.warnings.push("Generated document is suspiciously small.");
    if (emptyPages.length) report.warnings.push(`No content detected on page(s) ${emptyPages.join(", ")}.`);
    if (report.meanConfidence > 0 && report.meanConfidence < 70)
      report.warnings.push("Low recognition confidence — check the output against the source.");

    // ---- Forensic warnings -------------------------------------------------
    if (forensics.worstNativeQuality && forensics.worstNativeQuality.score < 0.5)
      report.warnings.push(
        `Weak text layer on page ${forensics.worstNativeQuality.page} (${forensics.worstNativeQuality.reasons.join(", ")}).`,
      );
    if (forensics.unmappedWords > 0)
      report.warnings.push(
        `${forensics.unmappedWords} word(s) used fonts with no readable character mapping — verify spelling.`,
      );
    if (forensics.hiddenWords > 0 && forensics.words > 0 && forensics.hiddenWords / forensics.words > 0.5)
      report.warnings.push("Most of the source text is an invisible layer; results may differ from the page.");
    if (forensics.embeddedImages > 0 && images.length === 0)
      report.warnings.push(
        `${forensics.embeddedImages} embedded image(s) were detected but not placed in the document.`,
      );
    if (forensics.links > 0)
      report.warnings.push(`${forensics.links} hyperlink(s) in the source are not carried into Word yet.`);
    if (forensics.formFields > 0)
      report.warnings.push(
        `${forensics.formFields} interactive form field(s) were flattened to plain text.`,
      );
    for (const issue of forensics.issues.filter((entry) => !entry.recovered))
      report.warnings.push(`Page ${issue.page}: ${issue.stage} failed (${issue.error}).`);

    for (const warning of report.warnings) ctx.logger.warn("validator", warning);
    ctx.logger.info("validator", "quality report", { ...report, warnings: report.warnings.length });
    ctx.logger.info("validator", "forensic metrics", forensics);

    return { blob, ir, report };
  },
};
