/** Job/state model for a document intelligence conversion. */

export type JobState =
  | "queued"
  | "analyzing"
  | "extracting"
  | "ocr"
  | "layout_analysis"
  | "structure_analysis"
  | "reconstructing"
  | "generating_docx"
  | "validating"
  | "completed"
  | "failed";

export const JOB_STATE_LABELS: Record<JobState, string> = {
  queued: "Queued",
  analyzing: "Analyzing document",
  extracting: "Extracting native content",
  ocr: "Reading text (OCR)",
  layout_analysis: "Analyzing page layout",
  structure_analysis: "Reconstructing document structure",
  reconstructing: "Reconstructing tables and figures",
  generating_docx: "Generating Word document",
  validating: "Validating output quality",
  completed: "Completed",
  failed: "Failed",
};

export type JobProgress = {
  state: JobState;
  label: string;
  /** 0..1 overall progress. */
  progress: number;
  page?: number;
  totalPages?: number;
  detail?: string;
};

export type ProgressReporter = (progress: JobProgress) => void;

/** Ordered states used to derive a monotonic overall progress value. */
const ORDER: JobState[] = [
  "queued",
  "analyzing",
  "extracting",
  "ocr",
  "layout_analysis",
  "structure_analysis",
  "reconstructing",
  "generating_docx",
  "validating",
  "completed",
];

export function overallProgress(state: JobState, within = 0) {
  const index = Math.max(0, ORDER.indexOf(state));
  const span = 1 / (ORDER.length - 1);
  return Math.min(1, index * span + Math.min(1, Math.max(0, within)) * span);
}

export function reportState(
  report: ProgressReporter | undefined,
  state: JobState,
  extra: Partial<JobProgress> = {},
) {
  report?.({
    state,
    label: JOB_STATE_LABELS[state],
    progress: overallProgress(state, extra.progress ?? 0),
    ...extra,
  });
}
