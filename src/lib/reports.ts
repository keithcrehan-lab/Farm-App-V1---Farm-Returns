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
import { calculateNutrientPlan, isSilageCutPlannedUse, resolveFieldSlurryAllocation } from "@/domain/nutrients";
import { computeFarmGrasslandAggregates } from "@/orchestration/prompt/build-all";
import { isTillageField, hasNoRecordedLivestock, type PBuildUpComplianceInput } from "@/orchestration/prompt/fertiliser-recommendation";
import type { Field, LivestockGroup, SilagePlan, SlurryAllocation } from "@/domain/types";

export function buildNutrientPlanReportCsv(
  fields: Field[],
  livestockGroups: LivestockGroup[],
  slurryAllocations: SlurryAllocation[],
  silagePlans: SilagePlan[],
  // Codex audit HIGH (round 16): the real farm-level Article 17(6)
  // evidence (`Farm.pBuildUpCompliance`) — round 14 threaded this
  // through every other real `calculateNutrientPlan` call site in this
  // vertical, but missed this one. Omitted, this report's own NAP P
  // columns (made authoritative-looking and fail-closed by rounds 9/13)
  // silently understated a farm's real Table 15b eligibility as Table
  // 15a's lower ceiling — a real, signed-in compliance-record export
  // showing "P within NAP ceiling: No" when the farm's actual recorded
  // evidence makes the correct answer "Yes". Optional and trailing,
  // matching `promptForFertiliserRecommendation`'s own convention —
  // omitted defaults to the same safe "not proven" behaviour
  // `calculateNutrientPlan` already applies when this input is absent.
  pBuildUpCompliance?: PBuildUpComplianceInput,
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
    // Codex audit HIGH (round 31): a bare `.find()` silently discarded
    // a real second allocation to the same field from a different real
    // housing source — see `resolveFieldSlurryAllocation`'s own doc
    // comment.
    const slurryAllocation = resolveFieldSlurryAllocation(slurryAllocations, field.id);
    const tillage = isTillageField(field);
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa,
      livestockGroups,
      slurryAllocation,
      nonGrassPct,
      pBuildUpCompliance,
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
    // Codex audit HIGH (round 23): this used to apply the farm-wide
    // `noLivestock` exclusion to every non-tillage field, including a
    // silage field with its own real, matching `SilagePlan` — but
    // silage N/P/K (`nSilageKgHa`/`pMaintenanceSilageKgHa`/`kSilageKgHa`)
    // never depends on `livestockGroups` at all, the same real
    // distinction `calculateFarmFertiliserRequirement` (finance.ts) and
    // `RecommendationAuditTrailCard.tsx` both already apply. A real,
    // complete-evidence silage field with genuinely no recorded
    // livestock had its real N/P/K requirement, organic offsets,
    // purchased products, and every NAP column overwritten with
    // "INSUFFICIENT_EVIDENCE" in this exported report.
    // Codex audit CRITICAL (round 27): round 26's own new silage-evidence
    // gate (a real silage-cut field with no real, matching `SilagePlan`)
    // was never checked here — the land-use column still showed
    // "Grazing" for such a field, and `nRecommendable` still let its
    // N/organic-N columns export the engine's own forced `0` as if it
    // were a real value, exactly the "blocked evidence exported as a
    // real zero" failure round 9/10 already fixed for the fertility/
    // tillage cases. A field planned as a silage cut with no matching
    // plan is now excluded the same way a missing-livestock field is.
    const silageEvidenceMissing = isSilageCutPlannedUse(field) && !silagePlan;
    const nRecommendable = !tillage && !silageEvidenceMissing && (!noLivestock || silagePlan !== undefined);
    const fertilityOk = nRecommendable && plan.fertilityEvidence.status === "OK";
    const blockedReason = tillage ? "NOT_APPLICABLE" : "INSUFFICIENT_EVIDENCE";
    // Codex audit HIGH (round 13): `checkNapCompliance` (`plan.napCompliance`)
    // has no knowledge of tillage/missing-livestock at all — it is built
    // from the identical grazing/agronomic ledger `nRecommendable` above
    // already gates, so every NAP column below is now gated on
    // `nRecommendable` too, not just `plan.napCompliance`'s own real
    // `status === "OK"` check.
    // Codex audit CRITICAL (round 9) — at the time, `nutrients.ts`'s own
    // `PRODUCTS` prices were disclosed mock market data, so this real,
    // downloadable report never exported a monetary figure built from
    // them, the same rule this campaign already applies to every Prompt/
    // Decision/client surface it built (rounds 5-8). Round 25 wired
    // `PRODUCTS` to `market.ts`'s own real, sourced CSO series, so the
    // figure itself is no longer fabricated — but price stays omitted
    // here for the same still-unresolved reason `fertiliser-recommendation.ts`'s
    // own `estimatedFieldCostEur` doc comment now gives: it doesn't defer
    // to a farmer's own entered price override or a real supplier quote
    // when one exists (`FinancialAssumptionsCard.tsx`), a pre-existing,
    // disclosed product-scope decision predating this campaign. Product
    // names/quantities remain real and sourced; only the price is omitted.
    //
    // Codex audit HIGH (round 10): round 9's own fix left this cell
    // ambiguous for a field with genuinely complete evidence whose real
    // recommendation is nonetheless `NOT_APPLICABLE` (Index 4, or a
    // commonage/buffer legal prohibition — `calculateNutrientPlan`'s own
    // real, correct N/P/K requirement still stands in that case, only
    // the purchase itself is suppressed) — an empty string there read
    // exactly like missing/blocked data. Distinguished explicitly now.
    const productsSummary = !fertilityOk
      ? blockedReason
      : plan.purchasedProducts.length === 0
        ? "NOT_APPLICABLE"
        : plan.purchasedProducts.map((p) => `${p.name} ${p.totalKg}kg`).join("; ");

    return [
      field.name,
      field.areaHa,
      // Codex audit MEDIUM (round 29): a field whose `plannedUse` was
      // never recorded still read "Grazing" here — the same
      // unqualified-assumption label the land-use column already avoids
      // for tillage/silage-evidence-missing fields — even though this
      // report's own "Regulatory status" column (below) correctly reads
      // "planning_advice" for it. Labelled consistently with that column
      // instead of contradicting it.
      tillage
        ? "Tillage"
        : silagePlan
          ? `Silage cut ${silagePlan.cutNumber}`
          : silageEvidenceMissing
            ? "Silage (no real cut/yield plan)"
            : field.plannedUse === undefined
              ? "Grazing (assumed — land use not recorded)"
              : "Grazing",
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
      // left blank. Codex audit HIGH (round 13): `checkNapCompliance`
      // has no knowledge of tillage/missing-livestock at all — it is
      // built from the identical grazing/agronomic ledger the other
      // columns above already gate on `nRecommendable`, so a tillage or
      // un-evidenced-herd row could still export a real-looking "Yes"/
      // "No"/regulatory classification derived from a fabricated
      // requirement. Every NAP column below is now gated the same way.
      // Codex audit HIGH (round 30): these two columns still published a
      // definitive "Yes"/"No" regardless of `regulatory` — an
      // unresolved-land-use row could read "N within NAP ceiling: No"
      // right beside a "Regulatory status" column correctly saying
      // "planning_advice", the same contradiction round 29 already
      // fixed for the land-use label itself. "Unknown" replaces the
      // boolean whenever the classification isn't confirmed, matching
      // the identical `ComplianceCheck.result: "UNKNOWN"` convention
      // `nutrient-plan-trace.ts` already established for this exact
      // case.
      nRecommendable && plan.napCompliance.status === "OK"
        ? plan.napCompliance.value.regulatory === "compliance_value"
          ? (plan.napCompliance.value.nWithinCeiling ? "Yes" : "No")
          : "Unknown"
        : blockedReason,
      nRecommendable && plan.napCompliance.status === "OK"
        ? plan.napCompliance.value.regulatory === "compliance_value"
          ? (plan.napCompliance.value.pWithinCeiling ? "Yes" : "No")
          : "Unknown"
        : blockedReason,
      nRecommendable && plan.napCompliance.status === "OK" ? plan.napCompliance.value.regulatory : blockedReason,
      // V3 fix (audit conflict #5): make the sale-evidence gate visible in
      // the exported report, not just the pass/fail ceiling numbers — a
      // reviewer needs to see WHY the ordinary ceiling applied (no sale
      // route claimed vs. sale route claimed but unevidenced).
      !nRecommendable || plan.napCompliance.status !== "OK"
        ? blockedReason
        : plan.napCompliance.value.saleEvidenceRequired
          ? (plan.napCompliance.value.saleEvidenceConfirmed ? "Confirmed" : "Required, not confirmed")
          : "Not applicable",
      // Codex audit MEDIUM (round 29): "Regulatory status" already read
      // "planning_advice" for an unresolved-plannedUse or disregarded-
      // soil-test field, but no column carried the real, specific reason
      // why — a reviewer could see the downgrade but not distinguish
      // which of the two real causes applied, or that both did.
      !nRecommendable || plan.napCompliance.status !== "OK"
        ? ""
        : [plan.napCompliance.value.plannedUseUnresolvedReason, plan.napCompliance.value.soilTestDisregardedReason].filter(Boolean).join(" "),
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
      "Regulatory note",
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
