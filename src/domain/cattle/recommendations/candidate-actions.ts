/**
 * Cattle C8 — the `CandidateActionDefinition` registry (data, never code).
 *
 * A registry is versioned (`registryId`, `version`) canonical plain data. Each
 * definition registers ONE action kind (an action's identity is its kind plus
 * its target scope) with: a system-priority tier, a benefit claim, applicable
 * goal types, a trigger from a CLOSED vocabulary evaluated over C8's sealed
 * context, prerequisite hard gates, context evidence requirements and
 * optional effect / economic model refs. Definitions are admitted by
 * knowledge time (`recordedAt`): a definition recorded after the cutoff is
 * invisible (CAT-INV-003/004); an unreadable `recordedAt` fails closed
 * (CAT-INV-005); identity (action kind) is judged among admitted definitions
 * before validity (CAT-INV-008): identical repeats are idempotent, different
 * content under one kind fails closed.
 *
 * Field-presence policy (as C7 decision B1): every field must be present and
 * not `undefined`; `null` / `[]` only where the type below gives them a
 * meaning; unknown fields are rejected — a malformed definition fails the
 * request closed, it is never repaired.
 *
 * `DEFAULT_CANDIDATE_ACTION_REGISTRY` holds only evidence-free, data-driven
 * data-gap / obligation actions. Each claims NO biological or economic
 * benefit (`benefitClaim: "NONE"`, no models) and triggers only from its
 * documented predecessor state. No real legal, veterinary or scientific
 * content, no staleness interval (staleness needs an explicitly supplied
 * policy) and no veterinary-review default (it needs a supplied, sourced rule
 * or a recorded programme action kind).
 */

import { canonicalObligationInstant, OBLIGATION_STATES, type ObligationOffset, type ObligationState } from "../regulatory";
import type { WithdrawalGateState } from "../health";
import { PRODUCTION_GOAL_TYPES, type GoalProjectionStatus, type ProductionGoalType } from "../goals";
import { PROGRAMME_CLASSIFICATIONS, PROGRAMME_OCCURRENCE_STATES, type ProgrammeClassification, type ProgrammeOccurrenceState } from "../programmes";
import { compareStrings } from "../integrity";
import { C6_GOAL_STATUSES, arrayOf, code, instant, int, kinded, nullable, object, oneOfValues, ownedValid, ownedContentKey, preferredSpelling, withCanonicalInstants, ref, vocabulary, isPlainObject } from "./recommendation-consumed";
import { compareInstants, deepFreezeAnimalValue } from "../animal-ledger";

/** System-priority tiers (Plan skill: safety/legal/welfare → avoid material loss → expected net return → value of information), highest first. */
export const RECOMMENDATION_PRIORITY_TIERS = ["SAFETY_LEGAL_WELFARE", "AVOID_MATERIAL_LOSS", "EXPECTED_NET_RETURN", "VALUE_OF_INFORMATION"] as const;
export type RecommendationPriorityTier = (typeof RECOMMENDATION_PRIORITY_TIERS)[number];

/** The hard-gate projections an action can name as prerequisites. */
export const RECOMMENDATION_GATE_SOURCES = ["C2_OBLIGATION", "C3_WITHDRAWAL", "C7_PROGRAMME"] as const;
export type RecommendationGateSource = (typeof RECOMMENDATION_GATE_SOURCES)[number];

/** The context parts of a sealed `CattleEvaluationContext` that may be absent (the C1 animal part is always present). */
export const RECOMMENDATION_CONTEXT_PARTS = ["OBLIGATIONS", "HEALTH", "WEIGHTS", "PERFORMANCE", "GOALS", "PROGRAMMES"] as const;
export type RecommendationContextPart = (typeof RECOMMENDATION_CONTEXT_PARTS)[number];

/** The context part each gate source is projected from. */
export const GATE_SOURCE_PART: Readonly<Record<RecommendationGateSource, RecommendationContextPart>> = Object.freeze({
  C2_OBLIGATION: "OBLIGATIONS",
  C3_WITHDRAWAL: "HEALTH",
  C7_PROGRAMME: "PROGRAMMES",
});

/** `NONE`: a data-gap / obligation action — no effect or economic model may be named. `MODELLED`: benefit only through registered models. */
export const BENEFIT_CLAIMS = ["NONE", "MODELLED"] as const;
export type BenefitClaim = (typeof BENEFIT_CLAIMS)[number];

const WITHDRAWAL_GATE_STATES = vocabulary<WithdrawalGateState>()(["CLEAR", "IN_WITHDRAWAL", "UNKNOWN", "EVIDENCE_CONFLICT"]);
const OFFSET_UNITS = ["DAY", "HOUR"] as const;

