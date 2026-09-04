/**
 * Farm Return Next — GPS Job Mode, Phase 1: GPS Activity Candidate
 * detection contracts + state machine
 * (`docs/farm-return-next/IMPLEMENTATION_LOG.md`'s own "GPS Job Mode /
 * Uber-style Activity Recording" implementation note has the full
 * architecture account).
 *
 * A pure, dependency-free module — no database access, no React, no
 * browser API, no clock reads except where `nowIso`/a sample's own
 * `recordedAt` is explicitly passed in (the same discipline
 * `job-session-lifecycle.ts` already establishes for exactly the same
 * testability reason: every function here is deterministic given its
 * inputs, so a whole GPS journey can be replayed through it in a test
 * with no real device, no `setTimeout`, no mocked browser API). Does not
 * import `LocationPosition` (`src/lib/location/location-tracking-provider.ts`)
 * — `GpsActivitySample` below is a structurally-identical, independently-
 * defined type, the same "domain layer defines its own shape, callers
 * pass compatible data in" pattern `ActiveInterval`/`InterruptionGap`
 * already use in that same sibling module, keeping this file genuinely
 * free of any dependency on the location/browser layer. It does reuse
 * two existing, tested pure domain functions from sibling modules —
 * `near-field.ts`'s `distanceToPolygonKm` (real polygon-boundary
 * distance, not centroid) and `weather-stations.ts`'s
 * `haversineDistanceKm` (real geodesic point-to-point distance) — per
 * `DOMAIN_CONTRACTS.md`'s "never duplicate a calculation" rule.
 *
 * **What this module is not**: a replacement for `job-session-
 * lifecycle.ts`. A GPS Activity Candidate lives entirely *before* any
 * real `job_sessions` row exists — once a farmer confirms a candidate
 * start, this module's own job for that activity is finished; a real
 * job session begins and `job-session-lifecycle.ts`'s own, already-
 * frozen state machine takes over completely. This module never
 * produces a `job_sessions` status, never persists anything, and never
 * decides that work is confirmed — only ever that there is enough real,
 * conservative evidence to *ask* the farmer.
 *
 * **Two separate detectors, not one combined state machine** — matching
 * the two distinct real-world moments a farmer experiences (a "looks
 * like you're starting work" prompt, and a separate, later "looks like
 * you finished" prompt), and keeping each one's own heuristics simple
 * and independently testable:
 *
 * - `advanceStartDetection` — searches across every real mapped field
 *   for genuine, sustained dwelling evidence, before any job session
 *   exists.
 * - `advanceFinishDetection` — given an already-known active field (a
 *   real job session is already running), watches for genuine
 *   departure/stoppage evidence.
 *
 * **Every threshold below is a named, centralised, disclosed product
 * heuristic — never presented as scientific or regulatory fact.** None
 * of `DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG`'s values come from an
 * agronomic/regulatory source (`docs/evidence-register.md` has no entry
 * for this module, deliberately, matching the same "modules with no
 * external source" precedent `units.ts`/`near-field.ts` already
 * established for their own real-but-unsourced constants) — they exist
 * to make "is this farmer probably working a field" a conservative,
 * explainable yes/no, not to claim GPS can measure anything about the
 * work itself. Every one is exported and overridable per call, so a
 * future tuning pass never means hunting through this file's own logic.
 */

import { distanceToPolygonBoundaryKm, distanceToPolygonKm } from "./near-field";
import { haversineDistanceKm } from "./weather-stations";
import { isValidIsoUtcDateTime } from "./iso-datetime";

export interface GpsActivitySample {
  lat: number;
  lng: number;
  /** Metres — a sample with a missing, non-finite, or non-positive
   * accuracy is rejected outright by both detectors below (fails
   * closed, the same convention `near-field.ts`'s own `findNearbyField`
   * already established for exactly this reason: an untrustworthy
   * accuracy figure is worse than none, never treated as "perfectly
   * accurate"). */
  accuracyMeters?: number;
  /** Device-clock ISO datetime of this fix — the real "Observed" moment,
   * never whenever the app happens to process it. */
  recordedAt: string;
}

