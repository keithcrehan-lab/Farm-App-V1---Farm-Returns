import { describe, expect, it } from "vitest";
import {
  buildGroupNutritionVM,
  nutritionDraftOf,
  nutritionDraftToSaveInput,
  nutritionFormOptions,
  sealGroupNutritionContext,
  type NutritionDraft,
} from "./nutrition-plan-view";

const AS_OF = "2026-11-04";
const ctx = sealGroupNutritionContext({
  state: "OK",
  category: "steer",
  goal: "finish_slaughter",
  system: "housed",
  headCount: 30,
  averageWeightKg: 550,
  plan: { groupId: "g", farmId: "f", targetWeightKg: 650, targetDate: "2027-02-12", silageQualityBasis: "lab_analysis", silageDmdPct: 68, silageCpPct: 14, silageAnalysisDate: "2026-10-01", forageCostEurHeadDay: 0.6 },
});

describe("nutrition plan presentation", () => {
  it("round-trips the saved plan into the draft, never surfacing legacy cost fields", () => {
    const draft = nutritionDraftOf(ctx);
    expect(draft).toMatchObject({ targetKg: "650", targetDate: "2027-02-12", silageBasis: "lab_analysis", silageDmd: "68", silageCp: "14", silageDate: "2026-10-01", scenarioDmd: "", overrideConcentrateKg: "" });
    expect(Object.keys(draft)).not.toContain("forageCostEurHeadDay");
  });

  it("presents a supported finishing-steer plan with group totals and dated reference cost", () => {
    const vm = buildGroupNutritionVM(ctx, nutritionDraftOf(ctx), AS_OF);
    expect(vm.status.label).toBe("Teagasc guideline");
    expect(vm.requiredAdg.value).toBe("1.00");
    expect(vm.concentrate).toMatchObject({ value: "6", unit: "kg/head/day" });
    const rows = Object.fromEntries(vm.rows.map((r) => [r.label, r]));
    expect(rows["Crude protein"].value).toBe("11–12% CP");
    expect(rows["Energy"].value).toBe("0.93–0.94 UFV/kg");
    // 6 kg × 100 days × 30 head = 18 t; €350/t → €6,300.
    expect(rows["Concentrate for the group"].value).toBe("18.0 t");
    expect(rows["Cost at reference price"].value).toBe("≈ €6,300");
    expect(rows["Cost at reference price"].detail).toMatch(/2026-07/);
    expect(vm.feedCostHeadDay.value).toBe("€2.10");
    expect(vm.costPerTargetKg.value).toBe("€2.10/kg");
    expect(vm.silagePrompt).toBeNull();
    expect(vm.overrideActive).toBe(false);
  });

  it("marks bounded figures as upper bounds", () => {
    const draft: NutritionDraft = { ...nutritionDraftOf(ctx), targetKg: "630" };
    const vm = buildGroupNutritionVM(ctx, draft, AS_OF);
    expect(vm.status.label).toBe("Indicative · upper bound");
    expect(vm.concentrate.value).toBe("≤ 6");
    expect(vm.rows.find((r) => r.label === "Concentrate for the group")?.value).toMatch(/^Up to /);
  });

  it("is honest when the context is unavailable", () => {
    const vm = buildGroupNutritionVM(sealGroupNutritionContext({ state: "UNAVAILABLE" }), nutritionDraftOf(sealGroupNutritionContext({ state: "UNAVAILABLE" })), AS_OF);
    expect(vm.concentrate.value).toBeNull();
    expect(vm.rows).toHaveLength(0);
  });

  it("offers only published DMD rows as scenarios and an honest housed default", () => {
    const options = nutritionFormOptions(ctx);
    expect(options.scenarioDmd.map((o) => o.value)).toEqual(["", "66", "68", "70", "72", "74", "76"]);
    expect(options.feeding[0].label).toBe("Housed — grass silage assumed");
  });

  it("validates the draft before saving", () => {
    const draft = nutritionDraftOf(ctx);
    expect(nutritionDraftToSaveInput(draft, AS_OF)).toMatchObject({ ok: true, input: { targetKg: 650, silageQualityBasis: "lab_analysis", silageDmdPct: 68, feedingSituation: null } });
    expect(nutritionDraftToSaveInput({ ...draft, targetKg: "abc" }, AS_OF)).toEqual({ ok: false, message: "Check the production-plan numbers before saving." });
    expect(nutritionDraftToSaveInput({ ...draft, silageDate: "" }, AS_OF)).toMatchObject({ ok: false, message: expect.stringMatching(/lab report/) });
    expect(nutritionDraftToSaveInput({ ...draft, silageBasis: "planning_scenario", scenarioDmd: "" }, AS_OF)).toMatchObject({ ok: false });
    expect(nutritionDraftToSaveInput({ ...draft, silageBasis: "" }, AS_OF)).toMatchObject({ ok: true, input: { silageQualityBasis: null, silageDmdPct: null, silageCpPct: null, silageAnalysisDate: null } });
  });
});
