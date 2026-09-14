"use server";

/**
 * Fertiliser Vertical V1, Checkpoint 4 — the one server action for the
 * Scientific Evidence Report. Thin by design: all real assembly logic
 * lives in `buildScientificEvidenceReport`
 * (`src/orchestration/scientific-evidence-report/index.ts`); this file
 * only exposes it to the client, the same "actions are thin, orchestration
 * does the work" discipline every other action file in this programme
 * follows.
 */
import { buildScientificEvidenceReport, type ScientificEvidenceReport, type ScientificEvidenceReportError } from "@/orchestration/scientific-evidence-report";

export type { ScientificEvidenceReport, ScientificEvidenceReportError };

export async function getScientificEvidenceReportAction(jobSessionId: string): Promise<ScientificEvidenceReport | ScientificEvidenceReportError> {
  return buildScientificEvidenceReport(jobSessionId);
}
