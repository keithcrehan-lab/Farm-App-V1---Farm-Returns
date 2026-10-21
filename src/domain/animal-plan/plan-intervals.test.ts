import { describe, expect, it } from "vitest";
import { computeAnimalPlanEconomics, derivePlanIntervals, summariseAnimalCosts, valueAnimalAtMart, type HousingAssumption, type HousingObservation, type PlanIntervals } from "./index";

// Invariant C: one canonical derivation of the plan's intervals; economics read it, nothing recomputes it.

const TODAY = "2026-10-16";
const SALE = "2026-12-04"; // 49 days after today
const OUT: HousingObservation = { state: "KNOWN", housed: false };
const IN: HousingObservation = { state: "KNOWN", housed: true };
const UNKNOWN: HousingObservation = { state: "UNKNOWN", reason: "NOT_RECORDED" };

const derive = (housingDate: string | null, observed: HousingObservation, assumption: HousingAssumption | null = null, saleDate = SALE) =>
  derivePlanIntervals({ asOfDate: TODAY, saleDate, housingDate, observed, assumption });

/** A compact, comparable view of the result. */
function shape(r: PlanIntervals) {
  if (r.state === "INVALID") return { state: "INVALID", issues: r.issues };
  if (r.split.state === "UNKNOWN") return { state: "VALID", total: r.totalDays, split: "UNKNOWN" };
  return { state: "VALID", total: r.totalDays, outdoor: r.split.outdoorDays, housed: r.split.housedDays, housedFrom: r.split.housedFrom, phases: r.split.phases.map((p) => `${p.kind}:${p.from}..${p.to}=${p.days}`) };
}

describe("plan intervals — boundary matrix (invariant C)", () => {
  const cases: [string, ReturnType<typeof derive>, ReturnType<typeof shape>][] = [
    ["housing starts today (outdoors now)", derive(TODAY, OUT), { state: "VALID", total: 49, outdoor: 0, housed: 49, housedFrom: TODAY, phases: [`HOUSED:${TODAY}..${SALE}=49`] }],
    ["housing starts tomorrow", derive("2026-10-17", OUT), { state: "VALID", total: 49, outdoor: 1, housed: 48, housedFrom: "2026-10-17", phases: [`OUTDOORS:${TODAY}..2026-10-17=1`, `HOUSED:2026-10-17..${SALE}=48`] }],
    ["housing midway", derive("2026-11-08", OUT), { state: "VALID", total: 49, outdoor: 23, housed: 26, housedFrom: "2026-11-08", phases: [`OUTDOORS:${TODAY}..2026-11-08=23`, `HOUSED:2026-11-08..${SALE}=26`] }],
    ["housing the day before sale", derive("2026-12-03", OUT), { state: "VALID", total: 49, outdoor: 48, housed: 1, housedFrom: "2026-12-03", phases: [`OUTDOORS:${TODAY}..2026-12-03=48`, `HOUSED:2026-12-03..${SALE}=1`] }],
    ["housing date equals sale date", derive(SALE, OUT), { state: "INVALID", issues: ["HOUSING_DATE_AFTER_SALE_DATE"] }],
    ["housing after sale", derive("2026-12-20", OUT), { state: "INVALID", issues: ["HOUSING_DATE_AFTER_SALE_DATE"] }],
    ["housing before today", derive("2026-10-15", OUT), { state: "INVALID", issues: ["HOUSING_DATE_BEFORE_TODAY"] }],
    ["already housed at start (a planned date isn't used)", derive("2026-11-08", IN), { state: "VALID", total: 49, outdoor: 0, housed: 49, housedFrom: TODAY, phases: [`HOUSED:${TODAY}..${SALE}=49`] }],
    ["known outdoors, no housing planned", derive(null, OUT), { state: "VALID", total: 49, outdoor: 49, housed: 0, housedFrom: null, phases: [`OUTDOORS:${TODAY}..${SALE}=49`] }],
    ["unknown housing, no assumption", derive("2026-11-08", UNKNOWN), { state: "VALID", total: 49, split: "UNKNOWN" }],
    ["unknown housing, no assumption, no date", derive(null, UNKNOWN), { state: "VALID", total: 49, split: "UNKNOWN" }],
    ["unknown housing, assumed outdoors", derive("2026-11-08", UNKNOWN, "OUTDOORS"), { state: "VALID", total: 49, outdoor: 23, housed: 26, housedFrom: "2026-11-08", phases: [`OUTDOORS:${TODAY}..2026-11-08=23`, `HOUSED:2026-11-08..${SALE}=26`] }],
    ["unknown housing, assumed housed", derive("2026-11-08", UNKNOWN, "HOUSED"), { state: "VALID", total: 49, outdoor: 0, housed: 49, housedFrom: TODAY, phases: [`HOUSED:${TODAY}..${SALE}=49`] }],
    ["unknown housing still checks the date order", derive("2026-12-20", UNKNOWN), { state: "INVALID", issues: ["HOUSING_DATE_AFTER_SALE_DATE"] }],
    ["sale not after today", derive(null, OUT, null, TODAY), { state: "INVALID", issues: ["SALE_DATE_NOT_AFTER_TODAY"] }],
    ["sale before today", derive(null, OUT, null, "2026-10-01"), { state: "INVALID", issues: ["SALE_DATE_NOT_AFTER_TODAY"] }],
    ["unreadable sale date", derive(null, OUT, null, "2026-02-30"), { state: "INVALID", issues: ["SALE_DATE_INVALID"] }],
    ["unreadable housing date", derive("2026-13-01", OUT), { state: "INVALID", issues: ["HOUSING_DATE_INVALID"] }],
  ];
  it.each(cases)("%s", (_, result, expected) => {
    expect(shape(result)).toEqual(expected);
  });

  it("phases tile the interval exactly: housed + outdoor = total, contiguous, no empty phase", () => {
    for (const [, r] of cases) {
      if (r.state !== "VALID" || r.split.state !== "KNOWN") continue;
      expect(r.split.housedDays + r.split.outdoorDays).toBe(r.totalDays);
      expect(r.split.phases[0].from).toBe(r.start);
      expect(r.split.phases.at(-1)!.to).toBe(r.sale);
      for (let i = 1; i < r.split.phases.length; i++) expect(r.split.phases[i].from).toBe(r.split.phases[i - 1].to);
      expect(r.split.phases.every((p) => p.days > 0)).toBe(true);
    }
  });

  it("an assumption is used only when the observed state is unknown, and never changes the observed state", () => {
    const r = derive(null, IN, "OUTDOORS");
    expect(r.housing).toEqual({ observed: IN, basis: "OBSERVED", assumption: null, housedNow: true });
    const a = derive(null, UNKNOWN, "OUTDOORS");
    expect(a.housing).toEqual({ observed: UNKNOWN, basis: "ASSUMED", assumption: "OUTDOORS", housedNow: false });
  });
});

