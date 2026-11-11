/**
 * Where a measurement was taken. Each reading saves the phone's location
 * at the moment the farmer taps Save, with the accuracy the phone reports,
 * so readings can be pinned on the map and checked against the field.
 *
 * Isomorphic-safe: `navigator` is only read inside `captureReadingLocation`.
 * Never fabricated: no usable fix means the reading saves without one.
 */

export interface ReadingFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  /** Device time of the fix (ms since epoch). */
  at: number;
}

/** A fix older than this doesn't describe where the reading was taken. */
export const READING_FIX_MAX_AGE_MS = 30_000;
/** A fix vaguer than this can't place the reading in a field. */
export const READING_FIX_MAX_ACCURACY_M = 50;
/** A reading timed this far from now (a back-dated entry) gets no location. */
export const READING_LIVE_WINDOW_MS = 10 * 60_000;

/** Whether a saved reading location is good enough to pin on a map. */
export function isUsableReadingLocation(r: { lat: number | null; lng: number | null; accuracyM: number | null }): r is { lat: number; lng: number; accuracyM: number | null } {
  return r.lat !== null && r.lng !== null && Number.isFinite(r.lat) && Number.isFinite(r.lng) && (r.accuracyM === null || r.accuracyM <= READING_FIX_MAX_ACCURACY_M);
}

/** The best fix to save with a reading, or null when none is fresh and accurate enough. */
export function pickReadingFix(candidates: ReadonlyArray<ReadingFix | null | undefined>, nowMs: number): ReadingFix | null {
  const usable = candidates.filter((f): f is ReadingFix =>
    !!f && Number.isFinite(f.lat) && Number.isFinite(f.lng) && nowMs - f.at <= READING_FIX_MAX_AGE_MS && f.at - nowMs <= 5_000
    && (f.accuracyM === null || f.accuracyM <= READING_FIX_MAX_ACCURACY_M));
  if (!usable.length) return null;
  return usable.reduce((best, f) => ((f.accuracyM ?? READING_FIX_MAX_ACCURACY_M) < (best.accuracyM ?? READING_FIX_MAX_ACCURACY_M) ? f : best));
}

/** Whether a reading timed `observedAtMs` is being taken now (so the current location applies). */
export function isLiveReading(observedAtMs: number, nowMs: number): boolean {
  return Math.abs(nowMs - observedAtMs) <= READING_LIVE_WINDOW_MS;
}

function freshFix(timeoutMs: number): Promise<ReadingFix | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        at: pos.timestamp || Date.now(),
      }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
}

/**
 * The location to save with a reading being taken now. Uses the live fix
 * when it is fresh and tight; otherwise asks the phone for a new one
 * (waiting at most `timeoutMs`) and keeps whichever is better.
 */
export async function captureReadingLocation(live: ReadingFix | null, timeoutMs = 6_000): Promise<ReadingFix | null> {
  const now = Date.now();
  if (live && now - live.at <= 10_000 && live.accuracyM !== null && live.accuracyM <= 20) return live;
  // The geolocation timeout doesn't count time spent on a permission prompt, so
  // cap the whole wait: saving never hangs on location.
  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs + 500));
  const fresh = await Promise.race([freshFix(timeoutMs), deadline]);
  return pickReadingFix([fresh, live], Date.now());
}
