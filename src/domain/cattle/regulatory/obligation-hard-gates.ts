/**
 * Cattle C2 — hard-gate projection of an animal's obligation states.
 *
 * Exposes, for one animal at one (`effectiveAt`, `knowledgeCutoff`), every
 * obligation outcome downstream engines (C8) must respect: obligations whose
 * C0 rule is a HARD_GATE, and — fail closed — obligations whose gate role
 * could not be established (no rule resolved). ADVISORY obligations are not
 * hard gates and are excluded.
 *
 * Each entry keeps the exact obligation state, rule version, fingerprints and
 * counted evidence. For C0 `buildRecommendationEvidencePack`, the entries are
 * also folded into one pack-compatible `RuleEvaluationRecord` per requested
 * rule id (the pack rejects duplicate rule ids), with `requiredHardGateRuleIds`
 * listing every one so none can be omitted. Mapping (engine convention, not
 * law): SATISFIED / SATISFIED_LATE -> PASS; NOT_APPLICABLE -> NOT_APPLICABLE;
 * BLOCKED / OVERDUE -> FAIL; REVIEW_REQUIRED -> REVIEW_REQUIRED;
 * UNSUPPORTED -> UNSUPPORTED; EVIDENCE_CONFLICT -> C0's conflicting-evidence
 * state; every other state (UPCOMING, OUTSTANDING, NOT_TRIGGERED, UNKNOWN,
 * INSUFFICIENT_EVIDENCE, INVALID_EVIDENCE, ADVISORY_FAIL) ->
 * INSUFFICIENT_EVIDENCE — never an assumed pass. Several entries for one rule
 * fold to the most restrictive, in `RESTRICTIVENESS` order (FAIL first,
 * NOT_APPLICABLE last).
 *
 * Each record's fingerprint is re-verified first; a mismatched or foreign
 * record fails the projection closed.
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import type { FarmReturnAnimalId } from "../animal-ledger";
import { deepFreezeAnimalValue } from "../animal-ledger";
import type { CattleEvaluationState, RuleEvaluationRecord } from "../evaluation";
import { compareStrings, sortedUnique, type CattleHash } from "../integrity";
import type { CattleRuleClassification, CattleRuleGateRole, RuleVersionRef } from "../rule";
import { snapshotInput } from "./input-snapshot";
import { verifyObligationStateRecord, type AnimalObligationEvaluation, type ObligationState } from "./obligation-engine";

export interface ObligationHardGateEntry {
  obligationId: string;
  occurrenceId: string | null;
  state: ObligationState;
  packState: CattleEvaluationState;
  requestedRuleId: string;
  rule: RuleVersionRef | null;
  ruleFingerprint: AssessmentFingerprint | null;
  classification: CattleRuleClassification | null;
  gateRole: CattleRuleGateRole | null;
  countedEvidenceIds: string[];
  recordFingerprint: AssessmentFingerprint;
}

export interface ObligationHardGateProjection {
  animalId: FarmReturnAnimalId;
  effectiveAt: string;
  knowledgeCutoff: string;
  evaluationDate: string;
  /** Sorted by obligation id, then occurrence id. */
  entries: ObligationHardGateEntry[];
  /** One pack-compatible record per requested rule id, sorted. */
  ruleEvaluations: RuleEvaluationRecord[];
  /** Every rule id above — pass as the pack's `requiredHardGateRuleIds`. */
  requiredHardGateRuleIds: string[];
}

export type ObligationHardGateProjectionResult = { ok: true; projection: ObligationHardGateProjection } | { ok: false; issues: string[] };

export function obligationStateToPackState(state: ObligationState): CattleEvaluationState {
  switch (state) {
    case "SATISFIED":
    case "SATISFIED_LATE":
      return "PASS";
    case "NOT_APPLICABLE":
      return "NOT_APPLICABLE";
    case "BLOCKED":
    case "OVERDUE":
      return "FAIL";
    case "REVIEW_REQUIRED":
      return "REVIEW_REQUIRED";
    case "UNSUPPORTED":
      return "UNSUPPORTED";
    case "EVIDENCE_CONFLICT":
      return "CONFLICTING_EVIDENCE";
    default:
      return "INSUFFICIENT_EVIDENCE";
  }
}

