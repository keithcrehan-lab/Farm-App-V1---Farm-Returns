import { describe, expect, it } from "vitest";
import {
  evaluateSellHoldEconomicsGate,
  LIVEWEIGHT_STALENESS_THRESHOLD_DAYS,
  priceSignalAloneNeverRecommendsSelling,
  type SellHoldEconomicsEvidence,
} from "./sell-hold-economics-gate";

const complete: SellHoldEconomicsEvidence = {
  currentWeightKg: 600,
  weighDate: "2026-08-20",
  asOfDate: "2026-08-26",
  saleRoute: "factory",
  performanceModelValidated: true,
  farmerTargetSaleDate: "2026-10-20",
};

describe("evaluateSellHoldEconomicsGate", () => {
  it("GFT151: a complete scenario is allowed", () => {
    const outcome = evaluateSellHoldEconomicsGate(complete);
    expect(outcome.status).toBe("OK");
  });

  it("GFT152: no current weight blocks outright", () => {
    const outcome = evaluateSellHoldEconomicsGate({ ...complete, currentWeightKg: undefined });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("NO_AUTONOMOUS_SELL_RECOMMENDATION");
    }
  });

  it("GFT153: no sale route blocks", () => {
    const outcome = evaluateSellHoldEconomicsGate({ ...complete, saleRoute: undefined });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_MISSING_SALE_ROUTE");
    }
  });

  it("GFT154: no performance model blocks", () => {
    const outcome = evaluateSellHoldEconomicsGate({ ...complete, performanceModelValidated: false });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("BLOCK_MISSING_PERFORMANCE_MODEL");
    }
  });

  it("GFT155: a price signal alone (no animal data) never recommends selling", () => {
    const outcome = priceSignalAloneNeverRecommendsSelling();
    expect(outcome.status).toBe("NOT_APPLICABLE");
    if (outcome.status === "NOT_APPLICABLE") {
      expect(outcome.reasonCode).toBe("NO_AUTONOMOUS_SELL_RECOMMENDATION");
    }
  });

  it("GFT156: a weigh date beyond the staleness threshold flags staleLiveweight, but still allows the scenario", () => {
    const outcome = evaluateSellHoldEconomicsGate({ ...complete, weighDate: "2025-12-01", asOfDate: "2026-08-26" });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value.staleLiveweight).toBe(true);
  });

  it("a weigh date within the staleness threshold does not flag staleLiveweight", () => {
    const outcome = evaluateSellHoldEconomicsGate(complete); // 6 days old
    if (outcome.status === "OK") expect(outcome.value.staleLiveweight).toBe(false);
    else throw new Error("expected OK");
  });

  it("a missing weighDate is treated as stale, never assumed fresh", () => {
    const outcome = evaluateSellHoldEconomicsGate({ ...complete, weighDate: undefined });
    if (outcome.status === "OK") expect(outcome.value.staleLiveweight).toBe(true);
    else throw new Error("expected OK");
  });

  it(`the staleness threshold is exactly ${LIVEWEIGHT_STALENESS_THRESHOLD_DAYS} days`, () => {
    expect(LIVEWEIGHT_STALENESS_THRESHOLD_DAYS).toBe(60);
  });

  // GFT157: farmer intent preserved, never rewritten.
  it("GFT157: the farmer's own target-sale date is returned verbatim, never replaced by a model-preferred date", () => {
    const outcome = evaluateSellHoldEconomicsGate({ ...complete, farmerTargetSaleDate: "2026-12-01", modelPreferredSaleDate: "2026-10-01" });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.farmerTargetSaleDate).toBe("2026-12-01");
    expect(outcome.value.alternativeSaleDate).toBe("2026-10-01");
    // The model's preferred date is surfaced as an alternative, never
    // substituted for the farmer's own choice.
    expect(outcome.value.farmerTargetSaleDate).not.toBe(outcome.value.alternativeSaleDate);
  });

  it("an undefined farmer intent is passed through as undefined, not silently filled with the model's preference", () => {
    const outcome = evaluateSellHoldEconomicsGate({ ...complete, farmerTargetSaleDate: undefined, modelPreferredSaleDate: "2026-10-01" });
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.value.farmerTargetSaleDate).toBeUndefined();
    expect(outcome.value.alternativeSaleDate).toBe("2026-10-01");
  });
});
