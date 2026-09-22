/**
 * Farm Return Core Engine, Phase 11A — Audited Spreading Actionability
 * Foundation.
 *
 * Purpose (brief's own framing): "What do we currently know, from real
 * production evidence, about whether this exact slurry action is legally
 * and operationally eligible for further spreading-suitability evaluation?"
 * This is a COMPOSITION layer over real, already-existing regulatory gates
 * and real, already-existing weather providers — it invents no regulatory
 * rule, no scientific coefficient, no weight, and no 0-100 score. That
 * belongs to a future Phase 11B, which will consume this module's output.
 *
 * ---------------------------------------------------------------------
 * PREVIOUS-INVESTIGATION VERIFICATION (brief §4) — every claim independently
 * re-checked against the real code, not trusted from the prior report.
 * ---------------------------------------------------------------------
 *
 * 1. "src/domain/spreading.ts exists (~256 lines), deliberately avoids
 *    invented composite-score weights, forbids validation data as live
 *    field data" — CONFIRMED. Read in full: 257 lines. Its own header
 *    states inventing composite weights "would break CLAUDE.md's 'never
 *    invent a production scientific/regulatory number' rule," and its
 *    `DUNSANY_VALIDATION_SERIES` doc comment states it "must never be
 *    wired into a screen as if it were live conditions for this farm's
 *    own fields."
 * 2. "Real production rainfall observation via weather-service.ts, real
 *    production rainfall forecast via forecast-provider.ts, both
 *    field-bound and fail-closed" — CONFIRMED. `getWeatherForField(entity:
 *    {centroid})` takes an explicit `now` option (never a hidden clock),
 *    resolves the nearest queryable Met Éireann station, and on any
 *    failure (no station, no queryable station, fetch failure, empty
 *    parse) returns a real `WeatherForFieldResult` with `status:
 *    "UNAVAILABLE"|"UNVERIFIED"` and a real `reason` — never throws, never
 *    fabricates. `meteireannLocationForecastProvider.getForecastForField`
 *    is the same shape: real model-run freshness classification against
 *    Met Éireann's own stated `nextRun` schedule, real `UNAVAILABLE` on
 *    any failure, never a guessed "LIVE".
 * 3. "No real per-field production SMD or soil-temperature source exists;
 *    only a validation dataset explicitly marked unsuitable for
 *    production" — CONFIRMED. Repo-wide search found no SMD/soil-
 *    temperature provider analogous to `weather-service.ts`/
 *    `forecast-provider.ts`. `spreading.ts`'s `DUNSANY_VALIDATION_SERIES`
 *    is the only SMD/soil-temperature data in the codebase, and it is
 *    explicitly quarantined by its own doc comment (see above).
 * 4. "Real regulatory gate modules exist: closed-period-calendar.ts,
 *    spreading-legal-gate.ts, spreading-window-gate.ts, buffer-gate.ts,
 *    commonage-gate.ts" — CONFIRMED, all five read in full.
 *
 * ---------------------------------------------------------------------
 * LIVE REGULATORY VERIFICATION (brief §2) — independently checked against
 * real, current sources, not trusted from source-register.ts's own
 * metadata or from memory.
 * ---------------------------------------------------------------------
 *
 * `closed-period-calendar.ts`'s `CLOSED_PERIOD_BY_ZONE_MATERIAL` table was
 * checked against real, independent 2026-dated reporting (Agriland.ie,
 * a mainstream Irish farming-press outlet reporting on the actual 2026
 * reopening dates under S.I. 588/2025 as amended by S.I. 119/2026) — the
 * Irish Statute Book itself returned HTTP 403 to automated fetching in
 * this session, so this cross-source verification was used instead of
 * simply trusting the codebase's own table:
 *   - Zone A organic (slurry+FYM) reopens 13 Jan  -> table: closedThrough
 *     "01-12" (closed through 12th, reopens 13th). MATCH.
 *   - Zone B organic reopens 16 Jan -> table: closedThrough "01-15".
 *     MATCH.
 *   - Zone C organic reopens 1 Feb -> table: closedThrough "01-31".
 *     MATCH.
 *   - Zone C chemical fertiliser closed period ends 14 Feb -> table:
 *     closedThroughMmDd "02-14". MATCH.
 *   - Chemical fertiliser closes 15 Sept nationally, slurry 1 Oct, FYM
 *     1 Nov -> table: closedFromMmDd "09-15"/"10-01"/"11-01"
 *     respectively, uniform across zones. MATCH.
 * Every independently-checked value matches exactly. STOP A (regulatory
 * conflict) is NOT triggered.
 *
 * `closed-period-calendar.ts` and `spreading-window-gate.ts` also each
 * carry their own extensive, already-documented history of a genuine,
 * known, deliberately-deferred limitation: the calendar table has no
 * evidenced "year of applicability" and matches the mm-dd pattern against
 * any year indefinitely (`docs/farm-return-next/BLOCKERS.md`, four real
 * Codex audit rounds, ending in a deliberate revert rather than an
 * invented year-bound). This is a real, pre-existing, already-documented
 * gap this phase inherits by composing the frozen gate, not one Phase 11A
 * introduces or is authorised to fix — noted here for completeness, not
 * treated as a fresh STOP.
 *
 * ---------------------------------------------------------------------
 * A DELIBERATE COMPOSITION CHOICE, NOT A STOP CONDITION
 * ---------------------------------------------------------------------
 *
 * `spreading-legal-gate.ts`'s `checkSpreadingLegalGate` accepts a
 * `SpreadingGroundConditions` parameter (waterlogged/flooded/frozen/
 * heavyRainForecast48h/steepSlope) that COULD look like the natural place
 * to plug real weather evidence in. This phase deliberately does NOT do
 * that. `spreading-window-gate.ts`'s own header records, in full, four
 * real Codex audit rounds that tried exactly this composition and
 * reverted it every time — settling, finally, on the finding that
 * `SpreadingGroundConditions` has no timestamp/source field of its own,
 * so a real weather boolean passed into it would produce a
 * `LEGAL_PROHIBITION` (or a `PERMITTED`) with no provenance a future
 * reviewer could check, and every real production call site in this app
 * already avoids this path entirely, calling `checkClosedPeriodCalendar`/
 * `checkSpreadingWindowGate` directly instead. Repeating that composition
 * here would reintroduce a defect this codebase already found and fixed.
 * Phase 11A instead: (a) uses the safe, calendar-only
 * `checkSpreadingWindowGate` for the regulatory hard gate, and (b) exposes
 * real rainfall observation/forecast as their OWN separately-provenanced
 * evidence items in this module's output — available for a future
 * Phase 11B (or a future, properly-provenanced ground-conditions type) to
 * interpret, never silently smuggled into the legal gate's ground-
 * condition booleans without the timestamp/source field that gate
 * structurally lacks.
 *
 * ---------------------------------------------------------------------
 * STOP-CONDITION REVIEW (brief's ten named conditions) — resolved, not
 * triggered.
 * ---------------------------------------------------------------------
 *
 * STOP A (regulatory conflict) — NOT triggered; see live verification
 * above.
 * STOP B (gates cannot be safely composed) — NOT triggered; resolved by
 * the deliberate composition choice above (calendar gate only, weather
 * evidence exposed separately, never fed into the ground-conditions
 * parameter this codebase already found structurally unsafe for that).
 * STOP C (rainfall cannot be bound to field) — NOT triggered.
 * `getWeatherForField`/`getForecastForField` both take `{centroid}`
 * directly from the real `Field.centroid` — the same coordinate this
 * app's own map/geometry pipeline already derives from the farmer-drawn
 * boundary.
 * STOP D (validation data can reach production) — NOT triggered.
 * `DUNSANY_VALIDATION_SERIES`/`smdForDrainage` are never imported by this
 * module (verify: no import from `./spreading` appears below) — proven by
 * a dedicated test asserting this module's own source contains no such
 * import.
 * STOP E (economic identity cannot bind) — NOT triggered. The foundation
 * assessment requires the caller's real
 * `{opportunityRecordId, boundAssessmentId, evaluatedActionId, fieldId}`
 * exactly as Phase 10 already established for its own binding contract —
 * reused, not duplicated.
 * STOP F (missing evidence collapsed to zero/pass) — NOT triggered. Every
 * condition is an `EngineOutcome`-classified tri-state; SMD/soil
 * temperature are represented as an explicit `UNKNOWN`/
 * `SOURCE_UNAVAILABLE` object, never a numeric 0.
 * STOP G (hidden clock) — NOT triggered. `evaluatedAt` is a required,
 * explicit caller-supplied parameter throughout; grep confirms no
 * `Date.now()`/`new Date()` appears in this file's own logic (the weather
 * providers' own `now` defaulting is their existing, already-reviewed
 * behaviour, not something this module relies on implicitly — this module
 * always passes `evaluatedAt` through explicitly).
 * STOP H (Phase 11B would need unstructured internals) — NOT triggered.
 * The output schema below is the stable contract brief §28 asks for.
 * STOP I (Phase 10 would need weakening) — NOT triggered; Phase 10/9 are
 * not imported or modified by this module at all.
 * STOP J (truthful output requires treating unknown as satisfied) — NOT
 * triggered. `READY_FOR_SCORING` requires every tracked evidence item to
 * be genuinely available; today that is honestly unreachable (SMD/soil
 * temperature are always `UNKNOWN`), and the aggregate correctly reports
 * `UNKNOWN`/`NOT_READY_FOR_SCORING` rather than being forced positive.
 */