const RESTRICTIVENESS: CattleEvaluationState[] = ["FAIL", "REVIEW_REQUIRED", "UNSUPPORTED", "CONFLICTING_EVIDENCE", "INSUFFICIENT_EVIDENCE", "PASS", "NOT_APPLICABLE"];

export function projectObligationHardGates(evaluation: AnimalObligationEvaluation, hash: CattleHash): ObligationHardGateProjectionResult {
  // Read once into a detached snapshot; never re-read the caller's object.
  const snap = snapshotInput(evaluation);
  if (snap.nonData) return { ok: false, issues: ["CATTLE_OBLIGATION_HARD_GATE_INPUT_NOT_CLONEABLE"] };
  const copy = structuredClone(snap.value) as AnimalObligationEvaluation;
  const issues: string[] = [];
  for (const record of copy.results) {
    if (record.animalId !== copy.animalId || record.effectiveAt !== copy.effectiveAt || record.knowledgeCutoff !== copy.knowledgeCutoff) {
      issues.push(`CATTLE_OBLIGATION_HARD_GATE_FOREIGN_RECORD:${record.obligationId}`);
    } else if (!verifyObligationStateRecord(record, hash).valid) {
      issues.push(`CATTLE_OBLIGATION_HARD_GATE_RECORD_FINGERPRINT_MISMATCH:${record.obligationId}`);
    }
  }
  if (issues.length > 0) return { ok: false, issues: sortedUnique(issues) };

  const gated = copy.results.filter((r) => r.gateRole !== "ADVISORY");
  const entries: ObligationHardGateEntry[] = gated
    .map((r) => ({
      obligationId: r.obligationId,
      occurrenceId: r.occurrence?.occurrenceId ?? null,
      state: r.state,
      packState: obligationStateToPackState(r.state),
      requestedRuleId: r.ruleEvaluation.requestedRuleId,
      rule: r.rule,
      ruleFingerprint: r.ruleFingerprint,
      classification: r.classification,
      gateRole: r.gateRole,
      countedEvidenceIds: r.evidence.countedEvidence.map((e) => e.evidenceId),
      recordFingerprint: r.fingerprint,
    }))
    .sort((a, b) => compareStrings(a.obligationId, b.obligationId) || compareStrings(a.occurrenceId ?? "", b.occurrenceId ?? ""));

  const byRule = new Map<string, { base: RuleEvaluationRecord; states: CattleEvaluationState[]; reasons: string[] }>();
  for (const r of gated) {
    const id = r.ruleEvaluation.requestedRuleId;
    const entry = byRule.get(id) ?? { base: r.ruleEvaluation, states: [], reasons: [] };
    entry.states.push(obligationStateToPackState(r.state));
    entry.reasons.push(`CATTLE_OBLIGATION_STATE_${r.state}:${r.occurrence?.occurrenceId ?? r.obligationId}`);
    byRule.set(id, entry);
  }
  const ruleEvaluations = [...byRule.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([, { base, states, reasons }]) => ({
      ...base,
      state: RESTRICTIVENESS.find((s) => states.includes(s)) as CattleEvaluationState,
      reasonCodes: sortedUnique([...base.reasonCodes, ...reasons]),
    }));
  const projection: ObligationHardGateProjection = {
    animalId: copy.animalId,
    effectiveAt: copy.effectiveAt,
    knowledgeCutoff: copy.knowledgeCutoff,
    evaluationDate: copy.evaluationDate,
    entries,
    ruleEvaluations,
    requiredHardGateRuleIds: ruleEvaluations.map((r) => r.requestedRuleId),
  };
  return { ok: true, projection: deepFreezeAnimalValue(projection) };
}
