import "server-only";

import type { Field, Farm } from "@/domain/types";
import { fieldScanCentre, parseFieldScanPayload, type FieldScanImportRequest, type FieldScanOutcome } from "@/domain/field-scan";
import { createFields } from "@/lib/farm-data/fields";
import { createClient } from "@/lib/supabase/server";
import { scanStaticLpis, resolveStaticLpis } from "@/server/lpis-static";

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
    if (process.env.LPIS_STATIC_BASE_URL && process.env.LPIS_STATIC_SCAN_ENABLED === "true") {
      try {
        const result = await scanStaticLpis(lng, lat, fields.map(field => field.lpisRef).filter((ref): ref is string => Boolean(ref)));
        if (result?.status === "READY" && result.candidates.length > 0) return result;
      } catch (error) { console.error("[field-scan] static reference unavailable; falling back", error); }
    }
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
  requests: readonly FieldScanImportRequest[],
): Promise<Field[]> {
  const prefix = "dafm_lpis_2025:2025:";
  const existingRefs = new Set(fields.map((field) => field.lpisRef).filter((ref): ref is string => Boolean(ref)));
  const existingNames = new Set(fields.map((field) => field.name.trim().toLocaleLowerCase()));

  const cleaned = requests
    .slice(0, 80)
    .map((request) => ({ lpisRef: request.lpisRef.trim(), name: request.name.trim() }))
    .filter((request) => request.lpisRef.startsWith(prefix) && request.lpisRef.length > prefix.length && !existingRefs.has(request.lpisRef));

  if (cleaned.length === 0) return [];

  const refs = new Set<string>();
  const names = new Set<string>();
  for (const request of cleaned) {
    if (request.name.length === 0 || request.name.length > 80) throw new Error("Give every selected field a name of 1 to 80 characters.");
    const nameKey = request.name.toLocaleLowerCase();
    if (existingNames.has(nameKey) || names.has(nameKey)) throw new Error(`Field name "${request.name}" is already in use. Choose a different name.`);
    if (refs.has(request.lpisRef)) throw new Error("The same LPIS field was selected more than once.");
    refs.add(request.lpisRef);
    names.add(nameKey);
  }

  if (process.env.LPIS_STATIC_BASE_URL && process.env.LPIS_STATIC_SCAN_ENABLED === "true") {
    const resolvedStatic = await resolveStaticLpis(cleaned.map(request => request.lpisRef.slice(prefix.length)));
    if (!resolvedStatic || resolvedStatic.status !== "READY") {
      throw new Error("The selected boundaries cannot yet be verified against the official static LPIS source. Please try again later.");
    }
    const byRef = new Map(resolvedStatic.candidates.map(candidate => [candidate.lpisRef, candidate]));
    if (cleaned.some(request => !byRef.has(request.lpisRef))) throw new Error("One or more selected LPIS boundaries could not be verified.");
    return createFields(farm.id, cleaned.map(request => ({
      name: request.name,
      polygon: byRef.get(request.lpisRef)!.polygon,
      polygonSource: "lpis_imported" as const,
      lpisRef: request.lpisRef,
      fertility: {},
    })));
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_lpis_parcels_by_feature_ids", {
    p_feature_ids: cleaned.map((request) => request.lpisRef.slice(prefix.length)),
  });
  if (error) throw new Error(`Selected LPIS boundaries could not be resolved: ${error.message}`);

  const resolved = parseFieldScanPayload(data);
  if (resolved.status !== "READY") throw new Error(resolved.reason);
  const byRef = new Map(resolved.candidates.map((candidate) => [candidate.lpisRef, candidate]));
  const selected = cleaned.map((request) => ({ request, candidate: byRef.get(request.lpisRef) }));
  if (selected.some(({ candidate }) => !candidate)) {
    throw new Error("One or more selected field boundaries are no longer available in the canonical LPIS cache.");
  }

  return createFields(
    farm.id,
    selected.map(({ request, candidate }) => ({
      name: request.name,
      polygon: candidate!.polygon,
      polygonSource: "lpis_imported" as const,
      lpisRef: candidate!.lpisRef,
      fertility: {},
    })),
  );
}
