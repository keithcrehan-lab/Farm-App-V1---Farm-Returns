import "server-only";

/**
 * Farm Return Next — Field Awareness / Satellite Field Intelligence
 * campaign. The one real server-side aggregator that assembles a
 * `FieldAwarenessSnapshot` (`src/domain/field-awareness.ts`) for a real
 * field belonging to the current user's real farm: it verifies field
 * ownership, calls the real CDSE Sentinel-2 STAC search + `
 * selectBestSatelliteCoverage`, fetches real confirmed farm activity for
 * the same field, and hands everything to `buildFieldAwarenessSnapshot`
 * — the pure assembly function. No agronomic/scientific judgement is
 * made here; this module only fetches real evidence and shapes it into
 * the existing domain contract.
 *
 * **Field ownership**: this deliberately does NOT run a new raw
 * `fields` query scoped by `id` alone. `src/lib/farm-data/fields.ts`'s
 * own internal `fetchField(fieldId)` helper does exactly that (no
 * `farm_id` filter in the query itself — its own header comment
 * documents RLS as the real enforcement boundary there, with the
 * explicit query-level filter treated as defence in depth on every
 * *other* export in that file). This campaign's own non-negotiable
 * farm-scoping invariant (`docs/farm-return-next/BLOCKERS.md`,
 * Checkpoint 1.5's own cross-farm regression precedent) asks for
 * server-side ownership verification that does not rely on RLS alone —
 * so this module instead reuses `listFieldsForFarm(farmId)`, which
 * already applies a real, explicit `.eq("farm_id", farmId)` filter at
 * the query level, and finds the target field by id within that
 * farm-scoped result. A `fieldId` that does not belong to the current
 * user's farm is therefore never distinguishable from a
 * non-existent one — both simply return `null` here, before any
 * satellite call or activity lookup happens.
 */
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listConfirmedJobSessionsForFarm } from "@/lib/farm-data/job-sessions";
import { searchSentinel2L2AScenes } from "@/server/satellite/cdse-stac-client";
import { selectMostRecentUsableSatelliteCoverage, type SatelliteFieldCoverage } from "@/domain/satellite-field-coverage";
import { boundingBox } from "@/domain/field-boundary";
import { blockedInsufficientEvidence, unknown, type EngineOutcome } from "@/domain/evidence";
import {
  buildFieldAwarenessSnapshot,
  FIELD_AWARENESS_MAX_USABLE_CLOUD_COVER_PERCENT,
  FIELD_AWARENESS_SATELLITE_LOOKBACK_DAYS,
  type FieldAwarenessRecentActivity,
  type FieldAwarenessSnapshot,
} from "@/domain/field-awareness";
import type { ActivityType } from "@/domain/job-actual";
import type { Field } from "@/domain/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `job_actuals.activity_type` is stored as a plain DB string (see
 * `mappers.ts`'s own `JobActualRecord.activityType: string`) — this
 * mirrors the same real-vs-unknown-value discipline
 * `field-awareness.ts` already applies to `recentActivity.fieldId`
 * (never trust an upstream value blindly): an activity row whose type
 * isn't one of the five real, validated `ActivityType` values is
 * dropped rather than mislabelled, since none of today's real Confirm
 * Actual paths can produce anything else. */
const KNOWN_ACTIVITY_TYPES: ReadonlySet<string> = new Set<ActivityType>([
  "fertiliser_spreading",
  "slurry_spreading",
  "silage",
  "field_inspection",
  "livestock_work",
]);

/**
 * Real CDSE search + real field-polygon-checked, cloud-ceiling-checked
 * selection for one mapped field. Never throws on a provider
 * failure/outage — but a real `StacSearchResult.status === "unavailable"`
 * (network error, timeout, malformed response) is now reported as
 * `UNKNOWN`, not `BLOCKED_INSUFFICIENT_EVIDENCE` (Codex audit MEDIUM,
 * round 1): the two are genuinely different honest states — "we
 * couldn't check" vs. "we checked and there is no usable observation" —
 * and `field-awareness.ts`'s own warning text now distinguishes them.
 * Uses `selectMostRecentUsableSatelliteCoverage`, not
 * `selectBestSatelliteCoverage` (Codex audit HIGH, round 1): the latter
 * always returns the least-cloudy real candidate however cloudy that
 * candidate actually is, which let a fully cloud-obscured scene reach
 * the UI as a "current"/"high confidence" observation — the ceiling
 * here (`FIELD_AWARENESS_MAX_USABLE_CLOUD_COVER_PERCENT`) rules that
 * out, and selecting by recency among usable candidates (rather than by
 * least cloud cover globally) is what this module's own "how recently
 * have we had a usable look" question actually needs.
 */
