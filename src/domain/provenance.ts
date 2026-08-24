/**
 * Provenance mutation helpers — CLAUDE.md "Provenance is permanent": when a
 * farmer replaces an estimated/mapped/verified value with their own input,
 * the *working* value changes but the history does not. Every previous
 * TrackedValue is preserved via the `previous` chain rather than being
 * overwritten or discarded.
 *
 * These are the only sanctioned way to change a TrackedValue's value in
 * farmer-facing write flows — never assign directly into `.value`.
 */

import type { DataStatus, TrackedValue } from "./types";

/**
 * Farmer edits a value in the UI (e.g. taps a P/K index, edits a farm
 * profile field). Produces a new TrackedValue with status
 * "farmer_adjusted", the given source (typically the farmer's name) and
 * today's date, chaining the prior TrackedValue under `previous` so its
 * source/date/status are never lost.
 */
export function farmerAdjust<T>(
  current: TrackedValue<T>,
  newValue: T,
  source: string,
  today: string = new Date().toISOString().slice(0, 10),
): TrackedValue<T> {
  return {
    value: newValue,
    status: "farmer_adjusted",
    source,
    sourceDate: today,
    previous: current,
  };
}

/**
 * Farmer confirms a verified value (e.g. uploads a soil test result).
 * Distinct from farmerAdjust because the resulting status is "verified",
 * not "farmer_adjusted" — used when the new value comes from documented
 * evidence (a lab report, an invoice) rather than a farmer's own estimate.
 */
export function verify<T>(
  current: TrackedValue<T>,
  newValue: T,
  source: string,
  extra: Partial<Omit<TrackedValue<T>, "value" | "status" | "source" | "previous">> = {},
): TrackedValue<T> {
  return {
    value: newValue,
    status: "verified",
    source,
    previous: current,
    ...extra,
  };
}

/** True if this value has ever been farmer-adjusted or verified at any point in its chain. */
export function hasFarmerInput(tv: TrackedValue<unknown>): boolean {
  let node: TrackedValue<unknown> | undefined = tv;
  while (node) {
    if (node.status === "farmer_adjusted" || node.status === "verified") return true;
    node = node.previous;
  }
  return false;
}

/** Flattens the `previous` chain into an array, most recent first, for history UIs. */
export function provenanceHistory<T>(tv: TrackedValue<T>): TrackedValue<T>[] {
  const out: TrackedValue<T>[] = [];
  let node: TrackedValue<T> | undefined = tv;
  while (node) {
    out.push(node);
    node = node.previous;
  }
  return out;
}

export type { DataStatus };
