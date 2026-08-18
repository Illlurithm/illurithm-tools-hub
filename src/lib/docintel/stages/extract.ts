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

/** Native pdf.js text layer + local (tesseract) OCR fallback per page. */
async function extractWithoutVision(
  analysis: DocumentAnalysis,
  ctx: StageContext,
  onProgress?: (progress: OcrProgress) => void,
): Promise<IrPage[]> {
  const layouts = await buildEditableLayouts(
    analysis.pages.map((page) => page.item),
    onProgress,
    ctx.options.ocrLanguage,
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
    };
  });
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

    ctx.logger.info("extractor", "extraction complete", {
      extractor,
      pages: pages.length,
      blocks: pages.reduce((sum, page) => sum + page.blocks.length, 0),
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
      },
      pages,
    };
  },
};
