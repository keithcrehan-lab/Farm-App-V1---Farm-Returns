/**
 * Cattle C8 — validation of a STORED / RELOADED recommendation (CAT-INV-028
 * as clarified 2026-10-15: a persisted, deserialised record crosses a genuine
 * trust boundary; audit F005 of 2026-10-15T210448Z).
 *
 * Fingerprints are change detection, not authenticity: a stored
 * recommendation re-sealed after editing (fingerprints recomputed) must still
 * be rejected when it is malformed or internally inconsistent. Before any
 * fingerprint is accepted, `storedRecommendationIssue` therefore checks:
 * 1. the COMPLETE stored structure — every field of `CattleRecommendation`,
 *    its sealed context (every part, the admitted registry / models /
 *    observations through their owned-record specs, model evaluations,
 *    economic resolutions), candidates, non-candidates, ties and the exact C0
 *    pack — with runtime types, vocabularies, formats and no undeclared field;
 * 2. the identity / time / version relationships C8 itself establishes:
 *    payload versions, animal identity (record ↔ context ↔ pack target scope
 *    ↔ snapshot ref), both canonical times and the evaluation date (record ↔
 *    context ↔ pack), and the candidates, exclusions and ties ↔ the pack's own
 *    decision steps;
 * 3. the SEMANTICS of the C8-owned context parts (`storedOwnedContextIssue`,
 *    audit 2026-10-16T064728Z): the registry, models, reviews, sources and
 *    economic observations are re-admitted through C8's own admission at the
 *    context's cutoff and must be exactly what admission yields; every model
 *    evaluation is re-bound to its admitted model (content-binding marker,
 *    D1 eligibility, and the C0 fields C0's own exported functions derive
 *    without the implementation: rule ref / fingerprint, classification, gate
 *    role, evaluation date, review dimensions over the stored reviews and
 *    source checks over the stored sources).
 * The stored CONTEXT is the untrusted input; every decision field derived from
 * it (candidates, exclusions, ties, pack, record) is then established by
 * REPLAY (`verifyCattleRecommendation`, human architecture decision
 * 2026-10-15, audit F005 family): the C8 engine is re-run over the validated
 * stored context and the result must equal the stored recommendation exactly,
 * so no field-by-field decision check is relied upon for completeness.
 * A context consistent with itself but not with the canonical evidence it
 * claims (every part rebuilt and re-sealed) cannot be told from an original
 * by inspection — reproduction over the same canonical evidence is the
 * authenticity check (documented limitation).
 */

import { OBLIGATION_STATES, canonicalObligationInstant, utcCalendarDateOf } from "../regulatory";
import { PRODUCTION_GOAL_TYPES } from "../goals";
import { PROGRAMME_CLASSIFICATIONS, PROGRAMME_OCCURRENCE_STATES } from "../programmes";
import { C3_WITHDRAWAL_GATE_STATES } from "../programmes/programme-consumed";
import { rawIdentityKey } from "../health/health-input";
import { compareInstants } from "../animal-ledger";
import { compareStrings, type CattleHash } from "../integrity";
import { computeRuleFingerprint, evaluateRuleReviews, ruleVersionRef } from "../rule";
import { checkSourceBinding, compareSourceVersionRefs } from "../source";
import { BENEFIT_CLAIMS, CANDIDATE_ACTION_DEFINITION_SPEC, RECOMMENDATION_GATE_SOURCES, RECOMMENDATION_PRIORITY_TIERS, admitCandidateActionRegistry, type RecommendationModelRef } from "./candidate-actions";
import { OBSERVATION_SPEC, admitEconomicObservations } from "./economic-context";
import { C4_LATEST_WEIGHT_STATES, C6_GOAL_STATUSES, C6_ROUTING_STATES, C6_SNAPSHOT } from "./recommendation-consumed";
import { EVIDENCE_PACK, RULE_EVALUATION_RECORD, SOURCE_VERSION_REF, exactValid, type ExactSpec } from "./recommendation-exact";
import { CANDIDATE_STEP_FORMULA, PROPOSED_LABEL, alternativeLabel, candidateStepDescription } from "./recommendation-explanation";
import { CATTLE_RECOMMENDATION_PAYLOAD_VERSION } from "./recommendation-integrity";
import { MODEL_SPEC, REVIEW_SPEC, SOURCE_SPEC, admitRecommendationModels, approvalEvidenced, modelEligibilityIssues, recommendationModelContentMarker, relevantModelCatalogue } from "./recommendation-models";
import type { CattleEvaluationContext, CattleRecommendation } from "./recommendation-contracts";

