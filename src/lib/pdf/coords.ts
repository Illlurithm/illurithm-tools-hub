/**
 * Coordinate systems used by the Document Intelligence Engine.
 *
 * Three spaces exist and every conversion between them lives in this file.
 *
 * 1. PDF space (source of truth inside the file)
 *    - origin: bottom-left of the page box
 *    - x grows right, y grows UP
 *    - units: PDF points (1 pt = 1/72 inch)
 *    - page box: the crop box (falls back to the media box)
 *    - `/Rotate` is metadata: content is NOT stored rotated.
 *
 * 2. Image space (the rendered raster the OCR/vision/debug layers see)
 *    - origin: top-left of the rendered page
 *    - x grows right, y grows DOWN
 *    - units: pixels at `renderScale` px per pt (the app renders at scale 2)
 *    - `/Rotate` IS applied: the raster shows the logical (upright) page.
 *
 * 3. Normalized IR space (what the Document IR stores)
 *    - origin: top-left of the logical page
 *    - x grows right, y grows DOWN
 *    - units: fraction of logical page width / height (0..1)
 *    - resolution independent, so the same IR renders at any page size.
 *
 * Rotation handling
 * -----------------
 * `/Rotate` (0/90/180/270) is folded into the PDF→image transform, so image and
 * normalized space always describe the logical, upright page. A second,
 * user-applied rotation (the rotate buttons in the workspace) is applied on top
 * with {@link rotateNormalizedBox} / {@link rotatePageSize} so the IR still
 * represents the logical orientation of what the user will get in Word.
 *
 * Nothing here guesses: if the PDF does not expose a box, the field is absent.
 */

export type Rotation = 0 | 90 | 180 | 270;

/** [x0, y0, x1, y1] in PDF points, origin bottom-left. */
export type PdfRect = [number, number, number, number];

/** Axis-aligned box in image pixels or normalized units, origin top-left. */
export type Box = { x: number; y: number; width: number; height: number };

export type PageGeometry = {
  /** Visible page box in PDF points; pdf.js `page.view`. */
  cropBox: PdfRect;
  /** Full media box when the parser exposes it. */
  mediaBox?: PdfRect;
  bleedBox?: PdfRect;
  trimBox?: PdfRect;
  artBox?: PdfRect;
  /** The page's own `/Rotate` value. */
  rotation: Rotation;
  /** Extra rotation applied by the user in the workspace (0/90/180/270). */
  userRotation: Rotation;
  /** Logical page size in points, after `/Rotate`. */
  widthPt: number;
  heightPt: number;
  /** Rendered raster size in px, after `/Rotate`. */
  imageWidth: number;
  imageHeight: number;
  /** Pixels per PDF point used for the raster. */
  renderScale: number;
  orientation: "portrait" | "landscape" | "square";
  /** widthPt / heightPt of the logical page. */
  aspectRatio: number;
};

export const normalizeRotation = (value: number | undefined): Rotation => {
  const rot = (((Math.round((value ?? 0) / 90) * 90) % 360) + 360) % 360;
  return (rot === 90 || rot === 180 || rot === 270 ? rot : 0) as Rotation;
};

export const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function orientationOf(width: number, height: number): PageGeometry["orientation"] {
  if (Math.abs(width - height) < 1) return "square";
  return width > height ? "landscape" : "portrait";
}

/** Builds the page geometry record from the raw values a PDF parser exposes. */
export function pageGeometry(input: {
  cropBox: PdfRect;
  mediaBox?: PdfRect;
  bleedBox?: PdfRect;
  trimBox?: PdfRect;
  artBox?: PdfRect;
  rotation?: number;
  userRotation?: number;
  renderScale: number;
  imageWidth: number;
  imageHeight: number;
}): PageGeometry {
  const rotation = normalizeRotation(input.rotation);
  const userRotation = normalizeRotation(input.userRotation);
  const boxW = Math.abs(input.cropBox[2] - input.cropBox[0]);
  const boxH = Math.abs(input.cropBox[3] - input.cropBox[1]);
  const swapped = rotation === 90 || rotation === 270;
  const widthPt = swapped ? boxH : boxW;
  const heightPt = swapped ? boxW : boxH;
  return {
    cropBox: input.cropBox,
    ...(input.mediaBox ? { mediaBox: input.mediaBox } : {}),
    ...(input.bleedBox ? { bleedBox: input.bleedBox } : {}),
    ...(input.trimBox ? { trimBox: input.trimBox } : {}),
    ...(input.artBox ? { artBox: input.artBox } : {}),
    rotation,
    userRotation,
    widthPt,
    heightPt,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    renderScale: input.renderScale,
    orientation: orientationOf(widthPt, heightPt),
    aspectRatio: heightPt > 0 ? widthPt / heightPt : 0,
  };
}

