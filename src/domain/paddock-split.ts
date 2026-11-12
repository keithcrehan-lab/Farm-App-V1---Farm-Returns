/**
 * Splitting a mapped field into paddocks along farmer-drawn fences.
 *
 * A fence is a line the farmer traces, taps or walks along where the fence
 * runs. It is fitted to the field (ends join the edge or another fence), and
 * each fence cuts every piece it crosses into two, using an
 * exact polygon intersection / difference against one side of the fence, so
 * the pieces share edges and always add up to the original field. Nothing
 * is guessed: a fence that doesn't cross the field is refused, and a split
 * is only accepted when its pieces cover the field exactly once.
 */
import {
  area as turfArea,
  bbox as turfBbox,
  bboxPolygon,
  difference,
  featureCollection,
  intersect,
  polygon as turfPolygon,
  union,
  along,
  booleanPointInPolygon,
  length as turfLength,
  lineIntersect,
  lineSplit,
  lineString,
  multiLineString,
  nearestPointOnLine,
  point,
} from "@turf/turf";
import { isValidBoundaryPolygon } from "./field-boundary";

type Position = GeoJSON.Position;
export type SplitResult = { ok: true; paddocks: GeoJSON.Polygon[] } | { ok: false; error: string };

/** About 5 km in degrees: far enough that the cut side always covers the field. */
const FAR = 0.05;
/** Smallest paddock accepted, 0.02 ha. */
export const MIN_PADDOCK_M2 = 200;
export const MAX_PADDOCKS = 30;
/** A fence end this close to the field edge or another fence is already joined to it. */
const SNAP_M = 0.5;

function flatten(g: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined): GeoJSON.Polygon[] {
  if (!g) return [];
  if (g.type === "Polygon") return [g];
  return g.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
}

const areaM2 = (p: GeoJSON.Polygon) => turfArea(turfPolygon(p.coordinates));

/** A point FAR beyond `to`, continuing the direction from `from`. */
function beyond(from: Position, to: Position): Position {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  return [to[0] + (dx / len) * FAR, to[1] + (dy / len) * FAR];
}

/** The region on one side of a fence, extended well past both of its ends. */
export function fenceSidePolygon(fence: readonly Position[]): GeoJSON.Polygon | null {
  const pts = fence.filter((p, i) => i === 0 || p[0] !== fence[i - 1][0] || p[1] !== fence[i - 1][1]);
  if (pts.length < 2) return null;
  const start = beyond(pts[1], pts[0]);
  const end = beyond(pts[pts.length - 2], pts[pts.length - 1]);
  const cx = end[0] - start[0];
  const cy = end[1] - start[1];
  const len = Math.hypot(cx, cy) || 1;
  const px = (-cy / len) * FAR * 2;
  const py = (cx / len) * FAR * 2;
  return { type: "Polygon", coordinates: [[start, ...pts, end, [end[0] + px, end[1] + py], [start[0] + px, start[1] + py], start]] };
}

/** One straight-through cut of a piece along a fence segment that runs edge to edge across it. */
function cutWithSide(piece: GeoJSON.Polygon, segment: readonly Position[]): GeoJSON.Polygon[] {
  const side = fenceSidePolygon(segment);
  if (!side) return [piece];
  try {
    const fc = featureCollection([turfPolygon(piece.coordinates), turfPolygon(side.coordinates)]);
    const a = flatten(intersect(fc)?.geometry);
    const b = flatten(difference(fc)?.geometry);
    if (!a.length || !b.length) return [piece];
    const pieces = [...a, ...b];
    // Ignore a fence that only grazes the edge (crumbs under 1 m²).
    if (pieces.some((p) => areaM2(p) < 1)) return [piece];
    return pieces;
  } catch {
    return [piece];
  }
}

/** Cuts one piece along the parts of a fence that lie inside it; unchanged when the fence doesn't cross it. */
export function splitByFence(piece: GeoJSON.Polygon, fence: readonly Position[]): GeoJSON.Polygon[] {
  const pts = dedupe(fence);
  if (pts.length < 2) return [piece];
  const poly = turfPolygon(piece.coordinates);
  let parts: Position[][];
  try {
    parts = lineSplit(lineString(pts), poly).features.map((f) => f.geometry.coordinates);
  } catch {
    return [piece];
  }
  if (!parts.length) parts = [pts];
  const insideParts = parts.filter((c) => {
    if (c.length < 2) return false;
    const l = lineString(c);
    const len = turfLength(l, { units: "meters" });
    return len > 0.5 && booleanPointInPolygon(along(l, len / 2, { units: "meters" }), poly, { ignoreBoundary: true });
  });
  let result = [piece];
  for (const seg of insideParts) result = result.flatMap((p) => cutWithSide(p, seg));
  return result;
}

