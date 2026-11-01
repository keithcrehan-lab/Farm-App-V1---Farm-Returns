import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceFeature, SpatialBbox } from "./source-clients";
import { bboxToCoverageGeometry } from "./source-clients";

function multiLineGeometry(geometry: GeoJSON.Geometry): GeoJSON.MultiLineString | undefined {
  if (geometry.type === "LineString") return { type: "MultiLineString", coordinates: [geometry.coordinates] };
  if (geometry.type === "MultiLineString") return geometry;
  return undefined;
}

function textProp(props: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = props[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return undefined;
}

function accuracyMetres(value: unknown): number | undefined {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*m/i);
  return match ? Number(match[1]) : undefined;
}

function wellType(props: Record<string, unknown>): "well" | "spring" | "borehole" | "dug_well" | "other_groundwater_feature" {
  const raw = textProp(props, "SOURCETYP", "SOURCE_TYPE", "SourceType")?.toLowerCase() ?? "";
  if (raw.includes("spring")) return "spring";
  if (raw.includes("dug") && raw.includes("well")) return "dug_well";
  if (raw.includes("bore")) return "borehole";
  if (raw.includes("well")) return "well";
  return "other_groundwater_feature";
}

async function upsertRows(client: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: "source_key,source_version,source_feature_id" });
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
}

async function insertCoverage(client: SupabaseClient, sourceKey: string, sourceVersion: string, bbox: SpatialBbox, featureCount: number) {
  const { error } = await client.from("spatial_reference_coverage").insert({
    source_key: sourceKey,
    source_version: sourceVersion,
    coverage: bboxToCoverageGeometry(bbox),
    status: "complete",
    feature_count: featureCount,
  });
  if (error) throw new Error(`spatial_reference_coverage insert failed: ${error.message}`);
}

export async function persistEpaWatercourses(client: SupabaseClient, features: SourceFeature[], bbox: SpatialBbox) {
  const rows = features.flatMap((feature) => {
    const geom = multiLineGeometry(feature.geometry);
    if (!geom) return [];
    return [{
      source_key: "epa_water_flow_network",
      source_version: "2026-06-24",
      source_feature_id: feature.id,
      feature_name: textProp(feature.properties, "WATERBODY_NAME", "RIVER_NAME", "NAME", "name"),
      properties: feature.properties,
      geom,
    }];
  });
  await upsertRows(client, "spatial_watercourses", rows);
  await insertCoverage(client, "epa_water_flow_network", "2026-06-24", bbox, rows.length);
  return rows.length;
}

async function persistProtectionAreas(client: SupabaseClient, features: SourceFeature[], bbox: SpatialBbox, input: { sourceKey: string; featureType: string; nameKeys: string[] }) {
  const rows = features.map((feature) => ({
    source_key: input.sourceKey,
    source_version: "2024-02-26",
    source_feature_id: feature.id,
    feature_type: input.featureType,
    feature_name: textProp(feature.properties, ...input.nameKeys),
    properties: feature.properties,
    geom: feature.geometry,
  }));
  await upsertRows(client, "spatial_groundwater_features", rows);
  await insertCoverage(client, input.sourceKey, "2024-02-26", bbox, rows.length);
  return rows.length;
}

export function persistGsiPublicSupplyAreas(client: SupabaseClient, features: SourceFeature[], bbox: SpatialBbox) {
  return persistProtectionAreas(client, features, bbox, { sourceKey: "gsi_public_supply_spa", featureType: "public_supply_source_protection_area", nameKeys: ["SPA_NAME", "SPA_CODE", "DW_CODE"] });
}

export function persistGsiGroupSchemeAreas(client: SupabaseClient, features: SourceFeature[], bbox: SpatialBbox) {
  return persistProtectionAreas(client, features, bbox, { sourceKey: "gsi_group_scheme_spa", featureType: "group_water_scheme_source_protection_area", nameKeys: ["GWS_NAME", "GWSZOCID"] });
}

export async function persistGsiWells(client: SupabaseClient, features: SourceFeature[], bbox: SpatialBbox) {
  const rows = features.map((feature) => ({
    source_key: "gsi_wells_springs",
    source_version: "2025-10-10",
    source_feature_id: feature.id,
    feature_type: wellType(feature.properties),
    feature_name: textProp(feature.properties, "SOURCENAM", "GSI_NAME", "ORIG_NAME"),
    location_accuracy_m: accuracyMetres(feature.properties.XYACCURACY),
    properties: feature.properties,
    geom: feature.geometry,
  }));
  await upsertRows(client, "spatial_groundwater_features", rows);
  // This layer is non-exhaustive. Coverage means "we imported all records the
  // source exposes here", never "there are no other wells"; the source metadata
  // keeps negative_inference_allowed=false.
  await insertCoverage(client, "gsi_wells_springs", "2025-10-10", bbox, rows.length);
  return rows.length;
}
