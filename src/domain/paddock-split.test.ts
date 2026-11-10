import { describe, expect, it } from "vitest";
import { area, polygon } from "@turf/turf";
import { applyFences, evenFences, orderPaddocks, validatePaddockSplit } from "./paddock-split";

// About 140 m x 110 m near Sixmilebridge.
const FIELD: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[-8.79, 52.74], [-8.788, 52.74], [-8.788, 52.741], [-8.79, 52.741], [-8.79, 52.74]]] };
const m2 = (p: GeoJSON.Polygon) => area(polygon(p.coordinates));

describe("splitting a field into paddocks", () => {
  it("cuts along a fence drawn across the field, and the paddocks add up to the field", () => {
    const r = applyFences(FIELD, [[[-8.789, 52.7395], [-8.7891, 52.7415]]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paddocks).toHaveLength(2);
    const sum = r.paddocks.reduce((s, p) => s + m2(p), 0);
    expect(Math.abs(sum - m2(FIELD)) / m2(FIELD)).toBeLessThan(0.001);
  });

  it("refuses a fence that doesn't cross the field", () => {
    const r = applyFences(FIELD, [[[-8.795, 52.7395], [-8.794, 52.7415]]]);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/cross the field/);
  });

  it("follows a bent fence and handles a second fence across both paddocks", () => {
    const bent = [[-8.789, 52.7395], [-8.7892, 52.7405], [-8.7889, 52.7415]];
    const across = [[-8.7905, 52.7405], [-8.7875, 52.7405]];
    const r = applyFences(FIELD, [bent, across]);
    expect(r.ok && r.paddocks.length).toBe(4);
  });

  it("splits evenly into equal-area strips", () => {
    const r = applyFences(FIELD, evenFences(FIELD, 3));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paddocks).toHaveLength(3);
    for (const p of r.paddocks) expect(Math.abs(m2(p) - m2(FIELD) / 3) / (m2(FIELD) / 3)).toBeLessThan(0.01);
  });

  it("only saves paddocks that cover the field exactly, with their own names", () => {
    const r = applyFences(FIELD, evenFences(FIELD, 2));
    if (!r.ok) throw new Error(r.error);
    const [a, b] = orderPaddocks(r.paddocks);
    expect(validatePaddockSplit(FIELD, [{ name: "Top", polygon: a }, { name: "Bottom", polygon: b }], ["Martins"])).toBeNull();
    expect(validatePaddockSplit(FIELD, [{ name: "Top", polygon: a }, { name: "top", polygon: b }], [])).toMatch(/already used/);
    expect(validatePaddockSplit(FIELD, [{ name: "Martins", polygon: a }, { name: "B", polygon: b }], ["Martins"])).toMatch(/already used/);
    expect(validatePaddockSplit(FIELD, [{ name: "Only half", polygon: a }, { name: "Half again", polygon: a }], [])).toMatch(/exactly once/);
  });
});
