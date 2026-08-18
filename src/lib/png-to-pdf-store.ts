import { useSyncExternalStore } from "react";

export type PngFormat = "Original" | "A3" | "A4" | "A5" | "US Legal" | "US Letter";
export type PngOrientation = "Auto Orientation" | "Portrait" | "Landscape";
export type PngMargin = "No Margin" | "Narrow" | "Moderate" | "Wide";

export type PngItem = {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  rotation: number; // 0 | 90 | 180 | 270
  selected: boolean;
};

export type PngPageState = {
  items: PngItem[];
  format: PngFormat;
  orientation: PngOrientation;
  margin: PngMargin;
  converted: { url: string; size: number } | null;
  converting: boolean;
};

// Stable singleton: useSyncExternalStore requires a referentially stable
// snapshot, so the "no state yet" value must not be a fresh object each call.
const EMPTY_PNG_STATE: PngPageState = Object.freeze({
  items: Object.freeze([]) as unknown as PngItem[],
  format: "Original",
  orientation: "Auto Orientation",
  margin: "No Margin",
  converted: null,
  converting: false,
}) as PngPageState;

export const emptyPngState = (): PngPageState => EMPTY_PNG_STATE;

const store = new Map<string, PngPageState>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getPngState(pageId: string): PngPageState {
  return store.get(pageId) ?? emptyPngState();
}

export function setPngState(pageId: string, patch: Partial<PngPageState>) {
  const current = getPngState(pageId);
  store.set(pageId, { ...current, ...patch });
  emit();
}

export function updatePngItems(pageId: string, fn: (items: PngItem[]) => PngItem[]) {
  const current = getPngState(pageId);
  store.set(pageId, { ...current, items: fn(current.items), converted: null });
  emit();
}

export function clearPngState(pageId: string) {
  const s = store.get(pageId);
  if (s?.converted) URL.revokeObjectURL(s.converted.url);
  store.delete(pageId);
  emit();
}

export function hasUnsavedWork(pageIds?: string[]) {
  const ids = pageIds ?? Array.from(store.keys());
  return ids.some((id) => (store.get(id)?.items.length ?? 0) > 0);
}

export function usePngState(pageId: string): PngPageState {
  return useSyncExternalStore(
    subscribe,
    () => {
      void version;
      return getPngState(pageId);
    },
    emptyPngState,
  );
}

export function usePngVersion() {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

let seq = 0;
export const newItemId = () => `png${++seq}-${Date.now()}`;

export type ImageKind = "png" | "jpg";

const KIND = {
  png: { mimes: ["image/png"], ext: /\.png$/i, label: "PNG", accept: "image/png,.png" },
  jpg: {
    mimes: ["image/jpeg", "image/jpg"],
    ext: /\.(jpe?g)$/i,
    label: "JPG",
    accept: "image/jpeg,.jpg,.jpeg",
  },
} as const;

export const imageKindMeta = (kind: ImageKind) => KIND[kind];

export async function readImageFiles(
  files: FileList | File[],
  kind: ImageKind = "png",
): Promise<PngItem[]> {
  const meta = KIND[kind];
  const list = Array.from(files).filter(
    (f) => (meta.mimes as readonly string[]).includes(f.type) || meta.ext.test(f.name),
  );
  return Promise.all(
    list.map(
      (file) =>
        new Promise<PngItem>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
          reader.onload = () => {
            const dataUrl = String(reader.result);
            const img = new Image();
            img.onload = () =>
              resolve({
                id: newItemId(),
                name: file.name.replace(meta.ext, ""),
                dataUrl,
                width: img.naturalWidth,
                height: img.naturalHeight,
                rotation: 0,
                selected: true,
              });
            img.onerror = () => reject(new Error(`Could not decode ${file.name}`));
            img.src = dataUrl;
          };
          reader.readAsDataURL(file);
        }),
    ),
  );
}

export const readPngFiles = (files: FileList | File[]) => readImageFiles(files, "png");
