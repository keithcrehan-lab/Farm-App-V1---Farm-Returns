import { afterEach, describe, expect, it, vi } from "vitest";
import type { Farm, Field, LivestockGroup, NutrientPlan, SlurryAllocation } from "@/domain/types";

/**
 * Regression coverage for the Codex re-verification MEDIUM (fixed after
 * `0fc5a25`, closed in this commit): `evaluateWhatMattersPilot`'s "no
 * ranked opportunities" branch must report the honest
 * `unknown`/`ECONOMIC_EVIDENCE_UNAVAILABLE` state only when a real
 * candidate's economics genuinely could not be resolved
 * (`record.quantified === false`, e.g. no persisted CSO price evidence) —
 * never merely because Phase 8's own `includeZeroOutcomes: false` /
 * `includeAdverseOutcomes: false` policy correctly excluded a fully
 * quantified, genuinely zero/adverse opportunity. Only the seven real I/O
 * boundaries (farm data + Supabase client + weather/forecast) are mocked;
 * every domain calculation (`calculateNutrientPlan`, Phase 5, Phase 7,
 * Phase 8) runs for real, matching `what-matters-pilot.e2e.test.ts`'s own
 * "real domain, mocked I/O" split. Weather/forecast are left unmocked on
 * purpose: both scenarios below produce an empty Phase 8 `ranked` set, so
 * `evaluateWhatMattersPilot`'s weather-fetching loop never runs.
 *
 * The "genuine zero" scenario also mocks `calculateNutrientPlan` (keeping
 * every other `@/domain/nutrients` export real, notably
 * `resolveFieldSlurryAllocation`) and `buildSlurryDirectEconomicAssessment`
 * (keeping its real implementation, only substituting the one input
 * `evaluateWhatMattersPilot` itself hardcodes to
 * `{status: "unknown"}` — see `what-matters-pilot.ts`'s own
 * `resolvedPricesByProduct`/`buildRealCandidates` — with `known_zero`, the
 * only way to reach a genuinely OK-quantified net result through the real
 * domain function, since an unknown realisation cost always blocks the
 * net result regardless of direct-cost direction, empirically confirmed).
 * A real, no-op-cost slurry allocation (0 m3) is reported as genuinely
 * UNQUANTIFIED by the real domain
 * (`ECONOMIC_SLURRY_ASSESSMENT_NET_RETURN_UNQUANTIFIED_GROSS` — a real "no
 * evaluated action actually happened" case, not this fix's target
 * scenario, also empirically confirmed), so a real evaluated-action volume
 * with byte-identical purchased-product costs between baseline and
 * intervention is the only way to reach a genuine, fully-priced zero
 * direct-cost difference. Both plans below are real `calculateNutrientPlan`
 * output for this exact field (captured once, then hand-aligned so
 * intervention's cost matches baseline's) — this is not invented
 * economics, it mirrors `opportunity-ranking.test.ts`'s own established
 * `fixtureAssessment` pattern for reaching hard-to-hit real domain states.
 */

vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry", () => ({ listSlurryAllocationsForFarm: vi.fn(), listSlurryAllocationRecordsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/housing", () => ({ listHousingForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry-composition", () => ({ listSlurryCompositionRecordsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry-contractor-cost", () => ({ getLatestContractorCostRateForFarm: vi.fn(), createContractorCostRateRecord: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/server/market/cso-fertiliser-repository", () => ({ findObservationsByMappedProduct: vi.fn() }));
vi.mock("@/domain/nutrients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/nutrients")>();
  return { ...actual, calculateNutrientPlan: vi.fn(actual.calculateNutrientPlan) };
});
vi.mock("@/domain/slurry-direct-economic-assessment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/slurry-direct-economic-assessment")>();
  return { ...actual, buildSlurryDirectEconomicAssessment: vi.fn(actual.buildSlurryDirectEconomicAssessment) };
});

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listSlurryAllocationsForFarm, listSlurryAllocationRecordsForFarm } from "@/lib/farm-data/slurry";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { listSlurryCompositionRecordsForFarm } from "@/lib/farm-data/slurry-composition";
import type { SlurryComposition } from "@/domain/slurry-composition";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { getLatestContractorCostRateForFarm, createContractorCostRateRecord } from "@/lib/farm-data/slurry-contractor-cost";
import { findObservationsByMappedProduct } from "@/server/market/cso-fertiliser-repository";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { buildSlurryDirectEconomicAssessment } from "@/domain/slurry-direct-economic-assessment";
import { createMarketPriceObservation, canonicalContentHashInput, type CreateMarketPriceObservationInput } from "@/domain/market-evidence";
import { createHash } from "node:crypto";
import { evaluateWhatMattersPilot, saveFarmerContractorCostRate } from "./what-matters-pilot";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const { buildSlurryDirectEconomicAssessment: realBuildSlurryDirectEconomicAssessment } = await vi.importActual<typeof import("@/domain/slurry-direct-economic-assessment")>("@/domain/slurry-direct-economic-assessment");

const farm: Farm = {
  id: "farm-test",
  name: "Test Farm",
  location: { county: "Cork", centroid: [-8.785556, 53.289167] },
  primaryEnterprises: ["dairy"],
  units: "metric",
  ownerName: "Keith",
};

const livestockGroups: LivestockGroup[] = [];

function field(id: string): Field {
  return {
    id,
    farmId: farm.id,
    name: `Field ${id}`,
    areaHa: 10,
    centroid: [-8.785556, 53.289167],
    plannedUse: { value: "grazing", status: "farmer_adjusted", source: "Keith" },
    fertility: { pIndex: { value: 2, status: "farmer_adjusted", source: "Keith" }, kIndex: { value: 2, status: "farmer_adjusted", source: "Keith" } },
    history: [],
  };
}

function allocation(fieldId: string, volumeM3: number): SlurryAllocation {
  return {
    fieldId,
    housingId: "h1",
    priority: "high",
    volumeM3,
    score: 90,
    applicationMethod: { value: "splashplate", status: "farmer_adjusted", source: "Keith" },
    applicationDate: { value: "2026-02-15", status: "farmer_adjusted", source: "Keith" },
  };
}

function priceObservation(overrides: Partial<CreateMarketPriceObservationInput>) {
  const fields = {
    datasetId: "AJM09", sourceSeriesCode: "012", sourceSeriesLabel: "Compound 18-6-12", mappedProduct: "18-6-12", mappingKind: "EXACT_PRODUCT_MATCH" as const,
    priceAmount: "645", referencePeriod: "2026-07", priceBasis: "per_tonne" as const, vatTreatment: "unknown" as const, deliveryBasis: "unknown" as const,
    sourceId: "CSO_AG_PRICES" as const, geography: "Ireland", sourceUpdatedAt: "2026-09-15T11:00:00.000Z", retrievedAt: "2026-09-20T12:00:00.000Z",
    ingestionBatchId: "11111111-1111-1111-1111-111111111111", sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en", ...overrides,
  };
  return createMarketPriceObservation({ ...fields, contentHash: hash(canonicalContentHashInput(fields)) });
}

const zeroSevenThirty = priceObservation({ sourceSeriesCode: "008", priceAmount: "412", mappedProduct: "0-7-30", sourceSeriesLabel: "Compound 0-7-30" });
const eighteenSixTwelve = priceObservation({});
const protectedUrea = priceObservation({ sourceSeriesCode: "002", priceAmount: "550", mappingKind: "CATEGORY_BENCHMARK", mappedProduct: "Protected Urea", sourceSeriesLabel: "Urea (46% N)" });

function mockRealPrices() {
  vi.mocked(findObservationsByMappedProduct).mockImplementation(async (_client, mappedProduct: string) => {
    const observation = { "0-7-30": zeroSevenThirty, "18-6-12": eighteenSixTwelve, "Protected Urea": protectedUrea }[mappedProduct];
    return observation ? [{ observation, databaseId: "db-1" }] : [];
  });
}

