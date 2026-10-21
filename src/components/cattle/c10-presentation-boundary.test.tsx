/**
 * Cattle C10 — the presentation-boundary repair (audit 75774: F005 chart,
 * F011 housing-by-location-kind, F013 measurement basis), adversarially and
 * table-driven. Every case runs the real frozen engines (C1 ledger + snapshot,
 * C4 series, C5 performance) over one changed record — the way the audit
 * reproduced each defect — then reads the view-model AND the rendered screen.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/app/(app)/cattle/actions", () => ({ loadCattleAnimal: vi.fn(() => new Promise(() => {})), projectCattleWeight: vi.fn(() => new Promise(() => {})), loadCattleHerd: vi.fn(() => new Promise(() => {})) }));

import {
  MEMBERSHIP_DISPLAY,
  animalRow,
  buildAnimalProfile,
  buildHerd,
  completionBasisLabel,
  housingObservationOf,
  listedItems,
  planScreenView,
  previousWeightLine,
  unseal,
  weightEntryStart,
  type AnimalPlanAssumptions,
  type CattleOutputs,
  type PlanRowVM,
  type WeightChartVM,
} from "@/domain/cattle/presentation";
import type { AnimalLocationKind } from "@/domain/cattle/animal-ledger";
import { outputsWithLocation, outputsWithWeights, weightObs } from "@/server/cattle-demo/c10-engine-fixtures";
import { animalIdOf } from "@/server/cattle-demo/demo-herd";
import { replayCattleDemo } from "@/server/cattle-demo/demo-replay";
import { DEMO_DIRECTORY, animalViewFrom, demoAnimalView, demoProjection } from "@/server/cattle-demo/demo-service";
import type { CattleDemoSession } from "./session/demo-session";
import { CattleDemoSessionProvider } from "./session/CattleDemoSessionProvider";
import { AnimalPlanScreen } from "./AnimalPlanScreen";
import { AnimalProfileScreen } from "./AnimalProfileScreen";
import { PerformanceChart } from "./PerformanceChart";
import { RecordWeightSheet } from "./RecordWeightSheet";

const EMPTY: CattleDemoSession = { version: 1, events: [] };
afterEach(() => cleanup());

/** The animal's real cost read (C10 cost ledger over the demonstration entries). */
const costsOf = (tag: string) => unseal(demoAnimalView(EMPTY, tag)!.plan.inputs).costs;
const viewOf = (o: CattleOutputs, tag: string) => animalViewFrom(o, animalIdOf(tag), costsOf(tag));
const textOf = (ui: React.ReactElement) => {
  const { container, unmount } = render(<CattleDemoSessionProvider>{ui}</CattleDemoSessionProvider>);
  const t = container.textContent ?? "";
  unmount();
  return t;
};
const NO_WEIGHTS = /No weights recorded/;

