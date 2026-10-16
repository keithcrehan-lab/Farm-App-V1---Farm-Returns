/**
 * Cattle C8 — INTEGRITY of a STORED / RELOADED recommendation (CAT-INV-028:
 * a persisted, deserialised record crosses a genuine trust boundary).
 *
 * `storedRecommendationIssue` checks the COMPLETE stored structure (every
 * field, the sealed context with every part, candidates, non-candidates, ties
 * and the exact C0 pack — runtime types, vocabularies, formats, no undeclared
 * field) and the identity / time / version relationships C8 itself
 * establishes (payload versions; animal identity record ↔ context ↔ pack
 * target scope ↔ snapshot ref; both canonical times and the evaluation date;
 * candidates, exclusions and ties ↔ the pack's own decision steps).
 *
 * This is INTEGRITY ONLY (`checkCattleRecommendationIntegrity`): it never
 * establishes that a recommendation is scientifically, semantically or
 * decision-valid. The stored context's cut-down C1–C7 views cannot be proven
 * valid by inspection, and C8 does not restate any predecessor's rules to try
 * (human architecture decision 2026-10-16, Option 1). Authoritative
 * verification is FULL REPRODUCTION from the original request through the
 * owning engines (`verifyCattleRecommendation`).
 */

import { OBLIGATION_STATES, canonicalObligationInstant, utcCalendarDateOf } from "../regulatory";
import { PRODUCTION_GOAL_TYPES } from "../goals";
import { PROGRAMME_CLASSIFICATIONS, PROGRAMME_OCCURRENCE_STATES } from "../programmes";
import { C3_WITHDRAWAL_GATE_STATES } from "../programmes/programme-consumed";
import { rawIdentityKey } from "../health/health-input";
import { BENEFIT_CLAIMS, CANDIDATE_ACTION_DEFINITION_SPEC, RECOMMENDATION_GATE_SOURCES, RECOMMENDATION_PRIORITY_TIERS } from "./candidate-actions";
import { OBSERVATION_SPEC } from "./economic-context";
import { C4_LATEST_WEIGHT_STATES, C6_GOAL_STATUSES, C6_ROUTING_STATES, C6_SNAPSHOT } from "./recommendation-consumed";
import { EVIDENCE_PACK, RULE_EVALUATION_RECORD, SOURCE_VERSION_REF, exactValid, type ExactSpec } from "./recommendation-exact";
import { CANDIDATE_STEP_FORMULA, EFFECT_SPEC, ELIGIBILITY_SPEC, PROPOSED_LABEL, TRIGGER_SPEC, VALUE_SPEC, alternativeLabel, candidateStepDescription } from "./recommendation-explanation";
import { CATTLE_RECOMMENDATION_PAYLOAD_VERSION } from "./recommendation-integrity";
import { MODEL_SPEC, REVIEW_SPEC, SOURCE_SPEC } from "./recommendation-models";
import type { CattleRecommendation } from "./recommendation-contracts";

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
  trigger: TRIGGER_SPEC,
  eligibility: ELIGIBILITY_SPEC,
  gates: object({ state: oneOf(["CLEAR", "NOT_CLEAR"]), checks: arrayOf(object({ ruleId: text, state: text, source: oneOf([...RECOMMENDATION_GATE_SOURCES, "CONTEXT", "UNRESOLVED_EVIDENCE"]), satisfied: bool })) }),
  effect: EFFECT_SPEC,
  value: VALUE_SPEC,
  selectable: bool,
  rank: int,
});

/**
 * The complete stored structure EXCEPT the record, whose structure is established by equality with the record
 * the pack derives (`checkCattleRecommendationIntegrity`); here the record only has to be a plain object.
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
export function storedRecommendationIssue(stored: CattleRecommendation): string | null {
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
  return null;
}

