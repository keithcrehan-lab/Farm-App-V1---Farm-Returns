/**
 * Farm Return Core Engine, Phase 11B — Audited Rainfall Window Score v1.
 *
 * Answers ONE narrow question: "How favourable is the rainfall window
 * around this exact proposed slurry-spreading evaluation time?" It does
 * NOT claim the field is not waterlogged, that it is trafficable, that
 * spreading is legally permissible, or that the action is ACTIONABLE —
 * those remain separate audited propositions (Phase 11A's regulatory
 * gates; a future ground-condition evidence contract; Phase 10).
 *
 * ---------------------------------------------------------------------
 * INSPECTION FINDINGS (brief §1/§9) — verified against real code before
 * writing this module, not assumed.
 * ---------------------------------------------------------------------
 *
 * Historical 72h coverage (STOP A): `weather-service.ts`'s
 * `getWeatherForField` already fetches `DEFAULT_LOOKBACK_HOURS = 168`
 * hours of real hourly observations and computes
 * `rollingRainfall: RollingRainfallWindow[]` via
 * `calculateRollingRainfallTotals` for `ROLLING_RAINFALL_WINDOW_HOURS =
 * [1, 6, 12, 24, 48, 72, 168]` — 72 is already one of the real windows
 * that function returns, with real completeness semantics (`totalMm:
 * null` — never 0 — whenever the window isn't fully covered by hourly
 * observations). No new provider work was needed; this module reuses
 * that existing 72h entry directly. STOP A is NOT triggered.
 *
 * Forecast 48h coverage (STOP B): `forecast-provider.ts`'s real,
 * live-verified Harmonie model run covers "now to ~+54h at 1-hour
 * resolution" (the file's own doc comment, itself based on a live
 * capture) — well past the 48h this module needs, at a fine enough
 * resolution to tile the window exactly. STOP B is NOT triggered.
 *
 * Interval semantics (STOP C / brief §42, mandatory data-contract
 * check): `forecast-parser.ts`'s own doc comment records real,
 * evidence-based interval widths — "1-hour windows out to ~90h" for the
 * primary model. Within a 48h horizon every point's rainfall window is
 * therefore expected to be a contiguous, non-overlapping 1-hour
 * interval — but this module does NOT assume that from the doc comment
 * alone. `aggregateForecastRainfall` below explicitly verifies, from the
 * real returned windows, that they tile the exact `[T, T+48h)` range
 * with no gap and no overlap before trusting the sum — if they don't
 * (a genuinely coarser/overlapping window ever appears, or the horizon
 * is short), the forecast component fails closed to UNKNOWN rather than
 * silently summing an ambiguous or partial total.
 *
 * Field-centroid binding (STOP D): reuses the exact hardened mechanism
 * Phase 11A's targeted re-review introduced — `WeatherForFieldResult`/
 * `ForecastResult.queriedCentroid`, compared against this assessment's
 * own declared `fieldCentroid`, never a second independently-trusted
 * location field.
 *
 * ---------------------------------------------------------------------
 * NAMING (brief §25) — this is the "Rainfall Window Score", never
 * "Spreading Score" / "Suitability Score" / "Trafficability Score" /
 * "Agronomic Score" anywhere in this module's exports, types or
 * messages. v1 measures rainfall only.
 * ---------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------
 * MODEL-POLICY PROVENANCE (brief §5/§8/§14-17) — the raw rainfall
 * totals are real Met Éireann evidence. The anchor curves below and the
 * 40/60 historical/forecast weighting are Farm Return's own calibration
 * choices (`RAINFALL_WINDOW_SCORE_VERSION`), never presented as a Met
 * Éireann or Teagasc rule. See `RAINFALL_MODEL_POLICY_LIMITATION`.
 * ---------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------
 * BLOCKED-OPPORTUNITY COMPOSITION CHOICE (brief §22/§23) — this module
 * takes only real weather-provider results as input, never a Phase 11A
 * assessment. This is a deliberate choice, not an oversight: it keeps
 * the score independently computable as diagnostic weather evidence
 * regardless of Phase 11A's regulatory state (brief §23's option A),
 * without coupling this module to Phase 11A's internal type. The
 * invariant "a high score can never override a BLOCKED regulatory
 * result" is therefore enforced by NOT wiring this module's output into
 * anything that could override Phase 11A today — no code path here (or
 * anywhere in the repository, confirmed by grep) reads this module's
 * `score` and produces a Phase 11A `aggregateState` or a Phase 10
 * `ACTIONABLE`. See brief §27/§28: Phase 10 is deliberately left
 * unchanged by this phase.
 * ---------------------------------------------------------------------
 *
 * STOP-CONDITION REVIEW — resolved, not triggered:
 * STOP A/B — NOT triggered, real provider capability confirmed above.
 * STOP C — NOT triggered, explicit tiling verification (not assumption)
 *   in `aggregateForecastRainfall`.
 * STOP D — NOT triggered, reuses Phase 11A's hardened `queriedCentroid`
 *   binding, plus a new `evaluatedAt`-vs-`windowEnd` time-binding check
 *   (the rolling-rainfall window's own `asOf` must equal this
 *   assessment's `evaluatedAt`, or the caller fetched weather for the
 *   wrong evaluation time) — rejected as UNKNOWN otherwise, never
 *   trusted silently.
 * STOP E — NOT triggered. Missing/incomplete coverage in either window
 *   resolves that component (and therefore the final score) to
 *   UNKNOWN, never a renormalised partial score
 *   (`computeRainfallWindowScoreValue`'s early-return branches).
 * STOP F — NOT triggered. All arithmetic uses `decimal.js` (this
 *   codebase's own established exact-decimal convention — see
 *   `money.ts`'s header), never native `Number` multiplication/division
 *   for score output.
 * STOP G — NOT triggered by this module's own hard gates (it composes
 *   none — it is pure evidence/scoring, not a regulatory gate); it does
 *   not read or alter Phase 11A's gates at all.
 * STOP H — NOT triggered; Phase 10/9 are not imported or modified here.
 * STOP I — NOT triggered. No code path here converts `score` into
 *   `ACTIONABLE` — confirmed by grep (no `Phase10`/`ActionabilityMap`/
 *   `Verified` import anywhere in this file).
 */

