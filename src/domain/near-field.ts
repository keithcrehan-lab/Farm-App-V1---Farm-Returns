/**
 * "Is the farmer standing at/near this real field?" — a pure, tested
 * domain module, not a UI-embedded guess.
 *
 * Final whole-session Codex audit round 1 (Strict Visual Reproduction
 * phase, `docs/farm-return-next/audit-logs/20260903T155348Z.md`,
 * CRITICAL): `NearbyFieldCard.tsx`'s own inline version of this check
 * (a) measured distance to a field's centroid, which understates real
 * proximity for a farmer standing inside a large field's own boundary
 * but far from its geometric centre, and worse, overstates it for a
 * farmer just outside a large field near its edge; and (b) never looked
 * at the real position fix's own `accuracyMeters` at all. Both are now
 * real, pure-function behaviour here, not a UI component's own
 * arithmetic: distance to a field's real polygon boundary (0 when the
 * position is genuinely inside it, excluding any real hole), and
 * accuracy folded directly into the acceptance bound.
 *
 * Final whole-session Codex audit round 2 (`docs/farm-return-next/
 * audit-logs/20260903T161401Z.md`, HIGH + MEDIUM): round 1's own
 * accuracy check was a separate pass/fail gate (reject if worse than a
 * fixed ceiling) rather than genuine uncertainty folded into the
 * distance bound — a reported 300m away with ±100m accuracy passed
 * outright, even though the true position could genuinely be 400m away.
 * `findNearbyField` now requires the *worst-case* distance (`distanceKm
 * + accuracyKm`) to stay within `thresholdKm`, the standard conservative
 * way to combine a nominal reading with its own uncertainty radius — a
 * poor-accuracy fix now fails on its own even without a separate fixed
 * ceiling. Non-finite/non-positive accuracy (`NaN`, negative, a
 * malformed `0`) is rejected outright, never treated as "perfectly
 * accurate." `pointInRing` was also round 2's own MEDIUM: it ignored
 * interior rings (holes) entirely, so a real hole-carrying field could
 * wrongly claim a farmer standing in the excluded interior was "inside"
 * it — a point is now only inside the field if it's inside the exterior
 * ring AND outside every interior ring.
 */
import type { GeoPoint } from "./weather-stations";
import type { Field } from "./types";

/** 300m — genuinely at/near the field, not just on the farm somewhere.
 * A proximity heuristic, not an agronomic/regulatory constant — no
 * evidence-registry entry the way a scientific rule needs one, but still
 * versioned and centralised here rather than inlined in a component. */
export const NEAR_FIELD_THRESHOLD_KM = 0.3;

export interface NearFieldPosition extends GeoPoint {
  /** Real one-shot browser geolocation accuracy, metres — `undefined`,
   * non-finite, or non-positive all fail closed the same as a reported
   * bad one, since none of those is a trustworthy accuracy figure. Folded
   * directly into `findNearbyField`'s own distance bound (round 2's own
   * fix), not a separate fixed pass/fail ceiling. */
  accuracyMeters?: number;
}

/** Real ray-casting point-in-ring test — standard algorithm, no
 * field-specific tuning. Used for both the exterior ring and any real
 * interior ring (hole). */
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

/** True only when `point` is genuinely inside the field's own real
 * boundary — inside the exterior ring (`coordinates[0]`) and outside
 * every real interior ring/hole (`coordinates[1+]`), standard GeoJSON
 * polygon-with-holes semantics. No field in this app's own domain model
 * has ever carried a hole yet, but a farmer standing in one a future
 * import creates must never be told they're "inside" it. */
function pointInPolygon(point: GeoPoint, polygon: GeoJSON.Polygon): boolean {
  const [exterior, ...holes] = polygon.coordinates;
  if (!exterior || !pointInRing(point, exterior)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
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

/** Shortest distance (km) from `point` to any edge of a single ring. */
function distanceToRingKm(point: GeoPoint, ring: GeoJSON.Position[]): number {
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
 * Real distance (km) from `point` to a field's own nearest boundary edge
 * — exterior ring or any hole's own ring, whichever is closer —
 * regardless of whether `point` is inside or outside it. Added
 * (GPS Job Mode campaign, Codex audit HIGH round 2, 2026-09-04) as the
 * one real primitive `distanceToPolygonKm`'s own "0 when inside" answer
 * cannot provide: "genuinely inside" alone says nothing about *how far*
 * inside, which is exactly what a real GPS accuracy radius needs to be
 * compared against (`gps-activity-detection.ts`'s own
 * `confidentlyInsideField`) — a fix landing 2m inside a boundary with
 * 50m of accuracy could genuinely be outside; one landing 200m inside
 * cannot. A purely additive extraction, `distanceToPolygonKm`'s own
 * external behaviour (0 when inside) is unchanged and still covered by
 * this file's own existing tests.
 */
export function distanceToPolygonBoundaryKm(point: GeoPoint, polygon: GeoJSON.Polygon): number {
  const [exterior, ...holes] = polygon.coordinates;
  if (!exterior || exterior.length < 3) return Infinity; // Not a real polygon — never claim a distance to it.
  let min = distanceToRingKm(point, exterior);
  for (const hole of holes) {
    if (hole.length >= 3) min = Math.min(min, distanceToRingKm(point, hole));
  }
  return min;
}

/** Real distance (km) from `point` to a field's actual mapped boundary —
 * 0 when `point` is genuinely inside it (excluding any real hole),
 * otherwise the shortest distance to its nearest edge (exterior ring or
 * any hole's own ring, whichever is closer — a point just outside a hole
 * but still within the exterior ring is close to the field's own real
 * boundary there, not to its exterior edge far away). Never centroid
 * distance, which both understates proximity for a large field's
 * interior and overstates it near a large field's own edge. */
export function distanceToPolygonKm(point: GeoPoint, polygon: GeoJSON.Polygon): number {
  const [exterior] = polygon.coordinates;
  if (!exterior || exterior.length < 3) return Infinity; // Not a real polygon — never claim a distance to it.
  if (pointInPolygon(point, polygon)) return 0;
  return distanceToPolygonBoundaryKm(point, polygon);
}

/**
 * The single real field a farmer at `position` is genuinely at or near —
 * `null` whenever that can't honestly be claimed: no position, a
 * position whose own accuracy is missing/non-finite/non-positive, or no
 * mapped field whose *worst-case* distance (real distance plus the
 * position's own real accuracy radius) stays within `thresholdKm`. Never
 * the nearest field regardless of how far away it actually is, and never
 * centroid-based (see `distanceToPolygonKm`).
 */
export function findNearbyField(fields: readonly Field[], position: NearFieldPosition | null, thresholdKm = NEAR_FIELD_THRESHOLD_KM): Field | null {
  if (!position) return null;
  const { accuracyMeters } = position;
  if (accuracyMeters === undefined || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return null;
  const accuracyKm = accuracyMeters / 1000;

  const mappedFields = fields.filter((f): f is Field & { polygon: GeoJSON.Polygon } => f.polygon !== undefined);
  let nearest: { field: Field; km: number } | null = null;
  for (const field of mappedFields) {
    const km = distanceToPolygonKm(position, field.polygon);
    if (!nearest || km < nearest.km) nearest = { field, km };
  }
  // Worst-case distance: the true position could genuinely be up to
  // `accuracyKm` further from the field than the nominal reading says —
  // only claim proximity when even that worst case is still within
  // range, not just the nominal (possibly optimistic) distance.
  return nearest && nearest.km + accuracyKm <= thresholdKm ? nearest.field : null;
}
