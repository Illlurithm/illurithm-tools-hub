import type { PngItem, PngMargin, PngOrientation, PngFormat } from "./png-to-pdf-store";

// All measurements in points (1 pt = 1/72 inch).
const MM = 72 / 25.4;

const FORMATS: Record<Exclude<PngFormat, "Original">, [number, number]> = {
  A3: [297 * MM, 420 * MM],
  A4: [210 * MM, 297 * MM],
  A5: [148 * MM, 210 * MM],
  "US Legal": [8.5 * 72, 14 * 72],
  "US Letter": [8.5 * 72, 11 * 72],
};

const MARGINS: Record<PngMargin, number> = {
  "No Margin": 0,
  Narrow: 0.5 * 72,
  Moderate: 0.75 * 72,
  Wide: 1 * 72,
};

/** Draws the image on a canvas rotated by `rotation` degrees and returns a PNG data URL. */
function rotated(item: PngItem): Promise<{ dataUrl: string; width: number; height: number }> {
  const rot = ((item.rotation % 360) + 360) % 360;
  if (rot === 0) {
    return Promise.resolve({ dataUrl: item.dataUrl, width: item.width, height: item.height });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Could not decode image"));
    img.onload = () => {
      const swap = rot === 90 || rot === 270;
      const w = swap ? img.naturalHeight : img.naturalWidth;
      const h = swap ? img.naturalWidth : img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width: w, height: h });
    };
    img.src = item.dataUrl;
  });
}

export type ConvertOptions = {
  format: PngFormat;
  orientation: PngOrientation;
  margin: PngMargin;
};

export async function convertPngsToPdf(
  items: PngItem[],
  { format, orientation, margin }: ConvertOptions,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pad = MARGINS[margin];
  let doc: import("jspdf").jsPDF | null = null;

  for (const item of items) {
    const img = await rotated(item);
    const landscapeImage = img.width > img.height;

    let pw: number;
    let ph: number;
    if (format === "Original") {
      // Image pixels mapped 1:1 to points, plus the requested margin.
      let w = img.width + pad * 2;
      let h = img.height + pad * 2;
      if (orientation === "Portrait" && w > h) [w, h] = [h, w];
      if (orientation === "Landscape" && h > w) [w, h] = [h, w];
      pw = w;
      ph = h;
    } else {
      const [short, long] = FORMATS[format];
      const useLandscape =
        orientation === "Landscape" ||
        (orientation === "Auto Orientation" && landscapeImage);
      pw = useLandscape ? long : short;
      ph = useLandscape ? short : long;
    }

    const pageOrientation = pw > ph ? "landscape" : "portrait";
    if (!doc) {
      doc = new jsPDF({ unit: "pt", format: [pw, ph], orientation: pageOrientation });
    } else {
      doc.addPage([pw, ph], pageOrientation);
    }

    const boxW = Math.max(1, pw - pad * 2);
    const boxH = Math.max(1, ph - pad * 2);
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    doc.addImage(
      img.dataUrl,
      img.dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG",
      (pw - drawW) / 2,
      (ph - drawH) / 2,
      drawW,
      drawH,
      undefined,
      "FAST",
    );
  }

  if (!doc) throw new Error("Add at least one PNG file first.");
  return doc.output("blob");
}
