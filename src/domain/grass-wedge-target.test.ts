import { describe, expect, it } from "vitest";
import {
  buildDemandLine,
  grassInsights,
  layoutWedge,
  MIN_AREA_BAR_FRACTION,
  previewScenario,
  selectGrowthEvidence,
  supplyDemand,
  wedgePosition,
  type DemandGroup,
  type WedgeField,
} from "./grass-wedge-target";

const groups: DemandGroup[] = [
  { groupId: "g1", label: "Weanlings", headCount: 20, fieldId: "a", dailyDemandKgDm: 120, kgDmPerHeadDay: 6 },
  { groupId: "g2", label: "Cows", headCount: 10, fieldId: "b", dailyDemandKgDm: 130, kgDmPerHeadDay: 13 },
];
const targets = { rotationDays: 20, residualKgDmHa: 150 };
const fields: WedgeField[] = [
  { fieldId: "a", name: "Hill", areaHa: 2, coverKgDmHa: 1600 },
  { fieldId: "b", name: "Side", areaHa: 3, coverKgDmHa: 900 },
  { fieldId: "c", name: "Back", areaHa: 5, coverKgDmHa: 400 },
  { fieldId: "d", name: "New", areaHa: 1 },
];

describe("grass wedge target line (Teagasc manual wedge)", () => {
  it("draws the line from demand per hectare × rotation + residual down to the residual", () => {
    const out = buildDemandLine({ groups, grazingAreaHa: 10, targets });
    expect(out.status).toBe("OK");
    if (out.status !== "OK") return;
    // 250 kg DM/day over 10 ha = 25 kg DM/ha/day; × 20 days + 150 = 650.
    expect(out.line.demandKgDmDay).toBe(250);
    expect(out.line.demandKgDmHaDay).toBe(25);
    expect(out.line.targetPreGrazingKgDmHa).toBe(650);
    expect(out.line.targetAverageCoverKgDmHa).toBe(400);
    expect(out.line.working.map((w) => w.label)).toContain("Target pre-grazing cover");
  });

  it("refuses to draw a line without targets, cattle, complete demand or area", () => {
    expect(buildDemandLine({ groups, grazingAreaHa: 10, targets: {} })).toMatchObject({ status: "BLOCKED", block: { code: "TARGETS_NOT_SET" } });
    expect(buildDemandLine({ groups, grazingAreaHa: 10, targets: { rotationDays: 2, residualKgDmHa: 150 } })).toMatchObject({ block: { code: "TARGETS_NOT_SET" } });
    expect(buildDemandLine({ groups: [], grazingAreaHa: 10, targets })).toMatchObject({ block: { code: "NO_GRAZING_CATTLE" } });
    const partial = buildDemandLine({ groups: [...groups, { groupId: "g3", label: "Stores", headCount: 12, fieldId: "c" }], grazingAreaHa: 10, targets });
    expect(partial).toMatchObject({ block: { code: "DEMAND_INCOMPLETE" } });
    if (partial.status === "BLOCKED" && partial.block.code === "DEMAND_INCOMPLETE") expect(partial.block.groups.map((g) => g.groupId)).toEqual(["g3"]);
    expect(buildDemandLine({ groups, grazingAreaHa: 0, targets })).toMatchObject({ block: { code: "NO_GRAZING_AREA" } });
  });
});

describe("wedge layout", () => {
  it("orders by cover with unknown fields last, and sizes bars by area or equally", () => {
    const area = layoutWedge(fields, "area");
    expect(area.map((b) => b.fieldId)).toEqual(["a", "b", "c", "d"]);
    expect(area[2].width / area[1].width).toBeCloseTo(5 / 3, 5);
    expect(area.reduce((s, b) => s + b.width, 0)).toBeCloseTo(1, 9);
    const equal = layoutWedge(fields, "equal");
    expect(equal.every((b) => Math.abs(b.width - 0.25) < 1e-9)).toBe(true);
    expect(equal[3].coverKgDmHa).toBeUndefined();
  });

  it("keeps small fields tappable on the area wedge", () => {
    const bars = layoutWedge([{ fieldId: "big", name: "Big", areaHa: 100, coverKgDmHa: 900 }, { fieldId: "tiny", name: "Tiny", areaHa: 0.1, coverKgDmHa: 800 }, { fieldId: "mid", name: "Mid", areaHa: 20, coverKgDmHa: 700 }], "area");
    expect(bars.find((b) => b.fieldId === "tiny")!.width).toBeCloseTo(MIN_AREA_BAR_FRACTION, 9);
    expect(bars.reduce((s, b) => s + b.width, 0)).toBeCloseTo(1, 9);
  });

  it("reads the line at each bar: the first bar at the pre-grazing target, the last at the residual", () => {
    const out = buildDemandLine({ groups, grazingAreaHa: 10, targets });
    if (out.status !== "OK") throw new Error("line");
    const bars = layoutWedge(fields, "equal", out.line);
    expect(bars[0].targetKgDmHa).toBeCloseTo(650, 6);
    expect(bars[3].targetKgDmHa).toBeCloseTo(150, 6);
    expect(bars[1].targetKgDmHa).toBeCloseTo(650 - 500 / 3, 6);
    // Hill: (1600 − 650) × 2 ha
    expect(bars[0].differenceKgDm).toBeCloseTo(1900, 6);
    expect(bars[0].aboveResidualKgDm).toBeCloseTo((1600 - 150) * 2, 6);
    expect(bars[3].differenceKgDm).toBeUndefined();
  });

  it("totals the farm against the line in kg DM and days of demand, leaving unmeasured fields out", () => {
    const out = buildDemandLine({ groups, grazingAreaHa: 10, targets });
    if (out.status !== "OK") throw new Error("line");
    const p = wedgePosition(fields, out.line)!;
    const t = (i: number) => 650 - (500 * i) / 3;
    const expected = (1600 - t(0)) * 2 + (900 - t(1)) * 3 + (400 - t(2)) * 5;
    expect(p.differenceKgDm).toBeCloseTo(expected, 6);
    expect(p.days).toBeCloseTo(expected / 250, 6);
    expect(p.unmeasuredAreaHa).toBe(1);
  });
});

