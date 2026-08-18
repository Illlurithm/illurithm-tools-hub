import type { PdfPageItem } from "./pdf-to-png-store";
import {
  convertPdfPagesToWord,
  type OcrProgress,
  type WordFormat,
  type WordMargins,
} from "./pdf-to-word";

/** Languages offered in the OCR "Document Language" dropdown. */
export const OCR_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
] as const;

export type OcrLanguage = (typeof OCR_LANGUAGES)[number]["value"];

/** Tesseract traineddata codes for each UI language. */
export const OCR_LANGUAGE_CODES: Record<OcrLanguage, string> = {
  en: "eng",
  es: "spa",
  fr: "fra",
  de: "deu",
};

/** "Language Optimization Pack" options for Deep OCR processing. */
export const LANGUAGE_PACKS = [
  { value: "en", label: "English Only (Standard)", codes: "eng" },
  {
    value: "en_hi_mr",
    label: "Bilingual: English + Hindi/Marathi (Devanagari script)",
    codes: "eng+hin+mar",
  },
  { value: "en_es", label: "Bilingual: English + Spanish", codes: "eng+spa" },
] as const;

export type LanguagePack = (typeof LANGUAGE_PACKS)[number]["value"];

export const languagePackCodes = (pack: LanguagePack) =>
  LANGUAGE_PACKS.find((p) => p.value === pack)?.codes ?? "eng";

/** Stages surfaced by the UI progress indicator. */
export type ConversionStage = "split" | "ocr" | "export";

export const CONVERSION_STAGES: { id: ConversionStage; label: string }[] = [
  { id: "split", label: "Stage 1/3: Parsing document layout and table grids..." },
  { id: "ocr", label: "Stage 2/3: Applying multi-language cloud Vision OCR models..." },
  { id: "export", label: "Stage 3/3: Reconstructing native Microsoft Word text fields..." },
];

/**
 * Payload shape submitted for a conversion. Kept flat and serializable so it can
 * be POSTed to an external processing worker without changes.
 */
export type PdfToWordPayload = {
  file_name: string;
  page_count: number;
  format: WordFormat;
  margins: WordMargins;
  ocr_enabled: boolean;
  preserve_layout: boolean;
  language_pack: LanguagePack;
  ocr_language?: OcrLanguage;
};

export type PdfToWordResult = {
  ok: true;
  filename: string;
  /** Object URL (or, later, a remote URL) for the generated document. */
  download_url: string;
  size: number;
  payload: PdfToWordPayload;
};

export function buildPdfToWordPayload(input: {
  items: PdfPageItem[];
  baseName: string;
  format: WordFormat;
  margins: WordMargins;
  ocrEnabled: boolean;
  preserveLayout: boolean;
  languagePack: LanguagePack;
  ocrLanguage?: OcrLanguage;
}): PdfToWordPayload {
  return {
    file_name: input.baseName,
    page_count: input.items.filter((item) => item.selected).length,
    format: input.format,
    margins: input.margins,
    ocr_enabled: input.ocrEnabled,
    preserve_layout: input.preserveLayout,
    language_pack: input.languagePack,
    ...(input.ocrEnabled && input.ocrLanguage ? { ocr_language: input.ocrLanguage } : {}),
  };
}

/**
 * Mock API handler: runs the conversion locally and returns a response shaped
 * like the future worker endpoint. Swap the body for `fetch("/api/...")` later.
 */
export async function submitPdfToWordConversion(
  items: PdfPageItem[],
  payload: PdfToWordPayload,
  handlers: {
    onStage?: (stage: ConversionStage) => void;
    onProgress?: (progress: OcrProgress) => void;
  } = {},
): Promise<PdfToWordResult> {
  handlers.onStage?.("split");
  const { blob, filename } = await convertPdfPagesToWord(
    items,
    payload.file_name,
    payload.format,
    payload.margins,
    payload.ocr_enabled ? "ocr" : "image",
    (progress) => {
      handlers.onStage?.(payload.ocr_enabled ? "ocr" : "export");
      handlers.onProgress?.(progress);
    },
    payload.ocr_enabled ? languagePackCodes(payload.language_pack) : undefined,
    {
      enabled: payload.ocr_enabled && payload.preserve_layout,
      languagePack: payload.language_pack,
    },
  );
  handlers.onStage?.("export");

  return {
    ok: true,
    filename,
    download_url: URL.createObjectURL(blob),
    size: blob.size,
    payload,
  };
}
