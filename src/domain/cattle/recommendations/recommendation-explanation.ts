/**
 * Cattle C8 — deterministic explanation text (CAT-INV-017).
 *
 * The explanation is a fixed template rendered ONLY from structured fields of
 * the verified C0 evidence pack and the recommendation record built from it.
 * It adds nothing to them, makes no model / AI call and never introduces a
 * diagnosis, legal duty, treatment, source or calculation.
 */

import type { RecommendationEvidencePack } from "../evidence-pack";
import type { CandidateEffect, CandidateValue, RecommendationRecord } from "./recommendation-contracts";

export interface ExplanationFields {
  pack: Pick<RecommendationEvidencePack, "recommendationId" | "outcome" | "hardGateOutcomes" | "fingerprint">;
  recommendedAction: RecommendationRecord["recommendedAction"];
  effect: CandidateEffect | null;
  value: CandidateValue | null;
  missingContextParts: readonly string[];
}

export function renderRecommendationExplanation(f: ExplanationFields): string {
  const a = f.recommendedAction;
  const gates = f.pack.hardGateOutcomes.length === 0 ? "none" : f.pack.hardGateOutcomes.map((g) => `${g.ruleId}=${g.state}`).join(", ");
  const effect = f.effect === null ? "not evaluated" : `${f.effect.state}${f.effect.expectedEffect === null ? "" : ` (${f.effect.expectedEffect})`}`;
  // D2: a known value is never presented as validated prices.
  const value =
    f.value === null ? "not evaluated" : `${f.value.state}${f.value.amount === null ? "" : ` ${f.value.amount} ${f.value.currency} (approved value form over economic observations not independently validated)`}`;
  return [
    `Outcome: ${f.pack.outcome}.`,
    // D3: the priority tier is registry-declared, never presented as independently reviewed.
    a === null ? "No action proposed." : `Proposed action: ${a.actionKind} (${a.tier}, registry-declared priority) - ${a.description}.`,
    `Hard gates: ${gates}.`,
    `Expected effect: ${effect}.`,
    `Economic value: ${value}.`,
    `Missing context: ${f.missingContextParts.length === 0 ? "none" : f.missingContextParts.join(", ")}.`,
    `Evidence pack ${f.pack.recommendationId} (${f.pack.fingerprint.digest}).`,
  ].join(" ");
}
