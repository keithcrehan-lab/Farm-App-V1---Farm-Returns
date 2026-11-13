import { describe, expect, it } from "vitest";
import {
  fieldUseFromCropSystem,
  buildDemandLine,
  grassInsights,
  grazingPlatform,
  inMainGrazingSeason,
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
  { fieldId: "a", name: "Hill", areaHa: 2, coverKgDmHa: 1600, use: "grazing" },
  { fieldId: "b", name: "Side", areaHa: 3, coverKgDmHa: 900, use: "grazing" },
  { fieldId: "c", name: "Back", areaHa: 5, coverKgDmHa: 400, use: "mixed" },
  { fieldId: "d", name: "New", areaHa: 1, use: "grazing" },
];
const NOV = "2026-11-12T12:00:00Z";
const JUNE = "2026-06-12T12:00:00Z";

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

  it("runs the line across the measured fields only: the first at the pre-grazing target, the last at the residual", () => {
    const out = buildDemandLine({ groups, grazingAreaHa: 10, targets });
    if (out.status !== "OK") throw new Error("line");
    const bars = layoutWedge(fields, "equal", out.line);
    expect(bars[0].targetKgDmHa).toBeCloseTo(650, 6);
    expect(bars[1].targetKgDmHa).toBeCloseTo(400, 6);
    expect(bars[2].targetKgDmHa).toBeCloseTo(150, 6);
    // The unmeasured field gets no point on the line and no difference — never treated as zero.
    expect(bars[3].targetKgDmHa).toBeUndefined();
    expect(bars[3].differenceKgDm).toBeUndefined();
    // Hill: (1600 − 650) × 2 ha
    expect(bars[0].differenceKgDm).toBeCloseTo(1900, 6);
    expect(bars[0].aboveResidualKgDm).toBeCloseTo((1600 - 150) * 2, 6);
  });

  it("totals the farm against the line from area-weighted cover, the same whichever way the bars are drawn", () => {
    const out = buildDemandLine({ groups, grazingAreaHa: 10, targets });
    if (out.status !== "OK") throw new Error("line");
    const p = wedgePosition(fields, out.line)!;
    // (1600×2 + 900×3 + 400×5) ÷ 10 = 790; line average 400; (790 − 400) × 10 ha = 3,900 kg DM.
    expect(p.differenceKgDm).toBeCloseTo(3900, 6);
    expect(p.days).toBeCloseTo(3900 / 250, 6);
    expect(p.measuredAreaHa).toBe(10);
    expect(p.unmeasuredAreaHa).toBe(1);
  });
});

