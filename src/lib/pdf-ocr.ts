import type { DocumentPageLayout, LayoutRule, LayoutText, OcrProgress } from "./document-layout";
import { containsDevanagari, officeFont } from "./document-layout";
import { groupTextLines, ptFromPx } from "./pdf-text-layout";
import type { PdfPageItem } from "./pdf-to-png-store";
import { rotateDataUrl } from "./pdf-to-png";

type ProgressHandler = (progress: OcrProgress) => void;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the PDF page for OCR."));
    image.src = src;
  });
}

function pageLanguage(text: string): DocumentPageLayout["language"] {
  const hasLatin = /[A-Za-z]/.test(text);
  const hasDevanagari = containsDevanagari(text);
  if (hasLatin && hasDevanagari) return "mixed";
  return hasDevanagari ? "devanagari" : "latin";
}

function nativeText(item: PdfPageItem): LayoutText[] {
  return groupTextLines(item.text ?? []).map((line) => ({
    kind: "text",
    text: line.text,
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
    font: officeFont(line.text, line.runs[0]?.font || "Arial"),
    fontSize: Math.max(5, ptFromPx(line.height)),
    bold: line.runs.some((run) => run.bold),
    italic: line.runs.some((run) => run.italic),
    confidence: 100,
  }));
}

function nativeTextIsReliable(item: PdfPageItem) {
  const spans = item.text ?? [];
  if (spans.length === 0 || item.rotation !== 0) return false;
  const visible = spans.filter((span) => span.str.trim().length > 0);
  if (visible.length === 0) return false;
  const mapped = visible.filter((span) => !span.unmapped);
  return mapped.length / visible.length >= 0.96;
}

async function tesseractText(
  dataUrl: string,
  page: number,
  total: number,
  onProgress?: ProgressHandler,
  language?: string,
): Promise<LayoutText[]> {
  const { createWorker, PSM } = await import("tesseract.js");
  const languages = language ? [language] : ["eng", "hin", "mar"];
  const worker = await createWorker(languages, undefined, {

    logger: (message) =>
      onProgress?.({
        page,
        total,
        status: message.status || "Recognizing text",
        progress: message.progress || 0,
      }),
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "144",
    });
    const result = await worker.recognize(dataUrl, {}, { blocks: true, text: true });
    const texts: LayoutText[] = [];
    for (const block of result.data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          // A whole OCR line is unsafe in forms: a single box can span several
          // table columns and Office then reflows it over neighbouring cells.
          // Word-level boxes retain the coordinates of labels, values and cells.
          for (const word of line.words) {
            const value = word.text.replace(/\s+/g, " ").trim();
            if (!value) continue;
            const width = Math.max(1, word.bbox.x1 - word.bbox.x0);
            const height = Math.max(1, word.bbox.y1 - word.bbox.y0);
            texts.push({
              kind: "text",
              text: value,
              x: word.bbox.x0,
              y: word.bbox.y0,
              width,
              height,
              font: officeFont(value),
              fontSize: Math.max(5, ptFromPx(height) * 0.78),
              bold: false,
              italic: false,
              confidence: word.confidence,
            });
          }
        }
      }
    }
    return texts;
  } finally {
    await worker.terminate();
  }
}

async function detectRules(dataUrl: string): Promise<LayoutRule[]> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const dark = (x: number, y: number) => {
    const offset = (y * canvas.width + x) * 4;
    const alpha = pixels[offset + 3] ?? 0;
    const red = pixels[offset] ?? 255;
    const green = pixels[offset + 1] ?? 255;
    const blue = pixels[offset + 2] ?? 255;
    return alpha > 100 && red + green + blue < 570;
  };
  const candidates: LayoutRule[] = [];
  const minHorizontal = canvas.width * 0.16;
  const minVertical = canvas.height * 0.08;

  for (let y = 0; y < canvas.height; y += 2) {
    let start = -1;
    for (let x = 0; x <= canvas.width; x += 1) {
      if (x < canvas.width && dark(x, y)) {
        if (start < 0) start = x;
      } else if (start >= 0) {
        if (x - start >= minHorizontal) {
          candidates.push({ kind: "line", x: start, y, width: x - start, height: 1, color: "B7B7B7" });
        }
        start = -1;
      }
    }
  }

  for (let x = 0; x < canvas.width; x += 2) {
    let start = -1;
    for (let y = 0; y <= canvas.height; y += 1) {
      if (y < canvas.height && dark(x, y)) {
        if (start < 0) start = y;
      } else if (start >= 0) {
        if (y - start >= minVertical) {
          candidates.push({ kind: "line", x, y: start, width: 1, height: y - start, color: "B7B7B7" });
        }
        start = -1;
      }
    }
  }

  const rules: LayoutRule[] = [];
  for (const rule of candidates) {
    const duplicate = rules.some((existing) => {
      const bothHorizontal = existing.width > existing.height && rule.width > rule.height;
      const bothVertical = existing.height > existing.width && rule.height > rule.width;
      if (bothHorizontal) return Math.abs(existing.y - rule.y) <= 3 && Math.abs(existing.x - rule.x) <= 8;
      if (bothVertical) return Math.abs(existing.x - rule.x) <= 3 && Math.abs(existing.y - rule.y) <= 8;
      return false;
    });
    if (!duplicate) rules.push(rule);
    if (rules.length >= 180) break;
  }
  return rules;
}

export async function buildEditableLayouts(
  items: PdfPageItem[],
  onProgress?: ProgressHandler,
  language?: string,
  /**
   * Optional per-page routing decision from the forensic stage. When omitted the
   * local native-quality heuristic is used, so other callers are unaffected.
   */
  useNativeForPage?: (item: PdfPageItem, index: number) => boolean,
): Promise<DocumentPageLayout[]> {
  const selected = items.filter((item) => item.selected);
  if (selected.length === 0) throw new Error("Select at least one page first.");
  const layouts: DocumentPageLayout[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    if (!item) continue;
    const pageNumber = index + 1;
    const rotated = await rotateDataUrl(item.dataUrl, item.rotation);
    onProgress?.({ page: pageNumber, total: selected.length, status: "Analyzing page structure", progress: 0.05 });
    const useNative = useNativeForPage
      ? useNativeForPage(item, index)
      : nativeTextIsReliable(item);
    const texts = useNative
      ? nativeText(item)
      : await tesseractText(rotated.dataUrl, pageNumber, selected.length, onProgress, language);

    const rules = await detectRules(rotated.dataUrl);
    const combined = texts.map((text) => text.text).join(" ");
    layouts.push({
      name: item.name || `page-${pageNumber}`,
      width: rotated.width,
      height: rotated.height,
      source: useNative ? "native" : "tesseract",
      language: pageLanguage(combined),
      texts,
      rules,
    });
    onProgress?.({ page: pageNumber, total: selected.length, status: "Page ready", progress: 1 });
  }
  return layouts;
}