const text = { t: "text" } as const;
const ref = { t: "ref" } as const;
const int = { t: "int" } as const;
const bool = { t: "bool" } as const;
const date = { t: "date" } as const;
const instant = { t: "instant" } as const;
const fingerprint = { t: "fingerprint" } as const;
const literal = (value: string | number): ExactSpec => ({ t: "literal", value });
const oneOf = (values: readonly string[]): ExactSpec => ({ t: "enum", values });
const nullable = (of: ExactSpec): ExactSpec => ({ t: "nullable", of });
const arrayOf = (of: ExactSpec): ExactSpec => ({ t: "array", of });
const object = (fields: Record<string, ExactSpec>): ExactSpec => ({ t: "object", fields });
const owned = (spec: unknown): ExactSpec => ({ t: "owned", spec: spec as never });
const part = (fields: Record<string, ExactSpec>): ExactSpec => ({ t: "tagged", tag: "state", variants: { NOT_SUPPLIED: {}, SUPPLIED: fields } });

const GATES = arrayOf(RULE_EVALUATION_RECORD as ExactSpec);
const SOURCES = arrayOf(SOURCE_VERSION_REF as ExactSpec);
const MODEL_REF = object({ modelId: ref, version: ref });

const CONTEXT = object({
  recommendationPayloadVersion: literal(CATTLE_RECOMMENDATION_PAYLOAD_VERSION),
  animalId: ref,
  effectiveAt: instant,
  knowledgeCutoff: instant,
  evaluationDate: date,
  animal: object({ snapshotFingerprint: fingerprint }),
  obligations: part({ recordFingerprints: arrayOf(fingerprint), records: arrayOf(object({ obligationId: ref, occurrenceId: nullable(text), state: oneOf(OBLIGATION_STATES) })), gates: GATES }),
  health: part({
    timelineFingerprint: fingerprint,
    medicineLedgerFingerprint: fingerprint,
    withdrawalGateFingerprint: fingerprint,
    withdrawal: arrayOf(object({ foodProduct: text, state: oneOf(C3_WITHDRAWAL_GATE_STATES) })),
    gates: GATES,
    sourceRefs: SOURCES,
  }),
  weights: part({ contractFingerprint: fingerprint, seriesFingerprint: fingerprint, latest: object({ state: oneOf(C4_LATEST_WEIGHT_STATES), observedAt: nullable(instant) }) }),
  performance: part({ evaluationFingerprint: fingerprint, animalFingerprint: fingerprint }),
  goals: part({
    status: oneOf(C6_GOAL_STATUSES),
    activeGoalTypes: arrayOf(oneOf(PRODUCTION_GOAL_TYPES)),
    snapshot: owned(C6_SNAPSHOT),
    routingState: oneOf(C6_ROUTING_STATES),
    routingFingerprint: fingerprint,
    targetApplicabilityFingerprint: nullable(fingerprint),
  }),
  programmes: part({
    animalStatusFingerprints: arrayOf(fingerprint),
    occurrences: arrayOf(object({ programmeId: ref, classification: oneOf(PROGRAMME_CLASSIFICATIONS), actionId: nullable(text), actionKind: nullable(text), occurrenceId: nullable(text), state: oneOf(PROGRAMME_OCCURRENCE_STATES) })),
    gates: GATES,
    sourceRefs: SOURCES,
  }),
  actions: object({ registryId: ref, version: ref, definitions: arrayOf(owned(CANDIDATE_ACTION_DEFINITION_SPEC)) }),
  models: object({ records: arrayOf(owned(MODEL_SPEC)), reviews: arrayOf(owned(REVIEW_SPEC)), sources: arrayOf(owned(SOURCE_SPEC)) }),
  modelEvaluations: arrayOf(
    object({
      modelId: ref,
      version: ref,
      evaluation: {
        t: "tagged",
        tag: "state",
        variants: { EVALUATED: { model: owned(MODEL_SPEC), ruleEvaluation: RULE_EVALUATION_RECORD as ExactSpec }, UNAVAILABLE: { reasonCodes: arrayOf(text) } },
      },
    }),
  ),
  economics: arrayOf(object({ valueKey: ref, state: oneOf(["KNOWN", "UNKNOWN", "CONFLICT"]), observation: nullable(owned(OBSERVATION_SPEC)), candidateObservationIds: arrayOf(ref) })),
  fingerprint,
});

