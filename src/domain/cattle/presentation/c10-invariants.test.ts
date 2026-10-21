import { describe, expect, it } from "vitest";
import { derivePlanIntervals, summariseAnimalCosts, type AnimalCostEntry, type HousingObservation } from "../../animal-plan";
import { costView } from "./cost-view";
import { currentWeightInput, latestWeightOf, previousWeightLine, type LatestWeightVM } from "./animal-profile";
import { canonicalNumberText, stepDecimalText } from "./numeric-input";
import { planTimeline } from "./plan-timeline";

// The three C10 invariants, at the presentation boundary (DOMAIN_CONTRACTS.md, "Cattle C10").

/** Wording that claims known absence. An unknown / unavailable / conflicting value must never produce it. */
const FALSE_EMPTY = [/\bno (earlier|previous) weight\b/i, /\bnone\b/i, /\bnot recorded\b/i, /\bnot weighed\b/i, /€0\b/, /\bno costs?\b/i, /\bnothing\b/i, /^0\b/];

const series = (latest: { state: string; kg?: number | null; observedAt?: string | null; candidateKg?: number[] }) => ({
  latest: { kg: null, observedAt: null, candidateKg: [], ...latest },
});

describe("invariant A — the latest weight crosses the boundary explicitly", () => {
  const cases: [string, ReturnType<typeof series> | null, LatestWeightVM["state"], string, string][] = [
    ["known", series({ state: "KNOWN", kg: 548.24, observedAt: "2026-10-16T09:00:00Z" }), "KNOWN", "Last recorded 548.24 kg on 16 Oct.", "KNOWN"],
    ["known none", series({ state: "NONE" }), "NONE", "No earlier weight recorded.", "NOT_WEIGHED"],
    ["conflict", series({ state: "EVIDENCE_CONFLICT", observedAt: "2026-10-10T09:00:00Z", candidateKg: [498, 512] }), "CONFLICT", "Previous weight couldn't be determined — records disagree (498 kg or 512 kg).", "WEIGHTS_DISAGREE"],
    ["unsupported unit", series({ state: "UNSUPPORTED", observedAt: "2026-10-10T09:00:00Z" }), "UNSUPPORTED", "Previous weight couldn't be used — it's in a unit that can't be converted to kilograms.", "UNIT_NOT_SUPPORTED"],
    ["evaluation unavailable (no series)", null, "UNAVAILABLE", "Previous weight couldn't be checked.", "WEIGHTS_UNAVAILABLE"],
    ["KNOWN without a value is not a weight", series({ state: "KNOWN", kg: null, observedAt: null }), "UNAVAILABLE", "Previous weight couldn't be checked.", "WEIGHTS_UNAVAILABLE"],
  ];
  it.each(cases)("%s", (_, s, state, line, plan) => {
    const w = latestWeightOf(s);
    expect(w.state).toBe(state);
    expect(previousWeightLine(w).text).toBe(line);
    const input = currentWeightInput(w);
    expect(input.state === "KNOWN" ? "KNOWN" : input.reason).toBe(plan);
  });

  it("only C4's confirmed NONE produces absence wording; every unresolved state avoids all false-empty phrases", () => {
    for (const [, s, state] of cases) {
      const text = previousWeightLine(latestWeightOf(s)).text;
      if (state === "NONE" || state === "KNOWN") continue;
      for (const re of FALSE_EMPTY) expect(text, `${state}: ${re}`).not.toMatch(re);
    }
  });

  it("a conflict is never averaged or picked: both readings are shown, no single kg exists", () => {
    const w = latestWeightOf(series({ state: "EVIDENCE_CONFLICT", candidateKg: [498, 512] }));
    expect(w).not.toHaveProperty("kg");
    expect(previousWeightLine(w).text).not.toMatch(/505/);
  });
});

