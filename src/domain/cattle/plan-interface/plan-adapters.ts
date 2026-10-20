/**
 * Cattle C9 — THE predecessor adapter boundary (CAT-INV-028 as clarified
 * 2026-10-15; F004 architecture review 2, Outcome C, 2026-10-20).
 *
 *   approved frozen engine → raw result → THIS adapter → admitted C9 DTO
 *   → canonical C9 work items / groups → grouping, merge, evidence, timing,
 *     blockers, fingerprint → Plan projection
 *
 * BINDING INVARIANT. No value from C2, C4, C7 or C8 may influence a
 * C9-derived identifier, decision, timing value, canonical key, completion
 * reference, blocker, provenance reference, fingerprint input or Plan
 * projection until every raw operand whose validity C9 independently relies
 * upon has passed the appropriate C9-owned admission predicate. Once
 * admitted, downstream C9 derivation accepts only admitted C9 values or
 * canonical C9 objects, never raw predecessor records.
 *
 * Each consumed family has ONE admission path: a C9-owned DTO type, its
 * exhaustive `DtoSpec` (`satisfies`: the DTO drift guard) and one adapter.
 * The adapter copies exactly the operands the spec names — untransformed —
 * and admits each (presence, runtime type, format, published vocabulary
 * membership), plus the cross-object consistency C9 itself relies on
 * (B1 equivalence, a proposed C8 action naming one candidate). Owner-domain
 * semantics stay trusted: no predecessor business rule is re-run, and the
 * specs name only what C9 consumes, never the full predecessor shapes.
 *
 * Raw predecessor results never leave `plan-delegation.ts` / this module
 * (static boundary test). Failure is `CATTLE_PLAN_ADMISSION_FAILED` with ref
 * `<where>:<raw path>`; nothing throws.
 */

import type { CattleEvaluationState } from "../evaluation";
import type { RecommendationOutcome } from "../evidence-pack";
import type { GoalProjectionStatus } from "../goals";
import { PROGRAMME_CLASSIFICATIONS, PROGRAMME_OCCURRENCE_STATES, PROGRAMME_WINDOW_BOUNDARIES, type ProgrammeClassification, type ProgrammeOccurrenceRecord, type ProgrammeOccurrenceState, type ProgrammeWindowBoundary } from "../programmes";
import { BENEFIT_CLAIMS, RECOMMENDATION_GATE_SOURCES, RECOMMENDATION_PRIORITY_TIERS, type BenefitClaim, type CandidateGate, type RecommendationPriorityTier } from "../recommendations";
import { OBLIGATION_STATES, OBLIGATION_WINDOW_BOUNDARIES, type ObligationState, type ObligationWindowBoundary } from "../regulatory";
import type { CattleRuleClassification, CattleRuleGateRole } from "../rule";
import type { SourceBindingStatus } from "../source";
import type { LatestWeightState, ScopeMembershipState } from "../weights";
import { compareStrings } from "../integrity";
import { admissionIssue, admitDto, operand, type C9Fingerprint, type C9Instant, type C9Ref, type C9SourceRef, type C9Text, type C9Vocab, type DtoSpec } from "./plan-admission";
import type { CattlePlanIssue } from "./plan-contracts";

// ---------------------------------------------------------------------------
// Published vocabularies C9 decides on (membership only; total over the published type)
// ---------------------------------------------------------------------------

const keysOf = (table: Readonly<Record<string, true>>): readonly string[] => Object.freeze(Object.keys(table));