/** A minimal field shape this module actually needs — deliberately not
 * `import type { Field } from "./types"` in full: this module only ever
 * reads `id`/`name`/`polygon`, and a narrower parameter type keeps every
 * test fixture smaller without losing any real type safety (a real
 * `Field` satisfies this structurally, no mapping needed at any real
 * call site). */
export interface GpsActivityFieldRef {
  id: string;
  name: string;
  polygon?: GeoJSON.Polygon;
}

export type GpsActivityConfidence = "low" | "medium" | "high";

export const GPS_ACTIVITY_DETECTION_VERSION = "gps_activity_detection_v1.0.0";

/**
 * Every heuristic threshold this module uses, named and centralised —
 * see this file's own header comment for why none of these are
 * scientific/regulatory constants. A sample is "inside" a field only
 * when `distanceToPolygonKm` (real polygon-boundary distance, never
 * centroid) reports exactly 0 — there is deliberately no separate "near
 * enough" radius here: dwelling evidence must come from genuine boundary
 * containment, not proximity (proximity-only is `near-field.ts`'s own,
 * separate, already-shipped "Looks like you're near <field>" feature, a
 * materially weaker claim than "probably working in <field>").
 */
export interface GpsActivityDetectionConfig {
  /** Minimum real elapsed time (seconds) genuinely dwelling inside the
   * same candidate field before a `candidate_start` may fire. */
  minDwellSecondsForCandidateStart: number;
  /** Minimum number of accepted (accuracy-valid) samples before a
   * `candidate_start` may fire — a single lucky fix inside a field
   * boundary must never be enough on its own, however long the clock
   * says has elapsed since the first one. */
  minSamplesForCandidateStart: number;
  /** Minimum fraction (0-1) of accepted samples, within the current
   * candidate window, that must be genuinely inside the candidate field
   * — real field work is not typically 100% inside-boundary fixes (GPS
   * jitter near edges, brief edge crossings), but a majority of noisy
   * samples landing outside would mean this is not real dwelling. */
  minInsideFieldRatioForCandidateStart: number;
  /** Samples faster than this (km/h, derived from consecutive fixes'
   * real distance/time) read as road travel, not field work — reduces
   * false positives from driving alongside/through a field's own
   * boundary without stopping to work it (the brief's own "drive-past"
   * scenario). A sample this fast never counts toward dwell evidence,
   * even if it happens to land inside the polygon. */
  maxSpeedKmhForFieldWork: number;
  /** How many consecutive accepted samples must agree on a *different*
   * field before the candidate field itself switches — jitter/boundary-
   * crossing protection: a single noisy fix landing in a neighbouring
   * field must never flip the whole candidate over. */
  fieldSwitchStabilitySamples: number;
  /** Total elapsed time (seconds) since the first sample in an
   * `observing` window, with no `candidate_start` reached, before the
   * candidate expires — the "drove past, never stopped" case must
   * eventually give up rather than accumulate stale evidence forever. */
  candidateExpirySeconds: number;
  /** How many most-recent accepted samples are retained at all — bounds
   * memory/storage for the observation window (`GPS PRIVACY`: never
   * store more raw location data than the feature genuinely needs). Old
   * samples beyond this are dropped, oldest first. */
  maxRetainedSamples: number;
  /** Once a real job session is already active, how long (seconds) of
   * sustained genuine departure/stoppage evidence is required before a
   * `candidate_finish` may fire — must be long enough that a brief
   * headland turn or a short walk to the gate never triggers a false
   * "looks like you finished". */
  minSecondsOutsideFieldForCandidateFinish: number;
  /** Same accuracy-aware, jitter-resistant sample count the start
   * detector uses, mirrored for symmetry and equally conservative
   * behaviour on the way out. */
  minSamplesForCandidateFinish: number;
}

export const DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG: GpsActivityDetectionConfig = {
  minDwellSecondsForCandidateStart: 180, // 3 minutes
  minSamplesForCandidateStart: 3,
  minInsideFieldRatioForCandidateStart: 0.7,
  maxSpeedKmhForFieldWork: 15,
  fieldSwitchStabilitySamples: 2,
  candidateExpirySeconds: 900, // 15 minutes
  maxRetainedSamples: 60,
  minSecondsOutsideFieldForCandidateFinish: 300, // 5 minutes
  minSamplesForCandidateFinish: 3,
};