import type { Drainage } from "./types";
import { checkSpreadingWindowGate, SPREADING_WINDOW_GATE_VERSION } from "./spreading-window-gate";
import { checkNationalBufferDistance, BUFFER_GATE_VERSION, type NationalBufferInput } from "./buffer-gate";
import { checkCommonageFertiliserGate, COMMONAGE_GATE_VERSION, type FertiliserMaterial } from "./commonage-gate";
import type { SpreadingMaterial } from "./closed-period-calendar";
import type { EngineOutcome } from "./evidence";
import type { WeatherForFieldResult } from "@/server/weather/weather-service";
import type { ForecastResult } from "@/server/weather/forecast-provider";

export const SPREADING_ACTIONABILITY_FOUNDATION_VERSION = "spreading_actionability_foundation_v1.0.0";

/** Brief §4 — the canonical tri-state. `PASS` = evidence positively
 * establishes no blocker; `BLOCKED` = evidence establishes a real
 * blocker; `UNKNOWN` = insufficient evidence to establish either. Never a
 * bare boolean. */
export type FoundationConditionState = "PASS" | "BLOCKED" | "UNKNOWN";

/** Deterministic classification of an existing `EngineOutcome` into the
 * brief's tri-state vocabulary — reused, not a parallel result type.
 * `NOT_APPLICABLE` (e.g. commonage gate on non-commonage land) means the
 * rule does not constrain this case at all, which is a real `PASS` for
 * aggregate purposes, not an unresolved unknown. */