function dedupe(fence: readonly Position[]): Position[] {
  return fence.filter((p, i) => i === 0 || p[0] !== fence[i - 1][0] || p[1] !== fence[i - 1][1]).map((p) => [p[0], p[1]]);
}

const planarDist = (a: Position, b: Position) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Fits a drawn fence to the field: the fence never leaves the boundary. A fence end
 * drawn inside the field is carried on to the nearest field edge or existing fence
 * ahead of it; anything drawn past the boundary is trimmed back to where it crosses,
 * and a middle point tapped outside is pulled onto the boundary.
 */
export function fitFence(field: GeoJSON.Polygon, prior: ReadonlyArray<readonly Position[]>, raw: readonly Position[]): Position[] | null {
  let pts = dedupe(raw);
  if (pts.length < 2) return null;
  const poly = turfPolygon(field.coordinates);
  const edges = multiLineString([field.coordinates[0], ...prior.map((f) => dedupe(f))].filter((l) => l.length >= 2));
  const inside = (p: Position) => booleanPointInPolygon(point(p), poly, { ignoreBoundary: true });
  const hits = (a: Position, b: Position) =>
    lineIntersect(lineString([a, b]), edges).features.map((f) => f.geometry.coordinates).filter((h) => planarDist(a, h) > 1e-9).sort((x, y) => planarDist(a, x) - planarDist(a, y));

  const fitStart = (line: Position[]): Position[] | null => {
    // An end already sitting on the edge or on a fence stays where it is, so a
    // fitted fence can be fitted again (after an edit) without moving.
    const near = nearestPointOnLine(edges, point(line[0]), { units: "meters" });
    if ((near.properties.dist ?? Infinity) <= SNAP_M) return [near.geometry.coordinates, ...line.slice(1)];
    if (inside(line[0])) {
      const h = hits(line[0], beyond(line[1], line[0]));
      return h.length ? [h[0], ...line] : null;
    }
    for (let i = 0; i < line.length - 1; i++) {
      const h = hits(line[i], line[i + 1]);
      if (h.length) return [h[0], ...line.slice(i + 1)];
    }
    return null;
  };

  const started = fitStart(pts);
  if (!started) return null;
  const ended = fitStart([...started].reverse());
  if (!ended) return null;
  pts = ended.reverse();
  const ring = lineString(field.coordinates[0]);
  pts = pts.map((p, i) => (i === 0 || i === pts.length - 1 || inside(p) ? p : nearestPointOnLine(ring, point(p)).geometry.coordinates));
  const total = pts.slice(1).reduce((s, p, i) => s + planarDist(pts[i], p), 0);
  return total > 1e-7 ? pts : null;
}

export type FitAllResult = { ok: true; fences: Position[][] } | { ok: false; index: number; error: string };

/**
 * Fits every drawn fence in order, each against the field and the fences before it.
 * Used after any edit (move, delete, undo) so fences that joined an edited fence
 * follow it, or carry on to the next edge when it is gone.
 */
export function fitAllFences(field: GeoJSON.Polygon, drawn: ReadonlyArray<readonly Position[]>): FitAllResult {
  const fences: Position[][] = [];
  for (let index = 0; index < drawn.length; index++) {
    const fitted = fitFence(field, fences, drawn[index]);
    if (!fitted) return { ok: false, index, error: "A fence doesn't reach across the field any more. Undo and draw it again." };
    fences.push(fitted);
  }
  return { ok: true, fences };
}

/** Metres per degree, for small local distances only (geometry, not agronomy). */
const M_PER_DEG_LAT = 110_540;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/**
 * Straightens a finger-traced or walked line: drops every point that sits within
 * `toleranceM` of the straight run between its neighbours (Douglas-Peucker), so a
 * wobbly trace becomes a few clean fence segments. Ends are always kept.
 */
