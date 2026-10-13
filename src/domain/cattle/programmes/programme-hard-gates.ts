/**
 * Cattle C7 — programme actions declared as hard gates, in C0 evidence-pack
 * form (the C2 `projectObligationHardGates` shape).
 *
 * Only an action a VETERINARIAN programme declares with gate role
 * `HARD_GATE` is a gate (a farmer-intent action is never one — C0). For one
 * animal of a verified `ProgrammeStatusEvaluation`, each such action of every
 * programme governing `effectiveAt` — or of any version in a version
 * conflict — becomes one pack-compatible `RuleEvaluationRecord` with
 * requested rule id `CATTLE_PROGRAMME_ACTION:<programmeId>|<actionId>`, gate
 * role HARD_GATE, classification `VETERINARY_PROGRAMME`, and every id is
 * listed in `requiredHardGateRuleIds`, ready for C0
 * `buildRecommendationEvidencePack`. The record is an engine projection, not
 * a C0 rule evaluation (`rule`, `ruleFingerprint`, `implementation` are
 * `null`); its reason codes bind the animal-status fingerprint and its
 * reviews carry the programme's review dimensions.
 *
 * The action's own records and the programme-level record for the animal
 * (version conflict, review, membership) are folded to the most restrictive
 * pack state (FAIL > REVIEW_REQUIRED > UNSUPPORTED > conflicting evidence >
 * INSUFFICIENT_EVIDENCE > PASS > NOT_APPLICABLE — the order C2 folds in).
 * Mapping (engine convention, not veterinary content): COMPLETED → PASS;
 * NOT_APPLICABLE and UPCOMING (window not yet open, evidence resolved) →
 * NOT_APPLICABLE; OVERDUE and BLOCKED → FAIL; REVIEW_REQUIRED →
 * REVIEW_REQUIRED; EVIDENCE_CONFLICT → C0 conflicting evidence; DUE, UNKNOWN,
 * INSUFFICIENT_EVIDENCE and INVALID_EVIDENCE → INSUFFICIENT_EVIDENCE — never
 * an assumed pass. The evaluation is re-verified first; a mismatch fails
 * closed.
 */

import { deepFreezeAnimalValue } from "../animal-ledger";
import type { CattleEvaluationState, RuleEvaluationRecord } from "../evaluation";
import { compareStrings, sortedUnique, type CattleHash } from "../integrity";
import type { SourceVersionRef } from "../source";
import { compareSourceVersionRefs } from "../source";
import { CATTLE_EVIDENCE_ARCHITECTURE_VERSION } from "../version";
import { toCanonicalPlainData } from "../regulatory/canonical-input";
import { utcCalendarDateOf } from "../regulatory/obligation-time";
import { verifyProgrammeStatusEvaluation, type ProgrammeOccurrenceState, type ProgrammeStatusEvaluation } from "./programme-engine";

export const PROGRAMME_GATE_RULE_PREFIX = "CATTLE_PROGRAMME_ACTION:";

export function programmeGateRuleId(programmeId: string, actionId: string): string {
  return `${PROGRAMME_GATE_RULE_PREFIX}${programmeId}|${actionId}`;
}

export function programmeStateToPackState(state: ProgrammeOccurrenceState): CattleEvaluationState {
  switch (state) {
    case "COMPLETED":
      return "PASS";
    case "NOT_APPLICABLE":
    case "UPCOMING":
      return "NOT_APPLICABLE";
    case "OVERDUE":
    case "BLOCKED":
      return "FAIL";
    case "REVIEW_REQUIRED":
      return "REVIEW_REQUIRED";
    case "EVIDENCE_CONFLICT":
      return "CONFLICTING_EVIDENCE";
    case "DUE":
    case "UNKNOWN":
    case "INSUFFICIENT_EVIDENCE":
    case "INVALID_EVIDENCE":
      return "INSUFFICIENT_EVIDENCE";
  }
}

const RESTRICTIVENESS: readonly CattleEvaluationState[] = ["FAIL", "REVIEW_REQUIRED", "UNSUPPORTED", "CONFLICTING_EVIDENCE", "INSUFFICIENT_EVIDENCE", "PASS", "NOT_APPLICABLE"];

export interface ProgrammeHardGates {
  animalId: string;
  effectiveAt: string;
  knowledgeCutoff: string;
  evaluationDate: string;
  /** One per hard-gate programme action (sorted by rule id). */
  ruleEvaluations: RuleEvaluationRecord[];
  requiredHardGateRuleIds: string[];
  /** Programme document source versions of the gate programmes — pass as the pack's `additionalSourceRefs`. */
  sourceRefs: SourceVersionRef[];
}

