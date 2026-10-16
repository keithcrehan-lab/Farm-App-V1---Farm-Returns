/**
 * Cattle C8 — the evidence pack as the SINGLE source of decision evidence
 * (CAT-INV-017 / 021; C8 bounded architecture repair 2026-10-15, F003).
 *
 *   canonical inputs → complete C0 evidence pack → decision record (from the pack)
 *                                               → explanation (from the pack)
 *
 * Everything here reads ONLY a `RecommendationEvidencePack`: the proposed
 * action, its trigger / eligibility, its effect (including the effect model's
 * statement) and value, the consulted models and the evidence labels are all
 * recovered from pack content — the per-candidate and per-model calculation
 * steps the engine writes, the C0 rule evaluations, hard-gate outcomes,
 * limitations and uncertainties. The renderer's ONLY parameter is the pack, so
 * anything visible in an explanation is in the pack by construction; a pack
 * that does not carry the decision evidence cannot be read (`null` ⇒ the
 * request fails closed). No model / AI call; the template adds nothing.
 */

import type { RecommendationEvidencePack } from "../evidence-pack";
import { compareStrings, sortedUnique } from "../integrity";
import { toCanonicalPlainData } from "../regulatory";
import { createMoneyAmount } from "../../money";
import { BENEFIT_CLAIMS, RECOMMENDATION_CONTEXT_PARTS, RECOMMENDATION_PRIORITY_TIERS, type RecommendationContextPart, type RecommendationPriorityTier } from "./candidate-actions";
import type { CandidateEffect, CandidateValue, RecommendationRecord } from "./recommendation-contracts";
import { EVIDENCE_PACK, exactValid, type CarriedRuleEvaluation, type ExactSpec } from "./recommendation-exact";
import { approvalEvidenced } from "./recommendation-models";

/** Calculation-step vocabulary shared by the writer (the engine) and this reader. */
export const CANDIDATE_STEP_FORMULA =
  "one candidate action: identity, registry-declared tier and benefit claim, trigger / eligibility, gate state, selectability, effect (with the effect model's statement) and value";
export const MODEL_STEP_FORMULA = "one consulted registered model: role, identity, content fingerprint, effect statement / value form, assumptions and limitations; rule = the model's C0 rule version";
export const PROPOSED_LABEL = "proposed action";
export const alternativeLabel = (actionId: string) => `alternative ${actionId}`;
export const candidateStepDescription = (label: string) => `Candidate ${label}`;
export const modelStepDescription = (role: "EFFECT" | "ECONOMIC", modelId: string, version: string, label: string) =>
  `${role === "EFFECT" ? "Effect" : "Economic"} model ${JSON.stringify([modelId, version])} of the ${label}`;
export const CONTEXT_PART_UNCERTAINTY = "CATTLE_RECOMMENDATION_CONTEXT_PART_NOT_SUPPLIED:";

// The exact shapes of the C8 decision fields a candidate step carries as JSON (shared with the stored-record spec).
const reasonCodes: ExactSpec = { t: "array", of: { t: "text" } };
const modelRef: ExactSpec = { t: "nullable", of: { t: "object", fields: { modelId: { t: "ref" }, version: { t: "ref" } } } };
export const TRIGGER_SPEC: ExactSpec = { t: "object", fields: { state: { t: "enum", values: ["TRIGGERED", "UNRESOLVED", "NOT_MET"] }, reasonCodes } };
export const ELIGIBILITY_SPEC: ExactSpec = { t: "object", fields: { state: { t: "enum", values: ["ELIGIBLE", "UNRESOLVED", "NOT_ELIGIBLE"] }, reasonCodes } };
export const EFFECT_SPEC: ExactSpec = {
  t: "object",
  fields: { state: { t: "enum", values: ["EFFECT_SUPPORTED", "EFFECT_NOT_SUPPORTED", "EFFECT_UNKNOWN", "NOT_EVALUATED"] }, model: modelRef, expectedEffect: { t: "nullable", of: { t: "text" } }, reasonCodes },
};
export const VALUE_SPEC: ExactSpec = {
  t: "object",
  fields: {
    state: { t: "enum", values: ["VALUE_KNOWN", "VALUE_UNKNOWN", "NOT_EVALUATED"] },
    model: modelRef,
    amount: { t: "nullable", of: { t: "text" } },
    currency: { t: "nullable", of: { t: "text" } },
    observationIds: { t: "array", of: { t: "text" } },
    reasonCodes,
  },
};

