import { rotateDataUrl } from "./pdf-to-png";
import type { PdfPageItem } from "./pdf-to-png-store";
import type { OcrProgress } from "./document-layout";
import { analyzePageLayout } from "./vision-ocr.functions";
import {
  clamp01,
  hasDevanagari,
  VISION_LANGUAGE_HINTS,
  type VisionBlock,
  type VisionPage,
} from "./vision-layout";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the PDF page."));
    image.src = src;
  });
}

/** Downscales a page image so the Vision request stays small and fast. */
async function forVision(dataUrl: string, maxSide = 1700) {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale >= 1) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Crops a normalized region out of a page image and returns it as a PNG data URL. */
export async function cropRegion(
  dataUrl: string,
  region: { x: number; y: number; w: number; h: number },
) {
  const image = await loadImage(dataUrl);
  const sx = Math.round(clamp01(region.x) * image.naturalWidth);
  const sy = Math.round(clamp01(region.y) * image.naturalHeight);
  const sw = Math.max(4, Math.round(clamp01(region.w) * image.naturalWidth));
  const sh = Math.max(4, Math.round(clamp01(region.h) * image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(sw, image.naturalWidth - sx);
  canvas.height = Math.min(sh, image.naturalHeight - sy);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not crop the page image.");
  ctx.drawImage(image, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

export type VisionPageWithImage = VisionPage & { pageImage: string };

/** Runs the cloud Vision OCR pipeline over the selected pages. */
export async function buildVisionPages(
  items: PdfPageItem[],
  languagePack: string,
  onProgress?: (progress: OcrProgress) => void,
): Promise<VisionPageWithImage[]> {
  const selected = items.filter((item) => item.selected);
  if (selected.length === 0) throw new Error("Select at least one page first.");
  const languages = VISION_LANGUAGE_HINTS[languagePack] ?? "English";
  const pages: VisionPageWithImage[] = [];

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index]!;
    const page = index + 1;
    onProgress?.({ page, total: selected.length, status: "Reading page layout", progress: 0.15 });
    const rotated = await rotateDataUrl(item.dataUrl, item.rotation);
    const image = await forVision(rotated.dataUrl);
    onProgress?.({ page, total: selected.length, status: "Cloud OCR (multi-language)", progress: 0.45 });

    const result = await analyzePageLayout({ data: { image, languages } });

    const blocks: VisionBlock[] = [];
    for (const raw of result.blocks) {
      const box = {
        x: clamp01(raw.x),
        y: clamp01(raw.y),
        w: Math.max(0.005, clamp01(raw.w)),
        h: Math.max(0.005, clamp01(raw.h)),
      };
      if (raw.type === "image") {
        blocks.push({ type: "image", ...box, label: raw.label || "other" });
        continue;
      }
      const text = raw.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const script = hasDevanagari(text)
        ? /[A-Za-z]/.test(text)
          ? "mixed"
          : "devanagari"
        : "latin";
      blocks.push({
        type: "text",
        ...box,
        text,
        font_size_pt: Math.min(36, Math.max(6, raw.font_size_pt || 10)),
        bold: raw.bold,
        align: raw.align,
        script,
        ...(raw.bg_color ? { bg_color: raw.bg_color } : {}),
        ...(raw.text_color ? { text_color: raw.text_color } : {}),
        ...(raw.bordered ? { bordered: true } : {}),
      });
    }

    pages.push({
      name: item.name || `page-${page}`,
      width: rotated.width,
      height: rotated.height,
      blocks,
      rules: result.rules.map((rule) => ({
        x: clamp01(rule.x),
        y: clamp01(rule.y),
        w: clamp01(rule.w),
        orientation: rule.orientation,
      })),
      pageImage: rotated.dataUrl,
    });
    onProgress?.({ page, total: selected.length, status: "Page ready", progress: 1 });
  }

  return pages;
}
