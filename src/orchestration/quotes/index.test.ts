import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint C — focused tests
 * for `getQuoteRequestPrefillContext`'s own new lime-quick-fill
 * addition (`QuoteRequestLimeOption`). The pre-existing fertiliser-demand
 * half of this orchestration module (ported verbatim from the
 * managed-quote-pilot worktree, commit 60cd91d) already has indirect
 * coverage via `RequestQuoteSheet.test.tsx`/`QuotesPageClient.test.tsx`
 * — this file covers only the genuinely new real behaviour.
 */
vi.mock("@/app/actions/fertiliser-plan", () => ({
  getFarmFertiliserDemandAction: vi.fn(),
  getFarmLimeRequirementAction: vi.fn(),
}));
vi.mock("@/lib/farm-data/farms", () => ({
  getFarmForCurrentUser: vi.fn(async () => ({ id: "farm-1" })),
}));
vi.mock("@/lib/farm-data/fertiliser-stock", () => ({
  listFertiliserStockRecordsForFarm: vi.fn(async () => []),
}));
vi.mock("@/lib/farm-data/quote-requests", () => ({
  listQuoteRequestsForFarm: vi.fn(),
  listQuoteRequestsForOperatorInbox: vi.fn(),
  reviseQuoteRequest: vi.fn(),
  submitQuoteRequest: vi.fn(),
  withdrawQuoteRequest: vi.fn(),
}));

import { getFarmFertiliserDemandAction, getFarmLimeRequirementAction } from "@/app/actions/fertiliser-plan";
import { getQuoteRequestPrefillContext } from "./index";
import { listFertiliserStockRecordsForFarm } from "@/lib/farm-data/fertiliser-stock";
import { aggregateFarmFertiliserPurchasing, buildFarmFertiliserQuoteBasket } from "@/domain/fertiliser-plan";

const mockGetFarmFertiliserDemand = vi.mocked(getFarmFertiliserDemandAction);
const mockGetFarmLimeRequirement = vi.mocked(getFarmLimeRequirementAction);

const EMPTY_AGGREGATION = aggregateFarmFertiliserPurchasing([]);
const EMPTY_DEMAND = {
  demand: [],
  truncated: false,
  applicationsWithUnknownComposition: 0,
  fieldsWithBlockedEvidence: 0,
  purchaseRequirementTonnes: [],
  aggregation: EMPTY_AGGREGATION,
  basket: buildFarmFertiliserQuoteBasket(EMPTY_AGGREGATION, { farmId: "farm-1", createdAt: "2026-10-03T00:00:00.000Z" }),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("getQuoteRequestPrefillContext — real lime quick-fill (Checkpoint C)", () => {
  it("includes a real limeOption when the farm has a real, positive lime total", async () => {
    mockGetFarmFertiliserDemand.mockResolvedValue(EMPTY_DEMAND);
    mockGetFarmLimeRequirement.mockResolvedValue({ fields: [], farmTotalTonnes: 12.5, fieldsWithoutLimeEvidence: 1 });

    const result = await getQuoteRequestPrefillContext();

    expect(result.limeOption).toEqual({ farmTotalTonnes: 12.5, fieldsWithoutLimeEvidence: 1 });
  });

  it("never fabricates a limeOption when the real farm total is zero — no lime evidence at all", async () => {
    mockGetFarmFertiliserDemand.mockResolvedValue(EMPTY_DEMAND);
    mockGetFarmLimeRequirement.mockResolvedValue({ fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 3 });

    const result = await getQuoteRequestPrefillContext();

    expect(result.limeOption).toBeUndefined();
  });

  it("never recomputes lime itself — the exact real figure getFarmLimeRequirementAction returns is what's exposed", async () => {
    mockGetFarmFertiliserDemand.mockResolvedValue(EMPTY_DEMAND);
    mockGetFarmLimeRequirement.mockResolvedValue({ fields: [{ fieldId: "f1", fieldName: "Back Meadow", rateTHa: 2.5, fieldTonnes: 12.5, areaHa: 5 }], farmTotalTonnes: 12.5, fieldsWithoutLimeEvidence: 0 });

    const result = await getQuoteRequestPrefillContext();

    expect(mockGetFarmLimeRequirement).toHaveBeenCalledTimes(1);
    expect(result.limeOption?.farmTotalTonnes).toBe(12.5);
  });
});

describe("getQuoteRequestPrefillContext — stock-adjusted purchase quantity (F011)", () => {
  const demandFor = (remainingRequirementKg: number) => ({
    ...EMPTY_DEMAND,
    demand: [
      {
        farmId: "farm-1",
        product: "0-7-30",
        recommendedTotalKg: remainingRequirementKg,
        plannedTotalKg: 0,
        confirmedTotalKg: 0,
        remainingRequirementKg,
      },
    ],
  });
  const stockRecord = (quantity: number) => ({
    id: `stock-${quantity}`,
    farmId: "farm-1",
    product: "0-7-30",
    quantity,
    unit: "kg" as const,
    effectiveDate: "2026-10-30",
    source: "Farmer count",
    recordedAt: "2026-10-30T09:00:00.000Z",
  });

  it.each([
    ["sufficient", 416.7, 0],
    ["partial", 200, 216.7],
    ["zero", 0, 416.7],
  ] as const)(
    "subtracts %s recorded stock through the stock contract and keeps the agronomic requirement",
    async (_label, stockKg, expectedPurchaseKg) => {
      mockGetFarmFertiliserDemand.mockResolvedValue(demandFor(416.7) as never);
      mockGetFarmLimeRequirement.mockResolvedValue({ fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 0 });
      vi.mocked(listFertiliserStockRecordsForFarm).mockResolvedValue([stockRecord(stockKg)] as never);

      const [option] = (await getQuoteRequestPrefillContext()).options;
      expect(option.remainingRequirementKg).toBe(416.7);
      expect(option.stock).toMatchObject({ status: "recorded", stockKg });
      expect(option.suggestedPurchaseKg).toBeCloseTo(expectedPurchaseKg, 9);
    },
  );

  it("never treats unrecorded stock as zero stock or as enough stock", async () => {
    mockGetFarmFertiliserDemand.mockResolvedValue(demandFor(416.7) as never);
    mockGetFarmLimeRequirement.mockResolvedValue({ fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 0 });
    vi.mocked(listFertiliserStockRecordsForFarm).mockResolvedValue([]);

    const [option] = (await getQuoteRequestPrefillContext()).options;
    expect(option.stock).toEqual({ status: "not_recorded" });
    expect(option.suggestedPurchaseKg).toBe(416.7);
  });
});
