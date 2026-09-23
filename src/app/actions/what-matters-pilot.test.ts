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
vi.mock("@/lib/farm-data/slurry", () => ({ listSlurryAllocationsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
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
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { findObservationsByMappedProduct } from "@/server/market/cso-fertiliser-repository";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { buildSlurryDirectEconomicAssessment } from "@/domain/slurry-direct-economic-assessment";
import { createMarketPriceObservation, canonicalContentHashInput, type CreateMarketPriceObservationInput } from "@/domain/market-evidence";
import { createHash } from "node:crypto";
import { evaluateWhatMattersPilot } from "./what-matters-pilot";

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
    fieldId: "f1", fertilityEvidence: { status: "OK", value: { pIndex: 2, kIndex: 2 }, evidenceState: "IRISH_DEFAULT" }, requirement,
    organicApplication: { rateM3ha: 0, totalM3: 0, offsetN: 0, offsetP: 0, offsetK: 0, dmPct: 6.3, dmPctEvidence: { status: "estimated", source: "Teagasc Green Book Table 9-1 (national average cattle slurry dry matter %)" }, availableNutrientAssessment: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" } },
    requirementProvisional: { isProvisional: false },
    netRequirement: requirement,
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
    organicApplication: { rateM3ha: 20, totalM3: 200, offsetN: 14, offsetP: 5, offsetK: 52, dmPct: 6.3, dmPctEvidence: { status: "estimated", source: "Teagasc Green Book Table 9-1 (national average cattle slurry dry matter %)" }, availableNutrientAssessment: { status: "OK", value: { n: 13.727272727272727, p: 4.545454545454545, k: 52.36363636363637, unit: "kg/ha", applicationMethod: "splashplate", assumedDefault: false, applicationRateM3ha: 20, dmPct: 6.3, applicationDate: "2026-02-15", timingCategory: "SPRING", timingAssumed: false, ruleId: "SLURRY_TABLE_9_8", source: "Teagasc Green Book Table 9-8 (spring application, splashplate)", soilIndexAdjustmentApplied: { p: true, k: true }, scientificBasisNote: "captured from real engine output" }, evidenceState: "MEASURED" } },
    statutoryManureValue: { status: "OK", value: { manureType: "cattle_slurry", basis: "per_m3", quantity: 200, totalNKg: 480, totalPKg: 100, availableNKg: 192, availablePKg: 50, nAvailabilityPct: 40, pAvailabilityPct: 50, pIndex: 2, availableNKgHa: 19.2, availablePKgHa: 5 }, evidenceState: "DERIVED" },
  };
}

function mockFarmData(fields: Field[], slurryAllocations: SlurryAllocation[]) {
  vi.mocked(getFarmForCurrentUser).mockResolvedValue(farm);
  vi.mocked(listFieldsForFarm).mockResolvedValue(fields);
  vi.mocked(listSlurryAllocationsForFarm).mockResolvedValue(slurryAllocations);
  vi.mocked(listLivestockGroupsForFarm).mockResolvedValue(livestockGroups);
}

afterEach(() => {
  vi.clearAllMocks();
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
