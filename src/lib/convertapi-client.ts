import type { LanguagePack } from "./pdf-to-word-request";
import {
  convertPdfToDocxViaConvertApi,
  type ConvertApiLayout,
} from "./convertapi.functions";

export const CONVERTAPI_STATUS = "Converting on the cloud engine — preserving layout and tables...";

/** Maps the UI language pack to a ConvertAPI OCR language code. */
export function convertApiOcrLanguage(pack: LanguagePack): string {
  if (pack === "en") return "en";
  if (pack === "en_es") return "es";
  return "auto"; // Devanagari is auto-detected by the native engine
}

export function convertApiLayout(preserveLayout: boolean): ConvertApiLayout {
  return preserveLayout ? "continuous" : "flowing";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Sends the original PDF to the cloud conversion engine and returns the .docx. */
export async function convertPdfViaConvertApi(
  file: Blob,
  fileName: string,
  options: {
    preserveLayout: boolean;
    ocrEnabled: boolean;
    languagePack: LanguagePack;
    pageRange?: string;
  },
): Promise<{ blob: Blob; filename: string }> {
  const result = await convertPdfToDocxViaConvertApi({
    data: {
      file_base64: await blobToBase64(file),
      file_name: fileName,
      layout: convertApiLayout(options.preserveLayout),
      ocr_mode: options.ocrEnabled ? "force" : "auto",
      ocr_language: convertApiOcrLanguage(options.languagePack),
      ...(options.pageRange ? { page_range: options.pageRange } : {}),
    },
  });

  return {
    blob: base64ToBlob(
      result.file_base64,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    filename: result.file_name,
  };
}
