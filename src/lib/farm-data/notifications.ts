import "server-only";

/**
 * Farm Return Next Checkpoint 2, Vertical G — real persistence for
 * in-app notifications. Requires
 * `supabase/migrations/20260901020000_notifications.sql` to be applied
 * to the live project — see that migration's own header comment for the
 * full contract (server-generated `id`, real UNIQUE-constraint dedup,
 * trigger-enforced lifecycle state machine, scheduled expiry). Every
 * call here will fail with a real, honest Postgres permission/schema
 * error until it's applied, not a silently wrong result — the same
 * disclosed-until-applied posture `decisions.ts`/`telemetry.ts` already
 * document for their own migrations.
 *
 * **Architecture — plain authenticated client + RLS, not a privileged
 * client.** Identical reasoning to `decisions.ts`'s own header comment.
 *
 * `NotificationInput` is deliberately its own interface here, not
 * `@/orchestration/notify`'s types — `src/lib/farm-data/` stays below
 * the orchestration layer, the same layering `decisions.ts`'s
 * `DecisionInput` already establishes.
 */
import { createClient } from "@/lib/supabase/server";
import { rowToNotification, type NotificationRecord } from "./mappers";
import type { NotificationRow } from "./row-types";
import { jsonValuesEqual } from "./json-equal";

export interface NotificationInput {
  farmId: string;
  kind: string;
  /** See the migration's own header comment — kind-specific, supplied by
   * the caller, never computed here. */
  dedupeKey: string;
  title: string;
  body: string;
  fieldId?: string;
}

/**
 * Inserts a notification, via the regular RLS-respecting session client
 * (see this file's own header for why, not a privileged one). Always
 * inserted at `state = 'unread'` — `notifications_owner_insert`'s own
 * `with check` rejects any other value, and this function does not
 * expose a way to request one; there is no `state` field on
 * `NotificationInput`.
 *
 * Retry-safe by construction against the real `(farm_id, kind,
 * dedupe_key)` UNIQUE constraint — mirrors `insertDecision`'s/
 * `insertTelemetryEvent`'s own `23505`-retry-safety pattern field-for-
 * field: a duplicate key can only mean an earlier attempt (or a later
 * re-computation of the same underlying Prompt situation — see the
 * migration's own header comment on why `dedupe_key` exists at all)
 * already created this notification, so this call fetches and content-
 * compares the existing row rather than failing or creating a second,
 * duplicate notification for the same real situation.
 */
export async function insertNotification(input: NotificationInput): Promise<NotificationRecord> {
  const supabase = await createClient();

  const { data: ownedFarm, error: ownershipError } = await supabase
    .from("farms")
    .select("id")
    .eq("id", input.farmId)
    .maybeSingle();
  if (ownershipError) throw ownershipError;
  if (!ownedFarm) {
    throw new Error(`insertNotification: farm ${input.farmId} does not belong to the current session`);
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      farm_id: input.farmId,
      kind: input.kind,
      dedupe_key: input.dedupeKey,
      title: input.title,
      body: input.body,
      field_id: input.fieldId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await supabase
        .from("notifications")
        .select("*")
        .eq("farm_id", input.farmId)
        .eq("kind", input.kind)
        .eq("dedupe_key", input.dedupeKey)
        .single();
      if (fetchError) throw fetchError;
      const existingRow = existing as NotificationRow;
      const matches = jsonValuesEqual(
        { title: input.title, body: input.body, fieldId: input.fieldId ?? null },
        { title: existingRow.title, body: existingRow.body, fieldId: existingRow.field_id },
      );
      if (!matches) {
        throw new Error(
          `insertNotification: a notification for farm ${input.farmId}/kind ${input.kind}/dedupeKey ${input.dedupeKey} already exists with different title/body/fieldId — refusing to silently return stale/mismatched data`,
        );
      }
      return rowToNotification(existingRow);
    }
    throw error;
  }

  return rowToNotification(data as NotificationRow);
}

