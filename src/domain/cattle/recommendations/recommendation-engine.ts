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
import type { RuleEvaluationRecord } from "../evaluation";
import { buildRecommendationEvidencePack, verifyRecommendationEvidencePack, type CandidateAction, type EvidencePackCalculationStep, type RecommendationEvidencePack, type RejectedAlternative } from "../evidence-pack";
import type { CattleInputItem } from "../information";
import { compareStrings, sameFingerprint, sortedUnique, type CattleHash } from "../integrity";
import { addObligationOffset, type ObligationState } from "../regulatory";
import type { WithdrawalGateState } from "../health";
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
import { compareKnownValues, computeNetValue } from "./economic-context";
import { buildEvaluationContexts, type RecommendationTrustedInputs } from "./evaluation-context";
import { CATTLE_RECOMMENDATION_PAYLOAD_VERSION, computeRecommendationFingerprint, verifyRecommendationFingerprint } from "./recommendation-integrity";
import { renderRecommendationExplanation } from "./recommendation-explanation";
import type { ModelEvaluation } from "./recommendation-models";
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
const VALUE_FORMULA = "NET_OF_BOUND_OBSERVATIONS: sum(benefit observations) - sum(cost observations), exact decimal (money.ts), one currency";

const ENGINE_LIMITATIONS = [
  "CATTLE_RECOMMENDATION_NO_EFFECT_MAGNITUDE_OR_PROBABILITY",
  "CATTLE_RECOMMENDATION_NO_CURRENCY_CONVERSION",
  "CATTLE_RECOMMENDATION_MODEL_RULES_RECEIVE_NO_ANIMAL_INPUTS",
  "CATTLE_RECOMMENDATION_EVIDENCE_COMPLETENESS_IS_ADAPTER_RESPONSIBILITY",
];

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
      if (latest.state === "NONE") return { state: "YES", reasons: ["CATTLE_RECOMMENDATION_TRIGGER_NO_WEIGHT_IN_VIEW"] };
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
  records: RuleEvaluationRecord[];
  sourceRefs: SourceVersionRef[];
}

