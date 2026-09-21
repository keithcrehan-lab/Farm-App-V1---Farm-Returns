/**
 * Economic Opportunity Engine, Phase 1 — auditable domain foundation.
 * Full invariants and worked examples:
 * `docs/farm-return-next/DOMAIN_CONTRACTS.md`'s "Economic Opportunity
 * Engine" section.
 *
 * This module is a DOMAIN TYPE layer only. It is not yet: persisted,
 * ranked, displayed, connected to slurry, or connected to Today. No
 * market price, fertiliser cost, slurry value, ROI or opportunity-ranking
 * calculation is implemented here — Phase 2+'s job, not this one's.
 *
 * Deliberately reuses, rather than duplicates, this codebase's existing
 * provenance/fail-closed vocabulary: `EngineOutcome<T>`/`EvidenceState`
 * (`./evidence`) for every quantified-or-not monetary result, and
 * `MoneyAmount`/`CurrencyCode` (`./money`) for every amount. There is no
 * `EconomicEvidenceState` or `EconomicDataStatus` — a second, competing
 * confidence/status vocabulary was explicitly ruled out for this phase.
 */

import type { EngineOutcome } from "./evidence";
import type { MoneyAmount } from "./money";
import { compareMoney } from "./money";

/** Normalises a `creditKey` for comparison only (trim + lowercase) — never
 * for storage or display, which keep the caller's original string. This
 * closes the gap where "field:F1:N" and "FIELD:F1:N" would otherwise be
 * treated as two distinct claims over what is, in substance, the exact
 * same real-world resource/event — a formatting difference, not a
 * legitimate second claim. It intentionally does NOT attempt anything
 * beyond trim/case folding (e.g. it does not treat "F1:N" and
 * "field:F1:nitrogen" as equivalent) — that is real partial-overlap
 * resolution, an explicit known future responsibility this phase does not
 * guess at (see `validateNoDuplicateCreditClaims`). */
