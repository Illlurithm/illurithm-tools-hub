import { describe, expect, it } from "vitest";
import {
  boxOverlapRatio,
  imageBoxToNormalized,
  normalizeRotation,
  normalizedToImageBox,
  pageGeometry,
  pdfPointToImage,
  pdfRectToImageBox,
  rotateNormalizedBox,
  rotatePageSize,
  transformRotation,
  type PdfRect,
} from "./coords";

const A4: PdfRect = [0, 0, 595, 842];

const geometry = (rotation: number) =>
  pageGeometry({
    cropBox: A4,
    rotation,
    renderScale: 2,
    imageWidth: rotation === 90 || rotation === 270 ? 842 * 2 : 595 * 2,
    imageHeight: rotation === 90 || rotation === 270 ? 595 * 2 : 842 * 2,
  });

describe("normalizeRotation", () => {
  it("snaps to the four quarter turns", () => {
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(89)).toBe(90);
    expect(normalizeRotation(400)).toBe(0);
  });
});

describe("pageGeometry", () => {
  it("keeps the logical size for an upright page", () => {
    const g = geometry(0);
    expect(g.widthPt).toBe(595);
    expect(g.heightPt).toBe(842);
    expect(g.orientation).toBe("portrait");
    expect(g.aspectRatio).toBeCloseTo(595 / 842, 5);
  });

  it("swaps width and height on a quarter turn", () => {
    const g = geometry(270);
    expect(g.widthPt).toBe(842);
    expect(g.heightPt).toBe(595);
    expect(g.orientation).toBe("landscape");
  });
});

describe("pdfPointToImage", () => {
  it("flips the y axis for an unrotated page", () => {
    const g = geometry(0);
    // PDF top-left corner → image origin.
    expect(pdfPointToImage({ x: 0, y: 842 }, g)).toEqual({ x: 0, y: 0 });
    // PDF bottom-left corner → bottom of the raster.
    expect(pdfPointToImage({ x: 0, y: 0 }, g)).toEqual({ x: 0, y: 1684 });
  });

  it("maps corners consistently at 90/180/270", () => {
    const topLeft = { x: 0, y: 842 };
    expect(pdfPointToImage(topLeft, geometry(90))).toEqual({ x: 1684, y: 0 });
    expect(pdfPointToImage(topLeft, geometry(180))).toEqual({ x: 1190, y: 1684 });
    expect(pdfPointToImage(topLeft, geometry(270))).toEqual({ x: 0, y: 1190 });
  });

  it("stays inside the raster for every rotation", () => {
    for (const rotation of [0, 90, 180, 270]) {
      const g = geometry(rotation);
      for (const point of [
        { x: 0, y: 0 },
        { x: 595, y: 0 },
        { x: 595, y: 842 },
        { x: 0, y: 842 },
        { x: 300, y: 400 },
      ]) {
        const px = pdfPointToImage(point, g);
        expect(px.x).toBeGreaterThanOrEqual(0);
        expect(px.y).toBeGreaterThanOrEqual(0);
        expect(px.x).toBeLessThanOrEqual(g.imageWidth);
        expect(px.y).toBeLessThanOrEqual(g.imageHeight);
      }
    }
  });
});

describe("pdfRectToImageBox", () => {
  it("produces an axis-aligned box with positive extents", () => {
    const box = pdfRectToImageBox([100, 700, 300, 740], geometry(0));
    expect(box).toEqual({ x: 200, y: 204, width: 400, height: 80 });
  });

  it("swaps extents on a quarter turn", () => {
    const box = pdfRectToImageBox([100, 700, 300, 740], geometry(90));
    expect(box.width).toBeCloseTo(80, 5);
    expect(box.height).toBeCloseTo(400, 5);
  });
});

describe("normalization round trip", () => {
  it("returns the same pixel box", () => {
    const size = { width: 1190, height: 1684 };
    const px = { x: 200, y: 400, width: 300, height: 50 };
    const back = normalizedToImageBox(imageBoxToNormalized(px, size), size);
    expect(back.x).toBeCloseTo(px.x, 6);
    expect(back.y).toBeCloseTo(px.y, 6);
    expect(back.width).toBeCloseTo(px.width, 6);
    expect(back.height).toBeCloseTo(px.height, 6);
  });

  it("clamps out-of-page boxes into the unit square", () => {
    const n = imageBoxToNormalized({ x: -50, y: -10, width: 5000, height: 5000 }, {
      width: 1000,
      height: 1000,
    });
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
    expect(n.width).toBe(1);
    expect(n.height).toBe(1);
  });
});

describe("rotateNormalizedBox", () => {
  const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

  it("is the identity at 0 and 360", () => {
    expect(rotateNormalizedBox(box, 0)).toEqual(box);
    expect(rotateNormalizedBox(box, 360)).toEqual(box);
  });

  it("returns to the start after four quarter turns", () => {
    let result = box;
    for (let i = 0; i < 4; i += 1) result = rotateNormalizedBox(result, 90);
    expect(result.x).toBeCloseTo(box.x, 10);
    expect(result.y).toBeCloseTo(box.y, 10);
    expect(result.width).toBeCloseTo(box.width, 10);
    expect(result.height).toBeCloseTo(box.height, 10);
  });

  it("is the inverse of the opposite quarter turn", () => {
    const there = rotateNormalizedBox(box, 90);
    const back = rotateNormalizedBox(there, 270);
    expect(back.x).toBeCloseTo(box.x, 10);
    expect(back.y).toBeCloseTo(box.y, 10);
  });

  it("keeps boxes inside the unit square and swaps extents", () => {
    const r = rotateNormalizedBox(box, 90);
    expect(r.width).toBeCloseTo(box.height, 10);
    expect(r.height).toBeCloseTo(box.width, 10);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(1.0000001);
    expect(r.y + r.height).toBeLessThanOrEqual(1.0000001);
  });
});

describe("rotatePageSize", () => {
  it("swaps only on quarter turns", () => {
    const size = { width: 100, height: 200 };
    expect(rotatePageSize(size, 0)).toEqual(size);
    expect(rotatePageSize(size, 180)).toEqual(size);
    expect(rotatePageSize(size, 90)).toEqual({ width: 200, height: 100 });
    expect(rotatePageSize(size, 270)).toEqual({ width: 200, height: 100 });
  });
});

describe("boxOverlapRatio", () => {
  it("is 1 for identical boxes and 0 for disjoint boxes", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxOverlapRatio(a, { ...a })).toBe(1);
    expect(boxOverlapRatio(a, { x: 50, y: 50, width: 10, height: 10 })).toBe(0);
  });

  it("uses the smaller area as the denominator", () => {
    const big = { x: 0, y: 0, width: 10, height: 10 };
    const small = { x: 0, y: 0, width: 2, height: 2 };
    expect(boxOverlapRatio(big, small)).toBe(1);
  });

  it("scores partial overlap", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 0, width: 10, height: 10 };
    expect(boxOverlapRatio(a, b)).toBeCloseTo(0.5, 6);
  });
});

describe("transformRotation", () => {
  it("reads the angle from a text matrix", () => {
    expect(transformRotation(undefined)).toBe(0);
    expect(transformRotation([1, 0, 0, 1, 0, 0])).toBe(0);
    expect(transformRotation([0, 1, -1, 0, 0, 0])).toBe(90);
    expect(transformRotation([-1, 0, 0, -1, 0, 0])).toBe(180);
    expect(transformRotation([0, -1, 1, 0, 0, 0])).toBe(270);
  });
});
