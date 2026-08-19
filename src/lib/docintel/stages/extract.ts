/**
 * Extraction stage: native-text-first, OCR only when required.
 *
 *   analysis → native extraction (pdf.js text layer)
 *            → structured OCR (word/line boxes) for scanned pages
 *            → vision layout analysis when grid/table reconstruction is on
 *
 * Output is always Document IR pages, never raw text.
 */

import { buildEditableLayouts } from "@/lib/pdf-ocr";
import { buildVisionPages } from "@/lib/vision-pipeline";
import { rotateDataUrl } from "@/lib/pdf-to-png";
import { languagePackCodes } from "@/lib/pdf-to-word-request";
import type { OcrProgress } from "@/lib/document-layout";
import type { VisionBlock } from "@/lib/vision-layout";
import {
  reconstructBlockCandidates,
  reconstructLines,
  reconstructWords,
} from "@/lib/pdf/reconstruct";
import { linkOcrDuplicates } from "@/lib/pdf/quality";
import type { Relationship } from "@/lib/pdf/elements";
import {
  clamp01,
  nextBlockId,
  normalizeBox,
  type DocumentIR,
  type IrBlock,
  type IrPage,
} from "../ir";
import type { Stage, StageContext } from "../pipeline";
import { withFallback } from "../pipeline";
import type { DocumentAnalysis } from "./classify";

const scriptOf = (text: string) =>
  /[\u0900-\u097F]/.test(text)
    ? /[A-Za-z]/.test(text)
      ? ("mixed" as const)
      : ("devanagari" as const)
    : ("latin" as const);

function irFromVisionBlocks(blocks: VisionBlock[], page: number): IrBlock[] {
  return blocks.map((block, order) => {
    const bbox = { x: clamp01(block.x), y: clamp01(block.y), w: clamp01(block.w), h: clamp01(block.h) };
    if (block.type === "image") {
      return {
        id: nextBlockId("img"),
        kind: "image",
        region: "figure",
        page,
        bbox,
        readingOrder: order,
        confidence: 85,
        label: block.label,
      };
    }
    return {
      id: nextBlockId("txt"),
      kind: "text",
      region: "text_block",
      page,
      bbox,
      readingOrder: order,
      confidence: 90,
      text: block.text,
      style: {
        fontFamily: scriptOf(block.text) === "latin" ? "Arial" : "Noto Sans Devanagari",
        fontSizePt: block.font_size_pt,
        bold: block.bold,
        italic: false,
        align: block.align,
        script: block.script,
        ...(block.text_color ? { color: block.text_color } : {}),
        ...(block.bg_color ? { background: block.bg_color } : {}),
        ...(block.bordered ? { bordered: true } : {}),
      },
    };
  });
}

