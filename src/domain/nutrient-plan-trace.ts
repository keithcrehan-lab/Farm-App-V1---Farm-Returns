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
        // RPT007: boundary-affecting rounding rule disclosed —
        // `nRequiredKgHa` is rounded to the nearest whole kg/ha
        // (`Math.round`, `calculateNutrientPlan`) before this ceiling
        // comparison; a fractional requirement exactly at a ceiling
        // boundary is resolved by that rounding, not silently.
        roundingRule: "nRequiredKgHa rounded to nearest whole kg N/ha before ceiling comparison",
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
      // V3 closure pass, Priority 3 (P_BUILD_UP_ELIGIBILITY): the
      // enhanced Table 15b P ceiling requires all Article 17(6)
      // conditions to be proven (p-build-up-eligibility.ts) — this check
      // makes that gate visible in the audit trace.
      ...(compliance.pBuildUpEligibilityApplicable
        ? [
            {
              checkId: "P_BUILD_UP_ELIGIBILITY",
              rule: "The enhanced grazing P ceiling (Table 15b) requires all Article 17(6) conditions to be proven (current soil P/OM test, approved adviser, submitted NMP, required training)",
              result: (compliance.pBuildUpEligibilityConfirmed ? "PASS" : "FAIL") as "PASS" | "FAIL",
              consequence: compliance.pBuildUpEligibilityConfirmed
                ? "Enhanced Table 15b P ceiling applies"
                : "Standard Table 15a P ceiling applies instead — no enhanced build-up without all conditions proven",
              sourceId: "LAW_IE_SI_588_2025" as const,
            },
          ]
        : []),
    ],
    assumptions: [],
    dataGaps: [],
    // RPT011 (source location): `compliance.legislation` already carries
    // the exact table reference this decision actually used (e.g.
    // "S.I. No. 588/2025, Tables 13 & 15a") — cited here as the primary
    // source's `section`, rather than a bare Act-level citation with no
    // location.
    sources: [{ ...NAP_SOURCES[0], section: compliance.legislation }, NAP_SOURCES[1]],
  };
}

// ---------------------------------------------------------------------------
// V3 closure pass, Priority 6 (trace coverage): the two gates wired live
// in Priority 4 that can actually produce a `LEGAL_PROHIBITION` — a
// genuinely different decision from the NAP compliance one above, not
// folded into it. `statutoryManureValue`/`localBufferOverrideStatus` are
// ledger/status values, not their own recommendation decisions, and stay
// out of scope here — this priority audits and closes the highest-risk
// gaps, not every possible trace surface (see the coverage-matrix note
// this phase writes for the full audit).
// ---------------------------------------------------------------------------

