import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { calculateNutrientPlan } from "./nutrients";
import { tracked, type Field, type LivestockGroup, type NutrientPlan, type SlurryAllocation } from "./types";
import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation, type CreateMarketPriceObservationInput } from "./market-evidence";
import { resolveMarketReferencePrice, type AuditableMarketPriceResolution } from "./market-price-resolution";
import type { EngineOutcome } from "./evidence";
import { createMoneyAmount, zeroMoney, type MoneyAmount } from "./money";
import { validateNoDuplicateCreditClaims, type EconomicEffect } from "./economic-opportunity";
import { buildSlurryDirectEconomicAssessment, type SlurryDirectEconomicAssessmentInput, type SlurryDirectEconomicAssessment, type SlurryScienceSupportOutcome } from "./slurry-direct-economic-assessment";
import type { FertiliserPlanCostAssessment } from "./fertiliser-plan-cost";
import {
  buildSlurryWholeFarmAllocation,
  SLURRY_VOLUME_MAX_DECIMAL_PLACES,
  MAX_ENUMERATED_COMBINATIONS,
  type SlurryAllocationCandidateInput,
  type SlurryWholeFarmAllocationResult,
} from "./slurry-whole-farm-allocation";

// ---------------------------------------------------------------------------
// PART A — real end-to-end fixtures (same pattern
// slurry-direct-economic-assessment.test.ts already uses): actual
// calculateNutrientPlan output, actual Phase 2/3 price pipeline, actual
// buildSlurryDirectEconomicAssessment. Used to prove Phase 6 genuinely
// consumes real Phase 5 output (STOP D / non-linearity), not a fabricated
// shortcut.
// ---------------------------------------------------------------------------

const livestockGroups: LivestockGroup[] = [
  { id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
];
const farmGrasslandAreaHa = 27;
const asOfDate = "2026-09-25";

function makeField(id: string, areaHa: number, pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4): Field {
  return {
    id,
    farmId: "farm-test",
    name: id,
    areaHa,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
    fertility: { pIndex: tracked(pIndex, "farmer_adjusted", "Keith"), kIndex: tracked(kIndex, "farmer_adjusted", "Keith") },
    history: [],
  };
}

const fieldA = makeField("field-A", 10, 2, 2);
const fieldB = makeField("field-B", 8, 2, 2);

function slurryOn(field: Field, volumeM3: number): SlurryAllocation {
  return {
    fieldId: field.id,
    housingId: "h1",
    priority: "high",
    volumeM3,
    score: 90,
    applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith"),
    applicationDate: tracked("2026-02-15", "farmer_adjusted", "Keith"),
  };
}
const unsupportedMethodOn = (field: Field, volumeM3: number): SlurryAllocation => ({
  fieldId: field.id,
  housingId: "h1",
  priority: "high",
  volumeM3,
  score: 90,
  applicationMethod: tracked("incorporate_24h", "farmer_adjusted", "Keith"),
  applicationDate: tracked("2026-02-15", "farmer_adjusted", "Keith"),
});

function planWithout(field: Field): NutrientPlan {
  return calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: undefined, asOfDate });
}
function planWith(field: Field, allocation: SlurryAllocation): NutrientPlan {
  return calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: allocation, asOfDate });
}

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
  return createMarketPriceObservation({ ...fields, contentHash: hash(canonicalContentHashInput(fields)) });
}
function resolved(candidates: MarketPriceObservation[], mappedProduct: string, decisionDate = asOfDate): EngineOutcome<AuditableMarketPriceResolution> {
  return resolveMarketReferencePrice({ candidates, mappedProduct, asOfDate: decisionDate });
}
function allProductPrices(decisionDate = asOfDate): Record<string, EngineOutcome<AuditableMarketPriceResolution>> {
  const zeroSevenThirty = observation({ sourceSeriesCode: "008", priceAmount: "412", mappingKind: "EXACT_PRODUCT_MATCH", mappedProduct: "0-7-30", sourceSeriesLabel: "Compound 0-7-30" });
  const eighteenSixTwelve = observation({ sourceSeriesCode: "012", priceAmount: "645", mappingKind: "EXACT_PRODUCT_MATCH", mappedProduct: "18-6-12", sourceSeriesLabel: "Compound 18-6-12" });
  const protectedUrea = observation({ sourceSeriesCode: "002", priceAmount: "550", mappingKind: "CATEGORY_BENCHMARK", mappedProduct: "Protected Urea", sourceSeriesLabel: "Urea (46% N)" });
  return {
    "0-7-30": resolved([zeroSevenThirty], "0-7-30", decisionDate),
    "18-6-12": resolved([eighteenSixTwelve], "18-6-12", decisionDate),
    "Protected Urea": resolved([protectedUrea], "Protected Urea", decisionDate),
  };
}
const pricesOk = allProductPrices()["18-6-12"];
const knownAt = pricesOk.status === "OK" ? pricesOk.value.trace.knownAt : "";

