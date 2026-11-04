import { describe, expect, it } from "vitest";
import { deriveCattleGroupProductionPlanMetrics, type CattleGroupProductionPlan } from "./cattle-group-production-plan";

const plan: CattleGroupProductionPlan = {
  groupId: "g1",
  farmId: "f1",
  targetWeightKg: 500,
  targetDate: "2027-02-12",
  concentrateKgHeadDay: 2,
  concentratePriceEurT: 400,
  forageCostEurHeadDay: 0.6,
  housingCostEurHeadDay: 0.2,
};

describe("cattle group production plan", () => {
  it("derives required gain, ADG and diet economics without inventing market value", () => {
    const r = deriveCattleGroupProductionPlanMetrics({ plan, currentWeightKg: 420, headCount: 20, asOfDate: "2026-11-04" });
    expect(r.requiredGainKg).toEqual({ status: "known", value: 80 });
    expect(r.remainingDays).toEqual({ status: "known", value: 100 });
    expect(r.requiredAdgKgDay).toEqual({ status: "known", value: 0.8 });
    expect(r.feedCostEurHeadDay).toEqual({ status: "known", value: 1.6 });
    expect(r.feedCostEurGroupDay).toEqual({ status: "known", value: 32 });
    expect(r.feedCostPerKgTargetGain).toEqual({ status: "known", value: 2 });
  });

  it("fails closed when current group weight is absent", () => {
    const r = deriveCattleGroupProductionPlanMetrics({ plan, headCount: 20, asOfDate: "2026-11-04" });
    expect(r.currentWeightKg.status).toBe("unknown");
    expect(r.requiredAdgKgDay.status).toBe("unknown");
    expect(r.feedCostPerKgTargetGain.status).toBe("unknown");
  });

  it("does not use a target date that is not in the future", () => {
    const r = deriveCattleGroupProductionPlanMetrics({ plan: { ...plan, targetDate: "2026-11-04" }, currentWeightKg: 420, headCount: 20, asOfDate: "2026-11-04" });
    expect(r.remainingDays).toEqual({ status: "unknown", reason: "TARGET_DATE_NOT_IN_FUTURE" });
  });
});
