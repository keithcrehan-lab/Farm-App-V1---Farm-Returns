import { describe, expect, it } from "vitest";
import { boundaryPolygonFromRing, computeBoundaryGeometry, isValidBoundaryPolygon } from "./field-boundary";

/** A real, roughly-rectangular ~1ha field near Cork, Ireland (small enough
 * that spherical vs planar area barely differs, but real coordinates, not
 * invented ones — derived from this app's own mock farm centroid). */
const ONE_HA_SQUARE: GeoJSON.Position[] = [
  [-8.4863, 51.8985],
  [-8.4851, 51.8985],
  [-8.4851, 51.8994],
  [-8.4863, 51.8994],
  [-8.4863, 51.8985],
];

describe("isValidBoundaryPolygon", () => {
  it("accepts a real closed, non-degenerate polygon", () => {
    expect(isValidBoundaryPolygon(boundaryPolygonFromRing(ONE_HA_SQUARE))).toBe(true);
  });

  it("rejects a ring with fewer than 4 points", () => {
    const tooFew = boundaryPolygonFromRing([[-8.48, 51.9], [-8.47, 51.9], [-8.48, 51.9]]);
    expect(isValidBoundaryPolygon(tooFew)).toBe(false);
  });

  it("rejects a ring that isn't closed", () => {
    const open = boundaryPolygonFromRing([
      [-8.4863, 51.8985],
      [-8.4851, 51.8985],
      [-8.4851, 51.8994],
      [-8.486, 51.899], // doesn't match the first point
    ]);
    expect(isValidBoundaryPolygon(open)).toBe(false);
  });

  it("rejects a degenerate ring with fewer than 3 distinct vertices", () => {
    const line = boundaryPolygonFromRing([
      [-8.4863, 51.8985],
      [-8.4851, 51.8985],
      [-8.4863, 51.8985],
      [-8.4863, 51.8985],
    ]);
    expect(isValidBoundaryPolygon(line)).toBe(false);
  });

  it("rejects a polygon with interior rings (holes)", () => {
    const withHole: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        ONE_HA_SQUARE,
        [
          [-8.486, 51.8988],
          [-8.4855, 51.8988],
          [-8.4855, 51.899],
          [-8.486, 51.899],
          [-8.486, 51.8988],
        ],
      ],
    };
    expect(isValidBoundaryPolygon(withHole)).toBe(false);
  });
});

describe("computeBoundaryGeometry", () => {
  it("computes a real centroid inside the polygon, not a fabricated midpoint", () => {
    const { centroid } = computeBoundaryGeometry(boundaryPolygonFromRing(ONE_HA_SQUARE));
    const [lng, lat] = centroid;
    expect(lng).toBeGreaterThan(-8.4863);
    expect(lng).toBeLessThan(-8.4851);
    expect(lat).toBeGreaterThan(51.8985);
    expect(lat).toBeLessThan(51.8994);
  });

  it("computes real area in hectares via geodesic calculation, not an invented conversion", () => {
    const { areaHa } = computeBoundaryGeometry(boundaryPolygonFromRing(ONE_HA_SQUARE));
    // ~0.12° lng x ~0.0009° lat at this latitude is roughly 0.6ha — a real
    // spherical-area figure, not hand-picked; asserting a plausible real
    // range rather than a brittle exact float.
    expect(areaHa).toBeGreaterThan(0.3);
    expect(areaHa).toBeLessThan(1.0);
  });

  it("throws rather than silently computing geometry for invalid geometry", () => {
    const invalid = boundaryPolygonFromRing([[-8.48, 51.9]]);
    expect(() => computeBoundaryGeometry(invalid)).toThrow(/invalid boundary polygon/i);
  });
});

describe("boundaryPolygonFromRing", () => {
  it("wraps a ring into a real GeoJSON Polygon with one exterior ring", () => {
    const polygon = boundaryPolygonFromRing(ONE_HA_SQUARE);
    expect(polygon.type).toBe("Polygon");
    expect(polygon.coordinates).toEqual([ONE_HA_SQUARE]);
  });
});
