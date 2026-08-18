import { rotateDataUrl } from "./pdf-to-png";
import type { PdfPageItem } from "./pdf-to-png-store";
import { buildEditableLayouts } from "./pdf-ocr";
import { buildVisionPages } from "./vision-pipeline";
import { buildVisionDocx } from "./docx-vision";
import type { OcrProgress } from "./document-layout";

export type { OcrProgress } from "./document-layout";

export type WordFormat = "docx" | "doc";

/** "ocr" = extract selectable text into editable Word content, "image" = page as a picture. */
export type OcrMode = "ocr" | "image";

export type WordMargins = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export const DEFAULT_WORD_MARGINS: WordMargins = { top: 96, bottom: 96, left: 96, right: 96 };

/** US Letter page in CSS pixels at 96 dpi. */
const PAGE_W = 816;
const PAGE_H = 1056;
const PX_TO_TWIP = 15;
/** Page images are rendered at 2x (144 dpi): 1 image px = 0.5 pt = 10 twips. */
const IMG_PX_TO_TWIP = 10;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderSelected(items: PdfPageItem[], margins: WordMargins) {
  const selected = items.filter((i) => i.selected);
  if (selected.length === 0) throw new Error("Select at least one page first.");

  const maxW = Math.max(64, PAGE_W - margins.left - margins.right);
  const maxH = Math.max(64, PAGE_H - margins.top - margins.bottom);

  return Promise.all(
    selected.map(async (item) => {
      const rotated = await rotateDataUrl(item.dataUrl, item.rotation);
      const scale = Math.min(maxW / rotated.width, maxH / rotated.height, 1);
      return {
        name: item.name || "page",
        dataUrl: rotated.dataUrl,
        width: Math.round(rotated.width * scale),
        height: Math.round(rotated.height * scale),
      };
    }),
  );
}

async function buildEditableDocx(
  items: PdfPageItem[],
  onProgress?: (progress: OcrProgress) => void,
  language?: string,
) {
  const pages = await buildEditableLayouts(items, onProgress, language);

  // Native responsive Word tables (100% page width) instead of absolutely
  // positioned text frames: no overlap, no single-letter vertical wrapping.
  return buildVisionDocx(
    pages.map((page) => ({
      name: page.name,
      width: page.width,
      height: page.height,
      pageImage: "",
      blocks: page.texts.map((line) => ({
        type: "text" as const,
        x: line.x / page.width,
        y: line.y / page.height,
        w: Math.min(1, line.width / page.width),
        h: Math.min(1, line.height / page.height),
        text: line.text,
        font_size_pt: Math.max(5, line.fontSize),
        bold: line.bold,
        align: "left" as const,
        script: /[\u0900-\u097F]/.test(line.text)
          ? /[A-Za-z]/.test(line.text)
            ? ("mixed" as const)
            : ("devanagari" as const)
          : ("latin" as const),
      })),
      rules: page.rules
        .filter((rule) => rule.width >= rule.height)
        .map((rule) => ({
          x: rule.x / page.width,
          y: (rule.y + rule.height) / page.height,
          w: Math.min(1, rule.width / page.width),
          orientation: "horizontal" as const,
        })),
    })),
  );
}

/** Renders the selected PDF pages into a Word document (.docx via OOXML, .doc via Word HTML). */
export async function convertPdfPagesToWord(
  items: PdfPageItem[],
  baseName: string,
  format: WordFormat,
  margins: WordMargins,
  mode: OcrMode = "image",
  onProgress?: (progress: OcrProgress) => void,
  /** Tesseract language code, e.g. "eng". Defaults to the bundled language set. */
  language?: string,
  /** Cloud Vision layout reconstruction (borderless table grids + image extraction). */
  vision?: { enabled: boolean; languagePack: string },
): Promise<{ blob: Blob; filename: string }> {
  const name = (baseName || "untitled").replace(/\.(docx?|pdf)$/i, "");

  if (mode === "ocr" && vision?.enabled) {
    if (format === "doc") {
      throw new Error(
        "Layout-accurate OCR requires DOCX. Legacy DOC cannot preserve tables, Unicode scripts, and page geometry.",
      );
    }
    const pages = await buildVisionPages(items, vision.languagePack, onProgress);
    return { blob: await buildVisionDocx(pages), filename: `${name}.docx` };
  }

  if (mode === "ocr") {
    if (format === "doc") {
      throw new Error("Editable OCR requires DOCX. Legacy DOC cannot preserve tables, Unicode, and page geometry reliably.");
    }
    return {
      blob: await buildEditableDocx(items, onProgress, language),
      filename: `${name}.docx`,
    };
  }

  const pages = await renderSelected(items, margins);

  if (format === "doc") {

    const body = pages
      .map(
        (p, i) =>
          `<div${i > 0 ? ' style="page-break-before:always"' : ""}><img src="${p.dataUrl}" width="${p.width}" height="${p.height}" alt="${p.name}" /></div>`,
      )
      .join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8" /><title>${name}</title><style>@page { size: ${PAGE_W}px ${PAGE_H}px; margin: ${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px; } body { margin: 0; }</style></head><body>${body}</body></html>`;
    return {
      blob: new Blob([html], { type: "application/msword" }),
      filename: `${name}.doc`,
    };
  }

  const { Document, Packer, Paragraph, ImageRun } = await import("docx");

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W * PX_TO_TWIP, height: PAGE_H * PX_TO_TWIP },
            margin: {
              top: Math.round(margins.top * PX_TO_TWIP),
              bottom: Math.round(margins.bottom * PX_TO_TWIP),
              left: Math.round(margins.left * PX_TO_TWIP),
              right: Math.round(margins.right * PX_TO_TWIP),
            },
          },
        },
        children: pages.map(
          (p, i) =>
            new Paragraph({
              pageBreakBefore: i > 0,
              children: [
                new ImageRun({
                  type: "png",
                  data: dataUrlToBytes(p.dataUrl),
                  transformation: { width: p.width, height: p.height },
                  altText: { title: p.name, description: p.name, name: p.name },
                }),
              ],
            }),
        ),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return { blob, filename: `${name}.docx` };
}
