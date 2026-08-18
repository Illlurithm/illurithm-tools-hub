import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Eraser } from "lucide-react";

const CASES = [
  { label: "Lowercase", transform: (s: string) => s.toLowerCase() },
  { label: "Uppercase", transform: (s: string) => s.toUpperCase() },
  { label: "Title Case", transform: titleCase },
  { label: "Sentence case", transform: sentenceCase },
  { label: "camelCase", transform: camelCase },
  { label: "PascalCase", transform: pascalCase },
  { label: "snake_case", transform: snakeCase },
  { label: "kebab-case", transform: kebabCase },
  { label: "Strip extra spaces", transform: (s: string) => s.replace(/\s+/g, " ").trim() },
];

function titleCase(s: string) {
  return s.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
}

function sentenceCase(s: string) {
  return s.toLowerCase().replace(/(^.)/, (a) => a.toUpperCase());
}

function camelCase(s: string) {
  return s
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^./, (a) => a.toLowerCase());
}

function pascalCase(s: string) {
  return s
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^./, (a) => a.toUpperCase());
}

function snakeCase(s: string) {
  return s
    .trim()
    .replace(/\s+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function kebabCase(s: string) {
  return s
    .trim()
    .replace(/\s+/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

export function TextCaseConverter() {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!input) return;
    await navigator.clipboard.writeText(input);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [input]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
          INPUT
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setInput("")}
            disabled={!input}
            className="h-7 gap-1.5 text-xs"
          >
            <Eraser className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!input}
            className="h-7 gap-1.5 text-xs"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste or type your text here..."
        className="min-h-[140px] rounded-2xl border-border bg-card text-foreground placeholder:text-muted-foreground/60"
      />

      <div className="flex flex-wrap gap-2">
        {CASES.map((c) => (
          <Button
            key={c.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setInput(c.transform(input))}
            disabled={!input}
            className="rounded-full text-xs"
          >
            {c.label}
          </Button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-secondary/30 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            STATS
          </p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-card p-3">
            <p className="font-display text-lg font-semibold text-foreground">{input.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Characters</p>
          </div>
          <div className="rounded-xl bg-card p-3">
            <p className="font-display text-lg font-semibold text-foreground">
              {input.trim() ? input.trim().split(/\s+/).length : 0}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Words</p>
          </div>
          <div className="rounded-xl bg-card p-3">
            <p className="font-display text-lg font-semibold text-foreground">
              {input.split(/\n/).length}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lines</p>
          </div>
        </div>
      </div>
    </div>
  );
}