/** A canonical money amount (`money.ts` `createMoneyAmount`): no NaN / Infinity / exponent / "-0". */
function moneyAmount(amount: string): boolean {
  try {
    createMoneyAmount(amount, "EUR");
    return true;
  } catch {
    return false;
  }
}

/**
 * The state-dependent semantics C8 itself gives an effect / value (`effectOf` / `valueOf`; audit F010): only a
 * SUPPORTED effect states one and names its model; only a KNOWN value carries a canonical amount, a currency
 * and its observations; NOT_EVALUATED names no model.
 */
export function effectSemanticsValid(e: CandidateEffect): boolean {
  if (e.state === "EFFECT_SUPPORTED") return e.model !== null && e.expectedEffect !== null;
  return e.expectedEffect === null && (e.state !== "NOT_EVALUATED" || e.model === null);
}
export function valueSemanticsValid(v: CandidateValue): boolean {
  const ids = v.observationIds;
  if (v.state === "VALUE_KNOWN") {
    return v.model !== null && v.amount !== null && v.currency !== null && moneyAmount(v.amount) && ids.length > 0 && ids.every((x, i) => i === 0 || compareStrings(ids[i - 1], x) < 0);
  }
  return v.amount === null && v.currency === null && ids.length === 0 && (v.state !== "NOT_EVALUATED" || v.model === null);
}

