import { describe, expect, it } from "vitest";
import { tracked, type Field, type SlurryAllocation } from "@/domain/types";
import type { GrassFieldState } from "@/domain/grass-management";
import {
  FARM_LENS_MARKER_COLOR,
  farmFieldLensView,
  farmSpatialReturnHref,
  fieldNutrientPlanHref,
  fieldWorkspaceHref,
  parseFarmSpatialReturn,
  parseFieldWorkspaceChapter,
} from "./farm-spatial-field-lens";
import { FARM_LENSES } from "./farm-spatial-lenses";

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "f1",
    farmId: "farm",
    name: "Long Field",
    areaHa: 4.2,
    centroid: [-8, 53],
    polygon: { type: "Polygon", coordinates: [[[-8, 53], [-8.001, 53], [-8.001, 53.001], [-8, 53]]] },
    fertility: {},
    ...overrides,
  } as Field;
}

const none = { slurryAllocations: [] as SlurryAllocation[] };

describe("farmFieldLensView — honest per-field lens data", () => {
  it("shows Unknown, never a default, when P/K/pH/soil/test are missing (soil evidence sits inside Nutrients)", () => {
    const nutrients = farmFieldLensView("nutrients", field(), none);
    expect(nutrients.markerLabel).toBe("P · K unknown");
    expect(nutrients.facts).toEqual([
      { label: "P", value: "Unknown", missing: true },
      { label: "K", value: "Unknown", missing: true },
      { label: "pH", value: "Unknown", missing: true },
      { label: "Soil test", value: "No lab test", missing: true },
      { label: "Soil type", value: "Not yet mapped", missing: true },
      { label: "Slurry planned", value: "None planned", missing: true },
    ]);
  });

  it("never reads the value of an explicitly unavailable tracked value", () => {
    const f = field({ fertility: { pIndex: tracked(2, "unavailable", "none"), kIndex: tracked(3, "verified", "Soil test") } });
    const view = farmFieldLensView("nutrients", f, none);
    expect(view.markerLabel).toBe("P? · K3");
    expect(view.facts[0]).toEqual({ label: "P", value: "Unknown", missing: true });
    expect(view.facts[1]).toEqual({ label: "K", value: "Index 3" });
  });

  it("reads real recorded soil values and the field's real slurry allocation", () => {
    const f = field({
      fertility: {
        pIndex: tracked(2, "verified", "Soil test"),
        kIndex: tracked(2, "verified", "Soil test"),
        pH: tracked(6.2, "verified", "Soil test"),
        verifiedTest: { sampleDate: "2026-02-14", laboratory: "Lab", sampleRef: "S1", p: 4, k: 80, pH: 6.2 },
      },
      mappedSoil: { soilAssociation: "Elton", dominantSeries: "Elton", texture: "loam", drainage: "well_drained", coveragePct: 100, datasetVersion: "v1", source: "Teagasc" },
    });
    const allocations = [
      { fieldId: "f1", housingId: "h1", volumeM3: 30, priority: "high" },
      { fieldId: "f1", housingId: "h2", volumeM3: 12, priority: "medium" },
      { fieldId: "f2", housingId: "h1", volumeM3: 99, priority: "high" },
    ] as SlurryAllocation[];
    const nutrients = farmFieldLensView("nutrients", f, { slurryAllocations: allocations });
    expect(nutrients.markerLabel).toBe("P2 · K2");
    expect(nutrients.facts.map((x) => x.value)).toEqual(["Index 2", "Index 2", "6.2", "14 Feb 2026", "Elton", "42 m³"]);
    expect(nutrients.links[0]).toEqual({ href: "/fields?field=f1&chapter=nutrients", label: "Recommendation setup" });
    expect(nutrients.links).toContainEqual({ href: "/soil", label: "Soil by field" });
    expect(nutrients.unavailableNote).toBeUndefined();
  });

  it("labels a modelled or farmer-entered value by its provenance, never as a measurement", () => {
    const f = field({ fertility: { pIndex: tracked(2, "estimated", "Assumption"), kIndex: tracked(3, "verified", "Soil test"), pH: tracked(6.4, "farmer_adjusted", "Farmer") } });
    const nutrients = farmFieldLensView("nutrients", f, none);
    expect(nutrients.markerLabel).toBe("P2 · K3 (est.)");
    expect(nutrients.facts[0]).toEqual({ label: "P", value: "Index 2", basis: "Estimated" });
    expect(nutrients.facts[1]).toEqual({ label: "K", value: "Index 3" });
    expect(nutrients.facts[2]).toEqual({ label: "pH", value: "6.4", basis: "Farmer entered" });
  });

  it("treats an absent field use as unresolved, never grazing", () => {
    expect(farmFieldLensView("current", field(), none)).toMatchObject({ markerLabel: undefined, facts: [{ label: "Use", value: "Not set", missing: true }] });
    expect(farmFieldLensView("current", field({ plannedUse: tracked("grazing", "farmer_adjusted", "Farmer") }), none).markerLabel).toBe("Grazing");
  });

  it("keeps an unmeasured Grass field explicitly unknown and Conditions honest", () => {
    const grass = farmFieldLensView("grass", field(), none);
    expect(grass.markerLabel).toBe("No cover");
    expect(grass.facts[0]).toEqual({ label: "Cover", value: "No reading", missing: true });
    expect(grass.links).toContainEqual({ href: "/grass", label: "Open Grass analysis" });
    expect(grass.unavailableNote).toMatch(/establish ground truth/i);
    const conditions = farmFieldLensView("conditions", field(), { slurryAllocations: [], conditionsFacts: ["Slurry · Closed period"] });
    expect(conditions.markerLabel).toBeUndefined();
    expect(conditions.facts).toEqual([{ label: "Calendar", value: "Slurry · Closed period" }]);
    expect(conditions.unavailableNote).toMatch(/workability aren't available/);
  });

  it("shows the Farm Grass lens as demand-aware when linked cattle demand is applied", () => {
    const state: GrassFieldState = {
      status: "known",
      fieldId: "f1",
      areaHa: 4.2,
      measured: {
        observationId: "obs-1",
        coverKgDmHa: 1600,
        method: "plate_meter",
        observedAt: "2026-05-08T12:00:00.000Z",
        source: "Farmer",
        ageDays: 2,
      },
      current: {
        basis: "estimated",
        coverKgDmHa: 1525,
        rawCoverKgDmHa: 1525,
        clampedAtZero: false,
        elapsedDays: 2,
        growth: {
          observationId: "growth-1",
          growthRateKgDmHaDay: 50,
          origin: "farmer_entered",
          observedAt: "2026-05-08T12:00:00.000Z",
          source: "Farmer",
        },
        demand: {
          status: "time_bounded",
          currentDailyDemandKgDm: 367.5,
          demandRemovedKgDm: 735,
          demandRemovedKgDmHa: 175,
          windowCount: 1,
          unresolvedSessionCount: 0,
          completeness: "complete",
        },
      },
      confidence: "HIGH",
      band: "target",
    };
    const view = farmFieldLensView("grass", field(), {
      slurryAllocations: [],
      grassStateByField: new Map([["f1", state]]),
      grassGrazingGroupsByField: new Map([["f1", ["Stores (35 head)"]]]),
    });
    expect(view.markerLabel).toBe("1,525 kg DM/ha");
    expect(view.facts[0].basis).toMatch(/linked grazing demand/i);
    expect(view.unavailableNote).toBeUndefined();
  });

  it("flags a partial demand estimate rather than presenting it as complete", () => {
    const state: GrassFieldState = {
      status: "known",
      fieldId: "f1",
      areaHa: 4.2,
      measured: {
        observationId: "obs-1",
        coverKgDmHa: 1600,
        method: "plate_meter",
        observedAt: "2026-05-08T12:00:00.000Z",
        source: "Farmer",
        ageDays: 2,
      },
      current: {
        basis: "estimated",
        coverKgDmHa: 1575,
        rawCoverKgDmHa: 1575,
        clampedAtZero: false,
        elapsedDays: 2,
        growth: {
          observationId: "growth-1",
          growthRateKgDmHaDay: 50,
          origin: "farmer_entered",
          observedAt: "2026-05-08T12:00:00.000Z",
          source: "Farmer",
        },
        demand: {
          status: "time_bounded",
          currentDailyDemandKgDm: 200,
          demandRemovedKgDm: 525,
          demandRemovedKgDmHa: 125,
          windowCount: 1,
          unresolvedSessionCount: 1,
          completeness: "partial",
        },
      },
      confidence: "HIGH",
      band: "target",
    };
    const view = farmFieldLensView("grass", field(), {
      slurryAllocations: [],
      grassStateByField: new Map([["f1", state]]),
      grassGrazingGroupsByField: new Map([["f1", ["Stores (20 head)", "Weanlings (12 head)"]]]),
    });
    expect(view.unavailableNote).toMatch(/may overstate available grass/i);
  });

  it("gives every non-Current lens its own marker colour and keeps Current neutral", () => {
    expect(FARM_LENS_MARKER_COLOR.current).toBeUndefined();
    const colours = FARM_LENSES.filter((l) => l.id !== "current").map((l) => FARM_LENS_MARKER_COLOR[l.id]);
    expect(new Set(colours).size).toBe(3);
  });

  it("round-trips the field nutrient plan's return to the farm map, ignoring an unknown lens", () => {
    expect(fieldNutrientPlanHref("f 1")).toBe("/today/field/f%201");
    const back = farmSpatialReturnHref("f 1");
    expect(parseFarmSpatialReturn(back.slice(back.indexOf("?")))).toEqual({ lens: "nutrients", fieldId: "f 1" });
    expect(parseFarmSpatialReturn("?lens=bogus&field=f2")).toEqual({ fieldId: "f2" });
    // A link written before Soil joined Nutrients opens the Nutrients lens.
    expect(parseFarmSpatialReturn("?lens=soil&field=f2")).toEqual({ lens: "nutrients", fieldId: "f2" });
    expect(parseFarmSpatialReturn("")).toEqual({});
  });

  it("keeps a path to the selected field's detail in every lens (T16)", () => {
    for (const lens of FARM_LENSES) {
      const links = farmFieldLensView(lens.id, field(), none).links;
      expect(links).toContainEqual({ href: "/fields?field=f1", label: "Field detail" });
    }
  });

  it("builds the field workspace route from the real id, with only Overview / Nutrients / History chapters", () => {
    expect(fieldWorkspaceHref("f 1")).toBe("/fields?field=f%201");
    expect(fieldWorkspaceHref("f1", "nutrients")).toBe("/fields?field=f1&chapter=nutrients");
    expect(fieldWorkspaceHref("f1", "history")).toBe("/fields?field=f1&chapter=history");
    expect(parseFieldWorkspaceChapter("history")).toBe("history");
    expect(parseFieldWorkspaceChapter("soil")).toBe("overview");
    expect(parseFieldWorkspaceChapter("activity")).toBe("overview");
    expect(parseFieldWorkspaceChapter(null)).toBe("overview");
  });
});