const RULE_CLASSIFICATIONS = keysOf({
  LEGAL_REQUIRED: true,
  LEGAL_CONDITIONAL: true,
  SCHEME_CONDITIONAL: true,
  VETERINARY_PROGRAMME: true,
  SCIENCE_TARGET: true,
  SCIENCE_CONSTRAINT: true,
  FARMER_INTENT: true,
  SYSTEM_INFERENCE: true,
} as const satisfies Record<CattleRuleClassification, true>);
const RULE_GATE_ROLES = keysOf({ HARD_GATE: true, ADVISORY: true } as const satisfies Record<CattleRuleGateRole, true>);
const SOURCE_BINDING_STATUSES = keysOf({
  CURRENT: true,
  SOURCE_VERSION_CHANGED: true,
  SOURCE_CONTENT_CHANGED: true,
  SOURCE_REVIEW_REQUIRED: true,
  SOURCE_NO_ACTIVE_VERSION: true,
  SOURCE_MULTIPLE_ACTIVE_VERSIONS: true,
  SOURCE_NOT_FOUND: true,
} as const satisfies Record<SourceBindingStatus, true>);
const C0_STATES = {
  PASS: true,
  FAIL: true,
  INSUFFICIENT_EVIDENCE: true,
  NOT_APPLICABLE: true,
  CONFLICTING_EVIDENCE: true,
  UNSUPPORTED: true,
  REVIEW_REQUIRED: true,
} as const satisfies Record<CattleEvaluationState, true>;
type C7GateState = ProgrammeOccurrenceRecord["gates"][number]["state"];
type C7GateSource = NonNullable<ProgrammeOccurrenceRecord["gates"][number]["source"]>;
const C7_GATE_STATES = keysOf({ ...C0_STATES, NOT_SUPPLIED: true } as const satisfies Record<C7GateState, true>);
const C7_GATE_SOURCES = keysOf({ C2_OBLIGATION: true, C3_WITHDRAWAL: true } as const satisfies Record<C7GateSource, true>);
/** C8 consulted-gate states: a C0 state, or NOT_EVALUATED for a gate C8 generates (recommendation-engine.ts). */
type C8GateState = CattleEvaluationState | "NOT_EVALUATED";
const C8_GATE_STATES = keysOf({ ...C0_STATES, NOT_EVALUATED: true } as const satisfies Record<C8GateState, true>);
const C8_GATE_SOURCES: readonly string[] = Object.freeze([...RECOMMENDATION_GATE_SOURCES, "CONTEXT", "UNRESOLVED_EVIDENCE"] as const satisfies readonly CandidateGate["source"][]);
const RECOMMENDATION_OUTCOMES = keysOf({ ACTIONABLE: true, NO_RECOMMENDATION: true, INSUFFICIENT_EVIDENCE: true, BLOCKED: true, REVIEW_REQUIRED: true } as const satisfies Record<RecommendationOutcome, true>);
const LATEST_WEIGHT_STATES = keysOf({ KNOWN: true, NONE: true, EVIDENCE_CONFLICT: true, UNSUPPORTED: true } as const satisfies Record<LatestWeightState, true>);
const GOAL_STATUSES = keysOf({ ACTIVE: true, NONE: true, INTENT_CONFLICT: true, INVALID: true } as const satisfies Record<GoalProjectionStatus, true>);
const MEMBERSHIP_STATES = keysOf({ MEMBER: true, NOT_MEMBER: true, UNKNOWN: true, EVIDENCE_CONFLICT: true, INVALID: true } as const satisfies Record<ScopeMembershipState, true>);

// ---------------------------------------------------------------------------
// The viewpoint (C8's echoed canonical times: every other call and the Plan completion cut-off)
// ---------------------------------------------------------------------------

export interface ViewpointDto {
  effectiveAt: C9Instant;
  knowledgeCutoff: C9Instant;
}
export const VIEWPOINT_SPEC = { effectiveAt: operand.instant("effectiveAt"), knowledgeCutoff: operand.instant("knowledgeCutoff") } as const satisfies DtoSpec<ViewpointDto>;

// ---------------------------------------------------------------------------
// C2 — obligation state records
// ---------------------------------------------------------------------------