import Decimal from "decimal.js";
import { ok, blockedInsufficientEvidence, type EngineOutcome } from "./evidence";
import type { WeatherForFieldResult } from "@/server/weather/weather-service";
import type { ForecastResult, ForecastPoint } from "@/server/weather/forecast-provider";

export const RAINFALL_WINDOW_SCORE_VERSION = "rainfall_window_score_ie_v1.0.0";

export const HISTORICAL_WINDOW_HOURS = 72;
export const FORECAST_WINDOW_HOURS = 48;

// ---------------------------------------------------------------------------
// Model-policy calibration (brief §14/§15/§17) — Farm Return's own
// versioned choice, not a statutory or scientific threshold table. Values
// given verbatim by the brief.
// ---------------------------------------------------------------------------

/** [rainfall mm, subscore] anchor pairs. 0-2mm -> 100; >=40mm -> 0;
 * piecewise-linear interpolation between the anchors in between. */
const HISTORICAL_ANCHORS_MM_SUBSCORE: ReadonlyArray<readonly [string, string]> = [
  ["0", "100"],
  ["2", "100"],
  ["5", "90"],
  ["10", "75"],
  ["20", "50"],
  ["30", "25"],
  ["40", "0"],
];

const FORECAST_ANCHORS_MM_SUBSCORE: ReadonlyArray<readonly [string, string]> = [
  ["0", "100"],
  ["1", "100"],
  ["3", "95"],
  ["5", "85"],
  ["10", "65"],
  ["20", "35"],
  ["30", "10"],
  ["40", "0"],
];