export function classifyFoundationConditionState(outcome: EngineOutcome<unknown>): FoundationConditionState {
  switch (outcome.status) {
    case "OK":
    case "NOT_APPLICABLE":
      return "PASS";
    case "LEGAL_PROHIBITION":
      return "BLOCKED";
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
    case "AMBIGUOUS":
    case "UNKNOWN":
      return "UNKNOWN";
  }
}

export interface FoundationCondition {
  state: FoundationConditionState;
  /** The real, unstripped `EngineOutcome` this condition was classified
   * from — full provenance (reason codes, evidence state, consequence
   * text) is never discarded merely to produce the tri-state summary. */
  outcome: EngineOutcome<unknown>;
  source: string;
  ruleVersion: string;
}

export type EvidenceAvailability = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

export interface WeatherEvidenceItem {
  availability: EvidenceAvailability;
  source: string;
  /** ISO timestamp the underlying observation/forecast was actually
   * retrieved/issued — never this module's own `evaluatedAt`. */
  sourceTimestamp: string | null;
  /** Explicit binding proof — the field centroid this evidence was
   * actually resolved against. */
  fieldCentroid: [number, number];
  reason?: string;
  limitations: string[];
}

export interface UnavailableEvidenceItem {
  availability: "UNKNOWN";
  reasonCode: "SOURCE_UNAVAILABLE";
  detail: string;
}