export interface C2WindowDto {
  opensAt: C9Instant;
  dueAt: C9Instant;
  boundary: C9Vocab<ObligationWindowBoundary>;
}
export interface C2SourceCheckDto {
  bound: C9SourceRef;
  status: C9Vocab<SourceBindingStatus>;
}
export interface C2CountedDto {
  evidenceId: C9Ref;
  fulfilledAt: C9Instant;
}
export interface C2RecordDto {
  obligationId: C9Ref;
  occurrence: { occurrenceId: C9Ref } | null;
  state: C9Vocab<ObligationState>;
  classification: C9Vocab<CattleRuleClassification> | null;
  gateRole: C9Vocab<CattleRuleGateRole> | null;
  window: C2WindowDto | null;
  /** `ruleEvaluation.requestedRuleId`. */
  requestedRuleId: C9Ref;
  /** `ruleEvaluation.sourceChecks` (B5 / D1 deadline authority). */
  sourceChecks: C2SourceCheckDto[];
  reasonCodes: C9Text[];
  fingerprint: C9Fingerprint;
  /** `evidence.countedEvidence` (completion references). */
  countedEvidence: C2CountedDto[];
}
export interface C2AnimalDto {
  animalId: C9Ref;
  results: C2RecordDto[];
}
export interface C2Dto {
  animals: C2AnimalDto[];
}

const C2_RECORD = {
  obligationId: operand.ref("obligationId"),
  occurrence: operand.nullableObject<{ occurrenceId: C9Ref }>(["occurrence"], { occurrenceId: operand.ref("occurrenceId") }),
  state: operand.vocab(OBLIGATION_STATES, "state"),
  classification: operand.nullableVocab(RULE_CLASSIFICATIONS, "classification"),
  gateRole: operand.nullableVocab(RULE_GATE_ROLES, "gateRole"),
  window: operand.nullableObject<C2WindowDto>(["window"], { opensAt: operand.instant("opensAt"), dueAt: operand.instant("dueAt"), boundary: operand.vocab(OBLIGATION_WINDOW_BOUNDARIES, "boundary") }),
  requestedRuleId: operand.ref("ruleEvaluation", "requestedRuleId"),
  sourceChecks: operand.list(["ruleEvaluation", "sourceChecks"], operand.object<C2SourceCheckDto>([], { bound: operand.sourceRef("bound"), status: operand.vocab(SOURCE_BINDING_STATUSES, "status") })),
  reasonCodes: operand.list(["reasonCodes"], operand.text()),
  fingerprint: operand.fingerprint("fingerprint"),
  countedEvidence: operand.list(["evidence", "countedEvidence"], operand.object<C2CountedDto>([], { evidenceId: operand.ref("evidenceId"), fulfilledAt: operand.instant("fulfilledAt") })),
} as const satisfies DtoSpec<C2RecordDto>;

/** Over the C2 herd evaluation (`evaluateHerdObligations(...).herd`). */
export const C2_SPEC = {
  animals: operand.list(["animals"], operand.object<C2AnimalDto>([], { animalId: operand.ref("animalId"), results: operand.list(["results"], operand.object<C2RecordDto>([], C2_RECORD)) })),
} as const satisfies DtoSpec<C2Dto>;

// ---------------------------------------------------------------------------
// C7 — programme occurrence records
// ---------------------------------------------------------------------------

export interface C7OccurrenceDto {
  occurrenceId: C9Ref;
  opensAt: C9Instant;
  dueAt: C9Instant;
  boundary: C9Vocab<ProgrammeWindowBoundary>;
}
export interface C7GateDto {
  ruleId: C9Ref;
  state: C9Vocab<C7GateState>;
  source: C9Vocab<C7GateSource> | null;
}
export interface C7CountedDto {
  declarationId: C9Ref | null;
  healthRecordId: C9Ref | null;
  completedAt: C9Instant;
}
export interface C7RecordDto {
  actionId: C9Ref | null;
  actionKind: C9Ref | null;
  occurrence: C7OccurrenceDto | null;
  state: C9Vocab<ProgrammeOccurrenceState>;
  gates: C7GateDto[];
  reasonCodes: C9Text[];
  completion: { counted: C7CountedDto[] } | null;
}
export interface C7AnimalDto {
  animalId: C9Ref;
  fingerprint: C9Fingerprint;
  records: C7RecordDto[];
}
export interface C7ProgrammeDto {
  programmeId: C9Ref;
  classification: C9Vocab<ProgrammeClassification>;
  animals: C7AnimalDto[];
}
export interface C7Dto {
  programmes: C7ProgrammeDto[];
}

