/**
 * Cattle C8 — deterministic, evidence-first recommendation engine.
 *
 * `recommendCattle(request, hash, trusted)` answers, for every animal in
 * scope: which registered action most likely improves return next, subject
 * to hard regulatory / welfare / health / evidence constraints — and may
 * validly answer NO_RECOMMENDATION, INSUFFICIENT_EVIDENCE, REVIEW_REQUIRED or
 * BLOCKED. It reads no clock, calls no model, network or AI, and embeds no
 * price, cost, probability, effect or ranking weight.
 *
 * Pipeline (each stage pure; every stage reads ONLY the sealed context):
 * 0. context — `buildEvaluationContexts` (the one construction boundary);
 * 1. hard gates — per candidate, its prerequisite C2 / C3 / C7 gates and its
 *    required context parts; anything not PASS / NOT_APPLICABLE, or absent,
 *    makes the candidate non-actionable;
 * 2. eligibility — trigger (closed vocabulary) and goal types;
 * 3. candidates — triggered/eligible or unresolved actions;
 * 4. effect — only for gate-clear candidates, only via a registered model;
 * 5. value — only for gate-clear candidates, only via a registered economic
 *    model over bound observations;
 * 6. ranking — total, stable, documented;
 * 7. evidence pack — C0 `buildRecommendationEvidencePack` (reused, never
 *    forked) then `verifyRecommendationEvidencePack`;
 * 8. recommendation record and deterministic explanation;
 * 9. herd ordering.
 *
 * STATUS / EVIDENCE PRECEDENCE (C8's own list; ARCHITECTURE.md §Status and
 * evidence precedence, CAT-INV-009). Per candidate, first match decides:
 *   a. a REQUIRED context part not supplied (trigger, eligibility, evidence
 *      requirement or prerequisite gate source) ⇒ unresolved: the candidate
 *      carries a NOT_EVALUATED required gate `CATTLE_RECOMMENDATION_REQUIRES:<PART>`
 *      (C0 ⇒ INSUFFICIENT_EVIDENCE when proposed);
 *   a'. a trigger whose predecessor states are themselves unresolved (C2
 *      UNKNOWN / INSUFFICIENT_EVIDENCE / EVIDENCE_CONFLICT / INVALID_EVIDENCE /
 *      UNSUPPORTED / REVIEW_REQUIRED, C3 UNKNOWN / EVIDENCE_CONFLICT, the C7
 *      unresolved occurrence states, C6 INVALID / INTENT_CONFLICT) and not met
 *      by any resolved state ⇒ `CATTLE_RECOMMENDATION_TRIGGER_UNRESOLVED:<KIND>_<STATE>`;
 *   b. goal applicability unresolved (C6 INVALID / INTENT_CONFLICT) for a
 *      goal-specific action ⇒ `CATTLE_RECOMMENDATION_GOAL_UNRESOLVED:<status>`
 *      (never "not eligible": not-applicable needs KNOWN goal state);
 *   c. trigger / eligibility resolved negative (KNOWN inputs) ⇒ not a candidate;
 *   d. any prerequisite gate FAIL / REVIEW_REQUIRED / UNSUPPORTED /
 *      conflicting / INSUFFICIENT_EVIDENCE / NOT_EVALUATED ⇒ NOT_CLEAR —
 *      effect and value are NOT evaluated (favourability never consulted);
 *   e. gates CLEAR ⇒ effect, then value; a negative effect model
 *      (EFFECT_NOT_SUPPORTED) makes the candidate non-selectable;
 *   f. ranking among selectable candidates.
 * The pack outcome is derived by C0 alone from the proposed action's
 * prerequisite gates, so unresolved required evidence never surfaces as
 * ACTIONABLE. Gate records sharing a rule id collapse only when identical;
 * differing ones fail closed (`CATTLE_RECOMMENDATION_GATE_IDENTITY_AMBIGUOUS`,
 * no first-match precedence — CAT-INV-026). Generated gates (a named gate
 * absent from every source, or an unresolved-evidence marker) share that
 * identity space: a generated id that is also a supplied gate, another
 * generated gate, or any rule record in the pack fails closed the same way.
 * As a final guard, a pack C0 derives as ACTIONABLE for a proposal that is
 * not selectable fails closed (`CATTLE_RECOMMENDATION_PACK_OUTCOME_INCONSISTENT`).
 *
 * SELECTION: the best-ranked selectable candidate is proposed. With none, the
 * best-ranked NOT_CLEAR candidate is proposed with its prerequisite gates in
 * the pack, so C0 derives BLOCKED / REVIEW_REQUIRED / INSUFFICIENT_EVIDENCE
 * (never ACTIONABLE). With neither, nothing is proposed: NO_RECOMMENDATION.
 * A gate-clear candidate whose effect model is negative is never proposed.
 *
 * RANKING (total, stable): selectable candidates first, ordered by system
 * priority tier (SAFETY_LEGAL_WELFARE → AVOID_MATERIAL_LOSS →
 * EXPECTED_NET_RETURN → VALUE_OF_INFORMATION), then within a tier KNOWN value
 * before VALUE_UNKNOWN (unknown is never zero and never best), KNOWN values
 * compared exactly (`money.ts`, same currency) and higher first, then stable
 * action identity; non-actionable candidates follow, ordered by tier then
 * identity only (their value is never consulted). Equal keys are ties broken
 * by action identity and recorded.
 */

import type { AssessmentFingerprint, FingerprintVerificationResult } from "../../assessment-integrity";
import { deepFreezeAnimalValue, compareInstants } from "../animal-ledger";
import { buildRecommendationEvidencePack, verifyRecommendationEvidencePack, type CandidateAction, type EvidencePackCalculationStep, type RecommendationEvidencePack, type RejectedAlternative } from "../evidence-pack";
import type { CattleInputItem } from "../information";
import { compareStrings, sameFingerprint, sortedUnique, type CattleHash } from "../integrity";
import { addObligationOffset, toCanonicalPlainData, type ObligationState } from "../regulatory";
import type { WithdrawalGateState } from "../health";
import type { LatestWeightState } from "../weights";
import type { GoalProjectionStatus } from "../goals";
import type { ProgrammeOccurrenceState } from "../programmes";
import { compareSourceVersionRefs, type SourceVersionRef } from "../source";
import { rawIdentityKey } from "../health/health-input";
import {
  GATE_SOURCE_PART,
  RECOMMENDATION_CONTEXT_PARTS,
  RECOMMENDATION_PRIORITY_TIERS,
  type CandidateActionDefinition,
  type RecommendationContextPart,
  type RecommendationGateSource,
  type RecommendationModelRef,
} from "./candidate-actions";
import { candidateValueOf, compareKnownValues, computeEconomicValuation, valuationInputItems, valuationSourceRefs, valuationStepInputs, type EconomicValuation } from "./economic-context";
import { buildEvaluationContexts, type RecommendationTrustedInputs } from "./evaluation-context";
import { CATTLE_RECOMMENDATION_PAYLOAD_VERSION, computeRecommendationFingerprint, verifyRecommendationFingerprint } from "./recommendation-integrity";
import {
  CANDIDATE_STEP_FORMULA,
  CONTEXT_PART_UNCERTAINTY,
  MODEL_STEP_FORMULA,
  PROPOSED_LABEL,
  VALUE_FORMULA,
  alternativeLabel,
  candidateStepDescription,
  deriveRecommendationRecord,
  modelStepDescription,
  valuationStepDescription,
} from "./recommendation-explanation";
import { computeRecommendationModelContentFingerprint, type ModelEvaluation, type RecommendationModelRecord } from "./recommendation-models";
import { EVIDENCE_PACK, exact, exactValid, type CarriedRuleEvaluation } from "./recommendation-exact";
import { storedRecommendationIssue } from "./recommendation-stored";
import type {
  CandidateEffect,
  CandidateEvaluation,
  CandidateGate,
  CandidateValue,
  CattleEvaluationContext,
  CattleRecommendation,
  CattleRecommendationOutcomeResult,
  CattleRecommendationResult,
  HerdOrderingEntry,
  NotCandidate,
  RankingTie,
  RecommendationIssue,
  RecommendationRecord,
} from "./recommendation-contracts";

export const CATTLE_RECOMMENDATION_ENGINE_VERSION = "cattle-recommendation-engine-v1";

const RANKING_FORMULA =
  "selectable first; tier SAFETY_LEGAL_WELFARE > AVOID_MATERIAL_LOSS > EXPECTED_NET_RETURN > VALUE_OF_INFORMATION; within a tier VALUE_KNOWN (exact, same currency, higher first) before VALUE_UNKNOWN; then action identity; non-actionable after, by tier then identity";
