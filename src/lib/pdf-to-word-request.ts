import type { PdfPageItem } from "./pdf-to-png-store";
import type { QualityReport } from "./docintel/stages/validate";
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
  /** Object URL for the generated document. */
  download_url: string;
  size: number;
  payload: PdfToWordPayload;
  /** Quality report produced by the document intelligence validator. */
  quality?: QualityReport;
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

/** Maps engine job states onto the three stages shown by the UI stepper. */
const STAGE_FOR_STATE: Record<string, ConversionStage> = {
  queued: "split",
  analyzing: "split",
  extracting: "split",
  ocr: "ocr",
  layout_analysis: "ocr",
  structure_analysis: "ocr",
  reconstructing: "export",
  generating_docx: "export",
  validating: "export",
  completed: "export",
};

/**
 * Entry point used by the UI. Runs the modular Document Intelligence engine for
 * DOCX output, and the legacy page-image writer for the DOC / image-only path.
 */
export async function submitPdfToWordConversion(
  items: PdfPageItem[],
  payload: PdfToWordPayload,
  handlers: {
    onStage?: (stage: ConversionStage) => void;
    onProgress?: (progress: OcrProgress) => void;
    onDetail?: (detail: string | null) => void;
  } = {},
): Promise<PdfToWordResult> {
  handlers.onStage?.("split");

  if (payload.format === "docx") {
    const { runDocumentIntelligence } = await import("./docintel/engine");
    const result = await runDocumentIntelligence({
      items,
      baseName: payload.file_name.replace(/\.(docx?|pdf)$/i, "") || "untitled",
      options: {
        ocrEnabled: payload.ocr_enabled,
        preserveLayout: payload.preserve_layout,
        languagePack: payload.language_pack,
        ...(payload.ocr_language
          ? { ocrLanguage: OCR_LANGUAGE_CODES[payload.ocr_language] }
          : {}),
      },
      onProgress: (job) => {
        const stage = STAGE_FOR_STATE[job.state];
        if (stage) handlers.onStage?.(stage);
        handlers.onDetail?.(job.detail ? `${job.label} — ${job.detail}` : job.label);
        if (job.page && job.totalPages) {
          handlers.onProgress?.({
            page: job.page,
            total: job.totalPages,
            status: job.detail ?? job.label,
            progress: job.progress,
          });
        }
      },
    });

    return {
      ok: true,
      filename: result.filename,
      download_url: URL.createObjectURL(result.blob),
      size: result.blob.size,
      payload,
      quality: result.report,
    };
  }

  const { blob, filename } = await convertPdfPagesToWord(
    items,
    payload.file_name,
    payload.format,
    payload.margins,
    "image",
    (progress) => {
      handlers.onStage?.("export");
      handlers.onProgress?.(progress);
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
