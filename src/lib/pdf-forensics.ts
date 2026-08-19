/**
 * PDF forensic inspection (browser, pdf.js).
 *
 * Reads everything the PDF itself exposes, before any interpretation:
 * document metadata, page geometry/boxes/rotation, embedded raster images,
 * vector primitives, annotations, hyperlinks, form fields, font usage and
 * text-rendering flags (invisible OCR layers).
 *
 * Coordinates leave this module in **normalized IR space** (see ./pdf/coords):
 * origin top-left of the logical page, 0..1 fractions, `/Rotate` already
 * applied through the pdf.js viewport transform.
 *
 * Everything is best-effort and isolated: a failing sub-scan degrades the record
 * (fields go missing, `issues` gains an entry) instead of failing the page.
 */

import {
  imageBoxToNormalized,
  pageGeometry,
  type Box,
  type PageGeometry,
  type PdfRect,
} from "./pdf/coords";
import {
  nextElementId,
  type ExtractedAnnotation,
  type ExtractedFormField,
  type ExtractedImage,
  type ExtractedLink,
  type ExtractedVector,
} from "./pdf/elements";

export type PdfDocumentForensics = {
  fileName: string;
  fileSize: number;
  pageCount: number;
  pdfVersion?: string;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
  encrypted: boolean;
  /** pdf.js permission flags, when the document declares any. */
  permissions?: number[];
  hasAcroForm: boolean;
  hasXfa: boolean;
  linearized?: boolean;
  signed?: boolean;
};

export type PdfTextFlags = {
  showTextOps: number;
  invisibleShowTextOps: number;
  /** True when (nearly) every text op is drawn in invisible render mode 3. */
  hiddenTextLayer: boolean;
};

export type PdfPageForensics = {
  pageNumber: number;
  geometry: PageGeometry;
  images: ExtractedImage[];
  vectors: ExtractedVector[];
  annotations: ExtractedAnnotation[];
  links: ExtractedLink[];
  formFields: ExtractedFormField[];
  textFlags: PdfTextFlags;
  /** Raw font name → number of text ops seen with it. */
  fontUsage: Record<string, number>;
  hasTransparency: boolean;
  issues: { scan: string; error: string }[];
};

type PdfLib = typeof import("pdfjs-dist");
type PdfPage = Awaited<ReturnType<Awaited<ReturnType<PdfLib["getDocument"]>["promise"]>["getPage"]>>;
type Viewport = { transform: number[]; width: number; height: number };

const hex = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");

const colorFrom = (args: unknown[]): string | undefined => {
  if (typeof args[0] === "string") return args[0];
  const [r, g, b] = args as number[];
  if ([r, g, b].every((v) => typeof v === "number"))
    return `#${hex(r as number)}${hex(g as number)}${hex(b as number)}`;
  return undefined;
};

const asRect = (value: unknown): PdfRect | undefined => {
  if (!Array.isArray(value) || value.length < 4) return undefined;
  const nums = value.slice(0, 4).map(Number);
  return nums.every((n) => Number.isFinite(n)) ? (nums as PdfRect) : undefined;
};

const pdfDate = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const match = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(value);
  if (!match) return value;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00"] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  return Number.isNaN(Date.parse(iso)) ? value : iso;
};