const C7_RECORD = {
  actionId: operand.nullableRef("actionId"),
  actionKind: operand.nullableRef("actionKind"),
  occurrence: operand.nullableObject<C7OccurrenceDto>(["occurrence"], {
    occurrenceId: operand.ref("occurrenceId"),
    opensAt: operand.instant("opensAt"),
    dueAt: operand.instant("dueAt"),
    boundary: operand.vocab(PROGRAMME_WINDOW_BOUNDARIES, "boundary"),
  }),
  state: operand.vocab(PROGRAMME_OCCURRENCE_STATES, "state"),
  gates: operand.list(["gates"], operand.object<C7GateDto>([], { ruleId: operand.ref("ruleId"), state: operand.vocab(C7_GATE_STATES, "state"), source: operand.nullableVocab(C7_GATE_SOURCES, "source") })),
  reasonCodes: operand.list(["reasonCodes"], operand.text()),
  completion: operand.nullableObject<{ counted: C7CountedDto[] }>(["completion"], {
    counted: operand.list(["counted"], operand.object<C7CountedDto>([], { declarationId: operand.nullableRef("declarationId"), healthRecordId: operand.nullableRef("healthRecordId"), completedAt: operand.instant("completedAt") })),
  }),
} as const satisfies DtoSpec<C7RecordDto>;

/** Over the C7 evaluation (`evaluateHealthProgrammes(...).evaluation`). */
export const C7_SPEC = {
  programmes: operand.list(
    ["programmes"],
    operand.object<C7ProgrammeDto>([], {
      programmeId: operand.ref("programmeId"),
      classification: operand.vocab(PROGRAMME_CLASSIFICATIONS, "classification"),
      animals: operand.list(["animals"], operand.object<C7AnimalDto>([], { animalId: operand.ref("animalId"), fingerprint: operand.fingerprint("fingerprint"), records: operand.list(["records"], operand.object<C7RecordDto>([], C7_RECORD)) })),
    }),
  ),
} as const satisfies DtoSpec<C7Dto>;

// ---------------------------------------------------------------------------
// C8 — recommendations and the sealed-context parts C9 consumes
// ---------------------------------------------------------------------------

export interface C8GateDto {
  ruleId: C9Ref;
  state: C9Vocab<C8GateState>;
  source: C9Vocab<CandidateGate["source"]>;
}
export interface C8CandidateDto {
  actionId: C9Ref;
  benefitClaim: C9Vocab<BenefitClaim>;
  /** `gates.checks`. */
  gates: C8GateDto[];
  /** `trigger.reasonCodes` (D2 restatement citations). */
  reasonCodes: C9Text[];
}
export interface C8ActionDto {
  actionId: C9Ref;
  actionKind: C9Ref;
  tier: C9Vocab<RecommendationPriorityTier>;
}
type NotSupplied = { state: "NOT_SUPPLIED" };
export type C8WeightsDto = NotSupplied | { state: "SUPPLIED"; seriesFingerprint: C9Fingerprint; latest: { state: C9Vocab<LatestWeightState>; observedAt: C9Instant | null } };
/** `snapshotFingerprint` is `snapshot.fingerprint`. */
export type C8GoalsDto = NotSupplied | { state: "SUPPLIED"; status: C9Vocab<GoalProjectionStatus>; snapshotFingerprint: C9Fingerprint };
export type C8ObligationsDto = NotSupplied | { state: "SUPPLIED"; recordFingerprints: C9Fingerprint[] };
export type C8ProgrammesDto = NotSupplied | { state: "SUPPLIED"; animalStatusFingerprints: C9Fingerprint[] };
export interface C8RecommendationDto {
  animalId: C9Ref;
  fingerprint: C9Fingerprint;
  /** `record.packId`. */
  packId: C9Ref;
  /** `record.outcome`. */
  outcome: C9Vocab<RecommendationOutcome>;
  /** `record.recommendedAction`. */
  recommendedAction: C8ActionDto | null;
  candidates: C8CandidateDto[];
  /** `context.weights` / `context.goals` / `context.obligations` / `context.programmes`. */
  weights: C8WeightsDto;
  goals: C8GoalsDto;
  obligations: C8ObligationsDto;
  programmes: C8ProgrammesDto;
}
export interface C8Dto {
  animals: C8RecommendationDto[];
}

