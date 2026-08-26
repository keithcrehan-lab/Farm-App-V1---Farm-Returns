/**
 * Scientific engine V3 — Phase I: the first real calculation wired to
 * Phase 1/B's audit-trace foundation. "TRACE EARLY, REPORTS UI LATER" —
 * this is that wiring, for the single highest-risk decision this app
 * makes: whether a field's planned nutrient application is within its
 * real statutory NAP N/P ceiling (`calculateNutrientPlan`'s
 * `napCompliance`, fixed for real in Phase E4).
 *
 * Deliberately scoped to the NAP compliance decision alone, not a full
 * trace of every number `calculateNutrientPlan` produces (P/K build-up,
 * slurry offset, purchased-product blend) — building a fully faithful
 * `InputEvidence`/`CalculationStep` trace for the entire nutrient
 * pipeline is real, valuable follow-up work, but the compliance decision
 * is where the legal risk actually concentrates (spec Section 5's own
 * framing: "A production recommendation is valid only if an immutable
 * trace exists"), so it is where real tracing starts.
 *
 * `calculateNutrientPlanWithTrace` is purely additive — it calls the
 * existing, unchanged `calculateNutrientPlan` and wraps its result in a
 * trace; nothing about the plan's own numbers changes, and nothing
 * existing calls this new function yet.
 */

import { recordDecision, sealCalculationRun, startCalculationRun, type CalculationRun, type DecisionRecord, type InputEvidence, type SourceCitation } from "./audit-trace";
import { computeFarmSnapshotId, trackedValueToInputEvidence } from "./audit-trace-adapters";
import { CURRENT_RULESET } from "./source-register";
import { calculateNutrientPlan, type CalculateNutrientPlanInput } from "./nutrients";
import type { NutrientPlan } from "./types";

export const NUTRIENT_PLAN_TRACE_VERSION = "nutrient_plan_trace_v1.0.0";

const NAP_SOURCES: [SourceCitation, ...SourceCitation[]] = [
  { sourceId: "LAW_IE_SI_588_2025", authority: "Irish Statute Book", effectiveStatus: "CURRENT" },
  { sourceId: "LAW_IE_SI_119_2026", authority: "Irish Statute Book", effectiveStatus: "CURRENT" },
];

