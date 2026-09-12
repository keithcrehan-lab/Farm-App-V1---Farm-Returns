/**
 * Fertiliser Vertical V1 — Checkpoint 1, Soil Sampling Foundation.
 * `docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md` is the
 * frozen object model this module implements the first (V1) link of:
 * `Field -> SamplingPlan -> SamplingZone`.
 *
 * **Verified source** (not this prompt): Teagasc, "Soil Sampling"
 * (`TEAGASC_SOIL_SAMPLING`, `src/domain/source-register.ts`), re-checked
 * live 2026-09-12 directly against
 * https://www.teagasc.ie/environment/soil/soil-fertility/soil-analysis/soil-sampling/
 * plus a corroborating Teagasc tillage/grassland sampling-area search
 * (`docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md`'s own
 * "Verified numeric rules" section quotes both). Every numeric constant
 * below cites that verification; none is invented or copied from this
 * campaign's own prompt text (`CLAUDE.md`'s "never encode public guidance
 * as an unsourced constant" rule).
 *
 * **`SamplingStrategy` is the permanent extension seam** (campaign
 * "Permanent Sampling Strategy Interface"): the rest of Farm Return calls
 * `buildPlan` and consumes a `SamplingPlan` — it must never care which
 * concrete strategy produced it. `StandardRepresentativeSamplingStrategy`
 * is the only V1 implementation. `SpatialAssistedSamplingStrategy` /
 * `SatelliteAssistedSamplingStrategy` / `AdaptiveMLSamplingStrategy` are
 * named here only as the documented future extension points (V2-V4) —
 * none is implemented in this campaign.
 *
 * **Deliberately not built here**: automatic sub-polygon geometry for a
 * multi-zone field. Farm Return has no validated in-field boundary-
 * splitting engine, and fabricating exact zone polygons would be false
 * precision (the same "GPS false precision" class of problem this
 * checkpoint's own `CoreObservation` header warns about, applied to
 * zone geometry instead of a single point). A V1 multi-zone plan
 * expresses zones as logical, proportionate divisions of the field's
 * already-real mapped area (`Field.areaHa`) that a farmer walks and
 * keeps physically separate in the field — never as invented boundary
 * coordinates.
 */
import { ok, blockedInsufficientEvidence, type EngineOutcome } from "./evidence";
import { SOIL_GEOREF_REQUIREMENT_EFFECTIVE_DATE } from "./soil-test-validity";

export const SOIL_SAMPLING_PLAN_VERSION = "soil_sampling_plan_v1.0.0";

// ---------------------------------------------------------------------------
// Verified Teagasc soil-sampling methodology constants.
// ---------------------------------------------------------------------------

/** Teagasc: "Take a minimum of 20 soil cores, mix them together, and take
 * a representative sub-sample." A floor, not a computed target — this
 * module never invents a "more cores for a bigger zone" formula Teagasc's
 * own published guidance does not itself state. */
export const MIN_CORES_PER_COMPOSITE_SAMPLE = 20;

/** Teagasc: "take one sample per 2-4 ha for greater accuracy" — the
 * ideal/target upper bound this module splits zones to stay within. */
export const IDEAL_MAX_ZONE_AREA_HA = 4;

/** Teagasc: "each sample area should not exceed 5 ha" — the hard ceiling
 * (both tillage and grassland) no single zone may exceed, corroborating
 * search of teagasc.ie, 2026-09-12. */
export const HARD_MAX_ZONE_AREA_HA = 5;

/** Teagasc: "taken to a uniform depth (10cm)" / "correct sampling depth of
 * 100 mm (4\")". */
export const SAMPLING_DEPTH_MM = 100;

/** Teagasc: "Do not sample a field until 3 to 6 months after the last
 * application of P and K." Advisory window, not a hard gate — see
 * `assessSamplingTimingReadiness`'s own doc comment for why. */
export const MIN_MONTHS_AFTER_PK_APPLICATION = 3;
export const IDEAL_MONTHS_AFTER_PK_APPLICATION = 6;

/** Teagasc: "[wait] 2 years where lime was applied." */
export const MIN_YEARS_AFTER_LIME_APPLICATION = 2;

