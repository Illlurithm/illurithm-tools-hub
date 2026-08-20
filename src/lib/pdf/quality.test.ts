import { beforeEach, describe, expect, it } from "vitest";
import type { Box } from "./coords";
import { resetElementIds, type ExtractedImage, type ExtractedWord } from "./elements";
import {
  NATIVE_QUALITY_THRESHOLD,
  backgroundAnalysis,
  linkOcrDuplicates,
  markDuplicateWords,
  markWatermarkCandidates,
  nativeTextQuality,
  pageDensity,
  routePage,
} from "./quality";

let seq = 0;

const word = (text: string, box: Box, extra: Partial<ExtractedWord> = {}): ExtractedWord => ({
  id: `w${(seq += 1)}`,
  kind: "TEXT",
  page: 1,
  text,
  box,
  font: { family: "Helvetica", sizePt: 10, bold: false, italic: false, embedded: true },
  direction: "ltr",
  rotation: 0,
  visibility: "visible",
  source: "native_pdf",
  confidence: null,
  spans: [],
  ...extra,
});

const box = (x: number, y: number, w = 0.05, h = 0.02): Box => ({ x, y, width: w, height: h });

/** A healthy paragraph of native text. */
const goodWords = () =>
  Array.from({ length: 60 }, (_, i) =>
    word("readable", box(0.1 + (i % 10) * 0.07, 0.1 + Math.floor(i / 10) * 0.03)),
  );

const image = (b: Box, id = `i${(seq += 1)}`): ExtractedImage =>
  ({ id, page: 1, box: b, kind: "IMAGE" }) as unknown as ExtractedImage;

beforeEach(() => {
  seq = 0;
  resetElementIds();
});

describe("markDuplicateWords", () => {
  it("marks the second copy of the same text at the same place", () => {
    const a = word("Total", box(0.1, 0.1));
    const b = word("Total", box(0.1, 0.1));
    const result = markDuplicateWords([a, b]);
    expect(result.duplicates).toBe(1);
    expect(b.duplicateOf).toBe(a.id);
    expect(a.duplicateOf).toBeUndefined();
  });

  it("does not mark the same text at a different place", () => {
    const a = word("Total", box(0.1, 0.1));
    const b = word("Total", box(0.6, 0.8));
    expect(markDuplicateWords([a, b]).duplicates).toBe(0);
    expect(b.duplicateOf).toBeUndefined();
  });

  it("compares case- and whitespace-insensitively", () => {
    const a = word("Total ", box(0.1, 0.1));
    const b = word("total", box(0.1, 0.1));
    expect(markDuplicateWords([a, b]).duplicates).toBe(1);
  });
});

describe("linkOcrDuplicates", () => {
  it("links an OCR word back to the native word it re-read", () => {
    const native = word("Invoice", box(0.2, 0.2));
    const ocr = word("invoice", box(0.205, 0.2), { source: "ocr", confidence: 91 });
    expect(linkOcrDuplicates([native], [ocr]).matched).toBe(1);
    expect(ocr.duplicateOf).toBe(native.id);
  });

  it("leaves genuinely new OCR text alone", () => {
    const native = word("Invoice", box(0.2, 0.2));
    const ocr = word("Signature", box(0.7, 0.9), { source: "ocr" });
    expect(linkOcrDuplicates([native], [ocr]).matched).toBe(0);
    expect(ocr.duplicateOf).toBeUndefined();
  });
});

