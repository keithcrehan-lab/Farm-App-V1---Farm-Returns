/**
 * "Is the farmer standing at/near this real field?" — a pure, tested
 * domain module, not a UI-embedded guess.
 *
 * Final whole-session Codex audit (Strict Visual Reproduction phase,
 * `docs/farm-return-next/audit-logs/20260903T155348Z.md`, CRITICAL):
 * `NearbyFieldCard.tsx`'s own inline version of this check (a) measured
 * distance to a field's centroid, which understates real proximity for
 * a farmer standing inside a large field's own boundary but far from its
 * geometric centre, and worse, overstates it for a farmer just outside a
 * large field near its edge; and (b) never looked at the real position
 * fix's own `accuracyMeters` at all — a low-accuracy fix (a poor GPS lock
 * easily 100m+ off) could make the production claim "Looks like you're
 * near Back Meadow" from somewhere that isn't. Both are now real,
 * pure-function behaviour here, not a UI component's own arithmetic:
 * distance to a field's real polygon boundary (or 0 when the position is
 * inside it), and a hard fail-closed refusal to claim proximity at all
 * when the position's own reported accuracy isn't good enough to trust
 * that claim against `NEAR_FIELD_THRESHOLD_KM`.
 */
import type { GeoPoint } from "./weather-stations";
import type { Field } from "./types";

/** 300m — genuinely at/near the field, not just on the farm somewhere.
 * A proximity heuristic, not an agronomic/regulatory constant — no
 * evidence-registry entry the way a scientific rule needs one, but still
 * versioned and centralised here rather than inlined in a component. */
export const NEAR_FIELD_THRESHOLD_KM = 0.3;

/** Fail-closed accuracy bound: a position fix reporting worse than this
 * (or no accuracy figure at all) can't be trusted to support a
 * `NEAR_FIELD_THRESHOLD_KM`-scale claim — a 100m-uncertain fix could
 * genuinely be anywhere in a 200m-wide circle, which is not "near" a
 * specific field in any meaningful sense. */
export const NEAR_FIELD_MAX_ACCURACY_M = 100;

export interface NearFieldPosition extends GeoPoint {
  /** Real one-shot browser geolocation accuracy, metres — `undefined`
   * (not just a poor number) fails closed the same as a reported bad one,
   * since an unknown accuracy is not a trustworthy one either. */
  accuracyMeters?: number;
}

/** Real ray-casting point-in-polygon test on the exterior ring — standard
 * algorithm, no field-specific tuning. Interior holes (`polygon.
 * coordinates[1+]`) are not modelled: no field in this app's own domain
 * model has ever carried one, and treating a field as a simple polygon
 * matches every other consumer of `Field.polygon` (`field-boundary.ts`'s
 * own `computeBoundaryGeometry`, `MapHero`'s own rendering). */
function pointInRing(point: GeoPoint, ring: GeoJSON.Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > point.latitude !== yj > point.latitude && point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Local flat-plane projection (equirectangular, referenced to the query
 * point's own latitude) — a real, standard small-area approximation, not
 * a fabricated shortcut: at field scale (a few hundred metres at most)
 * the Earth's curvature error this introduces is negligible, the same
 * assumption every other short-range distance in this app's domain
 * layer already makes implicitly via the haversine formula's own
 * small-angle behaviour. Returns {x, y} in kilometres. */
function toLocalKm(point: GeoPoint, origin: GeoPoint): { x: number; y: number } {
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    x: (point.longitude - origin.longitude) * kmPerDegLng,
    y: (point.latitude - origin.latitude) * kmPerDegLat,
  };
}

/** Shortest distance (km) from `point` to a single line segment `[a, b]`,
 * all already in local flat-plane km coordinates — standard point-to-
 * segment projection, clamped to the segment's own endpoints. */
function pointToSegmentKm(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  const closest = { x: a.x + t * abx, y: a.y + t * aby };
  return Math.hypot(p.x - closest.x, p.y - closest.y);
}

/** Real distance (km) from `point` to a field's actual mapped boundary —
 * 0 when `point` is inside it, otherwise the shortest distance to its
 * nearest edge. Never centroid distance, which both understates
 * proximity for a large field's interior and overstates it near a large
 * field's own edge. */
export function distanceToPolygonKm(point: GeoPoint, polygon: GeoJSON.Polygon): number {
  const ring = polygon.coordinates[0] ?? [];
  if (ring.length < 3) return Infinity; // Not a real polygon — never claim a distance to it.
  if (pointInRing(point, ring)) return 0;
  const p = toLocalKm(point, point);
  let min = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = toLocalKm({ longitude: ring[i][0], latitude: ring[i][1] }, point);
    const b = toLocalKm({ longitude: ring[i + 1][0], latitude: ring[i + 1][1] }, point);
    min = Math.min(min, pointToSegmentKm(p, a, b));
  }
  return min;
}

/**
 * The single real field a farmer at `position` is genuinely at or near —
 * `null` whenever that can't honestly be claimed: no position, a
 * position whose own accuracy isn't good enough to trust
 * (`NEAR_FIELD_MAX_ACCURACY_M`), or no mapped field within
 * `thresholdKm`. Never the nearest field regardless of how far away it
 * actually is, and never centroid-based (see `distanceToPolygonKm`).
 */
export function findNearbyField(fields: readonly Field[], position: NearFieldPosition | null, thresholdKm = NEAR_FIELD_THRESHOLD_KM): Field | null {
  if (!position) return null;
  if (position.accuracyMeters === undefined || position.accuracyMeters > NEAR_FIELD_MAX_ACCURACY_M) return null;

  const mappedFields = fields.filter((f): f is Field & { polygon: GeoJSON.Polygon } => f.polygon !== undefined);
  let nearest: { field: Field; km: number } | null = null;
  for (const field of mappedFields) {
    const km = distanceToPolygonKm(position, field.polygon);
    if (!nearest || km < nearest.km) nearest = { field, km };
  }
  return nearest && nearest.km <= thresholdKm ? nearest.field : null;
}
