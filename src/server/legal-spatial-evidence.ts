import "server-only";

import { bbox as turfBbox, booleanIntersects, feature, lineString, point, pointToLineDistance, polygon as turfPolygon } from "@turf/turf";

export type SpatialEvidenceState = "resolved" | "not_found" | "unavailable";

export interface CommonageSpatialEvidence {
  state: SpatialEvidenceState;
  value?: "commonage" | "not_commonage";
  source: string;
  detail: string;
  sourceDate?: string;
}

export interface WaterSpatialEvidence {
  state: SpatialEvidenceState;
  featureType?: "surface_water";
  nearestFeature?: string;
  distanceM?: number;
  source: string;
  detail: string;
  sourceDate?: string;
}

export interface PublicLegalSpatialEvidence {
  assessedAt: string;
  commonage: CommonageSpatialEvidence;
  water: WaterSpatialEvidence;
  localOverride: {
    state: "unknown";
    source: string;
    detail: string;
  };
}

const EPA_WFS = "https://gis.epa.ie/geoserver/wfs";
const EPA_STREAM_LAYER = "EPA:WATER_RIVNETROUTES";
const DAFM_COLLECTIONS = "https://geoapi.opendata.agriculture.gov.ie/shps/collections?f=json";

function expandBbox(bounds: number[], metres: number): [number, number, number, number] {
  const midLat = (bounds[1] + bounds[3]) / 2;
  const latDelta = metres / 111_320;
  const lonDelta = metres / (111_320 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
  return [bounds[0] - lonDelta, bounds[1] - latDelta, bounds[2] + lonDelta, bounds[3] + latDelta];
}

async function fetchJson(url: string, timeoutMs = 8_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalisePropertyName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

let dafm2025CollectionPromise: Promise<string | undefined> | undefined;

async function resolveDafm2025CollectionId(): Promise<string | undefined> {
  if (!dafm2025CollectionPromise) {
    dafm2025CollectionPromise = fetchJson(DAFM_COLLECTIONS)
      .then((value) => {
        const collections = value as { collections?: Array<{ id?: string; title?: string }> };
        return collections.collections?.find((item) => /2025.*lpis|lpis.*2025/i.test(`${item.id ?? ""} ${item.title ?? ""}`))?.id;
      })
      .catch((error) => {
        dafm2025CollectionPromise = undefined;
        throw error;
      });
  }
  return dafm2025CollectionPromise;
}

function commonageFromProperties(properties: Record<string, unknown>): boolean | null {
  const entry = Object.entries(properties).find(([key]) => /commonage(?:indicator|ind)/.test(normalisePropertyName(key)));
  if (!entry) return null;
  const raw = String(entry[1] ?? "").trim().toLowerCase();
  if (["y", "yes", "true", "1", "commonage"].includes(raw)) return true;
  if (["n", "no", "false", "0", "not commonage", "non-commonage"].includes(raw)) return false;
  return null;
}

async function resolveCommonage(polygon: GeoJSON.Polygon): Promise<CommonageSpatialEvidence> {
  const source = "DAFM Anonymous LPIS 2025 · Commonage Indicator";
  try {
    const collectionId = await resolveDafm2025CollectionId();
    if (!collectionId) {
      return { state: "unavailable", source, detail: "DAFM 2025 LPIS is published, but no queryable 2025 parcel collection is currently exposed by the live geospatial API." };
    }

    const b = turfBbox(turfPolygon(polygon.coordinates));
    const url = `https://geoapi.opendata.agriculture.gov.ie/shps/collections/${encodeURIComponent(collectionId)}/items?f=json&limit=100&bbox=${b.join(",")}`;
    const data = (await fetchJson(url)) as GeoJSON.FeatureCollection;
    const fieldFeature = turfPolygon(polygon.coordinates);
    const matches = (data.features ?? []).filter((candidate) => {
      try {
        return Boolean(candidate.geometry) && booleanIntersects(fieldFeature, feature(candidate.geometry!));
      } catch {
        return false;
      }
    });
    if (matches.length === 0) return { state: "not_found", source, detail: "No intersecting LPIS parcel was returned. Farm Return will not assume this means non-commonage." };

    const indicators = matches.map((candidate) => commonageFromProperties((candidate.properties ?? {}) as Record<string, unknown>)).filter((value): value is boolean => value !== null);
    if (indicators.length === 0) return { state: "unavailable", source, detail: "Matching LPIS parcels did not expose a usable Commonage Indicator." };
    return {
      state: "resolved",
      value: indicators.some(Boolean) ? "commonage" : "not_commonage",
      source,
      sourceDate: "2025-12-31",
      detail: `${matches.length} intersecting LPIS parcel${matches.length === 1 ? "" : "s"} checked against the published Commonage Indicator.`,
    };
  } catch {
    return { state: "unavailable", source, detail: "DAFM LPIS automatic lookup is temporarily unavailable. Existing/farmer-confirmed evidence is left unchanged." };
  }
}

function lineCoordinates(geometry: GeoJSON.Geometry): GeoJSON.Position[][] {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function fieldToLineDistanceMetres(fieldPolygon: GeoJSON.Polygon, coords: GeoJSON.Position[]): number {
  const field = turfPolygon(fieldPolygon.coordinates);
  const line = lineString(coords);
  if (booleanIntersects(field, line)) return 0;
  const boundary = lineString(fieldPolygon.coordinates[0]);
  let minKm = Number.POSITIVE_INFINITY;
  for (const coord of fieldPolygon.coordinates[0]) minKm = Math.min(minKm, pointToLineDistance(point(coord), line, { units: "kilometers" }));
  for (const coord of coords) minKm = Math.min(minKm, pointToLineDistance(point(coord), boundary, { units: "kilometers" }));
  return minKm * 1000;
}

async function resolveNearestSurfaceWater(polygon: GeoJSON.Polygon): Promise<WaterSpatialEvidence> {
  const source = "EPA Water Flow Network / River Network Routes WFS";
  try {
    const expanded = expandBbox(turfBbox(turfPolygon(polygon.coordinates)), 1000);
    const params = new URLSearchParams({
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeNames: EPA_STREAM_LAYER,
      outputFormat: "application/json",
      srsName: "EPSG:4326",
      bbox: `${expanded.join(",")},EPSG:4326`,
      count: "1000",
    });
    const data = (await fetchJson(`${EPA_WFS}?${params.toString()}`)) as GeoJSON.FeatureCollection;
    let best: { distanceM: number; name: string } | null = null;
    for (const candidate of data.features ?? []) {
      if (!candidate.geometry) continue;
      for (const coords of lineCoordinates(candidate.geometry)) {
        const distanceM = fieldToLineDistanceMetres(polygon, coords);
        if (!Number.isFinite(distanceM)) continue;
        const props = (candidate.properties ?? {}) as Record<string, unknown>;
        const name = String(props.WATERBODY_NAME ?? props.RIVER_NAME ?? props.NAME ?? props.name ?? "Mapped river/stream");
        if (!best || distanceM < best.distanceM) best = { distanceM, name };
      }
    }
    if (!best) return { state: "not_found", source, detail: "No EPA mapped stream/river was returned within 1 km. Farm Return does not convert that into a fabricated distance." };
    return {
      state: "resolved",
      featureType: "surface_water",
      nearestFeature: best.name,
      distanceM: Math.round(best.distanceM * 10) / 10,
      source,
      sourceDate: new Date().toISOString().slice(0, 10),
      detail: "Minimum geometry-to-geometry distance from the farmer field polygon to the EPA mapped river/stream network.",
    };
  } catch {
    return { state: "unavailable", source, detail: "EPA water-feature lookup is temporarily unavailable. Existing/farmer-confirmed evidence is left unchanged." };
  }
}

export async function assessPublicLegalSpatialEvidence(polygon: GeoJSON.Polygon): Promise<PublicLegalSpatialEvidence> {
  const [commonage, water] = await Promise.all([resolveCommonage(polygon), resolveNearestSurfaceWater(polygon)]);
  return {
    assessedAt: new Date().toISOString(),
    commonage,
    water,
    localOverride: {
      state: "unknown",
      source: "Local authority field-specific records",
      detail: "No complete national machine-readable dataset of field-specific local-authority buffer overrides is available, so Farm Return does not infer that no override exists.",
    },
  };
}
