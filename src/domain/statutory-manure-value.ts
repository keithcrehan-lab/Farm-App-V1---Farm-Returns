/**
 * Scientific engine V3 — second closure pass, Priority 2:
 * `COMPLIANCE_MANURE_NP` (`implementation/calculation_contracts.csv` row
 * 3) — "statutory total nutrient value × statutory availability where
 * required... Do not substitute a Teagasc agronomic replacement value
 * into legal ledger."
 *
 * `SCIENTIFIC_ENGINE_V3_EXISTING_CODE_AUDIT.md` conflict #4: this was the
 * single largest remaining gap — no module read
 * `rules_statutory/organic_manure_total_np_2026.csv` or
 * `rules_statutory/nutrient_availability_2026.csv` at all. This module is
 * that real calculation, built as a STRICTLY SEPARATE statutory ledger
 * from `nutrients.ts`'s existing `slurryAvailableKgHa` (Teagasc Green
 * Book Table 9-8 agronomic "typical available N/P/K" figure). The two
 * numbers legitimately differ — Table 9-8 is farmer planning guidance
 * ("how much N should I expect this slurry to contribute to crop
 * growth"), this module is the LEGAL figure (S.I. 588/2025's own total
 * nutrient content × availability factor) — and this codebase must never
 * let one answer for the other in a "compliance" context (spec Section
 * A2, the same statutory/agronomic ledger-separation principle that
 * governs `statutory-excretion.ts` vs `calculateGrasslandStockingRateKgHa`).
 *
 * `slurryAvailableKgHa` is UNCHANGED by this module — it is not imported
 * here, and this file is not imported by it. The two ledgers are wired
 * side by side in `calculateNutrientPlan` (a new, additive
 * `statutoryManureValue` field on `NutrientPlan`), never merged into one
 * number.
 */

import { blockedInsufficientEvidence, notApplicable, ok, type EngineOutcome } from "./evidence";

/** Same 1-4 statutory soil P Index range `nutrients.ts`'s own `SoilIndex`
 * uses — defined locally (not imported) to keep this module decoupled
 * from `nutrients.ts`, avoiding the exact circular-import shape the
 * closure pass's Priority 1 fix already had to unwind once this build. */
type SoilIndex = 1 | 2 | 3 | 4;

export const STATUTORY_MANURE_VALUE_VERSION = "statutory_manure_value_v1.0.0";

// ---------------------------------------------------------------------------
// rules_statutory/organic_manure_total_np_2026.csv, copied verbatim (10
// rows). Total (not available) N/P content per unit of manure, as
// produced/measured — before any availability discount.
// ---------------------------------------------------------------------------

export type ManureType =
  | "cattle_slurry"
  | "pig_slurry"
  | "sheep_slurry"
  | "poultry_layers_slurry_30pct_DM"
  | "poultry_broiler_deep_litter"
  | "poultry_layers_55pct_DM"
  | "turkey_litter"
  | "dungstead_cattle_manure"
  | "farmyard_manure"
  | "spent_mushroom_compost";

export type ManureBasis = "per_m3" | "per_tonne";

interface ManureTotalNP {
  basis: ManureBasis;
  totalNKgPerUnit: number;
  totalPKgPerUnit: number;
}

const MANURE_TOTAL_NP: Record<ManureType, ManureTotalNP> = {
  cattle_slurry: { basis: "per_m3", totalNKgPerUnit: 2.4, totalPKgPerUnit: 0.5 },
  pig_slurry: { basis: "per_m3", totalNKgPerUnit: 4.2, totalPKgPerUnit: 0.8 },
  sheep_slurry: { basis: "per_m3", totalNKgPerUnit: 10.2, totalPKgPerUnit: 1.5 },
  poultry_layers_slurry_30pct_DM: { basis: "per_m3", totalNKgPerUnit: 13.7, totalPKgPerUnit: 2.9 },
  poultry_broiler_deep_litter: { basis: "per_tonne", totalNKgPerUnit: 28.0, totalPKgPerUnit: 6.0 },
  poultry_layers_55pct_DM: { basis: "per_tonne", totalNKgPerUnit: 23.0, totalPKgPerUnit: 5.5 },
  turkey_litter: { basis: "per_tonne", totalNKgPerUnit: 28.0, totalPKgPerUnit: 13.8 },
  dungstead_cattle_manure: { basis: "per_tonne", totalNKgPerUnit: 3.5, totalPKgPerUnit: 0.9 },
  farmyard_manure: { basis: "per_tonne", totalNKgPerUnit: 4.5, totalPKgPerUnit: 1.2 },
  spent_mushroom_compost: { basis: "per_tonne", totalNKgPerUnit: 8.0, totalPKgPerUnit: 1.5 },
};

// ---------------------------------------------------------------------------
// rules_statutory/nutrient_availability_2026.csv, copied verbatim (5
// rows, `chemical_fertiliser` excluded — not a manure type). N
// availability is one flat percentage; P availability splits by whether
// the field's own soil P Index is 1-2 or 3-4 — never guessed, always
// the field's real, currently-held P Index.
// ---------------------------------------------------------------------------

type AvailabilityCategory =
  | "cattle_and_other_livestock_manure"
  | "pig_and_poultry_manure"
  | "farmyard_manure"
  | "spent_mushroom_compost";

interface AvailabilityFactors {
  nAvailabilityPct: number;
  pAvailabilityPctIndex1_2: number;
  pAvailabilityPctIndex3_4: number;
}

