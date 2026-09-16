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
vi.mock("@/lib/farm-data/quote-requests", () => ({
  listQuoteRequestsForFarm: vi.fn(),
  listQuoteRequestsForOperatorInbox: vi.fn(),
  reviseQuoteRequest: vi.fn(),
  submitQuoteRequest: vi.fn(),
  withdrawQuoteRequest: vi.fn(),
}));

import { getFarmFertiliserDemandAction, getFarmLimeRequirementAction } from "@/app/actions/fertiliser-plan";
import { getQuoteRequestPrefillContext } from "./index";

const mockGetFarmFertiliserDemand = vi.mocked(getFarmFertiliserDemandAction);
const mockGetFarmLimeRequirement = vi.mocked(getFarmLimeRequirementAction);

const EMPTY_DEMAND = { demand: [], truncated: false, applicationsWithUnknownComposition: 0, fieldsWithBlockedEvidence: 0, purchaseRequirementTonnes: [] };

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