function buildNapComplianceDecision(recommendationId: string, plan: NutrientPlan, input: CalculateNutrientPlanInput): DecisionRecord {
  const scope = { type: "FIELD", id: input.field.id };
  const pIndexEvidence: InputEvidence = trackedValueToInputEvidence(
    "soil_p_index",
    input.field.fertility.pIndex,
    input.field.fertility.pIndex.status === "verified" ? "MEASURED" : "IRISH_DEFAULT",
    input.field.fertility.pIndex.status === "verified" ? "LAB" : "IRISH_DEFAULT",
  );

  if (plan.napCompliance.status !== "OK") {
    const outcome = plan.napCompliance;
    const reasonCode = outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? outcome.reasonCode : outcome.status;
    const missingInputs = outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? outcome.missingInputs : [];
    return {
      recommendationId,
      decisionType: "BLOCKED_INSUFFICIENT_EVIDENCE",
      scope,
      action: "Cannot determine the statutory NAP N/P ceiling for this field — the real statutory Grassland Stocking Rate could not be resolved for every livestock group.",
      reasonCodes: [reasonCode],
      evidenceState: "INSUFFICIENT",
      inputs: [pIndexEvidence],
      calculationSteps: [],
      complianceChecks: [],
      assumptions: [],
      dataGaps: [
        {
          kind: "MISSING_EVIDENCE",
          description: "Real statutory Grassland Stocking Rate (S.I. 119/2026 Table 7) could not be determined for this field's herd.",
          reason: missingInputs.length > 0 ? missingInputs.join("; ") : reasonCode,
          sourceId: "LAW_IE_SI_119_2026",
          replaceableByMeasurement: true,
          blockedOutput: "NAP N/P compliance ceiling",
          resolution: "Capture avgAgeMonths (and sex, for the 1-2 year band) for every livestock group grazing this field's grassland area.",
        },
      ],
      sources: NAP_SOURCES,
    };
  }

  const compliance = plan.napCompliance.value;
  const isCompliant = compliance.nWithinCeiling && compliance.pWithinCeiling;

  const inputs: InputEvidence[] = [
    pIndexEvidence,
    {
      name: "statutory_gsr",
      rawValue: compliance.orgNStockingRateKgHa,
      normalisedValue: compliance.orgNStockingRateKgHa,
      unit: "kg N/ha",
      sourceKind: "DERIVED",
      evidenceState: "DERIVED",
      override: false,
    },
    // V3 closure pass, Priority 2/6 (COMPLIANCE_MANURE_NP trace
    // coverage): the real statutory manure N/P ledger value, recorded
    // here as its own distinct input — never merged with or substituted
    // for the agronomic Table 9-8 offset above the ceiling check itself,
    // per statutory-manure-value.ts's own ledger-separation rule.
    ...(plan.statutoryManureValue.status === "OK"
      ? [
          {
            name: "statutory_manure_available_n",
            rawValue: plan.statutoryManureValue.value.availableNKgHa,
            normalisedValue: plan.statutoryManureValue.value.availableNKgHa,
            unit: "kg N/ha",
            sourceKind: "DERIVED",
            evidenceState: "DERIVED",
            override: false,
          } satisfies InputEvidence,
        ]
      : []),
  ];

  return {
    recommendationId,
    decisionType: isCompliant ? "ACTION_RECOMMENDATION" : "WARNING",
    scope,
    action: isCompliant
      ? `Planned nutrient application (${compliance.nRequiredKgHa} kg N/ha, ${compliance.pRequiredKgHa} kg P/ha) is within the statutory ${compliance.landUse} ceiling.`
      : `Planned nutrient application exceeds the statutory ${compliance.landUse} ceiling for this field's stocking rate.`,
    quantity: { value: compliance.nRequiredKgHa, unit: "kg N/ha" },
    reasonCodes: [isCompliant ? "NAP_CEILING_MET" : "NAP_CEILING_EXCEEDED"],
    evidenceState: "DERIVED",
    inputs,
    calculationSteps: [
      {
        sequence: 1,
        formulaRuleId: "GRASSLAND_STOCKING_RATE",
        description: "Real statutory Grassland Stocking Rate before manure exports",
        formulaExpression: "sum(S.I. 119/2026 Table 7 N/head x headcount) / eligible grassland area",
        result: compliance.orgNStockingRateKgHa,
        unit: "kg N/ha",
        sourceIds: ["LAW_IE_SI_119_2026"],
      },
      {
        sequence: 2,
        formulaRuleId: compliance.landUse === "grazing" ? "GRASSLAND_AVAILABLE_N_MAX" : "SILAGE_DESTINATION_REGULATORY_ROUTE",
        description: "Statutory N ceiling lookup for this stocking-rate band",
        formulaExpression: `ceiling(GSR=${compliance.orgNStockingRateKgHa} kg N/ha)`,
        result: compliance.nCeilingKgHa,
        unit: "kg N/ha",
        sourceIds: ["LAW_IE_SI_588_2025"],
      },
      {
        sequence: 3,
        formulaRuleId: "NAP_N_CEILING_CHECK",
        description: "Compare planned N application to the statutory ceiling",
        formulaExpression: `${compliance.nRequiredKgHa} <= ${compliance.nCeilingKgHa}`,
        result: compliance.nWithinCeiling,
        sourceIds: ["LAW_IE_SI_588_2025"],
      },
    ],
    complianceChecks: [
      {
        checkId: "NAP_N_CEILING",
        rule: "Planned N must not exceed the statutory ceiling for this field's stocking-rate band",
        evaluatedValue: compliance.nRequiredKgHa,
        result: compliance.nWithinCeiling ? "PASS" : "FAIL",
        consequence: compliance.nWithinCeiling ? "No action required" : "Reduce nutrient plan or review stocking allocation",
        sourceId: "LAW_IE_SI_588_2025",
      },
      {
        checkId: "NAP_P_CEILING",
        rule: "Planned P must not exceed the statutory ceiling for this field's stocking-rate band and P Index",
        evaluatedValue: compliance.pRequiredKgHa,
        result: compliance.pWithinCeiling ? "PASS" : "FAIL",
        consequence: compliance.pWithinCeiling ? "No action required" : "Reduce nutrient plan or review stocking allocation",
        sourceId: "LAW_IE_SI_588_2025",
      },
      ...(compliance.saleEvidenceRequired
        ? [
            {
              checkId: "SILAGE_SALE_EVIDENCE",
              rule: "The sale-route ceiling (Tables 16 & 17) requires confirmed written evidence of sale",
              result: (compliance.saleEvidenceConfirmed ? "PASS" : "FAIL") as "PASS" | "FAIL",
              consequence: compliance.saleEvidenceConfirmed
                ? "Sale-route ceiling applies"
                : "Ordinary grassland ceiling applies instead",
              sourceId: "LAW_IE_SI_588_2025" as const,
            },
          ]
        : []),
      // V3 closure pass, Priority 1 (AF011): the elevated 171-210/>210 kg
      // N/ha grazing ceiling requires evidence of >=5% non-grass eligible
      // area (GFT023/GFT024) — this check makes that gate visible in the
      // audit trace, not just enforced silently inside the ceiling number.
      ...(compliance.highRateEligibilityApplicable
        ? [
            {
              checkId: "HIGH_RATE_N_ELIGIBILITY",
              rule: "The elevated grazing N ceiling above 170 kg N/ha organic-N stocking rate requires evidence of >=5% non-grass eligible area",
              result: (compliance.highRateEligibilityConfirmed ? "PASS" : "FAIL") as "PASS" | "FAIL",
              consequence: compliance.highRateEligibilityConfirmed
                ? "Elevated N ceiling applies"
                : "Ordinary 131-170 band ceiling (185 kg N/ha) applies instead — no elevated rate without confirmed evidence",
              sourceId: "LAW_IE_SI_588_2025" as const,
            },
          ]
        : []),
    ],
    assumptions: [],
    dataGaps: [],
    sources: NAP_SOURCES,
  };
}