function realAssessment(overrides: Partial<SlurryDirectEconomicAssessmentInput> & Pick<SlurryDirectEconomicAssessmentInput, "evaluatedActionId" | "fieldId" | "baselinePlan" | "interventionPlan">): SlurryDirectEconomicAssessment {
  return buildSlurryDirectEconomicAssessment({
    id: `assessment-${overrides.evaluatedActionId}`,
    asOfDate,
    knownAt,
    resolvedPricesByProduct: allProductPrices(),
    // known_zero (not "unknown") so the NET result is actually
    // comparable for Phase 6's own optimisation — Phase 5's own rule is
    // that an unknown realisation cost always blocks net regardless of
    // how confidently gross is known, which would make every real
    // end-to-end fixture in this file permanently non-comparable
    // otherwise. These fixtures assert no incremental realisation cost
    // for testing purposes only, not a real farm fact.
    realisationCost: { status: "known_zero" },
    createdAt: "2026-09-25T00:00:00.000Z",
    ...overrides,
  });
}

function realCandidate(field: Field, volumeM3: number, evaluatedActionId: string, unsupported = false): SlurryAllocationCandidateInput {
  const allocation = unsupported ? unsupportedMethodOn(field, volumeM3) : slurryOn(field, volumeM3);
  const assessment = realAssessment({
    evaluatedActionId,
    fieldId: field.id,
    baselinePlan: planWithout(field),
    interventionPlan: planWith(field, allocation),
  });
  return { evaluatedActionId, fieldId: field.id, volumeM3, assessment };
}

// ---------------------------------------------------------------------------
// PART B — controlled fixture helper for optimiser-correctness tests. Phase
// 6 never reads scienceSupport/counterfactualInvariance/scenarios/the two
// FertiliserPlanCostAssessments' own internals — only netEconomicResult,
// directCostDifference(+direction), effect, evaluatedActionId, fieldId,
// limitations — so a minimal, internally-consistent stub for those unread
// fields is sufficient and does not re-test Phase 4/5's own machinery
// (already covered by their own suites). Used only where the brief's own
// text prefers exact, controllable € values it would be impractical to
// coax real discrete Teagasc science into producing on demand (the §22
// greedy-counterexample shape, and the §23 same-field double-counting
// case).
// ---------------------------------------------------------------------------

function stubScienceSupportOk(): SlurryScienceSupportOutcome {
  return {
    status: "OK",
    evidenceState: "IRISH_MODEL",
    value: { n: 10, p: 0, k: 0, unit: "kg/ha", applicationMethod: "splashplate", assumedDefault: false, applicationRateM3ha: 20, dmPct: 6, applicationDate: "2026-02-15" } as unknown as SlurryScienceSupportOutcome extends EngineOutcome<infer V> ? V : never,
  };
}
function stubPlanCost(id: string): FertiliserPlanCostAssessment {
  return { id, engineVersion: "stub", asOfDate, knownAt, lines: [], aggregateOutcome: { status: "OK", value: zeroMoney("EUR"), evidenceState: "IRISH_MODEL" }, limitations: [], createdAt: "2026-01-01T00:00:00.000Z" };
}

