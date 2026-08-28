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

  // V3 closure pass, Priority 1 (AF011): real non-grass eligible area,
  // computed from the actual farm's fields — see nutrients/page.tsx's
  // identical comment for the same real/general wiring.
  const totalFarmAreaHa = fields.reduce((sum, f) => sum + f.areaHa, 0);
  const nonGrassAreaHa = fields
    .filter((f) => f.plannedUse?.value === "tillage")
    .reduce((sum, f) => sum + f.areaHa, 0);
  const nonGrassPct = totalFarmAreaHa > 0 ? (nonGrassAreaHa / totalFarmAreaHa) * 100 : 0;

  const rows = fields.map((field) => {
    const silagePlan = silagePlans.find((p) => p.fieldId === field.id);
    const slurryAllocation = slurryAllocations.find((a) => a.fieldId === field.id);
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa,
      livestockGroups,
      slurryAllocation,
      nonGrassPct,
      silage: silagePlan
        ? {
            cutNumber: silagePlan.cutNumber,
            expectedYieldTDMha: silagePlan.expectedYieldTDMha.value,
            intendedUse: silagePlan.intendedUse,
            // V3 fix (audit conflict #5): see nutrients/page.tsx's
            // identical comment / checkNapCompliance's own doc comment.
            saleEvidence: silagePlan.saleEvidence ? { hasWrittenEvidence: silagePlan.saleEvidence.value.hasWrittenEvidence } : undefined,
          }
        : undefined,
    });
    // Codex remediation Priority 1/9 (report safety) — a field with no
    // recorded P/K Soil Index has `fertilityEvidence.status !==
    // "OK"` (`calculateNutrientPlan`'s fail-closed gate): its
    // `purchasedProducts`/`estimatedFieldCostEur` are already forced to
    // `[]`/`0`, and its P/K requirement is already zeroed with
    // `requirement.status: "unavailable"` — this report must say
    // "INSUFFICIENT_EVIDENCE" for those columns, never export the zeroed
    // placeholder numbers as if they were a real "no fertiliser needed"
    // plan.
    const fertilityOk = plan.fertilityEvidence.status === "OK";
    const productsSummary = fertilityOk
      ? plan.purchasedProducts.map((p) => `${p.name} ${p.totalKg}kg (€${p.costEur})`).join("; ")
      : "INSUFFICIENT_EVIDENCE";

    return [
      field.name,
      field.areaHa,
      silagePlan ? `Silage cut ${silagePlan.cutNumber}` : "Grazing",
      plan.requirement.value.n,
      fertilityOk ? plan.requirement.value.p : "INSUFFICIENT_EVIDENCE",
      fertilityOk ? plan.requirement.value.k : "INSUFFICIENT_EVIDENCE",
      plan.organicApplication.offsetN,
      fertilityOk ? plan.organicApplication.offsetP : "INSUFFICIENT_EVIDENCE",
      fertilityOk ? plan.organicApplication.offsetK : "INSUFFICIENT_EVIDENCE",
      productsSummary,
      fertilityOk ? plan.estimatedFieldCostEur : "INSUFFICIENT_EVIDENCE",
      // V3 fix (audit conflict #1): plan.napCompliance is now an
      // EngineOutcome — the statutory ceiling may be genuinely
      // undeterminable (this app's real herd has no captured age/sex
      // data yet). A report that silently omitted or blanked these
      // columns would hide exactly the kind of gap V3 exists to surface,
      // so an undetermined ceiling is written out explicitly rather than
      // left blank.
      plan.napCompliance.status === "OK" ? (plan.napCompliance.value.nWithinCeiling ? "Yes" : "No") : "INSUFFICIENT_EVIDENCE",
      plan.napCompliance.status === "OK" ? (plan.napCompliance.value.pWithinCeiling ? "Yes" : "No") : "INSUFFICIENT_EVIDENCE",
      plan.napCompliance.status === "OK" ? plan.napCompliance.value.regulatory : "INSUFFICIENT_EVIDENCE",
      // V3 fix (audit conflict #5): make the sale-evidence gate visible in
      // the exported report, not just the pass/fail ceiling numbers — a
      // reviewer needs to see WHY the ordinary ceiling applied (no sale
      // route claimed vs. sale route claimed but unevidenced).
      plan.napCompliance.status !== "OK"
        ? "INSUFFICIENT_EVIDENCE"
        : plan.napCompliance.value.saleEvidenceRequired
          ? (plan.napCompliance.value.saleEvidenceConfirmed ? "Confirmed" : "Required, not confirmed")
          : "Not applicable",
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
      "Silage sale evidence",
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
      // Codex remediation Priority 2/9 — a field with no recorded P/K
      // Soil Index exports "Not recorded", never a blank cell that could
      // be misread as "index 0" or silently dropped by a spreadsheet.
      field.fertility.pIndex?.value ?? "Not recorded",
      field.fertility.pIndex?.status ?? "Not recorded",
      field.fertility.kIndex?.value ?? "Not recorded",
      field.fertility.kIndex?.status ?? "Not recorded",
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
  // Codex remediation Priority 2/9 — `plannedUse`/`mappedSoil` are
  // genuinely absent on a newly-created (or not-yet-mapped) field; this
  // report says so plainly rather than exporting a fabricated "Pending
  // mapping" placeholder that looked like real data.
  const rows = fields.map((field) => [
    field.name,
    field.areaHa,
    field.plannedUse?.value ?? "Not set",
    field.plannedUse?.status ?? "Not set",
    field.mappedSoil?.soilAssociation ?? "Unavailable — not yet mapped",
    field.mappedSoil?.dominantSeries ?? "Unavailable — not yet mapped",
    field.mappedSoil?.drainage ?? "Unavailable — not yet mapped",
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