/** Document-level forensic record. Never throws. */
export async function inspectDocument(
  doc: {
    numPages: number;
    getMetadata: () => Promise<{ info?: Record<string, unknown> }>;
    getPermissions?: () => Promise<number[] | null>;
  },
  file: { name: string; size: number },
): Promise<PdfDocumentForensics> {
  const record: PdfDocumentForensics = {
    fileName: file.name,
    fileSize: file.size,
    pageCount: doc.numPages,
    encrypted: false,
    hasAcroForm: false,
    hasXfa: false,
  };

  try {
    const { info = {} } = await doc.getMetadata();
    const str = (key: string) =>
      typeof info[key] === "string" && (info[key] as string).trim().length > 0
        ? (info[key] as string)
        : undefined;
    Object.assign(record, {
      ...(str("PDFFormatVersion") ? { pdfVersion: str("PDFFormatVersion") } : {}),
      ...(str("Title") ? { title: str("Title") } : {}),
      ...(str("Author") ? { author: str("Author") } : {}),
      ...(str("Subject") ? { subject: str("Subject") } : {}),
      ...(str("Keywords") ? { keywords: str("Keywords") } : {}),
      ...(str("Creator") ? { creator: str("Creator") } : {}),
      ...(str("Producer") ? { producer: str("Producer") } : {}),
      ...(pdfDate(info["CreationDate"]) ? { creationDate: pdfDate(info["CreationDate"]) } : {}),
      ...(pdfDate(info["ModDate"]) ? { modificationDate: pdfDate(info["ModDate"]) } : {}),
      encrypted: Boolean(info["EncryptFilterName"]),
      hasAcroForm: Boolean(info["IsAcroFormPresent"]),
      hasXfa: Boolean(info["IsXFAPresent"]),
      ...(typeof info["IsLinearized"] === "boolean"
        ? { linearized: info["IsLinearized"] as boolean }
        : {}),
      ...(typeof info["IsSignaturesPresent"] === "boolean"
        ? { signed: info["IsSignaturesPresent"] as boolean }
        : {}),
    });
  } catch {
    /* metadata unavailable — fields stay absent */
  }

  try {
    const permissions = await doc.getPermissions?.();
    if (permissions && permissions.length > 0) record.permissions = permissions;
  } catch {
    /* permissions unavailable */
  }

  return record;
}

/** Reads the page boxes pdf.js exposes (crop box is `page.view`). */
export function readPageGeometry(
  page: PdfPage,
  viewport: Viewport,
  options: { renderScale: number; userRotation?: number },
): PageGeometry {
  const raw = page as unknown as {
    view?: number[];
    rotate?: number;
    _pageInfo?: { view?: number[]; rotate?: number };
  };
  const crop = asRect(raw.view ?? raw._pageInfo?.view) ?? [0, 0, 612, 792];
  return pageGeometry({
    cropBox: crop,
    rotation: raw.rotate ?? raw._pageInfo?.rotate ?? 0,
    ...(options.userRotation ? { userRotation: options.userRotation } : {}),
    renderScale: options.renderScale,
    imageWidth: Math.floor(viewport.width),
    imageHeight: Math.floor(viewport.height),
  });
}

type CanvasFactory = {
  /** Optional page raster context, used to recover text colours. */
  imageData?: ImageData;
};

/**
 * Scans the page operator list for images, vector primitives, colours and text
 * rendering flags. Coordinates come out normalized.
 */