/** The closed trigger vocabulary (each evaluated over the sealed context only). */
export type CandidateTrigger =
  /** C4 latest-known weight NONE; or, only with a supplied `staleAfter`, the latest weight instant + `staleAfter` ≤ `effectiveAt`. */
  | { kind: "WEIGHT_MISSING_OR_STALE"; staleAfter: ObligationOffset | null }
  /** Any C2 obligation state record in one of `states`. */
  | { kind: "OBLIGATION_STATE"; states: ObligationState[] }
  /** Any C3 withdrawal gate entry in one of `states`. */
  | { kind: "WITHDRAWAL_STATE"; states: WithdrawalGateState[] }
  /** Any C7 occurrence record of a programme action (classification in `classifications`, action kind in `actionKinds` unless `null`) in one of `states`. */
  | { kind: "PROGRAMME_ACTION_STATE"; states: ProgrammeOccurrenceState[]; classifications: ProgrammeClassification[]; actionKinds: string[] | null }
  /** The C6 goal projection status is one of `statuses`. */
  | { kind: "GOAL_STATUS"; statuses: GoalProjectionStatus[] }
  /** No predecessor condition (eligibility then rests on goal types, gates and models). */
  | { kind: "UNCONDITIONAL" };

export const CANDIDATE_TRIGGER_KINDS = ["WEIGHT_MISSING_OR_STALE", "OBLIGATION_STATE", "WITHDRAWAL_STATE", "PROGRAMME_ACTION_STATE", "GOAL_STATUS", "UNCONDITIONAL"] as const;

export interface RecommendationModelRef {
  modelId: string;
  version: string;
}

export interface CandidateActionDefinition {
  /** Unique within the registry; the action's identity is kind + target scope. */
  actionKind: string;
  /** Knowledge time the definition was recorded (strict UTC). */
  recordedAt: string;
  description: string;
  tier: RecommendationPriorityTier;
  benefitClaim: BenefitClaim;
  /** `null` = goal-independent; otherwise the action is eligible only for an ACTIVE goal of one of these types. */
  applicableGoalTypes: ProductionGoalType[] | null;
  trigger: CandidateTrigger;
  /** Hard gates that must be PASS / NOT_APPLICABLE for the action to be actionable. */
  prerequisites: { sources: RecommendationGateSource[]; gateRuleIds: string[] };
  /** Context parts that must be supplied (absent ⇒ the action stays non-actionable, INSUFFICIENT_EVIDENCE). */
  evidenceRequirements: RecommendationContextPart[];
  effectModelRef: RecommendationModelRef | null;
  economicModelRef: RecommendationModelRef | null;
  assumptions: string[];
  limitations: string[];
}

export interface CandidateActionRegistry {
  registryId: string;
  version: string;
  definitions: CandidateActionDefinition[];
}

const OFFSET = object({ amount: int, unit: oneOfValues(OFFSET_UNITS) });
const MODEL_REF = object({ modelId: ref, version: ref });
const NON_EMPTY_KEYS = ["states", "statuses", "classifications"] as const;

const TRIGGER = kinded(
  "kind",
  {},
  {
    WEIGHT_MISSING_OR_STALE: { staleAfter: nullable(OFFSET) },
    OBLIGATION_STATE: { states: arrayOf(oneOfValues(OBLIGATION_STATES)) },
    WITHDRAWAL_STATE: { states: arrayOf(oneOfValues(WITHDRAWAL_GATE_STATES)) },
    PROGRAMME_ACTION_STATE: { states: arrayOf(oneOfValues(PROGRAMME_OCCURRENCE_STATES)), classifications: arrayOf(oneOfValues(PROGRAMME_CLASSIFICATIONS)), actionKinds: nullable(arrayOf(ref)) },
    GOAL_STATUS: { statuses: arrayOf(oneOfValues(C6_GOAL_STATUSES)) },
    UNCONDITIONAL: {},
  },
);

export const CANDIDATE_ACTION_DEFINITION_SPEC = object({
  actionKind: ref,
  recordedAt: instant,
  description: code,
  tier: oneOfValues(RECOMMENDATION_PRIORITY_TIERS),
  benefitClaim: oneOfValues(BENEFIT_CLAIMS),
  applicableGoalTypes: nullable(arrayOf(oneOfValues(PRODUCTION_GOAL_TYPES))),
  trigger: TRIGGER,
  prerequisites: object({ sources: arrayOf(oneOfValues(RECOMMENDATION_GATE_SOURCES)), gateRuleIds: arrayOf(ref) }),
  evidenceRequirements: arrayOf(oneOfValues(RECOMMENDATION_CONTEXT_PARTS)),
  effectModelRef: nullable(MODEL_REF),
  economicModelRef: nullable(MODEL_REF),
  assumptions: arrayOf(code),
  limitations: arrayOf(code),
});

