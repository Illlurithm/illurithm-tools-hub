import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Eraser, CheckCircle2, AlertCircle, TreePine } from "lucide-react";

type ValidationState =
  | { status: "idle" }
  | { status: "valid"; parsed: unknown }
  | { status: "invalid"; message: string };

export function JsonFormatter() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<2 | 4 | "tab">(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [copied, setCopied] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({ status: "idle" });

  const format = useCallback(() => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      const space = indent === "tab" ? "\t" : indent;
      const result = sortKeys ? stringifySorted(parsed, space) : JSON.stringify(parsed, null, space);
      setInput(result);
      setValidation({ status: "valid", parsed });
    } catch (e) {
      setValidation({ status: "invalid", message: (e as Error).message });
    }
  }, [input, indent, sortKeys]);

  const minify = useCallback(() => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      setInput(JSON.stringify(parsed));
      setValidation({ status: "valid", parsed });
    } catch (e) {
      setValidation({ status: "invalid", message: (e as Error).message });
    }
  }, [input]);

  const validate = useCallback(() => {
    if (!input.trim()) {
      setValidation({ status: "idle" });
      return;
    }
    try {
      const parsed = JSON.parse(input);
      setValidation({ status: "valid", parsed });
    } catch (e) {
      setValidation({ status: "invalid", message: (e as Error).message });
    }
  }, [input]);

  const handleCopy = useCallback(async () => {
    if (!input) return;
    await navigator.clipboard.writeText(input);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [input]);

  const stats = useMemo(() => {
    if (!input.trim()) return null;
    try {
      const parsed = JSON.parse(input);
      return {
        valid: true,
        bytes: new Blob([input]).size,
        keys: countKeys(parsed),
        type: Array.isArray(parsed) ? "array" : typeof parsed === "object" ? "object" : "primitive",
      };
    } catch {
      return { valid: false, bytes: new Blob([input]).size, keys: 0, type: "invalid" };
    }
  }, [input]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">INPUT</p>
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
        placeholder='Paste JSON here, e.g. {"hello": "world"}'
        spellCheck={false}
        className="min-h-[220px] rounded-2xl border-border bg-card font-mono text-sm text-foreground placeholder:text-muted-foreground/60"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-1.5 py-1">
          {([2, 4] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setIndent(n)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                indent === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n} spaces
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIndent("tab")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              indent === "tab" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tab
          </button>
        </div>

        <button
          type="button"
          onClick={() => setSortKeys((v) => !v)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            sortKeys
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-card/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          Sort keys
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={minify} disabled={!input} className="rounded-full text-xs">
            Minify
          </Button>
          <Button type="button" size="sm" onClick={format} disabled={!input} className="rounded-full text-xs">
            Format
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={validate} disabled={!input} className="rounded-full text-xs">
            Validate
          </Button>
        </div>
      </div>

      {validation.status !== "idle" ? (
        <div
        className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${
          validation.status === "valid"
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-destructive/30 bg-destructive/10 text-destructive"
        }`}
        >
          {validation.status === "valid" ? (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Valid JSON</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-mono text-xs">{validation.message}</span>
            </>
          )}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-secondary/30 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">STATS</p>
          {stats?.valid ? (
            <span className="flex items-center gap-1 text-xs text-primary">
              <TreePine className="h-3.5 w-3.5" />
              {stats.type}
            </span>
          ) : stats?.type === "invalid" ? (
            <span className="text-xs text-destructive">invalid</span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-card p-3">
            <p className="font-display text-lg font-semibold text-foreground">{stats?.bytes ?? 0}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bytes</p>
          </div>
          <div className="rounded-xl bg-card p-3">
            <p className="font-display text-lg font-semibold text-foreground">{input.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Characters</p>
          </div>
          <div className="rounded-xl bg-card p-3">
            <p className="font-display text-lg font-semibold text-foreground">{stats?.keys ?? 0}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Keys</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function countKeys(value: unknown): number {
  if (value === null || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countKeys(item), 0);
  return Object.keys(value).reduce((sum, key) => sum + 1 + countKeys((value as Record<string, unknown>)[key]), 0);
}

function stringifySorted(value: unknown, space: string | number): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[\n" + value.map((item) => stringifySorted(item, space)).join(",\n") + "\n]";
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const indent = typeof space === "number" ? " ".repeat(space) : space;
  const inner = entries
    .map(([k, v]) => `${indent}${JSON.stringify(k)}: ${stringifySorted(v, space)}`)
    .join(",\n");
  return "{\n" + inner + "\n}";
}
