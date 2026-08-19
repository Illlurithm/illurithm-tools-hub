/**
 * Developer debug artifacts for the extraction layer.
 *
 * Not part of the user-facing product: enabled in dev builds, or by setting
 * `localStorage.setItem("docintel:debug", "1")`. When on, the last conversion's
 * IR + log is published on `window.__docintel`, and `renderPageOverlay()` can
 * draw the extraction boxes (native text, OCR text, images, vectors,
 * annotations) on top of the rendered page for visual inspection.
 */

import type { EngineLogger, LogEntry } from "./logging";
import type { DocumentIR, IrPage } from "./ir";

const FLAG = "docintel:debug";

export function debugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return globalThis.localStorage?.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export type DebugArtifacts = {
  at: string;
  ir: DocumentIR;
  log: LogEntry[];
  /** Per-page summary of what the forensic layer observed. */
  pages: {
    page: number;
    route: string;
    nativeQuality: number;
    words: number;
    lines: number;
    blocks: number;
    images: number;
    vectors: number;
    annotations: number;
    links: number;
    formFields: number;
    duplicates: number;
    hidden: number;
    profile: string;
    rotation: number;
    issues: number;
  }[];
  renderPageOverlay: (pageIndex: number) => Promise<string | null>;
};

const OVERLAY_COLORS: Record<string, string> = {
  native_pdf: "#1e88e5",
  ocr: "#e53935",
  image: "#43a047",
  vector: "#8e24aa",
  annotation: "#fb8c00",
  candidate: "#00acc1",
};

/**
 * Draws the extraction overlay for one page and returns it as a data URL.
 * Requires a browser canvas; returns null when the page has no raster.
 */
export async function renderPageOverlay(page: IrPage): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const width = page.width || 1000;
  const height = page.height || 1414;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (page.pageImage) {
    await new Promise<void>((resolve) => {
      const image = new Image();
      image.onload = () => {
        ctx.globalAlpha = 0.65;
        ctx.drawImage(image, 0, 0, width, height);
        ctx.globalAlpha = 1;
        resolve();
      };
      image.onerror = () => resolve();
      image.src = page.pageImage;
    });
  }

  const stroke = (
    box: { x: number; y: number; width: number; height: number },
    color: string,
    label?: string,
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(box.x * width, box.y * height, box.width * width, box.height * height);
    if (label) {
      ctx.fillStyle = color;
      ctx.font = "10px monospace";
      ctx.fillText(label, box.x * width + 1, Math.max(9, box.y * height - 2));
    }
  };

  for (const candidate of page.candidates ?? []) stroke(candidate.box, OVERLAY_COLORS["candidate"]!);
  for (const word of page.words ?? [])
    stroke(
      word.box,
      OVERLAY_COLORS[word.source] ?? "#607d8b",
      word.duplicateOf ? "dup" : word.visibility === "hidden" ? "hidden" : undefined,
    );
  for (const vector of page.vectors ?? []) stroke(vector.box, OVERLAY_COLORS["vector"]!);
  for (const image of page.images ?? [])
    stroke(image.box, OVERLAY_COLORS["image"]!, image.dataUrl ? "embedded" : "ref-only");
  for (const annotation of page.annotations ?? [])
    stroke(annotation.box, OVERLAY_COLORS["annotation"]!, annotation.subtype);

  return canvas.toDataURL("image/png");
}

/** Publishes the last run's artifacts for inspection in the browser console. */
export function captureDebugArtifacts(ir: DocumentIR, logger: EngineLogger) {
  if (!debugEnabled()) return;
  const artifacts: DebugArtifacts = {
    at: new Date().toISOString(),
    ir,
    log: logger.all(),
    pages: ir.pages.map((page) => ({
      page: page.index + 1,
      route: page.analysis?.route.route ?? "unknown",
      nativeQuality: page.analysis?.quality.score ?? 0,
      words: page.words?.length ?? 0,
      lines: page.lines?.length ?? 0,
      blocks: page.candidates?.length ?? 0,
      images: page.images?.length ?? 0,
      vectors: page.vectors?.length ?? 0,
      annotations: page.annotations?.length ?? 0,
      links: page.links?.length ?? 0,
      formFields: page.formFields?.length ?? 0,
      duplicates: (page.words ?? []).filter((word) => word.duplicateOf).length,
      hidden: (page.words ?? []).filter((word) => word.visibility === "hidden").length,
      profile: page.analysis?.density.profile ?? "unknown",
      rotation: page.geometry?.rotation ?? 0,
      issues: page.analysis?.issues.length ?? 0,
    })),
    renderPageOverlay: async (pageIndex: number) => {
      const page = ir.pages[pageIndex];
      return page ? renderPageOverlay(page) : null;
    },
  };

  (globalThis as { __docintel?: DebugArtifacts }).__docintel = artifacts;
  logger.debug("debug", "artifacts published on window.__docintel", {
    pages: artifacts.pages.length,
  });
}