const NOT_SUPPLIED_SPEC = { state: operand.literal("NOT_SUPPLIED", "state") } as const satisfies DtoSpec<NotSupplied>;
const SUPPLIED = operand.literal("SUPPLIED", "state");

const C8_RECOMMENDATION = {
  animalId: operand.ref("animalId"),
  fingerprint: operand.fingerprint("fingerprint"),
  packId: operand.ref("record", "packId"),
  outcome: operand.vocab(RECOMMENDATION_OUTCOMES, "record", "outcome"),
  recommendedAction: operand.nullableObject<C8ActionDto>(["record", "recommendedAction"], {
    actionId: operand.ref("actionId"),
    actionKind: operand.ref("actionKind"),
    tier: operand.vocab(RECOMMENDATION_PRIORITY_TIERS, "tier"),
  }),
  candidates: operand.list(
    ["candidates"],
    operand.object<C8CandidateDto>([], {
      actionId: operand.ref("actionId"),
      benefitClaim: operand.vocab(BENEFIT_CLAIMS, "benefitClaim"),
      gates: operand.list(["gates", "checks"], operand.object<C8GateDto>([], { ruleId: operand.ref("ruleId"), state: operand.vocab(C8_GATE_STATES, "state"), source: operand.vocab(C8_GATE_SOURCES, "source") })),
      reasonCodes: operand.list(["trigger", "reasonCodes"], operand.text()),
    }),
  ),
  weights: operand.variant<C8WeightsDto>(["context", "weights"], {
    NOT_SUPPLIED: NOT_SUPPLIED_SPEC,
    SUPPLIED: {
      state: SUPPLIED,
      seriesFingerprint: operand.fingerprint("seriesFingerprint"),
      latest: operand.object<{ state: C9Vocab<LatestWeightState>; observedAt: C9Instant | null }>(["latest"], { state: operand.vocab(LATEST_WEIGHT_STATES, "state"), observedAt: operand.nullableInstant("observedAt") }),
    },
  }),
  goals: operand.variant<C8GoalsDto>(["context", "goals"], {
    NOT_SUPPLIED: NOT_SUPPLIED_SPEC,
    SUPPLIED: { state: SUPPLIED, status: operand.vocab(GOAL_STATUSES, "status"), snapshotFingerprint: operand.fingerprint("snapshot", "fingerprint") },
  }),
  obligations: operand.variant<C8ObligationsDto>(["context", "obligations"], {
    NOT_SUPPLIED: NOT_SUPPLIED_SPEC,
    SUPPLIED: { state: SUPPLIED, recordFingerprints: operand.list(["recordFingerprints"], operand.fingerprint()) },
  }),
  programmes: operand.variant<C8ProgrammesDto>(["context", "programmes"], {
    NOT_SUPPLIED: NOT_SUPPLIED_SPEC,
    SUPPLIED: { state: SUPPLIED, animalStatusFingerprints: operand.list(["animalStatusFingerprints"], operand.fingerprint()) },
  }),
} as const satisfies DtoSpec<C8RecommendationDto>;

/** Over the C8 result (`recommendCattle(...).result`). */
export const C8_SPEC = { animals: operand.list(["animals"], operand.object<C8RecommendationDto>([], C8_RECOMMENDATION)) } as const satisfies DtoSpec<C8Dto>;

// ---------------------------------------------------------------------------
// C4 — one requested group's scope resolution
// ---------------------------------------------------------------------------

export interface C4AnimalDto {
  animalId: C9Ref;
  state: C9Vocab<ScopeMembershipState>;
}
export interface C4ScopeDto {
  groupRef: C9Ref;
  /** `scope.fingerprint`. */
  scopeFingerprint: C9Fingerprint;
  /** `scope.animals`. */
  animals: C4AnimalDto[];
}

/** Over `{ groupRef, scope: resolveGroupScope(...).scope }`. */
export const C4_SPEC = {
  groupRef: operand.ref("groupRef"),
  scopeFingerprint: operand.fingerprint("scope", "fingerprint"),
  animals: operand.list(["scope", "animals"], operand.object<C4AnimalDto>([], { animalId: operand.ref("animalId"), state: operand.vocab(MEMBERSHIP_STATES, "state") })),
} as const satisfies DtoSpec<C4ScopeDto>;

