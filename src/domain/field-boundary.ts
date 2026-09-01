/**
 * Real field-boundary geometry — Phase 2 (closes the `docs/product-
 * requirements.md` "Mapping provider account" open question). A farmer
 * draws a polygon on real Mapbox satellite imagery
 * (`FieldBoundaryMapModal.tsx`); this module turns that polygon into the
 * derived numbers the rest of the app already depends on (`Field.centroid`,
 * `Field.areaHa` — `docs/data-model.md`'s own comment on `areaHa` already
 * says "derived from polygon, not entered") — real spherical-geometry
 * calculations (Turf.js, wrapping the standard geodesic-area algorithm),
 * never an approximation or an invented conversion factor.
 *
 * Uses the real `GeoJSON.Polygon` type (`docs/data-model.md`'s own
 * `Field.polygon` field), not a custom shape — this is exactly what
 * Mapbox GL Draw emits and what Turf consumes natively, so there's no
 * conversion step to get subtly wrong. Deliberately provider-agnostic
 * beyond that: nothing here mentions Mapbox, so this stays testable and
 * reusable without a browser/WebGL context.
 *
 * This app doesn't support holes/interior rings (no real farm-field use
 * case surfaced for one) — every polygon here has exactly one ring,
 * `coordinates[0]`.
 */

import { area as turfArea, bbox as turfBbox, centroid as turfCentroid, polygon as turfPolygon } from "@turf/turf";

export const FIELD_BOUNDARY_SCHEMA_VERSION = "field_boundary_schema_v1.0.0";

export interface BoundaryGeometry {
  centroid: [number, number];
  areaHa: number;
}

/** A polygon is valid when its exterior ring has at least 4 points (3
 * distinct vertices, closed), is actually closed (first === last, within
 * float tolerance), has no interior rings, and encloses non-zero area.
 * Never silently accepts malformed geometry — every caller must check
 * this before persisting a polygon. */
export function isValidBoundaryPolygon(polygon: GeoJSON.Polygon): boolean {
  if (polygon.coordinates.length !== 1) return false; // no holes supported
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) return false;
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  const closed = Math.abs(firstLng - lastLng) < 1e-9 && Math.abs(firstLat - lastLat) < 1e-9;
  if (!closed) return false;
  const distinctVertices = new Set(ring.slice(0, -1).map(([lng, lat]) => `${lng},${lat}`));
  if (distinctVertices.size < 3) return false;
  try {
    return turfArea(polygon) > 0;
  } catch {
    return false;
  }
}

/**
 * Real centroid + area from a real drawn polygon — never invented, never
 * a bounding-box midpoint. Throws on invalid geometry (callers must
 * validate with `isValidBoundaryPolygon` first, same "never silently
 * accept bad geometry" rule as this app's weather/observation parsing).
 */
export function computeBoundaryGeometry(polygon: GeoJSON.Polygon): BoundaryGeometry {
  if (!isValidBoundaryPolygon(polygon)) {
    throw new Error("computeBoundaryGeometry: invalid boundary polygon (not closed, degenerate, has holes, or zero-area)");
  }
  const feature = turfPolygon(polygon.coordinates);
  const centroidFeature = turfCentroid(feature);
  const [lng, lat] = centroidFeature.geometry.coordinates;
  const areaM2 = turfArea(feature);
  return {
    centroid: [lng, lat],
    // Real unit conversion (1 ha = 10,000 m²), not a fudge factor.
    areaHa: Math.round((areaM2 / 10_000) * 100) / 100,
  };
}

/** Builds a real `GeoJSON.Polygon` from a single closed exterior ring —
 * the shape Mapbox GL Draw's `draw.create`/`draw.update` events already
 * emit as `feature.geometry`, kept as a named helper so callers (and
 * tests) don't hand-construct the `{ type, coordinates }` wrapper inline. */
export function boundaryPolygonFromRing(ring: GeoJSON.Position[]): GeoJSON.Polygon {
  return { type: "Polygon", coordinates: [ring] };
}

/**
 * Real `[minLng, minLat, maxLng, maxLat]` bounding box of a field's
 * boundary polygon — added Checkpoint 2, Vertical H (satellite field
 * intelligence), an additive extension to this frozen contract per
 * `DOMAIN_CONTRACTS.md`'s own "non-breaking, additive... does not
 * require [the change protocol]" carve-out (a new exported function, no
 * existing signature touched). `src/server/satellite/cdse-stac-client.ts`
 * needs a real bounding box to query the Copernicus Data Space
 * Ecosystem's STAC catalogue for scenes covering a field — this is that
 * real geometry, computed by Turf (the same library every other
 * calculation in this file already uses), never approximated from the
 * centroid or invented. Throws on invalid geometry, same discipline as
 * `computeBoundaryGeometry`.
 */
export function boundingBox(polygon: GeoJSON.Polygon): [number, number, number, number] {
  if (!isValidBoundaryPolygon(polygon)) {
    throw new Error("boundingBox: invalid boundary polygon (not closed, degenerate, has holes, or zero-area)");
  }
  const [minLng, minLat, maxLng, maxLat] = turfBbox(turfPolygon(polygon.coordinates));
  return [minLng, minLat, maxLng, maxLat];
}
