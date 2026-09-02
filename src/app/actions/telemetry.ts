"use server";

/**
 * Thin server-action wrapper around `insertTelemetryEvent`
 * (`src/lib/farm-data/telemetry.ts`, `server-only`) — the first real
 * caller of Vertical A's telemetry persistence, wired for the GPS Job
 * Session + Confirm Actual contract's offline outbox
 * (`src/lib/offline/job-session-sync.ts`). No logic of its own: a raw GPS
 * fix is already trusted client input by design (the same "the device is
 * the source of truth for its own observations" posture
 * `telemetry_events`' own migration comment documents), so this action
 * does not re-derive or validate the payload — it only bridges the
 * client/server boundary a Server Action requires.
 */
import { insertTelemetryEvent, type TelemetryEventInput } from "@/lib/farm-data/telemetry";
import type { TelemetryEventRecord } from "@/lib/farm-data/mappers";

export async function insertTelemetryEventAction(input: TelemetryEventInput): Promise<TelemetryEventRecord> {
  return insertTelemetryEvent(input);
}
