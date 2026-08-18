import { newPdfItemId, type PdfPageItem, type PdfTextSpan } from "./pdf-to-png-store";

/** Rotates a data-url image on a canvas; returns the rotated PNG data url + size. */
export async function rotateDataUrl(
  dataUrl: string,
  rotation: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const rot = ((rotation % 360) + 360) % 360;
  const img = await loadImage(dataUrl);
  if (rot === 0) return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
  const swap = rot === 90 || rot === 270;
  const w = swap ? img.naturalHeight : img.naturalWidth;
  const h = swap ? img.naturalWidth : img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return { dataUrl: canvas.toDataURL("image/png"), width: w, height: h };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

async function pdfjs() {
  // pdf.js 6 uses the new Map upsert proposal. Chromium versions without it
  // otherwise fail before the first page can render.
  const mapPrototype = Map.prototype as Map<unknown, unknown> & {
    getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown;
    getOrInsert?: (key: unknown, value: unknown) => unknown;
  };
  if (!mapPrototype.getOrInsertComputed) {
    mapPrototype.getOrInsertComputed = function (key, callback) {
      if (this.has(key)) return this.get(key);
      const value = callback(key);
      this.set(key, value);
      return value;
    };
  }
  if (!mapPrototype.getOrInsert) {
    mapPrototype.getOrInsert = function (key, value) {
      if (this.has(key)) return this.get(key);
      this.set(key, value);
      return value;
    };
  }
  const lib = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib;
}

/** Renders every page of every uploaded PDF into a selectable PNG page item. */
export async function readPdfFiles(files: FileList | File[]): Promise<PdfPageItem[]> {
  const list = Array.from(files).filter(
    (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
  if (list.length === 0) return [];

  const lib = await pdfjs();
  const out: PdfPageItem[] = [];

  for (const file of list) {
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await lib.getDocument({ data }).promise;
    const base = file.name.replace(/\.pdf$/i, "");
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      await page.render({ canvasContext: ctx, viewport }).promise;

      const text: PdfTextSpan[] = [];
      try {
        const content = await page.getTextContent();
        const styles = (content.styles ?? {}) as Record<string, { fontFamily?: string }>;
        for (const raw of content.items as Array<Record<string, unknown>>) {
          const str = typeof raw["str"] === "string" ? (raw["str"] as string) : "";
          if (!str.trim()) continue;
          const t = lib.Util.transform(viewport.transform, raw["transform"] as number[]);
          const height = Math.hypot(t[2] ?? 0, t[3] ?? 0) || 12;
          const styleKey = typeof raw["fontName"] === "string" ? (raw["fontName"] as string) : "";
          const rawFamily = styles[styleKey]?.fontFamily ?? "";
          const nameHint = `${rawFamily} ${styleKey}`;
          text.push({
            str,
            x: t[4] ?? 0,
            y: (t[5] ?? 0) - height,
            width: Number(raw["width"] ?? 0) * 2,
            height,
            font: normalizeFontFamily(rawFamily),
            bold: /bold|black|heavy|semib/i.test(nameHint),
            italic: /italic|oblique/i.test(nameHint),
            unmapped: isUnmappedText(str),
          });
        }
      } catch {
        /* scanned page with no text layer */
      }

      out.push({
        id: newPdfItemId(),
        name: doc.numPages > 1 ? `${base}-page-${n}` : base,
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
        rotation: 0,
        selected: true,
        text,
      });
    }

  }

  return out;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Re-encodes a PNG data url as JPEG (on a white background). */
async function toJpegDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/** One selected page -> single image. Multiple selected pages -> ZIP of images. */
export async function convertPdfPagesToPng(
  items: PdfPageItem[],
  baseName: string,
  kind: "png" | "jpg" = "png",
): Promise<{ blob: Blob; filename: string }> {
  const selected = items.filter((i) => i.selected);
  if (selected.length === 0) throw new Error("Select at least one page first.");

  const ext = kind === "jpg" ? "jpg" : "png";
  const mime = kind === "jpg" ? "image/jpeg" : "image/png";

  const rendered = await Promise.all(
    selected.map(async (item) => {
      const rotated = (await rotateDataUrl(item.dataUrl, item.rotation)).dataUrl;
      const final = kind === "jpg" ? await toJpegDataUrl(rotated) : rotated;
      return { name: `${item.name || "page"}.${ext}`, bytes: dataUrlToBytes(final) };
    }),
  );

  const first = rendered[0]!;
  if (rendered.length === 1) {
    return { blob: new Blob([first.bytes as BlobPart], { type: mime }), filename: first.name };
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  rendered.forEach((f, i) => {
    zip.file(`${String(i + 1).padStart(2, "0")}-${f.name}`, f.bytes);
  });
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, filename: `${baseName || "pages"}.zip` };
}


/**
 * True when an extracted run cannot be trusted as real Unicode text. Subset fonts
 * for Devanagari and other complex scripts frequently ship without a ToUnicode
 * map, so pdf.js returns raw glyph ids that render as boxes (□) or replacement
 * characters. Those runs stay part of the page picture instead of being re-typed.
 */
export function isUnmappedText(str: string): boolean {
  if (/[\uFFFD\u25A1\u25AF\u0000-\u0008\uE000-\uF8FF]/.test(str)) return true;
  // Devanagari that starts with a combining mark is glyph soup, not text.
  if (/^[\u093E-\u094D\u0900-\u0903]/.test(str.trim())) return true;
  return false;
}

/** Maps a pdf.js font family string to a real Office-safe font name. */
export function normalizeFontFamily(raw: string): string {
  const first = (raw.split(",")[0] ?? "").replace(/["']/g, "").trim();
  // Drop subset prefixes such as "ABCDEF+TrebuchetMS".
  const unsubset = first.replace(/^[A-Z]{6}\+/, "");
  const cleaned = unsubset
    .replace(
      /[-,_]?(BoldItalic|SemiBold|Bold|Italic|Oblique|Regular|Black|Heavy|Light|Medium|MT|PS|Std)+$/gi,
      "",
    )
    .trim();
  const key = cleaned.toLowerCase();
  if (!cleaned || key === "sans-serif" || key === "sans") return "Arial";
  if (key === "serif") return "Times New Roman";
  if (key === "monospace" || key === "mono") return "Consolas";
  if (key.includes("times") || key.includes("georgia") || key.includes("garamond"))
    return "Times New Roman";
  if (key.includes("helvetica") || key.includes("arial")) return "Arial";
  if (key.includes("courier")) return "Courier New";
  if (key.includes("calibri")) return "Calibri";
  if (key.includes("trebuchet")) return "Trebuchet MS";
  if (key.includes("verdana")) return "Verdana";
  if (key.includes("tahoma")) return "Tahoma";
  if (key.includes("cambria")) return "Cambria";
  if (key.includes("mangal") || key.includes("nirmala") || key.includes("devanagari"))
    return "Nirmala UI";
  return cleaned.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * Returns the page image with every re-typed text run painted out in the local
 * background colour, so tables, rules, logos and shading survive while real
 * editable text is layered on top by the Word/PowerPoint exporters. Runs without
 * a usable Unicode mapping are left untouched so nothing visually disappears.
 */
export async function renderPageWithoutText(item: PdfPageItem): Promise<string> {
  const spans = (item.text ?? []).filter((s) => !s.unmapped);
  const img = await loadImage(item.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0);
  if (spans.length === 0) return canvas.toDataURL("image/png");

  // One snapshot of the untouched page: every colour probe reads original pixels,
  // so already-erased neighbours can never smear a wrong colour across the page.
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);

  for (const span of spans) {
    const pad = Math.max(1, span.height * 0.1);
    const x = Math.max(0, Math.floor(span.x - pad));
    const y = Math.max(0, Math.floor(span.y - pad));
    const w = Math.min(canvas.width - x, Math.ceil(span.width + pad * 2));
    const h = Math.min(canvas.height - y, Math.ceil(span.height + pad * 2));
    if (w <= 0 || h <= 0) continue;
    ctx.fillStyle = sampleBackground(source, canvas.width, canvas.height, x, y, w, h);
    ctx.fillRect(x, y, w, h);
  }
  return canvas.toDataURL("image/png");
}

/**
 * Picks the most common colour on the ring just outside a text box, i.e. its cell
 * shading. Sampling many points (instead of four) keeps coloured watermarks and
 * shaded table cells from bleeding into neighbouring rows.
 */
function sampleBackground(
  source: ImageData,
  imgW: number,
  imgH: number,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const counts = new Map<string, number>();
  const at = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= imgW || py >= imgH) return;
    const i = (py * imgW + px) * 4;
    const key = `rgb(${source.data[i]},${source.data[i + 1]},${source.data[i + 2]})`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  const steps = Math.max(4, Math.min(24, Math.round(w / 6)));
  for (let s = 0; s <= steps; s += 1) {
    const px = x + Math.round((w * s) / steps);
    at(px, y - 2);
    at(px, y + h + 1);
  }
  const vSteps = Math.max(2, Math.min(12, Math.round(h / 3)));
  for (let s = 0; s <= vSteps; s += 1) {
    const py = y + Math.round((h * s) / vSteps);
    at(x - 2, py);
    at(x + w + 1, py);
  }

  let best = "rgb(255,255,255)";
  let top = 0;
  counts.forEach((n, key) => {
    if (n > top) {
      top = n;
      best = key;
    }
  });
  return best;
}