const GATE_FORMULA = "CLEAR iff every prerequisite gate is PASS or NOT_APPLICABLE and every required context part is supplied";
const GATE_CHECK_FORMULA =
  "one consulted prerequisite gate of a candidate: C0 state (or NOT_EVALUATED for a generated gate), its rule version, rule fingerprint, reasons and source checks; controls the C0 outcome only for the proposed action";
const EXCLUSION_FORMULA = "registered actions not considered: trigger or eligibility resolved negative over KNOWN predecessor states (reason codes per action kind)";

const ENGINE_LIMITATIONS = [
  "CATTLE_RECOMMENDATION_NO_EFFECT_MAGNITUDE_OR_PROBABILITY",
  "CATTLE_RECOMMENDATION_NO_CURRENCY_CONVERSION",
  "CATTLE_RECOMMENDATION_MODEL_RULES_RECEIVE_NO_ANIMAL_INPUTS",
  "CATTLE_RECOMMENDATION_EVIDENCE_COMPLETENESS_IS_ADAPTER_RESPONSIBILITY",
  // D2 / D3 (human decisions 2026-10-15): disclosed, never presented as independently validated.
  "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATIONS_NOT_INDEPENDENTLY_VALIDATED",
  "CATTLE_RECOMMENDATION_ECONOMIC_MODEL_APPROVAL_COVERS_VALUE_FORM_ONLY",
  "CATTLE_RECOMMENDATION_ACTION_PRIORITY_TIERS_REGISTRY_DECLARED_UNREVIEWED",
];

/** The pack input key binding each gate source's owner output (CAT-INV-021); `null` for generated gates. */
const OWNER_OUTPUT_INPUT: Readonly<Record<CandidateGate["source"], string | null>> = {
  C2_OBLIGATION: "cattle.recommendation.c2.obligationState",
  C3_WITHDRAWAL: "cattle.recommendation.c3.withdrawalGate",
  C7_PROGRAMME: "cattle.recommendation.c7.programmeStatus",
  CONTEXT: null,
  UNRESOLVED_EVIDENCE: null,
};

const tierIndex =(t: string) => (RECOMMENDATION_PRIORITY_TIERS as readonly string[]).indexOf(t);
const requires = (part: RecommendationContextPart) => `CATTLE_RECOMMENDATION_REQUIRES:${part}`;
const actionIdOf = (actionKind: string, animalId: string) => JSON.stringify([actionKind, "ANIMAL", animalId]);

function partSupplied(ctx: CattleEvaluationContext, part: RecommendationContextPart): boolean {
  const map: Record<RecommendationContextPart, { state: string }> = {
    OBLIGATIONS: ctx.obligations,
    HEALTH: ctx.health,
    WEIGHTS: ctx.weights,
    PERFORMANCE: ctx.performance,
    GOALS: ctx.goals,
    PROGRAMMES: ctx.programmes,
  };
  return map[part].state === "SUPPLIED";
}

// ---------------------------------------------------------------------------
// Stage 2 — trigger and eligibility (closed vocabulary; context only)
// ---------------------------------------------------------------------------

type Tri = { state: "YES" | "NO" | "UNRESOLVED"; reasons: string[] };

function triggerOf(d: CandidateActionDefinition, ctx: CattleEvaluationContext): Tri {
  const t = d.trigger;
  switch (t.kind) {
    case "UNCONDITIONAL":
      return { state: "YES", reasons: ["CATTLE_RECOMMENDATION_TRIGGER_UNCONDITIONAL"] };
    case "WEIGHT_MISSING_OR_STALE": {
      if (ctx.weights.state !== "SUPPLIED") return { state: "UNRESOLVED", reasons: [requires("WEIGHTS")] };
      const latest = ctx.weights.latest;
      // Every C4 latest-weight state is translated explicitly BEFORE staleness (audit F007 of 2026-10-16T170605Z):
      // conflicting or unsupported weight evidence stays UNRESOLVED — never a resolved NOT_MET or a stale YES.
      const meaning = WEIGHT_STATE_MEANING[latest.state as LatestWeightState];
      if (meaning === undefined || meaning === "UNRESOLVED") return { state: "UNRESOLVED", reasons: [`CATTLE_RECOMMENDATION_TRIGGER_UNRESOLVED:WEIGHT_${latest.state}`] };
      if (meaning === "ABSENT") return { state: "YES", reasons: ["CATTLE_RECOMMENDATION_TRIGGER_NO_WEIGHT_IN_VIEW"] };
      if (t.staleAfter !== null && latest.observedAt !== null) {
        const staleAt = addObligationOffset(latest.observedAt, t.staleAfter);
        if (staleAt === null) return { state: "UNRESOLVED", reasons: ["CATTLE_RECOMMENDATION_TRIGGER_STALENESS_UNREPRESENTABLE"] };
        if (compareInstants(staleAt, ctx.effectiveAt) <= 0) return { state: "YES", reasons: [`CATTLE_RECOMMENDATION_TRIGGER_WEIGHT_STALE:${latest.observedAt}`] };
      }
      return { state: "NO", reasons: [`CATTLE_RECOMMENDATION_TRIGGER_NOT_MET:WEIGHT_${latest.state}`] };
    }
    case "OBLIGATION_STATE": {
      if (ctx.obligations.state !== "SUPPLIED") return { state: "UNRESOLVED", reasons: [requires("OBLIGATIONS")] };
      const hits = ctx.obligations.records.filter((r) => (t.states as string[]).includes(r.state));
      if (hits.length > 0) return { state: "YES", reasons: hits.map((r) => `CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_${r.state}:${JSON.stringify([r.obligationId, r.occurrenceId])}`) };
      return notMet("OBLIGATION", ctx.obligations.records.map((r) => r.state), UNRESOLVED_OBLIGATION_STATES);
    }
    case "WITHDRAWAL_STATE": {
      if (ctx.health.state !== "SUPPLIED") return { state: "UNRESOLVED", reasons: [requires("HEALTH")] };
      const hits = ctx.health.withdrawal.filter((w) => (t.states as string[]).includes(w.state));
      if (hits.length > 0) return { state: "YES", reasons: hits.map((w) => `CATTLE_RECOMMENDATION_TRIGGER_WITHDRAWAL_${w.state}:${w.foodProduct}`) };
      return notMet("WITHDRAWAL", ctx.health.withdrawal.map((w) => w.state), UNRESOLVED_WITHDRAWAL_STATES);
    }
    case "PROGRAMME_ACTION_STATE": {
      if (ctx.programmes.state !== "SUPPLIED") return { state: "UNRESOLVED", reasons: [requires("PROGRAMMES")] };
      // Programme-level records (no action) can hide every action of the programme, so they are relevant to any action kind.
      const relevant = ctx.programmes.occurrences.filter(
        (o) => (t.classifications as string[]).includes(o.classification) && (t.actionKinds === null || o.actionKind === null || t.actionKinds.includes(o.actionKind)),
      );
      const hits = relevant.filter((o) => o.actionId !== null && o.actionKind !== null && (t.states as string[]).includes(o.state));
      if (hits.length > 0) return { state: "YES", reasons: hits.map((o) => `CATTLE_RECOMMENDATION_TRIGGER_PROGRAMME_${o.state}:${JSON.stringify([o.programmeId, o.actionId, o.occurrenceId])}`) };
      return notMet("PROGRAMME", relevant.map((o) => o.state), UNRESOLVED_PROGRAMME_STATES);
    }
    case "GOAL_STATUS": {
      if (ctx.goals.state !== "SUPPLIED") return { state: "UNRESOLVED", reasons: [requires("GOALS")] };
      if ((t.statuses as string[]).includes(ctx.goals.status)) return { state: "YES", reasons: [`CATTLE_RECOMMENDATION_TRIGGER_GOAL_STATUS_${ctx.goals.status}`] };
      return notMet("GOAL", [ctx.goals.status], UNRESOLVED_GOAL_STATUSES);
    }
  }
}

/*
 * Trigger resolution (CAT-INV-009): "not triggered" needs the trigger's
 * predecessor states to be RESOLVED. A predecessor state that is itself
 * unresolved (unknown, conflicting, invalid, unsupported, review-required)
 * could hide the condition, so the trigger is UNRESOLVED — the action stays a
 * non-actionable candidate (INSUFFICIENT_EVIDENCE when proposed), never a
 * silent NO_RECOMMENDATION. Exhaustive translation tables over the frozen
 * vocabularies; an unlisted state is treated as unresolved (fail closed).
 */
/** C4 latest-weight state → its meaning for a weight trigger (exhaustive: a new C4 state fails to compile). */
const WEIGHT_STATE_MEANING: Readonly<Record<LatestWeightState, "KNOWN" | "ABSENT" | "UNRESOLVED">> = {
  KNOWN: "KNOWN",
  NONE: "ABSENT",
  EVIDENCE_CONFLICT: "UNRESOLVED",
  UNSUPPORTED: "UNRESOLVED",
};

