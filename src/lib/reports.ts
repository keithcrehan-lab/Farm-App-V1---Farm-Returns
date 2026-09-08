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
import { computeFarmGrasslandAggregates } from "@/orchestration/prompt/build-all";
import { isTillageField, hasNoRecordedLivestock } from "@/orchestration/prompt/fertiliser-recommendation";
import type { Field, LivestockGroup, SilagePlan, SlurryAllocation } from "@/domain/types";

export function buildNutrientPlanReportCsv(
  fields: Field[],
  livestockGroups: LivestockGroup[],
  slurryAllocations: SlurryAllocation[],
  silagePlans: SilagePlan[],
): string {
  // Codex audit CRITICAL (round 9): this report duplicated the exact
  // tillage-inclusive `farmGrasslandAreaHa`/`nonGrassPct` computation
  // round 5 fixed elsewhere (`build-all.ts`'s `computeFarmGrasslandAggregates`)
  // — this file was never touched by that round, so a mixed grassland/
  // tillage farm's real, downloadable N/P/K report understated the true
  // stocking-rate density here regardless. Reused (not duplicated) now.
  const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(fields);
  // Codex audit CRITICAL (round 9): a fourth independent path computing
  // a fertiliser recommendation without this campaign's own tillage/
  // missing-livestock fail-closed gates — a tillage field was labelled
  // "Grazing" and given a real grassland N/P/K recommendation (this app
  // has no tillage table at all), and an empty `livestockGroups` could
  // produce `nGrazingSucklerToBeefKgHa`'s own clamped, presented-as-real
  // 35 kg N/ha rather than disclosing the genuine ambiguity. Both are
  // now checked with the same authoritative predicates
  // `promptForFertiliserRecommendation` itself uses, never re-derived.
  const noLivestock = hasNoRecordedLivestock(livestockGroups);

  const rows = fields.map((field) => {
    const silagePlan = silagePlans.find((p) => p.fieldId === field.id);
    const slurryAllocation = slurryAllocations.find((a) => a.fieldId === field.id);
    const tillage = isTillageField(field);
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
    // plan. Codex audit CRITICAL (round 9): a tillage field never
    // reaches this branch at all — it exports "NOT_APPLICABLE" instead,
    // a genuinely different reason (this engine has no tillage table,
    // not merely missing evidence); an un-evidenced empty herd is
    // treated the same as missing soil evidence, for the identical
    // "cannot honestly distinguish confirmed-zero from never-entered"
    // reason `promptForFertiliserRecommendation` already discloses.
    // The N requirement/organic-N offset depend only on land use and
    // stocking rate, never on the P/K Soil Index (`calculateNutrientPlan`'s
    // own real behaviour, unmodified) — `nRecommendable` mirrors that:
    // real and exportable once land use/livestock are sound, independent
    // of whether P/K evidence itself is also complete.
    const nRecommendable = !tillage && !noLivestock;
    const fertilityOk = nRecommendable && plan.fertilityEvidence.status === "OK";
    const blockedReason = tillage ? "NOT_APPLICABLE" : "INSUFFICIENT_EVIDENCE";
    // Codex audit CRITICAL (round 9): `nutrients.ts`'s own `PRODUCTS`
    // prices are disclosed mock market data — this real, downloadable
    // report must never export a monetary figure built from them, the
    // same rule this campaign already applies to every Prompt/Decision/
    // client surface it built (rounds 5-8). Product names/quantities
    // remain real and sourced; only the price is omitted.
    const productsSummary = fertilityOk ? plan.purchasedProducts.map((p) => `${p.name} ${p.totalKg}kg`).join("; ") : blockedReason;

    return [
      field.name,
      field.areaHa,
      tillage ? "Tillage" : silagePlan ? `Silage cut ${silagePlan.cutNumber}` : "Grazing",
      nRecommendable ? plan.requirement.value.n : blockedReason,
      fertilityOk ? plan.requirement.value.p : blockedReason,
      fertilityOk ? plan.requirement.value.k : blockedReason,
      nRecommendable ? plan.organicApplication.offsetN : blockedReason,
      fertilityOk ? plan.organicApplication.offsetP : blockedReason,
      fertilityOk ? plan.organicApplication.offsetK : blockedReason,
      productsSummary,
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
