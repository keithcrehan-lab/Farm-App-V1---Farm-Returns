import { describe, expect, it } from "vitest";
import { area, polygon } from "@turf/turf";
import { applyFences, evenFences, evenFencesAtBearing, fitAllFences, fitFence, orderPaddocks, shortestFenceBearing, straightenTrace, validatePaddockSplit } from "./paddock-split";

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

  it("keeps fences inside the field: ends drawn inside join the edge, and nothing runs past it", () => {
    const fitted = fitFence(FIELD, [], [[-8.789, 52.7403], [-8.789, 52.7407]]);
    expect(fitted).not.toBeNull();
    if (!fitted) return;
    expect(fitted[0][1]).toBeCloseTo(52.74, 6);
    expect(fitted[fitted.length - 1][1]).toBeCloseTo(52.741, 6);
    const trimmed = fitFence(FIELD, [], [[-8.789, 52.7390], [-8.789, 52.7420]]);
    expect(trimmed && Math.min(...trimmed.map((p) => p[1]))).toBeGreaterThanOrEqual(52.74 - 1e-9);
    expect(trimmed && Math.max(...trimmed.map((p) => p[1]))).toBeLessThanOrEqual(52.741 + 1e-9);
    const r = applyFences(FIELD, [fitted]);
    expect(r.ok && r.paddocks.length).toBe(2);
  });

  it("stops a new fence at an existing one, so only that paddock is split", () => {
    const first = fitFence(FIELD, [], [[-8.789, 52.7403], [-8.789, 52.7407]])!;
    const second = fitFence(FIELD, [first], [[-8.7897, 52.7405], [-8.7893, 52.7405]])!;
    expect(second[second.length - 1][0]).toBeCloseTo(-8.789, 6);
    const r = applyFences(FIELD, [first, second]);
    expect(r.ok && r.paddocks.length).toBe(3);
  });

  it("leaves a fitted fence where it is when it is fitted again", () => {
    const first = fitFence(FIELD, [], [[-8.789, 52.7403], [-8.789, 52.7407]])!;
    const again = fitFence(FIELD, [], first)!;
    expect(again).toHaveLength(first.length);
    again.forEach((p, i) => { expect(p[0]).toBeCloseTo(first[i][0], 6); expect(p[1]).toBeCloseTo(first[i][1], 6); });
    // A fence that stopped at another fence still stops there.
    const second = fitFence(FIELD, [first], [[-8.7897, 52.7405], [-8.7893, 52.7405]])!;
    const secondAgain = fitFence(FIELD, [first], second)!;
    expect(secondAgain[secondAgain.length - 1][0]).toBeCloseTo(-8.789, 6);
    const r = applyFences(FIELD, [again, secondAgain]);
    expect(r.ok && r.paddocks.length).toBe(3);
  });

  it("refits every fence after an edit: a fence that joined a deleted fence carries on to the field edge", () => {
    const upright = [[-8.789, 52.7403], [-8.789, 52.7407]];
    const stub = [[-8.7897, 52.7405], [-8.7893, 52.7405]];
    const both = fitAllFences(FIELD, [upright, stub]);
    expect(both.ok).toBe(true);
    if (!both.ok) return;
    expect(both.fences[1][both.fences[1].length - 1][0]).toBeCloseTo(-8.789, 6);
    const alone = fitAllFences(FIELD, [stub]);
    expect(alone.ok).toBe(true);
    if (!alone.ok) return;
    expect(alone.fences[0][alone.fences[0].length - 1][0]).toBeCloseTo(-8.788, 6);
    const r = applyFences(FIELD, alone.fences);
    expect(r.ok && r.paddocks.length).toBe(2);
    expect(fitAllFences(FIELD, [upright, [[-8.795, 52.7395], [-8.794, 52.7415]]])).toMatchObject({ ok: false, index: 1 });
  });

  it("straightens a wobbly finger trace but keeps a real corner", () => {
    // Roughly straight north-south run with a metre or so of wobble.
    const wobbly = [[-8.789, 52.7402], [-8.78901, 52.7403], [-8.78899, 52.7404], [-8.78901, 52.7405], [-8.789, 52.7406]];
    expect(straightenTrace(wobbly, 3)).toEqual([wobbly[0], wobbly[4]]);
    // A 20 m dog-leg is a real corner and stays.
    const corner = [[-8.789, 52.7402], [-8.789, 52.7404], [-8.7887, 52.7406]];
    expect(straightenTrace(corner, 3)).toHaveLength(3);
    expect(straightenTrace([wobbly[0]], 3)).toHaveLength(1);
  });

  it("splits evenly with fences running in any direction", () => {
    for (const bearing of [0, 45, 90, 135]) {
      const drawn = evenFencesAtBearing(FIELD, 4, bearing);
      expect(drawn).toHaveLength(3);
      const fit = fitAllFences(FIELD, drawn);
      expect(fit.ok).toBe(true);
      if (!fit.ok) return;
      const r = applyFences(FIELD, fit.fences);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.paddocks).toHaveLength(4);
      for (const p of r.paddocks) expect(Math.abs(m2(p) - m2(FIELD) / 4) / (m2(FIELD) / 4)).toBeLessThan(0.01);
    }
    expect(evenFencesAtBearing(FIELD, 1, 0)).toEqual([]);
  });

  it("starts an even split with the shortest fences: north-south across a field that is wider than it is tall", () => {
    // FIELD is about 135 m east-west by 111 m north-south, so north-south fences are shortest.
    expect(shortestFenceBearing(FIELD)).toBe(0);
    const tall: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[-8.79, 52.74], [-8.7895, 52.74], [-8.7895, 52.742], [-8.79, 52.742], [-8.79, 52.74]]] };
    expect(shortestFenceBearing(tall)).toBe(90);
  });
});
