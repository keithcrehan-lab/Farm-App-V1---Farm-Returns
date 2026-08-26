/**
 * Scientific engine V3 — Phase F1: `COMMONAGE_FERTILISER_GATE`.
 *
 * `ADVERSARIAL_AUDIT_REPORT.md` §1.1, the highest-risk finding: "Current
 * rules impose separate commonage controls... Farm Return therefore needs
 * a field-level commonage attribute and a hard compliance gate before
 * chemical-fertiliser recommendations." AF003 (CRITICAL). Built on Phase
 * C's `requireCommonageStatus` input gate and
 * `rules_statutory/commonage_rules_2026.csv`.
 *
 * Still imported by nothing in `src/app`/`src/components`/`src/store` —
 * no existing screen has a chemical-fertiliser recommendation flow that
 * consults this yet (`calculateNutrientPlan`'s purchased-product blend
 * doesn't check commonage status at all today; wiring that in is a
 * follow-up once this gate exists to wire in).
 */

import { legalProhibition, notApplicable, ok, type EngineOutcome } from "./evidence";

export const COMMONAGE_GATE_VERSION = "commonage_gate_v1.0.0";

/** `rules_statutory/commonage_rules_2026.csv`, row
 * `COMMONAGE_ORGANIC_N_STOCKING_ALLOWANCE`: "stocking rate allowance shall
 * not exceed 50 kg organic N/ha" (`LAW_IE_SI_588_2025`). */
export const COMMONAGE_ORGANIC_N_MAX_KG_HA = 50;

export type FertiliserMaterial = "chemical_fertiliser" | "organic_fertiliser_or_soiled_water";

/**
 * `rules_statutory/commonage_rules_2026.csv`, row
 * `COMMONAGE_NO_CHEMICAL_FERTILISER`: "chemical fertiliser shall not be
 * spread on commonage land". Organic fertiliser/soiled water is not
 * prohibited outright on commonage — it is separately capped, see
 * `checkCommonageOrganicNAllowanceKgHa` below — so this gate returns
 * `NOT_APPLICABLE` for that material rather than a false `PROHIBITED`.
 * `GFT081`/`GFT082`.
 */
export function checkCommonageFertiliserGate(
  commonageStatus: EngineOutcome<"commonage" | "not_commonage">,
  material: FertiliserMaterial,
): EngineOutcome<"PROHIBITED" | "NOT_APPLICABLE"> {
  if (commonageStatus.status !== "OK") return commonageStatus;
  if (commonageStatus.value === "not_commonage") {
    return notApplicable("COMMONAGE_GATE_NOT_APPLICABLE");
  }
  if (material === "chemical_fertiliser") {
    return legalProhibition(
      "COMMONAGE_NO_CHEMICAL_FERTILISER",
      "Chemical fertiliser shall not be spread on commonage land (S.I. 588/2025).",
    );
  }
  return notApplicable("COMMONAGE_GATE_NOT_APPLICABLE");
}

/**
 * `rules_statutory/commonage_rules_2026.csv`, row
 * `COMMONAGE_ORGANIC_N_STOCKING_ALLOWANCE`. Only meaningful on commonage
 * land — `NOT_APPLICABLE` on ordinary land, `BLOCKED_INSUFFICIENT_EVIDENCE`
 * if the commonage status itself couldn't be resolved, propagated from
 * the input gate.
 */
export function checkCommonageOrganicNAllowanceKgHa(
  commonageStatus: EngineOutcome<"commonage" | "not_commonage">,
  plannedOrganicNKgHa: number,
): EngineOutcome<{ withinAllowance: boolean; maxAllowanceKgHa: number }> {
  if (commonageStatus.status !== "OK") return commonageStatus;
  if (commonageStatus.value === "not_commonage") {
    return notApplicable("COMMONAGE_GATE_NOT_APPLICABLE");
  }
  return ok(
    { withinAllowance: plannedOrganicNKgHa <= COMMONAGE_ORGANIC_N_MAX_KG_HA, maxAllowanceKgHa: COMMONAGE_ORGANIC_N_MAX_KG_HA },
    "DERIVED",
  );
}
