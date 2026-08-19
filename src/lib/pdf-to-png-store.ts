import { useSyncExternalStore } from "react";
import type { PdfDocumentForensics, PdfPageForensics } from "./pdf-forensics";

/** One text run extracted from a PDF page, in page-image pixel coordinates. */
export type PdfTextSpan = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Resolved font family of the run, e.g. "Times New Roman". */
  font?: string;
  bold?: boolean;
  italic?: boolean;
  /**
   * True when the PDF font has no usable Unicode mapping for this run (common for
   * Devanagari and other complex-script subset fonts). Such runs are kept as part
   * of the page picture instead of being re-typed as garbled boxes.
   */
  unmapped?: boolean;
  /** Raw PDF font name (may carry a `ABCDEF+` subset prefix). */
  fontName?: string;
  /** Writing direction reported by the parser. */
  direction?: "ltr" | "rtl" | "ttb" | "btt";
  /** Text matrix in image space, used to recover rotated text. */
  transform?: number[];
  /** Rotation of the run in degrees (0 for normal horizontal text). */
  rotation?: number;
  /** Text colour sampled from the rendered page raster. */
  color?: string;
  /** Whether the run is painted visibly (render mode 3/7 is invisible). */
  visibility?: "visible" | "hidden" | "unknown";
};

export type PdfPageItem = {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  rotation: number;
  selected: boolean;
  /** Selectable text of the source page (empty for scanned PDFs). */
  text?: PdfTextSpan[];
  /** The original uploaded PDF this page came from (used by the remote converter). */
  source?: Blob;
  /** Original PDF file name, e.g. "form.pdf". */
  sourceName?: string;
  /** Forensic record of the source page (geometry, images, vectors, links…). */
  forensics?: PdfPageForensics;
  /** Forensic record of the source document this page came from. */
  documentForensics?: PdfDocumentForensics;
};

export type PdfPageState = {
  items: PdfPageItem[];
  converted: { url: string; size: number; filename: string } | null;
};

const EMPTY: PdfPageState = Object.freeze({
  items: Object.freeze([]) as unknown as PdfPageItem[],
  converted: null,
}) as PdfPageState;

export const emptyPdfState = (): PdfPageState => EMPTY;

const store = new Map<string, PdfPageState>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getPdfState(pageId: string): PdfPageState {
  return store.get(pageId) ?? EMPTY;
}

export function setPdfState(pageId: string, patch: Partial<PdfPageState>) {
  store.set(pageId, { ...getPdfState(pageId), ...patch });
  emit();
}

export function updatePdfItems(pageId: string, fn: (items: PdfPageItem[]) => PdfPageItem[]) {
  const current = getPdfState(pageId);
  store.set(pageId, { ...current, items: fn(current.items), converted: null });
  emit();
}

export function clearPdfState(pageId: string) {
  const s = store.get(pageId);
  if (s?.converted) URL.revokeObjectURL(s.converted.url);
  store.delete(pageId);
  emit();
}

export function hasPdfWork(pageIds?: string[]) {
  const ids = pageIds ?? Array.from(store.keys());
  return ids.some((id) => (store.get(id)?.items.length ?? 0) > 0);
}

export function usePdfState(pageId: string): PdfPageState {
  return useSyncExternalStore(
    subscribe,
    () => {
      void version;
      return getPdfState(pageId);
    },
    emptyPdfState,
  );
}

export function usePdfVersion() {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

let seq = 0;
export const newPdfItemId = () => `pdfpage${++seq}-${Date.now()}`;