/**
 * Every notification for `farmId` currently in `'unread'` or `'viewed'`
 * state (i.e. not yet resolved and not expired) — the real, bounded list
 * a future notification-centre UI would read. Ordered newest first (a
 * notification list is read most-recent-first, unlike the offline
 * outbox's oldest-first retry order). Capped at `MAX_ACTIVE_NOTIFICATIONS`
 * with over-fetch-by-one truncation detection, the same `{ items,
 * truncated }` honesty pattern `listJobsWithDecisionsForFarm`
 * established (`jobs.ts`) — never silently present a truncated list as
 * complete.
 */
export const MAX_ACTIVE_NOTIFICATIONS = 200;

export interface ActiveNotificationsResult {
  notifications: NotificationRecord[];
  truncated: boolean;
}

export async function listActiveNotificationsForFarm(farmId: string): Promise<ActiveNotificationsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("farm_id", farmId)
    .in("state", ["unread", "viewed"])
    .order("created_at", { ascending: false })
    .limit(MAX_ACTIVE_NOTIFICATIONS + 1);
  if (error) throw error;
  const rows = (data ?? []) as NotificationRow[];
  const truncated = rows.length > MAX_ACTIVE_NOTIFICATIONS;
  return {
    notifications: rows.slice(0, MAX_ACTIVE_NOTIFICATIONS).map(rowToNotification),
    truncated,
  };
}

/** Postgres's own `check_violation` error code — what the migration's
 * `notifications_valid_transition` trigger raises for any transition
 * outside the real state machine (see that migration's own header
 * comment). Used by the three transition functions below to surface a
 * clear, specific error rather than an opaque database error string. */
const CHECK_VIOLATION = "23514";

/**
 * Shared by the three transition functions below — each performs the
 * *exact* same shape of update (only ever `state`, only ever this
 * farm's own row, matching the migration's column-scoped `update
 * (state)` grant exactly), differing only in the target state and the
 * transition's own name for error messages. Not exported itself; each
 * named function below is the real, narrow public API (mirroring why
 * `act/index.ts` exposes named functions per real transition rather
 * than one generic `updateJobStatus`).
 */
async function transitionNotification(
  id: string,
  farmId: string,
  toState: "viewed" | "acted_on" | "dismissed",
  transitionName: string,
): Promise<NotificationRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ state: toState })
    .eq("id", id)
    .eq("farm_id", farmId)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === CHECK_VIOLATION) {
      throw new Error(
        `${transitionName}: notification ${id} cannot transition to "${toState}" from its current state (invalid transition, rejected by notifications_valid_transition)`,
      );
    }
    throw error;
  }
  if (!data) {
    throw new Error(`${transitionName}: notification ${id} not found for farm ${farmId} (or already at "${toState}", a no-op RLS still requires an existing matching row to return)`);
  }
  return rowToNotification(data as NotificationRow);
}

/** `'unread' -> 'viewed'` — the farmer has seen this notification. */
export async function markNotificationViewed(id: string, farmId: string): Promise<NotificationRecord> {
  return transitionNotification(id, farmId, "viewed", "markNotificationViewed");
}

/** `'viewed' -> 'acted_on'` — the farmer took the suggested action (e.g.
 * started the Confirm-stage job the notification pointed at). Only legal
 * from `'viewed'` — see the migration's own state machine; a caller that
 * wants "acted on" reachable directly from `'unread'` too should call
 * `markNotificationViewed` first, matching the real farmer flow of
 * seeing a notification before acting on it. */
export async function markNotificationActedOn(id: string, farmId: string): Promise<NotificationRecord> {
  return transitionNotification(id, farmId, "acted_on", "markNotificationActedOn");
}

/** `'unread' -> 'dismissed'` or `'viewed' -> 'dismissed'` — the farmer
 * explicitly dismissed this notification without acting on it. */
export async function markNotificationDismissed(id: string, farmId: string): Promise<NotificationRecord> {
  return transitionNotification(id, farmId, "dismissed", "markNotificationDismissed");
}