const REGISTRY_HEADER = object({ registryId: ref, version: ref });
const REGISTRY_FIELDS = ["registryId", "version", "definitions"];

const unique = (values: readonly string[]) => new Set(values).size === values.length;

/** Semantic checks beyond shape: non-empty state lists, unique entries, non-negative staleness, benefit claim ⇔ models. */
function definitionCoherent(d: CandidateActionDefinition): boolean {
  const t = d.trigger as unknown as Record<string, unknown>;
  for (const k of NON_EMPTY_KEYS) if (Array.isArray(t[k]) && ((t[k] as string[]).length === 0 || !unique(t[k] as string[]))) return false;
  if (d.trigger.kind === "PROGRAMME_ACTION_STATE" && d.trigger.actionKinds !== null && (d.trigger.actionKinds.length === 0 || !unique(d.trigger.actionKinds))) return false;
  if (d.trigger.kind === "WEIGHT_MISSING_OR_STALE" && d.trigger.staleAfter !== null && d.trigger.staleAfter.amount < 0) return false;
  if (d.applicableGoalTypes !== null && (d.applicableGoalTypes.length === 0 || !unique(d.applicableGoalTypes))) return false;
  if (!unique(d.prerequisites.sources) || !unique(d.prerequisites.gateRuleIds) || !unique(d.evidenceRequirements)) return false;
  if (d.benefitClaim === "NONE" && (d.effectModelRef !== null || d.economicModelRef !== null)) return false;
  return true;
}

export type RegistryIssueCode =
  | "CATTLE_RECOMMENDATION_REGISTRY_INVALID"
  | "CATTLE_RECOMMENDATION_ACTION_DEFINITION_INVALID"
  | "CATTLE_RECOMMENDATION_ACTION_DEFINITION_UNREADABLE_KNOWLEDGE_TIME"
  | "CATTLE_RECOMMENDATION_ACTION_KIND_DUPLICATE_DIFFERENT_CONTENT";

export type RegistryAdmission =
  | { ok: true; registry: CandidateActionRegistry }
  | { ok: false; issues: { code: RegistryIssueCode; ref: string | null }[] };

/**
 * Admits a registry at `knowledgeCutoff` (canonical spelling): knowledge time
 * first, identity before validity, then validation of every admitted
 * definition. Returns the admitted definitions sorted by action kind.
 */
