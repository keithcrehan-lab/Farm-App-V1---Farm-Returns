import "server-only";

/** Step 3: authenticated, read-only composition of persisted grass intake
 * evidence with the farm's own sessions, groups, fields and cover readings.
 *
 * The farm is bound server-side by the evidence adapter
 * (`getFarmForCurrentUser`); every other read is scoped to that farm id and
 * never to a caller-supplied one. No route, action, UI or feature flag uses
 * this yet. The result of `calculateGrassSessionSegmentDemand` is returned
 * unchanged — this layer never computes or adjusts a quantity.
 *
 * Fails closed when a read may be incomplete. The existing session reader is
 * not paginated and is ordered oldest first, so a truncated read would drop
 * the NEWEST sessions (hiding a grazing event or a double-counting overlap):
 * a sessions read at the assumed PostgREST row cap HOLDS. This assumes the
 * hosted default `max_rows` = 1000 (not recorded in the repo; BLOCKERS
 * GRASS-S3-ROWCAP). A missing field, group or cover row can only HOLD in the
 * domain (`fieldNotFound`, `groupNotFound`, `coverObservationUnverified`), and
 * evidence naming a group that no longer exists HOLDS here: deleting a group
 * cascades away its sessions, which would otherwise silently drop its demand.
 */
import { listCurrentFarmGrassIntakeEvidence } from "./grass-intake-evidence";
import { listGrazingFieldSessionsForFarm } from "./grazing-field-sessions";
import { listGrassCoverObservationsForFarm } from "./grass-management";
import { listFieldsForFarm } from "./fields";
import { listLivestockGroupsForFarm } from "./livestock";
import { resolveGrassIntakeEvidence } from "@/domain/grass-intake-evidence-resolution";
import {
  calculateGrassSessionSegmentDemand,
  GRASS_SESSION_SEGMENT_DEMAND_VERSION,
  type GrassSegmentDemand,
} from "@/domain/grass-session-segment-demand";

/** Supabase-hosted PostgREST default `max_rows`. Infrastructure limit, not a scientific value. */
export const UNPAGINATED_READ_ROW_CAP = 1000;

export type CurrentFarmGrassFieldDemand =
  | { status: "NO_AUTHORISED_FARM" }
  | { status: "EVALUATED"; farmId: string; demand: GrassSegmentDemand };

export async function getCurrentFarmGrassFieldSegmentDemand(input: {
  fieldId: string;
  from: string;
  to: string;
}): Promise<CurrentFarmGrassFieldDemand> {
  const evidence = await listCurrentFarmGrassIntakeEvidence();
  if (evidence.status !== "AVAILABLE") return { status: "NO_AUTHORISED_FARM" };
  const farmId = evidence.farmId;
  const held = (reasons: string[]): CurrentFarmGrassFieldDemand => ({
    status: "EVALUATED", farmId,
    demand: { status: "HELD", version: GRASS_SESSION_SEGMENT_DEMAND_VERSION, reasons: [...new Set(reasons)].sort() },
  });
  const from = Date.parse(input.from), to = Date.parse(input.to);
  if (typeof input.fieldId !== "string" || !input.fieldId.trim() || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return held(["invalidScopeOrWindow"]);
  }

  // Sessions that start at or after the window end cannot affect it; earlier ones (even long before
  // the window) are kept because they decide whether a cover reading was taken pre-grazing.
  const [sessions, groups, fields, covers] = await Promise.all([
    listGrazingFieldSessionsForFarm(farmId, new Date(to).toISOString()),
    listLivestockGroupsForFarm(farmId),
    listFieldsForFarm(farmId),
    listGrassCoverObservationsForFarm(farmId),
  ]);
  if (sessions.length >= UNPAGINATED_READ_ROW_CAP) return held(["possiblyTruncatedRead:sessions"]);

  const resolution = resolveGrassIntakeEvidence({ farmId, from: input.from, to: input.to, records: evidence.records });
  if (resolution.status === "RESOLVED") {
    const known = new Set(groups.filter(g => g.farmId === farmId).map(g => g.id.toLowerCase()));
    const named = resolution.segments.flatMap(seg => [
      ...Object.keys(seg.headCountWeight), ...Object.keys(seg.feed), ...Object.keys(seg.dairyStage),
      ...seg.pairs.flatMap(p => [p.payload.cowGroupId, p.payload.calfGroupId]),
    ].map(id => id.toLowerCase()));
    const missing = [...new Set(named.filter(id => !known.has(id)))].sort();
    if (missing.length) return held(missing.map(id => `evidenceGroupMissing:${id}`));
  }
  const demand = calculateGrassSessionSegmentDemand({
    farmId, fieldId: input.fieldId, from: input.from, to: input.to,
    resolution, fields, sessions, groups, covers,
  });
  return { status: "EVALUATED", farmId, demand };
}