/** Teagasc: "Avoid any unusual spots such as old fences, ditches, drinking
 * troughs, dung or urine patches or where fertiliser / manures or lime
 * has been heaped or spilled." Farmer-facing guidance text, not a rule a
 * calculation evaluates — kept as one canonical string so the sampling
 * session UI and the printable evidence report never drift apart. */
export const SAMPLING_EXCLUSION_GUIDANCE =
  "Avoid old fences, ditches, drinking troughs, dung or urine patches, gateways/headlands, and any spot where fertiliser, slurry or lime has been heaped or spilled.";

/** Teagasc: "Take a representative soil sample by walking in a W shaped
 * pattern across the sampling area." */
export const SAMPLING_ROUTE_GUIDANCE =
  "Walk a W-shaped pattern across this zone, taking one core at each point along the route.";

// ---------------------------------------------------------------------------
// SamplingZone / SamplingPlan — the frozen V1 result shape every future
// strategy (V1-V4) must return (SOIL_SAMPLING_ARCHITECTURE.md).
// ---------------------------------------------------------------------------

export interface SamplingZone {
  /** Stable within one plan — "A", "B", "C", ... never renumbered once a
   * session has referenced it (`CoreObservation.samplingZoneId`). */
  zoneId: string;
  label: string;
  /** A logical share of `SamplingPlan.totalAreaHa` — never an invented
   * sub-polygon (see module header). */
  areaHa: number;
  minCores: number;
  reasons: string[];
}

export interface SamplingPlan {
  method: "standard_representative";
  methodVersion: string;
  fieldId: string;
  totalAreaHa: number;
  zones: SamplingZone[];
  sampleDepthMm: number;
  routeGuidance: string;
  exclusionGuidance: string;
  /** Real, disclosed inputs this specific plan was computed from —
   * distinguishes "this farm's field is 6.2 ha" (a real input) from a
   * fabricated default. */
  evidenceInputs: {
    areaHa: number;
    heterogeneitySignalsProvided: boolean;
  };
  reasons: string[];
  createdAt: string;
}

/** Farmer-reported (never inferred/guessed) signals that this field is
 * not agronomically uniform — Teagasc: "separate samples should be taken
 * for areas that are different in soil type, previous cropping history,
 * slope, drainage or persistently poor yields." Every flag defaults to
 * `undefined` ("not asserted"), never `false` — an unknown heterogeneity
 * signal must never be silently treated as a confirmed "no" (it is
 * treated as "no" for the zone-count *decision* only, disclosed as an
 * explicit assumption in `SamplingPlan.reasons`, never hidden). */
export interface FieldHeterogeneitySignals {
  differentSoilType?: boolean;
  differentCroppingHistory?: boolean;
  differentSlopeOrDrainage?: boolean;
  persistentlyPoorYieldArea?: boolean;
}

export interface SamplingStrategyInput {
  fieldId: string;
  /** The field's own real, already-mapped area (`Field.areaHa`) — never
   * computed from GPS or invented. */
  areaHa: number;
  heterogeneity?: FieldHeterogeneitySignals;
  /** Present when the field has one — used only to fold a georeference
   * advisory into `SamplingPlan.reasons`, never to gate plan creation. */
  lpisRef?: string;
  now: string;
}

/**
 * The permanent seam every future sampling strategy (V1 standard, V2
 * spatial/satellite-assisted, V3 learning, V4 validated adaptive)
 * implements identically, so no consumer of a `SamplingPlan` ever needs
 * to know which one produced it (campaign "Permanent Sampling Strategy
 * Interface").
 */
export interface SamplingStrategy {
  strategyId: string;
  version: string;
  buildPlan(input: SamplingStrategyInput): EngineOutcome<SamplingPlan>;
}

function hasAnyHeterogeneitySignal(signals: FieldHeterogeneitySignals | undefined): boolean {
  if (!signals) return false;
  return Boolean(signals.differentSoilType || signals.differentCroppingHistory || signals.differentSlopeOrDrainage || signals.persistentlyPoorYieldArea);
}

