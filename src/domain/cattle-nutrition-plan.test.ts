import { describe, expect, it } from "vitest";
import {
  buildCattleNutritionPlan,
  feedingSituationFor,
  silageColumnsFor,
  silageQualityOf,
  type CattleNutritionPlanInput,
  type SilageQuality,
} from "./cattle-nutrition-plan";
import { deriveCattleGroupProductionPlanMetrics } from "./cattle-group-production-plan";
import type { InputReferencePrice } from "./inputs-market";
import type { LivestockCategory, LivestockGoal } from "./types";

const AS_OF = "2026-11-04";
/** 100 days after AS_OF. */
const TARGET_DATE = "2027-02-12";

const REF_PRICE: InputReferencePrice = {
  status: "available",
  eurPerTonne: 350,
  basis: "published_benchmark",
  sourceLabel: "Teagasc first-winter nutrition worked example",
  sourceUrl: "https://teagasc.ie/",
  referencePeriod: "2026-07",
  caveat: "An advisory worked-example price, not an observed market price.",
};

const lab = (dmdPct: number, cpPct?: number): SilageQuality => ({
  basis: "lab_analysis",
  dmdPct,
  ...(cpPct !== undefined ? { cpPct } : {}),
  analysisDate: "2026-10-20",
});

function input(o: {
  category?: LivestockCategory;
  goal?: LivestockGoal;
  current?: number;
  gain?: number;
  target?: number;
  targetDate?: string;
  head?: number | null;
  silage?: SilageQuality;
  feeding?: CattleNutritionPlanInput["feedingSituation"] | null;
  override?: CattleNutritionPlanInput["override"];
  price?: InputReferencePrice | null;
} = {}): CattleNutritionPlanInput {
  const current = o.current ?? 300;
  const metrics = deriveCattleGroupProductionPlanMetrics({
    plan: { groupId: "g", farmId: "f", targetWeightKg: o.target ?? current + (o.gain ?? 60), targetDate: o.targetDate ?? TARGET_DATE },
    currentWeightKg: o.current === 0 ? undefined : current,
    headCount: o.head ?? 20,
    asOfDate: AS_OF,
  });
  return {
    category: o.category ?? "weanling",
    ...(o.goal ? { goal: o.goal } : {}),
    ...(o.head === null ? {} : { headCount: o.head ?? 20 }),
    metrics,
    asOfDate: AS_OF,
    ...(o.feeding === null ? {} : { feedingSituation: o.feeding ?? { value: "housed_grass_silage", source: "farmer" } }),
    silage: o.silage ?? lab(70, 10),
    ...(o.override ? { override: o.override } : {}),
    ...(o.price === null ? {} : { concentrateReferencePrice: o.price ?? REF_PRICE }),
  };
}

const STEER = { category: "steer" as const, goal: "finish_slaughter" as const, current: 550, gain: 100 };
const HEIFER = { category: "heifer" as const, goal: "finish_slaughter" as const, current: 500, gain: 90 };
const WEANLING = { category: "weanling" as const, current: 300, gain: 60 };

