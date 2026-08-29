/**
 * Observe stage — `MASTER_SPEC.md`'s loop table: "The app ingests whatever
 * it can see without asking: farmer-entered records, phone GPS while the
 * farmer is on the farm, weather/market data already wired in V1, time
 * (season, closed periods, housing calendar)."
 *
 * Typed interfaces only in this checkpoint (`BUILD_PLAN.md` Checkpoint 1) —
 * real ingestion (phone GPS, offline local queue) is Vertical A, gated on
 * this checkpoint's contracts freezing first. Nothing here duplicates
 * `src/domain/weather-*`/`market.ts` — an `ObserveSource` *feeds* those
 * existing Estimate-stage modules, it never recomputes what they already
 * produce (`ARCHITECTURE.md`'s reuse boundary).
 */

export type ObservationSource = "farmer_entry" | "phone_gps" | "weather" | "market" | "calendar";

/**
 * One thing Observe saw, before any Estimate has been run over it. Kept
 * generic (`payload: unknown`) — this checkpoint fixes the envelope shape
 * only; each real source (Vertical A's GPS track, V1's existing weather/
 * market fetches) defines its own typed payload when it's wired in, not
 * invented here ahead of that work.
 */
export interface ObservedEvent {
  farmId: string;
  source: ObservationSource;
  /** ISO datetime. */
  observedAt: string;
  payload: unknown;
}

/**
 * A pluggable Observe source — Vertical A's GPS ingestion, and any future
 * source, implement this so Prompt/Decide never need to know which one
 * produced an event.
 */
export interface ObserveSource {
  source: ObservationSource;
  collect(farmId: string): Promise<ObservedEvent[]>;
}