const CANDIDATE = object({
  actionId: text,
  actionKind: ref,
  description: text,
  tier: oneOf(RECOMMENDATION_PRIORITY_TIERS),
  benefitClaim: oneOf(BENEFIT_CLAIMS),
  trigger: object({ state: oneOf(["TRIGGERED", "UNRESOLVED", "NOT_MET"]), reasonCodes: arrayOf(text) }),
  eligibility: object({ state: oneOf(["ELIGIBLE", "UNRESOLVED", "NOT_ELIGIBLE"]), reasonCodes: arrayOf(text) }),
  gates: object({ state: oneOf(["CLEAR", "NOT_CLEAR"]), checks: arrayOf(object({ ruleId: text, state: text, source: oneOf([...RECOMMENDATION_GATE_SOURCES, "CONTEXT", "UNRESOLVED_EVIDENCE"]), satisfied: bool })) }),
  effect: object({ state: oneOf(["EFFECT_SUPPORTED", "EFFECT_NOT_SUPPORTED", "EFFECT_UNKNOWN", "NOT_EVALUATED"]), model: nullable(MODEL_REF), expectedEffect: nullable(text), reasonCodes: arrayOf(text) }),
  value: object({
    state: oneOf(["VALUE_KNOWN", "VALUE_UNKNOWN", "NOT_EVALUATED"]),
    model: nullable(MODEL_REF),
    amount: nullable(text),
    currency: nullable(text),
    observationIds: arrayOf(text),
    reasonCodes: arrayOf(text),
  }),
  selectable: bool,
  rank: int,
});

/**
 * The complete stored structure EXCEPT the record, whose structure is established by equality with the record
 * the pack derives (`verifyCattleRecommendation`); here the record only has to be a plain object.
 */
export const STORED_RECOMMENDATION: ExactSpec = object({
  recommendationPayloadVersion: literal(CATTLE_RECOMMENDATION_PAYLOAD_VERSION),
  animalId: ref,
  effectiveAt: instant,
  knowledgeCutoff: instant,
  context: CONTEXT,
  candidates: arrayOf(CANDIDATE),
  notCandidates: arrayOf(object({ actionKind: ref, reasonCodes: arrayOf(text) })),
  ties: arrayOf(object({ actionIds: arrayOf(text), brokenBy: literal("ACTION_IDENTITY") })),
  pack: EVIDENCE_PACK as ExactSpec,
  fingerprint,
});

const key = (v: unknown) => rawIdentityKey(v);
const sameInstant = (a: string, b: string) => canonicalObligationInstant(a) !== null && canonicalObligationInstant(a) === canonicalObligationInstant(b);

/**
 * `null` when the stored recommendation is structurally complete and every
 * identity / time / version relationship C8 establishes holds; otherwise the
 * first violated check (a deterministic reason code).
 */