const UNRESOLVED_OBLIGATION_STATES: Readonly<Record<ObligationState, boolean>> = {
  NOT_APPLICABLE: false,
  UPCOMING: false,
  OUTSTANDING: false,
  SATISFIED: false,
  SATISFIED_LATE: false,
  OVERDUE: false,
  BLOCKED: false,
  ADVISORY_FAIL: false,
  NOT_TRIGGERED: false,
  UNKNOWN: true,
  INSUFFICIENT_EVIDENCE: true,
  EVIDENCE_CONFLICT: true,
  INVALID_EVIDENCE: true,
  UNSUPPORTED: true,
  REVIEW_REQUIRED: true,
};
const UNRESOLVED_WITHDRAWAL_STATES: Readonly<Record<WithdrawalGateState, boolean>> = { CLEAR: false, IN_WITHDRAWAL: false, UNKNOWN: true, EVIDENCE_CONFLICT: true };
const UNRESOLVED_PROGRAMME_STATES: Readonly<Record<ProgrammeOccurrenceState, boolean>> = {
  NOT_APPLICABLE: false,
  UPCOMING: false,
  DUE: false,
  COMPLETED: false,
  OVERDUE: false,
  BLOCKED: false,
  UNKNOWN: true,
  INSUFFICIENT_EVIDENCE: true,
  EVIDENCE_CONFLICT: true,
  REVIEW_REQUIRED: true,
  INVALID_EVIDENCE: true,
};
const UNRESOLVED_GOAL_STATUSES: Readonly<Record<GoalProjectionStatus, boolean>> = { ACTIVE: false, NONE: false, INTENT_CONFLICT: true, INVALID: true };

function notMet(kind: string, states: readonly string[], unresolvedTable: Readonly<Record<string, boolean>>): Tri {
  const unresolved = sortedUnique(states.filter((s) => unresolvedTable[s] !== false));
  if (unresolved.length > 0) return { state: "UNRESOLVED", reasons: unresolved.map((s) => `CATTLE_RECOMMENDATION_TRIGGER_UNRESOLVED:${kind}_${s}`) };
  return { state: "NO", reasons: [`CATTLE_RECOMMENDATION_TRIGGER_NOT_MET:${kind}`] };
}

function eligibilityOf(d: CandidateActionDefinition, ctx: CattleEvaluationContext): Tri {
  if (d.applicableGoalTypes === null) return { state: "YES", reasons: [] };
  if (ctx.goals.state !== "SUPPLIED") return { state: "UNRESOLVED", reasons: [requires("GOALS")] };
  const status = ctx.goals.status;
  if (status === "INVALID" || status === "INTENT_CONFLICT") return { state: "UNRESOLVED", reasons: [`CATTLE_RECOMMENDATION_GOAL_UNRESOLVED:${status}`] };
  const matched = ctx.goals.activeGoalTypes.filter((g) => (d.applicableGoalTypes as string[]).includes(g));
  return status === "ACTIVE" && matched.length > 0
    ? { state: "YES", reasons: matched.map((g) => `CATTLE_RECOMMENDATION_GOAL_TYPE_MATCHED:${g}`) }
    : { state: "NO", reasons: [`CATTLE_RECOMMENDATION_NOT_ELIGIBLE:GOAL_${status}`] };
}

// ---------------------------------------------------------------------------
// Stage 1 — prerequisite hard gates (context only)
// ---------------------------------------------------------------------------

interface GateFold {
  state: "CLEAR" | "NOT_CLEAR";
  checks: CandidateGate[];
  /** The consulted (validated, carried) records, sorted by rule id. */
  records: CarriedRuleEvaluation[];
  sourceRefs: SourceVersionRef[];
}

function gateRecords(ctx: CattleEvaluationContext, source: RecommendationGateSource): { gates: CarriedRuleEvaluation[]; sourceRefs: SourceVersionRef[] } | null {
  switch (source) {
    case "C2_OBLIGATION":
      return ctx.obligations.state === "SUPPLIED" ? { gates: ctx.obligations.gates, sourceRefs: [] } : null;
    case "C3_WITHDRAWAL":
      return ctx.health.state === "SUPPLIED" ? { gates: ctx.health.gates, sourceRefs: ctx.health.sourceRefs } : null;
    case "C7_PROGRAMME":
      return ctx.programmes.state === "SUPPLIED" ? { gates: ctx.programmes.gates, sourceRefs: ctx.programmes.sourceRefs } : null;
  }
}

const satisfied = (state: string) => state === "PASS" || state === "NOT_APPLICABLE";

/** Fixed source order: only labels a gate consulted identically from several sources; never chooses between differing records. */
const GATE_SOURCES = ["C2_OBLIGATION", "C3_WITHDRAWAL", "C7_PROGRAMME"] as const;

/**
 * Rule-evaluation identity (CAT-INV-026: no implicit precedence). Records
 * sharing a `requestedRuleId` collapse only when their content is identical;
 * differing records under one id are ambiguous and reported — never resolved
 * by first match or input order.
 */
function byRuleIdentity<T extends { record: CarriedRuleEvaluation }>(entries: readonly T[]): { unique: T[]; ambiguous: string[] } {
  const groups = new Map<string, T[]>();
  for (const e of entries) groups.set(e.record.requestedRuleId, [...(groups.get(e.record.requestedRuleId) ?? []), e]);
  const unique: T[] = [];
  const ambiguous: string[] = [];
  for (const [ruleId, group] of groups) {
    if (new Set(group.map((e) => rawIdentityKey(e.record))).size > 1) ambiguous.push(ruleId);
    else unique.push(group[0]);
  }
  return { unique, ambiguous: ambiguous.sort(compareStrings) };
}

/** A definition's named gates, each looked up in EVERY supplied source (never first match); `missing` = found in none. */
function namedGates(d: CandidateActionDefinition, ctx: CattleEvaluationContext): { consulted: { record: CarriedRuleEvaluation; source: RecommendationGateSource }[]; sourceRefs: SourceVersionRef[]; missing: string[] } {
  const consulted: { record: CarriedRuleEvaluation; source: RecommendationGateSource }[] = [];
  const sourceRefs: SourceVersionRef[] = [];
  const missing: string[] = [];
  for (const ruleId of d.prerequisites.gateRuleIds) {
    let found = false;
    for (const source of GATE_SOURCES) {
      const g = gateRecords(ctx, source);
      const hits = g === null ? [] : g.gates.filter((x) => x.requestedRuleId === ruleId);
      if (g === null || hits.length === 0) continue;
      for (const r of hits) consulted.push({ record: r, source });
      sourceRefs.push(...g.sourceRefs, ...hits.flatMap((r) => r.sourceChecks.map((c) => c.bound)));
      found = true;
    }
    if (!found) missing.push(ruleId);
  }
  return { consulted, sourceRefs, missing };
}

function foldGates(d: CandidateActionDefinition, ctx: CattleEvaluationContext, unresolved: readonly string[]): { ok: true; fold: GateFold } | { ok: false; ambiguous: string[] } {
  const consulted: { record: CarriedRuleEvaluation; source: RecommendationGateSource }[] = [];
  const sourceRefs: SourceVersionRef[] = [];
  const markers = new Set(unresolved);
  for (const source of d.prerequisites.sources) {
    const g = gateRecords(ctx, source);
    if (g === null) {
      markers.add(requires(GATE_SOURCE_PART[source]));
      continue;
    }
    for (const r of g.gates) consulted.push({ record: r, source });
    sourceRefs.push(...g.sourceRefs, ...g.gates.flatMap((r) => r.sourceChecks.map((c) => c.bound)));
  }
  const named = namedGates(d, ctx);
  consulted.push(...named.consulted);
  sourceRefs.push(...named.sourceRefs);
  const missingNamed = named.missing;
  // Identical copies from several sources are one gate, labelled by the fixed source order (input-order independent).
  consulted.sort((a, b) => GATE_SOURCES.indexOf(a.source) - GATE_SOURCES.indexOf(b.source));
  const { unique, ambiguous } = byRuleIdentity(consulted);
  if (ambiguous.length > 0) return { ok: false, ambiguous };
  const checks: CandidateGate[] = unique.map(({ record: r, source }) => ({ ruleId: r.requestedRuleId, state: r.state, source, satisfied: satisfied(r.state) }));
  for (const ruleId of missingNamed) if (!checks.some((c) => c.ruleId === ruleId)) checks.push({ ruleId, state: "NOT_EVALUATED", source: "CONTEXT", satisfied: false });
  for (const part of d.evidenceRequirements) if (!partSupplied(ctx, part)) markers.add(requires(part));
  for (const m of [...markers].sort(compareStrings)) checks.push({ ruleId: m, state: "NOT_EVALUATED", source: "UNRESOLVED_EVIDENCE", satisfied: false });
  // Generated gates share the identity space (CAT-INV-026): one id backing two checks is ambiguous, never resolved by C0's first match.
  const collided = sortedUnique(checks.map((c) => c.ruleId).filter((id, i, a) => a.indexOf(id) !== i));
  if (collided.length > 0) return { ok: false, ambiguous: collided };
  checks.sort((a, b) => compareStrings(a.ruleId, b.ruleId));
  const records = unique.map((e) => e.record).sort((a, b) => compareStrings(a.requestedRuleId, b.requestedRuleId));
  return { ok: true, fold: { state: checks.every((c) => c.satisfied) ? "CLEAR" : "NOT_CLEAR", checks, records, sourceRefs: uniqueRefs(sourceRefs) } };
}

