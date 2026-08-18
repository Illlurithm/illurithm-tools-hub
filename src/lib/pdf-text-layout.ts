import type { PdfPageItem, PdfTextSpan } from "./pdf-to-png-store";

export type PdfTextRun = {
  text: string;
  font: string;
  bold: boolean;
  italic: boolean;
  /** Glyph height in page-image px (2x, so 1px = 0.5pt). */
  height: number;
};

export type PdfTextLine = {
  text: string;
  runs: PdfTextRun[];
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Page images are rendered at scale 2, so 1 PDF point = 2 px. */
export const PX_PER_PT = 2;

/** Font size in points for a glyph height measured on the 2x page image. */
export const ptFromPx = (px: number) => Math.max(4, Math.round((px / PX_PER_PT) * 10) / 10);

/**
 * Groups raw text spans into visual lines, ordered top-to-bottom, left-to-right.
 * Lines are additionally split at wide horizontal gaps so that table cells and
 * label/value columns become independent boxes instead of one stretched line
 * (which is what used to make neighbouring columns overlap).
 */
export function groupTextLines(spans: PdfTextSpan[]): PdfTextLine[] {
  const usable = spans.filter((s) => !s.unmapped && s.str.trim().length > 0);
  const sorted = [...usable].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PdfTextSpan[][] = [];

  for (const span of sorted) {
    const row = rows[rows.length - 1];
    // Compare glyph centres so a taller run on the same baseline still lands in
    // the same row, while the next text line starts a new row.
    const ref = row?.[row.length - 1];
    const sameRow =
      ref &&
      Math.abs(span.y + span.height / 2 - (ref.y + ref.height / 2)) <=
        Math.min(ref.height, span.height) * 0.45;
    if (sameRow) row!.push(span);
    else rows.push([span]);
  }

  const lines: PdfTextLine[] = [];

  for (const row of rows) {
    const ordered = [...row].sort((a, b) => a.x - b.x);
    // Split the row into segments at wide gaps (column / cell boundaries).
    let segment: PdfTextSpan[] = [];
    const segments: PdfTextSpan[][] = [];
    let prevEnd: number | null = null;
    for (const span of ordered) {
      const gap = prevEnd == null ? 0 : span.x - prevEnd;
      if (segment.length > 0 && gap > span.height * 1.4) {
        segments.push(segment);
        segment = [];
      }
      segment.push(span);
      prevEnd = span.x + span.width;
    }
    if (segment.length > 0) segments.push(segment);

    for (const group of segments) {
      const runs: PdfTextRun[] = [];
      let end: number | null = null;
      for (const span of group) {
        const gap = end == null ? 0 : span.x - end;
        const spaced = runs.length > 0 && gap > span.height * 0.2;
        const font = span.font || "Arial";
        const bold = Boolean(span.bold);
        const italic = Boolean(span.italic);
        const prev = runs[runs.length - 1];
        const text = `${spaced ? " " : ""}${span.str}`;
        if (prev && prev.font === font && prev.bold === bold && prev.italic === italic) {
          prev.text += text;
          prev.height = Math.max(prev.height, span.height);
        } else {
          runs.push({ text, font, bold, italic, height: span.height });
        }
        end = span.x + span.width;
      }

      const cleaned = runs
        .map((r) => ({ ...r, text: r.text.replace(/\s+/g, " ") }))
        .filter((r) => r.text.trim().length > 0);
      if (cleaned.length === 0) continue;
      cleaned[0]!.text = cleaned[0]!.text.replace(/^\s+/, "");
      const last = cleaned[cleaned.length - 1]!;
      last.text = last.text.replace(/\s+$/, "");

      const x = group[0]!.x;
      const right = Math.max(...group.map((s) => s.x + s.width));
      lines.push({
        text: cleaned.map((r) => r.text).join(""),
        runs: cleaned,
        x,
        y: Math.min(...group.map((s) => s.y)),
        width: Math.max(right - x, 8),
        height: Math.max(...group.map((s) => s.height)),
      });
    }
  }

  return lines;
}

/** True when a page carries a selectable text layer (i.e. OCR mode can produce real text). */
export function hasSelectableText(item: PdfPageItem): boolean {
  return (item.text ?? []).some((s) => !s.unmapped && s.str.trim().length > 0);
}