async function scanOperators(
  lib: PdfLib,
  page: PdfPage,
  viewport: Viewport,
  size: { width: number; height: number },
): Promise<{
  images: ExtractedImage[];
  vectors: ExtractedVector[];
  textFlags: PdfTextFlags;
  fontUsage: Record<string, number>;
  hasTransparency: boolean;
}> {
  const { OPS, Util } = lib;
  const list = await page.getOperatorList();
  const images: ExtractedImage[] = [];
  const vectors: ExtractedVector[] = [];
  const fontUsage: Record<string, number> = {};
  let showTextOps = 0;
  let invisibleShowTextOps = 0;
  let hasTransparency = false;
  let zOrder = 0;

  let ctm = viewport.transform.slice();
  const stack: number[][] = [];
  let fillColor: string | undefined;
  let strokeColor: string | undefined;
  let renderMode = 0;
  let fontName = "";

  const toBox = (points: { x: number; y: number }[]): Box => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return imageBoxToNormalized(
      { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
      size,
    );
  };

  const unitSquareBox = () => {
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([u, v]) => {
      const [x, y] = Util.applyTransform([u as number, v as number], ctm);
      return { x: x ?? 0, y: y ?? 0 };
    });
    return toBox(corners);
  };

  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    const args = (list.argsArray[i] ?? []) as unknown[];

    switch (fn) {
      case OPS.save:
        stack.push(ctm.slice());
        break;
      case OPS.restore:
        ctm = stack.pop() ?? viewport.transform.slice();
        break;
      case OPS.transform:
        ctm = Util.transform(ctm, (args as number[]).slice(0, 6));
        break;
      case OPS.setFillRGBColor:
        fillColor = colorFrom(args) ?? fillColor;
        break;
      case OPS.setStrokeRGBColor:
        strokeColor = colorFrom(args) ?? strokeColor;
        break;
      case OPS.setGState: {
        const entries = (args[0] ?? []) as [string, unknown][];
        for (const [key, value] of Array.isArray(entries) ? entries : []) {
          if (key === "ca" && typeof value === "number" && value < 1) hasTransparency = true;
          if (key === "CA" && typeof value === "number" && value < 1) hasTransparency = true;
        }
        break;
      }
      case OPS.setFont:
        fontName = typeof args[0] === "string" ? (args[0] as string) : fontName;
        break;
      case OPS.setTextRenderingMode:
        renderMode = typeof args[0] === "number" ? (args[0] as number) : renderMode;
        break;
      case OPS.showText:
      case OPS.showSpacedText:
        showTextOps += 1;
        if (renderMode === 3 || renderMode === 7) invisibleShowTextOps += 1;
        if (fontName) fontUsage[fontName] = (fontUsage[fontName] ?? 0) + 1;
        break;
      case OPS.paintImageXObject:
      case OPS.paintImageXObjectRepeat:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject: {
        const ref = typeof args[0] === "string" ? (args[0] as string) : undefined;
        const inline = (args[0] ?? {}) as { width?: number; height?: number; kind?: number };
        zOrder += 1;
        images.push({
          id: nextElementId("img"),
          page: 1,
          box: unitSquareBox(),
          ...(ref ? { ref } : {}),
          ...(typeof inline.width === "number" ? { pixelWidth: inline.width } : {}),
          ...(typeof inline.height === "number" ? { pixelHeight: inline.height } : {}),
          rotation: 0,
          zOrder,
          ...(fn === OPS.paintImageMaskXObject ? { isMask: true } : {}),
          source: "embedded_image",
        });
        break;
      }
      case OPS.constructPath: {
        const coords = args[1];
        const flat: number[] = Array.isArray(coords)
          ? (coords as number[]).filter((n) => typeof n === "number")
          : coords instanceof Float32Array
            ? Array.from(coords)
            : [];
        if (flat.length < 4) break;
        const points: { x: number; y: number }[] = [];
        for (let p = 0; p + 1 < flat.length; p += 2) {
          const [x, y] = Util.applyTransform([flat[p]!, flat[p + 1]!], ctm);
          points.push({ x: x ?? 0, y: y ?? 0 });
        }
        if (points.length === 0) break;
        const box = toBox(points);
        const thin = Math.min(box.width, box.height) < 0.004;
        zOrder += 1;
        vectors.push({
          id: nextElementId("vec"),
          page: 1,
          box,
          shape: thin ? "line" : points.length <= 5 ? "rect" : "path",
          ...(thin
            ? { orientation: box.width >= box.height ? ("horizontal" as const) : ("vertical" as const) }
            : {}),
          ...(fillColor ? { fillColor } : {}),
          ...(strokeColor ? { strokeColor } : {}),
          zOrder,
          source: "vector",
        });
        break;
      }
      default:
        break;
    }
  }

  return {
    images,
    vectors,
    textFlags: {
      showTextOps,
      invisibleShowTextOps,
      hiddenTextLayer: showTextOps > 0 && invisibleShowTextOps / showTextOps > 0.9,
    },
    fontUsage,
    hasTransparency,
  };
}

