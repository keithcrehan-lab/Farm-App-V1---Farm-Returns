import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry", () => ({ listSlurryAllocationsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/housing", () => ({ listHousingForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/fertiliser-stock", () => ({ listFertiliserStockRecordsForFarm: vi.fn(), createFertiliserStockRecord: vi.fn() }));
vi.mock("./fertiliser-plan", () => ({ getFarmFertiliserDemandAction: vi.fn(), getFarmLimeRequirementAction: vi.fn(), getFieldFertiliserStatusAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { listFertiliserStockRecordsForFarm, createFertiliserStockRecord } from "@/lib/farm-data/fertiliser-stock";
import { getFarmFertiliserDemandAction, getFarmLimeRequirementAction, getFieldFertiliserStatusAction } from "./fertiliser-plan";
import { getFertiliserPlanOverviewAction, addFertiliserStockRecordAction } from "./fertiliser-plan-overview";
import type { Farm, Field } from "@/domain/types";
import type { FertiliserStockRecord } from "@/domain/fertiliser-stock";
import { aggregateFarmFertiliserPurchasing, buildFarmFertiliserQuoteBasket } from "@/domain/fertiliser-plan";
const EMPTY_AGGREGATION = aggregateFarmFertiliserPurchasing([]);

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockListSlurryAllocations = vi.mocked(listSlurryAllocationsForFarm);
const mockListHousing = vi.mocked(listHousingForFarm);
const mockListStockRecords = vi.mocked(listFertiliserStockRecordsForFarm);
const mockCreateStockRecord = vi.mocked(createFertiliserStockRecord);
const mockGetDemand = vi.mocked(getFarmFertiliserDemandAction);
const mockGetLime = vi.mocked(getFarmLimeRequirementAction);
const mockGetFieldStatus = vi.mocked(getFieldFertiliserStatusAction);

afterEach(() => {
  vi.clearAllMocks();
});

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Keith",
};

function field(overrides: Partial<Field> = {}): Field {
  return { id: "f1", farmId: "farm-1", name: "Field 1", areaHa: 5, centroid: [0, 0], fertility: {}, ...overrides } as Field;
}

function demandResult(overrides: Partial<Awaited<ReturnType<typeof getFarmFertiliserDemandAction>>> = {}) {
  return {
    demand: [],
    purchaseRequirementTonnes: [],
    truncated: false,
    applicationsWithUnknownComposition: 0,
    fieldsWithBlockedEvidence: 0,
    aggregation: EMPTY_AGGREGATION,
    basket: buildFarmFertiliserQuoteBasket(EMPTY_AGGREGATION, { farmId: "farm-1", createdAt: "2026-10-03T00:00:00.000Z" }),
    ...overrides,
  };
}

function limeResult(overrides: Partial<Awaited<ReturnType<typeof getFarmLimeRequirementAction>>> = {}) {
  return { fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 0, ...overrides };
}

function p3Ok(requirementKgHa: { n: number; p: number; k: number }): Awaited<ReturnType<typeof getFieldFertiliserStatusAction>> {
  return {
    status: "ok",
    engineVersion: "grass_fertiliser_engine_v2.0.0",
    cropSystem: "GRASS_FIRST_CUT_SILAGE",
    requirementKgHa,
    organicCreditsKgHa: { n: 0, p: 0, k: 0 },
    confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
    remainingKgHa: requirementKgHa,
    recommendedProducts: [],
    ruleTraces: {},
    limitations: [],
    confirmedApplications: 0,
    applicationsWithUnknownComposition: 0,
    applicationsExcludedMultiField: 0,
    truncated: false,
  };
}

function setUpBaseMocks() {
  mockGetFarm.mockResolvedValue(FARM);
  mockListSlurryAllocations.mockResolvedValue([]);
  mockListHousing.mockResolvedValue([]);
  mockListStockRecords.mockResolvedValue([]);
  mockGetDemand.mockResolvedValue(demandResult());
  mockGetLime.mockResolvedValue(limeResult());
  mockGetFieldStatus.mockResolvedValue({ status: "blocked", reasonCode: "P3_INCOMPLETE_EVIDENCE" });
}

describe("getFertiliserPlanOverviewAction", () => {
  it("P4 reads each active field through the P3 field-status contract", async () => {
    setUpBaseMocks();
    mockListFields.mockResolvedValue([field({ id: "a" }), field({ id: "b" })]);
    mockGetFieldStatus.mockImplementation(async (fieldId) =>
      fieldId === "a" ? p3Ok({ n: 10, p: 1, k: 2 }) : { status: "blocked", reasonCode: "MISSING_FIELD_PRODUCTION_CYCLE" },
    );

    const overview = await getFertiliserPlanOverviewAction();

    expect(mockGetFieldStatus).toHaveBeenCalledTimes(2);
    expect(mockGetFieldStatus).toHaveBeenCalledWith("a");
    expect(mockGetFieldStatus).toHaveBeenCalledWith("b");
    expect(overview.fieldBreakdown.find((row) => row.fieldId === "a")?.status).toBe("OK");
    expect(overview.fieldBreakdown.find((row) => row.fieldId === "b")).toMatchObject({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "MISSING_FIELD_PRODUCTION_CYCLE",
    });
  });

  it("excludes an archived field from every total, the same rule every other farm-wide aggregation applies", async () => {
    setUpBaseMocks();
    mockListFields.mockResolvedValue([field({ id: "active", areaHa: 5 }), field({ id: "archived", areaHa: 100, archivedAt: "2026-01-01" })]);
    mockGetFieldStatus.mockResolvedValue(p3Ok({ n: 10, p: 1, k: 2 }));

    const overview = await getFertiliserPlanOverviewAction();
    expect(overview.fieldsTotal).toBe(1);
    expect(overview.totalAreaHaTotal).toBe(5);
    expect(overview.fieldBreakdown.map((f) => f.fieldId)).toEqual(["active"]);
    expect(mockGetFieldStatus).toHaveBeenCalledTimes(1);
    expect(mockGetFieldStatus).toHaveBeenCalledWith("active");
  });

  it("sums real N/P/K only across fields whose P3 status genuinely reached ok", async () => {
    setUpBaseMocks();
    mockListFields.mockResolvedValue([field({ id: "a", areaHa: 10 }), field({ id: "b", areaHa: 5 })]);
    mockGetFieldStatus.mockImplementation(async (fieldId) =>
      fieldId === "a" ? p3Ok({ n: 100, p: 20, k: 30 }) : { status: "blocked", reasonCode: "NO_LIVESTOCK" },
    );

    const overview = await getFertiliserPlanOverviewAction();
    expect(overview.nutrientRequirementKg).toEqual({ n: 1000, p: 200, k: 300, fieldsIncluded: 1 });
    expect(overview.fieldsIncluded).toBe(1);
    expect(overview.fieldsExcluded).toBe(1);
    const blocked = overview.fieldBreakdown.find((f) => f.fieldId === "b");
    expect(blocked?.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(blocked?.reasonCode).toBe("NO_LIVESTOCK");
  });

  it("shows a stock band for a product with real remaining demand", async () => {
    setUpBaseMocks();
    mockListFields.mockResolvedValue([]);
    mockGetDemand.mockResolvedValue(
      demandResult({
        demand: [{ farmId: "farm-1", product: "Urea", unit: "kg", totalRequirementKg: 1000, plannedRequirementKg: 0, confirmedRequirementKg: 0, remainingRequirementKg: 1000, confidence: "estimated" }],
        purchaseRequirementTonnes: [{ product: "Urea", npkAnalysis: "46-0-0", recommendedTotalTonnes: 1, plannedTotalTonnes: 0, confirmedAppliedTotalTonnes: 0, remainingTotalTonnes: 1, remainingTotalKg: 1000, fieldsCount: 1 }],
      }),
    );
    mockListStockRecords.mockResolvedValue([
      { id: "s1", farmId: "farm-1", product: "Urea", quantity: 100, unit: "kg", effectiveDate: "2026-09-01", source: "Farmer count", recordedAt: "2026-09-01T09:00:00.000Z" } satisfies FertiliserStockRecord,
    ]);

    const overview = await getFertiliserPlanOverviewAction();
    expect(overview.stockColumns).toHaveLength(1);
    const band = overview.stockColumns[0];
    expect(band.status).toBe("recorded");
    expect(band.npkAnalysis).toBe("46-0-0");
    if (band.status === "recorded") {
      expect(band.stockPct).toBeCloseTo(10, 5);
      expect(band.shortfallPct).toBeCloseTo(90, 5);
    }
  });

  it("still shows a farmer's real recorded stock for a product with no current demand row at all, as a real surplus, rather than dropping it", async () => {
    setUpBaseMocks();
    mockListFields.mockResolvedValue([]);
    mockGetDemand.mockResolvedValue(demandResult({ demand: [] }));
    mockListStockRecords.mockResolvedValue([
      { id: "s1", farmId: "farm-1", product: "CAN 27%", quantity: 200, unit: "kg", effectiveDate: "2026-09-01", source: "Farmer count", recordedAt: "2026-09-01T09:00:00.000Z" } satisfies FertiliserStockRecord,
    ]);

    const overview = await getFertiliserPlanOverviewAction();
    expect(overview.stockColumns).toHaveLength(1);
    const band = overview.stockColumns[0];
    expect(band.product).toBe("CAN 27%");
    expect(band.status).toBe("recorded");
    if (band.status === "recorded") {
      expect(band.hasRemainingRequirement).toBe(false);
      expect(band.surplusKg).toBe(200);
    }
  });

  it("builds the lime stock band from the real farm-wide lime tonnes, converted honestly to kg", async () => {
    setUpBaseMocks();
    mockListFields.mockResolvedValue([]);
    mockGetLime.mockResolvedValue(limeResult({ farmTotalTonnes: 2, fieldsWithoutLimeEvidence: 1 }));
    mockListStockRecords.mockResolvedValue([
      { id: "s1", farmId: "farm-1", product: "Lime", quantity: 1, unit: "t", effectiveDate: "2026-09-01", source: "Farmer count", recordedAt: "2026-09-01T09:00:00.000Z" } satisfies FertiliserStockRecord,
    ]);

    const overview = await getFertiliserPlanOverviewAction();
    expect(overview.limeStockBand.status).toBe("recorded");
    if (overview.limeStockBand.status === "recorded") {
      expect(overview.limeStockBand.remainingRequirementKg).toBe(2000);
      expect(overview.limeStockBand.stockKg).toBe(1000);
    }
    expect(overview.lime.fieldsWithoutLimeEvidence).toBe(1);
  });

  it("throws a clear error rather than silently returning empty data when there is no real farm", async () => {
    mockGetFarm.mockResolvedValue(null);
    await expect(getFertiliserPlanOverviewAction()).rejects.toThrow(/no real farm/);
  });
});

describe("addFertiliserStockRecordAction", () => {
  it("returns real validation errors and never calls the database write on invalid input", async () => {
    mockGetFarm.mockResolvedValue(FARM);
    const result = await addFertiliserStockRecordAction({ product: "", quantity: 0, unit: "kg", effectiveDate: "2026-09-01", source: "" });
    expect(result.status).toBe("validation_error");
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(mockCreateStockRecord).not.toHaveBeenCalled();
  });

  it("inserts a real new record on valid input", async () => {
    mockGetFarm.mockResolvedValue(FARM);
    const record: FertiliserStockRecord = { id: "s1", farmId: "farm-1", product: "Urea", quantity: 100, unit: "kg", effectiveDate: "2026-09-01", source: "Farmer entered", recordedAt: "2026-09-01T09:00:00.000Z" };
    mockCreateStockRecord.mockResolvedValue(record);
    const result = await addFertiliserStockRecordAction({ product: "Urea", quantity: 100, unit: "kg", effectiveDate: "2026-09-01", source: "Farmer entered" });
    expect(result).toEqual({ status: "ok", record });
    expect(mockCreateStockRecord).toHaveBeenCalledWith("farm-1", expect.objectContaining({ product: "Urea", quantity: 100 }));
  });
});