interface AcceptedObservation {
  sample: GpsActivitySample;
  /** The single field this sample is genuinely inside (boundary
   * distance 0), or `null` if it isn't inside any real mapped field's
   * boundary. Never "nearest field regardless of distance" — see
   * `near-field.ts`'s own identical discipline. */
  insideFieldId: string | null;
  /** km/h derived from the immediately preceding accepted sample, or
   * `undefined` for the very first accepted sample in a window (no
   * prior fix to derive speed from — never fabricated as `0`). */
  speedKmh?: number;
}

export type GpsActivityStartStatus = "observing" | "candidate_start" | "expired";

export interface GpsActivityStartState {
  status: GpsActivityStartStatus;
  /** Bounded, most-recent-first-dropped observation window — see
   * `maxRetainedSamples`. */
  observations: AcceptedObservation[];
  /** The field currently accumulating dwell evidence, once the
   * jitter-stability rule (`fieldSwitchStabilitySamples`) has picked
   * one — `null` until enough consistent samples exist. */
  candidateFieldId: string | null;
  /** ISO timestamp of this window's very first accepted sample —
   * `null` until one exists. Drives `candidateExpirySeconds` only (the
   * "genuinely ambiguous, never settling on any field" give-up clock) —
   * never the dwell-time qualification itself, see
   * `candidateFieldEnteredAt` below. */
  firstObservedAt: string | null;
  /** Codex audit HIGH (round 1, 2026-09-04): ISO timestamp of the first
   * accepted sample *since the current `candidateFieldId` was itself
   * established* — `null` until a candidate field exists. Every real
   * qualification metric (`dwellSeconds`, sample count, inside-ratio)
   * is measured from here, never from `firstObservedAt`: a farmer's
   * drive *to* a field (samples outside any field, or in transit) must
   * never count toward "how long have they been dwelling in this
   * field" once they arrive — the earlier version conflated "how long
   * has this whole observation window been open" with "how long has
   * the farmer actually been in the candidate field", letting a candidate
   * qualify almost immediately after arrival if the drive there alone
   * had already exceeded the dwell threshold. Reset to the current
   * sample's own `recordedAt` every time `candidateFieldId` itself
   * changes (including from `null`), so genuinely switching fields never
   * inherits the old field's own accumulated evidence either. */
  candidateFieldEnteredAt: string | null;
  /** Codex audit HIGH (round 4, 2026-09-04): the count of accepted
   * observations since `candidateFieldEnteredAt` — exactly the same
   * count `advanceStartDetection`'s own qualification check uses
   * internally, exposed here so a caller persisting real detection
   * evidence (`GpsActivityCandidateCard.tsx`'s own `deviceMetadata`)
   * reports the evidence that actually produced this candidate, not
   * `observations.length` (the whole window, which can include travel
   * time and, after a field switch, an entirely different candidate's
   * own earlier samples — `DOMAIN_CONTRACTS.md`'s "never duplicate a
   * calculation" rule applied to a UI-layer consumer, not just another
   * domain module). `0` while `candidateFieldId` is `null`. */
  candidateFieldSampleCount: number;
  confidence: GpsActivityConfidence;
}

export const IDLE_GPS_ACTIVITY_START_STATE: GpsActivityStartState = {
  status: "observing",
  observations: [],
  candidateFieldId: null,
  firstObservedAt: null,
  candidateFieldEnteredAt: null,
  candidateFieldSampleCount: 0,
  confidence: "low",
};

