import "server-only";

/**
 * Farm Return Next — real persistence for the universal Job Session
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`).
 * Requires `supabase/migrations/20260902000000_job_sessions.sql` applied —
 * see that migration's own header comment for the full contract. Every
 * call here will fail with a real, honest Postgres permission/schema
 * error until it's applied, not a silently wrong result — the same
 * disclosed-until-applied posture `decisions.ts`/`telemetry.ts` already
 * document for their own migrations.
 *
 * **Architecture — plain RLS-respecting session client, not a privileged
 * one** — identical reasoning to `decisions.ts`'s own header comment (see
 * there for the full account of why a service-role client was considered
 * and rejected for this class of table).
 *
 * **This module does not itself run the lifecycle state machine.** It
 * accepts an already-computed new status/patch (produced by
 * `src/orchestration/job-session/index.ts` calling
 * `src/domain/job-session-lifecycle.ts`'s pure transition functions) and
 * persists exactly that — the same "farm-data trusts its caller's already-
 * validated Decision, backed by an independent database CHECK/trigger
 * either way" split `decisions.ts`'s own header comment documents for
 * `decideAsFarmer`. `job_sessions_check_valid_transition`
 * (the migration's own trigger) is the independent backstop if this
 * module's caller is ever wrong.
 *
 * `id` is client-generated, like `telemetry.ts`'s `TelemetryEventInput.id`
 * — offline-first creation requires a real, addressable session id before
 * ever reaching the network (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §8).
 * `insertJobSession`'s retry-safety therefore compares by `id`, mirroring
 * `insertTelemetryEvent` field-for-field, not `insertJob`'s
 * unique-constraint-on-a-different-column pattern.
 */
import { createClient } from "@/lib/supabase/server";
import { rowToJobActual, rowToJobSession, type JobActualRecord, type JobSessionRecord, type JobSessionStatus } from "./mappers";
import type { JobActualRow, JobSessionRow } from "./row-types";
import { jsonValuesEqual } from "./json-equal";
import type { ActiveInterval, InterruptionGap } from "@/domain/job-session-lifecycle";

/** Reused directly, not redefined — `job_sessions.field_segments`'s own
 * shape is owned by this same contract's UI/orchestration layer, not by
 * `src/domain/job-session-lifecycle.ts` (which only owns lifecycle
 * state), so it is declared once, here, rather than duplicated per
 * caller. */
export interface FieldSegmentInput {
  fieldId: string;
  enteredAt?: string;
  exitedAt?: string;
}

export interface NewJobSessionInput {
  /** Client-generated once, at Start Job time — never generated here. */
  id: string;
  farmId: string;
  decisionId: string;
  activityType: string;
  origin: "prompt" | "plan" | "manual" | "detected";
  /** Must be `"ready"` or `"active"` only — `job_sessions_valid_initial_status`
   * rejects anything else at the database level regardless of what this
   * module sends. */
  status: "ready" | "active";
  primaryFieldId?: string;
  fieldSegments?: FieldSegmentInput[];
  activeIntervals?: ActiveInterval[];
  deviceMetadata?: Record<string, unknown>;
}

function toComparableInput(input: NewJobSessionInput) {
  return {
    farmId: input.farmId,
    decisionId: input.decisionId,
    activityType: input.activityType,
    origin: input.origin,
    status: input.status,
    primaryFieldId: input.primaryFieldId ?? null,
    fieldSegments: input.fieldSegments ?? [],
    activeIntervals: input.activeIntervals ?? [],
    deviceMetadata: input.deviceMetadata ?? null,
  };
}

function toComparableRow(row: JobSessionRow) {
  return {
    farmId: row.farm_id,
    decisionId: row.decision_id,
    activityType: row.activity_type,
    origin: row.origin,
    status: row.status,
    primaryFieldId: row.primary_field_id,
    fieldSegments: row.field_segments,
    activeIntervals: row.active_intervals,
    deviceMetadata: row.device_metadata,
  };
}

/**
 * Inserts a Job Session, via the regular RLS-respecting session client.
 * Retry-safe by `id` (client-generated) — mirrors `insertTelemetryEvent`'s
 * `23505` recovery exactly, content-compared before trusting an existing
 * row as "the same retried insert" rather than silently returning
 * mismatched data.
 */