function mockNoPrices() {
  vi.mocked(findObservationsByMappedProduct).mockResolvedValue([]);
}

// Real `calculateNutrientPlan` output for field "f1" (10 ha, P/K index 2,
// no livestock), captured directly from the real engine for a 0 m3 (no-op)
// and a 200 m3 splashplate-spring allocation, then hand-aligned so both
// plans' `purchasedProducts` total to the same real cost (1026 EUR, the
// real 200 m3 intervention's own real cost) — a genuine zero direct-cost
// difference with a real, nonzero evaluated action volume (200 m3), never
// a no-op zero.
const requirement = { value: { n: 35, p: 14, k: 28 }, status: "estimated" as const, source: "Teagasc Green Book (5th Ed., 2020)", calculationVersion: "nutrient_engine_v1.0.0" };
const realIntervention200m3PurchasedProducts = [
  { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 157.6, totalKg: 1575.8, costEur: 1026, formulation: { value: { physicalForm: "solid" as const, ureicNPercent: 0, inhibitorStatus: "inhibited" as const }, status: "verified" as const, source: "Product catalogue — known formulation", calculationVersion: "fertiliser_admissibility_gate_v1.0.0" } },
];
function zeroDeltaBaselinePlan(): NutrientPlan {
  return {
    fieldId: "f1", fertilityEvidence: { status: "OK", value: { pIndex: 2, kIndex: 2 }, evidenceState: "IRISH_DEFAULT" },
    fertilityEvidenceByNutrient: {
      p: { status: "OK", value: { index: 2 }, evidenceState: "IRISH_DEFAULT" },
      k: { status: "OK", value: { index: 2 }, evidenceState: "IRISH_DEFAULT" },
    },
    requirement,
    requirementByNutrient: { n: { status: "OK", value: 35, evidenceState: "IRISH_DEFAULT" }, p: { status: "OK", value: 14, evidenceState: "IRISH_DEFAULT" }, k: { status: "OK", value: 28, evidenceState: "IRISH_DEFAULT" } },
    organicApplication: { rateM3ha: 0, totalM3: 0, offsetN: 0, offsetP: 0, offsetK: 0, dmPct: 6.3, dmPctEvidence: { status: "estimated", source: "Teagasc Green Book Table 9-1 (national average cattle slurry dry matter %)" }, availableNutrientAssessment: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" }, availableNutrientByNutrient: { n: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" }, p: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" }, k: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" } } },
    requirementProvisional: { isProvisional: false },
    netRequirement: requirement,
    netRequirementByNutrient: { n: { status: "OK", value: 35, evidenceState: "IRISH_DEFAULT" }, p: { status: "OK", value: 14, evidenceState: "IRISH_DEFAULT" }, k: { status: "OK", value: 28, evidenceState: "IRISH_DEFAULT" } },
    purchasedProducts: realIntervention200m3PurchasedProducts,
    deliveredKgHa: { n: 28.368, p: 9.456, k: 18.912 },
    napCompliance: { status: "OK", value: { landUse: "grazing", orgNStockingRateKgHa: 0, nRequiredKgHa: 28.368, nCeilingKgHa: 90, nWithinCeiling: true, pRequiredKgHa: 9.456, pCeilingKgHa: 17, pWithinCeiling: true, regulatory: "compliance_value", legislation: "S.I. No. 588/2025, Tables 13 & 15a", saleEvidenceRequired: false, saleEvidenceConfirmed: false, highRateEligibilityApplicable: false, highRateEligibilityConfirmed: true, pBuildUpEligibilityApplicable: false, pBuildUpEligibilityConfirmed: false }, evidenceState: "DERIVED" },
    statutoryManureValue: { status: "NOT_APPLICABLE", reasonCode: "NO_MANURE_APPLICATION_TO_VALUE" },
    commonageFertiliserGate: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "UNKNOWN_COMMONAGE_STATUS", missingInputs: ["FIELD_COMMONAGE_STATUS"] },
    lessMethodCompliance: { status: "NOT_APPLICABLE", reasonCode: "LESS_GATE_NOT_APPLICABLE" },
    localBufferOverrideStatus: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_LOCAL_BUFFER_ASSESSMENT", missingInputs: ["LOCAL_WATER_BUFFER_OVERRIDE"] },
    nationalBufferDistanceStatus: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_NATIONAL_BUFFER_ASSESSMENT", missingInputs: ["waterBufferContext.featureType", "waterBufferContext.distanceM"] },
    soilTestAgeValidity: { status: "NOT_APPLICABLE", reasonCode: "NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE" },
    estimatedFieldCostEur: 1026, calculationVersion: "nutrient_engine_v1.0.0",
  };
}
function zeroDeltaInterventionPlan(): NutrientPlan {
  return {
    ...zeroDeltaBaselinePlan(),
    organicApplication: { rateM3ha: 20, totalM3: 200, offsetN: 14, offsetP: 5, offsetK: 52, dmPct: 6.3, dmPctEvidence: { status: "estimated", source: "Teagasc Green Book Table 9-1 (national average cattle slurry dry matter %)" }, availableNutrientAssessment: { status: "OK", value: { n: 13.727272727272727, p: 4.545454545454545, k: 52.36363636363637, unit: "kg/ha", applicationMethod: "splashplate", assumedDefault: false, applicationRateM3ha: 20, dmPct: 6.3, applicationDate: "2026-02-15", timingCategory: "SPRING", timingAssumed: false, ruleId: "SLURRY_TABLE_9_8", source: "Teagasc Green Book Table 9-8 (spring application, splashplate)", soilIndexAdjustmentApplied: { p: true, k: true }, scientificBasisNote: "captured from real engine output" }, evidenceState: "MEASURED" }, availableNutrientByNutrient: { n: { status: "OK", value: { kgHa: 13.727272727272727 }, evidenceState: "MEASURED" }, p: { status: "OK", value: { kgHa: 4.545454545454545, soilIndexAdjustmentApplied: true }, evidenceState: "MEASURED" }, k: { status: "OK", value: { kgHa: 52.36363636363637, soilIndexAdjustmentApplied: true }, evidenceState: "MEASURED" } } },
    statutoryManureValue: { status: "OK", value: { manureType: "cattle_slurry", basis: "per_m3", quantity: 200, totalNKg: 480, totalPKg: 100, availableNKg: 192, availablePKg: 50, nAvailabilityPct: 40, pAvailabilityPct: 50, pIndex: 2, availableNKgHa: 19.2, availablePKgHa: 5 }, evidenceState: "DERIVED" },
  };
}