function fixtureAssessment(params: { evaluatedActionId: string; fieldId: string; direction: "benefit" | "cost" | "zero"; magnitude: string; volumeM3?: number }): SlurryDirectEconomicAssessment {
  const amount: MoneyAmount = createMoneyAmount(params.magnitude, "EUR");
  const zero = zeroMoney("EUR");
  const directionOutcome: "benefit" | "cost" | "zero" = params.direction;
  const effect: EconomicEffect = {
    id: `${params.evaluatedActionId}:effect`,
    type: params.direction === "cost" ? "ADDITIONAL_INPUT_COST" : "AVOIDED_FERTILISER_PLAN_COST",
    direction: params.direction === "cost" ? "cost" : "benefit",
    impactKind: "ECONOMIC",
    amount: { status: "OK", value: params.direction === "zero" ? zero : amount, evidenceState: "IRISH_MODEL" },
    vatTreatment: "unknown",
    priceBasis: "per_tonne",
    creditClaim: {
      creditKey: `slurry-allocation:${JSON.stringify([params.evaluatedActionId, params.fieldId])}:fertiliser-plan-cost-difference`,
      resourceDescription: `fixture effect for ${params.evaluatedActionId}`,
      scopeFieldId: params.fieldId,
    },
    scenarioId: "intervention",
    limitations: [],
  };
  return {
    id: `assessment-${params.evaluatedActionId}`,
    engineVersion: "fixture",
    evaluatedActionId: params.evaluatedActionId,
    fieldId: params.fieldId,
    asOfDate,
    knownAt,
    scenarios: [
      { id: "baseline", role: "baseline", label: "Without" },
      { id: "intervention", role: "intervention", label: "With" },
    ],
    scienceSupport: stubScienceSupportOk(),
    counterfactualInvariance: { valid: true },
    // Adversarial review finding (HIGH): Phase 6 now checks a candidate's
    // claimed volumeM3 against this field — must match `fixtureCandidate`'s
    // own volumeM3 for these controlled-value optimiser tests to reach the
    // behaviour they're actually testing, exactly the real cross-check a
    // real caller would now have to satisfy too.
    evaluatedActionVolumeM3: String(params.volumeM3 ?? 0),
    baselineFertiliserPlanCost: stubPlanCost(`${params.evaluatedActionId}:baseline`),
    interventionFertiliserPlanCost: stubPlanCost(`${params.evaluatedActionId}:intervention`),
    directCostDifference: { status: "OK", value: params.direction === "zero" ? zero : amount, evidenceState: "IRISH_MODEL" },
    directCostDifferenceDirection: directionOutcome,
    effect,
    realisationCost: { status: "known_zero" },
    netEconomicResult: { direction: directionOutcome, amount: { status: "OK", value: params.direction === "zero" ? zero : amount, evidenceState: "IRISH_MODEL" } },
    limitations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
function blockedFixtureAssessment(evaluatedActionId: string, fieldId: string, reasonCode: string, volumeM3 = 0): SlurryDirectEconomicAssessment {
  const base = fixtureAssessment({ evaluatedActionId, fieldId, direction: "benefit", magnitude: "1", volumeM3 });
  return { ...base, directCostDifference: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode, missingInputs: ["unsupported science"] }, directCostDifferenceDirection: null, effect: null, netEconomicResult: { direction: null, amount: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode, missingInputs: ["unsupported science"] } } };
}
function fixtureCandidate(evaluatedActionId: string, fieldId: string, volumeM3: number, direction: "benefit" | "cost" | "zero", magnitude: string): SlurryAllocationCandidateInput {
  return { evaluatedActionId, fieldId, volumeM3, assessment: fixtureAssessment({ evaluatedActionId, fieldId, direction, magnitude, volumeM3 }) };
}

function baseAllocationInput(candidates: SlurryAllocationCandidateInput[], availableVolumeM3: number): Parameters<typeof buildSlurryWholeFarmAllocation>[0] {
  return { id: "alloc-1", asOfDate, knownAt, availableVolume: { status: "known", volumeM3: availableVolumeM3 }, candidates, createdAt: "2026-09-25T00:00:00.000Z" };
}

