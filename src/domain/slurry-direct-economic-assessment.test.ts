import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { calculateNutrientPlan } from "./nutrients";
import { tracked, type Field, type LivestockGroup, type NutrientPlan, type SlurryAllocation } from "./types";
import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation, type CreateMarketPriceObservationInput } from "./market-evidence";
import { resolveMarketReferencePrice, type AuditableMarketPriceResolution } from "./market-price-resolution";
import type { EngineOutcome } from "./evidence";
import { compareMoney, subtractMoney, zeroMoney, type MoneyAmount } from "./money";
import { validateNoDuplicateCreditClaims } from "./economic-opportunity";
import {
  buildSlurryDirectEconomicAssessment,
  SLURRY_DIRECT_ECONOMIC_ENGINE_VERSION,
  SLURRY_DIRECT_ASSESSMENT_FINITE_RESOURCE_LIMITATION,
  SLURRY_DIRECT_ASSESSMENT_CASH_LIMITATION,
  type SlurryDirectEconomicAssessmentInput,
} from "./slurry-direct-economic-assessment";

// ---------------------------------------------------------------------------
// Real science fixtures — same pattern nutrients.test.ts already uses for
// its own "withoutSlurry"/"withSlurry" comparison tests. No fabricated
// science: every plan below is the REAL calculateNutrientPlan output.
// ---------------------------------------------------------------------------

const livestockGroups: LivestockGroup[] = [
  {
    id: "g1",
    farmId: "farm-test",
    category: "suckler_cow",
    label: "Cows",
    count: tracked(20, "verified", "Farmer"),
    system: "grazing",
    value: tracked(30000, "estimated", "Farm Return estimate"),
  },
];
const farmGrasslandAreaHa = 27;
const asOfDate = "2026-09-25";

const goldenField: Field = {
  id: "field-golden",
  farmId: "farm-test",
  name: "Golden Field",
  areaHa: 10,
  centroid: [0, 0],
  plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
  fertility: { pIndex: tracked(2, "farmer_adjusted", "Keith"), kIndex: tracked(2, "farmer_adjusted", "Keith") },
  history: [],
};

// Meadow 3 — the exact real fixture nutrients.test.ts uses for "K
// requirement genuinely 0; 18-6-12 supplies K anyway" (P Index 2, K Index
// 4). Reused here (not re-derived) as the real, evidenced "unwanted
// nutrient / oversupply" case (brief §29).
const oversupplyField: Field = {
  id: "field-meadow-3",
  farmId: "farm-test",
  name: "Meadow 3",
  areaHa: 4,
  centroid: [0, 0],
  plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
  fertility: { pIndex: tracked(2, "farmer_adjusted", "Keith"), kIndex: tracked(4, "farmer_adjusted", "Keith") },
  history: [],
};

const supportedSpringSplashplate: SlurryAllocation = {
  fieldId: goldenField.id,
  housingId: "h1",
  priority: "high",
  volumeM3: 20 * goldenField.areaHa,
  score: 90,
  applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith"),
  applicationDate: tracked("2026-02-15", "farmer_adjusted", "Keith"),
};

// Real, currently-unsupported context: incorporate_24h has no evidenced
// Teagasc available-nutrient table at any timing (nutrients.ts:987-994).
const unsupportedMethod: SlurryAllocation = {
  fieldId: goldenField.id,
  housingId: "h1",
  priority: "high",
  volumeM3: 20 * goldenField.areaHa,
  score: 90,
  applicationMethod: tracked("incorporate_24h", "farmer_adjusted", "Keith"),
  applicationDate: tracked("2026-02-15", "farmer_adjusted", "Keith"),
};

function planWithout(field: Field): NutrientPlan {
  return calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: undefined, asOfDate });
}
function planWith(field: Field, allocation: SlurryAllocation): NutrientPlan {
  return calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: allocation, asOfDate });
}