const ambiguityIssues = (animalId: string, ruleIds: readonly string[]): RecommendationIssue[] =>
  ruleIds.map((ruleId) => ({ code: "CATTLE_RECOMMENDATION_GATE_IDENTITY_AMBIGUOUS", ref: `${animalId}:${ruleId}` }));

// ---------------------------------------------------------------------------
// Stages 4 / 5 — effect and value (registered models only)
// ---------------------------------------------------------------------------

function modelOf(ctx: CattleEvaluationContext, ref: RecommendationModelRef): ModelEvaluation {
  const found = ctx.modelEvaluations.find((m) => m.modelId === ref.modelId && m.version === ref.version);
  return found?.evaluation ?? { state: "UNAVAILABLE", reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_NOT_KNOWN:${JSON.stringify([ref.modelId, ref.version])}`] };
}

const NOT_EVALUATED_EFFECT: CandidateEffect = { state: "NOT_EVALUATED", model: null, expectedEffect: null, reasonCodes: ["CATTLE_RECOMMENDATION_NOT_EVALUATED_GATES_NOT_CLEAR"] };
const NOT_EVALUATED_VALUE: CandidateValue = { state: "NOT_EVALUATED", model: null, amount: null, currency: null, observationIds: [], reasonCodes: ["CATTLE_RECOMMENDATION_NOT_EVALUATED_GATES_NOT_CLEAR"] };

/** A consulted (EVALUATED) model and its carried C0 record — written to the pack as a model step. */
interface ConsultedModel {
  model: RecommendationModelRecord;
  record: CarriedRuleEvaluation;
}

function effectOf(d: CandidateActionDefinition, ctx: CattleEvaluationContext): { effect: CandidateEffect; record: CarriedRuleEvaluation | null; consulted: ConsultedModel | null } {
  const ref = d.effectModelRef;
  if (ref === null) return { effect: { state: "EFFECT_UNKNOWN", model: null, expectedEffect: null, reasonCodes: ["CATTLE_RECOMMENDATION_NO_EFFECT_MODEL"] }, record: null, consulted: null };
  const m = modelOf(ctx, ref);
  if (m.state === "UNAVAILABLE") return { effect: { state: "EFFECT_UNKNOWN", model: ref, expectedEffect: null, reasonCodes: m.reasonCodes }, record: null, consulted: null };
  if (m.model.role !== "EFFECT") return { effect: { state: "EFFECT_UNKNOWN", model: ref, expectedEffect: null, reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_ROLE_MISMATCH:${JSON.stringify([ref.modelId, ref.version])}`] }, record: null, consulted: null };
  const consulted = { model: m.model, record: m.ruleEvaluation };
  const s = m.ruleEvaluation.state;
  if (s === "PASS") return { effect: { state: "EFFECT_SUPPORTED", model: ref, expectedEffect: m.model.expectedEffect, reasonCodes: ["CATTLE_RECOMMENDATION_EFFECT_MODEL_PASS"] }, record: m.ruleEvaluation, consulted };
  if (s === "FAIL") return { effect: { state: "EFFECT_NOT_SUPPORTED", model: ref, expectedEffect: null, reasonCodes: ["CATTLE_RECOMMENDATION_EFFECT_MODEL_FAIL"] }, record: m.ruleEvaluation, consulted };
  return { effect: { state: "EFFECT_UNKNOWN", model: ref, expectedEffect: null, reasonCodes: [`CATTLE_RECOMMENDATION_EFFECT_MODEL_${s}`] }, record: m.ruleEvaluation, consulted };
}

function valueOf(d: CandidateActionDefinition, ctx: CattleEvaluationContext): { value: CandidateValue; record: CarriedRuleEvaluation | null; consulted: ConsultedModel | null; valuation: EconomicValuation | null } {
  const unknown = (model: RecommendationModelRef | null, reasonCodes: string[], consulted: ConsultedModel | null = null) => ({
    value: { state: "VALUE_UNKNOWN" as const, model, amount: null, currency: null, observationIds: [], reasonCodes },
    record: consulted?.record ?? null,
    consulted,
    valuation: null,
  });
  const ref = d.economicModelRef;
  if (ref === null) return unknown(null, ["CATTLE_RECOMMENDATION_NO_ECONOMIC_MODEL"]);
  const m = modelOf(ctx, ref);
  if (m.state === "UNAVAILABLE") return unknown(ref, m.reasonCodes);
  if (m.model.role !== "ECONOMIC" || m.model.value === null) return unknown(ref, [`CATTLE_RECOMMENDATION_MODEL_ROLE_MISMATCH:${JSON.stringify([ref.modelId, ref.version])}`]);
  const consulted = { model: m.model, record: m.ruleEvaluation };
  if (m.ruleEvaluation.state !== "PASS") return unknown(ref, [`CATTLE_RECOMMENDATION_ECONOMIC_MODEL_${m.ruleEvaluation.state}`], consulted);
  // The canonical valuation, from the context's canonical key evidence only; the candidate value is its projection.
  const valuation = computeEconomicValuation(ref, m.model.value, ctx.economics);
  return { value: candidateValueOf(valuation), record: m.ruleEvaluation, consulted, valuation };
}

// ---------------------------------------------------------------------------
// Stage 6 — ranking
// ---------------------------------------------------------------------------

interface Working {
  candidate: Omit<CandidateEvaluation, "rank">;
  gates: GateFold;
  modelRecords: CarriedRuleEvaluation[];
  valueRecord: CarriedRuleEvaluation | null;
  /** The models consulted for this candidate (written to the pack as model steps). */
  consultedModels: { role: "EFFECT" | "ECONOMIC"; consulted: ConsultedModel }[];
  /** The canonical valuation (an economic model PASSed and the gates are clear); `null` when none was attempted. */
  valuation: EconomicValuation | null;
  triggerReasons: string[];
}

/** Value order within a tier: KNOWN before UNKNOWN; KNOWN higher first (exact, same currency); `0` = equal key. */
function compareValue(a: CandidateValue, b: CandidateValue): number {
  const ak = a.state === "VALUE_KNOWN";
  const bk = b.state === "VALUE_KNOWN";
  if (ak !== bk) return ak ? -1 : 1;
  if (!ak) return 0;
  const c = compareKnownValues({ amount: a.amount as string, currency: a.currency as string }, { amount: b.amount as string, currency: b.currency as string });
  return c === null ? 0 : -c;
}

function rankKey(a: Working, b: Working): number {
  if (a.candidate.selectable !== b.candidate.selectable) return a.candidate.selectable ? -1 : 1;
  const tier = tierIndex(a.candidate.tier) - tierIndex(b.candidate.tier);
  if (tier !== 0) return tier;
  return a.candidate.selectable ? compareValue(a.candidate.value, b.candidate.value) : 0;
}

function rank(working: Working[]): { ranked: Working[]; ties: RankingTie[] } {
  const ranked = [...working].sort((a, b) => rankKey(a, b) || compareStrings(a.candidate.actionId, b.candidate.actionId));
  const ties: RankingTie[] = [];
  let group: Working[] = [];
  const flush = () => {
    if (group.length > 1) ties.push({ actionIds: group.map((w) => w.candidate.actionId), brokenBy: "ACTION_IDENTITY" });
    group = [];
  };
  for (const w of ranked) {
    if (group.length > 0 && rankKey(group[0], w) !== 0) flush();
    group.push(w);
  }
  flush();
  return { ranked, ties };
}

// ---------------------------------------------------------------------------
// Stages 7 / 8 — pack and record
// ---------------------------------------------------------------------------