function mockFarmData(fields: Field[], slurryAllocations: SlurryAllocation[], compositionRecords: SlurryComposition[] = []) {
  vi.mocked(getFarmForCurrentUser).mockResolvedValue(farm);
  vi.mocked(listFieldsForFarm).mockResolvedValue(fields);
  vi.mocked(listSlurryAllocationsForFarm).mockResolvedValue(slurryAllocations);
  // The same planned allocations as lifecycle records (Phase 1A).
  vi.mocked(listSlurryAllocationRecordsForFarm).mockResolvedValue(
    slurryAllocations.map((a, i) => ({ ...a, id: `sa-${i}`, farmId: farm.id, status: "planned" as const, createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z" })),
  );
  vi.mocked(listHousingForFarm).mockResolvedValue([]);
  vi.mocked(listSlurryCompositionRecordsForFarm).mockResolvedValue(compositionRecords);
  vi.mocked(listLivestockGroupsForFarm).mockResolvedValue(livestockGroups);
  // Default: no contractor rate persisted yet -- individual tests override
  // via `mockPersistedContractorRate` below.
  vi.mocked(getLatestContractorCostRateForFarm).mockResolvedValue(null);
}

function mockPersistedContractorRate(ratePerHa: string, declaredAt = "2026-09-25T08:00:00.000Z") {
  vi.mocked(getLatestContractorCostRateForFarm).mockResolvedValue({ ratePerHa, declaredAt });
}

afterEach(() => {
  vi.clearAllMocks();
});

// The public API never accepts a contractor rate as a parameter at all --
// `evaluateWhatMattersPilot` always reads the farm's one persisted rate
// from `slurry_contractor_cost_declarations`
// (`getLatestContractorCostRateForFarm`, mocked above), and
// `buildRealCandidates` constructs the one real, correctly-bound
// `FarmerContractorCostDeclaration` server-side from that persisted
// record, using `listRealSlurryActionTargets`'s own id templates for
// field "f1" (Codex audit CRITICAL fix: a caller can no longer submit a
// pre-built declaration object with an arbitrary rate/currency/timestamp/
// provenance, or one bound to the wrong field/assessment -- that
// binding-validation coverage now lives in `slurry-realisation-cost.test.ts`,
// at the domain layer where it is still structurally reachable).

describe("evaluateWhatMattersPilot — realisation cost from a real farmer-entered contractor rate (SLURRY_REALISATION_COST no longer an automatic system benchmark)", () => {
  it("stays honestly UNKNOWN (never a fabricated €120, never a system default) when no farmer rate has been declared at all", async () => {
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockRealPrices();

    await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(buildSlurryDirectEconomicAssessment).toHaveBeenCalled();
    const passedInput = vi.mocked(buildSlurryDirectEconomicAssessment).mock.calls[0][0];
    expect(passedInput.realisationCost).toEqual({ status: "unknown" });
  });

  it("resolves a real farmer-entered rate x the field's real area into a quantified realisation cost via the real Phase 5 boundary", async () => {
    // field("f1") has areaHa: 10 -> 10 x farmer-entered EUR120/ha = EUR1200, exact.
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockRealPrices();
    mockPersistedContractorRate("120");

    await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    const passedInput = vi.mocked(buildSlurryDirectEconomicAssessment).mock.calls[0][0];
    expect(passedInput.realisationCost).toEqual({ status: "quantified", amount: { amount: "1200", currency: "EUR" } });
  });

  it("an invalid persisted rate is never accepted as a declaration — stays UNKNOWN, never coerced to a positive default (defence in depth: `saveFarmerContractorCostRate` itself rejects this before it can ever be persisted)", async () => {
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockRealPrices();
    mockPersistedContractorRate("0");

    await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    const passedInput = vi.mocked(buildSlurryDirectEconomicAssessment).mock.calls[0][0];
    expect(passedInput.realisationCost).toEqual({ status: "unknown" });
  });

  it("stays honestly UNKNOWN when the field's own area is invalid, even with a valid farmer rate declared", async () => {
    const invalidAreaField: Field = { ...field("f1"), areaHa: 0 };
    mockFarmData([invalidAreaField], [allocation("f1", 200)]);
    mockRealPrices();
    mockPersistedContractorRate("120");

    await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    const passedInput = vi.mocked(buildSlurryDirectEconomicAssessment).mock.calls[0][0];
    expect(passedInput.realisationCost).toEqual({ status: "unknown" });
  });

  it("a real candidate no longer fails solely because realisation cost is missing, once a real farmer rate is declared (net result is quantified, not blocked by unknown realisation cost)", async () => {
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockRealPrices();
    mockPersistedContractorRate("120");

    await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    const realAssessment = vi.mocked(buildSlurryDirectEconomicAssessment).mock.results[0]?.value;
    expect(realAssessment).toBeDefined();
    // The real net-return calculation must not be blocked by
    // ECONOMIC_SLURRY_ASSESSMENT_NET_RETURN_UNKNOWN_REALISATION_COST any
    // more -- whatever it resolves to now depends on real gross economics,
    // never the realisation-cost gap this test targets.
    if (realAssessment.netEconomicResult.amount.status !== "OK") {
      expect(realAssessment.netEconomicResult.amount.reasonCode).not.toBe("ECONOMIC_SLURRY_ASSESSMENT_NET_RETURN_UNKNOWN_REALISATION_COST");
    }
  });

  it("the result's own contractorRatePerHa echoes back exactly the farm's persisted rate, so the caller (React state) can display/pre-fill it", async () => {
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockRealPrices();
    mockPersistedContractorRate("120");

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.contractorRatePerHa).toBe("120");
  });
});

describe("saveFarmerContractorCostRate — up-front validation and persistence (Codex audit MEDIUM + HIGH, fixed)", () => {
  it("rejects an invalid rate (zero) with a structured error BEFORE ever writing to storage — never a silent 'ok' with the invalid value discarded", async () => {
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockRealPrices();

    const outcome = await saveFarmerContractorCostRate({ evaluatedAt: "2026-09-25T09:00:00.000Z", priorDeclarations: [], ratePerHa: "0" });

    expect(outcome.status).toBe("error");
    expect(createContractorCostRateRecord).not.toHaveBeenCalled();
  });

  it("rejects a negative rate the same way", async () => {
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockRealPrices();

    const outcome = await saveFarmerContractorCostRate({ evaluatedAt: "2026-09-25T09:00:00.000Z", priorDeclarations: [], ratePerHa: "-50" });

    expect(outcome.status).toBe("error");
    expect(createContractorCostRateRecord).not.toHaveBeenCalled();
  });

  it("persists a valid rate for the real farm before re-evaluating", async () => {
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockRealPrices();
    vi.mocked(createContractorCostRateRecord).mockResolvedValue({ ratePerHa: "120", declaredAt: "2026-09-25T09:00:00.000Z" });
    mockPersistedContractorRate("120", "2026-09-25T09:00:00.000Z");

    const outcome = await saveFarmerContractorCostRate({ evaluatedAt: "2026-09-25T09:00:00.000Z", priorDeclarations: [], ratePerHa: "120" });

    expect(createContractorCostRateRecord).toHaveBeenCalledWith(farm.id, "120");
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.contractorRatePerHa).toBe("120");
  });
});

describe("evaluateWhatMattersPilot — no-ranked-opportunities branch (Codex re-verification MEDIUM)", () => {
  it("reports ECONOMIC_EVIDENCE_UNAVAILABLE when a real candidate's economics genuinely could not be resolved (no persisted price evidence)", async () => {
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockNoPrices();

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.result).toEqual({ kind: "unknown", candidate: null, reasonCode: "ECONOMIC_EVIDENCE_UNAVAILABLE" });
  });

  it("reports unsupported slurry science — never missing price/cost — for a real incorporate_24h allocation with real prices and a real contractor rate (Codex audit MEDIUM)", async () => {
    const incorporate: SlurryAllocation = { ...allocation("f1", 200), applicationMethod: { value: "incorporate_24h", status: "farmer_adjusted", source: "Keith" } };
    mockFarmData([field("f1")], [incorporate]);
    mockRealPrices();
    mockPersistedContractorRate("120");

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    const assessment = vi.mocked(buildSlurryDirectEconomicAssessment).mock.results[0]?.value;
    expect(assessment.scienceSupport.status).not.toBe("OK");
    expect(assessment.realisationCost.status).toBe("quantified");
    expect(outcome.result).toEqual({ kind: "unknown", candidate: null, reasonCode: "UNSUPPORTED_SCIENTIFIC_EVIDENCE" });
    expect(outcome.noRankedExplanation?.code).toBe("UNSUPPORTED_SCIENTIFIC_EVIDENCE");
    expect(outcome.noRankedExplanation?.candidates).toHaveLength(1);
  });

  it("does NOT report ECONOMIC_EVIDENCE_UNAVAILABLE for a fully quantified candidate that Phase 8 legitimately excluded as a genuine zero/adverse outcome", async () => {
    // Real evaluated-action volume (200 m3), real resolved prices, but a
    // genuine zero direct-cost difference (see fixtures above) -- a fully
    // quantified, genuinely zero net economic result, not a
    // missing-evidence one.
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    mockRealPrices();
    vi.mocked(calculateNutrientPlan).mockReturnValueOnce(zeroDeltaBaselinePlan()).mockReturnValueOnce(zeroDeltaInterventionPlan());
    vi.mocked(buildSlurryDirectEconomicAssessment).mockImplementationOnce((input) => realBuildSlurryDirectEconomicAssessment({ ...input, realisationCost: { status: "known_zero" } }));

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    // Must fall through to Phase 9's own real "none" result -- never the
    // "unknown" shape, since real, complete economic evidence existed.
    expect(outcome.result.kind).toBe("none");
  });
});