/**
 * True only when the whole sample is genuinely usable — every field
 * checked, not just `accuracyMeters` (Codex audit MEDIUM, round 5,
 * 2026-09-04: an earlier version validated accuracy alone; a malformed
 * `recordedAt` reached `new Date(...).getTime()` as `NaN`, which
 * silently poisons every downstream dwell/expiry arithmetic comparison
 * — a `NaN` comparison is always `false`, so neither the real
 * qualification thresholds nor the expiry give-up clock could ever fire
 * again, stalling detection indefinitely rather than failing closed).
 *
 * - `accuracyMeters`: missing, non-finite, zero, or negative is never
 *   treated as "perfectly accurate" — the same fail-closed convention
 *   `near-field.ts`'s `findNearbyField` already applies.
 * - `lat`/`lng`: must be real, finite, and within physically possible
 *   coordinate ranges — never trusted at face value from a corrupt or
 *   malformed device fix.
 * - `recordedAt`: validated with the same frozen, calendar-exact
 *   `isValidIsoUtcDateTime` this app's own established convention for
 *   every real timestamp already uses — not a second, weaker check
 *   (`DOMAIN_CONTRACTS.md`'s "never duplicate a calculation" rule).
 */
function isUsableSample(sample: GpsActivitySample): boolean {
  if (sample.accuracyMeters === undefined || !Number.isFinite(sample.accuracyMeters) || sample.accuracyMeters <= 0) return false;
  if (!Number.isFinite(sample.lat) || sample.lat < -90 || sample.lat > 90) return false;
  if (!Number.isFinite(sample.lng) || sample.lng < -180 || sample.lng > 180) return false;
  if (!isValidIsoUtcDateTime(sample.recordedAt)) return false;
  return true;
}

/**
 * The one real field this sample is *confidently* inside — genuinely
 * inside its polygon (`distanceToPolygonKm` reports 0) AND the sample's
 * own accuracy radius stays within the field's boundary too
 * (`distanceToPolygonBoundaryKm`, both imported, never reimplemented).
 * `null` if the sample isn't inside any real mapped field, if its own
 * position uncertainty means "inside" can't honestly be claimed, or if
 * two mapped fields' own boundaries genuinely overlap and both qualify
 * (a real, if unusual, farm-mapping case) — in that ambiguous case this
 * returns `null` rather than guessing one, since neither is more
 * "correct" than the other from geometry alone.
 *
 * Codex audit HIGH (round 2, 2026-09-04): the previous version tested
 * only the reported centre point, with no upper bound on accuracy at
 * all — a fix with kilometre-scale uncertainty (a real, if degraded, GPS
 * reading) could nominally land inside a small field and be treated as
 * fully confident evidence. This mirrors `near-field.ts`'s own existing
 * `findNearbyField` discipline (a reported position's own uncertainty
 * radius must be folded into the claim, never assumed away) applied to
 * "inside", not just "near".
 */
function fieldContainingSample(sample: GpsActivitySample, fields: readonly GpsActivityFieldRef[]): string | null {
  const mappedFields = fields.filter((f): f is GpsActivityFieldRef & { polygon: GeoJSON.Polygon } => f.polygon !== undefined);
  const point = { latitude: sample.lat, longitude: sample.lng };
  // `isUsableSample` (checked by every caller before this function
  // ever runs) already guarantees `accuracyMeters` is a real, finite,
  // positive number.
  const accuracyKm = sample.accuracyMeters! / 1000;
  const containing = mappedFields.filter((f) => distanceToPolygonKm(point, f.polygon) === 0 && distanceToPolygonBoundaryKm(point, f.polygon) >= accuracyKm);
  return containing.length === 1 ? containing[0].id : null;
}

/**
 * Three-way, accuracy-aware classification of one sample against one
 * *specific* field — genuinely `"inside"`, genuinely `"outside"`, or
 * `"ambiguous"` (the sample's own position uncertainty means neither
 * claim can honestly be made). Deliberately distinct from
 * `fieldContainingSample` (which searches *every* mapped field and
 * answers "inside or not," collapsing "outside" and "ambiguous" into
 * the same `null`) — `advanceFinishDetection` (below) needs the
 * three-way answer for one already-known field: an ambiguous fix (poor
 * accuracy, near enough to the boundary that the true position could
 * genuinely be on either side) must count as neither continued presence
 * nor departure evidence, not be silently folded into "must have left"
 * the way a bare "not confidently inside" check would (Codex audit HIGH,
 * round 5, 2026-09-04).
 */