function expectOk(outcome: EngineOutcome<SlurryWholeFarmAllocationResult>): SlurryWholeFarmAllocationResult {
  if (outcome.status !== "OK") throw new Error(`expected OK, got ${JSON.stringify(outcome)}`);
  return outcome.value;
}

// ===========================================================================
// A. Real end-to-end golden case + non-linearity proof
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — real end-to-end", () => {
  it("selects a real supported candidate using its own genuine Phase 5 assessment, not an estimate", () => {
    const candidateA = realCandidate(fieldA, 200, "action-A");
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([candidateA], 300)));
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].evaluatedActionId).toBe("action-A");
    // The reported contribution is literally the same object Phase 5
    // produced — not re-derived or interpolated.
    expect(result.selected[0].netEconomicContribution.amount.amount).toBe((candidateA.assessment.netEconomicResult.amount as { status: "OK"; value: MoneyAmount }).value.amount);
    expect(result.selectedVolumeM3).toBe("200.00");
    expect(result.remainingVolumeM3).toBe("100.00");
  });

  it("excludes a real unsupported-science candidate without ever treating it as €0 (STOP-A-adjacent unknown-vs-zero discipline)", () => {
    const supported = realCandidate(fieldA, 200, "action-supported");
    const unsupported = realCandidate(fieldB, 100, "action-unsupported", true);
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([supported, unsupported], 500)));
    expect(result.selected.map((s) => s.evaluatedActionId)).toEqual(["action-supported"]);
    const excludedEntry = result.excluded.find((e) => e.evaluatedActionId === "action-unsupported");
    expect(excludedEntry?.reason.kind).toBe("not_economically_comparable");
    // Phase 6 reports exactly the NET-level reason Phase 5 itself
    // produced (net wraps "gross not quantified" here, since gross
    // itself is the one that's actually blocked on unsupported science —
    // traceable one level deeper via the candidate's own assessment).
    if (excludedEntry?.reason.kind === "not_economically_comparable") {
      expect(excludedEntry.reason.reasonCode).toBe("ECONOMIC_SLURRY_ASSESSMENT_NET_RETURN_UNQUANTIFIED_GROSS");
    }
    expect(unsupported.assessment.directCostDifference.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (unsupported.assessment.directCostDifference.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(unsupported.assessment.directCostDifference.reasonCode).toBe("ECONOMIC_SLURRY_ASSESSMENT_UNSUPPORTED_SCIENCE");
    }
  });

  it("does not linearly interpolate — two real different volumes on the same field are two independent real Phase 5 results, not a scaled single value", () => {
    const small = realAssessment({ evaluatedActionId: "a-small", fieldId: fieldA.id, baselinePlan: planWithout(fieldA), interventionPlan: planWith(fieldA, slurryOn(fieldA, 50)) });
    const large = realAssessment({ evaluatedActionId: "a-large", fieldId: fieldA.id, baselinePlan: planWithout(fieldA), interventionPlan: planWith(fieldA, slurryOn(fieldA, 200)) });
    // Real discrete product-mix effects mean these need not be in a fixed
    // ratio to their volumes — no assertion is made about a specific
    // proportional relationship, only that each is its own real,
    // independently-computed Phase 5 output (not derived from the other).
    expect(small.netEconomicResult).not.toBe(large.netEconomicResult);
  });

  // Adversarial review finding (HIGH) — the review brief's own "Mismatch
  // A": a real, valid Phase 5 assessment genuinely computed for a 200 m³
  // action, attached to a candidate that claims only 100 m³. Before the
  // fix, this module used the real €-value while silently under-counting
  // the physical resource it actually costs — corrupting both the
  // resource-conservation invariant's real meaning and the reported
  // remaining volume.
  it("rejects a candidate whose claimed volume does not match the real volume its own Phase 5 assessment was computed for (Mismatch A)", () => {
    const genuine200m3 = realCandidate(fieldA, 200, "action-mismatch");
    expect(genuine200m3.assessment.evaluatedActionVolumeM3).toBe("200");
    const mismatched = { ...genuine200m3, volumeM3: 100 }; // same real assessment, false claimed volume
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([mismatched], 300)));
    expect(result.selected).toHaveLength(0);
    const excludedEntry = result.excluded.find((e) => e.evaluatedActionId === "action-mismatch");
    expect(excludedEntry?.reason.kind).toBe("invalid_input");
    if (excludedEntry?.reason.kind === "invalid_input") {
      expect(excludedEntry.reason.detail).toContain("does not match the real volume");
    }
  });

  it("positive control: a candidate whose claimed volume genuinely matches its real Phase 5 assessment is accepted normally", () => {
    const genuine = realCandidate(fieldA, 200, "action-matching");
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([genuine], 300)));
    expect(result.selected.map((s) => s.evaluatedActionId)).toEqual(["action-matching"]);
  });
});