export type FoundationAggregateState = "BLOCKED" | "UNKNOWN" | "READY_FOR_SCORING";

export interface SpreadingActionabilityFoundationAssessment {
  id: string;
  engineVersion: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  fieldCentroid: [number, number];
  proposedMaterial: SpreadingMaterial;
  proposedVolumeM3?: number;
  evaluatedAt: string;

  spreadingWindowGate: FoundationCondition;
  bufferCompliance: FoundationCondition | { state: "UNKNOWN"; reasonCode: "NO_APPLICATION_GEOMETRY_SUPPLIED" };
  commonageCompliance: FoundationCondition | { state: "UNKNOWN"; reasonCode: "NO_COMMONAGE_STATUS_SUPPLIED" };
  rainfallObservation: WeatherEvidenceItem;
  rainfallForecast: WeatherEvidenceItem;
  smdEvidence: UnavailableEvidenceItem;
  soilTemperatureEvidence: UnavailableEvidenceItem;

  /** `BLOCKED` if any mandatory gate is BLOCKED. `UNKNOWN` if there is no
   * blocker but one or more Phase 11B-relevant evidence items are
   * unresolved. `READY_FOR_SCORING` only if every currently-represented
   * evidence item is genuinely available AND every gate PASSes — this
   * does NOT mean ACTIONABLE; it only means a future scoring engine has
   * the inputs it needs. */
  aggregateState: FoundationAggregateState;
  aggregateReasonCode: string;
  limitations: string[];
}

const NOT_LIVE_FIELD_DATA_LIMITATION =
  "Rainfall observations and forecasts do not, by themselves, prove that a field is not waterlogged, flooded or otherwise unsuitable for spreading. They are one evidence input among several a future scoring engine must combine — never a standalone actionability determination.";
const VALIDATION_DATA_LIMITATION =
  "Validation datasets (e.g. the Dunsany 92-day reference series) must never be presented as live farm evidence. This assessment consumes only real, field-bound production evidence sources.";
const UNKNOWN_DESPITE_FAVOURABLE_LIMITATION =
  "This foundation assessment may correctly report UNKNOWN / NOT_READY_FOR_SCORING even when regulatory and rainfall evidence are both favourable — soil moisture deficit and soil temperature currently have no real per-field production source in this codebase.";

const DEFAULT_LIMITATIONS = [NOT_LIVE_FIELD_DATA_LIMITATION, VALIDATION_DATA_LIMITATION, UNKNOWN_DESPITE_FAVOURABLE_LIMITATION];

function weatherEvidenceFromObservation(result: WeatherForFieldResult, centroid: [number, number]): WeatherEvidenceItem {
  if (result.status === "LIVE" || result.status === "STALE") {
    return {
      availability: "AVAILABLE",
      source: result.station ? `Met Éireann EDR station ${result.station.canonicalName}` : "Met Éireann EDR",
      sourceTimestamp: result.retrievedAt,
      fieldCentroid: centroid,
      limitations: result.status === "STALE" ? ["Observation is classified STALE by the underlying weather service."] : [],
    };
  }
  return {
    availability: "UNKNOWN",
    source: "Met Éireann EDR",
    sourceTimestamp: null,
    fieldCentroid: centroid,
    reason: result.reason ?? `status=${result.status}`,
    limitations: [],
  };
}