function classifyFieldMembership(sample: GpsActivitySample, field: GpsActivityFieldRef): "inside" | "outside" | "ambiguous" {
  if (!field.polygon) return "ambiguous"; // no real boundary to compare against — never claim either way
  const point = { latitude: sample.lat, longitude: sample.lng };
  // `isUsableSample` (checked by every caller before this function ever
  // runs) already guarantees `accuracyMeters` is a real, finite,
  // positive number.
  const accuracyKm = sample.accuracyMeters! / 1000;
  const distance = distanceToPolygonKm(point, field.polygon);
  const boundaryDistance = distanceToPolygonBoundaryKm(point, field.polygon);
  if (boundaryDistance < accuracyKm) return "ambiguous"; // true position could genuinely be on either side of the boundary
  return distance === 0 ? "inside" : "outside";
}

function speedKmh(from: GpsActivitySample, to: GpsActivitySample): number | undefined {
  const fromMs = new Date(from.recordedAt).getTime();
  const toMs = new Date(to.recordedAt).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return undefined;
  const hours = (toMs - fromMs) / (1000 * 60 * 60);
  const km = haversineDistanceKm({ latitude: from.lat, longitude: from.lng }, { latitude: to.lat, longitude: to.lng });
  return km / hours;
}

function trimToRetainedWindow(observations: AcceptedObservation[], maxRetainedSamples: number): AcceptedObservation[] {
  if (observations.length <= maxRetainedSamples) return observations;
  return observations.slice(observations.length - maxRetainedSamples);
}

/**
 * Deterministic confidence — real signals only, never invented
 * precision (`GPS PRIVACY`/campaign brief: "Do not generate fake
 * precision"). `"high"` requires materially more evidence than the bare
 * `candidate_start` threshold itself, so a candidate that only just
 * qualifies is honestly reported as `"medium"`, not oversold.
 */
function computeStartConfidence(dwellSeconds: number, sampleCount: number, insideRatio: number, config: GpsActivityDetectionConfig): GpsActivityConfidence {
  const strongDwell = dwellSeconds >= config.minDwellSecondsForCandidateStart * 2;
  const strongSamples = sampleCount >= config.minSamplesForCandidateStart * 2;
  const strongRatio = insideRatio >= 0.9;
  if (strongDwell && strongSamples && strongRatio) return "high";
  if (dwellSeconds >= config.minDwellSecondsForCandidateStart && sampleCount >= config.minSamplesForCandidateStart) return "medium";
  return "low";
}

/**
 * Advances the *start* detector by one real sample. Pure and
 * deterministic — feed a whole simulated journey through this one
 * sample at a time to test any scenario with no real device.
 *
 * A sample failing accuracy is neither accepted into the window nor
 * treated as evidence of anything — it is simply ignored, exactly like
 * `findNearbyField` ignores an untrustworthy fix (fails closed, never
 * fabricates a reading from bad data).
 */
