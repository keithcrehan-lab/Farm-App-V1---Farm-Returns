/**
 * Minimal, dependency-free structural equality for JSON-safe values
 * (string/number/boolean/null/array/plain-object — everything a jsonb
 * column round-trips) — treats `null` and `undefined` as the same "absent"
 * value, since a jsonb column always comes back `null`, never `undefined`,
 * for an optional TS field that was never set.
 *
 * Extracted from `decisions.ts` (Farm Return Next Checkpoint 2, Vertical A)
 * so `telemetry.ts`'s `insertTelemetryEvent` can reuse the identical
 * retry-safety content comparison `insertDecision` already established,
 * rather than a second, silently-divergent copy — originally written as a
 * decisions.ts-local helper ("not a general-purpose utility... deliberately
 * not reaching for a dependency for something this small"), which was true
 * of a single caller but stopped being true once a second real caller
 * needed the exact same logic.
 */
export function jsonValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => jsonValuesEqual(item, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
  for (const key of keys) {
    if (!jsonValuesEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}