function weatherEvidenceFromForecast(result: ForecastResult, centroid: [number, number]): WeatherEvidenceItem {
  if (result.status === "LIVE" || result.status === "STALE") {
    return {
      availability: "AVAILABLE",
      source: "Met Éireann locationforecast (Harmonie/EC)",
      sourceTimestamp: result.modelRunAt,
      fieldCentroid: centroid,
      limitations: result.status === "STALE" ? ["Forecast model run is classified STALE."] : [],
    };
  }
  return {
    availability: "UNKNOWN",
    source: "Met Éireann locationforecast (Harmonie/EC)",
    sourceTimestamp: null,
    fieldCentroid: centroid,
    reason: result.reason ?? `status=${result.status}`,
    limitations: [],
  };
}

/**
 * Adversarial-review finding (HIGH, live-reproduced): these were previously
 * module-level singleton objects (`const SMD_UNAVAILABLE = {...}`) returned
 * by reference on every call to `buildSpreadingActionabilityFoundation`.
 * Because every assessment's `smdEvidence`/`soilTemperatureEvidence` field
 * pointed at the exact same object, mutating ONE assessment's evidence item
 * (e.g. `a1.smdEvidence.detail = "..."`) silently corrupted EVERY other
 * assessment ever built in the same process — including ones already
 * returned to a caller in the past. Confirmed live: `a1.smdEvidence ===
 * a2.smdEvidence` was `true` for two independently-built assessments, and
 * mutating `a1.smdEvidence.detail` changed `a2.smdEvidence.detail` too.
 * Fixed by making these factory functions returning a fresh object per
 * call, matching the immutable-snapshot discipline every earlier phase in
 * this programme already established (Phase 7's `structuredClone`, etc.).
 */
function smdUnavailable(): UnavailableEvidenceItem {
  return {
    availability: "UNKNOWN",
    reasonCode: "SOURCE_UNAVAILABLE",
    detail:
      "No real per-field production Soil Moisture Deficit source exists in this codebase. The only SMD data present (spreading.ts's DUNSANY_VALIDATION_SERIES) is explicitly quarantined validation data and must never be used as live evidence for any real field.",
  };
}

function soilTemperatureUnavailable(): UnavailableEvidenceItem {
  return {
    availability: "UNKNOWN",
    reasonCode: "SOURCE_UNAVAILABLE",
    detail:
      "No real per-field production soil-temperature source exists in this codebase. The only soil-temperature data present (spreading.ts's DUNSANY_VALIDATION_SERIES) is explicitly quarantined validation data and must never be used as live evidence for any real field.",
  };
}

export interface BuildSpreadingActionabilityFoundationInput {
  id: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  fieldCentroid: [number, number];
  county: string;
  /** ISO date (YYYY-MM-DD) — the proposed/evaluated spreading date. */
  date: string;
  proposedMaterial: SpreadingMaterial;
  proposedVolumeM3?: number;
  evaluatedAt: string;
  rainfallObservation: WeatherForFieldResult;
  rainfallForecast: ForecastResult;
  /** Optional real application-geometry evidence — omit if not captured;
   * resolves to UNKNOWN rather than being assumed compliant. */
  bufferInput?: { material: NationalBufferInput["material"]; feature: NationalBufferInput["feature"]; distanceM: number };
  /** Optional real commonage status — omit if not captured; resolves to
   * UNKNOWN rather than being assumed non-commonage. */
  commonageStatus?: EngineOutcome<"commonage" | "not_commonage">;
  /** Only meaningful alongside `commonageStatus`; the closed-period
   * material collapsed onto the commonage gate's own two-way axis. */
  commonageFertiliserMaterial?: FertiliserMaterial;
  /** Present only when the caller can supply it — retained for
   * completeness/documentation of the future Phase 11B input contract;
   * not consumed by this phase's own gates. */
  drainage?: Drainage;
}

