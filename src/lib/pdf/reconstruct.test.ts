import { beforeEach, describe, expect, it } from "vitest";
import { resetElementIds } from "./elements";
import {
  detectDirection,
  groupRows,
  reconstructBlockCandidates,
  reconstructLines,
  reconstructWords,
  tokenizeSpan,
  typographyStats,
  type RawTextSpan,
} from "./reconstruct";

const PAGE = { width: 1000, height: 1000 };

/** Builds a horizontal span in image pixels. */
const span = (str: string, x: number, y: number, width: number, extra: Partial<RawTextSpan> = {}) =>
  ({ str, x, y, width, height: 20, ...extra }) as RawTextSpan;

const words = (spans: RawTextSpan[]) =>
  reconstructWords(spans, { page: 1, size: PAGE, source: "native_pdf", ptPerPx: 0.5 });

beforeEach(() => {
  resetElementIds();
});

describe("detectDirection", () => {
  it("detects latin as ltr and arabic/hebrew as rtl", () => {
    expect(detectDirection("Hello world")).toBe("ltr");
    expect(detectDirection("مرحبا")).toBe("rtl");
    expect(detectDirection("שלום")).toBe("rtl");
  });

  it("honours an explicit vertical fallback", () => {
    expect(detectDirection("abc", "ttb")).toBe("ttb");
  });
});

describe("tokenizeSpan", () => {
  it("splits a run on whitespace and keeps positions increasing", () => {
    const tokens = tokenizeSpan(span("Hello world", 0, 0, 110));
    expect(tokens.map((token) => token.text)).toEqual(["Hello", "world"]);
    expect(tokens[1]!.x).toBeGreaterThan(tokens[0]!.x);
  });

  it("drops whitespace-only runs", () => {
    expect(tokenizeSpan(span("   ", 0, 0, 30))).toHaveLength(0);
  });
});

describe("groupRows", () => {
  it("puts spans on the same baseline in one row", () => {
    const rows = groupRows([span("a", 0, 100, 10), span("b", 20, 103, 10), span("c", 0, 400, 10)]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(2);
  });
});

describe("reconstructWords", () => {
  it("splits a run into words", () => {
    const result = words([span("Hello world", 100, 100, 110)]);
    expect(result.map((word) => word.text)).toEqual(["Hello", "world"]);
  });

  it("merges visually contiguous spans of the same style into one word", () => {
    const result = words([
      span("Hel", 100, 100, 30, { font: "Helvetica" }),
      span("lo", 130, 100, 20, { font: "Helvetica" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe("Hello");
    expect(result[0]!.spans).toEqual([0, 1]);
  });

  it("keeps spans separated by a wide gap as separate words", () => {
    const result = words([span("left", 100, 100, 40), span("right", 400, 100, 50)]);
    expect(result).toHaveLength(2);
  });

  it("normalizes boxes into the unit square", () => {
    const [word] = words([span("Hi", 100, 200, 40)]);
    expect(word!.box.x).toBeCloseTo(0.1, 6);
    expect(word!.box.y).toBeCloseTo(0.2, 6);
    expect(word!.box.width).toBeGreaterThan(0);
    expect(word!.box.width).toBeLessThanOrEqual(1);
  });

  it("carries font size, style, visibility and unmapped flags through", () => {
    const [word] = words([
      span("Title", 0, 0, 60, {
        font: "Georgia",
        bold: true,
        italic: true,
        visibility: "hidden",
        unmapped: true,
      }),
    ]);
    expect(word!.font.bold).toBe(true);
    expect(word!.font.italic).toBe(true);
    expect(word!.font.sizePt).toBeCloseTo(10, 5); // 20 px at 0.5 pt/px
    expect(word!.visibility).toBe("hidden");
    expect(word!.unmapped).toBe(true);
  });

  it("ignores empty spans", () => {
    expect(words([span("   ", 0, 0, 10)])).toHaveLength(0);
  });
});

describe("reconstructLines", () => {
  it("joins words on a row into one line", () => {
    const line = reconstructLines(words([span("one two three", 100, 100, 140)]), {
      page: 1,
      size: PAGE,
    });
    expect(line).toHaveLength(1);
    expect(line[0]!.text).toBe("one two three");
    expect(line[0]!.wordIds).toHaveLength(3);
  });

  it("splits a row at a wide gap so table cells stay separate", () => {
    const lines = reconstructLines(words([span("label", 50, 100, 50), span("value", 700, 100, 50)]), {
      page: 1,
      size: PAGE,
    });
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.text)).toEqual(["label", "value"]);
  });

  it("separates rows that are vertically apart", () => {
    const lines = reconstructLines(words([span("top", 50, 100, 40), span("bottom", 50, 400, 60)]), {
      page: 1,
      size: PAGE,
    });
    expect(lines).toHaveLength(2);
  });
});

describe("reconstructBlockCandidates", () => {
  it("groups adjacent lines into one candidate", () => {
    const spans = [span("first line", 50, 100, 100), span("second line", 50, 125, 110)];
    const lines = reconstructLines(words(spans), { page: 1, size: PAGE });
    const blocks = reconstructBlockCandidates(lines, { page: 1 });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.lineIds).toHaveLength(2);
    expect(blocks[0]!.text.split("\n")).toHaveLength(2);
  });

  it("keeps distant lines in separate candidates", () => {
    const spans = [span("header", 50, 50, 80), span("footer", 50, 900, 80)];
    const lines = reconstructLines(words(spans), { page: 1, size: PAGE });
    expect(reconstructBlockCandidates(lines, { page: 1 })).toHaveLength(2);
  });

  it("unions the geometry of its lines", () => {
    const spans = [span("aa", 50, 100, 100), span("bb", 50, 125, 200)];
    const lines = reconstructLines(words(spans), { page: 1, size: PAGE });
    const [block] = reconstructBlockCandidates(lines, { page: 1 });
    expect(block!.box.y).toBeCloseTo(0.1, 3);
    expect(block!.box.width).toBeGreaterThanOrEqual(0.2);
  });
});

describe("typographyStats", () => {
  it("reports empty stats for no words", () => {
    const stats = typographyStats([]);
    expect(stats.modalSizePt).toBeNull();
    expect(stats.totalChars).toBe(0);
  });

  it("finds the modal body size and size clusters", () => {
    const heading = span("BIG", 0, 0, 60, { height: 48 });
    const body = [
      span("body text here", 0, 100, 140),
      span("more body text", 0, 130, 140),
      span("even more body", 0, 160, 140),
    ];
    const stats = typographyStats(words([heading, ...body]));
    expect(stats.modalSizePt).toBe(10);
    expect(stats.maxSizePt).toBeGreaterThan(stats.modalSizePt!);
    expect(stats.sizeClusters.length).toBeGreaterThanOrEqual(2);
    expect(stats.totalChars).toBeGreaterThan(0);
  });

  it("counts bold and italic characters", () => {
    const stats = typographyStats(
      words([span("bold", 0, 0, 40, { bold: true }), span("plain", 0, 100, 50)]),
    );
    expect(stats.boldChars).toBe(4);
    expect(stats.italicChars).toBe(0);
  });
});