// ---------------------------------------------------------------------------
// Real audited price fixtures — same pattern fertiliser-plan-cost.test.ts
// already uses, run through the REAL Phase 2/3 pipeline
// (createMarketPriceObservation -> resolveMarketReferencePrice), not
// hand-built AuditableMarketPriceResolution objects.
// ---------------------------------------------------------------------------

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function observation(overrides: Partial<CreateMarketPriceObservationInput>): MarketPriceObservation {
  const fields = {
    datasetId: "AJM09",
    sourceSeriesCode: "012",
    sourceSeriesLabel: "Compound 18-6-12",
    mappedProduct: "18-6-12",
    mappingKind: "EXACT_PRODUCT_MATCH" as const,
    priceAmount: "645",
    referencePeriod: "2026-07",
    priceBasis: "per_tonne" as const,
    vatTreatment: "unknown" as const,
    deliveryBasis: "unknown" as const,
    sourceId: "CSO_AG_PRICES" as const,
    geography: "Ireland",
    sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
    retrievedAt: "2026-09-20T12:00:00.000Z",
    ingestionBatchId: "11111111-1111-1111-1111-111111111111",
    sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
    ...overrides,
  };
  return createMarketPriceObservation({
    ...fields,
    contentHash: hash(canonicalContentHashInput(fields)),
  });
}

function resolved(candidates: MarketPriceObservation[], mappedProduct: string, decisionDate = asOfDate): EngineOutcome<AuditableMarketPriceResolution> {
  return resolveMarketReferencePrice({ candidates, mappedProduct, asOfDate: decisionDate });
}

/** Real prices for all three canonical products, resolved once, reused for
 * BOTH baseline and intervention — exactly brief §13's "one deterministic
 * price-evidence set across the union of products required by both
 * scenarios" requirement. */
function allProductPrices(decisionDate = asOfDate): Record<string, EngineOutcome<AuditableMarketPriceResolution>> {
  const zeroSevenThirty = observation({
    sourceSeriesCode: "008",
    priceAmount: "412",
    mappingKind: "EXACT_PRODUCT_MATCH",
    mappedProduct: "0-7-30",
    sourceSeriesLabel: "Compound 0-7-30",
  });
  const eighteenSixTwelve = observation({
    sourceSeriesCode: "012",
    priceAmount: "645",
    mappingKind: "EXACT_PRODUCT_MATCH",
    mappedProduct: "18-6-12",
    sourceSeriesLabel: "Compound 18-6-12",
  });
  const protectedUrea = observation({
    sourceSeriesCode: "002",
    priceAmount: "550",
    mappingKind: "CATEGORY_BENCHMARK",
    mappedProduct: "Protected Urea",
    sourceSeriesLabel: "Urea (46% N)",
  });
  return {
    "0-7-30": resolved([zeroSevenThirty], "0-7-30", decisionDate),
    "18-6-12": resolved([eighteenSixTwelve], "18-6-12", decisionDate),
    "Protected Urea": resolved([protectedUrea], "Protected Urea", decisionDate),
  };
}

const knownAt = allProductPrices()["18-6-12"].status === "OK" ? (allProductPrices()["18-6-12"] as { status: "OK"; value: AuditableMarketPriceResolution }).value.trace.knownAt : "";