describe("plan economics read the canonical intervals (F012)", () => {
  const costs = summariseAnimalCosts([], "a", TODAY);
  const valuation = valueAnimalAtMart({ state: "UNAVAILABLE", provider: null, reason: "TEST" } as never, { animalId: "a", martId: "m", liveweightKg: 500, sex: null, breedLabel: null, ageMonths: null, asOfDate: TODAY }, 14);
  const economics = (housingDate: string | null, observed: HousingObservation, assumption: HousingAssumption | null = null) =>
    computeAnimalPlanEconomics({
      asOfDate: TODAY,
      assumptions: { saleDate: SALE, concentrateKgPerDay: "4", concentratePricePerTonne: "350", forageCostPerDay: "1.10", housingDate, housingCostPerDay: "0.55", scenario: "BASE", assumedCurrentHousing: assumption },
      currentHousing: observed,
      currentWeight: { state: "KNOWN", kg: 500 },
      projection: { state: "PROJECTED", kg: 550 },
      costs,
      valuation,
    });

  it("housing today: 49 housed days and €26.95 — the same intervals the timeline draws", () => {
    const e = economics(TODAY, OUT);
    expect([e.remainingDays, e.housedDays, e.outdoorDays]).toEqual([49, 49, 0]);
    expect(e.forecastHousingCost).toEqual({ state: "KNOWN", amount: "26.95" });
    expect(e.intervals).toEqual(derive(TODAY, OUT));
  });

  it("every day count in the economics equals the canonical split, across the matrix", () => {
    for (const [date, obs, assumption] of [[TODAY, OUT, null], ["2026-10-17", OUT, null], ["2026-11-08", OUT, null], [null, OUT, null], ["2026-11-08", IN, null], ["2026-11-08", UNKNOWN, null], ["2026-11-08", UNKNOWN, "OUTDOORS"], ["2026-11-08", UNKNOWN, "HOUSED"], [SALE, OUT, null]] as const) {
      const e = economics(date, obs, assumption);
      const r = derive(date, obs, assumption);
      expect(e.intervals).toEqual(r);
      const split = r.state === "VALID" && r.split.state === "KNOWN" ? r.split : null;
      expect([e.housedDays, e.outdoorDays]).toEqual(split ? [split.housedDays, split.outdoorDays] : [null, null]);
      expect(e.remainingDays).toBe(r.state === "VALID" ? r.totalDays : null);
    }
  });

  it("current weight unknown keeps its own reason (never one generic 'unknown')", () => {
    for (const reason of ["NOT_WEIGHED", "WEIGHTS_DISAGREE", "UNIT_NOT_SUPPORTED", "WEIGHTS_UNAVAILABLE"] as const) {
      const e = computeAnimalPlanEconomics({
        asOfDate: TODAY,
        assumptions: { saleDate: SALE, concentrateKgPerDay: null, concentratePricePerTonne: null, forageCostPerDay: null, housingDate: null, housingCostPerDay: null, scenario: "BASE", assumedCurrentHousing: null },
        currentHousing: OUT,
        currentWeight: { state: "UNKNOWN", reason },
        projection: { state: "PROJECTED", kg: 550 },
        costs,
        valuation,
      });
      expect(e.projectedAdditionalKg).toEqual({ state: "UNKNOWN", reasons: [`CURRENT_WEIGHT_${reason}`] });
    }
  });
});