function normaliseCreditKeyForComparison(creditKey: string): string {
  return creditKey.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// VAT — vocabulary/shape only (§D). No VAT calculation happens in this
// phase; `"unknown"` must round-trip unchanged, never silently resolved
// to "exclusive"/"0%"/etc. Naming intentionally aligned with the unmerged
// `managed-quote-pilot` worktree's own `vat_treatment` enum (Phase 0's
// audit found it materially well-designed) — vocabulary only; this module
// imports none of that worktree's code, tables or migrations.
// ---------------------------------------------------------------------------
export type VatTreatment = "exclusive" | "inclusive" | "exempt" | "unknown";

// ---------------------------------------------------------------------------
// Price basis — vocabulary only (§E). No price resolver is built here;
// naming again intentionally aligned with the same worktree's
// `price_basis` enum for the same reason as VatTreatment above.
// ---------------------------------------------------------------------------
export type PriceBasis = "per_kg" | "per_tonne" | "per_bag" | "per_unit" | "lump_sum";

// ---------------------------------------------------------------------------
// Cash vs economic impact (§3E). A type-level distinction only in this
// phase — nothing here calculates either.
// ---------------------------------------------------------------------------
export type EconomicImpactKind = "CASH" | "ECONOMIC";

// ---------------------------------------------------------------------------
// Economic effect type (§3C) — a small, reviewed starter vocabulary, not
// a closed enum. Mirrors `evidence.ts`'s own `REASON_CODES`/
// `isRegisteredReasonCode` pattern exactly: the type stays a plain
// `string` so a future economic module can ship a new, real effect type
// before this list is updated, while `isRegisteredEconomicEffectType`
// flags an unregistered one for review rather than rejecting it outright.
// ---------------------------------------------------------------------------
export const ECONOMIC_EFFECT_TYPES = [
  "AVOIDED_FERTILISER_PURCHASE",
  /** Phase 5 (Slurry Direct Economic Assessment V1) — deliberately more
   * precise than `AVOIDED_FERTILISER_PURCHASE` for a plan-cost-difference
   * result: the evidence is a baseline-vs-intervention INDICATIVE
   * fertiliser-plan cost comparison (Phase 4), never proof that a farmer
   * actually purchased, or will purchase, less fertiliser — using
   * `AVOIDED_FERTILISER_PURCHASE` here would overstate what the evidence
   * proves. */
  "AVOIDED_FERTILISER_PLAN_COST",
  "ADDITIONAL_INPUT_COST",
  "APPLICATION_COST",
  "TRANSPORT_COST",
  "CONTRACTOR_COST",
] as const;

export type EconomicEffectType = string;

export function isRegisteredEconomicEffectType(type: string): type is (typeof ECONOMIC_EFFECT_TYPES)[number] {
  return (ECONOMIC_EFFECT_TYPES as readonly string[]).includes(type);
}

// ---------------------------------------------------------------------------
// Counterfactual scenarios (§3A). Deterministic, caller-supplied,
// serialisable identity — never a randomly generated id.
// ---------------------------------------------------------------------------
export interface EconomicScenario {
  /** Deterministic and unique within one assessment, e.g. "baseline". */
  id: string;
  role: "baseline" | "intervention";
  label: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Credit claim / resource claim (§3D). The structural double-counting
// guard: an identity for the underlying real-world resource/economic
// event an effect claims credit for. Deliberately narrow — this detects
// an EXACT duplicate claim only. Partial/overlapping resource claims
// (e.g. two claims over the same field but different nutrient elements)
// are NOT resolved here; that is an explicit known future responsibility,
// not guessed at in Phase 1.
// ---------------------------------------------------------------------------
export interface EconomicCreditClaim {
  /** Deterministic identity of the underlying resource/economic event,
   * e.g. "field:F1:slurry-allocation:2026-09-01:N". Two effects sharing
   * the exact same creditKey inside one assessment are claiming credit
   * for the same underlying change — see validateNoDuplicateCreditClaims. */
  creditKey: string;
  /** What this key refers to, for a human/auditor reading the claim. */
  resourceDescription: string;
  scopeFieldId?: string;
  quantity?: number;
  /** When this claim's resource is measured in a `units.ts`-registered
   * `Quantity`, this should be one of that quantity's own canonical/
   * accepted unit strings (`src/domain/units.ts`) — Phase 1 performs no
   * conversion itself (see DOMAIN_CONTRACTS.md §7); this field is
   * documentary/structural alignment only, not runtime-enforced yet. */
  unit?: string;
}

// ---------------------------------------------------------------------------
// Economic effect (§3C). Every monetary effect has an explicit semantic
// identity, an explicit benefit/cost direction, an explicit cash-vs-
// economic classification, and its own EngineOutcome<MoneyAmount> — a
// genuine €0 result and a missing/unsupported result are structurally
// distinct, never converted into each other (§3B).
// ---------------------------------------------------------------------------
export interface EconomicEffect {
  /** Deterministic and unique within one assessment. */
  id: string;
  type: EconomicEffectType;
  direction: "benefit" | "cost";
  impactKind: EconomicImpactKind;
  /** The monetary outcome, wrapped in the same fail-closed EngineOutcome
   * every scientific calculation already returns. `ok(zeroMoney(...), ...)`
   * is a real, successful €0 result; anything else (missing price,
   * unsupported calculation, ...) is a non-OK status and must never be
   * read as if it were €0. */
  amount: EngineOutcome<MoneyAmount>;
  vatTreatment: VatTreatment;
  priceBasis?: PriceBasis;
  creditClaim: EconomicCreditClaim;
  /** Which EconomicScenario (by id) this effect belongs to. */
  scenarioId: string;
  /** Methodology caveats specific to this effect (§3G) — belong in the
   * domain result, not disconnected UI copy. */
  limitations?: string[];
}

// ---------------------------------------------------------------------------
// Value range (§3F). Only ever constructed from three real values a
// caller already has — this type cannot silently invent an absent lower
// or upper bound, and createEconomicValueRange rejects an out-of-order or
// mixed-currency triple rather than guessing a fix.
// ---------------------------------------------------------------------------
export interface EconomicValueRange {
  lower: MoneyAmount;
  central: MoneyAmount;
  upper: MoneyAmount;
}

export function createEconomicValueRange(lower: MoneyAmount, central: MoneyAmount, upper: MoneyAmount): EconomicValueRange {
  if (lower.currency !== central.currency || central.currency !== upper.currency) {
    throw new Error("EconomicValueRange: lower/central/upper must share one currency — Farm Return performs no FX conversion.");
  }
  if (compareMoney(lower, central) > 0 || compareMoney(central, upper) > 0) {
    throw new Error(
      `EconomicValueRange: bounds out of order (expected lower <= central <= upper); got lower=${lower.amount}, central=${central.amount}, upper=${upper.amount}. Never fabricate a range — construct one only from real values that already satisfy this ordering.`,
    );
  }
  return { lower, central, upper };
}

// ---------------------------------------------------------------------------
// Assessment (§4). A domain type only in Phase 1 — not persisted, not
// ranked, not displayed, not wired to slurry or Today. No aggregate
// incremental-value field exists yet: summing effects into one figure is
// a real methodology decision (partial-overlap credit assignment,
// cash-vs-economic separation) this phase deliberately does not make.
// ---------------------------------------------------------------------------
export interface EconomicOpportunityAssessment {
  /** Deterministic and caller-supplied, never randomly generated. */
  id: string;
  title: string;
  scenarios: EconomicScenario[];
  effects: EconomicEffect[];
  /** Methodology caveats for the assessment as a whole (§3G), e.g. "Costs
   * the current Farm Return fertiliser allocation plan; does not claim
   * global least-cost optimisation." */
  limitations: string[];
  /** ISO datetime — never a `Date` instance (serialisability, §10). */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Counterfactual structural validation (§3A/§8).
// ---------------------------------------------------------------------------
export interface CounterfactualValidationResult {
  valid: boolean;
  reasonCode?: string;
  detail?: string;
}

export function validateCounterfactualStructure(scenarios: readonly EconomicScenario[]): CounterfactualValidationResult {
  const hasBaseline = scenarios.some((scenario) => scenario.role === "baseline");
  const hasIntervention = scenarios.some((scenario) => scenario.role === "intervention");
  if (!hasBaseline) {
    return {
      valid: false,
      reasonCode: "ECONOMIC_ASSESSMENT_MISSING_BASELINE_SCENARIO",
      detail: "No baseline scenario — what is expected to happen without the evaluated change. No economic return exists without an explicit comparison.",
    };
  }
  if (!hasIntervention) {
    return {
      valid: false,
      reasonCode: "ECONOMIC_ASSESSMENT_MISSING_INTERVENTION_SCENARIO",
      detail: "No intervention scenario — what changes. No economic return exists without an explicit comparison.",
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Double-counting structural validation (§3D/§9). Detects only an EXACT
// duplicate creditKey shared by more than one effect inside one
// assessment — deliberately not a resource allocator or partial-overlap
// resolver.
// ---------------------------------------------------------------------------
export interface DoubleCountingValidationResult {
  valid: boolean;
  duplicateCreditKeys: string[];
  reasonCode?: string;
  detail?: string;
}

export function validateNoDuplicateCreditClaims(effects: readonly EconomicEffect[]): DoubleCountingValidationResult {
  // Keyed by the normalised form so "field:F1:N" and "FIELD:F1:N" collide
  // as the same claim; the ORIGINAL strings seen are kept per bucket so
  // the reported duplicateCreditKeys stay readable/auditable rather than
  // silently rewriting the caller's own text.
  const occurrences = new Map<string, { count: number; originalKeys: Set<string> }>();
  for (const effect of effects) {
    const key = effect.creditClaim.creditKey;
    const normalised = normaliseCreditKeyForComparison(key);
    const bucket = occurrences.get(normalised) ?? { count: 0, originalKeys: new Set<string>() };
    bucket.count += 1;
    bucket.originalKeys.add(key);
    occurrences.set(normalised, bucket);
  }
  const duplicateCreditKeys = [...occurrences.values()]
    .filter((bucket) => bucket.count > 1)
    .flatMap((bucket) => [...bucket.originalKeys]);
  if (duplicateCreditKeys.length > 0) {
    return {
      valid: false,
      duplicateCreditKeys,
      reasonCode: "ECONOMIC_DUPLICATE_CREDIT_CLAIM",
      detail: `${duplicateCreditKeys.length} credit claim(s) are used by more than one effect in this assessment: ${duplicateCreditKeys.join(", ")}. Two economic effects must never independently take credit for the same underlying economic change. This check normalises creditKey (trim + case fold) before comparing, so formatting differences over the same real event still collide — but it only detects that exact-in-substance duplicate; partial/overlapping resource claims (e.g. two claims over the same field but different nutrient elements) are a known future responsibility, not resolved here.`,
    };
  }
  return { valid: true, duplicateCreditKeys: [] };
}

// ---------------------------------------------------------------------------
// Scenario-reference structural validation. `validateCounterfactualStructure`
// only checks that a baseline/intervention *role* is present somewhere in
// the scenario list — it does not check that every effect actually points
// at a scenario that exists, or that scenario ids are themselves unique.
// Both are real structural-validity questions distinct from the
// baseline/intervention-presence check, so they get their own validator
// rather than being silently folded into (and conflated with) it.
// ---------------------------------------------------------------------------
export interface ScenarioReferenceValidationResult {
  valid: boolean;
  duplicateScenarioIds: string[];
  orphanEffectIds: string[];
  reasonCode?: string;
  detail?: string;
}

export function validateScenarioReferences(
  scenarios: readonly EconomicScenario[],
  effects: readonly EconomicEffect[],
): ScenarioReferenceValidationResult {
  const scenarioIdCounts = new Map<string, number>();
  for (const scenario of scenarios) {
    scenarioIdCounts.set(scenario.id, (scenarioIdCounts.get(scenario.id) ?? 0) + 1);
  }
  const duplicateScenarioIds = [...scenarioIdCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);

  const knownScenarioIds = new Set(scenarioIdCounts.keys());
  const orphanEffectIds = effects.filter((effect) => !knownScenarioIds.has(effect.scenarioId)).map((effect) => effect.id);

  if (duplicateScenarioIds.length > 0) {
    return {
      valid: false,
      duplicateScenarioIds,
      orphanEffectIds,
      reasonCode: "ECONOMIC_ASSESSMENT_DUPLICATE_SCENARIO_ID",
      detail: `${duplicateScenarioIds.length} scenario id(s) are used by more than one scenario in this assessment: ${duplicateScenarioIds.join(", ")}. A scenario id must be unique within an assessment — a duplicate id makes any effect.scenarioId referencing it structurally ambiguous.`,
    };
  }
  if (orphanEffectIds.length > 0) {
    return {
      valid: false,
      duplicateScenarioIds: [],
      orphanEffectIds,
      reasonCode: "ECONOMIC_EFFECT_ORPHAN_SCENARIO_REFERENCE",
      detail: `${orphanEffectIds.length} effect(s) reference a scenarioId that does not match any declared scenario: ${orphanEffectIds.join(", ")}. Every effect must belong to a real baseline or intervention scenario in the same assessment.`,
    };
  }
  return { valid: true, duplicateScenarioIds: [], orphanEffectIds: [] };
}

// ---------------------------------------------------------------------------
// Sign-consistency structural validation. `EconomicEffect.direction`
// ("benefit" | "cost") and `MoneyAmount.amount` (which can itself be
// negative — see money.ts) are two independent places sign could be
// expressed. Left unchecked, `{ direction: "cost", amount: "-100" }` is a
// double negative with no single unambiguous reading (a cost of -€100? a
// benefit mis-tagged as a cost?). This validator enforces the one
// unambiguous convention: `direction` alone carries sign, so a quantified
// `amount` must always be a non-negative magnitude.
// ---------------------------------------------------------------------------
export interface SignConsistencyValidationResult {
  valid: boolean;
  ambiguousEffectIds: string[];
  reasonCode?: string;
  detail?: string;
}

export function validateEffectSignConsistency(effects: readonly EconomicEffect[]): SignConsistencyValidationResult {
  const ambiguousEffectIds = effects
    .filter((effect) => effect.amount.status === "OK" && effect.amount.value.amount.startsWith("-"))
    .map((effect) => effect.id);
  if (ambiguousEffectIds.length > 0) {
    return {
      valid: false,
      ambiguousEffectIds,
      reasonCode: "ECONOMIC_EFFECT_AMBIGUOUS_SIGNED_AMOUNT",
      detail: `${ambiguousEffectIds.length} effect(s) have a negative MoneyAmount alongside an explicit direction: ${ambiguousEffectIds.join(", ")}. direction ("benefit"|"cost") is this domain's one sign convention — amount must be a non-negative magnitude, never itself negative, to avoid an ambiguous double negative.`,
    };
  }
  return { valid: true, ambiguousEffectIds: [] };
}

// ---------------------------------------------------------------------------
// Combined structural validation — the two checks above run together,
// since a real assessment needs both to be structurally valid.
// ---------------------------------------------------------------------------
export interface AssessmentStructuralValidationResult {
  valid: boolean;
  counterfactual: CounterfactualValidationResult;
  doubleCounting: DoubleCountingValidationResult;
  scenarioReferences: ScenarioReferenceValidationResult;
  signConsistency: SignConsistencyValidationResult;
}

export function validateAssessmentStructure(assessment: EconomicOpportunityAssessment): AssessmentStructuralValidationResult {
  const counterfactual = validateCounterfactualStructure(assessment.scenarios);
  const doubleCounting = validateNoDuplicateCreditClaims(assessment.effects);
  const scenarioReferences = validateScenarioReferences(assessment.scenarios, assessment.effects);
  const signConsistency = validateEffectSignConsistency(assessment.effects);
  return {
    valid: counterfactual.valid && doubleCounting.valid && scenarioReferences.valid && signConsistency.valid,
    counterfactual,
    doubleCounting,
    scenarioReferences,
    signConsistency,
  };
}