describe("grazing platform", () => {
  it("counts only grazing and mixed fields, and waits for fields whose use isn't set", () => {
    const mixedFarm: WedgeField[] = [
      ...fields,
      { fieldId: "s", name: "Silage", areaHa: 8, coverKgDmHa: 2500, use: "silage_1st_cut" },
      { fieldId: "t", name: "Barley", areaHa: 6, use: "tillage" },
    ];
    const p = grazingPlatform(mixedFarm);
    expect(p.areaHa).toBe(11);
    expect(p.excluded.map((f) => f.fieldId)).toEqual(["s", "t"]);
    expect(p.unknownUse).toEqual([]);
    const unknown = grazingPlatform([...fields, { fieldId: "u", name: "Unknown", areaHa: 4 }]);
    expect(unknown.unknownUse.map((f) => f.fieldId)).toEqual(["u"]);
    expect(buildDemandLine({ groups, grazingAreaHa: unknown.areaHa, targets, unknownUse: unknown.unknownUse })).toMatchObject({ block: { code: "FIELD_USE_UNKNOWN" } });
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

  it("reads a finished walk's saved growth as walk evidence, not as a figure you typed", () => {
    const s = selectGrowthEvidence({
      walks: [],
      observations: [
        { id: "w", growthRateKgDmHaDay: 16, origin: "farmer_entered", observedAt: "2026-11-10T09:00:00Z", source: "Grass walk 2026-11-10: calculated from 5 fields" },
        { id: "r", growthRateKgDmHaDay: 50, origin: "regional_estimate", observedAt: "2026-11-11T00:00:00Z", source: "Teagasc MoSt Clare" },
      ],
      asOf,
    });
    expect(s.chosen).toMatchObject({ kind: "walks", rateKgDmHaDay: 16, observationId: "w" });
  });

  it("ignores impossible growth figures (0 or above 500) instead of crashing the page", () => {
    const s = selectGrowthEvidence({
      walks: [{ at: "2026-11-10T09:00:00Z", rateKgDmHaDay: 0, fieldCount: 5 }],
      observations: [
        { id: "w0", growthRateKgDmHaDay: 0, origin: "farmer_entered", observedAt: "2026-11-11T09:00:00Z", source: "Grass walk 2026-11-11: calculated from 3 fields" },
        { id: "big", growthRateKgDmHaDay: 900, origin: "sensor", observedAt: "2026-11-11T10:00:00Z", source: "Sensor" },
        { id: "r", growthRateKgDmHaDay: 50, origin: "regional_estimate", observedAt: "2026-11-11T00:00:00Z", source: "Teagasc" },
      ],
      asOf,
    });
    expect(s.chosen).toMatchObject({ kind: "regional", rateKgDmHaDay: 50 });
    expect(s.others).toEqual([]);
  });

  it("labels an external feed as its own source, not as the county figure", () => {
    const s = selectGrowthEvidence({
      walks: [],
      observations: [{ id: "x", growthRateKgDmHaDay: 40, origin: "external_api", observedAt: "2026-11-11T00:00:00Z", source: "Feed" }],
      asOf,
    });
    expect(s.chosen?.kind).toBe("external");
    expect(s.chosen?.label).not.toMatch(/county/i);
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
    const insights = grassInsights({ fields: fields.map((f) => ({ ...f, ageDays: 2, occupied: false })), line, asOf: NOV });
    expect(insights[0]).toMatchObject({ title: "Complete your grazing demand", actionLabel: "Add cattle liveweight", action: { kind: "add_liveweight", groupId: "g3" } });
    expect(insights[0].why).toMatch(/weanlings: 12 animals are recorded/);
    const noTargets = grassInsights({ fields: [], line: buildDemandLine({ groups, grazingAreaHa: 10, targets: {} }), asOf: NOV });
    expect(noTargets[0]).toMatchObject({ actionLabel: "Set rotation length" });
  });

  it("reports a surplus with its working; silage only in the main season, holding covers in autumn", () => {
    const line = buildDemandLine({ groups, grazingAreaHa: 10, targets });
    const measured = fields.filter((f) => f.coverKgDmHa !== undefined).map((f) => ({ ...f, ageDays: 2, occupied: f.fieldId === "b" }));
    const summer = grassInsights({ fields: measured, line, asOf: JUNE }).find((i) => i.id === "surplus")!;
    expect(summer.working.at(-1)!.label).toBe("In days of grazing demand");
    expect(summer.confidence).toBe("measured");
    expect(summer.why).toMatch(/baled silage/);
    expect(summer.action).toEqual({ kind: "explore_silage", fieldIds: ["a"] });
    expect(summer.figures).toContain("16 days of demand above it");
    const autumn = grassInsights({ fields: measured, line, asOf: NOV });
    const held = autumn.find((i) => i.id === "surplus")!;
    expect(held.why).not.toMatch(/silage/);
    expect(held.why).toMatch(/closing rotation/);
    expect(held.actionLabel).toBe("Try a longer rotation");
    // No field-by-field grazing order is prescribed without a documented pre-grazing threshold.
    expect(autumn.find((i) => i.id === "next")).toBeUndefined();
    expect(inMainGrazingSeason(JUNE)).toBe(true);
    expect(inMainGrazingSeason(NOV)).toBe(false);
  });

  it("asks for each field's use before drawing the line", () => {
    const line = buildDemandLine({ groups, grazingAreaHa: 10, targets, unknownUse: [{ fieldId: "u", name: "Bottom", areaHa: 4 }] });
    const insights = grassInsights({ fields: [], line, asOf: NOV });
    expect(insights[0]).toMatchObject({ id: "field-use", action: { kind: "set_field_use", fieldId: "u" } });
  });

  it("previews taking a field out without changing anything: less area, a higher line", () => {
    const before = buildDemandLine({ groups, grazingAreaHa: 11, targets });
    const silage: WedgeField = { fieldId: "s", name: "Silage", areaHa: 8, coverKgDmHa: 2500, use: "silage_1st_cut" };
    const after = previewScenario({ fields: [...fields, silage], groups, targets, removedFieldIds: ["a"] });
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


describe("fieldUseFromCropSystem — use from the field drawer's production cycle", () => {
  it("counts grazing and white-clover grazing as grazing, mixed as mixed", () => {
    expect(fieldUseFromCropSystem("GRASS_GRAZING")).toBe("grazing");
    expect(fieldUseFromCropSystem("GRASS_WHITE_CLOVER_GRAZING")).toBe("grazing");
    expect(fieldUseFromCropSystem("GRASS_MIXED")).toBe("mixed");
  });
  it("keeps silage, cereals and other crops out of the grazing area", () => {
    for (const c of ["GRASS_FIRST_CUT_SILAGE", "GRASS_SECOND_CUT_SILAGE", "GRASS_HAY", "CEREAL_OTHER", "FORAGE_KALE"]) {
      const use = fieldUseFromCropSystem(c);
      expect(use).toBeDefined();
      expect(grazingPlatform([{ fieldId: "f", name: "F", areaHa: 2, ...(use ? { use } : {}) }]).excluded).toHaveLength(1);
    }
  });
  it("leaves an unknown or missing crop system unset", () => {
    expect(fieldUseFromCropSystem(undefined)).toBeUndefined();
    expect(fieldUseFromCropSystem("NOT_A_CROP")).toBeUndefined();
  });
});