describe("growth evidence", () => {
  const asOf = "2026-11-12T12:00:00Z";
  it("uses your own recent walks over the county figure, and shows both", () => {
    const s = selectGrowthEvidence({
      walks: [{ at: "2026-11-10T09:00:00Z", rateKgDmHaDay: 16, fieldCount: 5 }],
      observations: [{ id: "r", growthRateKgDmHaDay: 50, origin: "regional_estimate", observedAt: "2026-11-11T00:00:00Z", source: "Teagasc MoSt Clare" }],
      asOf,
    });
    expect(s.chosen).toMatchObject({ kind: "walks", rateKgDmHaDay: 16 });
    expect(s.others).toEqual([expect.objectContaining({ kind: "regional", rateKgDmHaDay: 50 })]);
  });

  it("falls back to the county figure when your own is older than 21 days, and says so", () => {
    const s = selectGrowthEvidence({
      walks: [{ at: "2026-10-01T09:00:00Z", rateKgDmHaDay: 30, fieldCount: 5 }],
      observations: [{ id: "r", growthRateKgDmHaDay: 50, origin: "regional_estimate", observedAt: "2026-11-11T00:00:00Z", source: "Teagasc" }],
      asOf,
    });
    expect(s.chosen?.kind).toBe("regional");
    expect(s.reason).toMatch(/county figure is used/);
    expect(selectGrowthEvidence({ walks: [], observations: [], asOf }).chosen).toBeUndefined();
  });

  it("prefers the newer of a walk and a rate you entered, and ignores anything after now", () => {
    const s = selectGrowthEvidence({
      walks: [{ at: "2026-11-05T09:00:00Z", rateKgDmHaDay: 20, fieldCount: 3 }],
      observations: [
        { id: "f", growthRateKgDmHaDay: 35, origin: "farmer_entered", observedAt: "2026-11-09T00:00:00Z", source: "Keith" },
        { id: "future", growthRateKgDmHaDay: 99, origin: "farmer_entered", observedAt: "2026-11-20T00:00:00Z", source: "Keith" },
      ],
      asOf,
    });
    expect(s.chosen).toMatchObject({ kind: "farmer_entered", rateKgDmHaDay: 35 });
    expect(s.others.map((o) => o.kind)).toEqual(["walks"]);
  });
});

describe("supply vs demand, insights and scenarios", () => {
  it("compares grass grown with grass eaten", () => {
    const s = supplyDemand({ growthKgDmHaDay: 16, grazingAreaHa: 10, demandKgDmDay: 250 })!;
    expect(s.growthKgDmDay).toBe(160);
    expect(s.balanceKgDmDay).toBe(-90);
    expect(s.coverChangeKgDmHaDay).toBe(-9);
    expect(supplyDemand({ grazingAreaHa: 10, demandKgDmDay: 250 })).toBeUndefined();
  });

  it("asks for the missing liveweight and targets first, never guessing", () => {
    const line = buildDemandLine({ groups: [{ groupId: "g3", label: "weanlings", headCount: 12, fieldId: "a", missingReason: "their average liveweight is missing" }], grazingAreaHa: 10, targets });
    const insights = grassInsights({ fields: fields.map((f) => ({ ...f, ageDays: 2, occupied: false })), line });
    expect(insights[0]).toMatchObject({ title: "Complete your grazing demand", actionLabel: "Add cattle liveweight", action: { kind: "add_liveweight", groupId: "g3" } });
    expect(insights[0].why).toMatch(/12 weanlings/);
    const noTargets = grassInsights({ fields: [], line: buildDemandLine({ groups, grazingAreaHa: 10, targets: {} }) });
    expect(noTargets[0]).toMatchObject({ actionLabel: "Set rotation length" });
  });

  it("reports a surplus against the line with its working, and the next field on the wedge", () => {
    const line = buildDemandLine({ groups, grazingAreaHa: 10, targets });
    const measured = fields.filter((f) => f.coverKgDmHa !== undefined).map((f) => ({ ...f, ageDays: 2, occupied: f.fieldId === "b" }));
    const insights = grassInsights({ fields: measured, line });
    const surplus = insights.find((i) => i.id === "surplus")!;
    expect(surplus.working.at(-1)!.label).toBe("In days of grazing demand");
    expect(surplus.confidence).toBe("measured");
    expect(insights.find((i) => i.id === "next")!.title).toBe("Next on the wedge: Hill");
  });

  it("previews taking a field out without changing anything: less area, a higher line", () => {
    const before = buildDemandLine({ groups, grazingAreaHa: 11, targets });
    const after = previewScenario({ fields, groups, targets, removedFieldIds: ["a"] });
    expect(after.remainingAreaHa).toBe(9);
    if (before.status !== "OK" || after.line.status !== "OK") throw new Error("line");
    expect(after.line.line.targetPreGrazingKgDmHa).toBeGreaterThan(before.line.targetPreGrazingKgDmHa);
    expect(after.removedAboveResidualKgDm).toBeCloseTo((1600 - 150) * 2, 6);
    const longer = previewScenario({ fields, groups, targets, removedFieldIds: [], rotationDays: 30 });
    if (longer.line.status !== "OK") throw new Error("line");
    expect(longer.line.line.rotationDays).toBe(30);
    expect(fields).toHaveLength(4);
  });
});