/** Native pdf.js text layer + local (tesseract) OCR fallback, decided per page. */
async function extractWithoutVision(
  analysis: DocumentAnalysis,
  ctx: StageContext,
  onProgress?: (progress: OcrProgress) => void,
): Promise<IrPage[]> {
  const layouts = await buildEditableLayouts(
    analysis.pages.map((page) => page.item),
    onProgress,
    ctx.options.ocrLanguage,
    // Page-level routing measured by the forensic stage.
    (_item, index) => analysis.pages[index]?.nativeReliable ?? false,
  );

  return layouts.map((layout, index) => {
    const source = analysis.pages[index];
    const blocks: IrBlock[] = layout.texts.map((line, order) => ({
      id: nextBlockId("txt"),
      kind: "text",
      region: "text_block",
      page: index + 1,
      bbox: normalizeBox(line, layout),
      readingOrder: order,
      confidence: line.confidence,
      text: line.text,
      style: {
        fontFamily: line.font,
        fontSizePt: Math.max(5, line.fontSize),
        bold: line.bold,
        italic: line.italic,
        align: "left",
        script: scriptOf(line.text),
      },
    }));

    // OCR pages keep their own word layer so it can be compared with (and
    // de-duplicated against) the native text the forensic stage already read.
    const ocrWords =
      layout.source === "tesseract"
        ? reconstructWords(
            layout.texts.map((text) => ({
              str: text.text,
              x: text.x,
              y: text.y,
              width: text.width,
              height: text.height,
              font: text.font,
              bold: text.bold,
              italic: text.italic,
              confidence: text.confidence,
              visibility: "visible" as const,
            })),
            {
              page: index + 1,
              size: { width: layout.width, height: layout.height },
              source: "ocr",
              ptPerPx: 0.5,
            },
          )
        : [];

    return {
      index,
      name: layout.name,
      width: layout.width,
      height: layout.height,
      classification: source?.classification ?? "unknown",
      pageImage: "",
      columns: 1,
      blocks,
      rules: layout.rules
        .filter((rule) => rule.width >= rule.height)
        .map((rule) => ({
          bbox: normalizeBox(rule, layout),
          orientation: "horizontal" as const,
        })),
      confidence: blocks.length
        ? blocks.reduce((sum, block) => sum + block.confidence, 0) / blocks.length
        : 0,
      extractedBy: layout.source === "native" ? ("native_pdf" as const) : ("ocr" as const),
      words: ocrWords,
    };
  });
}

/**
 * Copies the forensic observation layer onto the IR pages and links native and
 * OCR readings of the same content. Nothing is deleted: overlapping OCR words
 * are marked with `duplicateOf` so later stages can choose a winner.
 */
function attachForensicData(pages: IrPage[], analysis: DocumentAnalysis): Relationship[] {
  const relationships: Relationship[] = [];

  pages.forEach((page, index) => {
    const forensic = analysis.pages[index]?.forensic;
    if (!forensic) return;

    const nativeWords = forensic.words;
    const ocrWords = page.words ?? [];
    if (nativeWords.length > 0 && ocrWords.length > 0) {
      const { matched } = linkOcrDuplicates(nativeWords, ocrWords);
      if (matched > 0)
        relationships.push(
          ...ocrWords
            .filter((word) => word.duplicateOf)
            .map((word) => ({
              type: "ocr_of" as const,
              from: word.id,
              to: word.duplicateOf!,
            })),
        );
    }

    const ocrLines = ocrWords.length
      ? reconstructLines(ocrWords, {
          page: index + 1,
          size: { width: page.width, height: page.height },
        })
      : [];
    const ocrBlocks = ocrLines.length
      ? reconstructBlockCandidates(ocrLines, { page: index + 1 })
      : [];

    page.geometry = forensic.geometry;
    page.words = [...nativeWords, ...ocrWords];
    page.lines = [...forensic.lines, ...ocrLines];
    page.candidates = [...forensic.candidates, ...ocrBlocks];
    page.images = forensic.images;
    page.vectors = forensic.vectors;
    page.annotations = forensic.annotations;
    page.links = forensic.links;
    page.formFields = forensic.formFields;
    page.analysis = {
      quality: forensic.quality,
      route: forensic.route,
      density: forensic.density,
      typography: forensic.typography,
      background: forensic.background,
      ...(forensic.forensics
        ? {
            textFlags: forensic.forensics.textFlags,
            fontUsage: forensic.forensics.fontUsage,
            hasTransparency: forensic.forensics.hasTransparency,
          }
        : {}),
      issues: forensic.issues,
    };

    relationships.push(
      ...forensic.relationships,
      ...ocrLines.flatMap((line) =>
        line.wordIds.map((wordId) => ({ type: "word_line" as const, from: wordId, to: line.id })),
      ),
      ...ocrBlocks.flatMap((block) =>
        block.lineIds.map((lineId) => ({
          type: "line_block" as const,
          from: lineId,
          to: block.id,
        })),
      ),
      ...(page.candidates ?? []).map((block) => ({
        type: "block_page" as const,
        from: block.id,
        to: `page_${index + 1}`,
      })),
    );
  });

  return relationships;
}



