import { describe, expect, it } from "vitest";
import { calculateSpreadableAreaFromExclusions } from "./spreadable-area-geometry";

const FIELD: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[
    [-8.0000, 53.0000],
    [-7.9900, 53.0000],
    [-7.9900, 53.0100],
    [-8.0000, 53.0100],
    [-8.0000, 53.0000],
  ]],
};

const EXCLUSION: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[
    [-7.9990, 53.0010],
    [-7.9970, 53.0010],
    [-7.9970, 53.0030],
    [-7.9990, 53.0030],
    [-7.9990, 53.0010],
  ]],
};

describe("spreadable area geometry", () => {
  it("uses the whole mapped field when there are no exclusions", () => {
    const result = calculateSpreadableAreaFromExclusions(FIELD, []);
    expect(result.excludedAreaHa).toBe(0);
    expect(result.spreadableAreaHa).toBe(result.grossAreaHa);
    expect(result.exclusions).toEqual([]);
  });

  it("subtracts a mapped exclusion and keeps the geometry", () => {
    const result = calculateSpreadableAreaFromExclusions(FIELD, [EXCLUSION]);
    expect(result.excludedAreaHa).toBeGreaterThan(0);
    expect(result.spreadableAreaHa).toBeLessThan(result.grossAreaHa);
    expect(result.spreadableAreaHa).toBeCloseTo(result.grossAreaHa - result.excludedAreaHa, 3);
    expect(result.exclusions).toEqual([EXCLUSION]);
  });

  it("clips an exclusion to the field rather than subtracting off-field area", () => {
    const partlyOutside: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[
        [-8.002, 53.002], [-7.998, 53.002], [-7.998, 53.004], [-8.002, 53.004], [-8.002, 53.002],
      ]],
    };
    const result = calculateSpreadableAreaFromExclusions(FIELD, [partlyOutside]);
    expect(result.excludedAreaHa).toBeGreaterThan(0);
    expect(result.spreadableAreaHa).toBeGreaterThanOrEqual(0);
  });
});