export function advanceStartDetection(
  state: GpsActivityStartState,
  sample: GpsActivitySample,
  fields: readonly GpsActivityFieldRef[],
  config: GpsActivityDetectionConfig = DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG,
): GpsActivityStartState {
  if (state.status !== "observing" || !isUsableSample(sample)) return state;

  const previous = state.observations[state.observations.length - 1]?.sample;
  const insideFieldId = fieldContainingSample(sample, fields);
  const observation: AcceptedObservation = {
    sample,
    insideFieldId,
    speedKmh: previous ? speedKmh(previous, sample) : undefined,
  };
  const observations = trimToRetainedWindow([...state.observations, observation], config.maxRetainedSamples);
  const firstObservedAt = state.firstObservedAt ?? sample.recordedAt;

  // Jitter-resistant field selection: only switch (or first pick) the
  // candidate field once the most recent `fieldSwitchStabilitySamples`
  // accepted samples all agree on the same real field.
  const recentFieldIds = observations.slice(-config.fieldSwitchStabilitySamples).map((o) => o.insideFieldId);
  const allAgreeOnField = recentFieldIds.length === config.fieldSwitchStabilitySamples && recentFieldIds.every((id) => id !== null && id === recentFieldIds[0]);
  const candidateFieldId = allAgreeOnField ? recentFieldIds[0] : state.candidateFieldId;
  // Codex audit HIGH (round 1, 2026-09-04): resets whenever the
  // candidate field itself changes (a fresh pick, or a genuine switch
  // to a different field) — see this field's own doc comment on
  // `GpsActivityStartState`.
  const candidateFieldEnteredAt = candidateFieldId !== state.candidateFieldId ? sample.recordedAt : state.candidateFieldEnteredAt;

  if (candidateFieldId === null) {
    // No stable field yet — still just observing, but check expiry
    // (measured from the whole window's own start, the one real use for
    // `firstObservedAt`) so a long, genuinely ambiguous drive-around
    // eventually gives up rather than accumulating stale evidence
    // forever.
    const observingSeconds = (new Date(sample.recordedAt).getTime() - new Date(firstObservedAt).getTime()) / 1000;
    if (observingSeconds >= config.candidateExpirySeconds) {
      return { ...state, status: "expired", observations, candidateFieldId, firstObservedAt, candidateFieldEnteredAt, candidateFieldSampleCount: 0 };
    }
    return { ...state, observations, candidateFieldId, firstObservedAt, candidateFieldEnteredAt, candidateFieldSampleCount: 0 };
  }

  // Every real qualification metric below is scoped to observations
  // recorded at-or-after `candidateFieldEnteredAt` — the drive *to* this
  // field must never count as time already spent dwelling in it.
  const sinceEnteringField = observations.filter((o) => new Date(o.sample.recordedAt).getTime() >= new Date(candidateFieldEnteredAt!).getTime());
  const dwellSeconds = (new Date(sample.recordedAt).getTime() - new Date(candidateFieldEnteredAt!).getTime()) / 1000;

  // A sample counts as positive dwell evidence only when it is both
  // genuinely inside the candidate field AND at a real field-work speed
  // (not road travel, e.g. a fast pass-through that happens to clip the
  // boundary) — but every sample since entering, positive or not, still
  // counts toward the ratio's own denominator, so a run of "drove
  // through and kept going" samples correctly drags the ratio down
  // rather than being silently excluded from the calculation.
  const isPositiveEvidence = (o: AcceptedObservation) => o.insideFieldId === candidateFieldId && (o.speedKmh === undefined || o.speedKmh <= config.maxSpeedKmhForFieldWork);
  const insideCount = sinceEnteringField.filter(isPositiveEvidence).length;
  const insideRatio = sinceEnteringField.length > 0 ? insideCount / sinceEnteringField.length : 0;
  // Codex audit HIGH (round 2, 2026-09-04): the historical ratio alone
  // does not guarantee the farmer is *still* in the field right now — a
  // run of genuine in-field samples followed by leaving (or speeding up)
  // could still clear the aggregate ratio/dwell/count thresholds for a
  // while after departure, presenting "starting work" after the farmer
  // has already gone. The *current* sample must itself be positive
  // evidence too, not just the historical average.
  const currentSampleIsPositiveEvidence = isPositiveEvidence(observation);

  if (currentSampleIsPositiveEvidence && dwellSeconds >= config.minDwellSecondsForCandidateStart && sinceEnteringField.length >= config.minSamplesForCandidateStart && insideRatio >= config.minInsideFieldRatioForCandidateStart) {
    return {
      status: "candidate_start",
      observations,
      candidateFieldId,
      firstObservedAt,
      candidateFieldEnteredAt,
      candidateFieldSampleCount: sinceEnteringField.length,
      confidence: computeStartConfidence(dwellSeconds, sinceEnteringField.length, insideRatio, config),
    };
  }

  // Expiry while a candidate field exists is measured the same way as
  // qualification — from when this specific candidate was entered, not
  // the whole window — so a farmer who keeps re-entering/leaving the
  // same field without ever genuinely settling still eventually expires.
  if (dwellSeconds >= config.candidateExpirySeconds) {
    return { ...state, status: "expired", observations, candidateFieldId, firstObservedAt, candidateFieldEnteredAt, candidateFieldSampleCount: sinceEnteringField.length };
  }

  return { ...state, observations, candidateFieldId, firstObservedAt, candidateFieldEnteredAt, candidateFieldSampleCount: sinceEnteringField.length };
}