export interface NutrientPlanTraceResult {
  plan: NutrientPlan;
  run: CalculationRun;
}

/**
 * Runs the real, unchanged `calculateNutrientPlan` and wraps its NAP
 * compliance decision in a real, sealed `CalculationRun` — both the `OK`
 * (a determinable ceiling, compliant or not) and non-`OK` (insufficient
 * evidence) cases are recorded, matching the report spec's "every
 * decision type is reportable... what Farm Return refused to recommend
 * as well as what it recommended."
 */
export async function calculateNutrientPlanWithTrace(
  calculationRunId: string,
  recommendationId: string,
  input: CalculateNutrientPlanInput,
): Promise<NutrientPlanTraceResult> {
  const plan = calculateNutrientPlan(input);

  const farmSnapshotId = await computeFarmSnapshotId({
    fieldId: input.field.id,
    pIndex: input.field.fertility.pIndex.value,
    kIndex: input.field.fertility.kIndex.value,
    livestockGroupIds: input.livestockGroups.map((g) => g.id).sort(),
    farmGrasslandAreaHa: input.farmGrasslandAreaHa,
    silage: input.silage ?? null,
  });

  let run = startCalculationRun(calculationRunId, farmSnapshotId, CURRENT_RULESET);
  run = recordDecision(run, buildNapComplianceDecision(recommendationId, plan, input));
  run = await sealCalculationRun(run);

  return { plan, run };
}