describe("evaluateWhatMattersPilot — zero candidates because planning data is missing (Codex audit MEDIUM, real Dev failure path)", () => {
  const withoutMethod = (): SlurryAllocation => ({ ...allocation("f1", 200), applicationMethod: undefined });
  const withoutDate = (): SlurryAllocation => ({ ...allocation("f1", 200), applicationDate: undefined });
  const withoutBoth = (): SlurryAllocation => ({ ...allocation("f1", 200), applicationMethod: undefined, applicationDate: undefined });

  it.each([
    ["missing application method", withoutMethod, ["method"]],
    ["missing application date", withoutDate, ["date"]],
    ["missing both method and date", withoutBoth, ["method", "date"]],
  ])("reports NO_CANDIDATE_DATA with an empty candidate trace for an allocation %s", async (_label, build, expectedMissing) => {
    mockFarmData([field("f1")], [build()]);
    mockRealPrices();
    mockPersistedContractorRate("120");

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(buildSlurryDirectEconomicAssessment).not.toHaveBeenCalled();
    expect(outcome.result).toEqual({ kind: "none", reasonCode: "NO_CANDIDATE_DATA" });
    expect(outcome.noRankedExplanation).toEqual(expect.objectContaining({ code: "NO_CANDIDATE_DATA", candidates: [] }));
    expect(outcome.candidateContext).toEqual({});
    // Only the details this allocation actually lacks, for the real field.
    expect(outcome.missingSlurryDetails).toEqual([{ fieldId: "f1", missing: expectedMissing }]);
  });

  it("reports no missing slurry details when the farm has no slurry allocation at all", async () => {
    mockFarmData([field("f1")], []);
    mockRealPrices();

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.result).toEqual({ kind: "none", reasonCode: "NO_CANDIDATE_DATA" });
    expect(outcome.missingSlurryDetails).toEqual([]);
  });

  it("once the missing details are saved, the next evaluation runs the real audited pipeline instead of the missing-details state", async () => {
    mockFarmData([field("f1")], [withoutBoth()]);
    mockRealPrices();
    const before = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });
    expect(before.status === "ok" && before.missingSlurryDetails).toEqual([{ fieldId: "f1", missing: ["method", "date"] }]);

    // The canonical allocation now carries the farmer's saved method + date.
    mockFarmData([field("f1")], [allocation("f1", 200)]);
    const after = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(after.status).toBe("ok");
    if (after.status !== "ok") return;
    expect(buildSlurryDirectEconomicAssessment).toHaveBeenCalledTimes(1);
    expect(after.missingSlurryDetails).toBeUndefined();
    expect(after.result).not.toEqual({ kind: "none", reasonCode: "NO_CANDIDATE_DATA" });
    // No contractor rate on record -> the real pipeline decides, and it is
    // never forced to an actionable recommendation.
    expect(after.result.kind).not.toBe("actionable");
  });
});