// ---------------------------------------------------------------------------
// Finish detection — a real job session is already active in a known
// field; watches for genuine departure/stoppage evidence.
// ---------------------------------------------------------------------------

export type GpsActivityFinishStatus = "tracking" | "candidate_finish";

export interface GpsActivityFinishState {
  status: GpsActivityFinishStatus;
  observations: AcceptedObservation[];
  /** ISO timestamp of the most recent accepted sample that was still
   * genuinely inside the active field — `null` until at least one such
   * sample has been seen this session (a session can start being
   * tracked mid-departure in an edge case, e.g. detection resuming
   * after an app restart). Every fresh "still here" sample resets this
   * forward, which is exactly what makes sustained departure (not a
   * single noisy fix) the real trigger.
   *
   * Codex audit HIGH (round 2, 2026-09-04): deliberately *not* also
   * gated on `maxSpeedKmhForFieldWork` the way the start detector's own
   * dwell evidence is — genuine departure means genuinely leaving the
   * field's own boundary, not merely moving fast while still inside it
   * (a real, if brisk, in-field manoeuvre, or GPS-derived speed noise
   * between two close-together fixes). Speed distinguishes "driving
   * through" from "working" for a field the farmer hasn't entered yet;
   * once a session is already active in a known field, still being
   * inside its boundary is itself the fact that matters. */
  lastConfirmedInFieldAt: string | null;
  /** ISO timestamp of the first sample, since the last confirmed
   * in-field moment, that classified as genuinely `"outside"` —
   * `null` whenever there is no live departure evidence right now
   * (never yet left, or has since returned `"inside"`).
   *
   * Codex audit HIGH (round 6, 2026-09-04): measuring the departure
   * window as "time since last confirmed inside" let a few real
   * `"outside"` fixes, followed by several minutes of merely
   * `"ambiguous"` ones, cross the duration threshold on elapsed clock
   * time alone — `lastConfirmedInFieldAt` doesn't move for an ambiguous
   * sample, but neither did anything else confirm the farmer was still
   * away. Anchoring the duration to the first genuine `"outside"`
   * evidence (reset the moment the farmer is confirmed back `"inside"`)
   * makes the measured duration itself real departure time.
   *
   * Codex audit HIGH (round 8, 2026-09-04): round 6's own fix left this
   * *untouched* by an `"ambiguous"` sample in between, which still let
   * two sparse `"outside"` fixes bridged by an arbitrarily long
   * ambiguous gap satisfy both thresholds — most of the elapsed window
   * had no departure evidence at all, ambiguous or otherwise. An
   * `"ambiguous"` sample now resets this to `null` too: sustained
   * departure must be shown by a genuinely unbroken run of `"outside"`
   * evidence, not merely bookended by it. */
  firstGenuineOutsideAt: string | null;
}

export function idleGpsActivityFinishState(): GpsActivityFinishState {
  return { status: "tracking", observations: [], lastConfirmedInFieldAt: null, firstGenuineOutsideAt: null };
}

/**
 * Advances the *finish* detector by one real sample against the field a
 * real job session is already active in. Symmetric, equally
 * conservative counterpart to `advanceStartDetection` — sustained real
 * evidence required: a single noisy fix outside the field boundary, or
 * a brisk manoeuvre while still genuinely inside it (a real headland
 * turn), never fires a false finish on its own.
 */