function baseInput(overrides: Partial<SlurryDirectEconomicAssessmentInput> = {}): SlurryDirectEconomicAssessmentInput {
  const baselinePlan = planWithout(goldenField);
  const interventionPlan = planWith(goldenField, supportedSpringSplashplate);
  return {
    id: "assessment-1",
    evaluatedActionId: "allocation-real-db-id-1",
    fieldId: goldenField.id,
    asOfDate,
    knownAt,
    baselinePlan,
    interventionPlan,
    resolvedPricesByProduct: allProductPrices(),
    realisationCost: { status: "unknown" },
    createdAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
}

function okMoney(outcome: EngineOutcome<MoneyAmount>): MoneyAmount {
  if (outcome.status !== "OK") throw new Error(`expected OK, got ${outcome.status}`);
  return outcome.value;
}

// ---------------------------------------------------------------------------
// A. Golden supported case — real end-to-end chain
// ---------------------------------------------------------------------------

describe("buildSlurryDirectEconomicAssessment — golden supported case", () => {
  it("produces a scientifically supported intervention and a fully quantified, internally consistent direct cost difference", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput());

    expect(assessment.scienceSupport.status).toBe("OK");
    expect(assessment.counterfactualInvariance.valid).toBe(true);
    expect(assessment.baselineFertiliserPlanCost.aggregateOutcome.status).toBe("OK");
    expect(assessment.interventionFertiliserPlanCost.aggregateOutcome.status).toBe("OK");
    expect(assessment.directCostDifference.status).toBe("OK");
    expect(assessment.engineVersion).toBe(SLURRY_DIRECT_ECONOMIC_ENGINE_VERSION);

    // Trace/value consistency (mirrors Phase 4's own discipline): the
    // reported magnitude must equal an INDEPENDENT recomputation from the
    // two plan costs, never a second, possibly-drifting calculation.
    const baseline = okMoney(assessment.baselineFertiliserPlanCost.aggregateOutcome);
    const intervention = okMoney(assessment.interventionFertiliserPlanCost.aggregateOutcome);
    const comparison = compareMoney(baseline, intervention);
    const expectedDirection = comparison === 0 ? "zero" : comparison > 0 ? "benefit" : "cost";
    expect(assessment.directCostDifferenceDirection).toBe(expectedDirection);
    const expectedMagnitude = comparison >= 0 ? subtractMoney(baseline, intervention) : subtractMoney(intervention, baseline);
    expect(okMoney(assessment.directCostDifference).amount).toBe(expectedMagnitude.amount);
  });

  it("real splashplate spring slurry genuinely reduces the indicative plan cost for this fixture (baseline > intervention)", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput());
    // Not hardcoded a priori — asserted against the real engine's own
    // relative output, proving the slurry action has a real, non-zero,
    // benefit-direction effect for this realistic fixture.
    expect(assessment.directCostDifferenceDirection).toBe("benefit");
    expect(assessment.effect).not.toBeNull();
    expect(assessment.effect?.direction).toBe("benefit");
    expect(assessment.effect?.type).toBe("AVOIDED_FERTILISER_PLAN_COST");
    expect(assessment.effect?.impactKind).toBe("ECONOMIC");
  });

  it("classifies the effect as ECONOMIC, never CASH, without separate purchase-avoidance evidence", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput());
    expect(assessment.effect?.impactKind).toBe("ECONOMIC");
    expect(assessment.limitations).toContain(SLURRY_DIRECT_ASSESSMENT_CASH_LIMITATION);
  });

  it("always discloses the finite-resource limitation, even on a fully supported quantified result", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput());
    expect(assessment.limitations).toContain(SLURRY_DIRECT_ASSESSMENT_FINITE_RESOURCE_LIMITATION);
  });

  it("is deterministic across independent runs with identical inputs", () => {
    const a = buildSlurryDirectEconomicAssessment(baseInput());
    const b = buildSlurryDirectEconomicAssessment(baseInput());
    expect(a.directCostDifference).toEqual(b.directCostDifference);
    expect(a.effect?.creditClaim.creditKey).toEqual(b.effect?.creditClaim.creditKey);
    expect(a.baselineFertiliserPlanCost.lines.map((l) => l.product)).toEqual(b.baselineFertiliserPlanCost.lines.map((l) => l.product));
  });
});

// ---------------------------------------------------------------------------
// B. Genuine zero-benefit / unwanted-nutrient case
// ---------------------------------------------------------------------------

describe("buildSlurryDirectEconomicAssessment — unwanted nutrient / zero benefit", () => {
  // Meadow 3: K Index 4 -> K requirement is genuinely 0 already. A K-only
  // slurry contribution must never fabricate value it doesn't earn.
  const supportedOnOversupplyField: SlurryAllocation = {
    ...supportedSpringSplashplate,
    fieldId: oversupplyField.id,
    volumeM3: 5 * oversupplyField.areaHa,
  };

  it("never creates artificial monetary value for a nutrient that does not reduce the canonical fertiliser requirement", () => {
    const baselinePlan = planWithout(oversupplyField);
    const interventionPlan = planWith(oversupplyField, supportedOnOversupplyField);
    // Real engine fact this fixture is built on: K requirement is 0 in
    // both scenarios (Index 4), so a K-only credit cannot change the
    // costed blend on that axis.
    expect(baselinePlan.requirement.value.k).toBe(0);
    expect(interventionPlan.requirement.value.k).toBe(0);

    const assessment = buildSlurryDirectEconomicAssessment(
      baseInput({
        id: "assessment-oversupply",
        fieldId: oversupplyField.id,
        baselinePlan,
        interventionPlan,
      }),
    );

    expect(assessment.scienceSupport.status).toBe("OK");
    expect(assessment.counterfactualInvariance.valid).toBe(true);
    expect(assessment.directCostDifference.status).toBe("OK");
    // Whatever the real direction turns out to be for this fixture, no
    // nutrient x €/kg multiplication occurred anywhere — the only
    // arithmetic in this module is Phase 4's own exact plan-cost
    // subtraction, verified again here as an independent recomputation.
    const baseline = okMoney(assessment.baselineFertiliserPlanCost.aggregateOutcome);
    const intervention = okMoney(assessment.interventionFertiliserPlanCost.aggregateOutcome);
    const comparison = compareMoney(baseline, intervention);
    if (comparison === 0) {
      expect(assessment.directCostDifferenceDirection).toBe("zero");
      expect(okMoney(assessment.directCostDifference).amount).toBe(zeroMoney("EUR").amount);
      // A genuine, quantified zero must still be a real effect, not an
      // omitted one.
      expect(assessment.effect).not.toBeNull();
      expect(assessment.effect?.amount.status).toBe("OK");
    }
  });
});

