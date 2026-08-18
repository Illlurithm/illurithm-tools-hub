/**
 * DOCX reconstruction stage: Document IR → real Word document.
 *
 * The renderer only knows about the IR, so extraction/OCR/layout can change
 * freely. It delegates the OOXML work to the native-table DOCX writer
 * (responsive Word tables, no floating frames, Unicode-safe fonts).
 */

import { buildVisionDocx } from "@/lib/docx-vision";
import type { VisionBlock, VisionPage } from "@/lib/vision-layout";
import type { VisionPageWithImage } from "@/lib/vision-pipeline";
import { type DocumentIR, textBlocks } from "../ir";
import type { Stage } from "../pipeline";

/** Regions that are dropped from the body flow (reproduced as page furniture later). */
const SKIP: string[] = [];

export function irToRenderPages(ir: DocumentIR): VisionPageWithImage[] {
  return ir.pages.map((page) => {
    const blocks: VisionBlock[] = [...page.blocks]
      .sort((a, b) => a.readingOrder - b.readingOrder)
      .filter((block) => !SKIP.includes(block.region))
      .map((block) => {
        if (block.kind === "image") {
          return {
            type: "image" as const,
            x: block.bbox.x,
            y: block.bbox.y,
            w: block.bbox.w,
            h: block.bbox.h,
            label: block.label,
          };
        }
        return {
          type: "text" as const,
          x: block.bbox.x,
          y: block.bbox.y,
          w: block.bbox.w,
          h: block.bbox.h,
          text: block.text,
          font_size_pt: block.style.fontSizePt,
          bold: block.style.bold || block.region === "title" || block.region === "heading",
          align: block.style.align,
          script: block.style.script,
          ...(block.style.background ? { bg_color: block.style.background } : {}),
          ...(block.style.color ? { text_color: block.style.color } : {}),
          ...(block.style.bordered ? { bordered: true } : {}),
        };
      });

    const rules: VisionPage["rules"] = page.rules.map((rule) => ({
      x: rule.bbox.x,
      y: rule.bbox.y,
      w: rule.bbox.w,
      orientation: rule.orientation,
    }));

    return {
      name: page.name,
      width: page.width,
      height: page.height,
      blocks,
      rules,
      pageImage: page.pageImage,
    };
  });
}

export const renderDocxStage: Stage<DocumentIR, { blob: Blob; ir: DocumentIR }> = {
  name: "docx-renderer",
  state: "generating_docx",
  async run(ir, ctx) {
    const pages = irToRenderPages(ir);
    const blob = await buildVisionDocx(pages);
    ctx.logger.info("docx-renderer", "document rendered", {
      pages: pages.length,
      textBlocks: ir.pages.reduce((sum, page) => sum + textBlocks(page).length, 0),
      bytes: blob.size,
    });
    return { blob, ir };
  },
};
