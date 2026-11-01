import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchEpaWaterFlowNetwork,
  fetchGsiGroupSchemeProtectionAreas,
  fetchGsiPublicSupplyProtectionAreas,
  fetchGsiWellsAndSprings,
  type SpatialBbox,
} from "./source-clients";
import { persistEpaWatercourses, persistGsiGroupSchemeAreas, persistGsiPublicSupplyAreas, persistGsiWells } from "./repository";

export interface SpatialReferenceSyncResult {
  status: "ok" | "partial";
  bbox: SpatialBbox;
  sources: Record<string, { status: "ok" | "unavailable"; features?: number; reason?: string }>;
}

export async function runSpatialReferenceSync(client: SupabaseClient, bbox: SpatialBbox): Promise<SpatialReferenceSyncResult> {
  const [epa, publicSpa, groupSpa, wells] = await Promise.all([
    fetchEpaWaterFlowNetwork(bbox),
    fetchGsiPublicSupplyProtectionAreas(bbox),
    fetchGsiGroupSchemeProtectionAreas(bbox),
    fetchGsiWellsAndSprings(bbox),
  ]);

  const sources: SpatialReferenceSyncResult["sources"] = {};
  for (const [key, result, persist] of [
    ["epa_water_flow_network", epa, persistEpaWatercourses],
    ["gsi_public_supply_spa", publicSpa, persistGsiPublicSupplyAreas],
    ["gsi_group_scheme_spa", groupSpa, persistGsiGroupSchemeAreas],
    ["gsi_wells_springs", wells, persistGsiWells],
  ] as const) {
    if (result.status === "unavailable") {
      sources[key] = { status: "unavailable", reason: result.reason };
      continue;
    }
    const count = await persist(client, result.features, bbox);
    sources[key] = { status: "ok", features: count };
  }

  return { status: Object.values(sources).every((source) => source.status === "ok") ? "ok" : "partial", bbox, sources };
}
