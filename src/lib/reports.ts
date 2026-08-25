/**
 * Reports screen CSV builders — real per-field data, not a summary
 * re-typed by hand. Each function calls the same real domain engines the
 * live screens already use (nutrients.ts's `calculateNutrientPlan` is the
 * exact call `/nutrients` and `/fields`'s Fertiliser Plan tab make) and
 * serialises the result with `lib/csv.ts`. Presentation/export logic, not
 * a calculation of its own — nothing here computes a number that isn't
 * already produced by an existing, tested domain function.
 *
 * Only the three reports whose underlying domain engine is real get a
 * builder here: Nutrient Plan (nutrients.ts), Soil Test History (the real
 * verified-soil-test flow), and Farm Plan Summary (Phase 2's real field
 * model). "Financial Summary" has none — `mockFinanceSummary`/
 * `mockCashflow` (revenue, costs, margin, cashflow curve) are still Phase 1
 * mock, so a real export of them would just be exporting invented numbers
 * with a CSV wrapper; that report stays disabled on `/reports` until a
 * real sales-plan/sales-log data source closes that gap (see README.md).
 */

import { toCsv } from "./csv";
import { calculateNutrientPlan } from "@/domain/nutrients";
import type { Field, LivestockGroup, SilagePlan, SlurryAllocation } from "@/domain/types";

export function buildNutrientPlanReportCsv(
  fields: Field[],
  livestockGroups: LivestockGroup[],
  slurryAllocations: SlurryAllocation[],
  silagePlans: SilagePlan[],
): string {
  const farmGrasslandAreaHa = fields.reduce((sum, f) => sum + f.areaHa, 0);

  const rows = fields.map((field) => {
    const silagePlan = silagePlans.find((p) => p.fieldId === field.id);
    const slurryAllocation = slurryAllocations.find((a) => a.fieldId === field.id);
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa,
      livestockGroups,
      slurryAllocation,
      silage: silagePlan
        ? {
            cutNumber: silagePlan.cutNumber,
            expectedYieldTDMha: silagePlan.expectedYieldTDMha.value,
            intendedUse: silagePlan.intendedUse,
          }
        : undefined,
    });
    const productsSummary = plan.purchasedProducts
      .map((p) => `${p.name} ${p.totalKg}kg (€${p.costEur})`)
      .join("; ");

    return [
      field.name,
      field.areaHa,
      silagePlan ? `Silage cut ${silagePlan.cutNumber}` : "Grazing",
      plan.requirement.value.n,
      plan.requirement.value.p,
      plan.requirement.value.k,
      plan.organicApplication.offsetN,
      plan.organicApplication.offsetP,
      plan.organicApplication.offsetK,
      productsSummary,
      plan.estimatedFieldCostEur,
      plan.napCompliance.nWithinCeiling ? "Yes" : "No",
      plan.napCompliance.pWithinCeiling ? "Yes" : "No",
      plan.napCompliance.regulatory,
      plan.calculationVersion,
    ];
  });

  return toCsv(
    [
      "Field",
      "Area (ha)",
      "Land use",
      "N requirement (kg/ha)",
      "P requirement (kg/ha)",
      "K requirement (kg/ha)",
      "Organic N offset (kg/ha)",
      "Organic P offset (kg/ha)",
      "Organic K offset (kg/ha)",
      "Purchased products",
      "Estimated cost (EUR)",
      "N within NAP ceiling",
      "P within NAP ceiling",
      "Regulatory status",
      "Calculation version",
    ],
    rows,
  );
}

export function buildSoilTestHistoryReportCsv(fields: Field[]): string {
  const rows = fields.map((field) => {
    const test = field.fertility.verifiedTest;
    return [
      field.name,
      field.fertility.pIndex.value,
      field.fertility.pIndex.status,
      field.fertility.kIndex.value,
      field.fertility.kIndex.status,
      field.fertility.pH?.value ?? "",
      test?.sampleDate ?? "",
      test?.laboratory ?? "",
      test?.sampleRef ?? "",
      test?.p ?? "",
      test?.k ?? "",
    ];
  });

  return toCsv(
    [
      "Field",
      "P index",
      "P index status",
      "K index",
      "K index status",
      "pH",
      "Verified test date",
      "Laboratory",
      "Sample reference",
      "Lab P (mg/l)",
      "Lab K (mg/l)",
    ],
    rows,
  );
}

export function buildFarmPlanSummaryReportCsv(fields: Field[]): string {
  const rows = fields.map((field) => [
    field.name,
    field.areaHa,
    field.plannedUse.value,
    field.plannedUse.status,
    field.mappedSoil.soilAssociation,
    field.mappedSoil.dominantSeries,
    field.mappedSoil.drainage,
    field.polygon ? "Mapped (real boundary)" : "Not yet mapped",
  ]);

  return toCsv(
    [
      "Field",
      "Area (ha)",
      "Planned use",
      "Planned use status",
      "Soil association",
      "Dominant series",
      "Drainage",
      "Boundary status",
    ],
    rows,
  );
}
