/**
 * Cattle C3 — withdrawal hard gates in C0 evidence-pack form.
 *
 * Medicine withdrawal is a hard gate (CAMPAIGN.md, hard-gate principle): an
 * IN_WITHDRAWAL, UNKNOWN or conflicting food product must stop any downstream
 * sale/slaughter/milk-supply action, whatever its performance or economics.
 * Each gate entry of a verified `AnimalHealthProjection` becomes one
 * pack-compatible `RuleEvaluationRecord` (gate role HARD_GATE) with the
 * requested rule id `CATTLE_HEALTH_WITHDRAWAL:<foodProduct>`, and every id is
 * listed in `requiredHardGateRuleIds`, ready for C0
 * `buildRecommendationEvidencePack` (as C2 `projectObligationHardGates`).
 *
 * The record is an engine projection, not a C0 rule evaluation: `rule`,
 * `ruleFingerprint`, `implementation` and `classification` are `null`, and
 * the reason codes bind the gate fingerprint. Mapping (engine convention, not
 * law): CLEAR → PASS; IN_WITHDRAWAL → FAIL; UNKNOWN → INSUFFICIENT_EVIDENCE
 * (the food product's withdrawal is listed as a missing input);
 * EVIDENCE_CONFLICT → C0's conflicting-evidence state. The projection's
 * fingerprints are re-verified first; a mismatch fails closed.
 */

import type { CattleEvaluationState, RuleEvaluationRecord } from "../evaluation";
import { deepFreezeAnimalValue } from "../animal-ledger";
import { sortedUnique, type CattleHash } from "../integrity";
import type { SourceVersionRef } from "../source";
import { CATTLE_EVIDENCE_ARCHITECTURE_VERSION } from "../version";
import { toCanonicalPlainData } from "../regulatory/canonical-input";
import { utcCalendarDateOf } from "../regulatory/obligation-time";
import { verifyAnimalHealthProjection, type AnimalHealthProjection } from "./health-engine";
import type { WithdrawalGateState } from "./withdrawal";

export const WITHDRAWAL_GATE_RULE_PREFIX = "CATTLE_HEALTH_WITHDRAWAL:";

export function withdrawalGateRuleId(foodProduct: string): string {
  return `${WITHDRAWAL_GATE_RULE_PREFIX}${foodProduct}`;
}

export function withdrawalStateToPackState(state: WithdrawalGateState): CattleEvaluationState {
  switch (state) {
    case "CLEAR":
      return "PASS";
    case "IN_WITHDRAWAL":
      return "FAIL";
    case "EVIDENCE_CONFLICT":
      return "CONFLICTING_EVIDENCE";
    case "UNKNOWN":
      return "INSUFFICIENT_EVIDENCE";
  }
}

export interface WithdrawalHardGates {
  /** One per gated food product (sorted by food product). */
  ruleEvaluations: RuleEvaluationRecord[];
  requiredHardGateRuleIds: string[];
  /** Product source versions bound — pass as the pack's `additionalSourceRefs`. */
  sourceRefs: SourceVersionRef[];
}

export type WithdrawalHardGatesResult = { ok: true; gates: WithdrawalHardGates } | { ok: false; issues: string[] };

export function projectWithdrawalHardGates(projection: AnimalHealthProjection, hash: CattleHash): WithdrawalHardGatesResult {
  const canonical = toCanonicalPlainData(projection);
  if (!canonical.ok) return deepFreezeAnimalValue({ ok: false, issues: ["CATTLE_HEALTH_HARD_GATE_INPUT_NON_CANONICAL"] });
  const copy = canonical.value as AnimalHealthProjection;
  const verified = verifyAnimalHealthProjection(copy, hash);
  if (!verified.valid) return deepFreezeAnimalValue({ ok: false, issues: [`CATTLE_HEALTH_HARD_GATE_FINGERPRINT_MISMATCH:${verified.reasonCode}`] });
  const evaluationDate = utcCalendarDateOf(copy.effectiveAt);
  const gateDigest = copy.withdrawalGate.fingerprint.digest;
  const ruleEvaluations: RuleEvaluationRecord[] = copy.withdrawalGate.entries.map((entry) => ({
    architectureVersion: CATTLE_EVIDENCE_ARCHITECTURE_VERSION,
    requestedRuleId: withdrawalGateRuleId(entry.foodProduct),
    rule: null,
    ruleFingerprint: null,
    implementation: null,
    classification: null,
    gateRole: "HARD_GATE",
    evaluationDate,
    state: withdrawalStateToPackState(entry.state),
    reasonCodes: sortedUnique([...entry.reasonCodes, `CATTLE_HEALTH_WITHDRAWAL_${entry.state}`, `CATTLE_HEALTH_WITHDRAWAL_GATE_FINGERPRINT:${gateDigest}`]),
    usedInputs: [],
    missingInputs: entry.state === "UNKNOWN" ? [`cattle.health.withdrawal.${entry.foodProduct}`] : [],
    conflictingInputs: [],
    rejectedInputs: [],
    sourceChecks: [],
    reviews: [],
  }));
  const gates: WithdrawalHardGates = {
    ruleEvaluations,
    requiredHardGateRuleIds: ruleEvaluations.map((r) => r.requestedRuleId),
    sourceRefs: [...copy.sourceRefs],
  };
  return deepFreezeAnimalValue({ ok: true, gates: structuredClone(gates) });
}