function contextInputs(ctx: CattleEvaluationContext): CattleInputItem[] {
  const item = (inputKey: string, value: string, informationClass: CattleInputItem["informationClass"], ref: string): CattleInputItem => ({
    inputKey,
    value,
    unit: null,
    informationClass,
    provenance: { kind: "ENGINE_DERIVATION", ref, recordedAt: null },
  });
  const items: CattleInputItem[] = [item("cattle.recommendation.context.fingerprint", ctx.fingerprint.digest, "DERIVED_VALUE", "C8:CATTLE_RECOMMENDATION_CONTEXT")];
  items.push(item("cattle.recommendation.c1.snapshot", ctx.animal.snapshotFingerprint.digest, "FACT", "C1:projectAnimalSnapshot"));
  if (ctx.obligations.state === "SUPPLIED") for (const f of ctx.obligations.recordFingerprints) items.push(item("cattle.recommendation.c2.obligationState", f.digest, "OBLIGATION_OR_CONSTRAINT", "C2:evaluateHerdObligations"));
  if (ctx.health.state === "SUPPLIED") {
    items.push(item("cattle.recommendation.c3.timeline", ctx.health.timelineFingerprint.digest, "OBSERVATION", "C3:projectAnimalHealth"));
    items.push(item("cattle.recommendation.c3.medicineLedger", ctx.health.medicineLedgerFingerprint.digest, "FACT", "C3:projectAnimalHealth"));
    items.push(item("cattle.recommendation.c3.withdrawalGate", ctx.health.withdrawalGateFingerprint.digest, "OBLIGATION_OR_CONSTRAINT", "C3:projectAnimalHealth"));
  }
  if (ctx.weights.state === "SUPPLIED") items.push(item("cattle.recommendation.c4.weightSeries", ctx.weights.seriesFingerprint.digest, "OBSERVATION", "C4:buildWeightReadContract"));
  if (ctx.performance.state === "SUPPLIED") items.push(item("cattle.recommendation.c5.performance", ctx.performance.animalFingerprint.digest, "DERIVED_VALUE", "C5:evaluatePerformance"));
  if (ctx.goals.state === "SUPPLIED") {
    items.push(item("cattle.recommendation.c6.goalSnapshot", ctx.goals.snapshot.fingerprint.digest, "INTENT", "C6:projectProductionGoals"));
    items.push(item("cattle.recommendation.c6.routing", ctx.goals.routingFingerprint.digest, "INTENT", "C6:routeProductionGoals"));
    if (ctx.goals.targetApplicabilityFingerprint !== null) items.push(item("cattle.recommendation.c6.targetApplicability", ctx.goals.targetApplicabilityFingerprint.digest, "INTENT", "C6:resolveGoalTargetApplicability"));
  }
  if (ctx.programmes.state === "SUPPLIED") for (const f of ctx.programmes.animalStatusFingerprints) items.push(item("cattle.recommendation.c7.programmeStatus", f.digest, "OBLIGATION_OR_CONSTRAINT", "C7:evaluateHealthProgrammes"));
  return items;
}

function rejectionReasons(w: Working, proposed: Working | null): string[] {
  const reasons = w.gates.checks.filter((c) => !c.satisfied).map((c) => `CATTLE_RECOMMENDATION_GATE_${c.state}:${c.ruleId}`);
  if (w.candidate.effect.state === "EFFECT_NOT_SUPPORTED") reasons.push("CATTLE_RECOMMENDATION_EFFECT_NOT_SUPPORTED");
  if (reasons.length === 0 && proposed !== null) reasons.push(`CATTLE_RECOMMENDATION_RANKED_BELOW:${proposed.candidate.actionId}`);
  if (reasons.length === 0) reasons.push("CATTLE_RECOMMENDATION_NOT_SELECTED");
  return reasons;
}



/** A proposal's consulted models' rule assumptions / limitations, each tagged with its model identity. */
function modelNotes(w: Working | null, kind: "assumptions" | "limitations"): string[] {
  if (w === null) return [];
  const tag = kind === "assumptions" ? "CATTLE_RECOMMENDATION_MODEL_ASSUMPTION" : "CATTLE_RECOMMENDATION_MODEL_LIMITATION";
  return w.consultedModels.flatMap(({ consulted: { model } }) => model.rule[kind].map((note) => `${tag}:${JSON.stringify([model.modelId, model.version])}:${note}`));
}

function uniqueRefs(refs: SourceVersionRef[]): SourceVersionRef[] {
  return [...refs].sort(compareSourceVersionRefs).filter((r, i, a) => i === 0 || compareSourceVersionRefs(a[i - 1], r) !== 0);
}