function buildCommonageDecision(recommendationId: string, plan: NutrientPlan, input: CalculateNutrientPlanInput): DecisionRecord | null {
  const gate = plan.commonageFertiliserGate;
  if (gate.status === "NOT_APPLICABLE") return null; // not commonage land — nothing material to report
  const scope = { type: "FIELD", id: input.field.id };
  const sources: [SourceCitation, ...SourceCitation[]] = [{ sourceId: "LAW_IE_SI_588_2025", authority: "Irish Statute Book", effectiveStatus: "CURRENT" }];

  if (gate.status === "LEGAL_PROHIBITION") {
    return {
      recommendationId,
      decisionType: "LEGAL_PROHIBITION",
      scope,
      action: "Chemical fertiliser recommendation suppressed — this field is commonage land (S.I. 588/2025).",
      reasonCodes: [gate.reasonCode],
      evidenceState: "DERIVED",
      inputs: [],
      calculationSteps: [],
      complianceChecks: [
        {
          checkId: "COMMONAGE_NO_CHEMICAL_FERTILISER",
          rule: "Chemical fertiliser shall not be spread on commonage land",
          result: "FAIL",
          consequence: gate.consequence,
          sourceId: "LAW_IE_SI_588_2025",
        },
      ],
      assumptions: [],
      dataGaps: [],
      sources,
    };
  }

  if (gate.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") return null; // not actually reachable — checkCommonageFertiliserGate never returns OK/AMBIGUOUS/UNKNOWN

  // BLOCKED_INSUFFICIENT_EVIDENCE — commonage status never captured.
  return {
    recommendationId,
    decisionType: "BLOCKED_INSUFFICIENT_EVIDENCE",
    scope,
    action: "Commonage status not captured for this field — the purchased-product recommendation above cannot yet be verified as commonage-compliant.",
    reasonCodes: [gate.reasonCode],
    evidenceState: "INSUFFICIENT",
    inputs: [],
    calculationSteps: [],
    complianceChecks: [],
    assumptions: [],
    dataGaps: [
      {
        kind: "MISSING_EVIDENCE",
        description: "Field commonage status (S.I. 588/2025 chemical-fertiliser prohibition) was never captured.",
        reason: gate.missingInputs.join("; "),
        sourceId: "LAW_IE_SI_588_2025",
        replaceableByMeasurement: true,
        blockedOutput: "Commonage fertiliser compliance verification",
        resolution: "Capture this field's commonage status.",
      },
    ],
    sources,
  };
}

function buildLessMethodDecision(recommendationId: string, plan: NutrientPlan, input: CalculateNutrientPlanInput): DecisionRecord | null {
  const gate = plan.lessMethodCompliance;
  if (gate.status === "NOT_APPLICABLE") return null; // no LESS requirement triggered — nothing material to report
  const scope = { type: "FIELD", id: input.field.id };
  const sources: [SourceCitation, ...SourceCitation[]] = [{ sourceId: "LAW_IE_SI_588_2025", authority: "Irish Statute Book", effectiveStatus: "CURRENT" }];

  if (gate.status === "OK") {
    return {
      recommendationId,
      decisionType: "NO_ACTION_RECOMMENDED",
      scope,
      action: `Slurry application method is compliant with the Low Emission Slurry Spreading requirement (triggered by: ${gate.value.triggeredBy.join(", ")}).`,
      reasonCodes: gate.value.triggeredBy,
      evidenceState: "DERIVED",
      inputs: [],
      calculationSteps: [],
      complianceChecks: [
        { checkId: "LESS_METHOD_GATE", rule: "A triggered LESS requirement must be met by the applied method or a documented alternative", result: "PASS", consequence: "No action required", sourceId: "LAW_IE_SI_588_2025" },
      ],
      assumptions: [],
      dataGaps: [],
      sources,
    };
  }

  if (gate.status === "LEGAL_PROHIBITION") {
    return {
      recommendationId,
      decisionType: "LEGAL_PROHIBITION",
      scope,
      action: gate.consequence,
      reasonCodes: [gate.reasonCode],
      evidenceState: "DERIVED",
      inputs: [],
      calculationSteps: [],
      complianceChecks: [
        { checkId: "LESS_METHOD_GATE", rule: "A triggered LESS requirement must be met by the applied method or a documented alternative", result: "FAIL", consequence: gate.consequence, sourceId: "LAW_IE_SI_588_2025" },
      ],
      assumptions: [],
      dataGaps: [],
      sources,
    };
  }

  if (gate.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") return null; // not actually reachable — checkLessMethodGate/requireSlurryApplicationMethod never return AMBIGUOUS/UNKNOWN

  // BLOCKED_INSUFFICIENT_EVIDENCE — application method never captured.
  return {
    recommendationId,
    decisionType: "BLOCKED_INSUFFICIENT_EVIDENCE",
    scope,
    action: "Slurry application method not captured for this field's slurry allocation — LESS compliance cannot yet be verified.",
    reasonCodes: [gate.reasonCode],
    evidenceState: "INSUFFICIENT",
    inputs: [],
    calculationSteps: [],
    complianceChecks: [],
    assumptions: [],
    dataGaps: [
      {
        kind: "MISSING_EVIDENCE",
        description: "Slurry application method (LESS/splashplate/incorporate_24h/other) was never captured for this field's slurry allocation.",
        reason: gate.missingInputs.join("; "),
        sourceId: "LAW_IE_SI_588_2025",
        replaceableByMeasurement: true,
        blockedOutput: "LESS compliance verification",
        resolution: "Capture the slurry application method for this field's allocation.",
      },
    ],
    sources,
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
  const commonageDecision = buildCommonageDecision(`${recommendationId}-COMMONAGE`, plan, input);
  if (commonageDecision !== null) run = recordDecision(run, commonageDecision);
  const lessMethodDecision = buildLessMethodDecision(`${recommendationId}-LESS`, plan, input);
  if (lessMethodDecision !== null) run = recordDecision(run, lessMethodDecision);
  run = await sealCalculationRun(run);

  return { plan, run };
}
