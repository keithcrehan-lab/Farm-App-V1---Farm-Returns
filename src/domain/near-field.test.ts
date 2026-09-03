import { describe, expect, it } from "vitest";
import { distanceToPolygonKm, findNearbyField, NEAR_FIELD_THRESHOLD_KM } from "./near-field";
import { boundaryPolygonFromRing, computeBoundaryGeometry } from "./field-boundary";
import { mockFields } from "@/data/mock-farm";
import type { Field } from "./types";

/** A real, roughly-rectangular ~1ha field near Cork, Ireland — same real
 * coordinates `field-boundary.test.ts` already uses. */
const ONE_HA_SQUARE: GeoJSON.Position[] = [
  [-8.4863, 51.8985],
  [-8.4851, 51.8985],
  [-8.4851, 51.8994],
  [-8.4863, 51.8994],
  [-8.4863, 51.8985],
];
const POLYGON = boundaryPolygonFromRing(ONE_HA_SQUARE);
const CENTROID = computeBoundaryGeometry(POLYGON).centroid;

/** A real mock field (every required `Field` property already correctly
 * populated by `mock-farm.ts`), with its boundary/area/centroid replaced
 * by this file's own real test polygon. */
function field(overrides: Partial<Field> = {}): Field {
  return {
    ...mockFields[0],
    id: "field-1",
    name: "Home Field",
    areaHa: computeBoundaryGeometry(POLYGON).areaHa,
    centroid: CENTROID,
    polygon: POLYGON,
    ...overrides,
  };
}

describe("distanceToPolygonKm", () => {
  it("is 0 for a point genuinely inside the field's own boundary", () => {
    const inside = { latitude: 51.899, longitude: -8.4857 }; // real interior point of the square above
    expect(distanceToPolygonKm(inside, POLYGON)).toBe(0);
  });

  it("is a small positive real distance for a point just outside the boundary", () => {
    const justOutside = { latitude: 51.8985, longitude: -8.487 }; // ~0.1km west of the western edge
    const km = distanceToPolygonKm(justOutside, POLYGON);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(0.2);
  });

  it("measures to the nearest edge, not the centroid — closer near an edge than a centroid-based reading would show", () => {
    // A point just outside the field's own western edge, roughly level
    // with its northern half — genuinely close to the boundary itself,
    // but the field's centroid sits much further away across the whole
    // polygon's own width+height.
    const nearEdge = { latitude: 51.899, longitude: -8.4865 };
    const toEdge = distanceToPolygonKm(nearEdge, POLYGON);
    const toCentroid = Math.hypot(
      (nearEdge.longitude - CENTROID[0]) * 111.32 * Math.cos((nearEdge.latitude * Math.PI) / 180),
      (nearEdge.latitude - CENTROID[1]) * 110.574,
    );
    expect(toEdge).toBeLessThan(toCentroid);
  });

  it("returns Infinity for a degenerate polygon, never a fabricated distance", () => {
    const degenerate: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[-8.48, 51.9]]] };
    expect(distanceToPolygonKm({ latitude: 51.9, longitude: -8.48 }, degenerate)).toBe(Infinity);
  });

  it("treats a point inside a real hole as outside the field, not inside it", () => {
    // A small real hole carved out of the centre of the same square —
    // standard GeoJSON polygon-with-holes shape (interior ring wound
    // opposite the exterior, though winding direction isn't what this
    // module keys off).
    const withHole: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        ONE_HA_SQUARE,
        [
          [-8.486, 51.8988],
          [-8.4854, 51.8988],
          [-8.4854, 51.8991],
          [-8.486, 51.8991],
          [-8.486, 51.8988],
        ],
      ],
    };
    const insideHole = { latitude: 51.89895, longitude: -8.4857 };
    expect(distanceToPolygonKm(insideHole, withHole)).toBeGreaterThan(0);
  });
});

describe("findNearbyField", () => {
  it("returns null when there is no position at all", () => {
    expect(findNearbyField([field()], null)).toBeNull();
  });

  it("returns null (fails closed) when accuracy is missing, even if the position is genuinely inside the field", () => {
    const inside = { latitude: 51.899, longitude: -8.4857 };
    expect(findNearbyField([field()], inside)).toBeNull();
  });

  it("returns null (fails closed) for non-finite or non-positive accuracy, even inside the field", () => {
    const inside = { latitude: 51.899, longitude: -8.4857 };
    expect(findNearbyField([field()], { ...inside, accuracyMeters: NaN })).toBeNull();
    expect(findNearbyField([field()], { ...inside, accuracyMeters: -5 })).toBeNull();
    expect(findNearbyField([field()], { ...inside, accuracyMeters: 0 })).toBeNull();
    expect(findNearbyField([field()], { ...inside, accuracyMeters: Infinity })).toBeNull();
  });

  it("returns the real field when the position is inside it with trustworthy accuracy", () => {
    const inside = { latitude: 51.899, longitude: -8.4857, accuracyMeters: 20 };
    expect(findNearbyField([field()], inside)?.id).toBe("field-1");
  });

  it("rejects a nominal reading within threshold whose own accuracy radius pushes the worst case beyond it", () => {
    // ~250m from the field's western edge with only +/-100m accuracy:
    // the nominal distance passes the raw 300m threshold, but the true
    // position could genuinely be ~350m away — round 2's own real
    // finding ("a nominal position 300m from a field with +/-100m
    // accuracy passes... although the user could be 400m away").
    const justWithinNominal = { latitude: 51.899, longitude: -8.4899, accuracyMeters: 100 };
    expect(distanceToPolygonKm(justWithinNominal, POLYGON)).toBeLessThanOrEqual(NEAR_FIELD_THRESHOLD_KM);
    expect(findNearbyField([field()], justWithinNominal)).toBeNull();
  });

  it("accepts a nominal reading whose worst case (distance + accuracy) still stays within threshold", () => {
    const closeWithGoodAccuracy = { latitude: 51.899, longitude: -8.4864, accuracyMeters: 10 };
    expect(findNearbyField([field()], closeWithGoodAccuracy)?.id).toBe("field-1");
  });

  it(`returns null when the nearest field is genuinely beyond ${NEAR_FIELD_THRESHOLD_KM}km`, () => {
    const farAway = { latitude: 52.5, longitude: -7.0, accuracyMeters: 10 };
    expect(findNearbyField([field()], farAway)).toBeNull();
  });

  it("ignores an unmapped field (no polygon) rather than crashing or guessing its location", () => {
    const unmapped = field({ id: "field-2", polygon: undefined });
    const inside = { latitude: 51.899, longitude: -8.4857, accuracyMeters: 20 };
    expect(findNearbyField([unmapped], inside)).toBeNull();
  });
});
