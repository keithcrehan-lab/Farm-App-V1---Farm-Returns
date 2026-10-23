/**
 * Cattle C10 — the presentation-boundary repair (audit 75774: F005 chart,
 * F011 housing-by-location-kind, F013 measurement basis), adversarially and
 * table-driven. Every case runs the real frozen engines (C1 ledger + snapshot,
 * C4 series, C5 performance) over one changed record — the way the audit
 * reproduced each defect — then reads the view-model AND the rendered screen.
 *
 * Audit 97274: F005 an unresolved goal target weight, F013 a derived weight's
 * timeline badge, F014 a zero projected weight in the plan. Claude audit
 * 2026-10-22-1 (the last block): CL-001 – CL-004.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/app/(app)/cattle/actions", () => ({ loadCattleAnimal: vi.fn(() => new Promise(() => {})), projectCattleWeight: vi.fn(() => new Promise(() => {})), loadCattleHerd: vi.fn(() => new Promise(() => {})) }));

import {
  MEMBERSHIP_DISPLAY,
  PROGRAMME_DISPLAY,
  animalRow,
  buildAnimalProfile,
  buildHerd,
  completionBasisLabel,
  formatDate,
  formatProjectedKg,
  housingObservationOf,
  listedItems,
  planSaveIntent,
  planScreenView,
  planTargetText,
  previousWeightLine,
  unseal,
  weightEntryStart,
  type AnimalPlanAssumptions,
  type CattleOutputs,
  type PlanRowVM,
  type WeightChartVM,
} from "@/domain/cattle/presentation";
import type { AnimalLocationKind } from "@/domain/cattle/animal-ledger";
import { addDays, admitProjectedWeight, computeAnimalPlanEconomics } from "@/domain/animal-plan";
import { outputsWithGoal, outputsWithGoalRecords, outputsWithGoals, outputsWithLocation, outputsWithWeights, weightObs } from "@/server/cattle-demo/c10-engine-fixtures";
import { animalIdOf, goalDeclaration, goalIdOf } from "@/server/cattle-demo/demo-herd";
import { replayCattleDemo } from "@/server/cattle-demo/demo-replay";
import { DEMO_DIRECTORY, animalViewFrom, demoAnimalView, demoProjection } from "@/server/cattle-demo/demo-service";
import type { CattleDemoSession } from "./session/demo-session";
import { CattleDemoSessionProvider } from "./session/CattleDemoSessionProvider";
import { AnimalPlanScreen } from "./AnimalPlanScreen";
import { AnimalProfileScreen } from "./AnimalProfileScreen";
import { TimelineSection } from "./AnimalSections";
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
    // The badge is C4's information class: an external figure is calculated, never an observation (audit 97274 F013).
    expect([entry.infoClass, entry.classLabel]).toEqual(basis === "DERIVED" ? ["DERIVED", "Calculated"] : ["OBSERVATION", "Observation"]);
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

// ---------------------------------------------------------------------------
describe("audit 97274 — goal target, derived-weight badge, zero projection", { timeout: 120_000 }, () => {
  const T = "1433";
  const DATE = "2026-12-04";
  const goalCases: [string, { value: number; unit: "KILOGRAM" | "POUND" } | null, string | null, string, string][] = [
    ["KNOWN (kg)", { value: 620, unit: "KILOGRAM" }, DATE, "Finishing, 620 kg by 4 Dec 2026", "SHOWN"],
    ["UNRESOLVED (lb, no C6 conversion)", { value: 1000, unit: "POUND" }, DATE, "Finishing, target weight 1000 lb recorded (can't be converted to kg) by 4 Dec 2026", "UNRESOLVED"],
    ["NOT_SET", null, DATE, "Finishing, no target weight set by 4 Dec 2026", "NOT_SHOWN"],
    ["NOT_SET weight and date", null, null, "Finishing, no target weight set, no target date set", "NOT_SHOWN"],
  ];

  it.each(goalCases)("F005 %s: the profile goal line, the chart and the plan keep the target's state", (_name, targetWeight, targetDate, line, overlay) => {
    const o = outputsWithGoal(T, { type: "FINISHING", targetWeight, targetDate });
    const view = viewOf(o, T);
    const p = view.profile;
    expect(p.goal.summary).toEqual({ state: "TEXT", text: line });
    if (p.chart.state !== "CHART") throw new Error(p.chart.state);
    expect(p.chart.goalTarget.state).toBe(overlay);
    const text = textOf(<AnimalProfileScreen initial={view} tag={T} scenario="STANDARD" />);
    expect(text).toContain(line);
    if (overlay === "UNRESOLVED") {
      expect(text).toContain("Goal target 1000 lb isn't drawn — it can't be converted to kilograms.");
      // The plan: the goal-weight row is unknown, the box isn't pre-filled, and saving says it replaces the recorded target.
      expect(planSaveIntent(p.goal.read, T).change).toBe("1433's recorded goal target (1000 lb) can't be converted to kg, so it isn't filled in above; saving replaces it with the target weight entered here.");
      const vm = planScreenView({ inputs: view.plan.inputs, assumptions: view.plan.defaults, martId: view.plan.defaultMartId, projection: undefined, profile: p });
      expect([...vm.rows].find((r) => r.key === "goalWeight")?.value).toMatchObject({ state: "UNKNOWN" });
      const plan = textOf(<AnimalPlanScreen initial={view} tag={T} scenario="STANDARD" />);
      expect(plan).toContain("can't be converted to kg, so it isn't filled in above");
    } else {
      expect(planSaveIntent(p.goal.read, T).change).toBeNull();
    }
  });

  it("F005: an unresolved goal target is never rendered like an unset one", () => {
    const lb = textOf(<AnimalProfileScreen initial={viewOf(outputsWithGoal(T, { type: "FINISHING", targetWeight: { value: 1000, unit: "POUND" }, targetDate: DATE }), T)} tag={T} scenario="STANDARD" />);
    const none = textOf(<AnimalProfileScreen initial={viewOf(outputsWithGoal(T, { type: "FINISHING", targetWeight: null, targetDate: DATE }), T)} tag={T} scenario="STANDARD" />);
    expect(lb).not.toContain("no target weight set");
    expect(none).not.toContain("1000 lb");
    expect(lb).not.toMatch(/Goal\s*Finishing by 4 Dec 2026/);
  });

  it("F013: the rendered timeline badges a derived (external) weight 'Calculated', a weighing 'Observation'", () => {
    const o = outputsWithWeights(T, [weightObs(1, T, "2026-09-01T09:00:00Z", 470), weightObs(2, T, "2026-10-01T09:00:00Z", 500, { method: "DERIVED_EXTERNAL" })]);
    const p = buildAnimalProfile(o, animalIdOf(T), DEMO_DIRECTORY, costsOf(T));
    render(<TimelineSection timeline={p.timeline} freshIds={new Set()} gapNote={null} />);
    const derived = screen.getByText("External figure 500 kg").closest("li")!;
    expect(derived.textContent).toContain("Calculated");
    expect(derived.textContent).not.toContain("Observation");
    const weighed = screen.getByText("Weighed 470 kg").closest("li")!;
    expect(weighed.textContent).toContain("Observation");
  });

  it("F014: the auditor's path — C5 projects 0 kg — leaves every per-kg and sale figure unknown, never €Infinity", () => {
    const session: CattleDemoSession = { version: 1, events: [{ kind: "RECORD_WEIGHT", eventId: "f014", tag: "1427", kg: 252.76504613367055, observedDate: null }] };
    const projection = demoProjection(session, "1427", "2027-12-04");
    expect(projection).toMatchObject({ state: "PROJECTED", kg: 0 }); // the frozen C5 output itself is unchanged
    const view = demoAnimalView(session, "1427")!;
    const vm = planScreenView({ inputs: view.plan.inputs, assumptions: { ...view.plan.defaults, saleDate: "2027-12-04" }, martId: view.plan.defaultMartId, projection, profile: view.profile });
    const rows = [...vm.rows];
    for (const key of ["projectedWeightKg", "costPerKgAtSale", "projectedSaleValue", "projectedDirectProfit", "returnFromHolding"]) {
      const cell = rows.find((r) => r.key === key)!.value;
      expect(cell.state, key).toBe("UNKNOWN");
    }
    expect(JSON.stringify(vm)).not.toMatch(/Infinity|NaN/);
    expect(rows.find((r) => r.key === "costPerKgAtSale")!.value).toMatchObject({ state: "UNKNOWN" });
    expect(JSON.stringify(rows.find((r) => r.key === "projectedWeightKg")!.value)).toContain("the projected weight is zero or less");
  });
});

// ---------------------------------------------------------------------------
// Independent Claude audit 2026-10-22-1 (`.agent/campaigns/cattle-engine-v1/audits/claude-audit-20261022-1.md`):
// CL-001 a negative C5 projection shown as known on the profile and chart, CL-002 a lb goal target dropped
// from the timeline, CL-003 only the first of several active goals read, CL-004 a hard deadline worded "by"
// against an exclusive due instant. Each audit reproduction runs through the real frozen engines.
describe("Claude audit 2026-10-22-1 — projection admission, goal reads, deadline wording", { timeout: 120_000 }, () => {
  const planOf = (view: NonNullable<ReturnType<typeof demoAnimalView>>, projection: Parameters<typeof planScreenView>[0]["projection"], saleDate?: string) =>
    planScreenView({ inputs: view.plan.inputs, assumptions: { ...view.plan.defaults, ...(saleDate ? { saleDate } : {}) }, martId: view.plan.defaultMartId, projection, profile: view.profile });
  const cellOf = (rows: readonly PlanRowVM[], key: string) => rows.find((r) => r.key === key)?.value;

  // CL-001 ------------------------------------------------------------------
  it.each([
    ["positive", 609.4, { state: "USABLE", kg: 609.4 }],
    ["smallest positive double", Number.MIN_VALUE, { state: "USABLE", kg: Number.MIN_VALUE }],
    ["zero", 0, { state: "NOT_USABLE", reason: "PROJECTION_NOT_POSITIVE" }],
    ["negative zero", -0, { state: "NOT_USABLE", reason: "PROJECTION_NOT_POSITIVE" }],
    ["negative", -92.98, { state: "NOT_USABLE", reason: "PROJECTION_NOT_POSITIVE" }],
    ["NaN", Number.NaN, { state: "NOT_USABLE", reason: "PROJECTION_INVALID" }],
    ["Infinity", Number.POSITIVE_INFINITY, { state: "NOT_USABLE", reason: "PROJECTION_INVALID" }],
  ] as const)("CL-001 boundary: a C5 projected weight (%s, %s kg) is admitted only when positive and finite", (_name, kg, expected) => {
    expect(admitProjectedWeight(kg, 49)).toEqual(expected);
  });

  it("CL-001: the auditor's path — 5 kg recorded, C5 projects about −93 kg — is no usable projection on the profile, chart and plan alike", () => {
    const session: CattleDemoSession = { version: 1, events: [{ kind: "RECORD_WEIGHT", eventId: "cl001", tag: "1427", kg: 5, observedDate: null }] };
    const projection = demoProjection(session, "1427", "2026-12-04");
    if (projection.state !== "PROJECTED") throw new Error(projection.state);
    expect(projection.kg).toBeLessThan(0); // the frozen C5 output itself is unchanged
    const view = demoAnimalView(session, "1427")!;
    const p = view.profile;
    expect(p.projection.label).toBeNull();
    expect(p.projection.state.code).toBe("PREDICTION:NOT_USABLE");
    if (p.chart.state !== "CHART") throw new Error(p.chart.state);
    expect(p.chart.projection.state).toBe("NOT_USABLE");
    expect(p.chart.legend.map((l) => l.label)).not.toContain("Projected (prediction)");
    const vm = planOf(view, projection);
    for (const key of ["projectedWeightKg", "projectedSaleValue", "costPerKgAtSale", "projectedDirectProfit", "returnFromHolding"]) expect(cellOf(vm.rows, key)?.state, key).toBe("UNKNOWN");
    expect(JSON.stringify(cellOf(vm.rows, "projectedWeightKg"))).toContain("the projected weight is zero or less");
    const text = textOf(<AnimalProfileScreen initial={view} tag="1427" scenario="STANDARD" />);
    expect(text).not.toMatch(/−\d+ kg by|Projected −/);
    expect(text).toContain("No usable projection");
    expect(text).toContain("No projection is drawn — continuing the recent daily gain gives a weight of zero or less");
  });

  it("CL-001: a normal positive projection is the same figure on the profile, the chart and the plan", () => {
    const view = demoAnimalView(EMPTY, "1427")!;
    const p = view.profile;
    if (p.chart.state !== "CHART" || p.chart.projection.state !== "SHOWN") throw new Error("projection not drawn");
    expect(p.projection.state.code).toBe("PREDICTION:PROJECTED");
    expect(p.projection.label).toBe(`${p.chart.projection.label} by ${p.chart.projection.dateLabel}`);
    const projection = demoProjection(EMPTY, "1427", view.plan.defaults.saleDate);
    const vm = planOf(view, projection);
    expect(cellOf(vm.rows, "projectedWeightKg")).toMatchObject({ state: "KNOWN", text: p.chart.projection.label });
  });

  // CL-002 ------------------------------------------------------------------
  const timelineGoals = (o: CattleOutputs, tag: string) => listedOrEmpty(buildAnimalProfile(o, animalIdOf(tag), DEMO_DIRECTORY, costsOf(tag)).timeline).filter((e) => e.id.startsWith("goal:"));
  const listedOrEmpty = (t: ReturnType<typeof buildAnimalProfile>["timeline"]) => (t.state === "ITEMS" ? listedItems(t) : []);

  it.each([
    ["kg", { value: 640, unit: "KILOGRAM" as const }, "640 kg by 4 Dec"],
    ["lb (C6 has no kg)", { value: 1400, unit: "POUND" as const }, "target weight 1400 lb recorded (can't be converted to kg), by 4 Dec"],
    ["none", null, "no target weight set, by 4 Dec"],
  ])("CL-002 %s: the timeline's goal entry keeps the target's state", (_name, targetWeight, detail) => {
    const entries = timelineGoals(outputsWithGoal("1427", { type: "FINISHING", targetWeight, targetDate: "2026-12-04" }), "1427");
    expect(entries.map((e) => [e.title, e.detail])).toEqual([["Goal set: Finishing", detail]]);
  });

  it("CL-002: a lb target reads the same on the goal line, chart, timeline and plan (never absent, never 'records disagree')", () => {
    const o = outputsWithGoal("1427", { type: "FINISHING", targetWeight: { value: 1400, unit: "POUND" }, targetDate: "2026-12-04" });
    const view = viewOf(o, "1427");
    const p = view.profile;
    expect(p.goal.summary).toEqual({ state: "TEXT", text: "Finishing, target weight 1400 lb recorded (can't be converted to kg) by 4 Dec 2026" });
    if (p.chart.state !== "CHART") throw new Error(p.chart.state);
    expect(p.chart.goalTarget).toEqual({ state: "UNRESOLVED", note: "Goal target 1400 lb isn't drawn — it can't be converted to kilograms." });
    expect(timelineGoals(o, "1427").map((e) => e.detail)).toEqual(["target weight 1400 lb recorded (can't be converted to kg), by 4 Dec"]);
    const vm = planOf(view, undefined);
    expect(cellOf(vm.rows, "goalWeight")).toEqual({ state: "UNKNOWN", text: "Unknown — the goal target 1400 lb is recorded but can't be converted to kg" });
  });

  // CL-003 ------------------------------------------------------------------
  const FINISH = { type: "FINISHING", targetWeight: { value: 640, unit: "KILOGRAM" as const }, targetDate: "2026-12-04" };
  const SALE = { type: "SALE", targetWeight: null, targetDate: "2026-11-01" };

  it("CL-003: one active goal is the goal; it sets the plan's goal row and sale date", () => {
    const view = viewOf(outputsWithGoals("1427", [FINISH]), "1427");
    expect(view.profile.goal.read).toEqual({ state: "ACTIVE", goals: [{ goalType: "FINISHING", typeLabel: "Finishing", targetWeight: { state: "KNOWN", kg: 640 }, targetDate: "2026-12-04" }] });
    expect(view.plan.saleDateSource).toBe("Sale date starts from the declared goal.");
    expect(view.plan.defaults.saleDate).toBe("2026-12-04");
    expect(planTargetText(view.profile.goal.read)).toBe("640");
    expect(cellOf(planOf(view, undefined).rows, "goalWeight")).toMatchObject({ state: "KNOWN", text: "640 kg" });
  });

  it("CL-003: the auditor's case — FINISHING and SALE both in force (C6 ACTIVE) — shows both and picks neither", () => {
    const o = outputsWithGoals("1427", [FINISH, SALE]);
    expect(o.goals[animalIdOf("1427")]).toMatchObject({ status: "ACTIVE" });
    const view = viewOf(o, "1427");
    const p = view.profile;
    const read = p.goal.read;
    if (read.state !== "ACTIVE") throw new Error(read.state);
    expect(read.goals.map((g) => g.goalType).sort()).toEqual(["FINISHING", "SALE"]);
    if (p.goal.summary.state !== "TEXT") throw new Error(p.goal.summary.state);
    expect(p.goal.summary.text).toMatch(/^2 goals in force — /);
    expect(p.goal.summary.text).toContain("Finishing, 640 kg by 4 Dec 2026");
    expect(p.goal.summary.text).toContain("Sale, no target weight set by 1 Nov 2026");
    if (p.chart.state !== "CHART") throw new Error(p.chart.state);
    expect(p.chart.goalTarget).toEqual({ state: "UNRESOLVED", note: "2 goals are in force, so no single goal target is drawn — each is listed under Goal." });
    expect(p.projection.state.code).toBe("PREDICTION:SEVERAL_GOALS");
    expect(timelineGoals(o, "1427")).toHaveLength(2);
    // The plan: no goal is chosen for the sale date, the goal weight or the target box.
    expect(view.plan.saleDateSource).toBe("2 goals are in force and the plan doesn't pick one, so the sale date is a starting suggestion.");
    expect(planTargetText(read)).toBe("");
    expect(cellOf(planOf(view, undefined).rows, "goalWeight")).toEqual({ state: "UNKNOWN", text: "Unknown — several goals are in force and the plan doesn't pick one" });
    expect(planSaveIntent(read, "1427").change).toMatch(/^1427 has 2 goals in force \(.*\); the plan doesn't pick one\./);
    const text = textOf(<AnimalProfileScreen initial={view} tag="1427" scenario="STANDARD" />);
    expect(text).toContain("Sale, no target weight set by 1 Nov 2026");
    expect(text).toContain("Finishing, 640 kg by 4 Dec 2026");
  });

  it("CL-003: C6 INTENT_CONFLICT (SALE with RETAIN) stays a conflict — no goal, no goal row figure, no goal date", () => {
    const view = viewOf(outputsWithGoals("1427", [SALE, { type: "RETAIN", targetWeight: null, targetDate: null }]), "1427");
    const p = view.profile;
    expect(p.goal.read).toMatchObject({ state: "UNRESOLVED", display: { code: "GOAL:INTENT_CONFLICT" } });
    expect(p.goal.summary).toMatchObject({ state: "STATE", display: { label: "Goals conflict" } });
    expect(cellOf(planOf(view, undefined).rows, "goalWeight")).toMatchObject({ state: "UNKNOWN" });
    expect(view.plan.saleDateSource).toBe("The goal couldn't be determined, so the sale date is a starting suggestion.");
  });

  it("CL-003: no goal, and an unreadable goal record (C6 INVALID), are each said as such", () => {
    const none = viewOf(outputsWithGoals("1427", []), "1427");
    expect(none.profile.goal.read).toEqual({ state: "NONE" });
    expect(none.plan.saleDateSource).toBe("No goal date is declared; the sale date is a starting suggestion.");
    const o = outputsWithGoals("1427", [FINISH]);
    const id = animalIdOf("1427");
    o.goals[id] = { ...o.goals[id]!, status: "INVALID", activeGoals: [] };
    const invalid = viewOf(o, "1427");
    expect(invalid.profile.goal.read).toMatchObject({ state: "UNRESOLVED", display: { code: "GOAL:INVALID" } });
    expect(cellOf(planOf(invalid, undefined).rows, "goalWeight")).toMatchObject({ state: "UNKNOWN" });
  });

  it("CL-003 (sibling): a declared goal date that isn't ahead is named, never 'no goal date is declared'", () => {
    const view = viewOf(outputsWithGoals("1427", [{ ...FINISH, targetDate: "2026-10-01" }]), "1427");
    expect(view.plan.saleDateSource).toBe("The goal date, 1 Oct 2026, isn't after today, so the sale date is a starting suggestion.");
  });

  // CL-004 ------------------------------------------------------------------
  it("CL-004: the auditor's case — a sourced hard deadline (exclusive due) reads 'before', like its window", () => {
    const p = demoAnimalView(EMPTY, "1458")!.profile;
    if (p.work.open.state !== "ITEMS") throw new Error(p.work.open.state);
    const w = p.work.open.primary;
    expect(w.hardDeadline).toEqual({ state: "HARD_DEADLINE", label: "Must be done before 12 Oct 2026", dueAt: "2026-10-12T00:00:00.000000000Z" });
    expect(w.window).toMatchObject({ state: "RECOMMENDED", label: "Recommended window 13 Sep – before 12 Oct" });
    const text = textOf(<AnimalProfileScreen initial={demoAnimalView(EMPTY, "1458")!} tag="1458" scenario="STANDARD" />);
    expect(text).toContain("Must be done before 12 Oct 2026");
    expect(text).not.toMatch(/Must be done by/);
  });

  it("CL-004: across the herd, hard-deadline wording appears only with a sourced deadline, recommended timing never as one, no timing invents none", () => {
    for (const tag of ["1427", "1431", "1433", "1438", "1440", "1442", "1445", "1447", "1449", "1452", "1455", "1458"]) {
      const p = demoAnimalView(EMPTY, tag)!.profile;
      const open = p.work.open.state === "ITEMS" ? [p.work.open.primary, ...p.work.open.others] : [];
      for (const w of [...open, ...p.work.closed]) {
        if (w.hardDeadline.state === "HARD_DEADLINE") {
          expect(w.hardDeadline.label, tag).toMatch(/^Must be done before \d{1,2} [A-Z][a-z]{2} \d{4}$/);
          expect(w.window.state === "RECOMMENDED" && w.window.dueAt, tag).toBe(w.hardDeadline.dueAt);
        }
        if (w.window.state === "RECOMMENDED") expect(w.window.label, tag).toMatch(/^Recommended/);
      }
    }
    // A job with no timing (1438's weighing) shows neither a window nor a deadline.
    const p = demoAnimalView(EMPTY, "1438")!.profile;
    if (p.work.open.state !== "ITEMS") throw new Error(p.work.open.state);
    expect(p.work.open.primary).toMatchObject({ window: { state: "NONE" }, hardDeadline: { state: "NONE" } });
  });

  it("CL-004 (sweep): programme timing is recommended, never 'due' or a deadline", () => {
    for (const d of Object.values(PROGRAMME_DISPLAY)) expect(d.label).not.toMatch(/\bdue\b|deadline|must/i);
    expect(PROGRAMME_DISPLAY.DUE.label).toBe("In its recommended window");
  });
});

// ---------------------------------------------------------------------------
// Known Mediums of the Claude audit 2026-10-22-1: CL-005 a tiny positive projection shown "0 kg", CL-006
// unbounded straight-line extrapolation for far sale dates (authorised C10 safeguard: 90 days), CL-009
// superseded goal versions unmarked on the timeline.
describe("Claude audit 2026-10-22-1 Mediums — projection display, planning horizon, goal version history", { timeout: 120_000 }, () => {
  const AS_OF = "2026-10-16";
  const planWith = (projection: Parameters<typeof planScreenView>[0]["projection"], saleDate: string) => {
    const view = demoAnimalView(EMPTY, "1427")!;
    // No housing date: the default (8 Nov) would fall after a near sale date and make the inputs invalid.
    return planScreenView({ inputs: view.plan.inputs, assumptions: { ...view.plan.defaults, saleDate, housingDate: null }, martId: view.plan.defaultMartId, projection, profile: view.profile });
  };
  const cell = (vm: ReturnType<typeof planScreenView>, key: string) => [...vm.rows].find((r) => r.key === key)!.value;
  const synthetic = (kg: number, saleDate: string) => ({ state: "PROJECTED" as const, saleDate, kg, adgKgPerDay: -4.2, fromObservedAt: "2026-10-16T09:00:00Z", assumptions: [] });
  const DEPENDENT = ["projectedWeightKg", "projectedSaleValue", "costPerKgAtSale", "projectedDirectProfit", "returnFromHolding"];

  // CL-005 ------------------------------------------------------------------
  it.each([
    [0.447, "<1 kg"],
    [0.0001, "<1 kg"],
    [0.5, "1 kg"],
    [609.4, "609 kg"],
    [1234.6, "1,235 kg"],
  ])("CL-005: a projected weight of %s kg displays as %s (never '0 kg' for a positive value)", (kg, text) => {
    expect(formatProjectedKg(kg)).toBe(text);
  });

  it("CL-005: the auditor's case (C5 ≈ 0.447 kg) reads '<1 kg' in the plan; the canonical value is untouched and every figure stays exact", () => {
    const saleDate = addDays(AS_OF, 49);
    const vm = planWith(synthetic(0.447, saleDate), saleDate);
    expect(cell(vm, "projectedWeightKg")).toMatchObject({ state: "KNOWN", text: "<1 kg" });
    expect(JSON.stringify(vm)).not.toMatch(/"0 kg"/);
    const view = demoAnimalView(EMPTY, "1427")!;
    const inputs = unseal(view.plan.inputs);
    const e = computeAnimalPlanEconomics({ ...inputs, assumptions: { ...view.plan.defaults, saleDate, housingDate: null }, projection: { state: "PROJECTED", kg: 0.447 }, valuation: inputs.valuations[view.plan.defaultMartId]! });
    expect(e.projectedWeightKg).toEqual({ state: "KNOWN", value: "0.447" });
    // Per-kg money keeps its thousands grouping (CL-013, same figure).
    expect(cell(vm, "costPerKgAtSale")).toMatchObject({ state: "KNOWN" });
    expect((cell(vm, "costPerKgAtSale") as { text: string }).text).toMatch(/^€\d{1,3}(,\d{3})+\.\d{2}\/kg$/);
  });

  it.each([0, -0, -12.5])("CL-005: a projection of %s kg stays 'no usable projection' — never '<1 kg'", (kg) => {
    const saleDate = addDays(AS_OF, 49);
    const vm = planWith(synthetic(kg, saleDate), saleDate);
    expect(cell(vm, "projectedWeightKg").state).toBe("UNKNOWN");
    expect(JSON.stringify(vm)).not.toContain("<1 kg");
  });

  // CL-006 ------------------------------------------------------------------
  it.each([
    [1, "KNOWN"],
    [89, "KNOWN"],
    [90, "KNOWN"],
    [91, "UNKNOWN"],
    [400, "UNKNOWN"],
  ] as const)("CL-006: a sale date %s days ahead — the real C5 projection and every figure that uses it are %s", (days, expected) => {
    const saleDate = addDays(AS_OF, days);
    const projection = demoProjection(EMPTY, "1427", saleDate);
    expect(projection.state).toBe("PROJECTED"); // C5 itself still projects any date
    const vm = planWith(projection, saleDate);
    for (const key of DEPENDENT) {
      if (key === "costPerKgAtSale" && expected === "KNOWN") continue; // depends on costs too; checked below
      expect(cell(vm, key).state, `${key} at +${days}d`).toBe(expected);
    }
    expect(vm.titleDate).toBe(formatDate(saleDate)); // the farmer's date is kept, never capped
    expect(cell(vm, "forecastFeedCost").state).toBe("KNOWN"); // cost forecasts don't use the projection
    if (expected === "UNKNOWN") {
      for (const key of DEPENDENT) expect((cell(vm, key) as { text: string }).text, key).toContain("too far away for Farm Return's current straight-line weight forecast");
      expect(vm.headline.value.state).toBe("UNKNOWN");
    } else {
      expect(cell(vm, "costPerKgAtSale").state).toBe("KNOWN");
    }
  });

  it("CL-006: a goal date beyond 90 days is 'too far ahead to project' on the profile and chart too (1433: 91 days)", () => {
    const view = demoAnimalView(EMPTY, "1433")!;
    const p = view.profile;
    expect(p.projection.state.code).toBe("PREDICTION:BEYOND_HORIZON");
    expect(p.projection.label).toBeNull();
    if (p.chart.state !== "CHART") throw new Error(p.chart.state);
    expect(p.chart.projection).toEqual({ state: "NOT_USABLE", note: "No projection is drawn — the date is more than 90 days away, too far for Farm Return's current straight-line weight forecast." });
    expect(view.plan.defaults.saleDate).toBe("2027-01-15"); // the goal's date stands as the plan's date
    const near = demoAnimalView(EMPTY, "1427")!.profile; // 49 days
    expect(near.projection.state.code).toBe("PREDICTION:PROJECTED");
  });

  it("CL-006: the plan heading carries the year (CL-013)", () => {
    const vm = planWith(undefined, "2027-12-04");
    expect(vm.returnHeading).toBe("Return from holding to 4 Dec 2027");
  });

  // CL-009 ------------------------------------------------------------------
  const ID = animalIdOf("1427");
  const G = goalIdOf("1427");
  const decl = (version: string, supersedes: string[], extra: Record<string, unknown> = {}) => ({
    ...goalDeclaration({ goalId: G, version, supersedes, animalId: ID, type: "FINISHING", targetKg: 640, targetDate: "2026-12-04", validFrom: "2026-05-01T00:00:00Z", receivedAt: `2026-0${4 + Number(version)}-01T00:00:00Z` }),
    ...extra,
  });
  const goalEntries = (o: CattleOutputs) => {
    const t = buildAnimalProfile(o, ID, DEMO_DIRECTORY, costsOf("1427")).timeline;
    return (t.state === "ITEMS" ? listedItems(t) : []).filter((e) => e.id.startsWith("goal:")).map((e) => [e.id.split(":").at(-1), e.title, e.marker, e.markerLabel]);
  };

  it("CL-009: one goal in force is the current goal", () => {
    expect(goalEntries(outputsWithGoalRecords("1427", [decl("1", [])]))).toEqual([["1", "Goal set: Finishing", "CURRENT", "Current goal"]]);
  });

  it("CL-009: a replaced version is superseded, its replacement current — both kept (the demo's own plan save)", () => {
    const s: CattleDemoSession = { version: 1, events: [{ kind: "SAVE_PLAN_GOAL", eventId: "g1", tag: "1427", goalType: "FINISHING", targetKg: 656, targetDate: "2027-01-20" }] };
    const t = demoAnimalView(s, "1427")!.profile.timeline;
    const entries = (t.state === "ITEMS" ? listedItems(t) : []).filter((e) => e.id.startsWith("goal:"));
    expect(entries.map((e) => [e.title, e.marker, e.markerLabel])).toEqual([
      ["Goal updated: Finishing", "CURRENT", "Current goal"],
      ["Goal set: Finishing", "SUPERSEDED", "Superseded"],
    ]);
  });

  it("CL-009: an ended goal and a withdrawn goal are history, never current", () => {
    const ended = goalEntries(outputsWithGoalRecords("1427", [decl("1", []), decl("2", ["1"], { action: "END", validTo: "2026-09-01T00:00:00Z" })]));
    expect(ended).toEqual([
      ["2", "Goal ended: Finishing", null, null],
      ["1", "Goal set: Finishing", "SUPERSEDED", "Superseded — goal ended"],
    ]);
    const withdrawn = goalEntries(outputsWithGoalRecords("1427", [decl("1", []), decl("2", ["1"], { action: "WITHDRAW" })]));
    expect(withdrawn).toEqual([
      ["2", "Goal withdrawn: Finishing", null, null],
      ["1", "Goal set: Finishing", "SUPERSEDED", "Superseded — goal withdrawn"],
    ]);
    expect(viewOf(outputsWithGoalRecords("1427", [decl("1", []), decl("2", ["1"], { action: "WITHDRAW" })]), "1427").profile.goal.read).toEqual({ state: "NONE" });
  });

  it("CL-009: a live goal whose period has ended isn't marked current", () => {
    expect(goalEntries(outputsWithGoalRecords("1427", [decl("1", [], { validTo: "2026-09-01T00:00:00Z" })]))).toEqual([["1", "Goal set: Finishing", "NOT_IN_FORCE", "Not in force now"]]);
  });

  it("CL-009: several goals in force are each current; a conflict stays a conflict, never current", () => {
    const several = outputsWithGoals("1427", [{ type: "FINISHING", targetWeight: null, targetDate: "2026-12-04" }, { type: "SALE", targetWeight: null, targetDate: "2026-11-01" }]);
    const t1 = buildAnimalProfile(several, ID, DEMO_DIRECTORY, costsOf("1427")).timeline;
    expect((t1.state === "ITEMS" ? listedItems(t1) : []).filter((e) => e.id.startsWith("goal:")).map((e) => e.marker)).toEqual(["CURRENT", "CURRENT"]);
    const conflict = outputsWithGoals("1427", [{ type: "SALE", targetWeight: null, targetDate: null }, { type: "RETAIN", targetWeight: null, targetDate: null }]);
    const t2 = buildAnimalProfile(conflict, ID, DEMO_DIRECTORY, costsOf("1427")).timeline;
    const markers = (t2.state === "ITEMS" ? listedItems(t2) : []).filter((e) => e.id.startsWith("goal:")).map((e) => e.marker);
    expect(markers).toEqual(["CONFLICT", "CONFLICT"]);
  });

  it("CL-009: C6 INVALID marks no goal version current", () => {
    const o = outputsWithGoalRecords("1427", [decl("1", [])]);
    o.goals[ID] = { ...o.goals[ID]!, status: "INVALID", activeGoals: [] };
    expect(goalEntries(o).map((e) => e[2])).toEqual([null]);
  });

  it("CL-009: the rendered timeline says 'Superseded' for a replaced goal and keeps 'Corrected' for a corrected weight", () => {
    const s: CattleDemoSession = { version: 1, events: [{ kind: "SAVE_PLAN_GOAL", eventId: "g1", tag: "1427", goalType: "FINISHING", targetKg: 656, targetDate: "2027-01-20" }] };
    const t = demoAnimalView(s, "1427")!.profile.timeline;
    if (t.state !== "ITEMS") throw new Error(t.state);
    const goalsOnly = { ...t, items: [...listedItems(t)].filter((e) => e.id.startsWith("goal:")) } as unknown as typeof t;
    render(<TimelineSection timeline={goalsOnly} freshIds={new Set()} gapNote={null} />);
    expect(screen.getByText("Goal set: Finishing").closest("li")!.textContent).toContain("Superseded");
    expect(screen.getByText("Goal updated: Finishing").closest("li")!.textContent).toContain("Current goal");
  });
});
