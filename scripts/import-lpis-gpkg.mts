#!/usr/bin/env node
/**
 * Offline/admin DAFM LPIS snapshot importer.
 *
 * Usage:
 *   npm run spatial:import-lpis -- /path/to/2025-parcels.gpkg --bbox=-8.51,53.49,-8.44,53.54
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. The official
 * 2025 GeoPackage is large, so this is deliberately an operator process, not
 * something a farmer-facing request downloads. A bounded import creates a
 * complete cache coverage polygon for exactly that bbox.
 */
import { GeoPackageAPI, BoundingBox, GeoPackage } from "@ngageoint/geopackage";
import { createClient } from "@supabase/supabase-js";

const SOURCE_KEY = "dafm_lpis_2025";
const SOURCE_VERSION = "2025";

type Bbox = [number, number, number, number];

function fail(message: string): never { console.error(message); process.exit(1); }
function parseBbox(arg: string | undefined): Bbox | undefined {
  if (!arg) return undefined;
  const values = arg.replace(/^--bbox=/, "").split(",").map(Number);
  if (values.length !== 4 || values.some((v) => !Number.isFinite(v)) || values[0] >= values[2] || values[1] >= values[3]) fail("Invalid --bbox=minLon,minLat,maxLon,maxLat");
  return values as Bbox;
}
function normaliseKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function property(props: Record<string, unknown>, pattern: RegExp): unknown {
  const found = Object.entries(props).find(([key]) => pattern.test(normaliseKey(key)));
  return found?.[1];
}
function commonageIndicator(props: Record<string, unknown>): boolean | null {
  const raw = String(property(props, /commonageindicator/) ?? "").trim().toLowerCase();
  if (["y","yes","true","1","commonage"].includes(raw)) return true;
  if (["n","no","false","0","notcommonage","noncommonage"].includes(raw.replace(/[ -]/g,""))) return false;
  return null;
}
function polygonGeometry(geometry: GeoJSON.Geometry): GeoJSON.MultiPolygon | undefined {
  if (geometry.type === "Polygon") return { type: "MultiPolygon", coordinates: [geometry.coordinates] };
  if (geometry.type === "MultiPolygon") return geometry;
  return undefined;
}
function coverageGeometry(bbox: Bbox): GeoJSON.MultiPolygon {
  const [minX,minY,maxX,maxY] = bbox;
  return { type: "MultiPolygon", coordinates: [[[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY],[minX,minY]]]] };
}

const gpkgPath = process.argv[2];
if (!gpkgPath || gpkgPath.startsWith("--")) fail("First argument must be the local DAFM LPIS .gpkg path");
const bbox = parseBbox(process.argv.find((arg) => arg.startsWith("--bbox=")));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const gp = await GeoPackageAPI.open(gpkgPath);
try {
  const tables = gp.getFeatureTables();
  if (tables.length === 0) fail("GeoPackage has no feature table");
  const table = tables.find((name) => /parcel/i.test(name)) ?? tables[0];
  const dao = gp.getFeatureDao(table);
  let features: Iterable<GeoJSON.Feature>;
  if (bbox) {
    const indexed = dao.queryForGeoJSONIndexedFeaturesWithBoundingBox(new BoundingBox(bbox[0], bbox[2], bbox[1], bbox[3]), false);
    features = indexed;
  } else {
    features = gp.queryForGeoJSONFeaturesInTable(table, dao.getBoundingBox());
  }

  let batch: Record<string, unknown>[] = [];
  let imported = 0;
  const flush = async () => {
    if (!batch.length) return;
    const { error } = await client.from("spatial_lpis_parcels").upsert(batch, { onConflict: "source_key,source_version,source_feature_id" });
    if (error) throw new Error(error.message);
    imported += batch.length;
    batch = [];
    process.stdout.write(`\rImported ${imported} LPIS parcels`);
  };

  for (const raw of features) {
    const feature = raw as GeoJSON.Feature;
    if (!feature.geometry) continue;
    const geom = polygonGeometry(feature.geometry);
    if (!geom) continue;
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const parcelLabel = property(props, /parcellabel/);
    const id = String(feature.id ?? parcelLabel ?? `${table}-${imported + batch.length + 1}`);
    const extract = property(props, /dateofextract/);
    batch.push({
      source_key: SOURCE_KEY,
      source_version: SOURCE_VERSION,
      source_feature_id: id,
      parcel_label: parcelLabel == null ? null : String(parcelLabel),
      commonage_indicator: commonageIndicator(props),
      date_of_extract: extract == null ? null : String(extract).slice(0,10),
      properties: props,
      geom,
    });
    if (batch.length >= 500) await flush();
  }
  await flush();
  console.log(`\nLPIS import complete: ${imported} parcels.`);

  if (bbox) {
    const { error } = await client.from("spatial_reference_coverage").insert({
      source_key: SOURCE_KEY,
      source_version: SOURCE_VERSION,
      coverage: coverageGeometry(bbox),
      status: "complete",
      feature_count: imported,
    });
    if (error) throw new Error(error.message);
    console.log(`Marked ${bbox.join(",")} as complete LPIS cache coverage.`);
  } else {
    console.warn("No --bbox supplied: parcels were imported but no 'complete' coverage polygon was asserted. This is intentional; a negative commonage inference requires explicit known-complete coverage.");
  }
} finally {
  gp.close();
}