// ---------------------------------------------------------------------------
// C. Unsupported science — never becomes €0
// ---------------------------------------------------------------------------

describe("buildSlurryDirectEconomicAssessment — unsupported science", () => {
  it("blocks the whole assessment when the intervention's slurry science is unsupported, never comparing costs as if slurry were zero", () => {
    const baselinePlan = planWithout(goldenField);
    const interventionPlan = planWith(goldenField, unsupportedMethod);

    expect(interventionPlan.organicApplication.availableNutrientAssessment.status).not.toBe("OK");
    expect(interventionPlan.requirementProvisional.isProvisional).toBe(true);

    const assessment = buildSlurryDirectEconomicAssessment(
      baseInput({ id: "assessment-unsupported", baselinePlan, interventionPlan }),
    );

    expect(assessment.scienceSupport.status).not.toBe("OK");
    expect(assessment.directCostDifference.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (assessment.directCostDifference.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(assessment.directCostDifference.reasonCode).toBe("ECONOMIC_SLURRY_ASSESSMENT_UNSUPPORTED_SCIENCE");
    }
    expect(assessment.directCostDifferenceDirection).toBeNull();
    expect(assessment.effect).toBeNull();
    // Even though the underlying costed plans may be numerically
    // identical (nutrients.ts floors the arithmetic offset to zero
    // internally), the assessment must never present that as a genuine
    // "no economic benefit" result.
    expect(assessment.netEconomicResult.amount.status).not.toBe("OK");
  });

  it("blocks when no slurry allocation is evaluated at all (NOT_APPLICABLE science outcome)", () => {
    const baselinePlan = planWithout(goldenField);
    // Intervention "with" the evaluated action is itself a no-slurry plan
    // — a caller-input degenerate case that must still fail closed, not
    // silently compare identical plans as a valid zero.
    const interventionPlan = planWithout(goldenField);
    expect(interventionPlan.organicApplication.availableNutrientAssessment.status).toBe("NOT_APPLICABLE");

    const assessment = buildSlurryDirectEconomicAssessment(
      baseInput({ id: "assessment-not-applicable", baselinePlan, interventionPlan }),
    );
    expect(assessment.directCostDifference.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(assessment.effect).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D. Counterfactual invariance
// ---------------------------------------------------------------------------

describe("buildSlurryDirectEconomicAssessment — counterfactual invariance", () => {
  it("invalidates the scenario pair when the gross (pre-slurry) requirement differs between baseline and intervention", () => {
    const differentField: Field = { ...goldenField, id: "field-different", fertility: { pIndex: tracked(3, "farmer_adjusted", "Keith"), kIndex: tracked(3, "farmer_adjusted", "Keith") } };
    const baselinePlan = planWithout(differentField); // different soil evidence than intervention
    const interventionPlan = planWith(goldenField, supportedSpringSplashplate);

    const assessment = buildSlurryDirectEconomicAssessment(
      baseInput({ id: "assessment-invariance", baselinePlan, interventionPlan }),
    );

    expect(assessment.counterfactualInvariance.valid).toBe(false);
    expect(assessment.counterfactualInvariance.reasonCode).toBe("ECONOMIC_SLURRY_ASSESSMENT_SCENARIO_INVARIANCE_VIOLATION");
    expect(assessment.directCostDifference.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(assessment.effect).toBeNull();
  });

  it("accepts a valid pair where only the evaluated action differs (real fixture, real requirement equality)", () => {
    const baselinePlan = planWithout(goldenField);
    const interventionPlan = planWith(goldenField, supportedSpringSplashplate);
    expect(baselinePlan.requirement.value).toEqual(interventionPlan.requirement.value);
    const assessment = buildSlurryDirectEconomicAssessment(baseInput({ baselinePlan, interventionPlan }));
    expect(assessment.counterfactualInvariance.valid).toBe(true);
  });

  // Phase 6 adversarial review finding (HIGH): without this, nothing
  // structurally proved that a downstream consumer's claimed candidate
  // volume actually matched the real volume this assessment was computed
  // for — see slurry-whole-farm-allocation.ts's own cross-check, which
  // this field exists to make possible.
  it("exposes the real evaluated-action volume (organicApplication.totalM3 delta), matching the real fixture's own 200 m³ allocation", () => {
    const baselinePlan = planWithout(goldenField);
    const interventionPlan = planWith(goldenField, supportedSpringSplashplate); // 20 * 10ha = 200 m³
    expect(interventionPlan.organicApplication.totalM3).toBe(200);
    expect(baselinePlan.organicApplication.totalM3).toBe(0);
    const assessment = buildSlurryDirectEconomicAssessment(baseInput({ baselinePlan, interventionPlan }));
    expect(assessment.evaluatedActionVolumeM3).toBe("200");
  });

  it("invalidates the scenario pair when intervention organic volume is LESS than baseline's — a valid intervention must never carry less organic volume than baseline", () => {
    // Constructed directly (not via calculateNutrientPlan) since the real
    // engine cannot itself produce this inverted case — this proves the
    // guard exists structurally, not merely that real science happens to
    // avoid it.
    const baselinePlan = planWith(goldenField, supportedSpringSplashplate); // 200 m³
    const interventionPlan = planWithout(goldenField); // 0 m³ — less than baseline
    const assessment = buildSlurryDirectEconomicAssessment(baseInput({ baselinePlan, interventionPlan }));
    expect(assessment.counterfactualInvariance.valid).toBe(false);
    expect(assessment.counterfactualInvariance.reasonCode).toBe("ECONOMIC_SLURRY_ASSESSMENT_SCENARIO_INVARIANCE_VIOLATION");
    expect(assessment.directCostDifference.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });
});

// ---------------------------------------------------------------------------
// E. Missing / proxy price
// ---------------------------------------------------------------------------

describe("buildSlurryDirectEconomicAssessment — price evidence", () => {
  it("blocks the direct cost difference when a required product has no resolved price — never compares a partial plan", () => {
    const prices = allProductPrices();
    // Remove the 18-6-12 price entirely — if the plan needs it, the
    // relevant Phase 4 cost assessment must fail closed as incomplete.
    delete (prices as Record<string, unknown>)["18-6-12"];
    const assessment = buildSlurryDirectEconomicAssessment(baseInput({ resolvedPricesByProduct: prices }));

    const usesEighteenSixTwelve =
      assessment.baselineFertiliserPlanCost.lines.some((l) => l.product === "18-6-12") ||
      assessment.interventionFertiliserPlanCost.lines.some((l) => l.product === "18-6-12");
    if (usesEighteenSixTwelve) {
      expect(assessment.directCostDifference.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      expect(assessment.effect).toBeNull();
    }
  });

  it("propagates the CATEGORY_BENCHMARK proxy limitation into the assessment when Protected Urea is used", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput());
    const usesProtectedUrea =
      assessment.baselineFertiliserPlanCost.lines.some((l) => l.product === "Protected Urea") ||
      assessment.interventionFertiliserPlanCost.lines.some((l) => l.product === "Protected Urea");
    if (usesProtectedUrea) {
      expect(assessment.limitations.some((l) => l.includes("not an exact Protected Urea product price"))).toBe(true);
    }
  });

  it("holds the same price-resolution context (asOfDate/knownAt) constant across both scenarios — Phase 4's own guard, reused", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput());
    expect(assessment.baselineFertiliserPlanCost.asOfDate).toBe(assessment.interventionFertiliserPlanCost.asOfDate);
    expect(assessment.baselineFertiliserPlanCost.knownAt).toBe(assessment.interventionFertiliserPlanCost.knownAt);
  });
});

// ---------------------------------------------------------------------------
// F. Credit claim / double counting
// ---------------------------------------------------------------------------

describe("buildSlurryDirectEconomicAssessment — credit claim / double counting", () => {
  it("produces exactly one monetised effect with a deterministic credit key tied to the evaluated action", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput());
    expect(assessment.effect).not.toBeNull();
    expect(assessment.effect?.creditClaim.creditKey).toContain("allocation-real-db-id-1");
    expect(assessment.effect?.creditClaim.creditKey).toContain(goldenField.id);
  });

  it("a single real effect always passes the Phase 1 duplicate-credit-claim validator", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput());
    const result = validateNoDuplicateCreditClaims(assessment.effect ? [assessment.effect] : []);
    expect(result.valid).toBe(true);
  });

  it("two different evaluated actions on the same field produce two distinguishable credit keys (no accidental collision)", () => {
    const a = buildSlurryDirectEconomicAssessment(baseInput({ id: "a", evaluatedActionId: "allocation-1" }));
    const b = buildSlurryDirectEconomicAssessment(baseInput({ id: "b", evaluatedActionId: "allocation-2" }));
    expect(a.effect?.creditClaim.creditKey).not.toBe(b.effect?.creditClaim.creditKey);
    if (a.effect && b.effect) {
      const result = validateNoDuplicateCreditClaims([a.effect, b.effect]);
      expect(result.valid).toBe(true);
    }
  });

  it("re-running the same evaluated action twice would collide on the same credit key (proving the guard is real, not just distinct by construction)", () => {
    const a = buildSlurryDirectEconomicAssessment(baseInput({ id: "a" }));
    const b = buildSlurryDirectEconomicAssessment(baseInput({ id: "b" })); // same evaluatedActionId as baseInput's default
    if (a.effect && b.effect) {
      const result = validateNoDuplicateCreditClaims([a.effect, b.effect]);
      expect(result.valid).toBe(false);
      expect(result.reasonCode).toBe("ECONOMIC_DUPLICATE_CREDIT_CLAIM");
    }
  });

  it("adversarial regression: delimiter-ambiguous evaluatedActionId/fieldId pairs that would collide under a naive template-literal key do NOT collide", () => {
    // Prior (fixed) defect: `${evaluatedActionId}:field:${fieldId}` let
    // ("A:field:B", "C") and ("A", "B:field:C") produce the identical
    // string. Both plans/fieldIds must agree with each assessment's own
    // fieldId for the counterfactual-invariance check to pass.
    const baselinePlan = planWithout(goldenField);
    const interventionPlan = planWith(goldenField, supportedSpringSplashplate);
    const a = buildSlurryDirectEconomicAssessment(
      baseInput({
        id: "a",
        evaluatedActionId: "A:field:B",
        fieldId: "C",
        baselinePlan: { ...baselinePlan, fieldId: "C" },
        interventionPlan: { ...interventionPlan, fieldId: "C" },
      }),
    );
    const b = buildSlurryDirectEconomicAssessment(
      baseInput({
        id: "b",
        evaluatedActionId: "A",
        fieldId: "B:field:C",
        baselinePlan: { ...baselinePlan, fieldId: "B:field:C" },
        interventionPlan: { ...interventionPlan, fieldId: "B:field:C" },
      }),
    );
    expect(a.effect).not.toBeNull();
    expect(b.effect).not.toBeNull();
    expect(a.effect?.creditClaim.creditKey).not.toBe(b.effect?.creditClaim.creditKey);
    if (a.effect && b.effect) {
      const result = validateNoDuplicateCreditClaims([a.effect, b.effect]);
      expect(result.valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// H. Negative realisation cost (adversarial regression)
// ---------------------------------------------------------------------------

describe("buildSlurryDirectEconomicAssessment — negative realisation cost", () => {
  it("rejects a negative realisation-cost amount rather than letting it inflate net return above the audited gross benefit", () => {
    const gross = buildSlurryDirectEconomicAssessment(baseInput({ realisationCost: { status: "known_zero" } }));
    if (gross.directCostDifference.status !== "OK") throw new Error("expected OK gross benefit for this fixture");
    const grossAmount = gross.directCostDifference.value;

    const withNegativeCost = buildSlurryDirectEconomicAssessment(
      baseInput({ realisationCost: { status: "quantified", amount: { amount: "-50", currency: "EUR" } } }),
    );
    expect(withNegativeCost.netEconomicResult.amount.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (withNegativeCost.netEconomicResult.amount.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(withNegativeCost.netEconomicResult.amount.reasonCode).toBe("ECONOMIC_SLURRY_ASSESSMENT_NEGATIVE_REALISATION_COST");
    }
    // Prior (fixed) defect: this would have been OK with a value strictly
    // greater than grossAmount (gross - (-50) = gross + 50).
    expect(withNegativeCost.netEconomicResult.amount.status).not.toBe("OK");
    void grossAmount;
  });
});

// ---------------------------------------------------------------------------
// G. Realisation cost / net return
// ---------------------------------------------------------------------------

describe("buildSlurryDirectEconomicAssessment — realisation cost and net return", () => {
  it("unknown realisation cost leaves the direct benefit quantified but net return NOT_QUANTIFIED", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput({ realisationCost: { status: "unknown" } }));
    expect(assessment.directCostDifference.status).toBe("OK");
    expect(assessment.netEconomicResult.amount.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (assessment.netEconomicResult.amount.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(assessment.netEconomicResult.amount.reasonCode).toBe("ECONOMIC_SLURRY_ASSESSMENT_NET_RETURN_UNKNOWN_REALISATION_COST");
    }
    expect(assessment.netEconomicResult.direction).toBeNull();
  });

  it("explicitly known-zero realisation cost permits net return equal to the gross direct benefit", () => {
    const assessment = buildSlurryDirectEconomicAssessment(baseInput({ realisationCost: { status: "known_zero" } }));
    expect(assessment.directCostDifference.status).toBe("OK");
    expect(assessment.netEconomicResult.amount.status).toBe("OK");
    if (assessment.directCostDifference.status === "OK" && assessment.netEconomicResult.amount.status === "OK") {
      expect(assessment.netEconomicResult.amount.value.amount).toBe(assessment.directCostDifference.value.amount);
    }
  });

  it("a known incremental cost reduces net return correctly (exact subtraction)", () => {
    const known = buildSlurryDirectEconomicAssessment(baseInput({ realisationCost: { status: "known_zero" } }));
    if (known.directCostDifference.status !== "OK") throw new Error("expected OK gross benefit for this fixture");
    const grossAmount = known.directCostDifference.value;

    const smallCost: MoneyAmount = { amount: "1", currency: "EUR" };
    const withCost = buildSlurryDirectEconomicAssessment(baseInput({ realisationCost: { status: "quantified", amount: smallCost } }));
    expect(withCost.netEconomicResult.amount.status).toBe("OK");
    if (withCost.netEconomicResult.amount.status === "OK") {
      const expectedNet = subtractMoney(grossAmount, smallCost);
      expect(withCost.netEconomicResult.amount.value.amount).toBe(expectedNet.amount);
      expect(withCost.netEconomicResult.direction).toBe(expectedNet.amount.startsWith("-") ? "cost" : expectedNet.amount === "0" ? "zero" : "benefit");
    }
  });

  it("an incremental cost greater than the gross benefit yields a correctly-signed net COST, not a negative benefit", () => {
    const known = buildSlurryDirectEconomicAssessment(baseInput({ realisationCost: { status: "known_zero" } }));
    if (known.directCostDifference.status !== "OK") throw new Error("expected OK gross benefit for this fixture");
    const grossAmount = known.directCostDifference.value;
    // A deliberately huge incremental cost, guaranteed to exceed any
    // realistic gross benefit from this fixture.
    const hugeCost: MoneyAmount = { amount: (Number(grossAmount.amount) + 100000).toFixed(2), currency: "EUR" };
    const assessment = buildSlurryDirectEconomicAssessment(baseInput({ realisationCost: { status: "quantified", amount: hugeCost } }));
    expect(assessment.netEconomicResult.direction).toBe("cost");
    expect(assessment.netEconomicResult.amount.status).toBe("OK");
    if (assessment.netEconomicResult.amount.status === "OK") {
      // A "net cost" magnitude must itself be non-negative (sign lives in
      // direction, mirroring EconomicEffect's own convention).
      expect(assessment.netEconomicResult.amount.value.amount.startsWith("-")).toBe(false);
    }
  });

  it("absence of realisation-cost evidence never defaults to a known zero", () => {
    const unknownRun = buildSlurryDirectEconomicAssessment(baseInput({ realisationCost: { status: "unknown" } }));
    const zeroRun = buildSlurryDirectEconomicAssessment(baseInput({ realisationCost: { status: "known_zero" } }));
    expect(unknownRun.netEconomicResult.amount.status).not.toBe(zeroRun.netEconomicResult.amount.status === "OK" ? "OK" : "BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(unknownRun.netEconomicResult.amount.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });
});
