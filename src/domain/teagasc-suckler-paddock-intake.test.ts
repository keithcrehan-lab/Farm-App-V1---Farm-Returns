import { describe, expect, it } from "vitest";
import { calculateSucklerPairAllocation } from "./teagasc-suckler-paddock-intake";

const example = {
  cowHeadCount: 40, cowAverageWeightKg: 700, calfHeadCount: 40,
  calfAverageWeightKg: 200, calfStage: "older_grazing" as const,
  supplementaryFeedRecordedNone: true,
};

describe("Teagasc BEEF2026 cow+older-calf atomic allocation", () => {
  it("reproduces published 40-cow and 40-calf group without omitting calves", () => {
    expect(calculateSucklerPairAllocation(example)).toMatchObject({
      status: "READY", cowKgDmDay: 560, calfKgDmDay: 160, totalKgDmDay: 720,
      quantityBasis: "PLANNING_ALLOCATION", confidence: "low",
    });
  });
  it("reproduces 20 cow-calf pairs 18kg each, plus 10 600kg heifers 12kg, total 480", () => {
    const r = calculateSucklerPairAllocation({ ...example, cowHeadCount: 20, calfHeadCount: 20 });
    expect(r).toMatchObject({ status: "READY", totalKgDmDay: 360 });
    if (r.status !== "READY") return;
    expect(r.totalKgDmDay + 10 * 600 * 0.02).toBe(480);
    expect((2250 * 6.59) / 480).toBeCloseTo(30.890625, 9);
  });
  it.each([0, -1, 1.5, Number.NaN, Infinity])("does not manufacture a demand for invalid cow headcount %s", (cowHeadCount) => {
    expect(calculateSucklerPairAllocation({ ...example, cowHeadCount })).toMatchObject({ status: "INCOMPLETE" });
  });
  it("requires cow and calf groups and an explicit no-supplement record", () => {
    expect(calculateSucklerPairAllocation({ ...example, calfHeadCount: 0 })).toMatchObject({ status: "INCOMPLETE", missing: ["calfHeadCount"] });
    expect(calculateSucklerPairAllocation({ ...example, supplementaryFeedRecordedNone: false })).toMatchObject({ status: "INCOMPLETE", missing: ["supplementaryFeedRecordedNone"] });
  });
  it("does not use older-calf intake for a milk-dependent newborn", () => {
    expect(calculateSucklerPairAllocation({ ...example, calfStage: "milk_dependent" })).toEqual({ status: "OUT_OF_SCOPE", reason: "UNSUPPORTED_CALF_STAGE" });
  });
  it("blocks extrapolation from single-example weight brackets", () => {
    expect(calculateSucklerPairAllocation({ ...example, cowAverageWeightKg: 800 })).toEqual({ status: "OUT_OF_SCOPE", reason: "WEIGHT_OUTSIDE_REFERENCE" });
    expect(calculateSucklerPairAllocation({ ...example, calfAverageWeightKg: 100 })).toEqual({ status: "OUT_OF_SCOPE", reason: "WEIGHT_OUTSIDE_REFERENCE" });
  });
});