export async function insertJobSession(input: NewJobSessionInput): Promise<JobSessionRecord> {
  const supabase = await createClient();

  const { data: ownedFarm, error: ownershipError } = await supabase
    .from("farms")
    .select("id")
    .eq("id", input.farmId)
    .maybeSingle();
  if (ownershipError) throw ownershipError;
  if (!ownedFarm) {
    throw new Error(`insertJobSession: farm ${input.farmId} does not belong to the current session`);
  }

  const { data, error } = await supabase
    .from("job_sessions")
    .insert({
      id: input.id,
      farm_id: input.farmId,
      decision_id: input.decisionId,
      activity_type: input.activityType,
      origin: input.origin,
      status: input.status,
      primary_field_id: input.primaryFieldId ?? null,
      field_segments: input.fieldSegments ?? [],
      active_intervals: input.activeIntervals ?? [],
      device_metadata: input.deviceMetadata ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("job_sessions")
        .select("*")
        .eq("id", input.id)
        .single();
      if (fetchError) throw fetchError;
      const existingRow = existing as JobSessionRow;
      if (!jsonValuesEqual(toComparableInput(input), toComparableRow(existingRow))) {
        throw new Error(
          `insertJobSession: a job_sessions row with id ${input.id} already exists with different content — refusing to silently return stale/mismatched data`,
        );
      }
      return rowToJobSession(existingRow);
    }
    throw error;
  }

  return rowToJobSession(data as JobSessionRow);
}

export interface JobSessionStatusPatch {
  status: JobSessionStatus;
  primaryFieldId?: string;
  fieldSegments?: FieldSegmentInput[];
  activeIntervals?: ActiveInterval[];
  interruptionGaps?: InterruptionGap[];
  deviceMetadata?: Record<string, unknown>;
  cancelledReason?: string;
}

/**
 * Applies an already-computed lifecycle patch (pause/resume/finish/cancel,
 * or a metadata-only update with `status` unchanged) — see this file's
 * own header comment for why this module doesn't re-run the state machine
 * itself. `job_sessions_valid_transition` (the migration's own trigger)
 * independently rejects an illegal transition regardless of what this
 * function is asked to send, returning a real Postgres `check_violation`
 * (`23514`) this function propagates unchanged rather than swallowing.
 *
 * Idempotent by construction for the common retry case (a lost response
 * after a real commit): re-sending the identical patch either lands on an
 * already-identical row (Postgres allows a same-value update; the trigger's
 * own `new.status = old.status` branch treats that as a harmless no-op)
 * or, if the row has since moved on to a further legitimate transition,
 * fails closed with a clear `check_violation` rather than silently
 * clobbering newer state — a caller must not blindly retry this call
 * without first checking the session's current real status.
 */
export async function updateJobSessionStatus(
  farmId: string,
  jobSessionId: string,
  patch: JobSessionStatusPatch,
): Promise<JobSessionRecord> {
  const supabase = await createClient();

  const update: Record<string, unknown> = { status: patch.status };
  if (patch.primaryFieldId !== undefined) update.primary_field_id = patch.primaryFieldId;
  if (patch.fieldSegments !== undefined) update.field_segments = patch.fieldSegments;
  if (patch.activeIntervals !== undefined) update.active_intervals = patch.activeIntervals;
  if (patch.interruptionGaps !== undefined) update.interruption_gaps = patch.interruptionGaps;
  if (patch.deviceMetadata !== undefined) update.device_metadata = patch.deviceMetadata;
  if (patch.cancelledReason !== undefined) update.cancelled_reason = patch.cancelledReason;

  const { data, error } = await supabase
    .from("job_sessions")
    .update(update)
    .eq("id", jobSessionId)
    .eq("farm_id", farmId)
    .select("*")
    .single();
  if (error) throw error;
  return rowToJobSession(data as JobSessionRow);
}

export async function getJobSessionById(farmId: string, jobSessionId: string): Promise<JobSessionRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_sessions")
    .select("*")
    .eq("id", jobSessionId)
    .eq("farm_id", farmId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToJobSession(data as JobSessionRow) : null;
}

/** A generous, disclosed-truncation cap — same reasoning as
 * `MAX_JOB_HISTORY_ROWS`/`MAX_DECISION_HISTORY_ROWS`. `"ready"`/`"active"`/
 * `"paused"` sessions are genuinely rare to accumulate in volume (a real
 * farm has at most a handful in flight at once), but the same honesty
 * discipline applies regardless of how unlikely truncation is in
 * practice today. */
export const MAX_ACTIVE_JOB_SESSIONS = 200;

export interface ActiveJobSessionsResult {
  sessions: JobSessionRecord[];
  truncated: boolean;
}

const IN_PROGRESS_STATUSES: JobSessionStatus[] = ["ready", "active", "paused", "completed_estimated"];

/**
 * Every Job Session not yet in a terminal state (`"confirmed_actual"`/
 * `"cancelled"`) — Today/Plan's own real "in-flight work" surface, and
 * the read path Active GPS Job Mode uses to resume a session after an
 * app restart.
 */
export async function listActiveJobSessionsForFarm(farmId: string): Promise<ActiveJobSessionsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_sessions")
    .select("*")
    .eq("farm_id", farmId)
    .in("status", IN_PROGRESS_STATUSES)
    .order("created_at", { ascending: false })
    .limit(MAX_ACTIVE_JOB_SESSIONS + 1);
  if (error) throw error;

  const rows = data as JobSessionRow[];
  const truncated = rows.length > MAX_ACTIVE_JOB_SESSIONS;
  const sessions = rows.slice(0, MAX_ACTIVE_JOB_SESSIONS).map(rowToJobSession);
  return { sessions, truncated };
}

