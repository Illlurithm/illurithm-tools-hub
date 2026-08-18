import { useRef, useState } from "react";
import { ChevronDown, Info } from "lucide-react";

import { OCR_LANGUAGES, type OcrLanguage } from "@/lib/pdf-to-word-request";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const triggerClass =
  "inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_16px_var(--primary)]";

export function OcrOptions({
  enabled,
  onEnabledChange,
  language,
  onLanguageChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  language: OcrLanguage;
  onLanguageChange: (language: OcrLanguage) => void;
}) {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 260;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    setTip({ left, top: rect.top - 6 });
  };

  const activeLabel = OCR_LANGUAGES.find((l) => l.value === language)?.label ?? "English";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--primary)]"
        />
        <span>Enable OCR (For Scanned PDFs)</span>
      </label>

      <span className="inline-flex h-6 items-center rounded-full border border-primary/50 bg-primary/10 px-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
        Recommended for scans
      </span>

      <span
        ref={anchor}
        className="relative inline-flex h-9 items-center"
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
      >
        <span
          aria-label="Recommended for images, photos, or scanned paper files."
          className="grid h-5 w-5 cursor-default place-items-center rounded-full border border-border text-muted-foreground"
        >
          <Info className="h-3 w-3" />
        </span>
      </span>

      {enabled ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={triggerClass}>
              <span>Document Language: {activeLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {OCR_LANGUAGES.map((l) => (
              <DropdownMenuItem key={l.value} onClick={() => onLanguageChange(l.value)}>
                {l.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {tip ? (
        <span
          role="tooltip"
          style={{ left: tip.left, top: tip.top, width: 260 }}
          className="pointer-events-none fixed z-[100] -translate-y-full rounded-xl border border-border bg-card p-3 text-left text-[11px] leading-relaxed text-muted-foreground shadow-2xl"
        >
          Recommended for images, photos, or scanned paper files.
        </span>
      ) : null}
    </div>
  );
}
