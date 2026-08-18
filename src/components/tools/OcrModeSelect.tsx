import { useRef, useState } from "react";
import { ChevronDown, Info } from "lucide-react";

import type { OcrMode } from "@/lib/pdf-to-word";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const triggerClass =
  "inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_16px_var(--primary)]";

export function OcrModeSelect({
  value,
  onChange,
  target,
}: {
  value: OcrMode;
  onChange: (mode: OcrMode) => void;
  /** e.g. "Word" or "PPTX" — used in the info tooltip copy. */
  target: string;
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

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={triggerClass}>
            <span>{value === "ocr" ? "OCR" : "NO OCR"}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onChange("ocr")}>OCR</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange("image")}>NO OCR</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <span
        ref={anchor}
        className="relative inline-flex h-9 items-center"
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
      >
        <span
          aria-hidden="true"
          className="grid h-5 w-5 cursor-default place-items-center rounded-full border border-border text-muted-foreground"
        >
          <Info className="h-3 w-3" />
        </span>
      </span>

      {tip ? (
        <span
          role="tooltip"
          style={{ left: tip.left, top: tip.top, width: 260 }}
          className="pointer-events-none fixed z-[100] -translate-y-full rounded-xl border border-border bg-card p-3 text-left text-[11px] leading-relaxed text-muted-foreground shadow-2xl"
        >
          <span className="block">
            <strong className="text-foreground">OCR:</strong> Recognizes English, Hindi, and Marathi
            text and rebuilds detected rules as editable {target} elements.
          </span>
          <span className="mt-1 block">
            <strong className="text-foreground">NO OCR:</strong> Preserves the original page
            appearance, but page contents are not individually editable.
          </span>
        </span>
      ) : null}
    </div>
  );
}

