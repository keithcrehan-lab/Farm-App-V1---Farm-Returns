import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry", () => ({ listSlurryAllocationsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/housing", () => ({ listHousingForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry-composition", () => ({ listSlurryCompositionRecordsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/fertiliser-stock", () => ({ listFertiliserStockRecordsForFarm: vi.fn(), createFertiliserStockRecord: vi.fn() }));
vi.mock("./fertiliser-plan", () => ({ getFarmFertiliserDemandAction: vi.fn(), getFarmLimeRequirementAction: vi.fn() }));
vi.mock("@/orchestration/prompt/recompute", () => ({ recomputePromptByKind: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { listSlurryCompositionRecordsForFarm } from "@/lib/farm-data/slurry-composition";
import type { SlurryComposition } from "@/domain/slurry-composition";
import { listFertiliserStockRecordsForFarm, createFertiliserStockRecord } from "@/lib/farm-data/fertiliser-stock";
import { getFarmFertiliserDemandAction, getFarmLimeRequirementAction } from "./fertiliser-plan";
import { recomputePromptByKind } from "@/orchestration/prompt/recompute";
import { getFertiliserPlanOverviewAction, addFertiliserStockRecordAction } from "./fertiliser-plan-overview";
import type { Farm, Field } from "@/domain/types";
import type { FertiliserStockRecord } from "@/domain/fertiliser-stock";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockListLivestockGroups = vi.mocked(listLivestockGroupsForFarm);
const mockListSlurryAllocations = vi.mocked(listSlurryAllocationsForFarm);
const mockListHousing = vi.mocked(listHousingForFarm);
const mockListSlurryCompositionRecords = vi.mocked(listSlurryCompositionRecordsForFarm);
const mockListStockRecords = vi.mocked(listFertiliserStockRecordsForFarm);
const mockCreateStockRecord = vi.mocked(createFertiliserStockRecord);
const mockGetDemand = vi.mocked(getFarmFertiliserDemandAction);
const mockGetLime = vi.mocked(getFarmLimeRequirementAction);
const mockRecompute = vi.mocked(recomputePromptByKind);

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
    ...overrides,
  };
}

function limeResult(overrides: Partial<Awaited<ReturnType<typeof getFarmLimeRequirementAction>>> = {}) {
  return { fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 0, ...overrides };
}

function setUpBaseMocks() {
  mockGetFarm.mockResolvedValue(FARM);
  mockListLivestockGroups.mockResolvedValue([]);
  mockListSlurryAllocations.mockResolvedValue([]);
  mockListHousing.mockResolvedValue([]);
  mockListSlurryCompositionRecords.mockResolvedValue([]);
  mockListStockRecords.mockResolvedValue([]);
  mockGetDemand.mockResolvedValue(demandResult());
  mockGetLime.mockResolvedValue(limeResult());
}

describe("getFertiliserPlanOverviewAction", () => {
  it("Campaign A audit HIGH: threads the farm's recorded slurry composition into every per-field recompute", async () => {
    setUpBaseMocks();
    const records: SlurryComposition[] = [
      { id: "c1", farmId: "farm-1", housingId: "h1", slurryType: "cattle_slurry", status: "verified", dmPct: 4, sampleDate: "2026-02-10", source: "Laboratory report", recordedAt: "2026-02-11T09:00:00Z" },
    ];
    mockListSlurryCompositionRecords.mockResolvedValue(records);
    mockListFields.mockResolvedValue([field({ id: "a" })]);
    mockRecompute.mockReturnValue({ basis: { status: "OK", value: { requirementKgHa: { n: 10, p: 1, k: 2 } }, evidenceState: "DERIVED" } } as never);

    await getFertiliserPlanOverviewAction();
    expect(mockListSlurryCompositionRecords).toHaveBeenCalledWith("farm-1");
    expect(mockRecompute).toHaveBeenCalledWith(expect.objectContaining({ slurryCompositionRecords: records }));
  });

  it("excludes an archived field from every total, the same rule every other farm-wide aggregation applies", async () => {
    setUpBaseMocks();
    mockListFields.mockResolvedValue([field({ id: "active", areaHa: 5 }), field({ id: "archived", areaHa: 100, archivedAt: "2026-01-01" })]);
    mockRecompute.mockReturnValue({ basis: { status: "OK", value: { requirementKgHa: { n: 10, p: 1, k: 2 } }, evidenceState: "DERIVED" } } as never);

    const overview = await getFertiliserPlanOverviewAction();
    expect(overview.fieldsTotal).toBe(1);
    expect(overview.totalAreaHaTotal).toBe(5);
    expect(overview.fieldBreakdown.map((f) => f.fieldId)).toEqual(["active"]);
  });

  it("sums real N/P/K only across fields whose own recompute genuinely reached OK", async () => {
    setUpBaseMocks();
    mockListFields.mockResolvedValue([field({ id: "a", areaHa: 10 }), field({ id: "b", areaHa: 5 })]);
    mockRecompute.mockImplementation(({ field: f }: { field: Field }) =>
      (f.id === "a"
        ? { basis: { status: "OK", value: { requirementKgHa: { n: 100, p: 20, k: 30 } }, evidenceState: "DERIVED" } }
        : { basis: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "NO_LIVESTOCK", missingInputs: [] } }) as never,
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