/** A JSON-carried decision field, `null` unless it parses AND matches its exact shape (never a bare cast). */
function parse<T>(value: unknown, spec: ExactSpec): T | null {
  if (typeof value !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  return exactValid(spec, parsed) ? (parsed as T) : null;
}

export interface PackDecision {
  recommendedAction: RecommendationRecord["recommendedAction"];
  triggerReasons: string[];
  effect: CandidateEffect | null;
  value: CandidateValue | null;
  evidence: RecommendationRecord["evidence"];
  missingContextParts: RecommendationContextPart[];
}

/**
 * The public readers take a caller pack across a trust boundary: it is checked with
 * `toCanonicalPlainData` first (CAT-INV-001; a getter is never invoked) and only the
 * detached copy is read (CAT-INV-002). Non-canonical ⇒ `null` (fail closed).
 */
function canonicalPack(pack: unknown): RecommendationEvidencePack | null {
  const canonical = toCanonicalPlainData(pack);
  // ...and must be a complete, exact C0 pack (audit F010): a missing or wrong-typed field fails closed, never throws.
  return canonical.ok && exactValid(EVIDENCE_PACK, canonical.value) ? (canonical.value as RecommendationEvidencePack) : null;
}

/**
 * THE pack-outcome reconciliation rule (audit F010 of 2026-10-16T114308Z), applied by the one reader every public
 * export goes through: a proposal is the first selectable candidate, or else a candidate whose gates are not clear
 * (the engine's choice), so the pack is ACTIONABLE exactly when its proposed action is selectable, a non-selectable
 * proposal has gates not clear, and a proposal never yields NO_RECOMMENDATION.
 */
export function packOutcomeReconciled(
  pack: Pick<RecommendationEvidencePack, "outcome" | "proposedActionId" | "actionableActionId">,
  proposal: { selectable: boolean; gates: "CLEAR" | "NOT_CLEAR" } | null,
): boolean {
  // Identities on EVERY path, including an absent proposal (audit F010 of 2026-10-16T180756Z): no proposal is exactly
  // NO_RECOMMENDATION with nothing actionable; the actionable id is the proposal exactly when ACTIONABLE.
  if (pack.proposedActionId === null) return proposal === null && pack.outcome === "NO_RECOMMENDATION" && pack.actionableActionId === null;
  if (proposal === null) return false;
  if (pack.actionableActionId !== (pack.outcome === "ACTIONABLE" ? pack.proposedActionId : null)) return false;
  if ((pack.outcome === "ACTIONABLE") !== proposal.selectable) return false;
  if (!proposal.selectable && proposal.gates !== "NOT_CLEAR") return false;
  return pack.outcome !== "NO_RECOMMENDATION";
}

/** The proposed action's decision evidence, read from the pack alone; `null` when the pack does not carry it or is not canonical. */
export function readPackDecision(pack: RecommendationEvidencePack): PackDecision | null {
  const p = canonicalPack(pack);
  return p === null ? null : packDecision(p);
}

function packDecision(pack: RecommendationEvidencePack): PackDecision | null {
  const parts = pack.uncertainties.filter((u) => u.startsWith(CONTEXT_PART_UNCERTAINTY)).map((u) => u.slice(CONTEXT_PART_UNCERTAINTY.length));
  if (parts.some((p) => !(RECOMMENDATION_CONTEXT_PARTS as readonly string[]).includes(p))) return null;
  const missingContextParts = (parts as RecommendationContextPart[]).sort((a, b) => RECOMMENDATION_CONTEXT_PARTS.indexOf(a) - RECOMMENDATION_CONTEXT_PARTS.indexOf(b));
  const none = { effectBasis: "NONE", valueBasis: "NONE", priorityBasis: "NONE" } as const;
  const steps = pack.calculationSteps.filter((s) => s.formula === CANDIDATE_STEP_FORMULA && s.description === candidateStepDescription(PROPOSED_LABEL));
  if (pack.proposedActionId === null) {
    if (steps.length > 0 || !packOutcomeReconciled(pack, null)) return null;
    return { recommendedAction: null, triggerReasons: [], effect: null, value: null, evidence: { type: "NONE", strength: "NONE", ...none }, missingContextParts };
  }
  if (steps.length !== 1) return null;
  const i = steps[0].inputs;
  const tier = i.tier as RecommendationPriorityTier;
  // Every decision field the step carries is validated (audit F010), including those the record does not show.
  const trigger = parse<{ state: string; reasonCodes: string[] }>(i.trigger, TRIGGER_SPEC);
  const eligibility = parse<{ state: string; reasonCodes: string[] }>(i.eligibility, ELIGIBILITY_SPEC);
  const effect = parse<CandidateEffect>(i.effect, EFFECT_SPEC);
  const value = parse<CandidateValue>(i.value, VALUE_SPEC);
  if (eligibility === null || effect === null || value === null || !effectSemanticsValid(effect) || !valueSemanticsValid(value)) return null;
  if (!(BENEFIT_CLAIMS as readonly unknown[]).includes(i.benefitClaim) || (i.gates !== "CLEAR" && i.gates !== "NOT_CLEAR") || typeof i.selectable !== "boolean") return null;
  // Selectability is exactly C8's rule: gates clear, triggered, eligible and an effect not refuted.
  if (i.selectable !== (i.gates === "CLEAR" && trigger !== null && trigger.state === "TRIGGERED" && eligibility.state === "ELIGIBLE" && effect.state !== "EFFECT_NOT_SUPPORTED")) return null;
  if (!packOutcomeReconciled(pack, { selectable: i.selectable, gates: i.gates })) return null;
  const candidate = pack.candidateActions.find((c) => c.actionId === pack.proposedActionId);
  if (i.actionId !== pack.proposedActionId || typeof i.actionKind !== "string" || !RECOMMENDATION_PRIORITY_TIERS.includes(tier) || trigger === null || effect === null || value === null || candidate === undefined) {
    return null;
  }
  // The model's C0 rule evaluation is found through the pack's own model step (its `rule`) — never outside the pack.
  const modelRecord = (role: "EFFECT" | "ECONOMIC", ref: CandidateEffect["model"]): CarriedRuleEvaluation | null => {
    if (ref === null) return null;
    const step = pack.calculationSteps.find((x) => x.formula === MODEL_STEP_FORMULA && x.description === modelStepDescription(role, ref.modelId, ref.version, PROPOSED_LABEL));
    const ruleId = step?.rule?.ruleId;
    return ruleId === undefined ? null : ((pack.ruleEvaluations.find((r) => r.requestedRuleId === ruleId) as CarriedRuleEvaluation | undefined) ?? null);
  };
  const priorityBasis = "REGISTRY_DECLARED_UNREVIEWED" as const;
  let evidence: RecommendationRecord["evidence"];
  if (i.benefitClaim === "NONE") evidence = { type: "DATA_GAP_OR_OBLIGATION", strength: "PREDECESSOR_STATE", ...none, priorityBasis };
  else {
    const effectRecord = effect.state === "EFFECT_SUPPORTED" ? modelRecord("EFFECT", effect.model) : null;
    const valueRecord = value.state === "VALUE_KNOWN" ? modelRecord("ECONOMIC", value.model) : null;
    const e = effectRecord !== null && approvalEvidenced(effectRecord);
    const v = valueRecord !== null && approvalEvidenced(valueRecord);
    evidence = {
      type: "MODELLED",
      strength: e && v ? "MODELLED_EFFECT_AND_VALUE" : e ? "MODELLED_EFFECT" : v ? "MODELLED_VALUE" : "UNMODELLED",
      effectBasis: e ? "SCIENTIFICALLY_APPROVED_EFFECT_MODEL" : "NONE",
      valueBasis: v ? "APPROVED_VALUE_FORM_OVER_UNVALIDATED_OBSERVATIONS" : "NONE",
      priorityBasis,
    };
  }
  return {
    recommendedAction: { actionId: pack.proposedActionId, actionKind: i.actionKind, description: candidate.description, tier },
    triggerReasons: trigger.reasonCodes,
    effect,
    value,
    evidence,
    missingContextParts,
  };
}

/** The deterministic explanation, rendered from the pack alone (`null` when the pack does not carry the decision evidence or is not canonical). */
export function renderRecommendationExplanation(pack: RecommendationEvidencePack): string | null {
  const p = canonicalPack(pack);
  return p === null ? null : renderExplanation(p);
}

function renderExplanation(pack: RecommendationEvidencePack): string | null {
  const d = packDecision(pack);
  if (d === null) return null;
  const a = d.recommendedAction;
  const gates = pack.hardGateOutcomes.length === 0 ? "none" : pack.hardGateOutcomes.map((g) => `${g.ruleId}=${g.state}`).join(", ");
  const effect = d.effect === null ? "not evaluated" : `${d.effect.state}${d.effect.expectedEffect === null ? "" : ` (${d.effect.expectedEffect})`}`;
  // D2: a known value is never presented as validated prices.
  const value =
    d.value === null ? "not evaluated" : `${d.value.state}${d.value.amount === null ? "" : ` ${d.value.amount} ${d.value.currency} (approved value form over economic observations not independently validated)`}`;
  return [
    `Outcome: ${pack.outcome}.`,
    // D3: the priority tier is registry-declared, never presented as independently reviewed.
    a === null ? "No action proposed." : `Proposed action: ${a.actionKind} (${a.tier}, registry-declared priority) - ${a.description}.`,
    `Hard gates: ${gates}.`,
    `Expected effect: ${effect}.`,
    `Economic value: ${value}.`,
    `Missing context: ${d.missingContextParts.length === 0 ? "none" : d.missingContextParts.join(", ")}.`,
    `Evidence pack ${pack.recommendationId} (${pack.fingerprint.digest}).`,
  ].join(" ");
}

function regulatoryState(pack: RecommendationEvidencePack): RecommendationRecord["regulatoryStatus"]["state"] {
  const g = pack.hardGateOutcomes;
  if (g.length === 0) return "NO_PREREQUISITE_GATES";
  if (g.some((x) => x.state === "FAIL")) return "GATE_FAILED";
  if (g.some((x) => x.state === "REVIEW_REQUIRED")) return "GATE_REVIEW_REQUIRED";
  if (g.some((x) => !x.satisfied)) return "GATE_UNRESOLVED";
  return "GATES_SATISFIED";
}

/** The decision record, derived from the pack alone (`null` ⇒ the pack does not carry the decision evidence or is not canonical). */
export function deriveRecommendationRecord(pack: RecommendationEvidencePack): RecommendationRecord | null {
  const p = canonicalPack(pack);
  return p === null ? null : deriveRecord(p);
}

function deriveRecord(pack: RecommendationEvidencePack): RecommendationRecord | null {
  const d = packDecision(pack);
  const explanation = renderExplanation(pack);
  if (d === null || explanation === null) return null;
  const a = d.recommendedAction;
  return {
    informationClass: "RECOMMENDATION",
    recommendedAction: a,
    outcome: pack.outcome,
    actionable: pack.outcome === "ACTIONABLE",
    reasonCodes: sortedUnique([...pack.outcomeReasonCodes, ...(a === null ? [] : [`CATTLE_RECOMMENDATION_PROPOSED:${a.actionKind}`, ...d.triggerReasons])]),
    explanation,
    expectedOutcome: a === null || d.effect === null || d.value === null ? null : { effect: d.effect, value: d.value },
    regulatoryStatus: { state: regulatoryState(pack), hardGateOutcomes: pack.hardGateOutcomes },
    evidence: d.evidence,
    sourceRefs: pack.sourceRefs,
    assumptions: pack.assumptions,
    limitations: pack.limitations,
    unknowns: pack.uncertainties,
    missingContextParts: d.missingContextParts,
    packId: pack.recommendationId,
    packFingerprint: pack.fingerprint,
  };
}