export function storedRecommendationIssue(stored: CattleRecommendation, hash: CattleHash): string | null {
  const raw = stored as unknown as Record<string, unknown>;
  const { record, ...rest } = raw;
  if (record === null || typeof record !== "object" || Array.isArray(record)) return "CATTLE_RECOMMENDATION_STORED_RECORD_MALFORMED";
  if (!exactValid(STORED_RECOMMENDATION, rest)) return "CATTLE_RECOMMENDATION_STORED_STRUCTURE_MALFORMED";
  const { context: ctx, pack } = stored;
  // Identity, times and versions.
  if (stored.animalId !== ctx.animalId || pack.targetScope.kind !== "ANIMAL" || pack.targetScope.id !== ctx.animalId) return "CATTLE_RECOMMENDATION_STORED_ANIMAL_INCONSISTENT";
  if (pack.targetScope.snapshotRef !== `CATTLE_ANIMAL_SNAPSHOT:${ctx.animal.snapshotFingerprint.digest}`) return "CATTLE_RECOMMENDATION_STORED_SNAPSHOT_INCONSISTENT";
  if (!sameInstant(stored.effectiveAt, ctx.effectiveAt) || !sameInstant(stored.knowledgeCutoff, ctx.knowledgeCutoff) || !sameInstant(pack.knownAt, ctx.knowledgeCutoff)) {
    return "CATTLE_RECOMMENDATION_STORED_TIMES_INCONSISTENT";
  }
  if (ctx.evaluationDate !== utcCalendarDateOf(canonicalObligationInstant(ctx.effectiveAt) as string) || pack.evaluationDate !== ctx.evaluationDate) return "CATTLE_RECOMMENDATION_STORED_EVALUATION_DATE_INCONSISTENT";
  // Candidates, exclusions and ties ↔ the pack's own decision steps (the pack is the single source).
  const steps = pack.calculationSteps;
  const ranking = steps.at(-1);
  if (ranking === undefined || stored.candidates.length !== pack.candidateActions.length) return "CATTLE_RECOMMENDATION_STORED_CANDIDATES_INCONSISTENT";
  for (const [i, c] of stored.candidates.entries()) {
    const label = c.actionId === pack.proposedActionId ? PROPOSED_LABEL : alternativeLabel(c.actionId);
    const step = steps.find((s) => s.formula === CANDIDATE_STEP_FORMULA && s.description === candidateStepDescription(label));
    const listed = pack.candidateActions.find((a) => a.actionId === c.actionId);
    const inputs = step?.inputs;
    const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : undefined);
    if (
      inputs === undefined ||
      listed === undefined ||
      c.rank !== i + 1 ||
      ranking.inputs[`rank:${String(c.rank).padStart(4, "0")}`] !== c.actionId ||
      listed.description !== c.description ||
      inputs.actionId !== c.actionId ||
      inputs.actionKind !== c.actionKind ||
      inputs.tier !== c.tier ||
      inputs.benefitClaim !== c.benefitClaim ||
      inputs.gates !== c.gates.state ||
      inputs.selectable !== c.selectable ||
      key(parse(inputs.trigger)) !== key(c.trigger) ||
      key(parse(inputs.eligibility)) !== key(c.eligibility) ||
      key(parse(inputs.effect)) !== key(c.effect) ||
      key(parse(inputs.value)) !== key(c.value)
    ) {
      return "CATTLE_RECOMMENDATION_STORED_CANDIDATES_INCONSISTENT";
    }
    // The complete gate-check collection, both directions: the pack's per-candidate gate summary lists every consulted
    // gate exactly once (membership, uniqueness, state); each stored check then matches its own per-gate step.
    const summary = steps.find((x) => x.description === `Prerequisite hard gates of the ${label}`);
    const ruleIds = c.gates.checks.map((check) => check.ruleId);
    if (
      summary === undefined ||
      summary.output !== c.gates.state ||
      new Set(ruleIds).size !== ruleIds.length ||
      Object.keys(summary.inputs).length !== ruleIds.length ||
      c.gates.checks.some((check) => !Object.hasOwn(summary.inputs, check.ruleId) || summary.inputs[check.ruleId] !== check.state)
    ) {
      return "CATTLE_RECOMMENDATION_STORED_CANDIDATES_INCONSISTENT";
    }
    for (const check of c.gates.checks) {
      const s = steps.find((x) => x.description === `Prerequisite gate ${check.ruleId} of the ${label}`);
      if (s === undefined || s.output !== check.state || s.inputs.satisfied !== check.satisfied || s.inputs.source !== check.source) return "CATTLE_RECOMMENDATION_STORED_CANDIDATES_INCONSISTENT";
    }
  }
  // Exclusions, both directions: unique action kinds, exactly the pack's `excluded:*` entries.
  const exclusions = steps.find((s) => s.description === "Registered actions not considered");
  const excludedKinds = stored.notCandidates.map((n) => n.actionKind);
  if (
    exclusions === undefined ||
    exclusions.output !== stored.notCandidates.length ||
    new Set(excludedKinds).size !== excludedKinds.length ||
    Object.keys(exclusions.inputs).filter((k) => k.startsWith("excluded:")).length !== excludedKinds.length
  ) {
    return "CATTLE_RECOMMENDATION_STORED_EXCLUSIONS_INCONSISTENT";
  }
  for (const n of stored.notCandidates) if (exclusions.inputs[`excluded:${n.actionKind}`] !== JSON.stringify(n.reasonCodes)) return "CATTLE_RECOMMENDATION_STORED_EXCLUSIONS_INCONSISTENT";
  const tieKeys = Object.keys(ranking.inputs).filter((k) => k.startsWith("tie:"));
  if (tieKeys.length !== stored.ties.length) return "CATTLE_RECOMMENDATION_STORED_TIES_INCONSISTENT";
  for (const [i, tie] of stored.ties.entries()) {
    if (ranking.inputs[`tie:${String(i + 1).padStart(4, "0")}`] !== JSON.stringify({ actionIds: tie.actionIds, brokenBy: tie.brokenBy })) return "CATTLE_RECOMMENDATION_STORED_TIES_INCONSISTENT";
  }
  return storedOwnedContextIssue(ctx, hash);
}

