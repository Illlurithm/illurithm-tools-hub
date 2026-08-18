import { useState } from "react";
import { ChevronDown, FileDown, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  imageKindMeta,
  readImageFiles,
  setPngState,
  updatePngItems,
  usePngState,
  type ImageKind,
  type PngFormat,
  type PngMargin,
  type PngOrientation,
} from "@/lib/png-to-pdf-store";
import { convertPngsToPdf } from "@/lib/png-to-pdf";
import { FileSourceMenu } from "@/components/tools/FileSourceMenu";

const FORMATS: PngFormat[] = ["Original", "A3", "A4", "A5", "US Legal", "US Letter"];
const ORIENTATIONS: PngOrientation[] = ["Auto Orientation", "Portrait", "Landscape"];
const MARGINS: PngMargin[] = ["No Margin", "Narrow", "Moderate", "Wide"];

export function PngToPdfSettings({
  pageId,
  kind = "png",
}: {
  pageId: string;
  kind?: ImageKind;
}) {
  const meta = imageKindMeta(kind);
  const state = usePngState(pageId);
  const [busy, setBusy] = useState(false);
  const selected = state.items.filter((i) => i.selected);

  const onFiles = async (files: File[]) => {
    try {
      const items = await readImageFiles(files, kind);
      if (items.length === 0) {
        toast.error(`Only ${meta.label} files are supported.`);
        return;
      }
      updatePngItems(pageId, (prev) => [...prev, ...items]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the files.");
    }
  };

  const convert = async () => {
    if (selected.length === 0) {
      toast.error(`Select at least one ${meta.label} file first.`);
      return;
    }
    setBusy(true);
    try {
      const blob = await convertPngsToPdf(selected, {
        format: state.format,
        orientation: state.orientation,
        margin: state.margin,
      });
      if (state.converted) URL.revokeObjectURL(state.converted.url);
      setPngState(pageId, {
        converted: { url: URL.createObjectURL(blob), size: blob.size },
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
          To download the converted {meta.label} to PDF file
        </p>
        <p className="text-sm text-muted-foreground">Go to Share → Click Download.</p>
        <button
          type="button"
          onClick={() => setPngState(pageId, { converted: null })}
          className="mt-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_14px_var(--primary)]"
        >
          Back to settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-wrap items-start gap-3 px-4 pb-3">
      <FileSourceMenu accept={meta.accept} onFiles={onFiles}>
        <button type="button" className={triggerClass}>
          <Upload className="h-4 w-4" />
          <span>Add {meta.label} file</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </FileSourceMenu>

      <Picker
        label="Format"
        value={state.format}
        options={FORMATS}
        onSelect={(v) => setPngState(pageId, { format: v as PngFormat, converted: null })}
      />
      <Picker
        label="Orientation"
        value={state.orientation}
        options={ORIENTATIONS}
        onSelect={(v) => setPngState(pageId, { orientation: v as PngOrientation, converted: null })}
      />
      <Picker
        label="Margins"
        value={state.margin}
        options={MARGINS}
        onSelect={(v) => setPngState(pageId, { margin: v as PngMargin, converted: null })}
      />

      <button
        type="button"
        onClick={convert}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:shadow-[0_0_20px_var(--primary)] disabled:opacity-60"
      >
        {busy ? "Converting…" : "Convert"}
      </button>

      <span className="ml-auto self-center text-xs text-muted-foreground/70">
        {selected.length} of {state.items.length} {meta.label} selected
      </span>
    </div>
  );
}

const triggerClass =
  "inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_16px_var(--primary)]";

function Picker({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={triggerClass}>
          <span className="text-muted-foreground">{label}:</span>
          <span>{value}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuItem key={o} onClick={() => onSelect(o)}>
            {o}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
