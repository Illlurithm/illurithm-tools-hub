import { useState } from "react";
import { ChevronDown, FileDown, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { setPdfState, updatePdfItems, usePdfState } from "@/lib/pdf-to-png-store";
import { readPdfFiles } from "@/lib/pdf-to-png";
import {
  DEFAULT_WORD_MARGINS,
  type OcrProgress,
  type WordFormat,
  type WordMargins,
} from "@/lib/pdf-to-word";
import {
  buildPdfToWordPayload,
  CONVERSION_STAGES,
  submitPdfToWordConversion,
  type ConversionStage,
  type LanguagePack,
  type OcrLanguage,
} from "@/lib/pdf-to-word-request";
import { FileSourceMenu } from "@/components/tools/FileSourceMenu";
import { AdvancedConversionControls } from "@/components/tools/AdvancedConversionControls";
import { ConversionSteps } from "@/components/tools/ConversionSteps";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const FORMATS: WordFormat[] = ["docx", "doc"];

type MarginKey = keyof WordMargins;

const MARGIN_LABELS: Record<MarginKey, string> = {
  top: "Top Margin",
  bottom: "Bottom Margin",
  left: "Left Margin",
  right: "Right Margin",
};

export function PdfToWordSettings({ pageId, pageName }: { pageId: string; pageName: string }) {
  const state = usePdfState(pageId);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<WordFormat>("docx");
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [ocrLanguage] = useState<OcrLanguage>("en");
  const [preserveLayout, setPreserveLayout] = useState(true);
  const [languagePack, setLanguagePack] = useState<LanguagePack>("en");
  const [, setProgress] = useState<OcrProgress | null>(null);
  const [stage, setStage] = useState<ConversionStage | null>(null);
  const [stageDetail, setStageDetail] = useState<string | null>(null);
  const [margins, setMargins] = useState<WordMargins>(DEFAULT_WORD_MARGINS);
  const [marginKey, setMarginKey] = useState<MarginKey | null>(null);
  const selected = state.items.filter((i) => i.selected);

  const onFiles = async (files: File[]) => {
    setBusy(true);
    try {
      const items = await readPdfFiles(files);
      if (items.length === 0) {
        toast.error("Only PDF files are supported.");
        return;
      }
      updatePdfItems(pageId, (prev) => [...prev, ...items]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the PDF.");
    } finally {
      setBusy(false);
    }
  };

  const convert = async () => {
    if (selected.length === 0) {
      toast.error("Select at least one page first.");
      return;
    }
    setBusy(true);
    const payload = buildPdfToWordPayload({
      items: state.items,
      baseName: pageName,
      format: ocrEnabled ? "docx" : format,
      margins,
      ocrEnabled,
      preserveLayout,
      languagePack,
      ocrLanguage,
    });
    try {
      setStage("split");
      const result = await submitPdfToWordConversion(state.items, payload, {
        onStage: setStage,
        onProgress: setProgress,
        onDetail: setStageDetail,
      });

      if (state.converted) URL.revokeObjectURL(state.converted.url);
      setPdfState(pageId, {
        converted: {
          url: result.download_url,
          size: result.size,
          filename: result.filename,
        },
      });
      for (const warning of result.quality?.warnings ?? []) toast.warning(warning);
      toast.success(
        payload.ocr_enabled
          ? `Document reconstructed — ${result.filename} is ready to download.`
          : `Converted — ${result.filename} is ready to download.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setProgress(null);
      setStage(null);
      setStageDetail(null);
      setBusy(false);
    }
  };

  if (state.converted) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-4 text-center [color-scheme:light_dark]">
        <FileDown className="h-6 w-6 text-primary" />
        <p className="text-sm font-semibold leading-snug tracking-normal text-card-foreground">
          To download the converted PDF to WORD file
        </p>
        <p className="text-sm font-medium leading-snug text-muted-foreground">
          Go to Share → Click Download.
        </p>
        <button
          type="button"
          onClick={() => setPdfState(pageId, { converted: null })}
          className="mt-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_14px_var(--primary)]"
        >
          Back to settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-wrap items-start gap-3 px-4 pb-3">
      <FileSourceMenu accept="application/pdf" onFiles={onFiles}>
        <button type="button" className={triggerClass}>
          <Upload className="h-4 w-4" />
          <span>Add PDF</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </FileSourceMenu>

      <AdvancedConversionControls
        ocrEnabled={ocrEnabled}
        onOcrEnabledChange={setOcrEnabled}
        preserveLayout={preserveLayout}
        onPreserveLayoutChange={setPreserveLayout}
        languagePack={languagePack}
        onLanguagePackChange={setLanguagePack}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={triggerClass}>
            <span>Word Format: {(ocrEnabled ? "docx" : format).toUpperCase()}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {FORMATS.filter((f) => !ocrEnabled || f === "docx").map((f) => (
            <DropdownMenuItem key={f} onClick={() => setFormat(f)}>
              {f.toUpperCase()}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={triggerClass}>
            <span>{marginKey ? MARGIN_LABELS[marginKey].toUpperCase() : "Margins"}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(Object.keys(MARGIN_LABELS) as MarginKey[]).map((k) => (
            <DropdownMenuItem key={k} onClick={() => setMarginKey(k)}>
              {MARGIN_LABELS[k].toUpperCase()}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {marginKey ? (
        <input
          type="number"
          min={0}
          value={margins[marginKey]}
          onChange={(e) =>
            setMargins((prev) => ({
              ...prev,
              [marginKey]: Math.max(0, Number(e.target.value) || 0),
            }))
          }
          placeholder={`Enter ${MARGIN_LABELS[marginKey]}, in px`}
          aria-label={`Enter ${MARGIN_LABELS[marginKey]}, in px`}
          className="h-9 w-56 rounded-full border border-border bg-transparent px-4 text-xs text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/60 focus:border-primary/60 focus:shadow-[0_0_16px_var(--primary)]"
        />
      ) : null}

      <button
        type="button"
        onClick={convert}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:shadow-[0_0_20px_var(--primary)] disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>
              {stageDetail
                ? stageDetail
                : stage
                  ? (CONVERSION_STAGES.find((s) => s.id === stage)?.label ?? "Converting")
                  : ocrEnabled
                    ? "Starting document intelligence pipeline... Please wait."
                    : "Converting"}
            </span>
          </>
        ) : (
          "Convert"
        )}
      </button>

      {stage ? (
        <div className="w-full pt-1">
          <ConversionSteps stage={stage} />
        </div>
      ) : null}

      <span className="ml-auto self-center text-xs text-muted-foreground/70">
        {selected.length} of {state.items.length} pages selected · downloads as{" "}
        {format.toUpperCase()}
      </span>
    </div>
  );
}

const triggerClass =
  "inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_16px_var(--primary)]";
