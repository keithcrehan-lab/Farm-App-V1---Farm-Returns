import { describe, expect, it } from "vitest";
import type { GrazingDemandResolution } from "./grazing-demand";

describe("grazing demand contract", () => {
  it("allows a future nutrition engine to supply demand without changing Grass", () => {
    const result: GrazingDemandResolution = {
      status: "resolved",
      provider: "animal_nutrition",
      groupId: "group-1",
      category: "store",
      headCount: 12,
      kgDmPerHeadDay: 9.1,
      dailyDemandKgDm: 109.2,
      confidence: "high",
      source: "Animal nutrition engine",
      ruleId: "animal_nutrition_v1",
      evidence: [
        { key: "goal", label: "Production goal", value: "finish_slaughter", source: "Animal profile" },
        { key: "target_adg", label: "Target gain", value: 1.0, unit: "kg/day", source: "Animal profile" },
      ],
    };
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.dailyDemandKgDm).toBe(109.2);
    expect(result.provider).toBe("animal_nutrition");
  });

  it("allows dairy to fail closed until its nutrition inputs exist", () => {
    const result: GrazingDemandResolution = {
      status: "unresolved",
      provider: "dairy_nutrition",
      groupId: "dairy-1",
      category: "dairy_cow",
      headCount: 70,
      reason: "NUTRITION_INPUTS_INCOMPLETE",
      missing: ["days_in_milk", "supplement_dm"],
    };
    expect(result.status).toBe("unresolved");
  });
});