export type ProgrammeHardGatesResult = { ok: true; gates: ProgrammeHardGates } | { ok: false; issues: string[] };

export function projectProgrammeHardGates(evaluation: ProgrammeStatusEvaluation, animalId: string, hash: CattleHash): ProgrammeHardGatesResult {
  const canonical = toCanonicalPlainData({ evaluation, animalId });
  if (!canonical.ok) return deepFreezeAnimalValue({ ok: false, issues: ["CATTLE_PROGRAMME_HARD_GATE_INPUT_NON_CANONICAL"] });
  const { evaluation: e, animalId: id } = canonical.value as { evaluation: ProgrammeStatusEvaluation; animalId: unknown };
  const verified = verifyProgrammeStatusEvaluation(e, hash);
  if (!verified.valid) return deepFreezeAnimalValue({ ok: false, issues: [`CATTLE_PROGRAMME_HARD_GATE_FINGERPRINT_MISMATCH:${verified.reasonCode}`] });
  if (typeof id !== "string" || !e.animalIds.includes(id)) return deepFreezeAnimalValue({ ok: false, issues: ["CATTLE_PROGRAMME_HARD_GATE_ANIMAL_NOT_EVALUATED"] });
  const evaluationDate = utcCalendarDateOf(e.effectiveAt);
  const ruleEvaluations: RuleEvaluationRecord[] = [];
  const sourceRefs: SourceVersionRef[] = [];
  for (const p of e.programmes) {
    const versions = p.versionState === "GOVERNING" && p.governing !== null ? [p.governing.version] : p.conflictingVersions;
    const gateActions = sortedUnique(versions.flatMap((v) => v.definition.actions.filter((a) => a.gateRole === "HARD_GATE").map((a) => a.actionId)));
    if (gateActions.length === 0) continue;
    for (const v of versions) if (v.definition.provenance.sourceDocument !== null) sourceRefs.push(v.definition.provenance.sourceDocument);
    const status = p.animals.find((a) => a.animalId === id);
    if (!status) return deepFreezeAnimalValue({ ok: false, issues: [`CATTLE_PROGRAMME_HARD_GATE_ANIMAL_STATUS_MISSING:${p.programmeId}`] });
    for (const actionId of gateActions) {
      const records = status.records.filter((r) => r.actionId === null || r.actionId === actionId);
      const states = records.map((r) => programmeStateToPackState(r.state));
      const state = RESTRICTIVENESS.find((s) => states.includes(s)) ?? "INSUFFICIENT_EVIDENCE";
      const ruleId = programmeGateRuleId(p.programmeId, actionId);
      ruleEvaluations.push({
        architectureVersion: CATTLE_EVIDENCE_ARCHITECTURE_VERSION,
        requestedRuleId: ruleId,
        rule: null,
        ruleFingerprint: null,
        implementation: null,
        classification: "VETERINARY_PROGRAMME",
        gateRole: "HARD_GATE",
        evaluationDate,
        state,
        reasonCodes: sortedUnique([
          ...records.map((r) => `CATTLE_PROGRAMME_STATE_${r.state}:${r.occurrence?.occurrenceId ?? r.actionId ?? p.programmeId}`),
          `CATTLE_PROGRAMME_ANIMAL_STATUS_FINGERPRINT:${status.fingerprint.digest}`,
        ]),
        usedInputs: [],
        missingInputs: state === "INSUFFICIENT_EVIDENCE" ? [`cattle.programme.${p.programmeId}.${actionId}`] : [],
        conflictingInputs: [],
        rejectedInputs: [],
        sourceChecks: [],
        reviews: (p.governing?.review.dimensions ?? []).map((d) => ({ dimension: d.dimension, state: d.state })),
      });
    }
  }
  ruleEvaluations.sort((a, b) => compareStrings(a.requestedRuleId, b.requestedRuleId));
  const uniqueRefs = sourceRefs.sort(compareSourceVersionRefs).filter((r, i, arr) => i === 0 || compareSourceVersionRefs(arr[i - 1], r) !== 0);
  const gates: ProgrammeHardGates = {
    animalId: id,
    effectiveAt: e.effectiveAt,
    knowledgeCutoff: e.knowledgeCutoff,
    evaluationDate,
    ruleEvaluations,
    requiredHardGateRuleIds: ruleEvaluations.map((r) => r.requestedRuleId),
    sourceRefs: uniqueRefs,
  };
  return deepFreezeAnimalValue({ ok: true, gates: structuredClone(gates) });
}