/** Page raster only (no text understanding) — used when OCR is disabled. */
async function extractRastersOnly(analysis: DocumentAnalysis): Promise<IrPage[]> {
  return Promise.all(
    analysis.pages.map(async (page, index) => {
      const rotated = await rotateDataUrl(page.item.dataUrl, page.item.rotation);
      return {
        index,
        name: page.item.name || `page-${index + 1}`,
        width: rotated.width,
        height: rotated.height,
        classification: page.classification,
        pageImage: rotated.dataUrl,
        columns: 1,
        blocks: [
          {
            id: nextBlockId("img"),
            kind: "image" as const,
            region: "image" as const,
            page: index + 1,
            bbox: { x: 0, y: 0, w: 1, h: 1 },
            readingOrder: 0,
            confidence: 100,
            label: "page",
          },
        ],
        rules: [],
        confidence: 0,
      };
    }),
  );
}

export const extractStage: Stage<DocumentAnalysis, DocumentIR> = {
  name: "extractor",
  state: "extracting",
  async run(analysis, ctx) {
    const total = analysis.pages.length;
    const onProgress = (progress: OcrProgress) =>
      ctx.setState("ocr", {
        progress: progress.progress,
        page: progress.page,
        totalPages: total,
        detail: progress.status,
      });

    let extractor: DocumentIR["metadata"]["extractor"] = "native";
    let pages: IrPage[];

    if (!ctx.options.ocrEnabled) {
      pages = await extractRastersOnly(analysis);
      extractor = "native";
    } else if (ctx.options.preserveLayout) {
      ctx.setState("layout_analysis");
      pages = await withFallback(
        ctx,
        "extractor",
        async () => {
          const vision = await buildVisionPages(
            analysis.pages.map((page) => page.item),
            ctx.options.languagePack,
            onProgress,
          );
          return vision.map((page, index) => ({
            index,
            name: page.name,
            width: page.width,
            height: page.height,
            classification: analysis.pages[index]?.classification ?? "unknown",
            pageImage: page.pageImage,
            columns: 1,
            blocks: irFromVisionBlocks(page.blocks, index + 1),
            rules: page.rules.map((rule) => ({
              bbox: { x: rule.x, y: rule.y, w: rule.w, h: 0.002 },
              orientation: rule.orientation,
            })),
            confidence: 90,
          }));
        },
        () => extractWithoutVision(analysis, ctx, onProgress),
      );
      extractor = "vision";
    } else {
      pages = await extractWithoutVision(analysis, ctx, onProgress);
      extractor =
        analysis.documentClass === "native"
          ? "native"
          : analysis.documentClass === "scanned"
            ? "ocr"
            : "mixed";
    }

    const relationships = attachForensicData(pages, analysis);

    ctx.logger.info("extractor", "extraction complete", {
      extractor,
      pages: pages.length,
      blocks: pages.reduce((sum, page) => sum + page.blocks.length, 0),
      words: pages.reduce((sum, page) => sum + (page.words?.length ?? 0), 0),
      lines: pages.reduce((sum, page) => sum + (page.lines?.length ?? 0), 0),
      ocrPages: pages.filter((page) => page.extractedBy === "ocr").length,
      nativePages: pages.filter((page) => page.extractedBy === "native_pdf").length,
      relationships: relationships.length,
    });

    return {
      metadata: {
        fileName: analysis.fileName,
        pageCount: pages.length,
        createdAt: new Date().toISOString(),
        extractor,
        languagePack: languagePackCodes(
          ctx.options.languagePack as Parameters<typeof languagePackCodes>[0],
        ),
        ...(analysis.forensics.document ? { source: analysis.forensics.document } : {}),
      },
      pages,
      relationships,
    };
  },
};

