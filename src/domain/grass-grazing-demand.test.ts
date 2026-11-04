import { describe, expect, it } from "vitest";
import { tracked, type LivestockCategory, type LivestockGroup } from "@/domain/types";
import {
  BEEF_GRAZING_DEMAND_RULE_ID,
  resolveGrassGrazingDemand,
} from "./grass-grazing-demand";

function group(category: LivestockCategory, weightKg?: number): LivestockGroup {
  return {
    id: "group-1",
    farmId: "farm-1",
    category,
    label: "Test group",
    count: tracked(20, "verified", "Farmer"),
    ...(weightKg !== undefined ? { avgWeightKg: tracked(weightKg, "farmer_adjusted", "Farmer") } : {}),
    system: "grazing",
    value: tracked(0, "estimated", "Farm Return assumption"),
  };
}

describe("grass grazing demand", () => {
  it("calculates beef grazing demand as 2% of liveweight per head per day", () => {
    const result = resolveGrassGrazingDemand({ group: group("steer", 420), headCount: 50 });
    expect(result).toMatchObject({
      status: "resolved",
      provider: "beef_liveweight_v1",
      groupId: "group-1",
      category: "steer",
      headCount: 50,
      kgDmPerHeadDay: 8.4,
      dailyDemandKgDm: 420,
      confidence: "medium",
      ruleId: BEEF_GRAZING_DEMAND_RULE_ID,
      source: expect.stringMatching(/Teagasc/i),
    });
    if (result.status !== "resolved") throw new Error("expected resolved demand");
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "avg_weight_kg", value: 420, unit: "kg", source: "Farmer" }),
      expect.objectContaining({ key: "head_count", value: 50 }),
      expect.objectContaining({ key: "intake_fraction", value: 2 }),
    ]));
  });

  it("uses the movement-session headcount rather than the group's current count", () => {
    const result = resolveGrassGrazingDemand({ group: group("weanling", 350), headCount: 12 });
    if (result.status !== "resolved") throw new Error("expected resolved demand");
    expect(result.dailyDemandKgDm).toBe(84);
  });

  it("fails closed when average liveweight is missing", () => {
    expect(resolveGrassGrazingDemand({ group: group("store"), headCount: 20 })).toMatchObject({
      status: "unresolved",
      reason: "MISSING_AVG_WEIGHT",
    });
  });

  it("does not apply the beef 2% rule to dairy cows", () => {
    expect(resolveGrassGrazingDemand({ group: group("dairy_cow", 650), headCount: 20 })).toMatchObject({
      status: "unresolved",
      reason: "UNSUPPORTED_CATEGORY",
    });
  });

  it("fails closed on an invalid movement headcount", () => {
    expect(resolveGrassGrazingDemand({ group: group("suckler_cow", 650), headCount: 0 })).toMatchObject({
      status: "unresolved",
      reason: "INVALID_HEADCOUNT",
    });
  });
});