describe("buildCattleNutritionPlan — Teagasc DairyBeef 500 Table 3 exact rows", () => {
  const table: [string, typeof WEANLING | typeof STEER | typeof HEIFER, number, number][] = [
    ["weanling", WEANLING, 66, 1.8], ["weanling", WEANLING, 68, 1.5], ["weanling", WEANLING, 70, 1.2],
    ["weanling", WEANLING, 72, 0.9], ["weanling", WEANLING, 74, 0.6], ["weanling", WEANLING, 76, 0.4],
    ["finishing steer", STEER, 66, 7], ["finishing steer", STEER, 68, 6], ["finishing steer", STEER, 70, 5.5],
    ["finishing steer", STEER, 72, 5], ["finishing steer", STEER, 74, 4], ["finishing steer", STEER, 76, 4],
    ["finishing heifer", HEIFER, 66, 7], ["finishing heifer", HEIFER, 68, 6], ["finishing heifer", HEIFER, 70, 5.5],
    ["finishing heifer", HEIFER, 72, 5], ["finishing heifer", HEIFER, 74, 4], ["finishing heifer", HEIFER, 76, 4],
  ];
  it.each(table)("%s at %i DMD on the guideline ADG → %f kg/head/day, exact", (_label, stage, dmd, kg) => {
    const plan = buildCattleNutritionPlan(input({ ...stage, silage: lab(dmd) }));
    expect(plan.applicability).toBe("SUPPORTED");
    expect(plan.adgFit.status).toBe("matches");
    expect(plan.concentrate).toMatchObject({ status: "recommended", kgHeadDay: kg, precision: "exact", tableDmd: dmd });
  });

  it("sizes the full group over the plan horizon and costs it at the dated reference price", () => {
    const plan = buildCattleNutritionPlan(input({ ...WEANLING, silage: lab(70, 10) }));
    expect(plan.totals).toEqual({ status: "known", precision: "exact", days: 100, headCount: 20, kgHeadDay: 1.2, kgPerHead: 120, kgGroup: 2400 });
    expect(plan.cost).toMatchObject({
      status: "known",
      priceBasis: "reference_benchmark",
      eurPerTonne: 350,
      referencePeriod: "2026-07",
      eurPerHeadDay: 0.42,
      eurGroupDay: 8.4,
      eurGroupPeriod: 840,
      eurPerKgTargetGain: 0.7,
    });
    expect(plan.cost.status === "known" && plan.cost.caveat).toMatch(/not an observed market price/);
  });

  it("states weanling energy in UFL and finishing energy in UFV", () => {
    expect(buildCattleNutritionPlan(input(WEANLING)).energy.text).toBe(">0.94 UFL/kg");
    const steer = buildCattleNutritionPlan(input({ ...STEER, silage: lab(72) }));
    expect(steer.energy.text).toBe("0.93–0.94 UFV/kg");
    expect(steer.energy.detail).toMatch(/>0\.92 UFV/);
  });

  it("flags ad-lib consideration for finishing heifers at 66 DMD", () => {
    expect(buildCattleNutritionPlan(input({ ...HEIFER, silage: lab(66) })).notes.join(" ")).toMatch(/ad-lib feeding should be considered/i);
    expect(buildCattleNutritionPlan(input({ ...HEIFER, silage: lab(70) })).notes.join(" ")).not.toMatch(/ad-lib/i);
  });
});

describe("crude protein — Table 4", () => {
  it("finishing steers: 14% with 10% CP silage, 11–12% with 14% CP silage, 11–14% general otherwise", () => {
    expect(buildCattleNutritionPlan(input({ ...STEER, silage: lab(72, 10) })).protein).toMatchObject({ status: "specified", text: "14% CP" });
    expect(buildCattleNutritionPlan(input({ ...STEER, silage: lab(72, 14.2) })).protein).toMatchObject({ status: "specified", text: "11–12% CP" });
    expect(buildCattleNutritionPlan(input({ ...STEER, silage: lab(72, 12) })).protein).toMatchObject({ status: "general", text: "11–14% CP" });
    expect(buildCattleNutritionPlan(input({ ...STEER, silage: lab(72) })).protein).toMatchObject({ status: "general", text: "11–14% CP" });
  });

  it("weanlings: 20% only at a 1.0–1.5 kg rate on 10% CP silage; outside that rate it is not a published row", () => {
    expect(buildCattleNutritionPlan(input({ ...WEANLING, silage: lab(70, 10) })).protein).toMatchObject({ status: "specified", text: "20% CP" });
    expect(buildCattleNutritionPlan(input({ ...WEANLING, silage: lab(74, 10) })).protein).toMatchObject({ status: "not_specified", text: "16–20% CP" });
    expect(buildCattleNutritionPlan(input({ ...WEANLING, silage: lab(74, 14) })).protein).toMatchObject({ status: "specified", text: "14–16% CP" });
    expect(buildCattleNutritionPlan(input({ ...WEANLING, silage: { basis: "unknown" } })).protein).toMatchObject({ status: "general", text: "14–16% CP" });
  });
});