export function admitCandidateActionRegistry(raw: unknown, knowledgeCutoff: string): RegistryAdmission {
  if (!isPlainObject(raw) || !Array.isArray(raw.definitions) || !ownedValid(REGISTRY_HEADER, { registryId: raw.registryId, version: raw.version }) || Object.keys(raw).some((k) => !REGISTRY_FIELDS.includes(k))) {
    return { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_REGISTRY_INVALID", ref: null }] };
  }
  const issues: { code: RegistryIssueCode; ref: string | null }[] = [];
  const admitted: unknown[] = [];
  for (const d of raw.definitions as unknown[]) {
    const recordedAt = isPlainObject(d) ? canonicalObligationInstant(d.recordedAt) : null;
    if (recordedAt === null) {
      issues.push({ code: "CATTLE_RECOMMENDATION_ACTION_DEFINITION_UNREADABLE_KNOWLEDGE_TIME", ref: isPlainObject(d) && typeof d.actionKind === "string" ? d.actionKind : null });
      continue;
    }
    if (compareInstants(recordedAt, knowledgeCutoff) > 0) continue; // provably later: invisible, never validated
    admitted.push(d);
  }
  // Identity before validity: one action kind, one content (invalid copies included).
  const byKind = new Map<string, string>();
  for (const d of admitted) {
    const kind = (d as Record<string, unknown>).actionKind;
    if (typeof kind !== "string") continue;
    const key = ownedContentKey(d, ["recordedAt"]);
    const seen = byKind.get(kind);
    if (seen !== undefined && seen !== key) issues.push({ code: "CATTLE_RECOMMENDATION_ACTION_KIND_DUPLICATE_DIFFERENT_CONTENT", ref: kind });
    else byKind.set(kind, key);
  }
  const definitions = new Map<string, CandidateActionDefinition>();
  for (const d of admitted) {
    if (!ownedValid(CANDIDATE_ACTION_DEFINITION_SPEC, d) || !definitionCoherent(d as CandidateActionDefinition)) {
      issues.push({ code: "CATTLE_RECOMMENDATION_ACTION_DEFINITION_INVALID", ref: isPlainObject(d) && typeof d.actionKind === "string" ? d.actionKind : null });
      continue;
    }
    const def = withCanonicalInstants(d as CandidateActionDefinition, ["recordedAt"]);
    const kept = definitions.get(def.actionKind);
    definitions.set(def.actionKind, kept === undefined ? def : preferredSpelling(kept, def));
  }
  if (issues.length > 0) return { ok: false, issues: dedupeIssues(issues) };
  return {
    ok: true,
    registry: {
      registryId: raw.registryId as string,
      version: raw.version as string,
      definitions: [...definitions.values()].sort((a, b) => compareStrings(a.actionKind, b.actionKind)),
    },
  };
}

function dedupeIssues<T extends { code: string; ref: string | null }>(issues: T[]): T[] {
  const seen = new Set<string>();
  return issues
    .filter((i) => {
      const k = JSON.stringify([i.code, i.ref]);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => compareStrings(a.code, b.code) || compareStrings(a.ref ?? "", b.ref ?? ""));
}

export { dedupeIssues };

// ---------------------------------------------------------------------------
// The default production registry (data-gap / obligation actions only)
// ---------------------------------------------------------------------------

const DEFAULT_RECORDED_AT = "1970-01-01T00:00:00Z";
const NO_GATES = { sources: [], gateRuleIds: [] };
const DATA_GAP_LIMITATION = "CATTLE_RECOMMENDATION_DATA_GAP_ACTION_CLAIMS_NO_BENEFIT";

function dataGap(actionKind: string, tier: RecommendationPriorityTier, description: string, trigger: CandidateTrigger, evidenceRequirements: RecommendationContextPart[]): CandidateActionDefinition {
  return {
    actionKind,
    recordedAt: DEFAULT_RECORDED_AT,
    description,
    tier,
    benefitClaim: "NONE",
    applicableGoalTypes: null,
    trigger,
    prerequisites: NO_GATES,
    evidenceRequirements,
    effectModelRef: null,
    economicModelRef: null,
    assumptions: [],
    limitations: [DATA_GAP_LIMITATION],
  };
}

/**
 * Evidence-free defaults. Tier assignment follows the system-priority order:
 * resolving obligation evidence, unknown withdrawal status and due / overdue
 * VETERINARY programme actions are hard-obligation / welfare data gaps;
 * recording a missing weight and declaring a production goal are value of
 * information. No staleness interval and no veterinary-review default ship.
 */
export const DEFAULT_CANDIDATE_ACTION_REGISTRY: CandidateActionRegistry = deepFreezeAnimalValue({
  registryId: "CATTLE_DEFAULT_DATA_GAP_ACTIONS",
  version: "1",
  definitions: [
    dataGap(
      "COMPLETE_PROGRAMME_ACTION",
      "SAFETY_LEGAL_WELFARE",
      "Complete or record the due or overdue action of the declared veterinary programme",
      { kind: "PROGRAMME_ACTION_STATE", states: ["DUE", "OVERDUE"], classifications: ["VETERINARY_PROGRAMME"], actionKinds: null },
      ["PROGRAMMES"],
    ),
    dataGap("DECLARE_PRODUCTION_GOAL", "VALUE_OF_INFORMATION", "Declare a production goal for the animal (no declared goal is in force)", { kind: "GOAL_STATUS", statuses: ["NONE"] }, ["GOALS"]),
    dataGap("RECORD_WEIGHT", "VALUE_OF_INFORMATION", "Record a weight observation for the animal (no weight observation is in view)", { kind: "WEIGHT_MISSING_OR_STALE", staleAfter: null }, ["WEIGHTS"]),
    dataGap(
      "RESOLVE_OBLIGATION_EVIDENCE",
      "SAFETY_LEGAL_WELFARE",
      "Resolve the evidence of an outstanding, overdue or unknown obligation",
      { kind: "OBLIGATION_STATE", states: ["OUTSTANDING", "OVERDUE", "UNKNOWN"] },
      ["OBLIGATIONS"],
    ),
    dataGap("REVIEW_WITHDRAWAL_STATUS", "SAFETY_LEGAL_WELFARE", "Review the medicine withdrawal status (it is unknown for a food product)", { kind: "WITHDRAWAL_STATE", states: ["UNKNOWN"] }, ["HEALTH"]),
  ],
});

