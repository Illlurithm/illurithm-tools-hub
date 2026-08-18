/**
 * Stage contract for the document intelligence pipeline.
 *
 * Every processing step is an independent `Stage<In, Out>` with a defined input,
 * output, its own error handling and logging. The orchestrator composes stages;
 * no stage knows about the others, so any of them can be replaced later
 * (different OCR provider, different layout model, different renderer).
 */

import type { EngineLogger } from "./logging";
import type { JobState, ProgressReporter } from "./job";
import { reportState } from "./job";

export type EngineOptions = {
  /** Deep OCR requested by the user. */
  ocrEnabled: boolean;
  /** Reconstruct table/form grids instead of flowing text. */
  preserveLayout: boolean;
  /** UI language pack id, e.g. "en" | "en_hi_mr" | "en_es". */
  languagePack: string;
  /** Optional single-language OCR hint (tesseract code list). */
  ocrLanguage?: string;
};

export type StageContext = {
  logger: EngineLogger;
  options: EngineOptions;
  report: ProgressReporter | undefined;
  /** Reports a state transition from inside a stage. */
  setState: (state: JobState, extra?: { progress?: number; detail?: string; page?: number; totalPages?: number }) => void;
};

export type Stage<In, Out> = {
  name: string;
  state: JobState;
  run: (input: In, ctx: StageContext) => Promise<Out>;
};

export function createContext(
  logger: EngineLogger,
  options: EngineOptions,
  report?: ProgressReporter,
): StageContext {
  return {
    logger,
    options,
    report,
    setState: (state, extra = {}) => reportState(report, state, extra),
  };
}

/** Runs a stage with logging, state reporting and error wrapping. */
export async function runStage<In, Out>(
  stage: Stage<In, Out>,
  input: In,
  ctx: StageContext,
): Promise<Out> {
  ctx.setState(stage.state);
  return ctx.logger.time(stage.name, () => stage.run(input, ctx));
}

/** Runs `primary`, falling back to `fallback` on failure (never lose content). */
export async function withFallback<T>(
  ctx: StageContext,
  name: string,
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    ctx.logger.warn(name, "primary path failed, using fallback", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return fallback();
  }
}