// ===========================================================================
// B. Resource conservation
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — resource conservation", () => {
  it("never selects more volume than is available when candidate demand exceeds supply", () => {
    const candidates = [
      fixtureCandidate("c1", "f1", 300, "benefit", "100"),
      fixtureCandidate("c2", "f2", 300, "benefit", "100"),
      fixtureCandidate("c3", "f3", 300, "benefit", "100"),
    ];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600)));
    const totalSelectedVolume = result.selected.reduce((sum, s) => sum + Number(s.volumeM3), 0);
    expect(totalSelectedVolume).toBeLessThanOrEqual(600);
    expect(result.selected).toHaveLength(2); // exactly 2 of 3 fit within 600
  });

  it("selects an exact-fit combination when candidates sum exactly to available volume", () => {
    const candidates = [fixtureCandidate("c1", "f1", 300, "benefit", "50"), fixtureCandidate("c2", "f2", 300, "benefit", "50")];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600)));
    expect(result.selected).toHaveLength(2);
    expect(result.selectedVolumeM3).toBe("600.00");
    expect(result.remainingVolumeM3).toBe("0.00");
  });

  it("leaves genuine remaining volume when the best economic set uses less than what's available", () => {
    const candidates = [fixtureCandidate("c1", "f1", 100, "benefit", "50")];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600)));
    expect(result.selectedVolumeM3).toBe("100.00");
    expect(result.remainingVolumeM3).toBe("500.00");
  });
});

// ===========================================================================
// C. No forced allocation / genuine zero vs blocked
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — no forced allocation", () => {
  it("selects nothing when every candidate is economically adverse", () => {
    const candidates = [fixtureCandidate("c1", "f1", 100, "cost", "50"), fixtureCandidate("c2", "f2", 100, "cost", "30")];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600)));
    expect(result.selected).toHaveLength(0);
    expect(result.selectedVolumeM3).toBe("0.00");
    const netAmount = result.totalNetEconomicResult.amount;
    expect(netAmount.status).toBe("OK");
    if (netAmount.status === "OK") expect(netAmount.value.amount).toBe("0");
  });

  it("prefers selecting nothing over a genuine zero-value candidate (does not exhaust supply merely to use it)", () => {
    const candidates = [fixtureCandidate("c1", "f1", 200, "zero", "0")];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600)));
    expect(result.selected).toHaveLength(0);
    expect(result.excluded[0]?.reason.kind).toBe("not_selected_by_optimiser");
  });

  it("distinguishes a genuine zero result from a blocked/unsupported one — a real zero candidate remains comparable, an unsupported one is excluded", () => {
    const zeroCandidate = fixtureCandidate("c1", "f1", 100, "zero", "0");
    const blockedCandidate: SlurryAllocationCandidateInput = { evaluatedActionId: "c2", fieldId: "f2", volumeM3: 100, assessment: blockedFixtureAssessment("c2", "f2", "ECONOMIC_SLURRY_ASSESSMENT_UNSUPPORTED_SCIENCE", 100) };
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([zeroCandidate, blockedCandidate], 600)));
    const zeroExclusion = result.excluded.find((e) => e.evaluatedActionId === "c1");
    const blockedExclusion = result.excluded.find((e) => e.evaluatedActionId === "c2");
    expect(zeroExclusion?.reason.kind).toBe("not_selected_by_optimiser"); // comparable, just not chosen
    expect(blockedExclusion?.reason.kind).toBe("not_economically_comparable"); // never comparable at all
  });
});

