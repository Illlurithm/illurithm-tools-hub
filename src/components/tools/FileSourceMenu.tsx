import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, Cloud, HardDrive, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importRemoteFile } from "@/lib/remote-import.functions";

type Source = "dropbox" | "drive";

const HINTS: Record<Source, { title: string; hint: string }> = {
  dropbox: {
    title: "Import from Dropbox",
    hint: "Paste a Dropbox share link (…dropbox.com/s/… or /scl/fi/…). The link must be viewable by anyone.",
  },
  drive: {
    title: "Import from Google Drive",
    hint: "Paste a Google Drive share link (…drive.google.com/file/d/…). Set sharing to “Anyone with the link”.",
  },
};

export function FileSourceMenu({
  accept,
  multiple = true,
  onFiles,
  children,
  align = "start",
}: {
  /** e.g. "image/png" or "application/pdf" */
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
  children: ReactNode;
  align?: "start" | "end" | "center";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const fetchRemote = useServerFn(importRemoteFile);

  const importUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const file = await fetchRemote({ data: { url: url.trim() } });
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const isWord = accept.includes("word") || accept.includes("doc");
      const isJpg = accept.includes("jpeg") || accept.includes("jpg");
      const type = accept.includes("pdf") && !isWord
        ? "application/pdf"
        : isWord
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : isJpg
            ? "image/jpeg"
            : "image/png";
      const ext =
        accept.includes("pdf") && !isWord ? ".pdf" : isWord ? ".docx" : isJpg ? ".jpg" : ".png";
      const name = /\.[a-z0-9]{2,4}$/i.test(file.name) ? file.name : file.name + ext;
      await onFiles([new File([bytes], name, { type })]);
      setSource(null);
      setUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          if (list.length) void onFiles(list);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          <DropdownMenuItem onClick={() => inputRef.current?.click()}>
            <HardDrive className="mr-2 h-4 w-4" /> From Local Storage
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSource("dropbox")}>
            <Cloud className="mr-2 h-4 w-4" /> From Dropbox
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSource("drive")}>
            <Cloud className="mr-2 h-4 w-4" /> From Google Drive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={source != null} onOpenChange={(o) => !o && setSource(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {source ? HINTS[source].title : ""}
            </DialogTitle>
            <DialogDescription>{source ? HINTS[source].hint : ""}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-full border border-border px-3">
            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void importUrl()}
              placeholder="https://…"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setSource(null)}
              className="inline-flex h-9 items-center rounded-full border border-border px-5 text-xs font-semibold transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_14px_var(--primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void importUrl()}
              className="inline-flex h-9 items-center rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:shadow-[0_0_18px_var(--primary)] disabled:opacity-60"
            >
              {busy ? "Importing…" : "Import"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const fileSourceTriggerClass =
  "inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_16px_var(--primary)]";

export const ChevronIcon = () => <ChevronDown className="h-3.5 w-3.5 opacity-60" />;
