import { rotateDataUrl } from "./pdf-to-png";
import { buildEditableLayouts } from "./pdf-ocr";
import type { PdfPageItem } from "./pdf-to-png-store";
import type { OcrMode, OcrProgress } from "./pdf-to-word";

/** Longest slide edge, in inches. Slide size matches the PDF page so there is no letterboxing. */
const MAX_EDGE = 10;
/** Page images are rendered at 2x, so 144 image px = 1 inch. */
const PX_PER_INCH = 144;

/** Renders the selected PDF pages onto PowerPoint slides (one page per slide, edge to edge). */
export async function convertPdfPagesToPpt(
  items: PdfPageItem[],
  baseName: string,
  mode: OcrMode = "image",
  onProgress?: (progress: OcrProgress) => void,
): Promise<{ blob: Blob; filename: string }> {
  const selected = items.filter((i) => i.selected);
  if (selected.length === 0) throw new Error("Select at least one page first.");

  const PptxGenJS = (await import("pptxgenjs")).default;
  const name = (baseName || "untitled").replace(/\.(pptx?|pdf)$/i, "");

  if (mode === "ocr") {
    const pages = await buildEditableLayouts(selected, onProgress);
    const first = pages[0];
    if (!first) throw new Error("No pages could be recognized.");
    const ratio = first.width / first.height;
    const slideW = ratio >= 1 ? MAX_EDGE : MAX_EDGE * ratio;
    const slideH = ratio >= 1 ? MAX_EDGE / ratio : MAX_EDGE;

    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "PDF_PAGE", width: slideW, height: slideH });
    pptx.layout = "PDF_PAGE";

    for (const page of pages) {
      const slide = pptx.addSlide();
      slide.background = { color: "FFFFFF" };
      const scale = Math.min(
        slideW / (page.width / PX_PER_INCH),
        slideH / (page.height / PX_PER_INCH),
      );
      for (const rule of page.rules) {
        const horizontal = rule.width >= rule.height;
        slide.addShape(horizontal ? pptx.ShapeType.line : pptx.ShapeType.line, {
          x: (rule.x / PX_PER_INCH) * scale,
          y: (rule.y / PX_PER_INCH) * scale,
          w: horizontal ? (rule.width / PX_PER_INCH) * scale : 0,
          h: horizontal ? 0 : (rule.height / PX_PER_INCH) * scale,
          line: { color: rule.color, width: 0.6 },
        });
      }

      if (page.texts.length === 0) {
        slide.addText(
          `${page.name}: no text was recognized. Try a clearer source PDF.`,
          { x: 0.4, y: 0.4, w: slideW - 0.8, h: 0.6, fontSize: 12, italic: true, color: "666666" },
        );
        continue;
      }
      for (const text of page.texts) {
        const x = (text.x / PX_PER_INCH) * scale;
        const y = (text.y / PX_PER_INCH) * scale;
        const sourceWidth = ((text.width + text.height * 0.35) / PX_PER_INCH) * scale;
        slide.addText(text.text, {
            x,
            y,
            // Office fonts rarely have the exact metrics of an embedded PDF
            // subset font. A little horizontal room prevents unintended wraps;
            // shrink-fit still protects the next column.
            w: Math.max(0.08, Math.min(sourceWidth * 1.18, slideW - x)),
            h: Math.max((text.height / PX_PER_INCH) * scale * 1.35, 0.12),
            margin: 0,
            valign: "middle",
            fontFace: text.font,
            fontSize: Math.max(5, Math.round(text.fontSize * scale * 10) / 10),
            bold: text.bold,
            italic: text.italic,
            color: "000000",
            align: "left",
            fit: "shrink",
            isTextBox: true,
          });
      }
    }

    const out = (await pptx.write({ outputType: "blob" })) as Blob;
    return {
      blob: new Blob([out], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
      filename: `${name}.pptx`,
    };
  }

  const pages = await Promise.all(
    selected.map(async (item) => {
      const rotated = await rotateDataUrl(item.dataUrl, item.rotation);
      return { dataUrl: rotated.dataUrl, ratio: rotated.width / rotated.height };
    }),
  );

  // Slide size follows the first page so the page fills the slide completely.
  const ratio = pages[0]?.ratio ?? 1;
  const slideW = ratio >= 1 ? MAX_EDGE : MAX_EDGE * ratio;
  const slideH = ratio >= 1 ? MAX_EDGE / ratio : MAX_EDGE;

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "PDF_PAGE", width: slideW, height: slideH });
  pptx.layout = "PDF_PAGE";

  for (const page of pages) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    let w = slideW;
    let h = slideW / page.ratio;
    if (h > slideH) {
      h = slideH;
      w = slideH * page.ratio;
    }
    slide.addImage({
      data: page.dataUrl,
      x: (slideW - w) / 2,
      y: (slideH - h) / 2,
      w,
      h,
    });
  }

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  return {
    blob: new Blob([blob], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    filename: `${name}.pptx`,
  };
}