describe("required ADG against the guideline target (0.1 kg/day precision)", () => {
  it("treats an ADG that rounds to the target as matching", () => {
    expect(buildCattleNutritionPlan(input({ ...WEANLING, gain: 64 })).adgFit.status).toBe("matches");
  });

  it("is outside the evidence above the target: no kg figure, the guideline date instead", () => {
    const plan = buildCattleNutritionPlan(input({ ...WEANLING, gain: 66 }));
    expect(plan.applicability).toBe("OUTSIDE_EVIDENCE");
    expect(plan.concentrate.status).toBe("not_supported");
    expect(plan.totals.status).toBe("unknown");
    expect(plan.cost.status).toBe("unknown");
    // 66 kg at 0.6 kg/day → 110 days after AS_OF.
    expect(plan.adgFit).toEqual({ status: "above_guideline", guidelineAdgKgDay: 0.6, guidelineDate: "2027-02-22" });
    expect(plan.summary).toMatch(/advisor review required/i);
  });

  it("is bounded below the target: the published rate only as an upper bound", () => {
    const plan = buildCattleNutritionPlan(input({ ...STEER, gain: 80, silage: lab(70) }));
    expect(plan.applicability).toBe("BOUNDED");
    expect(plan.concentrate).toMatchObject({ status: "recommended", kgHeadDay: 5.5, precision: "upper_bound" });
    expect(plan.totals).toMatchObject({ status: "known", precision: "upper_bound" });
    expect(plan.assumptions.join(" ")).toMatch(/upper bound/i);
  });
});

describe("silage quality states", () => {
  it("never interpolates a lab DMD between rows — the next lower row, labelled as a bound (not the 0.33 kg/DMD rule)", () => {
    const plan = buildCattleNutritionPlan(input({ ...STEER, silage: lab(69) }));
    expect(plan.applicability).toBe("BOUNDED");
    expect(plan.concentrate).toMatchObject({ kgHeadDay: 6, tableDmd: 68, precision: "upper_bound" });
    expect(plan.assumptions.join(" ")).toMatch(/68 DMD row is used as a conservative bound/);
  });

  it("uses the 76 row as a bound above the table and fails closed below 66", () => {
    expect(buildCattleNutritionPlan(input({ ...WEANLING, silage: lab(78) })).concentrate).toMatchObject({ kgHeadDay: 0.4, precision: "upper_bound" });
    const low = buildCattleNutritionPlan(input({ ...WEANLING, silage: lab(64) }));
    expect(low.applicability).toBe("OUTSIDE_EVIDENCE");
    expect(low.concentrate.status).toBe("not_supported");
  });

  it("asks for a silage analysis when silage quality is unknown, keeping the spec but no rate", () => {
    const plan = buildCattleNutritionPlan(input({ ...STEER, silage: { basis: "unknown" } }));
    expect(plan.applicability).toBe("INPUT_REQUIRED");
    expect(plan.inputsNeeded).toContain("SILAGE_ANALYSIS");
    expect(plan.concentrate.status).toBe("not_supported");
    expect(plan.energy.status).toBe("specified");
    expect(plan.totals.status).toBe("unknown");
  });

  it("labels a farmer-chosen planning scenario and still asks for a lab result", () => {
    const plan = buildCattleNutritionPlan(input({ ...STEER, silage: { basis: "planning_scenario", dmdPct: 72 } }));
    expect(plan.concentrate).toMatchObject({ status: "recommended", kgHeadDay: 5 });
    expect(plan.silage.basis).toBe("planning_scenario");
    expect(plan.summary).toMatch(/planning scenario/i);
    expect(plan.inputsNeeded).toContain("SILAGE_ANALYSIS");
    expect(plan.assumptions.join(" ")).toMatch(/Not a lab result/);
  });
});

