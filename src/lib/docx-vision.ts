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
/** Percentage widths keep tables responsive; 4% is the floor that stops
 *  single-letter vertical wrapping inside narrow cells. */
const MIN_CELL_PCT = 4;

type Cell = { block: VisionBlock | null; pct: number };

/** Splits a visual row into responsive percentage-width cells (sum = 100%). */
function splitRow(row: VisionBlock[]): Cell[] {
  const cells: Cell[] = [];
  let cursor = 0;

  for (const block of row) {
    const start = Math.max(cursor, block.x);
    const gapPct = (start - cursor) * 100;
    if (gapPct >= MIN_CELL_PCT) cells.push({ block: null, pct: gapPct });
    cells.push({ block, pct: Math.max(MIN_CELL_PCT, block.w * 100) });
    cursor = start + block.w;
  }

  const trailing = (1 - cursor) * 100;
  if (trailing >= MIN_CELL_PCT) cells.push({ block: null, pct: trailing });

  // Normalize so every row fills exactly 100% of the page width.
  const total = cells.reduce((sum, cell) => sum + cell.pct, 0) || 1;
  for (const cell of cells) cell.pct = Math.max(MIN_CELL_PCT, (cell.pct / total) * 100);
  const scaled = cells.reduce((sum, cell) => sum + cell.pct, 0);
  if (cells.length > 0 && scaled !== 100) {
    const last = cells[cells.length - 1]!;
    last.pct = Math.max(MIN_CELL_PCT, last.pct + (100 - scaled));
  }
  return cells;
}

const hex = (value?: string) => {
  const match = /^#?([0-9a-f]{6})$/i.exec((value ?? "").trim());
  return match ? match[1]!.toUpperCase() : null;
};

/**
 * Renders Vision OCR pages into a fully editable .docx built from native,
 * responsive (100% page width) Word tables — never absolute floating frames —
 * with cell shading, bordered form grids, spanned section headers and
 * UTF-8-safe Devanagari/Latin font pairing.
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
    ShadingType,
  } = await import("docx");

  const NONE = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
  const LINE = { style: BorderStyle.SINGLE, size: 4, color: "8A8A8A" } as const;
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
    const layouts = rows.map((row) => ({ row, cells: splitRow(row) }));
    const columnCount = Math.max(1, ...layouts.map((entry) => entry.cells.length));
    const tableRows = [];

    for (const { row, cells } of layouts) {
      const bottom = Math.max(...row.map((b) => b.y + b.h));
      const ruled = page.rules.some(
        (rule) => rule.orientation === "horizontal" && Math.abs(rule.y - bottom) < 0.012,
      );

      const children = [];
      for (const cell of cells) {
        const block = cell.block;
        const fill = block && block.type === "text" ? hex(block.bg_color) : null;
        const bordered = Boolean(block && block.type === "text" && block.bordered) || Boolean(fill);
        const borders = bordered
          ? { top: LINE, bottom: LINE, left: LINE, right: LINE }
          : { top: NONE, bottom: ruled ? LINE : NONE, left: NONE, right: NONE };

        // A lone wide cell spans the full grid (colspan) so section headers and
        // key/value pairs keep their original width.
        const span = cells.length === 1 ? { columnSpan: columnCount } : {};
        const width = { size: cell.pct, type: WidthType.PERCENTAGE } as const;
        const shading = fill ? { shading: { fill, type: ShadingType.CLEAR, color: "auto" } } : {};

        if (!block) {
          children.push(
            new TableCell({
              width,
              ...span,
              borders,
              children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })],
            }),
          );
          continue;
        }

        if (block.type === "image") {
          const crop = await cropRegion(page.pageImage, block);
          const widthPx = Math.max(16, Math.round((cell.pct / 100) * contentWidth) / 15);
          const heightPx = Math.max(16, Math.round((crop.height / crop.width) * widthPx));
          children.push(
            new TableCell({
              width,
              ...span,
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
                      transformation: { width: Math.round(widthPx), height: Math.round(heightPx) },
                      altText: { title: block.label, description: block.label, name: block.label },
                    }),
                  ],
                }),
              ],
            }),
          );
          continue;
        }

        const textHex = hex(block.text_color) ?? (fill ? "FFFFFF" : null);
        const color = textHex ? { color: textHex } : {};
        children.push(
          new TableCell({
            width,
            ...span,
            borders,
            ...shading,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 20, bottom: 20, left: 60, right: 60 },
            children: [
              new Paragraph({
                alignment: alignMap[block.align] ?? AlignmentType.LEFT,
                spacing: { before: 0, after: 0, line: 240, lineRule: "auto" },
                children: [
                  new TextRun({
                    text: block.text,
                    bold: block.bold,
                    ...color,
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

      tableRows.push(new TableRow({ cantSplit: true, children }));
    }

    const body =
      tableRows.length > 0
        ? [
            new Table({
              layout: TableLayoutType.AUTOFIT,
              width: { size: 100, type: WidthType.PERCENTAGE },
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
