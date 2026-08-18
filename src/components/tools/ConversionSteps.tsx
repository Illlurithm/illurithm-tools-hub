import { Check, Loader2 } from "lucide-react";

import { CONVERSION_STAGES, type ConversionStage } from "@/lib/pdf-to-word-request";

export function ConversionSteps({ stage }: { stage: ConversionStage }) {
  const activeIndex = CONVERSION_STAGES.findIndex((s) => s.id === stage);

  return (
    <ol className="flex w-full flex-col gap-2 text-[11px]">
      {CONVERSION_STAGES.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={`grid h-5 w-5 place-items-center rounded-full border transition-all duration-300 ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary shadow-[0_0_14px_var(--primary)]"
                    : "border-border text-muted-foreground"
              }`}
            >
              {done ? (
                <Check className="h-3 w-3" />
              ) : active ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                index + 1
              )}
            </span>
            <span className={active || done ? "text-foreground" : "text-muted-foreground/70"}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