// ---------------------------------------------------------------------------
describe("F005 — the weight chart's four states are decided before the component", { timeout: 120_000 }, () => {
  const T = "1445";
  const cases: { name: string; outputs: () => CattleOutputs; state: WeightChartVM["state"]; required: RegExp[] }[] = [
    { name: "plottable weights", outputs: () => structuredClone(replayCattleDemo(EMPTY, { animalIds: [animalIdOf(T)] })) as CattleOutputs, state: "CHART", required: [/Weighed/] },
    { name: "genuinely no weight records (C4 + C5 agree)", outputs: () => outputsWithWeights(T, []), state: "EMPTY", required: [NO_WEIGHTS] },
    { name: "an unsupported unit only (the audit's POUND record)", outputs: () => outputsWithWeights(T, [weightObs(1, T, "2026-10-01T09:00:00Z", 1150, { unit: "POUND" })]), state: "NOT_CHARTABLE", required: [/Weight history can't be charted yet/, /can't currently convert to kilograms/, /Unit not supported/, /1 Oct 2026/] },
    {
      name: "conflicting unsupported readings at one instant",
      outputs: () => outputsWithWeights(T, [weightObs(1, T, "2026-10-01T09:00:00Z", 1150, { unit: "POUND" }), weightObs(2, T, "2026-10-01T09:00:00Z", 1180, { unit: "POUND" })]),
      state: "NOT_CHARTABLE",
      required: [/Weight history can't be charted yet/, /Weights disagree/],
    },
    { name: "conflicting kilogram readings (both candidates drawn, never averaged)", outputs: () => outputsWithWeights(T, [weightObs(1, T, "2026-10-01T09:00:00Z", 498), weightObs(2, T, "2026-10-01T09:00:00Z", 512)]), state: "CHART", required: [/Weights disagree/, /498 kg or 512 kg/] },
    {
      name: "plottable and unsupported mixed (the unsupported one is named, not dropped)",
      outputs: () => outputsWithWeights(T, [weightObs(1, T, "2026-09-01T09:00:00Z", 480), weightObs(2, T, "2026-10-01T09:00:00Z", 1150, { unit: "POUND" })]),
      state: "CHART",
      required: [/1 record isn't charted — in a weight unit Farm Return can't currently convert to kilograms/],
    },
    {
      name: "C4 evaluation failed",
      outputs: () => {
        const o = structuredClone(replayCattleDemo(EMPTY, { animalIds: [animalIdOf(T)] })) as CattleOutputs;
        o.weights = null;
        return o;
      },
      state: "UNAVAILABLE",
      required: [/Weight history couldn't be read/],
    },
    {
      name: "C5 evaluation failed",
      outputs: () => {
        const o = structuredClone(replayCattleDemo(EMPTY, { animalIds: [animalIdOf(T)] })) as CattleOutputs;
        o.performance = null;
        return o;
      },
      state: "UNAVAILABLE",
      required: [/Weight history couldn't be read/],
    },
  ];

  it.each(cases)("$name → $state", ({ outputs, state, required }) => {
    const profile = buildAnimalProfile(outputs(), animalIdOf(T), DEMO_DIRECTORY, costsOf(T));
    expect(profile.chart.state).toBe(state);
    const text = textOf(<PerformanceChart chart={profile.chart} />);
    for (const re of required) expect(text).toMatch(re);
    // Only a known-empty chart ever says there are no weights.
    if (state !== "EMPTY") expect(text).not.toMatch(NO_WEIGHTS);
  });

  it("NOT_CHARTABLE always lists the records it can't draw (their existence is never hidden)", () => {
    const profile = buildAnimalProfile(outputsWithWeights(T, [weightObs(1, T, "2026-10-01T09:00:00Z", 1150, { unit: "POUND" })]), animalIdOf(T), DEMO_DIRECTORY, costsOf(T));
    if (profile.chart.state !== "NOT_CHARTABLE") throw new Error(profile.chart.state);
    expect(profile.chart.points.map((p) => [p.kind, p.plot.kind])).toEqual([["UNSUPPORTED", "NOT_PLOTTED"]]);
    render(<PerformanceChart chart={profile.chart} />);
    expect(screen.getByRole("list", { name: "Weight records" })).toHaveTextContent(/Scale.*Unit not supported/);
  });

  it("the rendered profile of the audit's case: the chart and the plan never say 'no weights'", () => {
    const view = viewOf(outputsWithWeights(T, [weightObs(1, T, "2026-10-01T09:00:00Z", 1150, { unit: "POUND" })]), T);
    const text = textOf(<AnimalProfileScreen initial={view} tag={T} scenario="STANDARD" />);
    expect(text).toMatch(/Weight history can't be charted yet/);
    expect(text).not.toMatch(NO_WEIGHTS);
    expect(text).not.toMatch(/Not weighed yet/);
    expect(view.profile.weight.state).toBe("UNSUPPORTED");
  });
});

// ---------------------------------------------------------------------------
describe("F011 — housing comes from the location KIND only (authorised mapping)", { timeout: 120_000 }, () => {
  const T = "1433"; // no location recorded in the standard herd
  const KINDS: [AnimalLocationKind | null, ReturnType<typeof housingObservationOf>][] = [
    ["HOUSING", { state: "KNOWN", housed: true }],
    ["FIELD", { state: "KNOWN", housed: false }],
    ["HOLDING", { state: "UNKNOWN", reason: "LOCATION_NOT_SPECIFIC" }],
    ["EXTERNAL", { state: "UNKNOWN", reason: "LOCATION_NOT_SPECIFIC" }],
    ["OTHER", { state: "UNKNOWN", reason: "LOCATION_NOT_SPECIFIC" }],
    [null, { state: "UNKNOWN", reason: "NOT_RECORDED" }],
  ];

  const saleDate = "2026-12-04";
  const projection = demoProjection(EMPTY, T, saleDate);
  const plan = (o: CattleOutputs, assumed: AnimalPlanAssumptions["assumedCurrentHousing"] = null) => {
    const view = viewOf(o, T);
    const assumptions = { ...view.plan.defaults, saleDate, assumedCurrentHousing: assumed, housingDate: view.plan.defaults.housingDate };
    return { view, vm: planScreenView({ inputs: view.plan.inputs, assumptions, martId: view.plan.defaultMartId, projection, profile: view.profile }) };
  };
  const rowOf = (rows: readonly PlanRowVM[], key: string) => rows.find((r) => r.key === key)!;

  it.each(KINDS)("%s → %j (through C1 ledger + snapshot)", (kind, expected) => {
    const o = outputsWithLocation(T, kind);
    const p = buildAnimalProfile(o, animalIdOf(T), DEMO_DIRECTORY, costsOf(T));
    expect(p.identity.location.housing).toEqual(expected);
    expect(p.identity.location.housingNote).toBe(kind === "HOUSING" ? "(housed)" : null);
  });

  it.each(KINDS)("%s: the plan's housing-dependent economics follow the observation", (kind, expected) => {
    const { view, vm } = plan(outputsWithLocation(T, kind));
    const housingRow = rowOf(vm.rows, "forecastHousingCost");
    const profitRow = rowOf(vm.rows, "projectedDirectProfit");
    expect(unseal(view.plan.inputs).currentHousing).toEqual(expected);
    if (expected.state === "KNOWN") {
      expect(housingRow.value.state).toBe("KNOWN");
      expect(housingRow.assumed).toBe(false);
      expect(vm.housing.note).toBeNull();
      expect(vm.housing.assumptionControl).toBe(false);
    } else {
      // Unknown housing blocks every housing-dependent figure — never "outdoors", never €0, never a known profit.
      expect(housingRow.value).toMatchObject({ state: "UNKNOWN", text: expect.stringMatching(/current housing status isn't known/) });
      expect(profitRow.value.state).toBe("UNKNOWN");
      expect(vm.housing.assumptionControl).toBe(true);
      expect(vm.housing.note).toMatch(/^Can't calculate housing costs yet/);
      if (expected.reason === "LOCATION_NOT_SPECIFIC") expect(vm.housing.note).toMatch(/isn't shown by its recorded location/);
    }
  });

  it("conflicting, unreadable and unavailable location records are UNKNOWN with their own reason", () => {
    expect(housingObservationOf({ state: "CONFLICTING_EVIDENCE", value: null } as never)).toEqual({ state: "UNKNOWN", reason: "RECORDS_DISAGREE" });
    expect(housingObservationOf({ state: "INVALID_EVIDENCE", value: null } as never)).toEqual({ state: "UNKNOWN", reason: "RECORD_INVALID" });
    expect(housingObservationOf(undefined)).toEqual({ state: "UNKNOWN", reason: "RECORD_UNAVAILABLE" });
    // An unlisted kind (not in the frozen enumeration) is never guessed as housed or outdoors.
    expect(housingObservationOf({ state: "KNOWN", value: { kind: "BARN", ref: "x" } } as never)).toEqual({ state: "UNKNOWN", reason: "RECORD_INVALID" });
  });

  it.each(["HOLDING", "EXTERNAL", "OTHER"] as const)("%s + an explicit assumption: a marked scenario; the record is unchanged; removing it blocks again", (kind) => {
    const o = outputsWithLocation(T, kind);
    for (const assumption of ["HOUSED", "OUTDOORS"] as const) {
      const { view, vm } = plan(o, assumption);
      const housingRow = rowOf(vm.rows, "forecastHousingCost");
      expect(housingRow.value.state).toBe("KNOWN");
      expect(housingRow.assumed).toBe(true);
      expect(rowOf(vm.rows, "projectedDirectProfit").assumed).toBe(true);
      expect(vm.housing.note).toMatch(/use your assumption — the record isn't changed/);
      expect(unseal(view.plan.inputs).currentHousing).toEqual({ state: "UNKNOWN", reason: "LOCATION_NOT_SPECIFIC" });
      expect(view.profile.identity.location.housing).toEqual({ state: "UNKNOWN", reason: "LOCATION_NOT_SPECIFIC" });
      if (assumption === "HOUSED") expect(vm.housing.now).toMatchObject({ state: "HOUSED_NOW", text: "Assumed housed now, so housing costs run every day to sale." });
    }
    expect(rowOf(plan(o, null).vm.rows, "forecastHousingCost").value.state).toBe("UNKNOWN");
  });

  it("the rendered plan for a HOLDING location asks for an assumption and shows no assumption mark until one is made", () => {
    const view = viewOf(outputsWithLocation(T, "HOLDING"), T);
    const text = textOf(<AnimalPlanScreen initial={view} tag={T} scenario="STANDARD" />);
    expect(text).toMatch(/isn't shown by its recorded location/);
    expect(text).toMatch(/Assume for this plan/);
    expect(text).not.toMatch(/Assumed housing/);
    expect(text).not.toMatch(/Recorded as housed now/);
  });
});

// ---------------------------------------------------------------------------
describe("F013 — measurement basis survives the boundary ('Weighed' only for a measured weight)", { timeout: 120_000 }, () => {
  const T = "1445";
  const METHODS: [string, "MEASURED" | "ESTIMATED" | "DERIVED" | "UNKNOWN", string, string][] = [
    ["SCALE", "MEASURED", "Weighed 1 Oct", "Weighed 500 kg"],
    ["WEIGHBRIDGE", "MEASURED", "Weighed 1 Oct", "Weighed 500 kg"],
    ["ESTIMATE_TAPE", "ESTIMATED", "Tape estimate · 1 Oct", "Tape estimate 500 kg"],
    ["ESTIMATE_VISUAL", "ESTIMATED", "Visual estimate · 1 Oct", "Visual estimate 500 kg"],
    ["DERIVED_EXTERNAL", "DERIVED", "External figure · 1 Oct", "External figure 500 kg"],
    ["UNKNOWN", "UNKNOWN", "Method not recorded · 1 Oct", "Weight 500 kg (method not recorded)"],
  ];
  const outputsFor = (method: string) => outputsWithWeights(T, [weightObs(1, T, "2026-09-01T09:00:00Z", 470), weightObs(2, T, "2026-10-01T09:00:00Z", 500, { method })]);

  it.each(METHODS)("%s → %s: caption, sheet line, herd row, timeline and chart agree", (method, basis, caption, timelineTitle) => {
    const o = outputsFor(method);
    const id = animalIdOf(T);
    const p = buildAnimalProfile(o, id, DEMO_DIRECTORY, costsOf(T));
    expect(p.weight).toMatchObject({ state: "KNOWN", kg: 500, basis: { kind: basis } });
    expect(p.metrics.weight.caption).toBe(caption);
    const measured = basis === "MEASURED";
    expect(p.weight.display.label === "Weighed").toBe(measured);
    expect(previousWeightLine(p.weight).text).toBe(measured ? "Last recorded 500 kg on 1 Oct." : `Last recorded 500 kg on 1 Oct (${caption.split(" · ")[0].toLowerCase()}).`);
    const row = animalRow(o, id, DEMO_DIRECTORY, MEMBERSHIP_DISPLAY.MEMBER);
    expect(row.weightDate).toBe(measured ? "1 Oct" : `1 Oct · ${caption.split(" · ")[0].toLowerCase()}`);
    const entry = listedItems(p.timeline).find((e) => e.id === `weight:SYNTH-W-FIXTURE-${T}-2`)!;
    expect(entry.title).toBe(timelineTitle);
    if (p.chart.state !== "CHART") throw new Error(p.chart.state);
    const point = p.chart.points.find((x) => x.recordIds.includes(`SYNTH-W-FIXTURE-${T}-2`))!;
    expect(point.stateLabel === "Weighed").toBe(measured);
    expect(point.style).toBe(measured ? "MEASURED" : "NOT_MEASURED");
  });

  it.each(METHODS.filter(([, b]) => b !== "MEASURED"))("%s: the rendered profile never calls the estimate a weighing", (method, _b, caption) => {
    const view = viewOf(outputsFor(method), T);
    const text = textOf(<AnimalProfileScreen initial={view} tag={T} scenario="STANDARD" />);
    expect(text).toContain(caption);
    expect(text).not.toMatch(/Weighed 1 Oct/);
    expect(text).not.toMatch(/Weighed 500 kg/);
  });

  it("an estimate in the plan and in the mart estimate is named as an estimate", () => {
    const view = viewOf(outputsFor("ESTIMATE_TAPE"), T);
    const vm = planScreenView({ inputs: view.plan.inputs, assumptions: view.plan.defaults, martId: view.plan.defaultMartId, projection: undefined, profile: view.profile });
    expect(vm.currentWeightNote).toBe("Current weight 500 kg is a tape estimate (1 Oct), not a weighing — figures that use it rest on that.");
    if (vm.market.state === "ESTIMATED") expect(vm.market.weightBasisNote).toMatch(/tape estimate — not a weighing/);
    const measured = viewOf(outputsFor("SCALE"), T);
    expect(planScreenView({ inputs: measured.plan.inputs, assumptions: measured.plan.defaults, martId: measured.plan.defaultMartId, projection: undefined, profile: measured.profile }).currentWeightNote).toBeNull();
  });

  it("the record sheet starts from the exact estimate and says it was one", () => {
    const o = outputsWithWeights(T, [weightObs(1, T, "2026-10-01T09:00:00Z", 548.24, { method: "ESTIMATE_TAPE" })]);
    const w = buildAnimalProfile(o, animalIdOf(T), DEMO_DIRECTORY, costsOf(T)).weight;
    expect(weightEntryStart(w)).toEqual({ initialText: "548.24", stepFrom: "548.24" });
    render(<RecordWeightSheet open onClose={() => {}} onSave={() => null} tag={T} previous={w} asOfDate="2026-10-16" />);
    expect(screen.getByLabelText("Scale reading")).toHaveValue("548.24");
    expect(screen.getByText("Last recorded 548.24 kg on 1 Oct (tape estimate).")).toBeInTheDocument();
  });

  it("unsupported, conflicting and absent latest weights carry no basis and never read 'Weighed'", () => {
    const states = [
      outputsWithWeights(T, [weightObs(1, T, "2026-10-01T09:00:00Z", 1150, { unit: "POUND" })]),
      outputsWithWeights(T, [weightObs(1, T, "2026-10-01T09:00:00Z", 498), weightObs(2, T, "2026-10-01T09:00:00Z", 512)]),
      outputsWithWeights(T, []),
    ].map((o) => buildAnimalProfile(o, animalIdOf(T), DEMO_DIRECTORY, costsOf(T)));
    expect(states.map((p) => p.weight.state)).toEqual(["UNSUPPORTED", "CONFLICT", "NONE"]);
    for (const p of states) {
      expect(p.weight).not.toHaveProperty("basis");
      expect(p.weight.display.label).not.toMatch(/Weighed/);
      expect(p.metrics.weight.caption ?? "").not.toMatch(/Weighed/);
    }
  });
});

// ---------------------------------------------------------------------------
describe("provenance sweep — distinctions the owners make stay distinct on screen", { timeout: 120_000 }, () => {
  it("no open work is neutral, never a green 'all good'", () => {
    const o = structuredClone(replayCattleDemo(EMPTY)) as CattleOutputs;
    o.jobs = [];
    for (const g of listedItems(buildHerd(o, DEMO_DIRECTORY).groups)) {
      if (g.workCounts.state !== "EMPTY") throw new Error(g.workCounts.state);
      expect(g.workCounts.display.tone).not.toBe("good");
    }
    const p = buildAnimalProfile(o, animalIdOf("1427"), DEMO_DIRECTORY, costsOf("1427"));
    expect(p.work.open).toMatchObject({ state: "EMPTY", display: { tone: "neutral" } });
  });

  it("a recommended window is never a hard deadline; a completion keeps its basis (records vs override)", () => {
    const p = demoAnimalView(EMPTY, "1452")!.profile;
    if (p.work.open.state !== "ITEMS") throw new Error(p.work.open.state);
    expect(p.work.open.primary.window.state).toBe("RECOMMENDED");
    expect(p.work.open.primary.hardDeadline.state).toBe("NONE");
    const text = textOf(<AnimalProfileScreen initial={demoAnimalView(EMPTY, "1452")!} tag="1452" scenario="STANDARD" />);
    expect(text).toMatch(/Recommended window/);
    expect(text).not.toMatch(/Must be done by/);
  });

  it("a farmer override stays an override in the work panel and the timeline (never plain 'done' or 'by your records')", () => {
    expect([completionBasisLabel("CANONICAL_EVIDENCE"), completionBasisLabel("FARMER_OVERRIDE"), completionBasisLabel("FARMER")]).toEqual(["Closed by your records", "Marked done (override)", "Marked done"]);
  });

  it("the fixture mart is never shown as live, and direct vs allocated costs stay separate", () => {
    const view = demoAnimalView(EMPTY, "1427")!;
    const vm = planScreenView({ inputs: view.plan.inputs, assumptions: view.plan.defaults, martId: view.plan.defaultMartId, projection: undefined, profile: view.profile });
    if (vm.market.state !== "ESTIMATED") throw new Error(vm.market.state);
    expect(vm.market.status).toBe("Development fixture — not live, not a real mart report");
    expect(vm.headline.footnote).toMatch(/^Based on development fixture prices — not a market quote\./);
    const costs = view.profile.costs;
    if (costs.state !== "RECORDED") throw new Error(costs.state);
    expect(costs.direct).not.toBe(costs.allocated);
    expect(costs.categories.find((c) => c.category === "FEED")?.amount).toMatchObject({ state: "KNOWN", allAllocated: true });
  });

  it("projected weight is a prediction, drawn and labelled apart from weighings", () => {
    const p = demoAnimalView(EMPTY, "1427")!.profile;
    if (p.chart.state !== "CHART") throw new Error(p.chart.state);
    expect(p.chart.projection.state).toBe("SHOWN");
    expect(p.chart.legend.map((l) => l.label)).toContain("Projected (prediction)");
    expect(p.chart.points.every((x) => x.stateLabel !== "Projected")).toBe(true);
  });
});
