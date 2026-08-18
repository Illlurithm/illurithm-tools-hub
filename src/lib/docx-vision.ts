import { cropRegion, type VisionPageWithImage } from "./vision-pipeline";
import {
  DEVANAGARI_FONT,
  groupRows,
  LATIN_FONT,
  type VisionAlign,
  type VisionBlock,
} from "./vision-layout";

/** Page images are rendered at 2x (144 dpi): 1 image px = 0.5 pt = 10 twips. */
const IMG_PX_TO_TWIP = 10;
const MIN_CELL_TWIP = 60;

type Cell = { block: VisionBlock | null; width: number };

function splitRow(row: VisionBlock[], contentWidth: number): Cell[] {
  const cells: Cell[] = [];
  let cursor = 0;

  for (const block of row) {
    const start = Math.max(cursor, block.x);
    const gap = Math.round((start - cursor) * contentWidth);
    if (gap >= MIN_CELL_TWIP) cells.push({ block: null, width: gap });
    const width = Math.max(MIN_CELL_TWIP, Math.round(block.w * contentWidth));
    cells.push({ block, width });
    cursor = start + block.w;
  }

  const used = cells.reduce((sum, cell) => sum + cell.width, 0);
  if (used < contentWidth - MIN_CELL_TWIP) {
    cells.push({ block: null, width: contentWidth - used });
  } else if (used > contentWidth) {
    // Scale down proportionally so the row never overflows the page width.
    const scale = contentWidth / used;
    for (const cell of cells) cell.width = Math.max(MIN_CELL_TWIP, Math.floor(cell.width * scale));
  }
  return cells;
}

/**
 * Renders Vision OCR pages into a fully editable .docx built from borderless
 * table grids (never absolute floating frames), so text can not overlap.
 */
export async function buildVisionDocx(pages: VisionPageWithImage[]) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    TableLayoutType,
    AlignmentType,
    VerticalAlign,
    SectionType,
    HeightRule,
  } = await import("docx");

  const NONE = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
  const LINE = { style: BorderStyle.SINGLE, size: 4, color: "9A9A9A" } as const;
  const alignMap: Record<VisionAlign, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
  };

  const sections = [];

  for (const page of pages) {
    const pageWidth = Math.round(page.width * IMG_PX_TO_TWIP);
    const pageHeight = Math.round(page.height * IMG_PX_TO_TWIP);
    const margin = Math.round(pageWidth * 0.02);
    const contentWidth = pageWidth - margin * 2;

    const rows = groupRows(page.blocks);
    const tableRows = [];
    let previousBottom = 0;

    for (const row of rows) {
      const top = Math.min(...row.map((b) => b.y));
      const bottom = Math.max(...row.map((b) => b.y + b.h));

      const gap = top - previousBottom;
      if (gap > 0.008) {
        tableRows.push(
          new TableRow({
            height: { value: Math.round(gap * pageHeight), rule: HeightRule.EXACT },
            children: [
              new TableCell({
                width: { size: contentWidth, type: WidthType.DXA },
                borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
                children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })],
              }),
            ],
          }),
        );
      }
      previousBottom = bottom;

      const ruled = page.rules.some(
        (rule) => rule.orientation === "horizontal" && Math.abs(rule.y - bottom) < 0.012,
      );

      const cells = splitRow(row, contentWidth);
      const children = [];

      for (const cell of cells) {
        const borders = {
          top: NONE,
          bottom: ruled ? LINE : NONE,
          left: NONE,
          right: NONE,
        };
        const block = cell.block;

        if (!block) {
          children.push(
            new TableCell({
              width: { size: cell.width, type: WidthType.DXA },
              borders,
              children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })],
            }),
          );
          continue;
        }

        if (block.type === "image") {
          const crop = await cropRegion(page.pageImage, block);
          const widthPx = Math.max(12, Math.round(cell.width / 15));
          const heightPx = Math.max(12, Math.round((crop.height / crop.width) * widthPx));
          children.push(
            new TableCell({
              width: { size: cell.width, type: WidthType.DXA },
              borders,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  spacing: { before: 0, after: 0 },
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      type: "png",
                      data: crop.dataUrl.split(",")[1] ?? "",
                      transformation: { width: widthPx, height: heightPx },
                      altText: { title: block.label, description: block.label, name: block.label },
                    }),
                  ],
                }),
              ],
            }),
          );
          continue;
        }

        children.push(
          new TableCell({
            width: { size: cell.width, type: WidthType.DXA },
            borders,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 0, bottom: 0, left: 30, right: 30 },
            children: [
              new Paragraph({
                alignment: alignMap[block.align] ?? AlignmentType.LEFT,
                spacing: { before: 0, after: 0, line: 240, lineRule: "auto" },
                children: [
                  new TextRun({
                    text: block.text,
                    bold: block.bold,
                    size: Math.round(block.font_size_pt * 2),
                    font:
                      block.script === "latin"
                        ? LATIN_FONT
                        : { ascii: LATIN_FONT, hAnsi: LATIN_FONT, cs: DEVANAGARI_FONT },
                  }),
                ],
              }),
            ],
          }),
        );
      }

      tableRows.push(
        new TableRow({
          height: {
            value: Math.max(120, Math.round((bottom - top) * pageHeight)),
            rule: HeightRule.ATLEAST,
          },
          children,
        }),
      );
    }

    const body =
      tableRows.length > 0
        ? [
            new Table({
              layout: TableLayoutType.FIXED,
              width: { size: contentWidth, type: WidthType.DXA },
              borders: {
                top: NONE,
                bottom: NONE,
                left: NONE,
                right: NONE,
                insideHorizontal: NONE,
                insideVertical: NONE,
              },
              rows: tableRows,
            }),
          ]
        : [
            new Paragraph({
              children: [
                new TextRun({
                  text: `(${page.name}: no readable content was detected on this page)`,
                  italics: true,
                  size: 22,
                  font: LATIN_FONT,
                }),
              ],
            }),
          ];

    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: pageWidth, height: pageHeight },
          margin: {
            top: margin,
            bottom: margin,
            left: margin,
            right: margin,
            header: 0,
            footer: 0,
          },
        },
      },
      children: body,
    });
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: LATIN_FONT, size: 20 } },
      },
    },
    sections,
  });
  return Packer.toBlob(doc);
}