describe("nativeTextQuality", () => {
  it("scores 0 with no native text", () => {
    const quality = nativeTextQuality({ words: [], lines: [] });
    expect(quality.score).toBe(0);
    expect(quality.reasons).toContain("no native text layer");
  });

  it("scores a healthy text layer above the routing threshold", () => {
    const quality = nativeTextQuality({ words: goodWords(), lines: [] });
    expect(quality.score).toBeGreaterThanOrEqual(NATIVE_QUALITY_THRESHOLD);
    expect(quality.charCount).toBeGreaterThan(200);
  });

  it("punishes unmapped glyph soup", () => {
    const soup = goodWords().map((w, i) =>
      i % 2 === 0 ? { ...w, unmapped: true, text: "\uFFFD\uFFFD\uFFFD" } : w,
    );
    const quality = nativeTextQuality({ words: soup, lines: [] });
    expect(quality.score).toBeLessThan(NATIVE_QUALITY_THRESHOLD);
    expect(quality.suspiciousRatio).toBeGreaterThan(0);
    expect(quality.reasons.join(" ")).toMatch(/unmapped/);
  });

  it("punishes a thin text layer over a full-page scan", () => {
    const quality = nativeTextQuality({
      words: [word("1", box(0.5, 0.95))],
      lines: [],
      hasFullPageImage: true,
    });
    expect(quality.score).toBeLessThan(0.5);
    expect(quality.reasons.join(" ")).toMatch(/full-page image/);
  });

  it("reports hidden and duplicate ratios", () => {
    const hidden = goodWords().map((w) => ({ ...w, visibility: "hidden" as const }));
    const quality = nativeTextQuality({ words: hidden, lines: [] });
    expect(quality.hiddenRatio).toBe(1);
    expect(quality.reasons.join(" ")).toMatch(/hidden/);
  });

  it("keeps every ratio inside 0..1", () => {
    const quality = nativeTextQuality({ words: goodWords(), lines: [] });
    for (const value of [
      quality.score,
      quality.coverage,
      quality.suspiciousRatio,
      quality.invalidBoxRatio,
      quality.duplicateRatio,
      quality.hiddenRatio,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("routePage", () => {
  const quality = (over: Partial<ReturnType<typeof nativeTextQuality>>) => ({
    ...nativeTextQuality({ words: goodWords(), lines: [] }),
    ...over,
  });

  it("uses native text when OCR is disabled, whatever the score", () => {
    const route = routePage({
      quality: quality({ score: 0.1 }),
      hasFullPageImage: true,
      imageAreaRatio: 0.9,
      ocrEnabled: false,
    });
    expect(route.route).toBe("native");
  });

  it("routes a page with no text layer to OCR", () => {
    const route = routePage({
      quality: nativeTextQuality({ words: [], lines: [] }),
      hasFullPageImage: true,
      imageAreaRatio: 1,
      ocrEnabled: true,
    });
    expect(route.route).toBe("ocr");
  });

  it("routes a reliable page to native", () => {
    const route = routePage({
      quality: quality({}),
      hasFullPageImage: false,
      imageAreaRatio: 0.05,
      ocrEnabled: true,
    });
    expect(route.route).toBe("native");
  });

  it("routes a weak text layer to OCR", () => {
    const route = routePage({
      quality: quality({ score: 0.3, reasons: ["unmapped glyphs 60%"] }),
      hasFullPageImage: false,
      imageAreaRatio: 0.1,
      ocrEnabled: true,
    });
    expect(route.route).toBe("ocr");
    expect(route.reason).toMatch(/unmapped/);
  });

  it("routes good text with large picture regions to hybrid", () => {
    const route = routePage({
      quality: quality({ coverage: 0.02 }),
      hasFullPageImage: false,
      imageAreaRatio: 0.6,
      ocrEnabled: true,
    });
    expect(route.route).toBe("hybrid");
  });
});

describe("pageDensity", () => {
  const empty = {
    words: [],
    lines: [],
    blocks: [],
    images: [],
    vectors: [],
    annotations: [],
    links: { length: 0 },
    formFields: { length: 0 },
  };

  it("calls an empty page blank", () => {
    expect(pageDensity(empty).profile).toBe("blank");
  });

  it("calls a text page mostly_text", () => {
    const density = pageDensity({
      ...empty,
      words: goodWords(),
      blocks: [
        {
          id: "b1",
          page: 1,
          kind: "TEXT",
          box: box(0.1, 0.1, 0.8, 0.6),
          lineIds: [],
          text: "x",
          source: "native_pdf",
          confidence: null,
        },
      ],
    });
    expect(density.profile).toBe("mostly_text");
    expect(density.wordCount).toBe(60);
  });

  it("calls a scan mostly_image", () => {
    const density = pageDensity({ ...empty, images: [image(box(0, 0, 1, 1))] });
    expect(density.profile).toBe("mostly_image");
    expect(density.imageAreaRatio).toBeCloseTo(1, 3);
  });

  it("calls a page with many fields form_heavy", () => {
    const density = pageDensity({ ...empty, formFields: { length: 9 } });
    expect(density.profile).toBe("form_heavy");
  });
});

describe("backgroundAnalysis", () => {
  it("detects a full-page raster", () => {
    const result = backgroundAnalysis({ images: [image(box(0, 0, 1, 1))], vectors: [] });
    expect(result.fullPageImage).toBe(true);
    expect(result.largeBackgroundObject).toBe(true);
  });

  it("ignores small images", () => {
    const result = backgroundAnalysis({ images: [image(box(0.1, 0.1, 0.2, 0.2))], vectors: [] });
    expect(result.fullPageImage).toBe(false);
  });
});

describe("markWatermarkCandidates", () => {
  it("flags a large element repeated at the same place on several pages", () => {
    const geo = box(0.2, 0.2, 0.6, 0.6);
    const result = markWatermarkCandidates([
      { index: 0, images: [image(geo, "a")], vectors: [] },
      { index: 1, images: [image(geo, "b")], vectors: [] },
    ]);
    expect(result.get(0)).toEqual(["a"]);
    expect(result.get(1)).toEqual(["b"]);
  });

  it("flags nothing in a single-page document", () => {
    const result = markWatermarkCandidates([
      { index: 0, images: [image(box(0.2, 0.2, 0.6, 0.6), "a")], vectors: [] },
    ]);
    expect(result.size).toBe(0);
  });

  it("does not flag elements at different places", () => {
    const result = markWatermarkCandidates([
      { index: 0, images: [image(box(0, 0, 0.4, 0.4), "a")], vectors: [] },
      { index: 1, images: [image(box(0.6, 0.6, 0.4, 0.4), "b")], vectors: [] },
    ]);
    expect(result.size).toBe(0);
  });
});
