import "server-only";

export type SpatialBbox = [number, number, number, number];

export interface SourceFeature {
  id: string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

export type SpatialSourceFetchResult =
  | { status: "ok"; features: SourceFeature[]; retrievedAt: string }
  | { status: "unavailable"; reason: string; retrievedAt: string };

async function fetchGeoJson(url: string, timeoutMs = 25_000): Promise<SpatialSourceFetchResult> {
  const retrievedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}`, retrievedAt };
    const value = (await response.json()) as GeoJSON.FeatureCollection;
    if (value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
      return { status: "unavailable", reason: "Source did not return a GeoJSON FeatureCollection", retrievedAt };
    }
    const features = value.features.flatMap((feature, index): SourceFeature[] => {
      if (!feature.geometry) return [];
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const id = String(feature.id ?? props.OBJECTID ?? props.objectid ?? props.GLOBALID ?? props.globalid ?? index);
      return [{ id, geometry: feature.geometry, properties: props }];
    });
    return { status: "ok", features, retrievedAt };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : "Unknown source error", retrievedAt };
  } finally {
    clearTimeout(timer);
  }
}

export function bboxToCoverageGeometry(bbox: SpatialBbox): GeoJSON.MultiPolygon {
  const [minX, minY, maxX, maxY] = bbox;
  return { type: "MultiPolygon", coordinates: [[[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY],[minX,minY]]]] };
}

export async function fetchEpaWaterFlowNetwork(bbox: SpatialBbox): Promise<SpatialSourceFetchResult> {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: "EPA:WATER_RIVNETROUTES",
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    bbox: `${bbox.join(",")},EPSG:4326`,
    count: "10000",
  });
  return fetchGeoJson(`https://gis.epa.ie/geoserver/wfs?${params.toString()}`);
}

const GSI_BASE = "https://gsi.geodata.gov.ie/server/rest/services/Groundwater";

async function fetchGsiFeatureLayer(layerUrl: string, bbox: SpatialBbox): Promise<SpatialSourceFetchResult> {
  const params = new URLSearchParams({
    where: "1=1",
    geometry: bbox.join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "10000",
  });
  return fetchGeoJson(`${layerUrl}?${params.toString()}`);
}

export function fetchGsiPublicSupplyProtectionAreas(bbox: SpatialBbox) {
  return fetchGsiFeatureLayer(`${GSI_BASE}/IE_GSI_Group_Water_Scheme_Public_Water_Supply_Source_Protection_Areas_20K_IE26_ITM/FeatureServer/0/query`, bbox);
}

export function fetchGsiGroupSchemeProtectionAreas(bbox: SpatialBbox) {
  return fetchGsiFeatureLayer(`${GSI_BASE}/IE_GSI_Group_Water_Scheme_Public_Water_Supply_Source_Protection_Areas_20K_IE26_ITM/FeatureServer/1/query`, bbox);
}

export function fetchGsiWellsAndSprings(bbox: SpatialBbox) {
  return fetchGsiFeatureLayer(`${GSI_BASE}/IE_GSI_Groundwater_Wells_Springs_100K_IE26_ITM/FeatureServer/0/query`, bbox);
}
