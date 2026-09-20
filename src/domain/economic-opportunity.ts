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
  const occurrences = new Map<string, number>();
  for (const effect of effects) {
    const key = effect.creditClaim.creditKey;
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }
  const duplicateCreditKeys = [...occurrences.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  if (duplicateCreditKeys.length > 0) {
    return {
      valid: false,
      duplicateCreditKeys,
      reasonCode: "ECONOMIC_DUPLICATE_CREDIT_CLAIM",
      detail: `${duplicateCreditKeys.length} credit claim(s) are used by more than one effect in this assessment: ${duplicateCreditKeys.join(", ")}. Two economic effects must never independently take credit for the same underlying economic change. This check only detects an exact duplicate creditKey — partial/overlapping resource claims are a known future responsibility, not resolved here.`,
    };
  }
  return { valid: true, duplicateCreditKeys: [] };
}

// ---------------------------------------------------------------------------
// Combined structural validation — the two checks above run together,
// since a real assessment needs both to be structurally valid.
// ---------------------------------------------------------------------------
export interface AssessmentStructuralValidationResult {
  valid: boolean;
  counterfactual: CounterfactualValidationResult;
  doubleCounting: DoubleCountingValidationResult;
}

export function validateAssessmentStructure(assessment: EconomicOpportunityAssessment): AssessmentStructuralValidationResult {
  const counterfactual = validateCounterfactualStructure(assessment.scenarios);
  const doubleCounting = validateNoDuplicateCreditClaims(assessment.effects);
  return { valid: counterfactual.valid && doubleCounting.valid, counterfactual, doubleCounting };
}