function toFoundationCondition(outcome: EngineOutcome<unknown>, source: string, ruleVersion: string): FoundationCondition {
  return { state: classifyFoundationConditionState(outcome), outcome, source, ruleVersion };
}

export function buildSpreadingActionabilityFoundation(
  input: BuildSpreadingActionabilityFoundationInput,
): SpreadingActionabilityFoundationAssessment {
  const closedPeriodMaterial: SpreadingMaterial = input.proposedMaterial;
  const spreadingWindowOutcome = checkSpreadingWindowGate({ county: input.county, date: input.date, material: closedPeriodMaterial });
  const spreadingWindowGate = toFoundationCondition(spreadingWindowOutcome, "closed_periods_2026.csv (GFT057-GFT080)", SPREADING_WINDOW_GATE_VERSION);

  const bufferCompliance: SpreadingActionabilityFoundationAssessment["bufferCompliance"] = input.bufferInput
    ? toFoundationCondition(
        checkNationalBufferDistance({ material: input.bufferInput.material, feature: input.bufferInput.feature, distanceM: input.bufferInput.distanceM }),
        "buffer_distances_2026.csv (GFT083-GFT090)",
        BUFFER_GATE_VERSION,
      )
    : { state: "UNKNOWN", reasonCode: "NO_APPLICATION_GEOMETRY_SUPPLIED" };

  const commonageMaterial: FertiliserMaterial | undefined =
    input.commonageFertiliserMaterial ?? (input.proposedMaterial === "chemical_fertiliser" ? "chemical_fertiliser" : "organic_fertiliser_or_soiled_water");
  const commonageCompliance: SpreadingActionabilityFoundationAssessment["commonageCompliance"] = input.commonageStatus
    ? toFoundationCondition(checkCommonageFertiliserGate(input.commonageStatus, commonageMaterial), "commonage_rules_2026.csv (GFT081-GFT082)", COMMONAGE_GATE_VERSION)
    : { state: "UNKNOWN", reasonCode: "NO_COMMONAGE_STATUS_SUPPLIED" };

  const rainfallObservation = weatherEvidenceFromObservation(input.rainfallObservation, input.fieldCentroid);
  const rainfallForecast = weatherEvidenceFromForecast(input.rainfallForecast, input.fieldCentroid);

  // Computed once, reused both for the aggregate-state check below and in
  // the returned assessment — a fresh object per call either way (see the
  // adversarial-review finding on these two factory functions above), just
  // avoiding a redundant second allocation of the same evidence item.
  const smdEvidence = smdUnavailable();
  const soilTemperatureEvidence = soilTemperatureUnavailable();

  const mandatoryConditions: FoundationConditionState[] = [
    spreadingWindowGate.state,
    bufferCompliance.state,
    commonageCompliance.state,
  ];

  let aggregateState: FoundationAggregateState;
  let aggregateReasonCode: string;

  if (mandatoryConditions.includes("BLOCKED")) {
    aggregateState = "BLOCKED";
    aggregateReasonCode = "SPREADING_ACTIONABILITY_FOUNDATION_BLOCKED";
  } else if (
    mandatoryConditions.includes("UNKNOWN") ||
    rainfallObservation.availability !== "AVAILABLE" ||
    rainfallForecast.availability !== "AVAILABLE" ||
    (smdEvidence.availability as EvidenceAvailability) !== "AVAILABLE" ||
    (soilTemperatureEvidence.availability as EvidenceAvailability) !== "AVAILABLE"
  ) {
    aggregateState = "UNKNOWN";
    aggregateReasonCode = "SPREADING_ACTIONABILITY_FOUNDATION_EVIDENCE_INCOMPLETE";
  } else {
    aggregateState = "READY_FOR_SCORING";
    aggregateReasonCode = "SPREADING_ACTIONABILITY_FOUNDATION_READY_FOR_SCORING";
  }

  return {
    id: input.id,
    engineVersion: SPREADING_ACTIONABILITY_FOUNDATION_VERSION,
    opportunityRecordId: input.opportunityRecordId,
    boundAssessmentId: input.boundAssessmentId,
    evaluatedActionId: input.evaluatedActionId,
    fieldId: input.fieldId,
    fieldCentroid: input.fieldCentroid,
    proposedMaterial: input.proposedMaterial,
    proposedVolumeM3: input.proposedVolumeM3,
    evaluatedAt: input.evaluatedAt,
    spreadingWindowGate,
    bufferCompliance,
    commonageCompliance,
    rainfallObservation,
    rainfallForecast,
    smdEvidence,
    soilTemperatureEvidence,
    aggregateState,
    aggregateReasonCode,
    // Fresh array per call, not the shared module constant — same
    // mutation-safety reasoning as smdUnavailable()/soilTemperatureUnavailable()
    // above: a caller mutating one assessment's limitations array (e.g.
    // Array.prototype.push) must never corrupt another assessment's.
    limitations: [...DEFAULT_LIMITATIONS],
  };
}

