import type { PdfPageItem } from "./pdf-to-png-store";

export type LayoutText = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  confidence: number;
};

export type LayoutRule = {
  kind: "line";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

export type DocumentPageLayout = {
  name: string;
  width: number;
  height: number;
  source: "native" | "tesseract" | "advanced";
  language: "latin" | "devanagari" | "mixed";
  texts: LayoutText[];
  rules: LayoutRule[];
};

export type OcrProgress = {
  page: number;
  total: number;
  status: string;
  progress: number;
};

export type LayoutRequest = {
  items: PdfPageItem[];
  onProgress?: (progress: OcrProgress) => void;
};

export const containsDevanagari = (value: string) => /[\u0900-\u097F]/.test(value);

export function officeFont(value: string, fallback = "Arial") {
  return containsDevanagari(value) ? "Nirmala UI" : fallback;
}