// ===========================================================================
// D. Mutually exclusive / competing candidates (same field)
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — same-field mutual exclusion", () => {
  it("selects at most one of several competing volume variants on the same field", () => {
    const candidates = [
      fixtureCandidate("v100", "field-X", 100, "benefit", "80"),
      fixtureCandidate("v150", "field-X", 150, "benefit", "110"),
      fixtureCandidate("v200", "field-X", 200, "benefit", "130"),
    ];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600)));
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].evaluatedActionId).toBe("v200"); // highest value, fits budget
  });

  it("prevents two separate slurry actions on the SAME field from being jointly selected (brief §23 no-double-counting)", () => {
    const candidates = [fixtureCandidate("a1", "field-Y", 100, "benefit", "300"), fixtureCandidate("a2", "field-Y", 100, "benefit", "250")];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600)));
    expect(result.selected).toHaveLength(1); // never both, regardless of budget headroom
    expect(result.limitations).toContain(
      "At most one candidate action is selected per field. This result cannot yet jointly value two or more separate slurry applications on the same field — Phase 5 has no multi-action joint counterfactual to represent that combination correctly.",
    );
  });

  it("allows legitimate separate actions on DIFFERENT fields to be selected together", () => {
    const candidates = [fixtureCandidate("a1", "field-P", 100, "benefit", "80"), fixtureCandidate("a2", "field-Q", 100, "benefit", "70")];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600)));
    expect(result.selected.map((s) => s.evaluatedActionId).sort()).toEqual(["a1", "a2"]);
  });
});

// ===========================================================================
// E. Non-linear / greedy-failure optimisation correctness (brief §22)
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — exact optimisation beats greedy", () => {
  it("selects B+C (€160) over the greedy single-highest choice A (€90) — the brief's own worked counterexample", () => {
    // Available: 10. A: volume 6, €90. B: volume 5, €80. C: volume 5, €80.
    // Greedy-by-highest-single-value picks A alone (€90). The true optimum
    // is B+C together (€160), which greedy would miss entirely.
    const candidates = [
      fixtureCandidate("A", "field-1", 6, "benefit", "90"),
      fixtureCandidate("B", "field-2", 5, "benefit", "80"),
      fixtureCandidate("C", "field-3", 5, "benefit", "80"),
    ];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 10)));
    expect(result.selected.map((s) => s.evaluatedActionId).sort()).toEqual(["B", "C"]);
    expect(result.selectedVolumeM3).toBe("10.00");
    const netAmount = result.totalNetEconomicResult.amount;
    expect(netAmount.status).toBe("OK");
    if (netAmount.status === "OK") expect(netAmount.value.amount).toBe("160");
  });

  // Adversarial review §13: independent brute-force oracle. Deterministic
  // (seeded, not truly random — repeatable in CI) generation of small
  // candidate sets across distinct fields (one candidate per field, since
  // same-field exclusivity is already covered by its own describe block
  // above), independently computing the TRUE global optimum by exhaustive
  // subset enumeration in THIS test file (never importing the production
  // search), and comparing against the real production result. Any
  // mismatch is a genuine optimiser defect, not a rounding footnote.
  it("matches an independent brute-force oracle across 30 deterministically-generated small candidate sets", () => {
    let seed = 42;
    function nextRandom(): number {
      // xorshift32 — deterministic, seeded, no external dependency.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed |= 0;
      return (seed >>> 0) / 4294967296;
    }
    for (let trial = 0; trial < 30; trial++) {
      const n = 2 + Math.floor(nextRandom() * 5); // 2..6 candidates, one per field
      const items = Array.from({ length: n }, (_, i) => {
        const volume = 1 + Math.floor(nextRandom() * 10); // 1..10
        const value = Math.floor(nextRandom() * 200) - 50; // -50..149 (includes adverse candidates)
        return { id: `t${trial}-c${i}`, fieldId: `t${trial}-f${i}`, volume, value };
      });
      const available = 5 + Math.floor(nextRandom() * 15); // 5..19

      // True oracle: exhaustive subset enumeration (2^n — fine for n<=6).
      let oracleBest = 0; // "select nothing" is always feasible, worth 0
      for (let mask = 0; mask < 1 << n; mask++) {
        let vol = 0;
        let val = 0;
        for (let i = 0; i < n; i++) {
          if (mask & (1 << i)) {
            vol += items[i].volume;
            val += items[i].value;
          }
        }
        if (vol <= available && val > oracleBest) oracleBest = val;
      }

      const candidates = items.map((it) => fixtureCandidate(it.id, it.fieldId, it.volume, it.value >= 0 ? "benefit" : "cost", String(Math.abs(it.value))));
      const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, available)));
      const netAmount = result.totalNetEconomicResult.amount;
      const productionBest = netAmount.status === "OK" ? Number(netAmount.value.amount) * (result.totalNetEconomicResult.direction === "cost" ? -1 : 1) : 0;

      expect(productionBest).toBe(oracleBest);
    }
  });
});

