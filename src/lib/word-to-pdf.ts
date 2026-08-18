import { newPdfItemId, type PdfPageItem } from "./pdf-to-png-store";
import { rotateDataUrl } from "./pdf-to-png";

/** US Letter in CSS pixels at 96 dpi, with 1in margins. */
const PAGE_W = 816;
const PAGE_H = 1056;
const PAD = 96;
const CONTENT_H = PAGE_H - PAD * 2;

const isWord = (f: File) =>
  /\.docx?$/i.test(f.name) ||
  f.type === "application/msword" ||
  f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function wordToHtml(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer });
    if (value.trim()) return value;
  } catch {
    /* legacy .doc — fall through to plain-text extraction */
  }
  const text = new TextDecoder("windows-1252")
    .decode(new Uint8Array(buffer))
    .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u024f]+/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
  if (!text) throw new Error("Could not read that Word file.");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</p>`)
    .join("");
}

function makeSheet(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `width:${PAGE_W}px;height:${PAGE_H}px;padding:${PAD}px;box-sizing:border-box;background:#ffffff;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;overflow:hidden;`;
  return el;
}

const CONTENT_W = PAGE_W - PAD * 2;

/** Constrains embedded images so a single tall/wide image can never overflow a sheet. */
function fitMedia(root: HTMLElement) {
  root.querySelectorAll("img, svg, table").forEach((node) => {
    const el = node as HTMLElement;
    el.removeAttribute("width");
    el.removeAttribute("height");
    el.style.maxWidth = `${CONTENT_W}px`;
    el.style.maxHeight = `${CONTENT_H}px`;
    el.style.width = "auto";
    el.style.height = "auto";
    el.style.objectFit = "contain";
    el.style.display = "block";
  });
}

/**
 * foreignObject rendering is inconsistent with CSS max-height on replaced
 * elements. Give loaded Word images explicit fitted dimensions instead, so
 * the preview bitmap and exported PDF use the same complete page geometry.
 */
function sizeLoadedImages(root: HTMLElement) {
  root.querySelectorAll("img").forEach((img) => {
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
    const scale = Math.min(CONTENT_W / img.naturalWidth, CONTENT_H / img.naturalHeight, 1);
    const width = Math.max(1, Math.floor(img.naturalWidth * scale));
    const height = Math.max(1, Math.floor(img.naturalHeight * scale));
    img.setAttribute("width", String(width));
    img.setAttribute("height", String(height));
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;

    const paragraph = img.closest("p");
    if (paragraph && paragraph.textContent?.trim() === "") {
      paragraph.style.marginTop = "0";
      paragraph.style.marginBottom = "0";
      paragraph.style.lineHeight = "0";
    }
  });
}

/** Shrinks media in a single indivisible block if its wrapper still overflows. */
function fitSingleBlock(body: HTMLElement) {
  if (body.scrollHeight <= CONTENT_H || body.childNodes.length !== 1) return;
  const ratio = Math.min(1, CONTENT_H / body.scrollHeight);
  body.querySelectorAll("img").forEach((img) => {
    const width = Math.max(1, Math.floor(img.getBoundingClientRect().width * ratio));
    const height = Math.max(1, Math.floor(img.getBoundingClientRect().height * ratio));
    img.setAttribute("width", String(width));
    img.setAttribute("height", String(height));
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
  });
}

/** Waits until all <img> inside the stage have real dimensions, so layout is accurate. */
async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
}

/** Splits the document HTML into US-Letter sheets and rasterizes each one. */
export async function readWordFiles(files: FileList | File[]): Promise<PdfPageItem[]> {
  const list = Array.from(files).filter(isWord);
  if (list.length === 0) return [];

  const { rasterizeElement } = await import("./html-raster");
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;";
  document.body.appendChild(stage);

  const out: PdfPageItem[] = [];
  try {
    for (const file of list) {
      const html = await wordToHtml(file);
      const source = document.createElement("div");
      source.style.cssText = `width:${CONTENT_W}px;`;
      source.innerHTML = html;
      stage.appendChild(source);
      fitMedia(source);
      await waitForImages(source);
      sizeLoadedImages(source);
      const blocks = Array.from(source.childNodes);

      const sheets: HTMLDivElement[] = [];
      let sheet = makeSheet();
      let body = document.createElement("div");
      sheet.appendChild(body);
      stage.appendChild(sheet);
      sheets.push(sheet);

      for (const node of blocks) {
        body.appendChild(node.cloneNode(true));
        fitSingleBlock(body);
        if (body.scrollHeight > CONTENT_H && body.childNodes.length > 1) {
          const overflow = body.lastChild;
          if (!overflow) continue;
          body.removeChild(overflow);
          sheet = makeSheet();
          body = document.createElement("div");
          body.appendChild(overflow);
          fitSingleBlock(body);
          sheet.appendChild(body);
          stage.appendChild(sheet);
          sheets.push(sheet);
        }
      }

      source.remove();
      await waitForImages(stage);

      const base = file.name.replace(/\.docx?$/i, "");
      for (let i = 0; i < sheets.length; i += 1) {
        const currentSheet = sheets[i];
        if (!currentSheet) continue;
        const canvas = await rasterizeElement(currentSheet, PAGE_W, PAGE_H, 2);
        out.push({
          id: newPdfItemId(),
          name: sheets.length > 1 ? `${base}-page-${i + 1}` : base,
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height,
          rotation: 0,
          selected: true,
        });
      }
    }
  } finally {
    stage.remove();
  }

  return out;
}

/** Selected Word pages -> single PDF. */
export async function convertWordPagesToPdf(
  items: PdfPageItem[],
  baseName: string,
): Promise<{ blob: Blob; filename: string }> {
  const selected = items.filter((i) => i.selected);
  if (selected.length === 0) throw new Error("Select at least one page first.");

  const { jsPDF } = await import("jspdf");
  const name = (baseName || "untitled").replace(/\.(docx?|pdf)$/i, "");
  let doc: import("jspdf").jsPDF | null = null;

  for (const item of selected) {
    const rotated = await rotateDataUrl(item.dataUrl, item.rotation);
    const orientation = rotated.width > rotated.height ? "landscape" : "portrait";
    const size: [number, number] = orientation === "landscape" ? [PAGE_H, PAGE_W] : [PAGE_W, PAGE_H];
    if (!doc) {
      doc = new jsPDF({ orientation, unit: "px", format: size, compress: true });
    } else {
      doc.addPage(size, orientation);
    }
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const scale = Math.min(pw / rotated.width, ph / rotated.height);
    const w = rotated.width * scale;
    const h = rotated.height * scale;
    doc.addImage(rotated.dataUrl, "PNG", (pw - w) / 2, (ph - h) / 2, w, h);
  }

  if (!doc) throw new Error("Select at least one page first.");
  return { blob: doc.output("blob"), filename: `${name}.pdf` };
}