export function straightenTrace(points: readonly Position[], toleranceM: number): Position[] {
  const pts = dedupe(points);
  if (pts.length <= 2 || !(toleranceM > 0)) return pts;
  const kx = mPerDegLng(pts[0][1]);
  const xy = pts.map((p) => [p[0] * kx, p[1] * M_PER_DEG_LAT]);
  const offLine = (p: number[], a: number[], b: number[]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const keep = pts.map(() => false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let worstDist = toleranceM;
    for (let i = a + 1; i < b; i++) {
      const d = offLine(xy[i], xy[a], xy[b]);
      if (d > worstDist) { worstDist = d; worst = i; }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function checkPieces(field: GeoJSON.Polygon, pieces: GeoJSON.Polygon[]): SplitResult {
  if (pieces.length > MAX_PADDOCKS) return { ok: false, error: `A field can have up to ${MAX_PADDOCKS} paddocks.` };
  if (pieces.some((p) => !isValidBoundaryPolygon(p))) return { ok: false, error: "That fence made a shape that can't be saved. Undo it and draw it again." };
  if (pieces.some((p) => areaM2(p) < MIN_PADDOCK_M2)) return { ok: false, error: "That fence leaves a sliver under 0.02 ha. Undo it and draw it again." };
  const total = areaM2(field);
  const sum = pieces.reduce((s, p) => s + areaM2(p), 0);
  if (Math.abs(sum - total) / total > 0.005) return { ok: false, error: "The paddocks didn't add up to the whole field. Undo the last fence and try again." };
  return { ok: true, paddocks: pieces };
}

/** Applies fences in order. Every fence must cross at least one piece. */
export function applyFences(field: GeoJSON.Polygon, fences: ReadonlyArray<readonly Position[]>): SplitResult {
  let pieces = [field];
  for (const fence of fences) {
    const next = pieces.flatMap((p) => splitByFence(p, fence));
    if (next.length === pieces.length) {
      return { ok: false, error: "That fence doesn't divide the field. Draw it across the field, along where the fence runs." };
    }
    pieces = next;
  }
  return checkPieces(field, pieces);
}

/** Straight fences that cut the field into `n` strips of equal area, across its longer side. */
export function evenFences(field: GeoJSON.Polygon, n: number): Position[][] {
  if (!Number.isInteger(n) || n < 2) return [];
  const poly = turfPolygon(field.coordinates);
  const [minX, minY, maxX, maxY] = turfBbox(poly);
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const wide = (maxX - minX) * k >= maxY - minY;
  const total = turfArea(poly);
  const pad = 0.001;
  const before = (t: number) => {
    const box = wide ? bboxPolygon([minX - pad, minY - pad, t, maxY + pad]) : bboxPolygon([minX - pad, minY - pad, maxX + pad, t]);
    const g = intersect(featureCollection([poly, box]));
    return g ? turfArea(g) : 0;
  };
  const fences: Position[][] = [];
  for (let i = 1; i < n; i++) {
    const target = (total * i) / n;
    let lo = wide ? minX : minY;
    let hi = wide ? maxX : maxY;
    for (let step = 0; step < 40; step++) {
      const mid = (lo + hi) / 2;
      if (before(mid) < target) lo = mid;
      else hi = mid;
    }
    const t = (lo + hi) / 2;
    fences.push(wide ? [[t, minY - pad], [t, maxY + pad]] : [[minX - pad, t], [maxX + pad, t]]);
  }
  return fences;
}

/** The field's outline in local metres, turned so fences at `bearingDeg` run straight up the page. */
function turnedOutline(field: GeoJSON.Polygon, bearingDeg: number) {
  const ring = field.coordinates[0].slice(0, -1);
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = mPerDegLng(lat0);
  const b = (bearingDeg * Math.PI) / 180;
  const c = Math.cos(b);
  const sn = Math.sin(b);
  // across = distance across the fences; along = distance along them.
  const pts = ring.map((p) => {
    const x = p[0] * kx;
    const y = p[1] * M_PER_DEG_LAT;
    return { across: x * c - y * sn, along: x * sn + y * c };
  });
  const back = (across: number, along: number): Position => [(across * c + along * sn) / kx, (-across * sn + along * c) / M_PER_DEG_LAT];
  return { pts, back };
}

/** Area of the part of an outline with `across` at or below `limit` (half-plane clip, shoelace). */
function areaUpTo(pts: ReadonlyArray<{ across: number; along: number }>, limit: number): number {
  const out: Array<{ across: number; along: number }> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const aIn = a.across <= limit;
    const bIn = b.across <= limit;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (limit - a.across) / (b.across - a.across);
      out.push({ across: limit, along: a.along + t * (b.along - a.along) });
    }
  }
  let twice = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const b = out[(i + 1) % out.length];
    twice += a.across * b.along - b.across * a.along;
  }
  return Math.abs(twice) / 2;
}

/**
 * Straight, parallel fences that cut the field into `n` strips of equal area, with
 * the fences running at `bearingDeg` (0 = north-south, 90 = east-west).
 */
export function evenFencesAtBearing(field: GeoJSON.Polygon, n: number, bearingDeg: number): Position[][] {
  if (!Number.isInteger(n) || n < 2 || !Number.isFinite(bearingDeg)) return [];
  const { pts, back } = turnedOutline(field, bearingDeg);
  const across = pts.map((p) => p.across);
  const along = pts.map((p) => p.along);
  const minAcross = Math.min(...across);
  const maxAcross = Math.max(...across);
  const total = areaUpTo(pts, maxAcross + 1);
  if (!(total > 0)) return [];
  const pad = 20; // metres past the field, so each fence clearly starts and ends outside it
  const from = Math.min(...along) - pad;
  const to = Math.max(...along) + pad;
  const fences: Position[][] = [];
  for (let i = 1; i < n; i++) {
    const target = (total * i) / n;
    let lo = minAcross;
    let hi = maxAcross;
    for (let step = 0; step < 48; step++) {
      const mid = (lo + hi) / 2;
      if (areaUpTo(pts, mid) < target) lo = mid;
      else hi = mid;
    }
    const at = (lo + hi) / 2;
    fences.push([back(at, from), back(at, to)]);
  }
  return fences;
}

/** The bearing (0-175, in 5 degree steps) at which straight fences across the field are shortest. */
export function shortestFenceBearing(field: GeoJSON.Polygon): number {
  let best = 0;
  let bestLength = Infinity;
  for (let bearing = 0; bearing < 180; bearing += 5) {
    const along = turnedOutline(field, bearing).pts.map((p) => p.along);
    const length = Math.max(...along) - Math.min(...along);
    if (length < bestLength - 1e-6) { bestLength = length; best = bearing; }
  }
  return best;
}

/** Paddocks listed north to south, then west to east, for naming. */
export function orderPaddocks(pieces: readonly GeoJSON.Polygon[]): GeoJSON.Polygon[] {
  const key = (p: GeoJSON.Polygon) => {
    const [minX, minY, maxX, maxY] = turfBbox(turfPolygon(p.coordinates));
    return { lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 };
  };
  return [...pieces].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return Math.abs(ka.lat - kb.lat) > 1e-5 ? kb.lat - ka.lat : ka.lng - kb.lng;
  });
}