describe("evaluateWhatMattersPilot — slurry planning entry for zero-allocation farms", () => {
  /** Shape `createSlurryAllocation` persists: the farmer's own store/field/
   * volume/method/date, and no invented `priority`/`score`. */
  function farmerPlannedAllocation(fieldId: string): SlurryAllocation {
    return {
      fieldId,
      housingId: "h1",
      volumeM3: 100,
      applicationMethod: { value: "splashplate", status: "farmer_adjusted", source: "Keith", sourceDate: "2026-09-25" },
      applicationDate: { value: "2026-09-26", status: "farmer_adjusted", source: "Keith", sourceDate: "2026-09-25" },
    };
  }

  it("reports zero planned slurry fields when the farm has no persisted allocation", async () => {
    mockFarmData([field("f1"), field("f2")], []);
    mockRealPrices();

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(outcome.status === "ok" && outcome.result).toEqual({ kind: "none", reasonCode: "NO_CANDIDATE_DATA" });
    expect(outcome.status === "ok" && outcome.plannedSlurryFieldCount).toBe(0);
  });

  it("does not report zero planned fields when an incomplete allocation exists (the Add spreading details path applies instead)", async () => {
    mockFarmData([field("f1")], [{ ...allocation("f1", 200), applicationDate: undefined }]);
    mockRealPrices();

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(outcome.status === "ok" && outcome.plannedSlurryFieldCount).toBe(1);
    expect(outcome.status === "ok" && outcome.missingSlurryDetails).toEqual([{ fieldId: "f1", missing: ["date"] }]);
  });

  it("a newly persisted farmer-planned allocation (no priority/score) is a real candidate for the audited pipeline", async () => {
    mockFarmData([field("f1")], [farmerPlannedAllocation("f1")]);
    mockRealPrices();

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(buildSlurryDirectEconomicAssessment).toHaveBeenCalledTimes(1);
    expect(vi.mocked(buildSlurryDirectEconomicAssessment).mock.calls[0][0].fieldId).toBe("f1");
    expect(outcome.result).not.toEqual({ kind: "none", reasonCode: "NO_CANDIDATE_DATA" });
    expect(outcome.plannedSlurryFieldCount).toBeUndefined();
    // The pipeline decides the next state; nothing forces a recommendation.
    expect(outcome.result.kind).not.toBe("actionable");
  });
});