// ---------------------------------------------------------------------------
// Score-input readiness contract (brief §28) — for a future Phase 11B to
// consume. No weights, no scores, no classification — availability only.
// ---------------------------------------------------------------------------

export type ScoreInputComponent = "rainfallObservation" | "rainfallForecast" | "smd" | "soilTemperature" | "wind" | "cropDemand";

export interface ScoreInputReadiness {
  component: ScoreInputComponent;
  availability: EvidenceAvailability;
  source: string | null;
  sourceTimestamp: string | null;
  fieldCentroid: [number, number] | null;
}

/**
 * Wind (brief §29) and crop-demand (brief §30) investigation: repo-wide
 * search found no real field-bound wind observation/forecast provider
 * analogous to `weather-service.ts`/`forecast-provider.ts` — `wind` is
 * therefore always reported UNKNOWN here, never inferred or invented.
 * Crop-demand: `nutrients.ts`'s `calculateNutrientPlan` produces a real,
 * authoritative per-field nutrient requirement, but exposing it as a
 * "crop-demand signal for spreading timing" would be a NEW interpretation
 * this phase is not authorised to invent — reported UNKNOWN pending a
 * Phase 11B decision to reference (not duplicate) that existing output.
 */
export function scoreInputReadiness(assessment: SpreadingActionabilityFoundationAssessment): ScoreInputReadiness[] {
  return [
    {
      component: "rainfallObservation",
      availability: assessment.rainfallObservation.availability,
      source: assessment.rainfallObservation.availability === "AVAILABLE" ? assessment.rainfallObservation.source : null,
      sourceTimestamp: assessment.rainfallObservation.sourceTimestamp,
      fieldCentroid: assessment.rainfallObservation.fieldCentroid,
    },
    {
      component: "rainfallForecast",
      availability: assessment.rainfallForecast.availability,
      source: assessment.rainfallForecast.availability === "AVAILABLE" ? assessment.rainfallForecast.source : null,
      sourceTimestamp: assessment.rainfallForecast.sourceTimestamp,
      fieldCentroid: assessment.rainfallForecast.fieldCentroid,
    },
    { component: "smd", availability: "UNKNOWN", source: null, sourceTimestamp: null, fieldCentroid: null },
    { component: "soilTemperature", availability: "UNKNOWN", source: null, sourceTimestamp: null, fieldCentroid: null },
    { component: "wind", availability: "UNKNOWN", source: null, sourceTimestamp: null, fieldCentroid: null },
    { component: "cropDemand", availability: "UNKNOWN", source: null, sourceTimestamp: null, fieldCentroid: null },
  ];
}