/** Server-side check before saving: names, shapes, and exact cover of the parent field. */
export function validatePaddockSplit(
  parent: GeoJSON.Polygon,
  paddocks: ReadonlyArray<{ name: string; polygon: GeoJSON.Polygon }>,
  otherFieldNames: readonly string[],
): string | null {
  if (!Array.isArray(paddocks) || paddocks.length < 2) return "Draw at least one fence to make two paddocks.";
  if (paddocks.length > MAX_PADDOCKS) return `A field can have up to ${MAX_PADDOCKS} paddocks.`;
  const taken = new Set(otherFieldNames.map((n) => n.trim().toLocaleLowerCase()));
  const seen = new Set<string>();
  for (const p of paddocks) {
    const name = typeof p?.name === "string" ? p.name.trim() : "";
    if (!name || name.length > 80) return "Give every paddock a name of 1 to 80 characters.";
    const key = name.toLocaleLowerCase();
    if (taken.has(key) || seen.has(key)) return `The name "${name}" is already used. Give each paddock its own name.`;
    seen.add(key);
    if (!p.polygon || p.polygon.type !== "Polygon" || !isValidBoundaryPolygon(p.polygon)) return "One of the paddock shapes isn't valid. Draw the fences again.";
  }
  const parentPoly = turfPolygon(parent.coordinates);
  const total = turfArea(parentPoly);
  let sum = 0;
  for (const p of paddocks) {
    const a = areaM2(p.polygon);
    if (a < MIN_PADDOCK_M2) return "Every paddock needs to be at least 0.02 ha.";
    const inside = intersect(featureCollection([parentPoly, turfPolygon(p.polygon.coordinates)]));
    if (!inside || turfArea(inside) < a * 0.99) return "A paddock goes outside the field's boundary. Draw the fences again.";
    sum += a;
  }
  const merged = paddocks.length > 1 ? union(featureCollection(paddocks.map((p) => turfPolygon(p.polygon.coordinates)))) : null;
  const coverM2 = merged ? turfArea(merged) : sum;
  if (Math.abs(sum - total) / total > 0.005 || Math.abs(coverM2 - total) / total > 0.005) return "The paddocks don't cover the field exactly once. Draw the fences again.";
  return null;
}