describe("evaluateWhatMattersPilot — Campaign A evidence wiring", () => {
  it("A/Q: an archived field is never a candidate and never counts toward farm grassland area", async () => {
    const archived = { ...field("f2"), areaHa: 40, archivedAt: "2026-01-01T00:00:00Z" };
    mockFarmData([field("f1"), archived], [allocation("f1", 200), allocation("f2", 200)]);
    mockNoPrices();

    const outcome = await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    const calls = vi.mocked(calculateNutrientPlan).mock.calls.map((c) => c[0]);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((input) => input.field.id === "f1")).toBe(true);
    expect(calls.every((input) => input.farmGrasslandAreaHa === 10)).toBe(true);
    if (outcome.status !== "ok") throw new Error("expected ok");
    expect(Object.values(outcome.candidateContext).map((c) => c.fieldId)).toEqual(["f1"]);
  });

  it("J/L: the store's recorded DM reaches calculateNutrientPlan instead of the national-average default", async () => {
    const recorded: SlurryComposition = {
      id: "comp-1", farmId: farm.id, housingId: "h1", slurryType: "cattle_slurry", status: "verified", dmPct: 4,
      sampleDate: "2026-02-10", source: "Laboratory report", laboratory: "Teagasc Johnstown", recordedAt: "2026-02-11T09:00:00Z",
    };
    mockFarmData([field("f1")], [allocation("f1", 200)], [recorded]);
    mockNoPrices();

    await evaluateWhatMattersPilot({ evaluatedAt: "2026-09-25T09:00:00.000Z" });

    const intervention = vi.mocked(calculateNutrientPlan).mock.calls.map((c) => c[0]).find((input) => input.slurryAllocation !== undefined);
    expect(intervention?.slurryComposition?.id).toBe("comp-1");
    const plan = vi.mocked(calculateNutrientPlan).mock.results.find((r, i) => vi.mocked(calculateNutrientPlan).mock.calls[i][0].slurryAllocation !== undefined)?.value as NutrientPlan;
    expect(plan.organicApplication.dmPct).toBe(4);
    expect(plan.organicApplication.dmPctEvidence).toMatchObject({ status: "verified", compositionRecordId: "comp-1" });
  });
});
