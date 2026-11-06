import "server-only";

import type { Field, Farm } from "@/domain/types";
import { fieldScanCentre, generatedFieldNames, parseFieldScanPayload, type FieldScanOutcome } from "@/domain/field-scan";
import { createFields } from "@/lib/farm-data/fields";
import { createClient } from "@/lib/supabase/server";

const SCAN_RADIUS_M = 1200;
const SCAN_LIMIT = 120;

/**
 * Nearby public agricultural parcel boundaries from Farm Return's pinned
 * DAFM LPIS 2025 cache. This is geometry discovery only: a returned parcel
 * is never evidence that the signed-in farmer owns or controls it.
 */
export async function scanNearbyLpisFields(
  farm: Farm,
  fields: readonly Field[],
  requestedCentre?: [number, number],
): Promise<FieldScanOutcome> {
  const mappedPolygons = fields.flatMap((field) => (field.polygon ? [field.polygon] : []));
  const defaultCentre = fieldScanCentre(mappedPolygons, farm.location.centroid);
  const [lng, lat] = requestedCentre ?? defaultCentre;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -11 || lng > -5 || lat < 51 || lat > 56) {
    return { status: "UNAVAILABLE", reason: "That map location is outside the supported Irish field-scan area." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("scan_lpis_parcels_near_point", {
      p_lng: lng,
      p_lat: lat,
      p_radius_m: SCAN_RADIUS_M,
      p_limit: SCAN_LIMIT,
    });
    if (error) {
      console.error("[field-scan] LPIS cache query failed", error);
      return { status: "UNAVAILABLE", reason: "Public field boundaries are not available for this farm just now. You can still draw a field manually." };
    }

    const outcome = parseFieldScanPayload(data, fields.map((field) => field.lpisRef).filter((ref): ref is string => Boolean(ref)));
    if (outcome.status === "READY" && outcome.candidates.length === 0 && !outcome.coverageAtFarm) {
      return { status: "UNAVAILABLE", reason: "Field-scan coverage has not been loaded for this area yet. Search another Eircode or draw the field manually." };
    }
    return outcome;
  } catch (error) {
    console.error("[field-scan] scan failed", error);
    return { status: "UNAVAILABLE", reason: "Public field boundaries are not available just now. You can still draw a field manually." };
  }
}


/** Resolve selected LPIS references again on the server, then persist the
 * canonical cached geometry in one database insert. Client geometry is never
 * trusted to earn LPIS provenance. */
export async function importScannedLpisFields(
  farm: Farm,
  fields: readonly Field[],
  requestedRefs: readonly string[],
): Promise<Field[]> {
  const prefix = "dafm_lpis_2025:2025:";
  const refs = [...new Set(requestedRefs.filter((ref) => ref.startsWith(prefix) && ref.length > prefix.length))].slice(0, 80);
  if (refs.length === 0) return [];

  const existingRefs = new Set(fields.map((field) => field.lpisRef).filter((ref): ref is string => Boolean(ref)));
  const newRefs = refs.filter((ref) => !existingRefs.has(ref));
  if (newRefs.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_lpis_parcels_by_feature_ids", {
    p_feature_ids: newRefs.map((ref) => ref.slice(prefix.length)),
  });
  if (error) throw new Error(`Selected LPIS boundaries could not be resolved: ${error.message}`);

  const resolved = parseFieldScanPayload(data);
  if (resolved.status !== "READY") throw new Error(resolved.reason);
  const byRef = new Map(resolved.candidates.map((candidate) => [candidate.lpisRef, candidate]));
  const selected = newRefs.map((ref) => byRef.get(ref));
  if (selected.some((candidate) => !candidate)) {
    throw new Error("One or more selected field boundaries are no longer available in the canonical LPIS cache.");
  }

  const names = generatedFieldNames(fields.map((field) => field.name), selected.length);
  return createFields(
    farm.id,
    selected.map((candidate, index) => ({
      name: names[index],
      polygon: candidate!.polygon,
      polygonSource: "lpis_imported" as const,
      lpisRef: candidate!.lpisRef,
      fertility: {},
    })),
  );
}
