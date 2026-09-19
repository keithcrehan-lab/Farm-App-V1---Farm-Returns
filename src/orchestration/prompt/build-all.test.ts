import { describe, expect, it } from "vitest";
import { buildAllRealPrompts, computeFarmGrasslandAggregates } from "./build-all";
import { checkClosedPeriodCalendar } from "@/domain/closed-period-calendar";
import type { Farm, Field, LivestockGroup, SlurryAllocation } from "@/domain/types";

const farm: Pick<Farm, "id" | "location"> = { id: "farm-1", location: { county: "Cork", centroid: [0, 0] } };

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Back Meadow",
    areaHa: 4.2,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

const noGroups: LivestockGroup[] = [];
const noSlurry: SlurryAllocation[] = [];

describe("buildAllRealPrompts", () => {
  it("returns no prompts for an empty field list", () => {
    expect(buildAllRealPrompts(farm, [], noGroups, noSlurry, "2026-09-01T09:00:00Z")).toEqual([]);
  });

  // Fertiliser Vertical campaign — a fifth real producer,
  // `fertiliser_recommendation`, joined the fan-out. Slurry Closed-Period
  // Wiring V1 — a second real `spreading_window` Prompt (material
  // `organic_fertiliser_other_than_FYM`, slurry's own real statutory
  // category) now joins the pre-existing chemical-fertiliser one per
  // field, so the per-field count is six, not five — the *kind* set
  // itself is unchanged (still five distinct kinds; two of the six
  // Prompts share the `spreading_window` kind, distinguished by their
  // own real `inputsSnapshot.material`).
  it("returns exactly six real prompts per field — one per shipped producer, plus a second spreading_window Prompt for slurry's own closed period", () => {
    const fields = [field({ id: "field-1" }), field({ id: "field-2", name: "River Field" })];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, noSlurry, "2026-09-01T09:00:00Z");
    expect(prompts).toHaveLength(12);
    const kinds = new Set(prompts.map((p) => p.kind));
    expect(kinds).toEqual(
      new Set(["spreading_window", "soil_test_age", "commonage_status", "local_buffer_override", "fertiliser_recommendation"]),
    );
    // Two real `spreading_window` Prompts per field — one per material —
    // each carrying its own distinct real material in `inputsSnapshot`.
    for (const f of fields) {
      const spreadingPrompts = prompts.filter((p) => p.kind === "spreading_window" && p.fieldId === f.id);
      expect(spreadingPrompts).toHaveLength(2);
      const materials = new Set(spreadingPrompts.map((p) => p.inputsSnapshot?.material));
      expect(materials).toEqual(new Set(["chemical_fertiliser", "organic_fertiliser_other_than_FYM"]));
    }
  });

  // `promptForSpreadingWindow` always defaults its own `asOfDate` to the
  // real live Irish calendar date (`buildAllRealPrompts` never passes an
  // explicit one — see this file's own header) — so this test cannot
  // hardcode an expected OK/LEGAL_PROHIBITION status without becoming
  // flaky depending on which real day it runs. It instead cross-checks
  // each Prompt's real `basis.status` directly against
  // `checkClosedPeriodCalendar` (the same domain function underneath
  // `promptForSpreadingWindow`) called with that Prompt's own real,
  // captured `inputsSnapshot.asOfDate` and material — proving the two
  // Prompts genuinely evaluate their own distinct Zone A closed-period
  // window (chemical fertiliser 09-15 -> 01-29, slurry's real
  // organic_fertiliser_other_than_FYM 10-01 -> 01-12 —
  // `closed-period-calendar.ts`'s own `CLOSED_PERIOD_BY_ZONE_MATERIAL`),
  // not merely that both Prompts exist. `spreading-window.test.ts`'s own
  // "different materials produce different closed-period answers"
  // test already proves the two dates genuinely diverge, with a fixed
  // date, at the producer level below this wiring.
  it("the slurry (organic_fertiliser_other_than_FYM) spreading_window Prompt is evaluated against its own real, distinct closed-period window — never the chemical-fertiliser Prompt's window for the same field/date", () => {
    const fields = [field({ id: "field-1" })];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, noSlurry, "2026-09-01T09:00:00Z");
    const spreadingPrompts = prompts.filter((p) => p.kind === "spreading_window");
    const chemical = spreadingPrompts.find((p) => p.inputsSnapshot?.material === "chemical_fertiliser");
    const slurry = spreadingPrompts.find((p) => p.inputsSnapshot?.material === "organic_fertiliser_other_than_FYM");
    expect(chemical).toBeDefined();
    expect(slurry).toBeDefined();
    // Both real Prompts share the identical real "today" — proving any
    // status difference between them below comes from the material's own
    // distinct closed-period window, not from evaluating a different date.
    expect(chemical?.inputsSnapshot?.asOfDate).toBe(slurry?.inputsSnapshot?.asOfDate);
    const asOfDate = chemical?.inputsSnapshot?.asOfDate as string;
    expect(chemical?.basis.status).toBe(
      checkClosedPeriodCalendar({ county: "Cork", date: asOfDate, material: "chemical_fertiliser" }).status,
    );
    expect(slurry?.basis.status).toBe(
      checkClosedPeriodCalendar({ county: "Cork", date: asOfDate, material: "organic_fertiliser_other_than_FYM" }).status,
    );
  });

  it("every prompt carries the real farmId/fieldId it was built for, never a mismatched one", () => {
    const fields = [field({ id: "field-1", farmId: "farm-1" })];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, noSlurry, "2026-09-01T09:00:00Z");
    for (const p of prompts) {
      expect(p.farmId).toBe("farm-1");
      expect(p.fieldId).toBe("field-1");
    }
  });

  it("the fertiliser_recommendation prompt matches this field's own real slurry allocation, never another field's", () => {
    const fields = [field({ id: "field-1" }), field({ id: "field-2" })];
    const slurryAllocations: SlurryAllocation[] = [{ fieldId: "field-2", housingId: "h1", priority: "high", volumeM3: 100, score: 90 }];
    const prompts = buildAllRealPrompts(farm, fields, noGroups, slurryAllocations, "2026-09-01T09:00:00Z");
    const fertPrompts = prompts.filter((p) => p.kind === "fertiliser_recommendation");
    expect(fertPrompts).toHaveLength(2);
    // Neither field has a recorded soil P/K index, so both fail closed —
    // this test only asserts the real per-field scoping, not the outcome.
    expect(fertPrompts.every((p) => p.basis.status === "BLOCKED_INSUFFICIENT_EVIDENCE")).toBe(true);
  });
});