/** Farm Return model policy: forecast conditions receive greater weight
 * than retrospective rainfall context, since the model evaluates an
 * UPCOMING spreading window. Not scientifically proven — a versioned
 * product calibration choice. */
const HISTORICAL_WEIGHT = new Decimal("0.40");
const FORECAST_WEIGHT = new Decimal("0.60");

/**
 * Piecewise-linear interpolation over the given anchor table. Throws on
 * negative/non-finite input (brief #15/#16 — negative/NaN/Infinity
 * rainfall must be rejected, never clamped to zero) rather than
 * producing a fabricated subscore. Monotonic and bounded to [0,100] by
 * construction: every anchor table's y-values are non-increasing as x
 * increases, and any x >= 40 resolves to the final anchor (0) directly.
 */
function interpolateSubscore(rainfallMm: Decimal, anchors: ReadonlyArray<readonly [string, string]>): Decimal {
  if (!rainfallMm.isFinite()) {
    throw new Error(`Rainfall Window Score: rainfall total "${rainfallMm.toString()}" is not finite (NaN/Infinity rejected, never scored).`);
  }
  if (rainfallMm.isNegative()) {
    throw new Error(`Rainfall Window Score: rainfall total "${rainfallMm.toString()}" is negative — impossible precipitation, rejected rather than clamped to zero.`);
  }
  const lastAnchorMm = new Decimal(anchors[anchors.length - 1][0]);
  if (rainfallMm.gte(lastAnchorMm)) {
    return new Decimal(anchors[anchors.length - 1][1]);
  }
  for (let i = 0; i < anchors.length - 1; i++) {
    const x0 = new Decimal(anchors[i][0]);
    const y0 = new Decimal(anchors[i][1]);
    const x1 = new Decimal(anchors[i + 1][0]);
    const y1 = new Decimal(anchors[i + 1][1]);
    if (rainfallMm.gte(x0) && rainfallMm.lte(x1)) {
      if (x1.eq(x0)) return y0;
      const t = rainfallMm.minus(x0).dividedBy(x1.minus(x0));
      return y0.plus(t.times(y1.minus(y0)));
    }
  }
  // Unreachable given anchors[0] = 0 and the >= lastAnchorMm branch above,
  // but fail loudly rather than silently if a future anchor table ever
  // violates that invariant.
  throw new Error(`Rainfall Window Score: rainfall total "${rainfallMm.toString()}" fell outside every anchor bracket.`);
}

export function historicalSubscoreFor(rainfallMm: Decimal): Decimal {
  return interpolateSubscore(rainfallMm, HISTORICAL_ANCHORS_MM_SUBSCORE);
}

export function forecastSubscoreFor(rainfallMm: Decimal): Decimal {
  return interpolateSubscore(rainfallMm, FORECAST_ANCHORS_MM_SUBSCORE);
}

// ---------------------------------------------------------------------------
// Evidence aggregation — historical (reuses weather-service.ts's own
// existing 72h RollingRainfallWindow) and forecast (aggregates real
// ForecastPoint windows with an explicit tiling check).
// ---------------------------------------------------------------------------

export type RainfallEvidenceAvailability = "AVAILABLE" | "UNKNOWN";

export interface HistoricalRainfallEvidence {
  availability: RainfallEvidenceAvailability;
  totalMm: string | null;
  windowStart: string;
  windowEnd: string;
  observationCount: number | null;
  expectedObservationCount: number | null;
  source: string | null;
  fieldCentroid: [number, number];
  reason?: string;
}

export interface ForecastRainfallEvidence {
  availability: RainfallEvidenceAvailability;
  totalMm: string | null;
  windowStart: string;
  windowEnd: string;
  pointCount: number | null;
  source: string | null;
  fieldCentroid: [number, number];
  reason?: string;
}

const FIELD_CENTROID_BINDING_MISMATCH_REASON =
  "This weather evidence was queried for a different field centroid than the one this assessment declares — rejected rather than trusted on the caller's say-so.";