describe("evidence coverage of the group", () => {
  it("gives finishing bulls the CP/energy specification but no feeding rate", () => {
    const plan = buildCattleNutritionPlan(input({ category: "bull", goal: "finish_slaughter", current: 500, gain: 100, silage: lab(72, 10) }));
    expect(plan.applicability).toBe("OUTSIDE_EVIDENCE");
    expect(plan.concentrate.status).toBe("not_supported");
    expect(plan.protein).toMatchObject({ status: "specified", text: "11–12% CP" });
    expect(plan.energy.text).toMatch(/UFV/);
  });

  it.each([
    ["suckler cows", { category: "suckler_cow" as const }],
    ["store steers", { category: "steer" as const, goal: "grow" as const }],
  ])("is outside the evidence for %s", (_label, o) => {
    const plan = buildCattleNutritionPlan(input(o));
    expect(plan.applicability).toBe("OUTSIDE_EVIDENCE");
    expect(plan.stage.status).toBe("unsupported");
    expect(plan.energy.status).toBe("not_specified");
  });

  it("does not apply the silage table at grass and asks when the feeding situation is unknown", () => {
    expect(buildCattleNutritionPlan(input({ ...WEANLING, feeding: { value: "at_grass", source: "farmer" } })).applicability).toBe("OUTSIDE_EVIDENCE");
    const unknown = buildCattleNutritionPlan(input({ ...WEANLING, feeding: null }));
    expect(unknown.applicability).toBe("INPUT_REQUIRED");
    expect(unknown.inputsNeeded).toContain("FEEDING_SITUATION");
  });

  it("discloses an inferred grass-silage diet", () => {
    const plan = buildCattleNutritionPlan(input({ ...WEANLING, feeding: { value: "housed_grass_silage", source: "inferred_from_group" } }));
    expect(plan.applicability).toBe("SUPPORTED");
    expect(plan.assumptions.join(" ")).toMatch(/assumed because the group is recorded as housed/);
  });

  it("names the missing goal inputs", () => {
    expect(buildCattleNutritionPlan(input({ ...WEANLING, current: 0 })).inputsNeeded).toContain("CURRENT_WEIGHT");
    expect(buildCattleNutritionPlan(input({ ...WEANLING, target: 280 })).inputsNeeded).toContain("TARGET_WEIGHT");
    expect(buildCattleNutritionPlan(input({ ...WEANLING, targetDate: "2026-11-01" })).inputsNeeded).toContain("TARGET_DATE");
    const noHead = buildCattleNutritionPlan(input({ ...WEANLING, head: null }));
    expect(noHead.inputsNeeded).toContain("HEAD_COUNT");
    expect(noHead.concentrate.status).toBe("recommended");
    expect(noHead.totals.status).toBe("unknown");
  });
});

describe("overrides, cost and provenance", () => {
  it("uses a farmer/advisor override for totals and keeps the guideline for comparison", () => {
    const plan = buildCattleNutritionPlan(input({ ...WEANLING, override: { concentrateKgHeadDay: 2, concentratePriceEurT: 400 } }));
    expect(plan.concentrate).toMatchObject({ status: "override", kgHeadDay: 2, guideline: { kgHeadDay: 1.2 } });
    expect(plan.totals).toMatchObject({ kgGroup: 4000 });
    expect(plan.cost).toMatchObject({ priceBasis: "farmer_price", eurPerTonne: 400, eurGroupPeriod: 1600 });
    expect(plan.summary).toMatch(/override/i);
  });

  it("leaves cost unknown — never €0 — without a sourced price", () => {
    const plan = buildCattleNutritionPlan(input({ ...WEANLING, price: { status: "unavailable", reason: "No sourced price" } }));
    expect(plan.totals.status).toBe("known");
    expect(plan.cost).toEqual({ status: "unknown", reason: "No sourced price" });
  });

  it("cites the sources and limits the 0.33 kg/DMD figure to finishing context", () => {
    const steer = buildCattleNutritionPlan(input({ ...STEER, silage: lab(72) }));
    expect(steer.evidence.map((e) => e.url)).toEqual([
      expect.stringContaining("silage-quality-and-concentrate-supplementation"),
      expect.stringContaining("beef-management-notes-november-2026"),
      expect.stringContaining("nutritional-management-of-finishing-beef-cattle"),
    ]);
    expect(steer.evidence[2].limitation).toMatch(/not used to interpolate/);
    expect(buildCattleNutritionPlan(input(WEANLING)).evidence).toHaveLength(2);
  });
});