/**
 * PDF point → image pixel, folding `/Rotate` in. Mirrors the pdf.js viewport
 * transform, and is used for parsers/tests that only hand back PDF coordinates.
 */
export function pdfPointToImage(
  point: { x: number; y: number },
  geometry: PageGeometry,
): { x: number; y: number } {
  const [x0, y0, x1, y1] = geometry.cropBox;
  const left = Math.min(x0, x1);
  const bottom = Math.min(y0, y1);
  const top = Math.max(y0, y1);
  const right = Math.max(x0, x1);
  const s = geometry.renderScale;
  const px = (point.x - left) * s;
  // Flip the y axis: PDF grows up, the raster grows down.
  const py = (top - point.y) * s;
  const w = (right - left) * s;
  const h = (top - bottom) * s;
  switch (geometry.rotation) {
    case 90:
      return { x: h - py, y: px };
    case 180:
      return { x: w - px, y: h - py };
    case 270:
      return { x: py, y: w - px };
    default:
      return { x: px, y: py };
  }
}

/** PDF rect → axis-aligned image-space box (rotation aware). */
export function pdfRectToImageBox(rect: PdfRect, geometry: PageGeometry): Box {
  const corners = [
    pdfPointToImage({ x: rect[0], y: rect[1] }, geometry),
    pdfPointToImage({ x: rect[2], y: rect[1] }, geometry),
    pdfPointToImage({ x: rect[2], y: rect[3] }, geometry),
    pdfPointToImage({ x: rect[0], y: rect[3] }, geometry),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Image pixels → normalized IR box. */
export function imageBoxToNormalized(box: Box, size: { width: number; height: number }): Box {
  const width = size.width || 1;
  const height = size.height || 1;
  return {
    x: clamp01(box.x / width),
    y: clamp01(box.y / height),
    width: Math.max(0.0005, clamp01(box.width / width)),
    height: Math.max(0.0005, clamp01(box.height / height)),
  };
}

/** Normalized IR box → image pixels. */
export function normalizedToImageBox(box: Box, size: { width: number; height: number }): Box {
  return {
    x: box.x * size.width,
    y: box.y * size.height,
    width: box.width * size.width,
    height: box.height * size.height,
  };
}

/** Rotates a normalized box clockwise inside the unit square. */
export function rotateNormalizedBox(box: Box, rotation: number): Box {
  switch (normalizeRotation(rotation)) {
    case 90:
      return { x: 1 - box.y - box.height, y: box.x, width: box.height, height: box.width };
    case 180:
      return {
        x: 1 - box.x - box.width,
        y: 1 - box.y - box.height,
        width: box.width,
        height: box.height,
      };
    case 270:
      return { x: box.y, y: 1 - box.x - box.width, width: box.height, height: box.width };
    default:
      return { ...box };
  }
}

/** Swaps a page size when the rotation is a quarter turn. */
export function rotatePageSize<T extends { width: number; height: number }>(
  size: T,
  rotation: number,
): { width: number; height: number } {
  const rot = normalizeRotation(rotation);
  return rot === 90 || rot === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

export const boxToRect = (box: Box): [number, number, number, number] => [
  box.x,
  box.y,
  box.x + box.width,
  box.y + box.height,
];

/** Intersection-over-smaller-area, used for overlap/duplicate reasoning. */
export function boxOverlapRatio(a: Box, b: Box): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const overlap = x * y;
  const smallest = Math.min(a.width * a.height, b.width * b.height);
  return smallest > 0 ? overlap / smallest : 0;
}

/** Angle in degrees (counter-clockwise, PDF convention) of a text transform. */
export function transformRotation(transform: number[] | undefined): number {
  if (!transform || transform.length < 4) return 0;
  const [a, b] = [transform[0] ?? 1, transform[1] ?? 0];
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360);
}