describe("invariant A — cost reading is explicit and central", () => {
  const entry = (o: Partial<AnimalCostEntry> = {}): AnimalCostEntry => ({ entryId: "c1", animalId: "a", category: "FEED", amount: "42.50", currency: "EUR", effectiveDate: "2026-10-01", source: { kind: "DEMONSTRATION_FIXTURE", ref: null }, attribution: "DIRECT", allocationBasis: null, note: null, ...o });
  it.each([
    ["unavailable", { state: "UNAVAILABLE", reason: "X" } as const, "UNAVAILABLE"],
    ["known none", summariseAnimalCosts([], "a", "2026-10-16"), "NONE_RECORDED"],
    ["invalid entry", summariseAnimalCosts([entry({ amount: "-1" })], "a", "2026-10-16"), "UNREADABLE"],
    ["mixed currency", summariseAnimalCosts([entry(), entry({ entryId: "c2", currency: "GBP" })], "a", "2026-10-16"), "UNREADABLE"],
    ["not euro", summariseAnimalCosts([entry({ currency: "GBP" })], "a", "2026-10-16"), "NOT_IN_EURO"],
    ["recorded", summariseAnimalCosts([entry()], "a", "2026-10-16"), "RECORDED"],
  ])("%s", (_, read, state) => {
    const v = costView(read, 500);
    expect(v.state).toBe(state);
    if (v.state !== "RECORDED" && v.state !== "NONE_RECORDED") for (const re of [/(?<!not )€0\b/, /(?<!not ")\bnone recorded\b/i, /\bno (direct )?costs\b/i]) expect(v.text).not.toMatch(re);
  });

  it("a recorded view carries exact totals (no fallback) and per-kg only for a known weight", () => {
    const v = costView(summariseAnimalCosts([entry({ amount: "42.505" }), entry({ entryId: "c2", amount: "0.0001", category: "OTHER", attribution: "ALLOCATED", allocationBasis: "1/40" })], "a", "2026-10-16"), null);
    expect(v).toMatchObject({ state: "RECORDED", total: "42.5051", direct: "42.505", allocated: "0.0001", perKgLiveweight: null });
  });
});

describe("invariant B — editing never reduces precision", () => {
  const step = (t: string, d: string, min = "1") => stepDecimalText(t, d, { min });
  it.each([
    ["548.24", "5", "553.24"],
    ["548.24", "-5", "543.24"],
    ["412.5", "5", "417.5"],
    ["0.1", "0.2", "0.3"],
    ["1.10", "0.1", "1.2"],
    ["0.55", "0.05", "0.6"],
    ["0.375", "0.05", "0.425"],
    ["340", "10", "350"],
    ["3.6215", "0.0001", "3.6216"],
  ])("%s %s → %s", (from, d, to) => {
    expect(step(from, d, "0")).toBe(to);
  });

  it("repeated +5 / −5 returns exactly to the start", () => {
    for (const start of ["548.24", "412.5", "0.375", "1999.99"]) {
      let t = start;
      for (let i = 0; i < 25; i++) t = step(t, "5", "0");
      for (let i = 0; i < 25; i++) t = step(t, "-5", "0");
      expect(t).toBe(new Number(start).toString());
    }
  });

  it("the canonical text of a weight is exact; clamping keeps the decimals", () => {
    expect(canonicalNumberText(548.24)).toBe("548.24");
    expect(canonicalNumberText(521)).toBe("521");
    expect(step("3.7", "-5")).toBe("1");
    expect(step("", "5", "1")).toBe("6");
    expect(stepDecimalText("", "5", { min: "1", from: "548.24" })).toBe("553.24");
  });
});

describe("invariant C — the timeline is the canonical intervals, worded", () => {
  const OUT: HousingObservation = { state: "KNOWN", housed: false };
  const IN: HousingObservation = { state: "KNOWN", housed: true };
  const UNK: HousingObservation = { state: "UNKNOWN", reason: "NOT_RECORDED" };
  const tl = (housingDate: string | null, observed: HousingObservation, assumption: "OUTDOORS" | "HOUSED" | null = null, saleDate = "2026-12-04") =>
    planTimeline(derivePlanIntervals({ asOfDate: "2026-10-16", saleDate, housingDate, observed, assumption }));
  const summary = (t: ReturnType<typeof tl>) => (t.state === "NONE" ? null : t.summary);

  it.each([
    ["housing starts today", tl("2026-10-16", OUT), "49 days to sale · housed from today (16 Oct), 49 days housed"],
    ["housing tomorrow", tl("2026-10-17", OUT), "49 days to sale · 1 at grass, 48 housed from 17 Oct"],
    ["housing midway", tl("2026-11-08", OUT), "49 days to sale · 23 at grass, 26 housed from 8 Nov"],
    ["housing on the sale date (invalid)", tl("2026-12-04", OUT), null],
    ["housing after sale (invalid)", tl("2026-12-20", OUT), null],
    ["already housed", tl("2026-11-08", IN), "49 days to sale · housed throughout"],
    ["known outdoors, no housing", tl(null, OUT), "49 days to sale · not housed before sale"],
    ["unknown, no assumption", tl("2026-11-08", UNK), "49 days to sale · housing now unknown, so days at grass and housed aren't split"],
    ["unknown, assumed outdoors", tl("2026-11-08", UNK, "OUTDOORS"), "49 days to sale · 23 at grass, 26 housed from 8 Nov (assumed housing)"],
    ["unknown, assumed housed", tl("2026-11-08", UNK, "HOUSED"), "49 days to sale · housed throughout (assumed housing)"],
    ["sale before today (invalid)", tl(null, OUT, null, "2026-10-01"), null],
  ])("%s", (_, t, text) => {
    expect(summary(t)).toBe(text);
  });

  it("housing today is never 'not housed before sale' (F012) and the bar is fully housed", () => {
    const t = tl("2026-10-16", OUT);
    expect(t.state).toBe("SPLIT");
    if (t.state !== "SPLIT") return;
    expect(t.summary).not.toMatch(/not housed/);
    expect(t.segments).toEqual([{ kind: "HOUSED", startPct: 0, widthPct: 100 }]);
    expect(t.housedMarker).toBeNull();
  });

  it("the drawn segments tile the bar exactly in the canonical day proportions", () => {
    const t = tl("2026-11-08", OUT);
    if (t.state !== "SPLIT") throw new Error("expected a split");
    expect(t.segments.map((s) => s.kind)).toEqual(["OUTDOORS", "HOUSED"]);
    expect(t.segments[0].widthPct + t.segments[1].widthPct).toBeCloseTo(100, 10);
    expect(t.segments[1].startPct).toBeCloseTo((23 / 49) * 100, 10);
    expect(t.housedMarker).toEqual({ pct: (23 / 49) * 100, label: "8 Nov" });
  });
});