/** Evaluates one sealed context. Reads nothing but `ctx`. Exported for the integrity replay only — never authoritative. */
export function recommendForContext(ctx: CattleEvaluationContext, hash: CattleHash): { ok: true; recommendation: CattleRecommendation } | { ok: false; issues: RecommendationIssue[] } {
  const missingContextParts = RECOMMENDATION_CONTEXT_PARTS.filter((p) => !partSupplied(ctx, p));
  const working: Working[] = [];
  const notCandidates: NotCandidate[] = [];
  for (const d of ctx.actions.definitions) {
    const trigger = triggerOf(d, ctx);
    const eligibility = eligibilityOf(d, ctx);
    // Precedence (a / a' / b before c; CAT-INV-009 / 022 — audit F007): a definition is excluded as "not a candidate"
    // only when NOTHING it requires is unresolved. Any required context part not supplied (evidence requirement or
    // prerequisite gate source) or any unresolved trigger / eligibility keeps it a non-actionable candidate, even when
    // the other of trigger / eligibility resolved negative — required evidence is resolved before exclusion. A named
    // prerequisite gate found in no supplied source is required evidence too (audit F007 of 2026-10-16T135236Z).
    const requiredMissing = [...d.evidenceRequirements, ...d.prerequisites.sources.map((s) => GATE_SOURCE_PART[s])].filter((part) => !partSupplied(ctx, part));
    const anyUnresolved = trigger.state === "UNRESOLVED" || eligibility.state === "UNRESOLVED" || requiredMissing.length > 0 || namedGates(d, ctx).missing.length > 0;
    if (!anyUnresolved && (trigger.state === "NO" || eligibility.state === "NO")) {
      notCandidates.push({ actionKind: d.actionKind, reasonCodes: sortedUnique([...(trigger.state === "NO" ? trigger.reasons : []), ...(eligibility.state === "NO" ? eligibility.reasons : [])]) });
      continue;
    }
    const unresolved = [...(trigger.state === "UNRESOLVED" ? trigger.reasons : []), ...(eligibility.state === "UNRESOLVED" ? eligibility.reasons : [])];
    const folded = foldGates(d, ctx, unresolved);
    if (!folded.ok) return { ok: false, issues: ambiguityIssues(ctx.animalId, folded.ambiguous) };
    const gates = folded.fold;
    const clear = gates.state === "CLEAR";
    const effect = clear ? effectOf(d, ctx) : { effect: NOT_EVALUATED_EFFECT, record: null, consulted: null };
    const value = clear ? valueOf(d, ctx) : { value: NOT_EVALUATED_VALUE, record: null, consulted: null, valuation: null };
    working.push({
      candidate: {
        actionId: actionIdOf(d.actionKind, ctx.animalId),
        actionKind: d.actionKind,
        description: d.description,
        tier: d.tier,
        benefitClaim: d.benefitClaim,
        trigger: { state: trigger.state === "YES" ? "TRIGGERED" : trigger.state === "NO" ? "NOT_MET" : "UNRESOLVED", reasonCodes: sortedUnique(trigger.reasons) },
        eligibility: { state: eligibility.state === "YES" ? "ELIGIBLE" : eligibility.state === "NO" ? "NOT_ELIGIBLE" : "UNRESOLVED", reasonCodes: sortedUnique(eligibility.reasons) },
        gates: { state: gates.state, checks: gates.checks },
        effect: effect.effect,
        value: value.value,
        selectable: clear && trigger.state === "YES" && eligibility.state === "YES" && effect.effect.state !== "EFFECT_NOT_SUPPORTED",
      },
      gates,
      modelRecords: [effect.record, value.record].filter((r): r is CarriedRuleEvaluation => r !== null),
      valueRecord: value.record,
      consultedModels: [
        ...(effect.consulted === null ? [] : [{ role: "EFFECT" as const, consulted: effect.consulted }]),
        ...(value.consulted === null ? [] : [{ role: "ECONOMIC" as const, consulted: value.consulted }]),
      ],
      valuation: value.valuation,
      triggerReasons: trigger.reasons,
    });
  }
  const { ranked, ties } = rank(working);
  const proposed = ranked.find((w) => w.candidate.selectable) ?? ranked.find((w) => w.gates.state === "NOT_CLEAR") ?? null;
  const candidates: CandidateEvaluation[] = ranked.map((w, i) => ({ ...w.candidate, rank: i + 1 }));

  // Pack content: only the proposed action's prerequisite gates decide C0's outcome (never another action's gates);
  // the ADVISORY model evaluations, observations, sources and calculation steps of EVERY candidate consulted for
  // ranking or rejection are included (CAT-INV-021) so the comparison that selected the proposal is reconstructable.
  const packRules = byRuleIdentity([...(proposed?.gates.records ?? []), ...ranked.flatMap((w) => w.modelRecords)].map((record) => ({ record })));
  if (packRules.ambiguous.length > 0) return { ok: false, issues: ambiguityIssues(ctx.animalId, packRules.ambiguous) };
  // A generated (record-less) required gate must stay record-less in the pack: any record under its id would decide it in C0.
  const generated = new Set((proposed?.gates.checks ?? []).filter((c) => c.source === "CONTEXT" || c.source === "UNRESOLVED_EVIDENCE").map((c) => c.ruleId));
  const shadowed = sortedUnique(packRules.unique.map((e) => e.record.requestedRuleId).filter((id) => generated.has(id)));
  if (shadowed.length > 0) return { ok: false, issues: ambiguityIssues(ctx.animalId, shadowed) };
  const steps: EvidencePackCalculationStep[] = [];
  const stepsFor = (w: Working, label: string) => {
    steps.push({
      sequence: steps.length + 1,
      description: `Prerequisite hard gates of the ${label}`,
      formula: GATE_FORMULA,
      inputs: Object.fromEntries(w.gates.checks.map((c) => [c.ruleId, c.state])),
      output: w.gates.state,
      unit: null,
      rounding: null,
      rule: null,
    });
    // Decision provenance (CAT-INV-021): EVERY consulted gate of EVERY candidate, as a non-controlling step — C0 derives
    // the outcome only from `ruleEvaluations` / `requiredHardGateRuleIds`, which hold the proposed action's gates alone.
    for (const c of w.gates.checks) {
      const record = w.gates.records.find((r) => r.requestedRuleId === c.ruleId) ?? null;
      const owner = OWNER_OUTPUT_INPUT[c.source];
      steps.push({
        sequence: steps.length + 1,
        description: `Prerequisite gate ${c.ruleId} of the ${label}`,
        formula: GATE_CHECK_FORMULA,
        inputs: {
          state: c.state,
          source: c.source,
          satisfied: c.satisfied,
          controlsPackOutcome: w === proposed,
          ...(owner === null ? {} : { ownerOutputInputKey: owner }),
          ...(record === null
            ? { record: "GENERATED_NOT_EVALUATED" }
            : {
                gateRole: record.gateRole ?? "NONE",
                classification: record.classification ?? "NONE",
                ruleFingerprint: record.ruleFingerprint?.digest ?? "NONE",
                reasonCodes: JSON.stringify(record.reasonCodes),
                sourceChecks: JSON.stringify(record.sourceChecks.map((s) => [s.bound.sourceId, s.bound.version, s.bound.contentFingerprint.digest, s.status])),
                reviews: JSON.stringify(record.reviews.map((r) => [r.dimension, r.state])),
              }),
        },
        output: c.state,
        unit: null,
        rounding: null,
        rule: record?.rule ?? null,
      });
    }
    // The candidate itself (F003: the pack is the single source of decision evidence — the record and the
    // explanation are derived from this step, never from a parallel path).
    const c = w.candidate;
    steps.push({
      sequence: steps.length + 1,
      description: candidateStepDescription(label),
      formula: CANDIDATE_STEP_FORMULA,
      inputs: {
        actionId: c.actionId,
        actionKind: c.actionKind,
        tier: c.tier,
        tierBasis: "REGISTRY_DECLARED_UNREVIEWED",
        benefitClaim: c.benefitClaim,
        trigger: JSON.stringify(c.trigger),
        eligibility: JSON.stringify(c.eligibility),
        gates: c.gates.state,
        selectable: c.selectable,
        effect: JSON.stringify(c.effect),
        value: JSON.stringify(c.value),
      },
      output: c.selectable,
      unit: null,
      rounding: null,
      rule: null,
    });
    // Every model consulted for the candidate: its statement / value form, assumptions and limitations (F003).
    for (const { role, consulted } of w.consultedModels) {
      const m = consulted.model;
      steps.push({
        sequence: steps.length + 1,
        description: modelStepDescription(role, m.modelId, m.version, label),
        formula: MODEL_STEP_FORMULA,
        inputs: {
          role,
          modelId: m.modelId,
          version: m.version,
          contentFingerprint: computeRecommendationModelContentFingerprint(m, hash).digest,
          expectedEffect: JSON.stringify(m.expectedEffect),
          valueForm: JSON.stringify(m.value),
          assumptions: JSON.stringify(m.rule.assumptions),
          limitations: JSON.stringify(m.rule.limitations),
          state: consulted.record.state,
        },
        output: consulted.record.state,
        unit: null,
        rounding: null,
        rule: consulted.record.rule,
      });
    }
    // The valuation step — one serializer of the canonical valuation and its keys' canonical evidence, in every state.
    const valuation = w.valuation;
    if (valuation !== null) {
      steps.push({
        sequence: steps.length + 1,
        description: valuationStepDescription(label),
        formula: VALUE_FORMULA,
        inputs: valuationStepInputs(valuation, ctx.economics),
        output: valuation.outcome.state === "VALUE_KNOWN" ? valuation.outcome.amount : valuation.outcome.state,
        unit: valuation.outcome.state === "VALUE_KNOWN" ? valuation.outcome.currency : null,
        rounding: null,
        rule: w.valueRecord?.rule ?? null,
      });
    }
  };
  if (proposed !== null) stepsFor(proposed, PROPOSED_LABEL);
  for (const w of ranked) if (w !== proposed) stepsFor(w, alternativeLabel(w.candidate.actionId));
  // Exclusions (CAT-INV-021): every registered action not considered, with its reasons.
  const excluded = [...notCandidates].sort((a, b) => compareStrings(a.actionKind, b.actionKind));
  steps.push({
    sequence: steps.length + 1,
    description: "Registered actions not considered",
    formula: EXCLUSION_FORMULA,
    inputs: Object.fromEntries(excluded.map((n) => [`excluded:${n.actionKind}`, JSON.stringify(n.reasonCodes)])),
    output: excluded.length,
    unit: null,
    rounding: null,
    rule: null,
  });
  // Ranking with each candidate's ranking basis and every recorded tie (tiers are registry-declared — D3).
  steps.push({
    sequence: steps.length + 1,
    description: "Deterministic ranking of candidate actions",
    formula: RANKING_FORMULA,
    inputs: Object.fromEntries([
      ...candidates.map((c) => [`rank:${String(c.rank).padStart(4, "0")}`, c.actionId] as const),
      ...candidates.map((c) => [`basis:${c.actionId}`, JSON.stringify({ selectable: c.selectable, tier: c.tier, tierBasis: "REGISTRY_DECLARED_UNREVIEWED", value: c.value.state, amount: c.value.amount, currency: c.value.currency })] as const),
      ...ties.map((tie, i) => [`tie:${String(i + 1).padStart(4, "0")}`, JSON.stringify({ actionIds: tie.actionIds, brokenBy: tie.brokenBy })] as const),
    ]),
    output: proposed?.candidate.actionId ?? null,
    unit: null,
    rounding: null,
    rule: null,
  });
  const goal = ctx.goals.state === "SUPPLIED" ? ctx.goals : null;
  // Pack economic inputs and sources: projections of every attempted valuation (observation ids are unique per request).
  const valuations = ranked.flatMap((w) => (w.valuation === null ? [] : [w.valuation]));
  const economicInputs = valuations.flatMap(valuationInputItems).filter((x, i, a) => a.findIndex((y) => y.provenance.ref === x.provenance.ref) === i);
  const unresolvedNotes: string[] = [];
  if (proposed !== null) {
    const { effect, value } = proposed.candidate;
    unresolvedNotes.push(...proposed.gates.checks.filter((c) => !c.satisfied).map((c) => `CATTLE_RECOMMENDATION_GATE_${c.state}:${c.ruleId}`));
    if (effect.state !== "EFFECT_SUPPORTED") unresolvedNotes.push(...effect.reasonCodes.map((r) => `${effect.state}:${r}`));
    if (value.state !== "VALUE_KNOWN") unresolvedNotes.push(...value.reasonCodes.map((r) => `${value.state}:${r}`));
  }
  const uncertainties = sortedUnique([...missingContextParts.map((p) => `${CONTEXT_PART_UNCERTAINTY}${p}`), ...unresolvedNotes]);
  const definition = proposed === null ? null : ctx.actions.definitions.find((d) => d.actionKind === proposed.candidate.actionKind) ?? null;
  const built = buildRecommendationEvidencePack(
    {
      recommendationId: `CATTLE_RECOMMENDATION:${ctx.fingerprint.digest}`,
      engineVersion: CATTLE_RECOMMENDATION_ENGINE_VERSION,
      rulesetVersion: JSON.stringify([ctx.actions.registryId, ctx.actions.version]),
      evaluationDate: ctx.evaluationDate,
      knownAt: ctx.knowledgeCutoff,
      // No clock is read: the instance timestamp is the knowledge cutoff the pack is as-of (excluded from the C0 fingerprint).
      generatedAt: ctx.knowledgeCutoff,
      targetScope: { kind: "ANIMAL", id: ctx.animalId, snapshotRef: `CATTLE_ANIMAL_SNAPSHOT:${ctx.animal.snapshotFingerprint.digest}` },
      intent: goal === null ? null : { intentId: `CATTLE_GOAL_SNAPSHOT:${goal.snapshot.fingerprint.digest}`, description: `C6 goal snapshot ${goal.status}: ${JSON.stringify(goal.snapshot.goals.map((g) => [g.goalId, g.version]))}` },
      inputs: [...contextInputs(ctx), ...economicInputs],
      ruleEvaluations: packRules.unique.map((e) => structuredClone(e.record)),
      requiredHardGateRuleIds: proposed === null ? [] : proposed.gates.checks.map((c) => c.ruleId),
      calculationSteps: steps,
      additionalSourceRefs: uniqueRefs([...ranked.flatMap((w) => w.gates.sourceRefs), ...valuations.flatMap(valuationSourceRefs)]),
      // The proposal's consulted models' assumptions and limitations travel with it (F003; never dropped).
      assumptions: [...(definition?.assumptions ?? []), ...modelNotes(proposed, "assumptions")],
      limitations: [...ENGINE_LIMITATIONS, ...(definition?.limitations ?? []), ...modelNotes(proposed, "limitations")],
      uncertainties,
      candidateActions: candidates.map(
        (c): CandidateAction => ({ actionId: c.actionId, description: c.description, favourability: c.value.state === "VALUE_KNOWN" ? `${c.value.amount} ${c.value.currency}` : null }),
      ),
      rejectedAlternatives: ranked.filter((w) => w !== proposed).map((w): RejectedAlternative => ({ actionId: w.candidate.actionId, reasonCodes: rejectionReasons(w, proposed) })),
      proposedActionId: proposed?.candidate.actionId ?? null,
      review: { state: "UNREVIEWED", reviewerRef: null, reviewedAt: null, notes: [] },
    },
    hash,
  );
  if (built.status === "INVALID") return { ok: false, issues: built.issues.map((i) => ({ code: "CATTLE_RECOMMENDATION_PACK_INVALID", ref: `${ctx.animalId}:${i}` })) };
  // The C0 pack is read and stored only as its exact validated copy (CAT-INV-028).
  const pack = exact(EVIDENCE_PACK, built.pack);
  if (pack === null) return { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_PACK_INVALID", ref: `${ctx.animalId}:CATTLE_RECOMMENDATION_PACK_MALFORMED` }] };
  const verified = verifyRecommendationEvidencePack(pack, hash);
  if (!verified.valid) return { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_PACK_UNVERIFIED", ref: `${ctx.animalId}:${verified.reasonCode}` }] };
  // C0 alone derives the outcome from the pack; C8's own gate fold must never be less strict than it (CAT-INV-009).
  if (pack.outcome === "ACTIONABLE" && !(proposed?.candidate.selectable ?? false)) {
    return { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_PACK_OUTCOME_INCONSISTENT", ref: `${ctx.animalId}:${proposed?.candidate.actionId ?? "NONE"}` }] };
  }

  // F003: the decision record (and its explanation) is DERIVED from the pack alone — no parallel data path.
  const record = deriveRecommendationRecord(pack);
  if (record === null) return { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_PACK_DECISION_UNREADABLE", ref: ctx.animalId }] };
  const body: Omit<CattleRecommendation, "fingerprint"> = {
    recommendationPayloadVersion: CATTLE_RECOMMENDATION_PAYLOAD_VERSION,
    animalId: ctx.animalId,
    effectiveAt: ctx.effectiveAt,
    knowledgeCutoff: ctx.knowledgeCutoff,
    context: ctx,
    candidates,
    notCandidates: notCandidates.sort((a, b) => compareStrings(a.actionKind, b.actionKind)),
    ties,
    pack,
    record,
  };
  return { ok: true, recommendation: { ...structuredClone(body), fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_RECORD", body, hash) } };
}

// ---------------------------------------------------------------------------
// Stage 9 — herd ordering
// ---------------------------------------------------------------------------

/** Attention order of pack outcomes (hard-gate failures first, nothing to do last). */
const OUTCOME_ORDER = ["BLOCKED", "REVIEW_REQUIRED", "INSUFFICIENT_EVIDENCE", "ACTIONABLE", "NO_RECOMMENDATION"] as const;

function herdKey(a: CattleRecommendation, b: CattleRecommendation): number {
  const ta = a.record.recommendedAction === null ? RECOMMENDATION_PRIORITY_TIERS.length : tierIndex(a.record.recommendedAction.tier);
  const tb = b.record.recommendedAction === null ? RECOMMENDATION_PRIORITY_TIERS.length : tierIndex(b.record.recommendedAction.tier);
  if (ta !== tb) return ta - tb;
  const oa = OUTCOME_ORDER.indexOf(a.record.outcome);
  const ob = OUTCOME_ORDER.indexOf(b.record.outcome);
  if (oa !== ob) return oa - ob;
  const va = a.record.expectedOutcome?.value;
  const vb = b.record.expectedOutcome?.value;
  if (a.record.actionable && b.record.actionable && va !== undefined && vb !== undefined) return compareValue(va, vb);
  return 0;
}

/**
 * Deterministic herd ordering, documented: proposed action tier (none last),
 * then pack outcome (BLOCKED, REVIEW_REQUIRED, INSUFFICIENT_EVIDENCE,
 * ACTIONABLE, NO_RECOMMENDATION), then — between two ACTIONABLE animals only —
 * KNOWN value before unknown (exact, higher first), then animal id. No
 * cross-animal averaging; ties are recorded.
 */
function herdOrdering(recs: CattleRecommendation[]): { ordering: HerdOrderingEntry[]; ties: string[][] } {
  const sorted = [...recs].sort((a, b) => herdKey(a, b) || compareStrings(a.animalId, b.animalId));
  const ties: string[][] = [];
  let group: CattleRecommendation[] = [];
  for (const r of [...sorted, null]) {
    if (r !== null && group.length > 0 && herdKey(group[0], r) === 0) {
      group.push(r);
      continue;
    }
    if (group.length > 1) ties.push(group.map((g) => g.animalId));
    group = r === null ? [] : [r];
  }
  return {
    ordering: sorted.map((r, i) => ({
      position: i + 1,
      animalId: r.animalId,
      outcome: r.record.outcome,
      tier: r.record.recommendedAction?.tier ?? null,
      actionId: r.record.recommendedAction?.actionId ?? null,
      recordFingerprint: r.fingerprint,
    })),
    ties,
  };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Recommends for every animal of a canonical request. The request is checked
 * with `toCanonicalPlainData`, the sealed contexts are built once, and each
 * recommendation is evaluated from its sealed context alone. The result is
 * detached and deep-frozen.
 */
export function recommendCattle(request: unknown, hash: CattleHash, trusted: RecommendationTrustedInputs = {}): CattleRecommendationOutcomeResult {
  const built = buildEvaluationContexts(request, hash, trusted);
  if (!built.ok) return deepFreezeAnimalValue({ ok: false, issues: built.issues });
  const recs: CattleRecommendation[] = [];
  const issues: RecommendationIssue[] = [];
  for (const ctx of built.contexts) {
    const r = recommendForContext(ctx, hash);
    if (r.ok) recs.push(r.recommendation);
    else issues.push(...r.issues);
  }
  if (issues.length > 0) return deepFreezeAnimalValue({ ok: false, issues });
  const animals = recs.sort((a, b) => compareStrings(a.animalId, b.animalId));
  const { ordering, ties } = herdOrdering(animals);
  const body: Omit<CattleRecommendationResult, "fingerprint"> = {
    recommendationPayloadVersion: CATTLE_RECOMMENDATION_PAYLOAD_VERSION,
    effectiveAt: built.effectiveAt,
    knowledgeCutoff: built.knowledgeCutoff,
    animals,
    ordering,
    orderingTies: ties,
  };
  const herdPayload = { effectiveAt: body.effectiveAt, knowledgeCutoff: body.knowledgeCutoff, records: animals.map((a) => ({ animalId: a.animalId, fingerprint: a.fingerprint })), ordering, orderingTies: ties };
  const result: CattleRecommendationResult = { ...body, fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_HERD", herdPayload, hash) };
  return deepFreezeAnimalValue({ ok: true, result });
}

/** The result of an INTEGRITY-ONLY check — never a verified recommendation (`authoritative` is always false). */
export type CattleRecommendationIntegrityResult =
  | { intact: true; authoritative: false }
  | { intact: false; authoritative: false; reasonCode: string; detail: string };

/**
 * INTEGRITY ONLY: canonical plain data, the complete stored structure, the C0
 * pack (`verifyRecommendationEvidencePack`), record ↔ pack derivation, an
 * exact replay of the C8 engine over the stored context, and both
 * fingerprints. A matching result is change detection and internal
 * consistency — it does NOT establish that the recommendation is
 * scientifically, semantically or decision-valid (the stored context's
 * C1–C7 views cannot be proven valid by inspection). Use
 * `verifyCattleRecommendation` for authoritative verification.
 */
export function checkCattleRecommendationIntegrity(stored: CattleRecommendation, hash: CattleHash): CattleRecommendationIntegrityResult {
  const r = integrityOf(stored, hash);
  return r.ok ? { intact: true, authoritative: false } : { intact: false, authoritative: false, reasonCode: r.reasonCode, detail: r.detail };
}

/**
 * AUTHORITATIVE verification by FULL REPRODUCTION (human architecture
 * decision 2026-10-16, Option 1): the stored recommendation's integrity is
 * checked, then `recommendCattle` is re-run over the ORIGINAL request with the
 * same trusted dependencies — every C1–C7 view is re-derived by its owning
 * frozen engine and every model by C0 — and the reproduced recommendation for
 * the same animal must equal the stored one exactly. C8 restates no
 * predecessor rule. Fails closed without the request, when reproduction
 * fails, or on any difference. Never repairs.
 */
export function verifyCattleRecommendation(stored: CattleRecommendation, request: unknown, hash: CattleHash, trusted: RecommendationTrustedInputs = {}): FingerprintVerificationResult {
  const r = reproduceStored(stored, request, hash, trusted);
  return r.ok ? { valid: true } : { valid: false, reasonCode: r.reasonCode, detail: r.detail };
}

/** A recommendation read through authoritative verification (`readVerifiedCattleRecommendation`). */
export type VerifiedCattleRecommendation =
  | { ok: true; recommendation: CattleRecommendation; record: RecommendationRecord; explanation: string }
  | { ok: false; reasonCode: string; detail: string };

/**
 * THE public way to read a stored recommendation's decision, record and explanation (human architecture decision
 * 2026-10-17, Option 1: the pack readers are non-authoritative and module-internal). Succeeds only when
 * `verifyCattleRecommendation`'s full reproduction confirms the stored recommendation; the recommendation, record and
 * explanation returned are the REPRODUCED, deep-frozen ones — the exact objects the engine derived from the original
 * request, equal to what was verified. Fails closed, returning no decision content, on any verification failure.
 */
export function readVerifiedCattleRecommendation(stored: CattleRecommendation, request: unknown, hash: CattleHash, trusted: RecommendationTrustedInputs = {}): VerifiedCattleRecommendation {
  const r = reproduceStored(stored, request, hash, trusted);
  if (!r.ok) return deepFreezeAnimalValue({ ok: false, reasonCode: r.reasonCode, detail: r.detail });
  return deepFreezeAnimalValue({ ok: true, recommendation: r.reproduced, record: r.reproduced.record, explanation: r.reproduced.record.explanation });
}

/** Integrity, then full reproduction from the original request; the reproduced recommendation when they are equal. */
function reproduceStored(stored: CattleRecommendation, request: unknown, hash: CattleHash, trusted: RecommendationTrustedInputs): { ok: true; reproduced: CattleRecommendation } | { ok: false; reasonCode: string; detail: string } {
  const integrity = integrityOf(stored, hash);
  if (!integrity.ok) return { ok: false, reasonCode: integrity.reasonCode, detail: integrity.detail };
  if (request === undefined || request === null) {
    return { ok: false, reasonCode: "CATTLE_RECOMMENDATION_VERIFICATION_REQUEST_REQUIRED", detail: "authoritative verification reproduces the recommendation from its original request; none was supplied" };
  }
  let reproduced: CattleRecommendationOutcomeResult;
  try {
    reproduced = recommendCattle(request, hash, trusted);
  } catch {
    return { ok: false, reasonCode: "CATTLE_RECOMMENDATION_REPRODUCTION_FAILED", detail: "the original request could not be re-evaluated" };
  }
  if (!reproduced.ok) {
    return { ok: false, reasonCode: "CATTLE_RECOMMENDATION_REPRODUCTION_FAILED", detail: `the original request does not reproduce a recommendation: ${reproduced.issues.map((i) => i.code).join(", ")}` };
  }
  const same = reproduced.result.animals.find((a) => a.animalId === integrity.recommendation.animalId);
  if (same === undefined || rawIdentityKey(same) !== rawIdentityKey(integrity.recommendation)) {
    return { ok: false, reasonCode: "CATTLE_RECOMMENDATION_REPRODUCTION_MISMATCH", detail: "the stored recommendation is not the one its original request reproduces" };
  }
  return { ok: true, reproduced: same };
}

/** The integrity checks, over the canonical detached copy only (CAT-INV-001/002; a getter is never invoked). */
function integrityOf(stored: unknown, hash: CattleHash): { ok: true; recommendation: CattleRecommendation } | { ok: false; reasonCode: string; detail: string } {
  const canonical = toCanonicalPlainData(stored);
  if (!canonical.ok) return { ok: false, reasonCode: "CATTLE_RECOMMENDATION_NON_CANONICAL_INPUT", detail: `the stored recommendation is not canonical plain data at ${canonical.path}` };
  const recommendation = canonical.value as CattleRecommendation;
  let issue: string | null;
  try {
    issue = storedRecommendationIssue(recommendation);
  } catch {
    issue = "CATTLE_RECOMMENDATION_MALFORMED";
  }
  if (issue !== null) return { ok: false, reasonCode: issue, detail: "the stored recommendation is malformed or internally inconsistent" };
  let r: FingerprintVerificationResult;
  try {
    r = verifyStored(recommendation, hash);
  } catch {
    r = { valid: false, reasonCode: "CATTLE_RECOMMENDATION_MALFORMED", detail: "the stored recommendation is not a well-formed C8 recommendation" };
  }
  return r.valid ? { ok: true, recommendation } : { ok: false, reasonCode: r.reasonCode ?? "CATTLE_RECOMMENDATION_MALFORMED", detail: r.detail ?? "" };
}

function verifyStored(recommendation: CattleRecommendation, hash: CattleHash): FingerprintVerificationResult {
  if (!exactValid(EVIDENCE_PACK, recommendation.pack)) return { valid: false, reasonCode: "CATTLE_RECOMMENDATION_PACK_MALFORMED", detail: "the stored evidence pack does not match the C0 pack contract" };
  const pack = verifyRecommendationEvidencePack(recommendation.pack, hash);
  if (!pack.valid) return pack;
  const { record, context } = recommendation;
  // F003: the record must be exactly the one the pack derives (single source of decision evidence).
  const derived = deriveRecommendationRecord(recommendation.pack);
  const consistent =
    derived !== null &&
    rawIdentityKey(derived) === rawIdentityKey(record) &&
    recommendation.pack.recommendationId === `CATTLE_RECOMMENDATION:${context.fingerprint.digest}`;
  if (!consistent) return { valid: false, reasonCode: "CATTLE_RECOMMENDATION_RECORD_PACK_INCONSISTENT", detail: "the record is not the one its evidence pack derives, or the pack does not belong to the sealed context" };
  const { fingerprint: contextFingerprint, ...contextBody } = context;
  const c = verifyRecommendationFingerprint("CATTLE_RECOMMENDATION_CONTEXT", contextBody, contextFingerprint as AssessmentFingerprint, hash);
  if (!c.valid) return c;
  // Replay (internal consistency): every decision field is derived from the stored context, so the stored
  // recommendation must be exactly what the engine produces over it. This proves consistency, not validity.
  const replayed = recommendForContext(deepFreezeAnimalValue(structuredClone(context)), hash);
  if (!replayed.ok || rawIdentityKey(replayed.recommendation) !== rawIdentityKey(recommendation)) {
    return { valid: false, reasonCode: "CATTLE_RECOMMENDATION_REPLAY_MISMATCH", detail: "the stored recommendation is not the one the C8 engine produces over its own sealed context" };
  }
  const { fingerprint, ...body } = recommendation;
  return verifyRecommendationFingerprint("CATTLE_RECOMMENDATION_RECORD", body, fingerprint, hash);
}
