/**
 * ProcessingOrchestrator — composes the document intelligence stages.
 *
 *   PDF pages → classify → extract (native / OCR / layout) → structure
 *             → Document IR → DOCX renderer → quality validation → DOCX
 *
 * Nothing here does document processing itself; the orchestrator only wires
 * stages together, reports job state and surfaces logs plus a quality report.
 */

import type { PdfPageItem } from "@/lib/pdf-to-png-store";
import { EngineLogger } from "./logging";
import { createContext, runStage, type EngineOptions } from "./pipeline";
import type { JobProgress, ProgressReporter } from "./job";
import { reportState } from "./job";
import { classifyStage } from "./stages/classify";
import { extractStage } from "./stages/extract";
import { structureStage } from "./stages/structure";
import { renderDocxStage } from "./stages/render-docx";
import { validateStage, type QualityReport } from "./stages/validate";
import type { DocumentIR } from "./ir";

export type EngineResult = {
  blob: Blob;
  filename: string;
  ir: DocumentIR;
  report: QualityReport;
  log: ReturnType<EngineLogger["all"]>;
};

export type EngineRequest = {
  items: PdfPageItem[];
  /** Output base name (without extension). */
  baseName: string;
  options: EngineOptions;
  onProgress?: ProgressReporter;
};

export type { EngineOptions, JobProgress };

export async function runDocumentIntelligence(request: EngineRequest): Promise<EngineResult> {
  const logger = new EngineLogger();
  const ctx = createContext(logger, request.options, request.onProgress);
  reportState(request.onProgress, "queued");

  try {
    const forensics = await runStage(
      forensicsStage,
      { items: request.items, fileName: request.baseName },
      ctx,
    );
    const analysis = await runStage(classifyStage, forensics, ctx);
    const extracted = await runStage(extractStage, analysis, ctx);
    const structured = await runStage(structureStage, extracted, ctx);
    const rendered = await runStage(renderDocxStage, structured, ctx);
    const validated = await runStage(validateStage, rendered, ctx);

    captureDebugArtifacts(validated.ir, logger);


    reportState(request.onProgress, "completed", { progress: 1 });
    return {
      blob: validated.blob,
      filename: `${request.baseName || "untitled"}.docx`,
      ir: validated.ir,
      report: validated.report,
      log: logger.all(),
    };
  } catch (error) {
    reportState(request.onProgress, "failed", {
      detail: error instanceof Error ? error.message : "Conversion failed.",
    });
    throw error;
  }
}
