import { useState } from "react";
import { Check, FileText, Pencil, RotateCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { updatePdfItems, usePdfState, type PdfPageItem } from "@/lib/pdf-to-png-store";
import { readPdfFiles } from "@/lib/pdf-to-png";
import { FileSourceMenu } from "@/components/tools/FileSourceMenu";

const WORD_ACCEPT =
  ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function PdfToPngWorkspace({
  pageId,
  preview = false,
  source = "pdf",
}: {
  pageId: string;
  preview?: boolean;
  /** "word" makes this workspace accept DOC/DOCX (Word to PDF tool). */
  source?: "pdf" | "word";
}) {
  const state = usePdfState(pageId);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const isWord = source === "word";

  const addFiles = async (files: File[]) => {
    setBusy(true);
    try {
      const items = isWord
        ? await (await import("@/lib/word-to-pdf")).readWordFiles(files)
        : await readPdfFiles(files);
      if (items.length === 0) {
        toast.error(isWord ? "Only DOC and DOCX files are supported." : "Only PDF files are supported.");
        return;
      }
      updatePdfItems(pageId, (prev) => [...prev, ...items]);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : isWord ? "Could not read the Word file." : "Could not read the PDF.",
      );
    } finally {
      setBusy(false);
    }
  };

  const move = (from: number, to: number) => {
    updatePdfItems(pageId, (prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (!item) return prev;
      next.splice(to > from ? to - 1 : to, 0, item);
      return next;
    });
  };

  if (state.items.length === 0) {
    return (
      <div className="grid h-full min-h-[240px] w-full place-items-center p-8">
        <FileSourceMenu accept={isWord ? WORD_ACCEPT : "application/pdf"} onFiles={addFiles}>
          <button
            type="button"
            disabled={preview || busy}
            className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-10 py-10 text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_22px_var(--primary)]"
          >
            {busy ? <Upload className="h-7 w-7 animate-pulse" /> : <FileText className="h-7 w-7" />}
            <span className="text-sm font-semibold">
              {busy ? "Rendering pages…" : isWord ? "Add Word files (DOC/DOCX)" : "Add PDF files"}
            </span>
            <span className="max-w-xs text-center text-xs text-muted-foreground/70">
              {isWord
                ? "Every page of your Word document appears here as a selectable page. Selected pages download as a single PDF."
                : "Every page appears here as a selectable PNG. One selected page downloads as a PNG, several download as a ZIP."}
            </span>
          </button>
        </FileSourceMenu>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-5">
      <div className="flex flex-wrap gap-4">
        {state.items.map((item, i) => (
          <PdfCard
            key={item.id}
            item={item}
            index={i + 1}
            dragging={dragIndex === i}
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDropHere={() => {
              if (dragIndex != null) move(dragIndex, i);
              setDragIndex(null);
            }}
            onToggle={() =>
              updatePdfItems(pageId, (prev) =>
                prev.map((p) => (p.id === item.id ? { ...p, selected: !p.selected } : p)),
              )
            }
            onRename={(name) =>
              updatePdfItems(pageId, (prev) =>
                prev.map((p) => (p.id === item.id ? { ...p, name: name.trim() || p.name } : p)),
              )
            }
            onRotate={() =>
              updatePdfItems(pageId, (prev) =>
                prev.map((p) => (p.id === item.id ? { ...p, rotation: (p.rotation + 90) % 360 } : p)),
              )
            }
            onDelete={() => updatePdfItems(pageId, (prev) => prev.filter((p) => p.id !== item.id))}
          />
        ))}
      </div>
    </div>
  );
}

function PdfCard({
  item,
  index,
  dragging,
  onDragStart,
  onDragEnd,
  onDropHere,
  onToggle,
  onRename,
  onRotate,
  onDelete,
}: {
  item: PdfPageItem;
  index: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropHere: () => void;
  onToggle: () => void;
  onRename: (name: string) => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDropHere();
      }}
      className={`flex w-[220px] max-w-full cursor-grab flex-col gap-1.5 ${
        dragging ? "opacity-50" : ""
      }`}
    >
      <div
        onClick={onToggle}
        className={`relative aspect-[3/4] overflow-hidden rounded-2xl border bg-secondary/30 transition-all duration-200 ${
          item.selected
            ? "border-primary shadow-[0_0_18px_var(--primary)]"
            : "border-border opacity-60"
        }`}
      >
        <span className="absolute left-1.5 top-1.5 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-background/80 px-1.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur">
          {index}
        </span>
        <img
          src={item.dataUrl}
          alt={item.name}
          className="h-full w-full object-contain p-3 transition-transform duration-200"
          style={{ transform: `rotate(${item.rotation}deg)` }}
        />
        <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
          <IconBtn
            label={item.selected ? `Unselect ${item.name}` : `Select ${item.name}`}
            onClick={onToggle}
            active={item.selected}
          >
            <Check className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn label={`Rotate ${item.name}`} onClick={onRotate}>
            <RotateCw className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn label={`Delete ${item.name}`} onClick={onDelete} danger>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {editing ? (
          <input
            autoFocus
            defaultValue={item.name}
            onBlur={(e) => {
              onRename(e.target.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename((e.target as HTMLInputElement).value);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 flex-1 rounded-md bg-secondary/40 px-1.5 py-0.5 text-xs outline-none"
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
            title={item.name}
          >
            {item.name}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Rename ${item.name}`}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  danger,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`grid h-6 w-6 place-items-center rounded-full bg-background/80 backdrop-blur transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      } ${danger ? "hover:text-destructive" : "hover:text-primary"}`}
    >
      {children}
    </button>
  );
}
