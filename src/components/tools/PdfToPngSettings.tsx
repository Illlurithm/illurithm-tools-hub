import { useState } from "react";
import { ChevronDown, FileDown, Upload } from "lucide-react";
import { toast } from "sonner";

import { setPdfState, updatePdfItems, usePdfState } from "@/lib/pdf-to-png-store";
import { convertPdfPagesToPng, readPdfFiles } from "@/lib/pdf-to-png";
import { FileSourceMenu } from "@/components/tools/FileSourceMenu";

export function PdfToPngSettings({
  pageId,
  pageName,
  kind = "png",
}: {
  pageId: string;
  pageName: string;
  kind?: "png" | "jpg";
}) {
  const state = usePdfState(pageId);
  const [busy, setBusy] = useState(false);
  const selected = state.items.filter((i) => i.selected);
  const label = kind === "jpg" ? "JPG" : "PNG";


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
    try {
      const { blob, filename } = await convertPdfPagesToPng(state.items, pageName, kind);
      if (state.converted) URL.revokeObjectURL(state.converted.url);
      setPdfState(pageId, {
        converted: { url: URL.createObjectURL(blob), size: blob.size, filename },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setBusy(false);
    }
  };

  if (state.converted) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <FileDown className="h-6 w-6 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          To download the converted PDF to {label} file
        </p>
        <p className="text-sm text-muted-foreground">Go to Share → Click Download.</p>
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

      <button
        type="button"
        onClick={convert}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:shadow-[0_0_20px_var(--primary)] disabled:opacity-60"
      >
        {busy ? "Working…" : "Convert"}
      </button>

      <span className="ml-auto self-center text-xs text-muted-foreground/70">
        {selected.length} of {state.items.length} pages selected ·{" "}
        {selected.length > 1 ? "downloads as ZIP" : `downloads as ${label}`}
      </span>
    </div>
  );
}

const triggerClass =
  "inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_16px_var(--primary)]";