function gateRecords(ctx: CattleEvaluationContext, source: RecommendationGateSource): { gates: RuleEvaluationRecord[]; sourceRefs: SourceVersionRef[] } | null {
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
function byRuleIdentity<T extends { record: RuleEvaluationRecord }>(entries: readonly T[]): { unique: T[]; ambiguous: string[] } {
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

function foldGates(d: CandidateActionDefinition, ctx: CattleEvaluationContext, unresolved: readonly string[]): { ok: true; fold: GateFold } | { ok: false; ambiguous: string[] } {
  const consulted: { record: RuleEvaluationRecord; source: RecommendationGateSource }[] = [];
  const sourceRefs: SourceVersionRef[] = [];
  const markers = new Set(unresolved);
  for (const source of d.prerequisites.sources) {
    const g = gateRecords(ctx, source);
    if (g === null) {
      markers.add(requires(GATE_SOURCE_PART[source]));
      continue;
    }
    for (const r of g.gates) consulted.push({ record: r, source });
    sourceRefs.push(...g.sourceRefs);
  }
  // A named gate is looked up in EVERY supplied source (never first match).
  const missingNamed: string[] = [];
  for (const ruleId of d.prerequisites.gateRuleIds) {
    let found = false;
    for (const source of GATE_SOURCES) {
      const g = gateRecords(ctx, source);
      const hits = g === null ? [] : g.gates.filter((x) => x.requestedRuleId === ruleId);
      if (g === null || hits.length === 0) continue;
      for (const r of hits) consulted.push({ record: r, source });
      sourceRefs.push(...g.sourceRefs);
      found = true;
    }
    if (!found) missingNamed.push(ruleId);
  }
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
  return { ok: true, fold: { state: checks.every((c) => c.satisfied) ? "CLEAR" : "NOT_CLEAR", checks, records, sourceRefs } };
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

function effectOf(d: CandidateActionDefinition, ctx: CattleEvaluationContext): { effect: CandidateEffect; record: RuleEvaluationRecord | null } {
  const ref = d.effectModelRef;
  if (ref === null) return { effect: { state: "EFFECT_UNKNOWN", model: null, expectedEffect: null, reasonCodes: ["CATTLE_RECOMMENDATION_NO_EFFECT_MODEL"] }, record: null };
  const m = modelOf(ctx, ref);
  if (m.state === "UNAVAILABLE") return { effect: { state: "EFFECT_UNKNOWN", model: ref, expectedEffect: null, reasonCodes: m.reasonCodes }, record: null };
  if (m.model.role !== "EFFECT") return { effect: { state: "EFFECT_UNKNOWN", model: ref, expectedEffect: null, reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_ROLE_MISMATCH:${JSON.stringify([ref.modelId, ref.version])}`] }, record: null };
  const s = m.ruleEvaluation.state;
  if (s === "PASS") return { effect: { state: "EFFECT_SUPPORTED", model: ref, expectedEffect: m.model.expectedEffect, reasonCodes: ["CATTLE_RECOMMENDATION_EFFECT_MODEL_PASS"] }, record: m.ruleEvaluation };
  if (s === "FAIL") return { effect: { state: "EFFECT_NOT_SUPPORTED", model: ref, expectedEffect: null, reasonCodes: ["CATTLE_RECOMMENDATION_EFFECT_MODEL_FAIL"] }, record: m.ruleEvaluation };
  return { effect: { state: "EFFECT_UNKNOWN", model: ref, expectedEffect: null, reasonCodes: [`CATTLE_RECOMMENDATION_EFFECT_MODEL_${s}`] }, record: m.ruleEvaluation };
}

function valueOf(d: CandidateActionDefinition, ctx: CattleEvaluationContext): { value: CandidateValue; record: RuleEvaluationRecord | null; observations: { key: string; role: "benefit" | "cost"; amount: string; currency: string; observationId: string; source: SourceVersionRef; receivedAt: string }[] } {
  const unknown = (model: RecommendationModelRef | null, reasonCodes: string[], record: RuleEvaluationRecord | null = null) => ({
    value: { state: "VALUE_UNKNOWN" as const, model, amount: null, currency: null, observationIds: [], reasonCodes },
    record,
    observations: [],
  });
  const ref = d.economicModelRef;
  if (ref === null) return unknown(null, ["CATTLE_RECOMMENDATION_NO_ECONOMIC_MODEL"]);
  const m = modelOf(ctx, ref);
  if (m.state === "UNAVAILABLE") return unknown(ref, m.reasonCodes);
  if (m.model.role !== "ECONOMIC" || m.model.value === null) return unknown(ref, [`CATTLE_RECOMMENDATION_MODEL_ROLE_MISMATCH:${JSON.stringify([ref.modelId, ref.version])}`]);
  if (m.ruleEvaluation.state !== "PASS") return unknown(ref, [`CATTLE_RECOMMENDATION_ECONOMIC_MODEL_${m.ruleEvaluation.state}`], m.ruleEvaluation);
  const v = computeNetValue(m.model.value, ctx.economics);
  if (v.state === "VALUE_UNKNOWN") return unknown(ref, v.reasonCodes, m.ruleEvaluation);
  const observations = [
    ...v.benefit.map((o) => ({ key: o.valueKey, role: "benefit" as const, amount: o.amount, currency: o.currency, observationId: o.observationId, source: o.source, receivedAt: o.receivedAt })),
    ...v.cost.map((o) => ({ key: o.valueKey, role: "cost" as const, amount: o.amount, currency: o.currency, observationId: o.observationId, source: o.source, receivedAt: o.receivedAt })),
  ];
  return {
    value: { state: "VALUE_KNOWN", model: ref, amount: v.amount, currency: v.currency, observationIds: sortedUnique(observations.map((o) => o.observationId)), reasonCodes: ["CATTLE_RECOMMENDATION_ECONOMIC_MODEL_PASS"] },
    record: m.ruleEvaluation,
    observations,
  };
}

// ---------------------------------------------------------------------------
// Stage 6 — ranking
// ---------------------------------------------------------------------------

interface Working {
  candidate: Omit<CandidateEvaluation, "rank">;
  gates: GateFold;
  modelRecords: RuleEvaluationRecord[];
  valueRecord: RuleEvaluationRecord | null;
  valueObservations: ReturnType<typeof valueOf>["observations"];
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

function regulatoryState(pack: RecommendationEvidencePack): RecommendationRecord["regulatoryStatus"]["state"] {
  const g = pack.hardGateOutcomes;
  if (g.length === 0) return "NO_PREREQUISITE_GATES";
  if (g.some((x) => x.state === "FAIL")) return "GATE_FAILED";
  if (g.some((x) => x.state === "REVIEW_REQUIRED")) return "GATE_REVIEW_REQUIRED";
  if (g.some((x) => !x.satisfied)) return "GATE_UNRESOLVED";
  return "GATES_SATISFIED";
}

function evidenceOf(p: Working | null): RecommendationRecord["evidence"] {
  if (p === null) return { type: "NONE", strength: "NONE" };
  if (p.candidate.benefitClaim === "NONE") return { type: "DATA_GAP_OR_OBLIGATION", strength: "PREDECESSOR_STATE" };
  const effect = p.candidate.effect.state === "EFFECT_SUPPORTED";
  const value = p.candidate.value.state === "VALUE_KNOWN";
  return { type: "MODELLED", strength: effect && value ? "APPROVED_MODEL_EFFECT_AND_VALUE" : effect ? "APPROVED_MODEL_EFFECT" : value ? "APPROVED_MODEL_VALUE" : "UNMODELLED" };
}

function uniqueRefs(refs: SourceVersionRef[]): SourceVersionRef[] {
  return [...refs].sort(compareSourceVersionRefs).filter((r, i, a) => i === 0 || compareSourceVersionRefs(a[i - 1], r) !== 0);
}

/** Evaluates one sealed context. Reads nothing but `ctx`. */
function recommendForContext(ctx: CattleEvaluationContext, hash: CattleHash): { ok: true; recommendation: CattleRecommendation } | { ok: false; issues: RecommendationIssue[] } {
  const missingContextParts = RECOMMENDATION_CONTEXT_PARTS.filter((p) => !partSupplied(ctx, p));
  const working: Working[] = [];
  const notCandidates: NotCandidate[] = [];
  for (const d of ctx.actions.definitions) {
    const trigger = triggerOf(d, ctx);
    const eligibility = eligibilityOf(d, ctx);
    if (trigger.state === "NO" || eligibility.state === "NO") {
      notCandidates.push({ actionKind: d.actionKind, reasonCodes: sortedUnique([...(trigger.state === "NO" ? trigger.reasons : []), ...(eligibility.state === "NO" ? eligibility.reasons : [])]) });
      continue;
    }
    const unresolved = [...(trigger.state === "UNRESOLVED" ? trigger.reasons : []), ...(eligibility.state === "UNRESOLVED" ? eligibility.reasons : [])];
    const folded = foldGates(d, ctx, unresolved);
    if (!folded.ok) return { ok: false, issues: ambiguityIssues(ctx.animalId, folded.ambiguous) };
    const gates = folded.fold;
    const clear = gates.state === "CLEAR";
    const effect = clear ? effectOf(d, ctx) : { effect: NOT_EVALUATED_EFFECT, record: null };
    const value = clear ? valueOf(d, ctx) : { value: NOT_EVALUATED_VALUE, record: null, observations: [] };
    working.push({
      candidate: {
        actionId: actionIdOf(d.actionKind, ctx.animalId),
        actionKind: d.actionKind,
        description: d.description,
        tier: d.tier,
        benefitClaim: d.benefitClaim,
        trigger: { state: trigger.state === "YES" ? "TRIGGERED" : "UNRESOLVED", reasonCodes: sortedUnique(trigger.reasons) },
        eligibility: { state: eligibility.state === "YES" ? "ELIGIBLE" : "UNRESOLVED", reasonCodes: sortedUnique(eligibility.reasons) },
        gates: { state: gates.state, checks: gates.checks },
        effect: effect.effect,
        value: value.value,
        selectable: clear && effect.effect.state !== "EFFECT_NOT_SUPPORTED",
      },
      gates,
      modelRecords: [effect.record, value.record].filter((r): r is RuleEvaluationRecord => r !== null),
      valueRecord: value.record,
      valueObservations: value.observations,
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
    const v = w.candidate.value;
    if (v.state === "VALUE_KNOWN") {
      steps.push({
        sequence: steps.length + 1,
        description: `Economic value of the ${label} from bound observations`,
        formula: VALUE_FORMULA,
        inputs: Object.fromEntries(w.valueObservations.map((o) => [`${o.role}:${o.key}:${o.observationId}`, `${o.amount} ${o.currency}`])),
        output: v.amount,
        unit: v.currency,
        rounding: null,
        rule: w.valueRecord?.rule ?? null,
      });
    }
  };
  if (proposed !== null) stepsFor(proposed, "proposed action");
  for (const w of ranked) if (w !== proposed) stepsFor(w, `alternative ${w.candidate.actionId}`);
  steps.push({
    sequence: steps.length + 1,
    description: "Deterministic ranking of candidate actions",
    formula: RANKING_FORMULA,
    inputs: Object.fromEntries(candidates.map((c) => [`rank:${String(c.rank).padStart(4, "0")}`, c.actionId])),
    output: proposed?.candidate.actionId ?? null,
    unit: null,
    rounding: null,
    rule: null,
  });
  const goal = ctx.goals.state === "SUPPLIED" ? ctx.goals : null;
  const usedObservations = ranked.flatMap((w) => w.valueObservations).filter((o, i, a) => a.findIndex((x) => x.key === o.key && x.observationId === o.observationId) === i);
  const economicInputs: CattleInputItem[] = usedObservations.map((o) => ({
    inputKey: `cattle.recommendation.economic.${o.key}`,
    value: o.amount,
    unit: o.currency,
    informationClass: "OBSERVATION",
    provenance: { kind: "CANONICAL_RECORD", ref: o.observationId, recordedAt: o.receivedAt },
  }));
  const unresolvedNotes: string[] = [];
  if (proposed !== null) {
    const { effect, value } = proposed.candidate;
    unresolvedNotes.push(...proposed.gates.checks.filter((c) => !c.satisfied).map((c) => `CATTLE_RECOMMENDATION_GATE_${c.state}:${c.ruleId}`));
    if (effect.state !== "EFFECT_SUPPORTED") unresolvedNotes.push(...effect.reasonCodes.map((r) => `${effect.state}:${r}`));
    if (value.state !== "VALUE_KNOWN") unresolvedNotes.push(...value.reasonCodes.map((r) => `${value.state}:${r}`));
  }
  const uncertainties = sortedUnique([...missingContextParts.map((p) => `CATTLE_RECOMMENDATION_CONTEXT_PART_NOT_SUPPLIED:${p}`), ...unresolvedNotes]);
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
      additionalSourceRefs: uniqueRefs([...ranked.flatMap((w) => w.gates.sourceRefs), ...usedObservations.map((o) => o.source)]),
      assumptions: definition?.assumptions ?? [],
      limitations: [...ENGINE_LIMITATIONS, ...(definition?.limitations ?? [])],
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
  const pack = built.pack;
  const verified = verifyRecommendationEvidencePack(pack, hash);
  if (!verified.valid) return { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_PACK_UNVERIFIED", ref: `${ctx.animalId}:${verified.reasonCode}` }] };
  // C0 alone derives the outcome from the pack; C8's own gate fold must never be less strict than it (CAT-INV-009).
  if (pack.outcome === "ACTIONABLE" && !(proposed?.candidate.selectable ?? false)) {
    return { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_PACK_OUTCOME_INCONSISTENT", ref: `${ctx.animalId}:${proposed?.candidate.actionId ?? "NONE"}` }] };
  }

  const recommendedAction = proposed === null ? null : { actionId: proposed.candidate.actionId, actionKind: proposed.candidate.actionKind, description: proposed.candidate.description, tier: proposed.candidate.tier };
  const effect = proposed?.candidate.effect ?? null;
  const value = proposed?.candidate.value ?? null;
  const record: RecommendationRecord = {
    informationClass: "RECOMMENDATION",
    recommendedAction,
    outcome: pack.outcome,
    actionable: pack.outcome === "ACTIONABLE",
    reasonCodes: sortedUnique([...pack.outcomeReasonCodes, ...(proposed === null ? [] : [`CATTLE_RECOMMENDATION_PROPOSED:${proposed.candidate.actionKind}`, ...proposed.triggerReasons])]),
    explanation: renderRecommendationExplanation({ pack, recommendedAction, effect, value, missingContextParts }),
    expectedOutcome: proposed === null ? null : { effect: proposed.candidate.effect, value: proposed.candidate.value },
    regulatoryStatus: { state: regulatoryState(pack), hardGateOutcomes: pack.hardGateOutcomes },
    evidence: evidenceOf(proposed),
    sourceRefs: pack.sourceRefs,
    assumptions: pack.assumptions,
    limitations: pack.limitations,
    unknowns: pack.uncertainties,
    missingContextParts: [...missingContextParts],
    packId: pack.recommendationId,
    packFingerprint: pack.fingerprint,
  };
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

/**
 * Verifies a stored recommendation: its C0 pack (C0
 * `verifyRecommendationEvidencePack`), its sealed-context fingerprint and its
 * record fingerprint. Never repairs. A matching fingerprint is change
 * detection, not authenticity; reproduction requires re-running
 * `recommendCattle` over the same canonical evidence at the same times.
 */
export function verifyCattleRecommendation(recommendation: CattleRecommendation, hash: CattleHash): FingerprintVerificationResult {
  const pack = verifyRecommendationEvidencePack(recommendation.pack, hash);
  if (!pack.valid) return pack;
  const { record, context } = recommendation;
  const consistent =
    record.outcome === recommendation.pack.outcome &&
    record.actionable === (recommendation.pack.outcome === "ACTIONABLE") &&
    record.packId === recommendation.pack.recommendationId &&
    sameFingerprint(record.packFingerprint, recommendation.pack.fingerprint) &&
    recommendation.pack.recommendationId === `CATTLE_RECOMMENDATION:${context.fingerprint.digest}` &&
    (record.recommendedAction?.actionId ?? null) === recommendation.pack.proposedActionId;
  if (!consistent) return { valid: false, reasonCode: "CATTLE_RECOMMENDATION_RECORD_PACK_INCONSISTENT", detail: "the record does not match its evidence pack or sealed context" };
  const { fingerprint: contextFingerprint, ...contextBody } = context;
  const c = verifyRecommendationFingerprint("CATTLE_RECOMMENDATION_CONTEXT", contextBody, contextFingerprint as AssessmentFingerprint, hash);
  if (!c.valid) return c;
  const { fingerprint, ...body } = recommendation;
  return verifyRecommendationFingerprint("CATTLE_RECOMMENDATION_RECORD", body, fingerprint, hash);
}