/**
 * The C8-owned parts of a stored context are what C8's own admission yields
 * at the context's cutoff (re-admission is idempotent on admitted data), and
 * each model evaluation is bound to its admitted model. Replay then derives
 * every decision field from this validated context. The model's C0 predicate
 * outcome itself (PASS / FAIL) needs the trusted implementation and is not
 * re-derived here (documented limitation; its approval / source evidence is).
 */
export function storedOwnedContextIssue(ctx: CattleEvaluationContext, hash: CattleHash): string | null {
  const registry = admitCandidateActionRegistry(ctx.actions, ctx.knowledgeCutoff);
  if (!registry.ok || key(registry.registry) !== key(ctx.actions)) return "CATTLE_RECOMMENDATION_STORED_REGISTRY_INVALID";
  const refs = ctx.actions.definitions.flatMap((d) => [d.effectModelRef, d.economicModelRef].filter((r): r is RecommendationModelRef => r !== null));
  const models = admitRecommendationModels(ctx.models, ctx.knowledgeCutoff);
  if (!models.ok || key(relevantModelCatalogue(models.catalogue, refs)) !== key(ctx.models)) return "CATTLE_RECOMMENDATION_STORED_MODELS_INVALID";
  // One evaluation per catalogue model, in catalogue order, each bound to its admitted model.
  if (ctx.modelEvaluations.length !== ctx.models.records.length) return "CATTLE_RECOMMENDATION_STORED_MODEL_EVALUATION_INVALID";
  for (const [i, e] of ctx.modelEvaluations.entries()) {
    const m = ctx.models.records[i];
    if (e.modelId !== m.modelId || e.version !== m.version) return "CATTLE_RECOMMENDATION_STORED_MODEL_EVALUATION_INVALID";
    if (e.evaluation.state !== "EVALUATED") continue;
    const r = e.evaluation.ruleEvaluation;
    const sourceChecks = [...m.rule.sourceBindings].sort(compareSourceVersionRefs).map((b) => checkSourceBinding(b, ctx.models.sources));
    if (
      key(e.evaluation.model) !== key(m) ||
      !m.rule.assumptions.includes(recommendationModelContentMarker(m, hash)) ||
      modelEligibilityIssues(m).length > 0 ||
      r.requestedRuleId !== m.rule.ruleId ||
      key(r.rule) !== key(ruleVersionRef(m.rule)) ||
      key(r.ruleFingerprint) !== key(computeRuleFingerprint(m.rule, hash)) ||
      r.classification !== m.rule.classification ||
      r.gateRole !== m.rule.gateRole ||
      r.evaluationDate !== ctx.evaluationDate ||
      r.implementation === null ||
      r.implementation.implementationId !== m.rule.implementation.implementationId ||
      r.implementation.version !== m.rule.implementation.version ||
      r.usedInputs.length + r.missingInputs.length + r.conflictingInputs.length + r.rejectedInputs.length > 0 ||
      key(r.reviews) !== key(evaluateRuleReviews(m.rule, ctx.models.reviews, hash).dimensions) ||
      key(r.sourceChecks) !== key(sourceChecks) ||
      (r.state === "PASS" && !approvalEvidenced(r))
    ) {
      return "CATTLE_RECOMMENDATION_STORED_MODEL_EVALUATION_INVALID";
    }
  }
  // Economic resolutions: exactly the value keys the catalogue's economic models name; each bound observation re-admitted.
  const valueKeys = [...new Set(ctx.models.records.flatMap((m) => (m.role === "ECONOMIC" && m.value !== null ? [...m.value.benefitKeys, ...m.value.costKeys] : [])))].sort(compareStrings);
  if (key(ctx.economics.map((x) => x.valueKey)) !== key(valueKeys)) return "CATTLE_RECOMMENDATION_STORED_ECONOMICS_INVALID";
  for (const x of ctx.economics) {
    const ids = x.candidateObservationIds;
    if (x.state === "UNKNOWN" && (x.observation !== null || ids.length > 0)) return "CATTLE_RECOMMENDATION_STORED_ECONOMICS_INVALID";
    if (x.state === "CONFLICT" && (x.observation !== null || ids.length < 2 || key(ids) !== key([...new Set(ids)].sort(compareStrings)))) return "CATTLE_RECOMMENDATION_STORED_ECONOMICS_INVALID";
    if (x.state !== "KNOWN") continue;
    const o = x.observation;
    if (o === null || ids.length > 0 || o.valueKey !== x.valueKey || compareInstants(o.observedAt, ctx.effectiveAt) > 0) return "CATTLE_RECOMMENDATION_STORED_ECONOMICS_INVALID";
    // Admission of the observation itself (amount, precision, currency, times, knowledge cutoff); its supersession
    // links name records outside the stored context, so they are checked for form only.
    const bare = { ...o, supersedes: [] };
    const admitted = admitEconomicObservations({ observations: [bare] }, ctx.knowledgeCutoff);
    if (!admitted.ok || admitted.observations.length !== 1 || key(admitted.observations[0]) !== key(bare)) return "CATTLE_RECOMMENDATION_STORED_ECONOMICS_INVALID";
    if (o.supersedes.includes(o.observationId) || key(o.supersedes) !== key([...new Set(o.supersedes)].sort(compareStrings))) return "CATTLE_RECOMMENDATION_STORED_ECONOMICS_INVALID";
  }
  return null;
}