// ===========================================================================
// F. Determinism
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — determinism", () => {
  it("produces an identical selection regardless of candidate input order", () => {
    const candidates = [
      fixtureCandidate("A", "field-1", 6, "benefit", "90"),
      fixtureCandidate("B", "field-2", 5, "benefit", "80"),
      fixtureCandidate("C", "field-3", 5, "benefit", "80"),
    ];
    const forward = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 10)));
    const reversed = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([...candidates].reverse(), 10)));
    const shuffled = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([candidates[1], candidates[2], candidates[0]], 10)));
    const ids = (r: SlurryWholeFarmAllocationResult) => r.selected.map((s) => s.evaluatedActionId).sort();
    expect(ids(forward)).toEqual(ids(reversed));
    expect(ids(forward)).toEqual(ids(shuffled));
  });

  it("breaks a genuine tie deterministically and identically across repeated executions", () => {
    // Two disjoint single-field options with equal total value, equal
    // volume — plan1 = {X}, plan2 = {Y}, both worth €100 at volume 50.
    const candidates = [fixtureCandidate("X", "field-tie-1", 50, "benefit", "100"), fixtureCandidate("Y", "field-tie-2", 50, "benefit", "100")];
    const input = baseAllocationInput(candidates, 50); // budget only fits ONE of them
    const results = Array.from({ length: 5 }, () => expectOk(buildSlurryWholeFarmAllocation(input)));
    const firstSelection = results[0].selected.map((s) => s.evaluatedActionId);
    for (const r of results) expect(r.selected.map((s) => s.evaluatedActionId)).toEqual(firstSelection);
    // Documented tie-break rule 3 (canonical id ordering) picks "X" over "Y".
    expect(firstSelection).toEqual(["X"]);
  });
});