/** Pulls the decoded bytes of an embedded image out of pdf.js, when available. */
async function extractImageBytes(
  page: PdfPage,
  image: ExtractedImage,
): Promise<{ dataUrl?: string; pixelWidth?: number; pixelHeight?: number; format?: string }> {
  if (!image.ref) return {};
  const holder = page as unknown as {
    objs?: { has: (id: string) => boolean; get: (id: string) => unknown };
    commonObjs?: { has: (id: string) => boolean; get: (id: string) => unknown };
  };
  const store = holder.objs?.has(image.ref)
    ? holder.objs
    : holder.commonObjs?.has(image.ref)
      ? holder.commonObjs
      : undefined;
  if (!store) return {};

  const obj = store.get(image.ref) as
    | {
        width?: number;
        height?: number;
        kind?: number;
        data?: Uint8Array | Uint8ClampedArray;
        bitmap?: ImageBitmap;
      }
    | undefined;
  if (!obj) return {};

  const width = obj.width ?? obj.bitmap?.width;
  const height = obj.height ?? obj.bitmap?.height;
  if (!width || !height) return {};

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { pixelWidth: width, pixelHeight: height };

  if (obj.bitmap) {
    ctx.drawImage(obj.bitmap, 0, 0);
  } else if (obj.data) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    const data = obj.data;
    // kind 2 = RGB_24BPP, 3 = RGBA_32BPP, 1 = GRAYSCALE_1BPP (skipped).
    if (obj.kind === 3 && data.length >= rgba.length) {
      rgba.set(data.subarray(0, rgba.length));
    } else if (obj.kind === 2 && data.length >= width * height * 3) {
      for (let p = 0, q = 0; p < width * height; p += 1, q += 3) {
        rgba[p * 4] = data[q] ?? 0;
        rgba[p * 4 + 1] = data[q + 1] ?? 0;
        rgba[p * 4 + 2] = data[q + 2] ?? 0;
        rgba[p * 4 + 3] = 255;
      }
    } else {
      return { pixelWidth: width, pixelHeight: height };
    }
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  } else {
    return { pixelWidth: width, pixelHeight: height };
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    pixelWidth: width,
    pixelHeight: height,
    format: "png",
  };
}

const annotationText = (raw: Record<string, unknown>) => {
  const contents = raw["contents"];
  if (typeof contents === "string" && contents.trim()) return contents;
  const obj = raw["contentsObj"] as { str?: string } | undefined;
  return typeof obj?.str === "string" && obj.str.trim() ? obj.str : undefined;
};

