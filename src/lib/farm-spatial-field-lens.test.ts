import { describe, expect, it } from "vitest";
import { tracked, type Field, type SlurryAllocation } from "@/domain/types";
import { FARM_LENS_MARKER_COLOR, farmFieldLensView, farmSpatialReturnHref, fieldNutrientPlanHref, parseFarmSpatialReturn } from "./farm-spatial-field-lens";
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
  it("shows Unknown, never a default, when P/K/pH/soil/test are missing", () => {
    const soil = farmFieldLensView("soil", field(), none);
    expect(soil.markerLabel).toBe("pH unknown");
    expect(soil.facts).toEqual([
      { label: "pH", value: "Unknown", missing: true },
      { label: "P", value: "Unknown", missing: true },
      { label: "K", value: "Unknown", missing: true },
      { label: "Soil type", value: "Not yet mapped", missing: true },
      { label: "Soil test", value: "No lab test", missing: true },
    ]);
    expect(farmFieldLensView("nutrients", field(), none).markerLabel).toBe("P · K unknown");
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
    expect(nutrients.facts.map((x) => x.value)).toEqual(["Index 2", "Index 2", "14 Feb 2026", "42 m³"]);
    expect(nutrients.links[0]).toEqual({ href: "/nutrients?field=f1", label: "Nutrient planner" });
    expect(nutrients.unavailableNote).toBeUndefined();
    const soil = farmFieldLensView("soil", f, none);
    expect(soil.markerLabel).toBe("pH 6.2");
    expect(soil.facts.find((x) => x.label === "Soil type")?.value).toBe("Elton");
  });

  it("labels a modelled or farmer-entered value by its provenance, never as a measurement", () => {
    const f = field({ fertility: { pIndex: tracked(2, "estimated", "Assumption"), kIndex: tracked(3, "verified", "Soil test"), pH: tracked(6.4, "farmer_adjusted", "Farmer") } });
    expect(farmFieldLensView("nutrients", f, none).markerLabel).toBe("P2 · K3 (est.)");
    const soil = farmFieldLensView("soil", f, none);
    expect(soil.markerLabel).toBe("pH 6.4 (est.)");
    expect(soil.facts[0]).toEqual({ label: "pH", value: "6.4", basis: "Farmer entered" });
    expect(soil.facts[1]).toEqual({ label: "P", value: "Index 2", basis: "Estimated" });
    expect(soil.facts[2]).toEqual({ label: "K", value: "Index 3" });
  });

  it("treats an absent field use as unresolved, never grazing", () => {
    expect(farmFieldLensView("current", field(), none)).toMatchObject({ markerLabel: undefined, facts: [{ label: "Use", value: "Not set", missing: true }] });
    expect(farmFieldLensView("current", field({ plannedUse: tracked("grazing", "farmer_adjusted", "Farmer") }), none).markerLabel).toBe("Grazing");
  });

  it("gives Grass and Conditions no per-field value, only an honest note", () => {
    const grass = farmFieldLensView("grass", field(), none);
    expect(grass.markerLabel).toBeUndefined();
    expect(grass.facts).toEqual([]);
    expect(grass.unavailableNote).toMatch(/aren't measured/);
    const conditions = farmFieldLensView("conditions", field(), { slurryAllocations: [], conditionsFacts: ["Slurry · Closed period"] });
    expect(conditions.markerLabel).toBeUndefined();
    expect(conditions.facts).toEqual([{ label: "Calendar", value: "Slurry · Closed period" }]);
    expect(conditions.unavailableNote).toMatch(/workability aren't available/);
  });

  it("gives every non-Current lens its own marker colour and keeps Current neutral", () => {
    expect(FARM_LENS_MARKER_COLOR.current).toBeUndefined();
    const colours = FARM_LENSES.filter((l) => l.id !== "current").map((l) => FARM_LENS_MARKER_COLOR[l.id]);
    expect(new Set(colours).size).toBe(4);
  });

  it("round-trips the field nutrient plan's return to the farm map, ignoring an unknown lens", () => {
    expect(fieldNutrientPlanHref("f 1")).toBe("/today/field/f%201");
    const back = farmSpatialReturnHref("f 1");
    expect(parseFarmSpatialReturn(back.slice(back.indexOf("?")))).toEqual({ lens: "nutrients", fieldId: "f 1" });
    expect(parseFarmSpatialReturn("?lens=bogus&field=f2")).toEqual({ fieldId: "f2" });
    expect(parseFarmSpatialReturn("")).toEqual({});
  });

  it("keeps a path to the selected field's detail in every lens (T16)", () => {
    for (const lens of FARM_LENSES) {
      const links = farmFieldLensView(lens.id, field(), none).links;
      expect(links).toContainEqual({ href: "/fields?field=f1", label: "Field detail" });
    }
  });
});