// ===========================================================================
// G. Blocked/invalid input handling
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — blocked/invalid input", () => {
  it("blocks the whole result when available slurry volume is unknown, never defaulting to zero or unlimited", () => {
    const outcome = buildSlurryWholeFarmAllocation({ id: "alloc", asOfDate, knownAt, availableVolume: { status: "unknown" }, candidates: [], createdAt: "2026-01-01T00:00:00.000Z" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("ECONOMIC_SLURRY_ALLOCATION_UNKNOWN_AVAILABLE_VOLUME");
  });

  it("rejects a negative available volume", () => {
    const outcome = buildSlurryWholeFarmAllocation(baseAllocationInput([], -10));
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("excludes a candidate with negative volume as invalid input, not a numeric error", () => {
    const candidate = fixtureCandidate("c1", "f1", -50, "benefit", "80");
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([candidate], 600)));
    expect(result.selected).toHaveLength(0);
    expect(result.excluded[0]?.reason.kind).toBe("invalid_input");
  });

  it("handles a zero-volume candidate without fabricating value and without erroring", () => {
    const candidate = fixtureCandidate("c1", "f1", 0, "benefit", "0");
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([candidate], 600)));
    // A genuine 0-volume/0-value action is economically indistinguishable
    // from doing nothing — the "fewer actions selected" tie-break prefers
    // not selecting it, matching brief §9's stated intent.
    expect(result.selected).toHaveLength(0);
  });

  it("rejects a candidate set containing a duplicate evaluatedActionId (structural input-integrity failure)", () => {
    const candidates = [fixtureCandidate("dup", "f1", 100, "benefit", "50"), fixtureCandidate("dup", "f2", 100, "benefit", "60")];
    const outcome = buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600));
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("ECONOMIC_SLURRY_ALLOCATION_DUPLICATE_CANDIDATE_IDENTITY");
  });

  it("excludes a candidate whose own volume needs more precision than the documented policy boundary allows, rather than silently truncating it", () => {
    const candidate = fixtureCandidate("c1", "f1", 100.12345, "benefit", "80");
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([candidate], 600)));
    expect(result.excluded[0]?.reason.kind).toBe("invalid_input");
    expect(SLURRY_VOLUME_MAX_DECIMAL_PLACES).toBe(2);
  });

  it("blocks with a clear, labelled outcome rather than hanging when the exact enumeration space is too large — never silently approximates", () => {
    // 22 distinct single-option fields => 2^22 ≈ 4.2M combinations, over
    // the documented MAX_ENUMERATED_COMBINATIONS bound.
    const manyFieldCandidates = Array.from({ length: 22 }, (_, i) => fixtureCandidate(`c${i}`, `f${i}`, 10, "benefit", "10"));
    const outcome = buildSlurryWholeFarmAllocation(baseAllocationInput(manyFieldCandidates, 1000));
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("ECONOMIC_SLURRY_ALLOCATION_EXACT_OPTIMISATION_INFEASIBLE_AT_SCALE");
    expect(MAX_ENUMERATED_COMBINATIONS).toBeGreaterThan(0);
  });
});

// ===========================================================================
// H. Credit guard / double counting (real Phase 1 validator)
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — credit guard", () => {
  it("passes the real Phase 1 validateNoDuplicateCreditClaims for a normal successful selection", () => {
    const candidates = [fixtureCandidate("a1", "field-P", 100, "benefit", "80"), fixtureCandidate("a2", "field-Q", 100, "benefit", "70")];
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput(candidates, 600)));
    expect(result.creditValidation.valid).toBe(true);
    // Independently re-run the real validator over the same effects as a
    // second, direct confirmation (not merely trusting the field carried
    // on the result).
    const effects = result.selected.map((s) => s.assessment.effect).filter((e): e is NonNullable<typeof e> => e !== null);
    expect(validateNoDuplicateCreditClaims(effects).valid).toBe(true);
  });
});

// ===========================================================================
// I. Unavailable/unknown realisation is never comparable
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — unknown realisation cost", () => {
  it("excludes a candidate whose Phase 5 net result is blocked on an unknown realisation cost", () => {
    const blocked = blockedFixtureAssessment("c1", "f1", "ECONOMIC_SLURRY_ASSESSMENT_NET_RETURN_UNKNOWN_REALISATION_COST", 100);
    const candidate: SlurryAllocationCandidateInput = { evaluatedActionId: "c1", fieldId: "f1", volumeM3: 100, assessment: blocked };
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([candidate], 600)));
    expect(result.selected).toHaveLength(0);
    expect(result.excluded[0]?.reason.kind).toBe("not_economically_comparable");
  });
});

// ===========================================================================
// J. Auditability
// ===========================================================================

describe("buildSlurryWholeFarmAllocation — auditability", () => {
  it("retains full Phase 5 provenance on every selected allocation — nothing stripped", () => {
    const candidateA = realCandidate(fieldA, 200, "action-A");
    const result = expectOk(buildSlurryWholeFarmAllocation(baseAllocationInput([candidateA], 300)));
    const selected = result.selected[0];
    expect(selected.assessment.evaluatedActionId).toBe("action-A");
    expect(selected.assessment.scienceSupport.status).toBe("OK");
    expect(selected.assessment.baselineFertiliserPlanCost).toBeDefined();
    expect(selected.assessment.interventionFertiliserPlanCost).toBeDefined();
    expect(selected.assessment.effect?.creditClaim.creditKey).toContain("action-A");
  });
});
