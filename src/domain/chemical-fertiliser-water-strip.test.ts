import { describe, expect, it } from "vitest";
import { area, polygon as turfPolygon } from "@turf/turf";
import {
  CHEMICAL_FERTILISER_WATER_STRIP_RULE,
  resolveChemicalFertiliserWaterStrip,
  waterLinesNearField,
} from "./chemical-fertiliser-water-strip";

// ~100 m × ~100 m square near Mullingar (1 m ≈ 0.0000090° lat).
const LAT_M = 1 / 111_320;
const LON_M = 1 / (111_320 * Math.cos((53.5 * Math.PI) / 180));
const west = -7.35;
const south = 53.5;
const field: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [west, south],
      [west + 100 * LON_M, south],
      [west + 100 * LON_M, south + 100 * LAT_M],
      [west, south + 100 * LAT_M],
      [west, south],
    ],
  ],
};
const fieldAreaHa = Math.round((area(turfPolygon(field.coordinates)) / 10_000) * 10_000) / 10_000;

/** A stream running north–south along the west boundary, `offsetM` metres
 * outside it (negative = inside the field). */
const streamAlongWestEdge = (offsetM: number): GeoJSON.MultiLineString => ({
  type: "MultiLineString",
  coordinates: [
    [
      [west - offsetM * LON_M, south - 50 * LAT_M],
      [west - offsetM * LON_M, south + 150 * LAT_M],
    ],
  ],
});