/** Annotations, hyperlinks and form fields of a page. */
async function scanAnnotations(
  page: PdfPage,
  geometry: PageGeometry,
  viewport: Viewport,
  lib: PdfLib,
  size: { width: number; height: number },
): Promise<{
  annotations: ExtractedAnnotation[];
  links: ExtractedLink[];
  formFields: ExtractedFormField[];
}> {
  const raws = (await page.getAnnotations({ intent: "display" })) as unknown as Record<
    string,
    unknown
  >[];
  const annotations: ExtractedAnnotation[] = [];
  const links: ExtractedLink[] = [];
  const formFields: ExtractedFormField[] = [];

  for (const raw of raws) {
    const rect = asRect(raw["rect"]);
    if (!rect) continue;
    // pdf.js gives annotation rects in PDF space; the viewport transform is the
    // single place rotation/flip is handled.
    const corners = [
      [rect[0], rect[1]],
      [rect[2], rect[1]],
      [rect[2], rect[3]],
      [rect[0], rect[3]],
    ].map(([x, y]) => {
      const [px, py] = lib.Util.applyTransform([x as number, y as number], viewport.transform);
      return { x: px ?? 0, y: py ?? 0 };
    });
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const box = imageBoxToNormalized(
      {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      size,
    );

    const subtype = typeof raw["subtype"] === "string" ? (raw["subtype"] as string) : "Unknown";
    const url =
      typeof raw["url"] === "string"
        ? (raw["url"] as string)
        : typeof raw["unsafeUrl"] === "string"
          ? (raw["unsafeUrl"] as string)
          : undefined;
    const contents = annotationText(raw);

    const annotation: ExtractedAnnotation = {
      id: nextElementId("ann"),
      page: geometry.userRotation >= 0 ? 1 : 1,
      subtype,
      box,
      rect,
      ...(contents ? { contents } : {}),
      ...(url ? { url } : {}),
      source: "annotation",
    };
    annotations.push(annotation);

    if (url) {
      links.push({
        id: nextElementId("link"),
        page: 1,
        box,
        url,
        visibleText: "",
        annotationId: annotation.id,
        source: "annotation",
      });
    }

    if (subtype === "Widget") {
      const options = Array.isArray(raw["options"])
        ? (raw["options"] as { displayValue?: string; exportValue?: string }[])
            .map((option) => option.displayValue ?? option.exportValue ?? "")
            .filter(Boolean)
        : undefined;
      formFields.push({
        id: nextElementId("field"),
        page: 1,
        box,
        fieldName: typeof raw["fieldName"] === "string" ? (raw["fieldName"] as string) : "",
        fieldType: typeof raw["fieldType"] === "string" ? (raw["fieldType"] as string) : "unknown",
        ...(typeof raw["fieldValue"] === "string" ? { fieldValue: raw["fieldValue"] } : {}),
        ...(options && options.length ? { options } : {}),
        ...(typeof raw["readOnly"] === "boolean" ? { readOnly: raw["readOnly"] } : {}),
        source: "form",
      });
    }
  }

  return { annotations, links, formFields };
}

/**
 * Full forensic pass for one page. Each sub-scan is independently guarded, so a
 * failure only removes that facet from the record.
 */
export async function inspectPage(
  lib: PdfLib,
  page: PdfPage,
  viewport: Viewport,
  options: { pageNumber: number; renderScale: number; extractImageBytes?: boolean } & CanvasFactory,
): Promise<PdfPageForensics> {
  const geometry = readPageGeometry(page, viewport, { renderScale: options.renderScale });
  const size = { width: geometry.imageWidth, height: geometry.imageHeight };
  const issues: { scan: string; error: string }[] = [];

  let images: ExtractedImage[] = [];
  let vectors: ExtractedVector[] = [];
  let textFlags: PdfTextFlags = { showTextOps: 0, invisibleShowTextOps: 0, hiddenTextLayer: false };
  let fontUsage: Record<string, number> = {};
  let hasTransparency = false;

  try {
    const scan = await scanOperators(lib, page, viewport, size);
    images = scan.images;
    vectors = scan.vectors;
    textFlags = scan.textFlags;
    fontUsage = scan.fontUsage;
    hasTransparency = scan.hasTransparency;
  } catch (error) {
    issues.push({
      scan: "operators",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (options.extractImageBytes !== false) {
    for (const image of images) {
      try {
        const bytes = await extractImageBytes(page, image);
        Object.assign(image, bytes);
      } catch (error) {
        issues.push({
          scan: "image-bytes",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  let annotations: ExtractedAnnotation[] = [];
  let links: ExtractedLink[] = [];
  let formFields: ExtractedFormField[] = [];
  try {
    const scan = await scanAnnotations(page, geometry, viewport, lib, size);
    annotations = scan.annotations;
    links = scan.links;
    formFields = scan.formFields;
  } catch (error) {
    issues.push({
      scan: "annotations",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const stamp = <T extends { page: number }>(items: T[]) =>
    items.map((item) => ({ ...item, page: options.pageNumber }));

  return {
    pageNumber: options.pageNumber,
    geometry,
    images: stamp(images),
    vectors: stamp(vectors),
    annotations: stamp(annotations),
    links: stamp(links),
    formFields: stamp(formFields),
    textFlags,
    fontUsage,
    hasTransparency,
    issues,
  };
}

/** Cheap darkest-pixel probe used to recover a text run's colour from the raster. */
export function sampleTextColor(
  source: ImageData,
  box: { x: number; y: number; width: number; height: number },
): string | undefined {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(source.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(source.height, Math.ceil(box.y + box.height));
  if (x1 <= x0 || y1 <= y0) return undefined;

  let best = 765;
  let color: string | undefined;
  const stepX = Math.max(1, Math.floor((x1 - x0) / 24));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 12));
  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      const i = (y * source.width + x) * 4;
      const r = source.data[i] ?? 255;
      const g = source.data[i + 1] ?? 255;
      const b = source.data[i + 2] ?? 255;
      const sum = r + g + b;
      if (sum < best) {
        best = sum;
        color = `#${hex(r)}${hex(g)}${hex(b)}`;
      }
    }
  }
  return color;
}