export function advanceFinishDetection(
  state: GpsActivityFinishState,
  sample: GpsActivitySample,
  activeFieldId: string,
  fields: readonly GpsActivityFieldRef[],
  config: GpsActivityDetectionConfig = DEFAULT_GPS_ACTIVITY_DETECTION_CONFIG,
): GpsActivityFinishState {
  if (state.status !== "tracking" || !isUsableSample(sample)) return state;

  const activeField = fields.find((f) => f.id === activeFieldId);
  const previous = state.observations[state.observations.length - 1]?.sample;
  const insideFieldId = fieldContainingSample(sample, fields);
  const observation: AcceptedObservation = {
    sample,
    insideFieldId,
    speedKmh: previous ? speedKmh(previous, sample) : undefined,
  };
  const observations = trimToRetainedWindow([...state.observations, observation], config.maxRetainedSamples);

  // Codex audit HIGH (round 5, 2026-09-04): a bare "not confidently
  // inside" check folded genuinely `"ambiguous"` samples (poor accuracy,
  // near enough the boundary that the true position could honestly be
  // on either side) into the same bucket as confidently `"outside"`
  // ones — several ambiguous fixes after one real in-field confirmation
  // could satisfy the time/sample thresholds and present "looks like
  // you finished" with no genuine evidence the farmer ever actually
  // left. `activeField` missing entirely (a real caller bug, or a field
  // since removed) is treated the same as `"ambiguous"` — never a
  // confident claim either way.
  const membership = activeField ? classifyFieldMembership(sample, activeField) : "ambiguous";

  let lastConfirmedInFieldAt = state.lastConfirmedInFieldAt;
  let firstGenuineOutsideAt = state.firstGenuineOutsideAt;
  if (membership === "inside") {
    lastConfirmedInFieldAt = sample.recordedAt;
    firstGenuineOutsideAt = null;
  } else if (membership === "outside") {
    if (firstGenuineOutsideAt === null) firstGenuineOutsideAt = sample.recordedAt;
  } else {
    // Codex audit HIGH (round 8, 2026-09-04): `"ambiguous"` never
    // advances `lastConfirmedInFieldAt` (it isn't evidence the farmer is
    // still inside), but it must equally never let a *stale* departure
    // window survive it — otherwise two sparse `"outside"` fixes
    // bridged by an arbitrarily long ambiguous gap could still satisfy
    // the duration/count thresholds on elapsed clock time alone, with
    // most of that elapsed window carrying no departure evidence at
    // all. Breaking continuity here means genuinely sustained departure
    // has to be shown by an unbroken run of `"outside"` evidence.
    firstGenuineOutsideAt = null;
  }

  if (lastConfirmedInFieldAt === null) {
    // Never yet confirmed in-field this session — nothing to measure
    // departure *from* yet; keep tracking.
    return { status: "tracking", observations, lastConfirmedInFieldAt, firstGenuineOutsideAt };
  }

  // Codex audit HIGH (round 6, 2026-09-04): the duration/count check
  // below must never fire on a sample that isn't itself genuinely
  // `"outside"` right now — otherwise real, sustained clock time
  // passing entirely through `"ambiguous"` fixes (which touch neither
  // `firstGenuineOutsideAt` nor the outside-sample count) could still
  // cross the duration threshold on stale evidence from long before,
  // exactly the "several ambiguous fixes after 3 real outside fixes"
  // gap this fix closes.
  if (membership !== "outside" || firstGenuineOutsideAt === null) {
    return { status: "tracking", observations, lastConfirmedInFieldAt, firstGenuineOutsideAt };
  }

  const secondsSinceFirstOutside = (new Date(sample.recordedAt).getTime() - new Date(firstGenuineOutsideAt).getTime()) / 1000;
  // Only genuinely `"outside"`-classified samples since that first real
  // departure evidence count toward the sample threshold — an ambiguous
  // sample in between contributes nothing either way, the same "unknown
  // must never become a confident claim" discipline this app already
  // applies to missing facts, applied here to geometry.
  const outsideSamplesSinceConfirmed = activeField
    ? observations.filter((o) => new Date(o.sample.recordedAt).getTime() >= new Date(firstGenuineOutsideAt).getTime() && classifyFieldMembership(o.sample, activeField) === "outside").length
    : 0;

  if (secondsSinceFirstOutside >= config.minSecondsOutsideFieldForCandidateFinish && outsideSamplesSinceConfirmed >= config.minSamplesForCandidateFinish) {
    return { status: "candidate_finish", observations, lastConfirmedInFieldAt, firstGenuineOutsideAt };
  }

  return { status: "tracking", observations, lastConfirmedInFieldAt, firstGenuineOutsideAt };
}
