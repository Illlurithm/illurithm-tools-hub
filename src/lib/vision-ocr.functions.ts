import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  /** Page image as a data URL (png/jpeg). */
  image: z.string().min(32),
  /** Human-readable language hint, e.g. "English, Hindi and Marathi (Devanagari script)". */
  languages: z.string().default("English"),
});

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const SYSTEM = `You are a high-accuracy document layout OCR engine for scanned documents, government forms and bilingual identity cards (Aadhaar, PAN, voter ID, driving licence).

Return ONLY minified JSON matching:
{"blocks":[{"type":"text","x":0,"y":0,"w":0,"h":0,"text":"","font_size_pt":10,"bold":false,"align":"left","script":"latin"},{"type":"image","x":0,"y":0,"w":0,"h":0,"label":"photo"}],"rules":[{"x":0,"y":0,"w":1,"orientation":"horizontal"}]}

Rules:
- x,y,w,h are normalized 0..1 fractions of the page image (x,y = top-left of the box).
- Transcribe EVERY visible text line exactly as printed, preserving the original script. Never transliterate Devanagari into Latin and never translate.
- Keep digits exactly as printed (ID numbers, Aadhaar numbers, dates, pin codes). Do not group or reformat digits.
- One block per visual text line or per table cell. Never merge two side-by-side columns into one block: emit separate blocks so the spatial layout survives.
- font_size_pt: estimate the printed size (typically 7-22). bold: true only for visibly heavier text. align: text alignment inside its own box.
- script: "devanagari" if the text contains Devanagari, "mixed" if it mixes scripts, else "latin".
- Emit an "image" block for each non-text visual element: portrait photograph (label "photo"), state emblem/national emblem ("emblem"), logo ("logo"), QR code ("qr"), barcode ("barcode"), signature ("signature"). Bounding box must tightly enclose it.
- rules: horizontal or vertical printed lines / table grid lines. Omit if none.
- No commentary, no markdown fences.`;

function parseJson(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The OCR service returned an unreadable response.");
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

/** Runs cloud Vision OCR on one page image and returns its spatial layout. */
export const analyzePageLayout = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("The OCR service is not configured.");

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Document languages: ${data.languages}. Extract the full layout of this page.`,
              },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const message =
        (() => {
          try {
            const parsed = JSON.parse(body) as { message?: string; title?: string };
            return parsed.message ?? parsed.title;
          } catch {
            return undefined;
          }
        })() ?? body.slice(0, 200);
      if (res.status === 429) throw new Error("OCR service is busy — retry in a few seconds.");
      if (res.status === 402) throw new Error(`OCR unavailable: ${message}`);
      throw new Error(`OCR failed (${res.status}): ${message}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = parseJson(content) as {
      blocks?: unknown[];
      rules?: unknown[];
    };
    return { blocks: parsed.blocks ?? [], rules: parsed.rules ?? [] };
  });