// ---------------------------------------------------------------------------
// The adapters (raw results are `unknown` here: C9 reads only what its specs name)
// ---------------------------------------------------------------------------

type Admission<T> = { ok: true; value: T } | { ok: false; issues: CattlePlanIssue[] };

const via = <T>(where: string, spec: DtoSpec<T>, raw: unknown): Admission<T> => {
  const r = admitDto(where, spec, raw);
  return r.ok ? r : { ok: false, issues: [r.issue] };
};

export const admitViewpoint = (c8Result: unknown): Admission<ViewpointDto> => via<ViewpointDto>("VIEWPOINT", VIEWPOINT_SPEC, c8Result);
export const admitObligations = (herd: unknown): Admission<C2Dto> => via<C2Dto>("C2", C2_SPEC, herd);
export const admitProgrammes = (evaluation: unknown): Admission<C7Dto> => via<C7Dto>("C7", C7_SPEC, evaluation);
export const admitScope = (groupRef: string, scope: unknown): Admission<C4ScopeDto> => via<C4ScopeDto>(`C4:${groupRef}`, C4_SPEC, { groupRef, scope });

/** C8, plus the relation C9 relies on to read the proposed action's candidate: its action id names exactly one candidate. */
export function admitRecommendations(c8Result: unknown): Admission<C8Dto> {
  const r = via<C8Dto>("C8", C8_SPEC, c8Result);
  if (!r.ok) return r;
  for (const [i, rec] of r.value.animals.entries()) {
    const action = rec.recommendedAction;
    if (action !== null && rec.candidates.filter((c) => c.actionId === action.actionId).length > 1) {
      return { ok: false, issues: [admissionIssue("C8", `animals[${i}].record.recommendedAction.actionId`)] };
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// B1 structural equivalence — over admitted fingerprints only
// ---------------------------------------------------------------------------

const digests = (fs: readonly C9Fingerprint[]) => fs.map((f) => f.digest).sort(compareStrings);
const sameDigests = (a: readonly C9Fingerprint[], b: readonly C9Fingerprint[]) => JSON.stringify(digests(a)) === JSON.stringify(digests(b));

/**
 * C9's own C2 record fingerprints must equal C8's sealed `obligations.recordFingerprints`, and its C7
 * animal-status fingerprints C8's `programmes.animalStatusFingerprints`, for every animal (B1).
 */
export function equivalenceIssues(obligations: C2Dto | null, programmes: C7Dto | null, recommendations: C8Dto): CattlePlanIssue[] {
  const mismatch = (ref: string): CattlePlanIssue => ({ code: "CATTLE_PLAN_DELEGATION_EQUIVALENCE_MISMATCH", ref });
  const issues: CattlePlanIssue[] = [];
  const c2ByAnimal = new Map((obligations === null ? [] : obligations.animals).map((e) => [e.animalId as string, e]));
  for (const rec of recommendations.animals) {
    const c2 = c2ByAnimal.get(rec.animalId);
    const o = rec.obligations;
    if (obligations === null ? o.state !== "NOT_SUPPLIED" : o.state !== "SUPPLIED" || c2 === undefined || !sameDigests(c2.results.map((r) => r.fingerprint), o.recordFingerprints)) {
      issues.push(mismatch(`C2:${rec.animalId}`));
    }
    const c7 = programmes === null ? null : programmes.programmes.flatMap((p) => p.animals.filter((a) => a.animalId === rec.animalId).map((a) => a.fingerprint));
    const p = rec.programmes;
    if (c7 === null ? p.state !== "NOT_SUPPLIED" : p.state !== "SUPPLIED" || !sameDigests(c7, p.animalStatusFingerprints)) {
      issues.push(mismatch(`C7:${rec.animalId}`));
    }
  }
  const c8Animals = new Set<string>(recommendations.animals.map((a) => a.animalId));
  for (const id of c2ByAnimal.keys()) if (!c8Animals.has(id)) issues.push(mismatch(`C2:${id}`));
  return issues;
}
