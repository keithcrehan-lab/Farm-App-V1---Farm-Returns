import "server-only";

/**
 * Farm Return Next Checkpoint 2, Vertical A — real persistence for raw
 * Observe-stage phone-GPS events. Requires
 * `supabase/migrations/20260901000000_telemetry_events.sql` to be
 * applied to the live project — see that migration's own header comment
 * for the full contract (client-generated idempotency-key `id`, 30-day
 * retention, no update/delete grant). Every call here will fail with a
 * real, honest Postgres permission/schema error until it's applied, not
 * a silently wrong result — the same disclosed-until-applied posture
 * `decisions.ts`/`individual-animals.ts` already document for their own
 * migrations.
 *
 * **Architecture — plain authenticated client + RLS, not a privileged
 * client** — identical reasoning to `decisions.ts`'s own header comment
 * (see there for the full account of why a service-role client was
 * considered and rejected for this class of table).
 *
 * `TelemetryEventInput` is deliberately its own interface here, not
 * `@/orchestration/observe`'s types — `src/lib/farm-data/` stays below
 * the orchestration layer, the same layering `decisions.ts`'s
 * `DecisionInput` already establishes.
 */
import { createClient } from "@/lib/supabase/server";
import { rowToTelemetryEvent, type PhoneGpsPayload, type TelemetryEventRecord } from "./mappers";
import type { TelemetryEventRow } from "./row-types";
import { jsonValuesEqual } from "./json-equal";

export interface TelemetryEventInput {
  /** Client-generated once, at capture time (the offline outbox's
   * idempotency key) — never generated here. See the migration's own
   * header comment for why this must be client-generated, not a server
   * default. */
  id: string;
  farmId: string;
  source: "phone_gps";
  recordedAt: string;
  payload: PhoneGpsPayload;
  /** GPS Job Session + Confirm Actual contract addition
   * (`20260902020000_telemetry_events_job_session_link.sql`) — present
   * when this fix was captured during a real Job Session; absent for an
   * ambient Farm Awareness-mode fix with no active session. Additive,
   * optional: every existing call site (none yet in production use)
   * continues to work unchanged with this omitted. */
  jobSessionId?: string;
}

/**
 * Inserts a raw telemetry event, via the regular RLS-respecting session
 * client (see this file's own header for why, not a privileged one).
 * `telemetry_events` is select+insert only at the database level — no
 * update/delete policy or grant exists, and this function doesn't
 * pretend otherwise: there is deliberately no `updateTelemetryEvent`/
 * `deleteTelemetryEvent` export in this file, and never will be, the
 * same "don't write a function nobody should ever call" discipline
 * `decisions.ts`'s own header comment documents for its own table.
 *
 * Retry-safe by construction, mirroring `insertDecision`'s own real
 * `23505`-retry-safety pattern (`decisions.ts`) field-for-field: `id` is
 * client-generated once by the offline outbox, so a `23505`
 * (unique_violation) here can only mean an earlier sync attempt's insert
 * already committed server-side even though that attempt's caller (the
 * outbox's own flush loop) never saw a successful response — exactly the
 * "phone went offline mid-request, retries once reconnected" case this
 * whole table exists to handle safely. Content-compared, not just
 * id-compared, for the same reason `insertDecision`'s own comment gives:
 * trusting any row with a matching id unconditionally would silently
 * return wrong data if an id were ever reused for a genuinely different
 * event (should never happen given the outbox's fresh-uuid-per-event
 * construction, but `CLAUDE.md`'s "never assume application code is the
 * only writer" applies here too).
 */
export async function insertTelemetryEvent(event: TelemetryEventInput): Promise<TelemetryEventRecord> {
  const supabase = await createClient();

  // Farm-ownership pre-check — same reasoning as insertDecision's own:
  // a genuine, real check on its own terms, but deliberately not the
  // only enforcement (the insert below runs through the same
  // RLS-respecting client, so telemetry_events_owner_insert's `with
  // check` independently rejects a cross-farm insert at the database
  // level even if this check were ever buggy or bypassed).
  const { data: ownedFarm, error: ownershipError } = await supabase
    .from("farms")
    .select("id")
    .eq("id", event.farmId)
    .maybeSingle();
  if (ownershipError) throw ownershipError;
  if (!ownedFarm) {
    throw new Error(`insertTelemetryEvent: farm ${event.farmId} does not belong to the current session`);
  }

  const { data, error } = await supabase
    .from("telemetry_events")
    .insert({
      id: event.id,
      farm_id: event.farmId,
      source: event.source,
      recorded_at: event.recordedAt,
      payload: event.payload,
      job_session_id: event.jobSessionId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("telemetry_events")
        .select("*")
        .eq("id", event.id)
        .single();
      if (fetchError) throw fetchError;
      const existingRow = existing as TelemetryEventRow;
      // recorded_at is normalized to a canonical ISO instant on both
      // sides before comparing — same reasoning as insertDecision's own
      // decided_at normalization: Postgres/PostgREST can return a
      // timestamptz in a different (but equivalent) textual form than
      // what was sent, which would otherwise fail a perfectly
      // legitimate retry closed.
      const matches = jsonValuesEqual(
        {
          farmId: event.farmId,
          source: event.source,
          recordedAt: new Date(event.recordedAt).toISOString(),
          payload: event.payload,
          jobSessionId: event.jobSessionId ?? null,
        },
        {
          farmId: existingRow.farm_id,
          source: existingRow.source,
          recordedAt: new Date(existingRow.recorded_at).toISOString(),
          payload: existingRow.payload,
          jobSessionId: existingRow.job_session_id,
        },
      );
      if (!matches) {
        throw new Error(
          `insertTelemetryEvent: a telemetry_events row with id ${event.id} already exists with different content — refusing to silently return stale/mismatched data`,
        );
      }
      return rowToTelemetryEvent(existingRow);
    }
    throw error;
  }

  return rowToTelemetryEvent(data as TelemetryEventRow);
}