export interface JobSessionWithActual extends JobSessionRecord {
  /** The current (highest-revision) confirmed Actual for this session —
   * `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §14's "current Actual", never a
   * superseded revision. Present for every real `"confirmed_actual"`
   * session `listConfirmedJobSessionsForFarm` returns (a session cannot
   * legally reach that status without one — `confirmJobSessionActual`
   * (`job-actuals.ts`) is the only path there); typed optional here only
   * because this reader cannot itself re-verify that invariant from a
   * plain embedded-resource select. */
  actual?: JobActualRecord;
}

/** Same disclosed-honesty reasoning as `MAX_ACTIVE_JOB_SESSIONS` — a real
 * farm accumulates confirmed sessions over time, unlike in-progress ones,
 * so this cap is more likely to matter eventually than that one is. */
export const MAX_CONFIRMED_JOB_SESSIONS = 200;

export interface ConfirmedJobSessionsResult {
  sessions: JobSessionWithActual[];
  truncated: boolean;
}

/**
 * Records' own real reader for confirmed Job Sessions — every session
 * that has genuinely completed the whole Prompt/Manual → Active → Finish
 * → Confirm Actual journey, with its current Actual embedded (a real
 * PostgREST embedded-resource select over `job_sessions.id <-
 * job_actuals.job_session_id`, the same reuse-not-reinvent shape
 * `jobs.ts`'s own `listJobsWithDecisionsForFarm` already established for
 * `decisions`/`weightObservation`). Every revision for a session is
 * fetched (not just the latest — `job_actuals` has no "is this the
 * current revision" column to filter on server-side), and the
 * highest-revision one is selected client-side; this is safe precisely
 * because a session realistically has only a handful of revisions
 * (`job_actuals.ts`'s own `MAX_JOB_ACTUAL_REVISIONS` comment), not a
 * volume that would make fetching every revision here a real concern.
 */
export async function listConfirmedJobSessionsForFarm(farmId: string): Promise<ConfirmedJobSessionsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_sessions")
    .select("*, actuals:job_actuals(*)")
    .eq("farm_id", farmId)
    .eq("status", "confirmed_actual")
    .order("updated_at", { ascending: false })
    .limit(MAX_CONFIRMED_JOB_SESSIONS + 1);
  if (error) throw error;

  const rows = data as (JobSessionRow & { actuals: JobActualRow[] })[];
  const truncated = rows.length > MAX_CONFIRMED_JOB_SESSIONS;
  const sessions = rows.slice(0, MAX_CONFIRMED_JOB_SESSIONS).map((row): JobSessionWithActual => {
    const currentActualRow = row.actuals.reduce<JobActualRow | undefined>(
      (current, candidate) => (!current || candidate.revision > current.revision ? candidate : current),
      undefined,
    );
    return {
      ...rowToJobSession(row),
      ...(currentActualRow ? { actual: rowToJobActual(currentActualRow) } : {}),
    };
  });
  return { sessions, truncated };
}

/** Same generous cap/shape as `jobs.ts`'s `MAX_JOB_DECISION_ID_ROWS` — see
 * that constant's own doc comment for the full reasoning. */
export const MAX_JOB_SESSION_DECISION_ID_ROWS = 5000;

export interface JobSessionDecisionIdsResult {
  decisionIds: Set<string>;
  truncated: boolean;
}

/**
 * Records' own dedup input: every real `decisions.id` this farm has a
 * Job Session for, *any* status (not just `"confirmed_actual"`) — a
 * `"ready"`/`"active"`/`"paused"`/`"completed_estimated"` session's
 * authorising decision is still a real decision that should not *also*
 * appear as a bare, unattached "Decision" entry in Records. Mirrors
 * `jobs.ts`'s `listJobDecisionIdsForFarm` exactly — see that function's
 * own doc comment for why this is a dedicated, uncapped-in-practice query
 * rather than reusing `listConfirmedJobSessionsForFarm`'s own capped,
 * status-filtered list.
 */
export async function listJobSessionDecisionIdsForFarm(farmId: string): Promise<JobSessionDecisionIdsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_sessions")
    .select("decision_id")
    .eq("farm_id", farmId)
    .limit(MAX_JOB_SESSION_DECISION_ID_ROWS + 1);
  if (error) throw error;

  const rows = data as { decision_id: string }[];
  const truncated = rows.length > MAX_JOB_SESSION_DECISION_ID_ROWS;
  const decisionIds = new Set(rows.slice(0, MAX_JOB_SESSION_DECISION_ID_ROWS).map((r) => r.decision_id));
  return { decisionIds, truncated };
}
