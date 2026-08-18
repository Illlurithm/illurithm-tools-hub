import type { PdfToWordPayload } from "./pdf-to-word-request";

const STORAGE_KEY = "pdf_to_word_backend_url";

/** Default endpoint, e.g. https://myspace.hf.space/convert (set VITE_PDF_CONVERT_URL). */
const ENV_URL = (import.meta.env["VITE_PDF_CONVERT_URL"] as string | undefined) ?? "";

/** Reads the configured microservice endpoint (user override wins over the env default). */
export function getBackendUrl(): string {
  if (typeof window === "undefined") return ENV_URL;
  return window.localStorage.getItem(STORAGE_KEY)?.trim() || ENV_URL;
}

export function setBackendUrl(url: string) {
  if (typeof window === "undefined") return;
  const clean = url.trim();
  if (clean) window.localStorage.setItem(STORAGE_KEY, clean);
  else window.localStorage.removeItem(STORAGE_KEY);
}

export const BACKEND_STATUS = "Analyzing layout, reading Devanagari text, and generating tables...";

/** Hard timeout for the remote conversion; Docling/MinerU parses are slow but not endless. */
const TIMEOUT_MS = 180_000;

export type BackendResult = { blob: Blob; filename: string };

function filenameFrom(response: Response, fallback: string) {
  const header = response.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  const name = match?.[1] ? decodeURIComponent(match[1]) : "";
  return name || fallback;
}

/**
 * POSTs the original PDF to the external conversion microservice as
 * multipart/form-data and returns the generated .docx binary.
 */
export async function convertPdfViaBackend(
  file: Blob,
  fileName: string,
  payload: PdfToWordPayload,
): Promise<BackendResult> {
  const url = getBackendUrl();
  if (!url) throw new Error("Set your conversion service URL first (Backend button).");

  const form = new FormData();
  form.append("file", file, fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`);
  form.append("ocr_enabled", String(payload.ocr_enabled));
  form.append("preserve_layout", String(payload.preserve_layout));
  form.append("language_pack", payload.language_pack);
  if (payload.ocr_language) form.append("ocr_language", payload.ocr_language);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", body: form, signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "The conversion service timed out. Try fewer pages, or a clearer/higher-resolution scan.",
      );
    }
    throw new Error(
      "Could not reach the conversion service. Check the URL is online and allows browser (CORS) requests.",
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 415 || response.status === 422) {
      throw new Error(
        "The service could not read this PDF — the scan resolution is too low or the page is unreadable. Re-scan at 300 dpi and retry.",
      );
    }
    if (response.status === 504 || response.status === 408) {
      throw new Error("The conversion service timed out while parsing this document.");
    }
    throw new Error(
      detail.slice(0, 200) || `Conversion service failed with status ${response.status}.`,
    );
  }

  const blob = await response.blob();
  if (blob.size === 0) throw new Error("The conversion service returned an empty document.");

  const base = fileName.replace(/\.(pdf|docx?)$/i, "") || "converted";
  return { blob, filename: filenameFrom(response, `${base}.docx`) };
}

/** Triggers a browser download for a converted blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