function zoneLetter(index: number): string {
  // A-Z, then AA/AB/... — no real Irish field needs more than a handful
  // of zones, but this never silently collides if one somehow does.
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * V1's only real `SamplingStrategy` — Teagasc's standard representative
 * composite sampling procedure, verified 2026-09-12 (module header).
 * Fails closed (`BLOCKED_INSUFFICIENT_EVIDENCE`, reusing the already-
 * registered `MISSING_FIELD_AREA` reason code — `evidence.ts`) when the
 * field has no real mapped area yet, exactly like every other real
 * calculation in this codebase that depends on `Field.areaHa`.
 */
export const StandardRepresentativeSamplingStrategy: SamplingStrategy = {
  strategyId: "standard_representative",
  version: SOIL_SAMPLING_PLAN_VERSION,
  buildPlan(input: SamplingStrategyInput): EngineOutcome<SamplingPlan> {
    if (!Number.isFinite(input.areaHa) || input.areaHa <= 0) {
      return blockedInsufficientEvidence("MISSING_FIELD_AREA", ["field mapped area (ha)"]);
    }

    const heterogeneous = hasAnyHeterogeneitySignal(input.heterogeneity);
    const areaBasedZoneCount = Math.max(1, Math.ceil(input.areaHa / IDEAL_MAX_ZONE_AREA_HA));
    const zoneCount = heterogeneous ? Math.max(2, areaBasedZoneCount) : areaBasedZoneCount;

    const reasons: string[] = [];
    if (zoneCount === 1) {
      reasons.push(
        `Field area ${input.areaHa.toFixed(2)} ha is within one representative sample's area (Teagasc: up to ${HARD_MAX_ZONE_AREA_HA} ha, ideally ${IDEAL_MAX_ZONE_AREA_HA} ha) — one zone covers the whole field.`,
      );
    } else if (heterogeneous && areaBasedZoneCount < zoneCount) {
      reasons.push(
        "Split into separate zones because this field was flagged as agronomically non-uniform (different soil type, cropping history, slope/drainage, or a persistently poor-yield area) — Teagasc guidance is to sample such areas separately, never as one blended composite.",
      );
    } else {
      reasons.push(
        `Field area ${input.areaHa.toFixed(2)} ha exceeds one representative sample's area — split into ${zoneCount} zones so each stays within Teagasc's ${IDEAL_MAX_ZONE_AREA_HA} ha per-sample target.`,
      );
    }
    if (heterogeneous && areaBasedZoneCount >= zoneCount) {
      reasons.push(
        "This field was also flagged as agronomically non-uniform — keep each zone's cores physically within one consistent area (soil type/cropping history/slope/drainage) rather than mixing across the flagged difference.",
      );
    }

    const areaHaPerZone = input.areaHa / zoneCount;
    const zones: SamplingZone[] = Array.from({ length: zoneCount }, (_, i) => ({
      zoneId: zoneLetter(i),
      label: zoneCount === 1 ? "Whole field" : `Zone ${zoneLetter(i)}`,
      areaHa: areaHaPerZone,
      minCores: MIN_CORES_PER_COMPOSITE_SAMPLE,
      reasons: zoneCount === 1 ? [] : ["Logical, proportionate share of the field's mapped area — walk this zone as one physically distinct area, not an exact drawn boundary (Farm Return does not auto-draw sub-field boundaries in V1)."],
    }));

    const assumptions = [
      "Assumes the field's own current mapped area (Field.areaHa) is accurate and up to date.",
      heterogeneous
        ? "Zone areas are an equal proportional split of the field's mapped area — Farm Return does not compute exact sub-field boundaries in V1; the farmer keeps each zone's cores within one physically consistent area while walking it."
        : "No agronomic non-uniformity was reported for this field — if part of it genuinely differs in soil type, cropping history, slope/drainage, or yield, sample it as a separate zone instead of including it in this plan.",
    ];

    if (!input.lpisRef && input.now > SOIL_GEOREF_REQUIREMENT_EFFECTIVE_DATE) {
      reasons.push(
        "This field has no recorded LPIS reference. Laboratory reports issued after 14 September 2025 must state a georeference or LPIS parcel (S.I. requirement already enforced at lab-result stage) — add one before submitting this sample.",
      );
    }

    const plan: SamplingPlan = {
      method: "standard_representative",
      methodVersion: SOIL_SAMPLING_PLAN_VERSION,
      fieldId: input.fieldId,
      totalAreaHa: input.areaHa,
      zones,
      sampleDepthMm: SAMPLING_DEPTH_MM,
      routeGuidance: SAMPLING_ROUTE_GUIDANCE,
      exclusionGuidance: SAMPLING_EXCLUSION_GUIDANCE,
      evidenceInputs: {
        areaHa: input.areaHa,
        heterogeneitySignalsProvided: input.heterogeneity !== undefined,
      },
      reasons,
      createdAt: input.now,
    };

    return ok(plan, "IRISH_MODEL", {
      inputs: { fieldId: input.fieldId, areaHa: input.areaHa, heterogeneity: input.heterogeneity ?? null },
      assumptions,
      sourceIds: ["TEAGASC_SOIL_SAMPLING"],
      calculatedAt: input.now,
    });
  },
};

// ---------------------------------------------------------------------------
// Sampling timing advisory — deliberately NOT an EngineOutcome gate. This
// never blocks starting or confirming a sampling session: a farmer's own
// physical sampling decision is theirs to make, and Farm Return has no
// reliable, complete record of every historical spreading event today
// (only confirmed job_actuals, which may be incomplete/absent for a real
// farm). This is advisory UI text only, honestly labelled as unconfirmed
// when the evidence is genuinely absent — never silently treated as "no
// recent application".
// ---------------------------------------------------------------------------

export type SamplingTimingStatus = "READY" | "TOO_SOON_AFTER_PK" | "TOO_SOON_AFTER_LIME" | "UNKNOWN";

export interface SamplingTimingAssessment {
  status: SamplingTimingStatus;
  detail: string;
}

export interface SamplingTimingInput {
  /** ISO date of the last known confirmed chemical fertiliser or organic
   * (P/K-bearing) application to this field/zone, when Farm Return
   * genuinely has one on record — never guessed. */
  lastPkApplicationDate?: string;
  /** ISO date of the last known confirmed lime application, when Farm
   * Return genuinely has one on record. No `ActivityType` for lime
   * spreading exists yet (`job-actual.ts`) — this will typically be
   * `undefined` today; kept as a real input so a future lime Actual type
   * plugs in without changing this function's contract. */
  lastLimeApplicationDate?: string;
  sampleDate: string;
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + (to.getDate() >= from.getDate() ? 0 : -1);
}

export function assessSamplingTimingReadiness(input: SamplingTimingInput): SamplingTimingAssessment {
  if (input.lastLimeApplicationDate) {
    const years = monthsBetween(input.lastLimeApplicationDate, input.sampleDate) / 12;
    if (years < MIN_YEARS_AFTER_LIME_APPLICATION) {
      return {
        status: "TOO_SOON_AFTER_LIME",
        detail: `Lime was applied to this field ${years.toFixed(1)} years ago — Teagasc advises waiting ${MIN_YEARS_AFTER_LIME_APPLICATION} years after liming before sampling for a reliable pH result.`,
      };
    }
  }
  if (input.lastPkApplicationDate) {
    const months = monthsBetween(input.lastPkApplicationDate, input.sampleDate);
    if (months < MIN_MONTHS_AFTER_PK_APPLICATION) {
      return {
        status: "TOO_SOON_AFTER_PK",
        detail: `P/K fertiliser or organic manure was applied to this field ${months} month(s) ago — Teagasc advises waiting ${MIN_MONTHS_AFTER_PK_APPLICATION}-${IDEAL_MONTHS_AFTER_PK_APPLICATION} months before sampling.`,
      };
    }
  }
  if (!input.lastPkApplicationDate && !input.lastLimeApplicationDate) {
    return {
      status: "UNKNOWN",
      detail: "Farm Return has no confirmed record of this field's last fertiliser/lime application — cannot confirm the recommended waiting period has passed. Check this in the field before sampling.",
    };
  }
  return { status: "READY", detail: "No recent P/K or lime application is recorded that would affect this sample." };
}
