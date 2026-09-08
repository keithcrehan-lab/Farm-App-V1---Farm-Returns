/**
 * V3 closure pass (second pass, mock-authority audit) — real alerts,
 * derived from this app's own real, wired V3 gates, replacing the
 * previous `mockAlerts` list (`src/data/mock-farm.ts`) that stood on the
 * Dashboard with no calculation behind any of its four entries.
 *
 * Deliberately narrow: only alerts this app can derive from calculations
 * that already exist and are already wired (commonage, buffer, soil-test
 * validity, NAP ceiling, the closed-period spreading calendar) are
 * included. `V3_IMPLEMENTATION_COVERAGE_MATRIX.md` named "Dashboard
 * AlertsCard (real alerts engine)... needs wiring 4 different real
 * gates" as a real, buildable, deferred item — this closes it for the
 * gates that are genuinely live today; it does not invent new
 * calculation scope (e.g. no fodder-budget/weather-based alert, since
 * this app's weather integration has no live feed wired to any screen —
 * see `spreading-legal-gate.ts`'s own doc comment).
 */

import { calculateNutrientPlan, farmGrasslandAggregates } from "./nutrients";
import { checkClosedPeriodCalendar, normaliseCountyForZoneLookup } from "./closed-period-calendar";
import type { Farm, Field, FarmAlert, LivestockGroup, SlurryAllocation } from "./types";

export const REAL_ALERTS_VERSION = "real_alerts_v1.0.0";

export interface DeriveRealAlertsInput {
  farm: Farm;
  fields: Field[];
  livestockGroups: LivestockGroup[];
  slurryAllocations: SlurryAllocation[];
  /** Injectable clock — same convention as `calculateNutrientPlan`'s own
   * `asOfDate`/`calculateLivestockEconomics`'s `today`, for deterministic
   * tests. Defaults to the real current date. */
  asOfDate?: string;
}

/**
 * One field-level alert per triggering condition, most severe first
 * within a field, fields in their existing farm order — deterministic,
 * not re-sorted by severity across fields (a farmer scanning the list
 * expects it to correspond to their own field order, not be reshuffled).
 */
export function deriveRealAlerts(input: DeriveRealAlertsInput): FarmAlert[] {
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  // Codex audit HIGH (round 11): the identical tillage-inclusive area
  // bug rounds 5/9/10 already fixed elsewhere — `calculateStatutoryGrasslandStockingRateKgHa`
  // (which `checkNapCompliance` below depends on) divides by this same
  // denominator, so a mixed grassland/tillage farm understated its real
  // statutory stocking rate here too.
  const { farmGrasslandAreaHa } = farmGrasslandAggregates(input.fields);
  const alerts: FarmAlert[] = [];

  // Farm-wide: is chemical fertiliser currently inside a closed period for
  // this farm's own county? Real, deterministic, needs no per-field data.
  const calendar = checkClosedPeriodCalendar({
    county: normaliseCountyForZoneLookup(input.farm.location.county),
    date: asOfDate,
    material: "chemical_fertiliser",
  });
  if (calendar.status === "LEGAL_PROHIBITION") {
    alerts.push({
      id: "real-alert-closed-period",
      severity: "risk",
      title: "Chemical fertiliser closed period",
      subtitle: `${input.farm.location.county} — spreading is currently prohibited (S.I. 588/2025)`,
      href: "/spreading",
    });
  }

  for (const field of input.fields) {
    const slurryAllocation = input.slurryAllocations.find((a) => a.fieldId === field.id);
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa,
      livestockGroups: input.livestockGroups,
      slurryAllocation,
      asOfDate,
    });

    if (plan.commonageFertiliserGate.status === "LEGAL_PROHIBITION") {
      alerts.push({
        id: `real-alert-commonage-${field.id}`,
        severity: "risk",
        title: "Chemical fertiliser blocked — commonage",
        subtitle: field.name,
        href: "/nutrients",
      });
    }

    if (plan.nationalBufferDistanceStatus.status === "LEGAL_PROHIBITION" || plan.localBufferOverrideStatus.status === "LEGAL_PROHIBITION") {
      alerts.push({
        id: `real-alert-buffer-${field.id}`,
        severity: "risk",
        title: "Water-buffer distance not met",
        subtitle: field.name,
        href: "/nutrients",
      });
    }

    if (plan.soilTestAgeValidity.status === "OK" && plan.soilTestAgeValidity.value === "DISREGARD") {
      alerts.push({
        id: `real-alert-soil-test-${field.id}`,
        severity: "attention",
        title: "Soil test disregarded — retest needed",
        subtitle: field.name,
        href: "/soil",
      });
    }

    // Codex audit HIGH (round 11): unlike the three alerts above (real,
    // valid for any field regardless of land use or livestock — a
    // commonage/buffer/soil-test-age status is a property of the field
    // itself, never derived from the grazing/agronomic ledger), the NAP-
    // ceiling alert is built from `checkNapCompliance`'s own real
    // statutory stocking-rate ledger — this app has no tillage N/P/K
    // table at all, and an empty `livestockGroups` read is genuinely
    // ambiguous between "confirmed zero" and "never entered" (the same
    // reasons `promptForFertiliserRecommendation` fails closed for
    // these two cases). A real, presented-as-real "exceeds NAP ceiling"
    // alert for a tillage field, or one derived from the unsupported
    // empty-herd calculation, would be a real, incorrect farmer-facing
    // compliance warning — never merely a display nicety.
    const napAlertEligible = field.plannedUse?.value !== "tillage" && input.livestockGroups.length > 0;
    if (napAlertEligible && plan.napCompliance.status === "OK" && (!plan.napCompliance.value.nWithinCeiling || !plan.napCompliance.value.pWithinCeiling)) {
      alerts.push({
        id: `real-alert-nap-ceiling-${field.id}`,
        severity: "attention",
        title: "Planned application exceeds NAP ceiling",
        subtitle: field.name,
        href: "/nutrients",
      });
    }
  }

  return alerts;
}
