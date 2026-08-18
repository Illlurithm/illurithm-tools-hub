import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { categories, type Tool } from "@/lib/tools-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type ToolPickerProps = {
  onSelect: (toolName: string) => void;
  onClose: () => void;
};

export function ToolPicker({ onSelect, onClose }: ToolPickerProps) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(categories[0]!.id);

  const q = query.trim().toLowerCase();
  const active = categories.find((c) => c.id === activeId) ?? categories[0]!;

  // Search spans every tool across all categories.
  const searchResults = useMemo(() => {
    if (!q) return null;
    return categories
      .map((c) => ({ label: c.label, tools: c.tools.filter((t) => t.name.toLowerCase().includes(q)) }))
      .filter((c) => c.tools.length > 0);
  }, [q]);

  const popular = active.tools.filter((t) => active.popular.includes(t.name));


  const handleSelect = (name: string) => {
    onSelect(name);
    onClose();
  };

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* LEFT: categories */}
      <aside className="w-52 shrink-0 overflow-y-auto rounded-2xl border border-border/60 bg-secondary/25 p-2">
        <ul className="space-y-0.5">
          {categories.map((c) => {
            const isActive = c.id === active.id && !q;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveId(c.id);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors ${
                    isActive
                      ? "bg-primary/15 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <c.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c.label}</span>
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums opacity-60">
                    {c.tools.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* RIGHT: search + tools */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all tools..."
            className="rounded-full border-border bg-background pl-9 text-sm"
            autoFocus
          />
          {query ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {searchResults ? (
            searchResults.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No tools match “{query}”.
              </p>
            ) : (
              <div className="space-y-6">
                {searchResults.map((c) => (
                  <ToolBlock key={c.label} title={c.label} tools={c.tools} onSelect={handleSelect} />
                ))}
              </div>
            )
          ) : (
            <div className="space-y-6">
              {popular.length > 0 ? (
                <ToolBlock title="Popular" tools={popular} onSelect={handleSelect} />
              ) : null}
              {active.subgroups.map((g) => (
                <ToolBlock key={g.label} title={g.label} tools={g.tools} onSelect={handleSelect} />
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function ToolBlock({
  title,
  tools,
  onSelect,
}: {
  title: string;
  tools: Tool[];
  onSelect: (name: string) => void;
}) {
  return (
    <div>
      <p className="sticky top-0 z-10 mb-2 bg-card/95 px-1 py-1 text-[10px] font-semibold tracking-[0.3em] text-muted-foreground">
        {title.toUpperCase()} · {tools.length}
      </p>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => onSelect(t.name)}
            className="truncate rounded-lg border border-transparent px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:[text-shadow:0_0_14px_var(--primary)]"
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