async function fetchSatelliteCoverageForField(field: Field, generatedAt: string): Promise<EngineOutcome<SatelliteFieldCoverage>> {
  if (!field.polygon) {
    // Never reached by the current caller (which checks `hasMappedBoundary`
    // first), but kept fail-closed rather than assuming that invariant.
    return blockedInsufficientEvidence("NO_RECENT_SATELLITE_SCENE_AVAILABLE", ["fieldBoundary"]);
  }

  const bbox = boundingBox(field.polygon);
  const dateTo = generatedAt;
  const dateFrom = new Date(new Date(generatedAt).getTime() - FIELD_AWARENESS_SATELLITE_LOOKBACK_DAYS * MS_PER_DAY).toISOString();

  const searchResult = await searchSentinel2L2AScenes({ bbox, dateFrom, dateTo });
  if (searchResult.status !== "ok") {
    return unknown("SATELLITE_PROVIDER_UNAVAILABLE");
  }

  return selectMostRecentUsableSatelliteCoverage(field.polygon, searchResult.items, {
    asOf: generatedAt,
    lookbackDays: FIELD_AWARENESS_SATELLITE_LOOKBACK_DAYS,
    maxCloudCoverPercent: FIELD_AWARENESS_MAX_USABLE_CLOUD_COVER_PERCENT,
  });
}

/**
 * A confirmed Actual's own real, authoritative field list —
 * `payload.fieldIds` (`FertiliserSpreadingActual`/`SlurrySpreadingActual`/
 * `SilageActual`/`FieldInspectionActual` in `job-actual.ts` each carry
 * one; `LivestockWorkActual` genuinely has none). `session.primaryFieldId`
 * is only the session's own single "main" field for GPS Job Mode's UX
 * — Codex audit MEDIUM (round 2): the first version of this function
 * matched on `primaryFieldId` alone, silently missing a real confirmed
 * activity for any field that was a genuine secondary field in
 * `fieldIds` but not the session's primary one. `payload` is untyped
 * (`Record<string, unknown>`) at this layer, so the array is validated
 * defensively rather than cast.
 */
function payloadFieldIds(payload: Record<string, unknown>): string[] {
  const raw = payload.fieldIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string");
}

/**
 * Real, already-confirmed farm activity for one field, from the
 * existing GPS Job Session + Confirm Actual contract
 * (`listConfirmedJobSessionsForFarm`) — no new query, no new table.
 * Filtered here to the target field as a real optimisation (this
 * function's own caller already knows which field it wants); the
 * domain layer's own `buildFieldAwarenessSnapshot` re-filters
 * defensively regardless (by this function's own explicit `fieldId`,
 * never by the session's own possibly-different `primaryFieldId` — see
 * the returned record's own `fieldId` below), so a bug here can never
 * leak another field's activity into the snapshot.
 */
async function fetchRecentActivityForField(farmId: string, fieldId: string): Promise<FieldAwarenessRecentActivity[]> {
  const { sessions } = await listConfirmedJobSessionsForFarm(farmId);
  return sessions
    .filter((session) => {
      if (!session.actual || !KNOWN_ACTIVITY_TYPES.has(session.actual.activityType)) return false;
      return session.primaryFieldId === fieldId || payloadFieldIds(session.actual.payload).includes(fieldId);
    })
    .map((session) => ({
      // The field this snapshot is being built for — always correct,
      // whether the match came from `primaryFieldId` or a secondary
      // entry in `payload.fieldIds` (which may name a different field
      // than `primaryFieldId` entirely).
      fieldId,
      activityType: session.actual!.activityType as ActivityType,
      completionType: session.actual!.completionType,
      confirmedAt: session.actual!.confirmedAt,
    }));
}

/**
 * The one real entry point this campaign's Server Action calls. Returns
 * `null` when there is no current farm, or when `fieldId` does not
 * belong to it — both a genuine "not found" and a cross-farm access
 * attempt look identical to a caller, by design (never distinguishing
 * the two is itself part of the farm-scoping invariant: it gives an
 * attacker no signal either way).
 */
export async function getFieldAwarenessForCurrentUser(fieldId: string): Promise<FieldAwarenessSnapshot | null> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return null;

  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((candidate) => candidate.id === fieldId);
  if (!field) return null;

  const generatedAt = new Date().toISOString();
  const hasMappedBoundary = Boolean(field.polygon);

  const [coverage, recentActivity] = await Promise.all([
    hasMappedBoundary
      ? fetchSatelliteCoverageForField(field, generatedAt)
      : Promise.resolve(blockedInsufficientEvidence<SatelliteFieldCoverage>("NO_RECENT_SATELLITE_SCENE_AVAILABLE", ["fieldBoundary"])),
    fetchRecentActivityForField(farm.id, fieldId),
  ]);

  return buildFieldAwarenessSnapshot(
    {
      fieldId: field.id,
      farmId: farm.id,
      hasMappedBoundary,
      coverage,
      recentActivity,
    },
    generatedAt,
  );
}