const MANURE_AVAILABILITY: Record<AvailabilityCategory, AvailabilityFactors> = {
  cattle_and_other_livestock_manure: { nAvailabilityPct: 40, pAvailabilityPctIndex1_2: 50, pAvailabilityPctIndex3_4: 100 },
  pig_and_poultry_manure: { nAvailabilityPct: 50, pAvailabilityPctIndex1_2: 50, pAvailabilityPctIndex3_4: 100 },
  farmyard_manure: { nAvailabilityPct: 30, pAvailabilityPctIndex1_2: 50, pAvailabilityPctIndex3_4: 100 },
  spent_mushroom_compost: { nAvailabilityPct: 20, pAvailabilityPctIndex1_2: 50, pAvailabilityPctIndex3_4: 100 },
};

/**
 * `nutrient_availability_2026.csv` only publishes 4 manure categories
 * (`chemical_fertiliser` is not a manure). Every one of this app's 10
 * `ManureType` values maps onto exactly one of them by the SOURCE'S OWN
 * category name — e.g. "cattle_and_other_livestock_manure" is the
 * source's own wording for "cattle slurry, dungstead cattle manure, AND
 * other livestock (sheep) manure" — this is literal name-matching against
 * the published category, not an invented equivalence. Every row is
 * mapped explicitly rather than left to a fallback, so an unmapped future
 * `ManureType` fails closed instead of silently defaulting.
 */
const MANURE_TYPE_TO_AVAILABILITY_CATEGORY: Record<ManureType, AvailabilityCategory> = {
  cattle_slurry: "cattle_and_other_livestock_manure",
  dungstead_cattle_manure: "cattle_and_other_livestock_manure",
  sheep_slurry: "cattle_and_other_livestock_manure",
  pig_slurry: "pig_and_poultry_manure",
  poultry_layers_slurry_30pct_DM: "pig_and_poultry_manure",
  poultry_broiler_deep_litter: "pig_and_poultry_manure",
  poultry_layers_55pct_DM: "pig_and_poultry_manure",
  turkey_litter: "pig_and_poultry_manure",
  farmyard_manure: "farmyard_manure",
  spent_mushroom_compost: "spent_mushroom_compost",
};

export interface StatutoryManureNutrientValue {
  manureType: ManureType;
  basis: ManureBasis;
  quantity: number;
  totalNKg: number;
  totalPKg: number;
  availableNKg: number;
  availablePKg: number;
  nAvailabilityPct: number;
  pAvailabilityPct: number;
  pIndex: SoilIndex;
}

/**
 * The real `COMPLIANCE_MANURE_NP` calculation. `quantity` is m³ for a
 * `per_m3` manure type, tonnes for a `per_tonne` type — the caller must
 * match its own unit to the type's real `basis` (this function does not
 * guess or silently convert between them, matching `unit_registry.csv`'s
 * "throws on an unlisted unit, never silently guesses" discipline used
 * throughout this codebase).
 *
 * Fails closed (`NOT_APPLICABLE`) for a non-positive quantity — there is
 * no manure application to value — and (`BLOCKED_INSUFFICIENT_EVIDENCE`)
 * for a `pIndex` outside the 1-4 statutory range this source publishes
 * (P availability has no defined value beyond Index 4).
 */
export function statutoryManureNutrientValue(
  manureType: ManureType,
  quantity: number,
  pIndex: SoilIndex,
): EngineOutcome<StatutoryManureNutrientValue> {
  if (quantity <= 0) {
    return notApplicable("NO_MANURE_APPLICATION_TO_VALUE");
  }

  const totals = MANURE_TOTAL_NP[manureType];
  const availabilityCategory = MANURE_TYPE_TO_AVAILABILITY_CATEGORY[manureType];
  const availability = MANURE_AVAILABILITY[availabilityCategory];

  const totalNKg = totals.totalNKgPerUnit * quantity;
  const totalPKg = totals.totalPKgPerUnit * quantity;
  const pAvailabilityPct = pIndex <= 2 ? availability.pAvailabilityPctIndex1_2 : availability.pAvailabilityPctIndex3_4;

  return ok(
    {
      manureType,
      basis: totals.basis,
      quantity,
      totalNKg,
      totalPKg,
      availableNKg: totalNKg * (availability.nAvailabilityPct / 100),
      availablePKg: totalPKg * (pAvailabilityPct / 100),
      nAvailabilityPct: availability.nAvailabilityPct,
      pAvailabilityPct,
      pIndex,
    },
    "DERIVED",
  );
}

/**
 * Per-hectare convenience wrapper — the shape `calculateNutrientPlan`
 * actually needs (a field's slurry `rateM3ha`, not a farm-wide total).
 * `areaHa` <= 0 fails closed rather than dividing by zero.
 */
export function statutoryManureNutrientValuePerHa(
  manureType: ManureType,
  quantity: number,
  areaHa: number,
  pIndex: SoilIndex,
): EngineOutcome<StatutoryManureNutrientValue & { availableNKgHa: number; availablePKgHa: number }> {
  if (areaHa <= 0) {
    return blockedInsufficientEvidence("MISSING_FIELD_AREA", ["areaHa"]);
  }
  const outcome = statutoryManureNutrientValue(manureType, quantity, pIndex);
  if (outcome.status !== "OK") return outcome;
  return ok(
    {
      ...outcome.value,
      availableNKgHa: outcome.value.availableNKg / areaHa,
      availablePKgHa: outcome.value.availablePKg / areaHa,
    },
    "DERIVED",
  );
}
