import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface InternalLpisMatch {
  matched: boolean;
  commonage: boolean | null;
  parcelCount: number;
  parcelsWithUsableIndicator: number;
  maxOverlapRatio: number;
  sourceKey: "dafm_lpis_2025";
  sourceVersion?: string;
}

export interface InternalWatercourseMatch {
  featureId: string;
  featureName?: string;
  sourceVersion: string;
  distanceM: number;
}

export interface InternalGroundwaterMatch {
  featureId: string;
  featureType:
    | "public_supply_source_protection_area"
    | "group_water_scheme_source_protection_area"
    | "well"
    | "spring"
    | "borehole"
    | "dug_well"
    | "other_groundwater_feature";
  featureName?: string;
  locationAccuracyM?: number;
  sourceKey: string;
  sourceVersion: string;
  distanceM: number;
  intersectsField: boolean;
}

export interface InternalSpatialReferenceResult {
  lpis: InternalLpisMatch;
  nearestWatercourse: InternalWatercourseMatch | null;
  groundwaterFeatures: InternalGroundwaterMatch[];
  coverage: Record<string, boolean>;
}

export async function resolveFieldSpatialReference(polygon: GeoJSON.Polygon): Promise<InternalSpatialReferenceResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_field_spatial_reference", { p_field_geojson: polygon });
  if (error) throw new Error(`resolveFieldSpatialReference: ${error.message}`);
  const value = data as unknown as InternalSpatialReferenceResult | null;
  if (!value) throw new Error("resolveFieldSpatialReference: database returned no result");
  return value;
}