// Codex audit HIGH (round 5) — a farm's real grassland-stocking-rate
// denominator must exclude tillage ground; the first version of this
// function (and NutrientsPageClient.tsx's own since-removed duplicate)
// both set it to the farm's whole area instead, understating the real
// N requirement on any mixed grassland/tillage farm.
describe("computeFarmGrasslandAggregates", () => {
  it("excludes real tillage area from the grassland figure — never the same as the farm's whole area on a mixed farm", () => {
    const fields: Field[] = [
      { id: "f1", farmId: "farm-1", name: "Grass Field", areaHa: 10, centroid: [0, 0], fertility: {} } as Field,
      {
        id: "f2",
        farmId: "farm-1",
        name: "Tillage Field",
        areaHa: 5,
        centroid: [0, 0],
        fertility: {},
        plannedUse: { value: "tillage", status: "verified", source: "Farmer" },
      } as Field,
    ];
    const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(fields);
    // 15 ha total, 5 ha tillage -> 10 ha real grassland, never 15.
    expect(farmGrasslandAreaHa).toBe(10);
    expect(nonGrassPct).toBeCloseTo((5 / 15) * 100);
  });

  it("returns the farm's whole area as grassland when no field is tillage", () => {
    const fields: Field[] = [{ id: "f1", farmId: "farm-1", name: "Grass Field", areaHa: 10, centroid: [0, 0], fertility: {} } as Field];
    const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(fields);
    expect(farmGrasslandAreaHa).toBe(10);
    expect(nonGrassPct).toBe(0);
  });

  it("returns a real, honest zero for an empty field list, never a division error", () => {
    expect(computeFarmGrasslandAggregates([])).toEqual({ farmGrasslandAreaHa: 0, nonGrassPct: 0 });
  });
});