describe("input adapters", () => {
  it("validates silage provenance before persistence", () => {
    expect(silageColumnsFor({}, AS_OF)).toEqual({ ok: true, columns: {} });
    expect(silageColumnsFor({ silageQualityBasis: null }, AS_OF)).toMatchObject({ ok: true, columns: { silageQualityBasis: null, silageDmdPct: null } });
    expect(silageColumnsFor({ silageQualityBasis: "planning_scenario", silageDmdPct: 71 }, AS_OF)).toEqual({ ok: false, reasonCode: "SILAGE_SCENARIO_DMD_INVALID" });
    expect(silageColumnsFor({ silageQualityBasis: "planning_scenario", silageDmdPct: 72, silageCpPct: 12 }, AS_OF)).toMatchObject({ ok: true, columns: { silageCpPct: null, silageAnalysisDate: null } });
    expect(silageColumnsFor({ silageQualityBasis: "lab_analysis", silageDmdPct: 71.5 }, AS_OF)).toEqual({ ok: false, reasonCode: "SILAGE_ANALYSIS_DATE_INVALID" });
    expect(silageColumnsFor({ silageQualityBasis: "lab_analysis", silageDmdPct: 71.5, silageAnalysisDate: "2026-12-01" }, AS_OF)).toEqual({ ok: false, reasonCode: "SILAGE_ANALYSIS_DATE_INVALID" });
    expect(silageColumnsFor({ silageQualityBasis: "lab_analysis", silageDmdPct: 0, silageAnalysisDate: "2026-10-01" }, AS_OF)).toEqual({ ok: false, reasonCode: "SILAGE_DMD_INVALID" });
    expect(silageColumnsFor({ silageQualityBasis: "lab_analysis", silageDmdPct: 71.5, silageCpPct: 11.8, silageAnalysisDate: "2026-10-01" }, AS_OF)).toMatchObject({ ok: true });
  });

  it("reads stored silage as lab, scenario or unknown", () => {
    expect(silageQualityOf({ silageQualityBasis: "lab_analysis", silageDmdPct: 70, silageCpPct: 10, silageAnalysisDate: "2026-10-01" })).toEqual({ basis: "lab_analysis", dmdPct: 70, cpPct: 10, analysisDate: "2026-10-01" });
    expect(silageQualityOf({ silageQualityBasis: "lab_analysis", silageDmdPct: 70 })).toEqual({ basis: "unknown" });
    expect(silageQualityOf({ silageQualityBasis: "planning_scenario", silageDmdPct: 70 })).toEqual({ basis: "planning_scenario", dmdPct: 70 });
    expect(silageQualityOf(undefined)).toEqual({ basis: "unknown" });
  });

  it("infers grass silage only for a housed group without a saved choice", () => {
    expect(feedingSituationFor("at_grass", "housed")).toEqual({ value: "at_grass", source: "farmer" });
    expect(feedingSituationFor(undefined, "housed")).toEqual({ value: "housed_grass_silage", source: "inferred_from_group" });
    expect(feedingSituationFor(undefined, "grazing")).toBeUndefined();
  });
});