describe("resolveChemicalFertiliserWaterStrip (S.I. 588/2025 Article 18(1))", () => {
  it("cites the statutory 3 m surface-water rule", () => {
    expect(CHEMICAL_FERTILISER_WATER_STRIP_RULE).toMatchObject({
      source: "S.I. No. 588 of 2025, Article 18(1)",
      effectiveFrom: "2026-01-01",
      stripWidthM: 3,
    });
  });

  it("keeps the whole field when the mapped water is at least 3 m away", () => {
    const result = resolveChemicalFertiliserWaterStrip({
      fieldPolygon: field,
      fieldAreaHa,
      featureType: "surface_water",
      distanceM: 3,
    });
    expect(result).toMatchObject({
      status: "WHOLE_FIELD",
      chemicalAreaHa: fieldAreaHa,
      excludedStripHa: 0,
      provenance: { ruleId: CHEMICAL_FERTILISER_WATER_STRIP_RULE.ruleId },
    });
  });

  it("excludes only the 3 m strip, not the whole field, when a stream runs along the boundary", () => {
    const result = resolveChemicalFertiliserWaterStrip({
      fieldPolygon: field,
      fieldAreaHa,
      featureType: "surface_water",
      distanceM: 0,
      waterLines: streamAlongWestEdge(0),
    });
    expect(result.status).toBe("STRIP_EXCLUDED");
    if (result.status !== "STRIP_EXCLUDED") throw new Error("expected a strip");
    // 3 m × 100 m = 300 m² = 0.03 ha, within turf's buffer approximation.
    expect(result.excludedStripHa).toBeGreaterThan(0.028);
    expect(result.excludedStripHa).toBeLessThan(0.032);
    expect(result.chemicalAreaHa + result.excludedStripHa).toBeCloseTo(fieldAreaHa, 4);
    expect(result.provenance).toMatchObject({
      source: "S.I. No. 588 of 2025, Article 18(1)",
      stripWidthM: 3,
    });
    expect(result.strip.type).toMatch(/Polygon/);
  });

  it("narrows the strip when the stream is just outside the boundary", () => {
    const result = resolveChemicalFertiliserWaterStrip({
      fieldPolygon: field,
      fieldAreaHa,
      featureType: "surface_water",
      distanceM: 1,
      waterLines: streamAlongWestEdge(1),
    });
    if (result.status !== "STRIP_EXCLUDED") throw new Error("expected a strip");
    // 2 m of the 3 m strip falls inside the field: ~0.02 ha.
    expect(result.excludedStripHa).toBeGreaterThan(0.018);
    expect(result.excludedStripHa).toBeLessThan(0.022);
  });

  it("F001: never lets a distance of 3 m or more bypass mapped water that reaches the strip", () => {
    for (const distanceM of [3, 10]) {
      const result = resolveChemicalFertiliserWaterStrip({
        fieldPolygon: field,
        fieldAreaHa,
        featureType: "surface_water",
        distanceM,
        waterLines: streamAlongWestEdge(0),
      });
      expect(result).toMatchObject({
        status: "UNKNOWN",
        reasonCode: "CHEMICAL_WATER_STRIP_GEOMETRY_CONFLICT",
      });
    }
  });

  it("F001: excludes the strip for a distance immediately below 3 m", () => {
    const result = resolveChemicalFertiliserWaterStrip({
      fieldPolygon: field,
      fieldAreaHa,
      featureType: "surface_water",
      distanceM: 2.98,
      waterLines: streamAlongWestEdge(2.98),
    });
    if (result.status !== "STRIP_EXCLUDED") throw new Error(`expected a strip, got ${result.status}`);
    expect(result.excludedStripHa).toBeGreaterThan(0);
    expect(result.excludedStripHa).toBeLessThan(0.001);
  });

  it("F001: keeps the whole field when the mapped water is beyond the strip and agrees with the distance", () => {
    const result = resolveChemicalFertiliserWaterStrip({
      fieldPolygon: field,
      fieldAreaHa,
      featureType: "surface_water",
      distanceM: 3.5,
      waterLines: streamAlongWestEdge(3.5),
    });
    expect(result).toMatchObject({ status: "WHOLE_FIELD", excludedStripHa: 0 });
  });

  it("F001: fails closed when mapped water is on file but the field polygon is not", () => {
    const result = resolveChemicalFertiliserWaterStrip({
      fieldAreaHa,
      featureType: "surface_water",
      distanceM: 5,
      waterLines: streamAlongWestEdge(0),
    });
    expect(result).toMatchObject({ status: "UNKNOWN", reasonCode: "CHEMICAL_WATER_STRIP_GEOMETRY_UNRESOLVED", missingInputs: ["polygon"] });
  });

  it("treats a field entirely within 3 m of water as wholly excluded", () => {
    const sliver: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [west + 2 * LON_M, south],
          [west + 2 * LON_M, south + 100 * LAT_M],
          [west, south + 100 * LAT_M],
          [west, south],
        ],
      ],
    };
    const result = resolveChemicalFertiliserWaterStrip({
      fieldPolygon: sliver,
      fieldAreaHa: 0.02,
      featureType: "surface_water",
      distanceM: 0,
      waterLines: streamAlongWestEdge(0),
    });
    expect(result).toMatchObject({
      status: "WHOLE_FIELD_WITHIN_STRIP",
      chemicalAreaHa: 0,
      excludedStripHa: 0.02,
    });
  });

  it.each([
    ["no distance", { featureType: "surface_water" }, "MISSING_NATIONAL_BUFFER_ASSESSMENT"],
    ["a null distance", { featureType: "surface_water", distanceM: null }, "MISSING_NATIONAL_BUFFER_ASSESSMENT"],
    ["a NaN distance", { featureType: "surface_water", distanceM: Number.NaN }, "MISSING_NATIONAL_BUFFER_ASSESSMENT"],
    ["no feature type", { distanceM: 10 }, "MISSING_NATIONAL_BUFFER_ASSESSMENT"],
    ["a distance inside 3 m with no mapped water geometry", { featureType: "surface_water", distanceM: 1 }, "CHEMICAL_WATER_STRIP_GEOMETRY_UNRESOLVED"],
  ] as const)("fails closed for %s — never a pass, never a whole-field prohibition", (_label, evidence, reasonCode) => {
    const result = resolveChemicalFertiliserWaterStrip({ fieldPolygon: field, fieldAreaHa, ...evidence });
    expect(result).toMatchObject({ status: "UNKNOWN", reasonCode });
  });

  it("fails closed when the recorded distance and the mapped water geometry disagree", () => {
    const result = resolveChemicalFertiliserWaterStrip({
      fieldPolygon: field,
      fieldAreaHa,
      featureType: "surface_water",
      distanceM: 1,
      waterLines: streamAlongWestEdge(20),
    });
    expect(result).toMatchObject({
      status: "UNKNOWN",
      reasonCode: "CHEMICAL_WATER_STRIP_GEOMETRY_CONFLICT",
    });
  });
});

describe("waterLinesNearField", () => {
  it("keeps a long segment that crosses the field's neighbourhood with no vertex inside it", () => {
    const kept = waterLinesNearField(field, streamAlongWestEdge(0).coordinates);
    expect(kept?.coordinates).toHaveLength(1);
    expect(kept?.coordinates[0]).toHaveLength(2);
  });

  it("drops water lines that never come near the field", () => {
    expect(waterLinesNearField(field, streamAlongWestEdge(200).coordinates)).toBeUndefined();
  });
});
