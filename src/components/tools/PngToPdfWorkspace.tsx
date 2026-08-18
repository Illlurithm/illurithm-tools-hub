import { useState } from "react";
import { Fragment } from "react";
import { Check, Pencil, Plus, RotateCw, Trash2 } from "lucide-react";

import {
  imageKindMeta,
  readImageFiles,
  updatePngItems,
  usePngState,
  type ImageKind,
  type PngItem,
} from "@/lib/png-to-pdf-store";
import { FileSourceMenu } from "@/components/tools/FileSourceMenu";
import { toast } from "sonner";

export function PngToPdfWorkspace({
  pageId,
  preview = false,
  kind = "png",
}: {
  pageId: string;
  preview?: boolean;
  kind?: ImageKind;
}) {
  const meta = imageKindMeta(kind);
  const state = usePngState(pageId);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const addFiles = async (files: File[], at: number | null) => {
    try {
      const items = await readImageFiles(files, kind);
      if (items.length === 0) {
        toast.error(`Only ${meta.label} files are supported.`);
        return;
      }
      updatePngItems(pageId, (prev) =>
        at == null ? [...prev, ...items] : [...prev.slice(0, at), ...items, ...prev.slice(at)],
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the files.");
    }
  };

  const move = (from: number, to: number) => {
    updatePngItems(pageId, (prev) => {
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
        <FileSourceMenu accept={meta.accept} onFiles={(f) => addFiles(f, null)}>
          <button
            type="button"
            disabled={preview}
            className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-10 py-10 text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_22px_var(--primary)]"
          >
            <Plus className="h-7 w-7" />
            <span className="text-sm font-semibold">Add {meta.label} files</span>
            <span className="max-w-xs text-center text-xs text-muted-foreground/70">
              Upload as many {meta.label} files as you like — each selected file becomes a page of the
              converted PDF, in the order shown here.
            </span>
          </button>
        </FileSourceMenu>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-5">
      <div className="flex flex-wrap items-stretch gap-y-6">
        {state.items.map((item, i) => (
          <Fragment key={item.id}>
            <Adder
              highlight={overIndex === i}
              accept={meta.accept}
              label={meta.label}
              onFiles={(f) => addFiles(f, i)}
              onDragOver={() => setOverIndex(i)}
              onDrop={() => {
                if (dragIndex != null) move(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
            />
            <PngCard
              item={item}
              index={i + 1}
              dragging={dragIndex === i}
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onToggle={() =>
                updatePngItems(pageId, (prev) =>
                  prev.map((p) => (p.id === item.id ? { ...p, selected: !p.selected } : p)),
                )
              }
              onRename={(name) =>
                updatePngItems(pageId, (prev) =>
                  prev.map((p) => (p.id === item.id ? { ...p, name: name.trim() || p.name } : p)),
                )
              }
              onRotate={() =>
                updatePngItems(pageId, (prev) =>
                  prev.map((p) =>
                    p.id === item.id ? { ...p, rotation: (p.rotation + 90) % 360 } : p,
                  ),
                )
              }
              onDelete={() =>
                updatePngItems(pageId, (prev) => prev.filter((p) => p.id !== item.id))
              }
            />
          </Fragment>
        ))}
        <Adder
          highlight={overIndex === state.items.length}
          accept={meta.accept}
          label={meta.label}
          onFiles={(f) => addFiles(f, null)}
          onDragOver={() => setOverIndex(state.items.length)}
          onDrop={() => {
            if (dragIndex != null) move(dragIndex, state.items.length);
            setDragIndex(null);
            setOverIndex(null);
          }}
        />
      </div>
    </div>
  );
}

function Adder({
  accept,
  label,
  onFiles,
  highlight,
  onDragOver,
  onDrop,
}: {
  accept: string;
  label: string;
  onFiles: (files: File[]) => void | Promise<void>;
  highlight: boolean;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      className="flex w-9 shrink-0 items-center justify-center self-stretch"
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <FileSourceMenu accept={accept} onFiles={onFiles}>
        <button
          type="button"
          aria-label={`Add ${label} here`}
          title={`Add ${label} here`}
          className={`grid h-7 w-7 place-items-center rounded-full border text-muted-foreground transition-all duration-200 hover:opacity-100 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_16px_var(--primary)] ${
            highlight
              ? "border-primary text-primary opacity-100 shadow-[0_0_16px_var(--primary)]"
              : "border-border/70 opacity-40"
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </FileSourceMenu>
    </div>
  );
}

function PngCard({
  item,
  index,
  dragging,
  onDragStart,
  onDragEnd,
  onToggle,
  onRename,
  onRotate,
  onDelete,
}: {
  item: PngItem;
  index: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
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
      className={`flex w-[220px] max-w-full cursor-grab flex-col gap-1.5 ${
        dragging ? "opacity-50" : ""
      }`}
    >
      <div
        onClick={onToggle}
        className={`relative aspect-[4/3] overflow-hidden rounded-2xl border bg-secondary/30 transition-all duration-200 ${
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
