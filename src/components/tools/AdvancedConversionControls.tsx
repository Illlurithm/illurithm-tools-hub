import { useState } from "react";
import { ChevronDown, Info, SlidersHorizontal } from "lucide-react";

import { LANGUAGE_PACKS, type LanguagePack } from "@/lib/pdf-to-word-request";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AdvancedConversionControls({
  ocrEnabled,
  onOcrEnabledChange,
  preserveLayout,
  onPreserveLayoutChange,
  languagePack,
  onLanguagePackChange,
}: {
  ocrEnabled: boolean;
  onOcrEnabledChange: (value: boolean) => void;
  preserveLayout: boolean;
  onPreserveLayoutChange: (value: boolean) => void;
  languagePack: LanguagePack;
  onLanguagePackChange: (value: LanguagePack) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className="w-full rounded-2xl border border-border bg-card/60 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-xs font-semibold text-foreground"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
        <span>Advanced Conversion Controls</span>
        <ChevronDown
          className={`ml-auto h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-3">
            <Switch
              id="deep-ocr"
              checked={ocrEnabled}
              onCheckedChange={onOcrEnabledChange}
              aria-label="Enable Deep OCR Processing"
            />
            <label htmlFor="deep-ocr" className="cursor-pointer">
              <span className="block text-xs font-semibold text-foreground">
                Enable Deep OCR Processing
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Required for scanned documents, images, or non-selectable text
              </span>
            </label>
          </div>

          <div
            className={`space-y-3 rounded-xl border border-border/60 p-3 transition-opacity duration-200 ${
              ocrEnabled ? "opacity-100" : "pointer-events-none opacity-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <Checkbox
                id="preserve-layout"
                checked={preserveLayout}
                disabled={!ocrEnabled}
                onCheckedChange={(v) => onPreserveLayoutChange(v === true)}
              />
              <label
                htmlFor="preserve-layout"
                className="cursor-pointer text-xs font-medium text-foreground"
              >
                Preserve Complex Tables &amp; Form Layouts
              </label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    aria-label="Uses advanced layout models to reconstruct grids, boxes, and columns natively inside the Word file."
                    className="grid h-5 w-5 place-items-center rounded-full border border-border text-muted-foreground"
                  >
                    <Info className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                  Uses advanced layout models to reconstruct grids, boxes, and columns natively
                  inside the Word file.
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="space-y-1.5">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Language Optimization Pack
              </span>
              <Select
                value={languagePack}
                disabled={!ocrEnabled}
                onValueChange={(v) => onLanguagePackChange(v as LanguagePack)}
              >
                <SelectTrigger className="h-9 w-full max-w-md rounded-full text-xs">
                  <SelectValue placeholder="Select a language pack" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_PACKS.map((pack) => (
                    <SelectItem key={pack.value} value={pack.value} className="text-xs">
                      {pack.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
