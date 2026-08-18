import { createServerFn } from "@tanstack/react-start";

/** ConvertAPI layout reconstruction modes for PDF -> DOCX. */
export type ConvertApiLayout = "flowing" | "continuous" | "exact" | "nocolumns";

export type ConvertApiInput = {
  /** Base64 (no data-url prefix) contents of the source PDF. */
  file_base64: string;
  file_name: string;
  layout: ConvertApiLayout;
  ocr_mode: "auto" | "force" | "never";
  /** ConvertAPI OCR language code, or "auto". */
  ocr_language: string;
  page_range?: string;
};

export type ConvertApiOutput = {
  file_name: string;
  file_base64: string;
  size: number;
  cost: number;
};

export const convertPdfToDocxViaConvertApi = createServerFn({ method: "POST" })
  .inputValidator((input: ConvertApiInput) => {
    if (!input?.file_base64) throw new Error("No PDF data was received.");
    if (input.file_base64.length > 40_000_000) {
      throw new Error("This PDF is too large to convert (max ~30 MB).");
    }
    return input;
  })
  .handler(async ({ data }): Promise<ConvertApiOutput> => {
    const secret = process.env["CONVERTAPI_SECRET"];
    if (!secret) {
      throw new Error("The conversion service is not configured yet (missing API secret).");
    }

    const baseName = data.file_name.replace(/\.(pdf|docx?)$/i, "") || "converted";

    const body = {
      Parameters: [
        { Name: "File", FileValue: { Name: `${baseName}.pdf`, Data: data.file_base64 } },
        { Name: "FileName", Value: baseName },
        { Name: "Layout", Value: data.layout },
        { Name: "OcrMode", Value: data.ocr_mode },
        { Name: "OcrLanguage", Value: data.ocr_language },
        { Name: "StoreFile", Value: false },
        { Name: "Timeout", Value: 600 },
        ...(data.page_range ? [{ Name: "PageRange", Value: data.page_range }] : []),
      ],
    };

    const response = await fetch("https://v2.convertapi.com/convert/pdf/to/docx", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 401) throw new Error("The conversion service rejected the API key.");
      if (response.status === 415) {
        throw new Error("The conversion service could not read this PDF.");
      }
      if (response.status === 503) {
        throw new Error("The conversion service is rate limited right now. Try again shortly.");
      }
      let message = "";
      try {
        message = (JSON.parse(detail) as { Message?: string }).Message ?? "";
      } catch {
        message = detail.slice(0, 200);
      }
      throw new Error(message || `Conversion failed with status ${response.status}.`);
    }

    const result = (await response.json()) as {
      ConversionCost?: number;
      Files?: { FileName?: string; FileSize?: number; FileData?: string }[];
    };
    const file = result.Files?.[0];
    if (!file?.FileData) throw new Error("The conversion service returned an empty document.");

    return {
      file_name: file.FileName || `${baseName}.docx`,
      file_base64: file.FileData,
      size: file.FileSize ?? 0,
      cost: result.ConversionCost ?? 0,
    };
  });