function centroidsMatch(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Derives the historical 72h evidence from a real `WeatherForFieldResult`
 * (already fetched by the caller with `lookbackHours >= 72`, `now` set to
 * this assessment's own `evaluatedAt`). Reuses `rollingRainfall`'s
 * existing 72h entry directly — never recomputes a rainfall total from
 * raw observations itself, so completeness/coverage semantics stay owned
 * by `weather-observations.ts`'s one real implementation.
 */
export function historicalRainfallEvidence(
  result: WeatherForFieldResult,
  expectedCentroid: [number, number],
  evaluatedAt: string,
): HistoricalRainfallEvidence {
  const windowEnd = evaluatedAt;
  const windowStart = new Date(new Date(evaluatedAt).getTime() - HISTORICAL_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  if (!centroidsMatch(result.queriedCentroid, expectedCentroid)) {
    return {
      availability: "UNKNOWN",
      totalMm: null,
      windowStart,
      windowEnd,
      observationCount: null,
      expectedObservationCount: null,
      source: null,
      fieldCentroid: result.queriedCentroid,
      reason: FIELD_CENTROID_BINDING_MISMATCH_REASON,
    };
  }

  if (result.status !== "LIVE") {
    // Brief §48: "Reuse existing provider freshness semantics. If
    // observation or forecast is stale: score UNKNOWN." — deliberately
    // stricter here than Phase 11A's own STALE-tolerant-with-limitation
    // convention (appropriate there for a regulatory PASS; not
    // appropriate here, where a stale rainfall reading could misstate
    // genuinely recent conditions this score exists to capture).
    return {
      availability: "UNKNOWN",
      totalMm: null,
      windowStart,
      windowEnd,
      observationCount: null,
      expectedObservationCount: null,
      source: null,
      fieldCentroid: result.queriedCentroid,
      reason: result.status === "STALE" ? "Observation is classified STALE by the underlying weather service — Rainfall Window Score requires LIVE data." : (result.reason ?? `status=${result.status}`),
    };
  }

  const window72 = result.rollingRainfall.find((w) => w.windowHours === HISTORICAL_WINDOW_HOURS);
  if (!window72) {
    return {
      availability: "UNKNOWN",
      totalMm: null,
      windowStart,
      windowEnd,
      observationCount: null,
      expectedObservationCount: null,
      source: null,
      fieldCentroid: result.queriedCentroid,
      reason: "The supplied WeatherForFieldResult has no 72-hour rolling rainfall window — was it fetched with a lookbackHours < 72?",
    };
  }

  // Time binding: the rolling-rainfall window's own asOf (windowEnd) must
  // equal this assessment's evaluatedAt — otherwise the caller fetched
  // weather anchored to a different evaluation time than the one this
  // score assessment declares, and trusting it would silently answer a
  // different question than the one asked.
  if (new Date(window72.windowEnd).getTime() !== new Date(evaluatedAt).getTime()) {
    return {
      availability: "UNKNOWN",
      totalMm: null,
      windowStart,
      windowEnd,
      observationCount: window72.observationCount,
      expectedObservationCount: window72.expectedObservationCount,
      source: window72.source,
      fieldCentroid: result.queriedCentroid,
      reason: `The supplied weather's 72h window ends at ${window72.windowEnd}, not this assessment's evaluatedAt (${evaluatedAt}) — fetch weather with now=evaluatedAt.`,
    };
  }

  if (!window72.complete || window72.totalMm === null) {
    return {
      availability: "UNKNOWN",
      totalMm: null,
      windowStart: window72.windowStart,
      windowEnd: window72.windowEnd,
      observationCount: window72.observationCount,
      expectedObservationCount: window72.expectedObservationCount,
      source: window72.source,
      fieldCentroid: result.queriedCentroid,
      reason: `72h historical rainfall coverage incomplete: ${window72.observationCount}/${window72.expectedObservationCount} expected observations.`,
    };
  }

  return {
    availability: "AVAILABLE",
    totalMm: new Decimal(window72.totalMm).toString(),
    windowStart: window72.windowStart,
    windowEnd: window72.windowEnd,
    observationCount: window72.observationCount,
    expectedObservationCount: window72.expectedObservationCount,
    source: window72.source,
    fieldCentroid: result.queriedCentroid,
  };
}

interface ForecastPointWindow {
  start: number;
  end: number;
  mm: Decimal;
}

/**
 * Aggregates forecast rainfall over `[T, T+48h)` from real `ForecastPoint`
 * windows, with an EXPLICIT tiling check (brief §42's mandatory
 * data-contract requirement) — never assumed from the parser's own doc
 * comment. Only points whose own [rainfallWindowStartIso, validAt]
 * window falls entirely within [T, T+48h) are considered; the surviving
 * windows are then sorted and checked to have no gap and no overlap and
 * to together span exactly [T, T+48h). Any violation (missing coverage,
 * an overlapping/duplicated window, a genuine gap) fails the whole
 * component closed to UNKNOWN rather than summing a partial or
 * ambiguous total.
 */
function aggregateForecastRainfall(points: ForecastPoint[], windowStartMs: number, windowEndMs: number): { totalMm: Decimal; pointCount: number } | { reason: string; pointCount: number } {
  const candidates: ForecastPointWindow[] = [];
  for (const p of points) {
    if (p.rainfallMm === null || p.rainfallWindowStartIso === null) continue;
    const start = new Date(p.rainfallWindowStartIso).getTime();
    const end = new Date(p.validAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (start < windowStartMs || end > windowEndMs) continue; // only fully-contained windows
    if (p.rainfallMm < 0 || !Number.isFinite(p.rainfallMm)) {
      return { reason: `Forecast point at ${p.validAt} reports invalid rainfall (${p.rainfallMm}) — rejected rather than summed.`, pointCount: candidates.length };
    }
    candidates.push({ start, end, mm: new Decimal(p.rainfallMm) });
  }

  if (candidates.length === 0) {
    return { reason: "No forecast points with a fully-contained rainfall window were found inside [T, T+48h).", pointCount: 0 };
  }

  candidates.sort((a, b) => a.start - b.start);

  if (candidates[0].start !== windowStartMs) {
    return { reason: `Forecast coverage does not begin at the window start — earliest covered window starts at ${new Date(candidates[0].start).toISOString()}, expected ${new Date(windowStartMs).toISOString()}.`, pointCount: candidates.length };
  }
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].start !== candidates[i - 1].end) {
      return {
        reason: `Forecast rainfall windows are not contiguous between ${new Date(candidates[i - 1].end).toISOString()} and ${new Date(candidates[i].start).toISOString()} — a gap or overlap would make cumulative rainfall ambiguous, so no total is reported.`,
        pointCount: candidates.length,
      };
    }
  }
  const last = candidates[candidates.length - 1];
  if (last.end !== windowEndMs) {
    return { reason: `Forecast coverage does not reach the window end — latest covered window ends at ${new Date(last.end).toISOString()}, expected ${new Date(windowEndMs).toISOString()}.`, pointCount: candidates.length };
  }

  const totalMm = candidates.reduce((sum, c) => sum.plus(c.mm), new Decimal(0));
  return { totalMm, pointCount: candidates.length };
}

export function forecastRainfallEvidence(result: ForecastResult, expectedCentroid: [number, number], evaluatedAt: string): ForecastRainfallEvidence {
  const windowStart = evaluatedAt;
  const windowEndMs = new Date(evaluatedAt).getTime() + FORECAST_WINDOW_HOURS * 60 * 60 * 1000;
  const windowEnd = new Date(windowEndMs).toISOString();

  if (!centroidsMatch(result.queriedCentroid, expectedCentroid)) {
    return {
      availability: "UNKNOWN",
      totalMm: null,
      windowStart,
      windowEnd,
      pointCount: null,
      source: null,
      fieldCentroid: result.queriedCentroid,
      reason: FIELD_CENTROID_BINDING_MISMATCH_REASON,
    };
  }

  if (result.status !== "LIVE") {
    // Brief §48 — same STALE-must-become-UNKNOWN discipline as the
    // historical side; see that function's comment for why this is
    // deliberately stricter than Phase 11A's own convention.
    return {
      availability: "UNKNOWN",
      totalMm: null,
      windowStart,
      windowEnd,
      pointCount: null,
      source: null,
      fieldCentroid: result.queriedCentroid,
      reason: result.status === "STALE" ? "Forecast model run is classified STALE — Rainfall Window Score requires LIVE data." : (result.reason ?? `status=${result.status}`),
    };
  }

  const aggregation = aggregateForecastRainfall(result.points, new Date(evaluatedAt).getTime(), windowEndMs);
  if ("reason" in aggregation) {
    return {
      availability: "UNKNOWN",
      totalMm: null,
      windowStart,
      windowEnd,
      pointCount: aggregation.pointCount,
      source: "Met Éireann locationforecast (Harmonie/EC)",
      fieldCentroid: result.queriedCentroid,
      reason: aggregation.reason,
    };
  }

  return {
    availability: "AVAILABLE",
    totalMm: aggregation.totalMm.toString(),
    windowStart,
    windowEnd,
    pointCount: aggregation.pointCount,
    source: "Met Éireann locationforecast (Harmonie/EC)",
    fieldCentroid: result.queriedCentroid,
  };
}

// ---------------------------------------------------------------------------
// Score assembly
// ---------------------------------------------------------------------------

export interface RainfallWindowScoreValue {
  modelVersion: string;
  finalScore: string;
  historicalTotalMm: string;
  historicalSubscore: string;
  historicalWeight: string;
  historicalContribution: string;
  forecastTotalMm: string;
  forecastSubscore: string;
  forecastWeight: string;
  forecastContribution: string;
}

export const RAINFALL_WINDOW_SCORE_INCOMPLETE_EVIDENCE = "RAINFALL_WINDOW_SCORE_INCOMPLETE_EVIDENCE";

/**
 * Brief §18: if either mandatory component (historical or forecast) is
 * UNKNOWN, the final score is UNKNOWN too — never a misleading complete
 * 0-100 computed from only the available half (no
 * `100% × availableComponent` renormalisation).
 */
function computeRainfallWindowScoreValue(historical: HistoricalRainfallEvidence, forecast: ForecastRainfallEvidence): EngineOutcome<RainfallWindowScoreValue> {
  const missing: string[] = [];
  if (historical.availability !== "AVAILABLE") missing.push(`historical: ${historical.reason ?? "unavailable"}`);
  if (forecast.availability !== "AVAILABLE") missing.push(`forecast: ${forecast.reason ?? "unavailable"}`);
  if (missing.length > 0) {
    return blockedInsufficientEvidence(RAINFALL_WINDOW_SCORE_INCOMPLETE_EVIDENCE, missing);
  }

  const historicalMm = new Decimal(historical.totalMm as string);
  const forecastMm = new Decimal(forecast.totalMm as string);
  const historicalSubscore = historicalSubscoreFor(historicalMm);
  const forecastSubscore = forecastSubscoreFor(forecastMm);
  const historicalContribution = historicalSubscore.times(HISTORICAL_WEIGHT);
  const forecastContribution = forecastSubscore.times(FORECAST_WEIGHT);
  const finalScore = historicalContribution.plus(forecastContribution);

  return ok(
    {
      modelVersion: RAINFALL_WINDOW_SCORE_VERSION,
      finalScore: finalScore.toString(),
      historicalTotalMm: historicalMm.toString(),
      historicalSubscore: historicalSubscore.toString(),
      historicalWeight: HISTORICAL_WEIGHT.toString(),
      historicalContribution: historicalContribution.toString(),
      forecastTotalMm: forecastMm.toString(),
      forecastSubscore: forecastSubscore.toString(),
      forecastWeight: FORECAST_WEIGHT.toString(),
      forecastContribution: forecastContribution.toString(),
    },
    "DERIVED",
  );
}

const NOT_COMPLETE_SUITABILITY_LIMITATION =
  "Rainfall Window Score v1 measures only rainfall pressure around the proposed spreading time. It is not a complete spreading suitability score and does not account for soil moisture deficit, soil temperature, wind, ground trafficability or legal/regulatory status.";
const NOT_TRAFFICABILITY_LIMITATION =
  "A favourable Rainfall Window Score cannot establish field trafficability or the absence of waterlogging or flooding. Those require separate, currently-unavailable evidence.";
const MODEL_POLICY_LIMITATION =
  "The subscore anchor curves and the 40/60 historical/forecast weighting are Farm Return model-policy calibration choices (RAINFALL_WINDOW_SCORE_IE_V1), not statutory or scientific constants.";
const NO_ACTIONABLE_INFERENCE_LIMITATION =
  "A Rainfall Window Score, however favourable, does not by itself make an opportunity ACTIONABLE. It is not currently wired into Phase 10's actionability contract.";

const DEFAULT_LIMITATIONS = [NOT_COMPLETE_SUITABILITY_LIMITATION, NOT_TRAFFICABILITY_LIMITATION, MODEL_POLICY_LIMITATION, NO_ACTIONABLE_INFERENCE_LIMITATION];

export interface RainfallWindowScoreAssessment {
  id: string;
  modelVersion: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  fieldCentroid: [number, number];
  evaluatedAt: string;
  historicalWindow: { start: string; end: string };
  forecastWindow: { start: string; end: string };
  historicalEvidence: HistoricalRainfallEvidence;
  forecastEvidence: ForecastRainfallEvidence;
  score: EngineOutcome<RainfallWindowScoreValue>;
  limitations: string[];
}

export interface BuildRainfallWindowScoreInput {
  id: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  fieldCentroid: [number, number];
  /** T — the proposed spreading evaluation time. Historical window is
   * [T-72h, T), forecast window is [T, T+48h). Caller-supplied; never a
   * hidden clock. */
  evaluatedAt: string;
  /** Must have been fetched with `now: new Date(evaluatedAt)` and
   * `lookbackHours >= 72` — see `historicalRainfallEvidence`'s
   * time-binding check, which rejects a mismatch rather than trusting
   * it silently. */
  rainfallObservation: WeatherForFieldResult;
  rainfallForecast: ForecastResult;
}

/**
 * Builds one immutable Rainfall Window Score assessment. Returns a fresh
 * object/array on every call (matching Phase 11A's own established
 * mutation-safety discipline) — no shared module-level evidence
 * singletons.
 */
export function buildRainfallWindowScore(input: BuildRainfallWindowScoreInput): RainfallWindowScoreAssessment {
  const historicalEvidence = historicalRainfallEvidence(input.rainfallObservation, input.fieldCentroid, input.evaluatedAt);
  const forecastEvidence = forecastRainfallEvidence(input.rainfallForecast, input.fieldCentroid, input.evaluatedAt);
  const score = computeRainfallWindowScoreValue(historicalEvidence, forecastEvidence);

  return {
    id: input.id,
    modelVersion: RAINFALL_WINDOW_SCORE_VERSION,
    opportunityRecordId: input.opportunityRecordId,
    boundAssessmentId: input.boundAssessmentId,
    evaluatedActionId: input.evaluatedActionId,
    fieldId: input.fieldId,
    fieldCentroid: input.fieldCentroid,
    evaluatedAt: input.evaluatedAt,
    historicalWindow: { start: historicalEvidence.windowStart, end: historicalEvidence.windowEnd },
    forecastWindow: { start: forecastEvidence.windowStart, end: forecastEvidence.windowEnd },
    historicalEvidence,
    forecastEvidence,
    score,
    limitations: [...DEFAULT_LIMITATIONS],
  };
}
