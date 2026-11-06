import { computeBoundaryGeometry, isValidBoundaryPolygon } from "@/domain/field-boundary";

export type FieldPolygonSource = "farmer_drawn" | "lpis_imported" | "lpis_farmer_refined";

export interface FieldScanCandidate {
  id: string;
  polygon: GeoJSON.Polygon;
  areaHa: number;
  centroid: [number, number];
  lpisRef: string;
  parcelLabel?: string;
  sourceLabel: string;
  sourceYear: string;
}

export type FieldScanOutcome =
  | {
      status: "READY";
      candidates: FieldScanCandidate[];
      sourceLabel: string;
      sourceYear: string;
      coverageAtFarm: boolean;
    }
  | { status: "UNAVAILABLE"; reason: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function closedRing(value: unknown): GeoJSON.Position[] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const ring: GeoJSON.Position[] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length < 2 || !finiteCoordinate(point[0]) || !finiteCoordinate(point[1])) return null;
    ring.push([point[0], point[1]]);
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.abs(first[0] - last[0]) > 1e-9 || Math.abs(first[1] - last[1]) > 1e-9) return null;
  return ring;
}

/** Convert an untrusted external Polygon/MultiPolygon to one supported Farm Return polygon.
 * MultiPolygon parcels use the largest valid component deterministically. */
export function polygonFromUnknownGeometry(value: unknown): GeoJSON.Polygon | null {
  const geometry = asRecord(value);
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;

  const candidates: GeoJSON.Polygon[] = [];
  if (geometry.type === "Polygon") {
    if (geometry.coordinates.length !== 1) return null;
    const ring = closedRing(geometry.coordinates[0]);
    if (ring) candidates.push({ type: "Polygon", coordinates: [ring] });
  } else if (geometry.type === "MultiPolygon") {
    for (const polygonCoordinates of geometry.coordinates) {
      if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length !== 1) continue;
      const ring = closedRing(polygonCoordinates[0]);
      if (ring) candidates.push({ type: "Polygon", coordinates: [ring] });
    }
  } else {
    return null;
  }

  return candidates
    .filter(isValidBoundaryPolygon)
    .map((polygon) => ({ polygon, areaHa: computeBoundaryGeometry(polygon).areaHa }))
    .sort((a, b) => b.areaHa - a.areaHa)[0]?.polygon ?? null;
}

/** Parse only the small, non-sensitive subset the scan UI needs. */
export function parseFieldScanPayload(payload: unknown, excludedLpisRefs: readonly string[] = []): FieldScanOutcome {
  const record = asRecord(payload);
  const sourceLabel = typeof record?.sourceLabel === "string" ? record.sourceLabel : "DAFM LPIS";
  const sourceYear = typeof record?.sourceYear === "string" ? record.sourceYear : "2025";
  if (!record || !Array.isArray(record.candidates)) {
    return { status: "UNAVAILABLE", reason: "Public field boundaries could not be loaded just now." };
  }

  const excluded = new Set(excludedLpisRefs.filter(Boolean));
  const seen = new Set<string>();
  const candidates: FieldScanCandidate[] = [];

  for (const raw of record.candidates) {
    const item = asRecord(raw);
    if (!item) continue;
    const id = typeof item.id === "string" ? item.id : "";
    const lpisRef = typeof item.lpisRef === "string" ? item.lpisRef : "";
    if (!id || !lpisRef || excluded.has(lpisRef) || seen.has(lpisRef)) continue;
    const polygon = polygonFromUnknownGeometry(item.polygon);
    if (!polygon) continue;
    const geometry = computeBoundaryGeometry(polygon);
    const parcelLabel = typeof item.parcelLabel === "string" && item.parcelLabel.trim() ? item.parcelLabel.trim() : undefined;
    candidates.push({
      id,
      lpisRef,
      polygon,
      areaHa: geometry.areaHa,
      centroid: geometry.centroid,
      ...(parcelLabel ? { parcelLabel } : {}),
      sourceLabel: typeof item.sourceLabel === "string" ? item.sourceLabel : sourceLabel,
      sourceYear: typeof item.sourceYear === "string" ? item.sourceYear : sourceYear,
    });
    seen.add(lpisRef);
  }

  return {
    status: "READY",
    candidates,
    sourceLabel,
    sourceYear,
    coverageAtFarm: record.coverageAtFarm === true,
  };
}

export function generatedFieldNames(existingNames: readonly string[], count: number): string[] {
  const used = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const names: string[] = [];
  let n = 1;
  while (names.length < count) {
    const name = `Field ${n++}`;
    if (used.has(name.toLowerCase())) continue;
    used.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}
