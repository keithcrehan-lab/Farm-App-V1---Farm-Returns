/**
 * Grass Management — Phase 1 pure domain.
 *
 * Deterministic, side-effect-free helpers over two append-only evidence
 * ledgers (`grass_cover_observations`, `farm_grass_growth_observations`,
 * migration `20261103231532_grass_management_observations.sql`):
 *
 * - latest-evidence selection as of an explicit instant (future evidence is
 *   never used),
 * - a per-field grass state that always separates the MEASURED cover from
 *   any growth-adjusted ESTIMATE,
 * - data-freshness classification,
 * - presentation bands, a farm summary and a grass wedge ordering.
 *
 * What this module deliberately does NOT do:
 * - It never invents a growth rate. With no growth evidence, a field shows
 *   its measured cover as measured — never a "current" figure adjusted by a
 *   guessed growth — and any forward projection is unavailable.
 * - It never invents grazing demand. Demand is only applied when a caller
 *   explicitly supplies a quantified daily demand; the farm summary never
 *   reports demand, net balance or "days ahead" in Phase 1.
 *
 * Projection (simple mass balance over elapsed days, see
 * `docs/evidence-register.md` "Grass Management — Phase 1"):
 *   cover(t) = measured + growthRate × days − (dailyDemandKgDm ÷ areaHa) × days
 * clamped at ≥ 0 for display only, after every input has been validated.
 */

export const GRASS_MANAGEMENT_VERSION = "grass_management_v1.0.0";

/** Defensive data-sanity ceilings that reject keying/unit errors. These are
 * NOT biological claims about achievable cover or growth. Mirrored by the
 * migration's check constraints. */
export const MAX_GRASS_COVER_KG_DM_HA = 10_000;
export const MAX_GRASS_GROWTH_KG_DM_HA_DAY = 500;

/**
 * Age thresholds (inclusive, in days) for DATA FRESHNESS / model confidence.
 * This classifies how recent the evidence is — it is not a statement of
 * scientific certainty or measurement accuracy.
 */
export const GRASS_FRESHNESS_THRESHOLDS_DAYS = {
  high: 3,
  medium: 7,
  low: 14,
} as const;

export interface GrassPresentationTargets {
  /** Lower edge of the target band (kg DM/ha). */
  targetMinKgDmHa: number;
  /** Upper edge of the target band (kg DM/ha). */
  targetMaxKgDmHa: number;
  /** Cover at or above which a field is shown as surplus (kg DM/ha). */
  surplusFromKgDmHa: number;
}

/**
 * PRESENTATION TARGETS — configurable visual defaults for colouring and
 * grouping fields on screen. They are NOT agronomic recommendations, NOT
 * legal rules and NOT an evidence-backed pre-grazing target for any
 * particular farm, season or system. Callers may pass their own.
 */
export const DEFAULT_GRASS_PRESENTATION_TARGETS: GrassPresentationTargets = {
  targetMinKgDmHa: 1350,
  targetMaxKgDmHa: 1650,
  surplusFromKgDmHa: 1850,
};

const MS_PER_DAY = 86_400_000;

export type GrassCoverMethod = "plate_meter" | "visual_estimate" | "cut_and_weigh" | "manual_kg_dm_ha";
export const GRASS_COVER_METHODS: readonly GrassCoverMethod[] = [
  "plate_meter",
  "visual_estimate",
  "cut_and_weigh",
  "manual_kg_dm_ha",
];

/** `walk_measured`: growth measured between repeated walks of the same fields (Grass V2). Derived in
 * memory from the farm's finished walks, never written as an observation, so it is not in
 * `GRASS_GROWTH_ORIGINS` (the list a saved observation is checked against). */
export type GrassGrowthOrigin = "farmer_entered" | "regional_estimate" | "sensor" | "external_api" | "walk_measured";
export const GRASS_GROWTH_ORIGINS: readonly GrassGrowthOrigin[] = [
  "farmer_entered",
  "regional_estimate",
  "sensor",
  "external_api",
];

export interface GrassCoverObservation {
  id: string;
  farmId: string;
  fieldId: string;
  coverKgDmHa: number;
  method: GrassCoverMethod;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  observedAt: string;
  source: string;
  createdAt?: string;
}

export interface FarmGrassGrowthObservation {
  id: string;
  farmId: string;
  growthRateKgDmHaDay: number;
  origin: GrassGrowthOrigin;
  observedAt: string;
  source: string;
  createdAt?: string;
}

export type GrassGrowthForecastProvider = "teagasc_most_regional" | "external_api";
export type GrassGrowthForecastScope = "county" | "farm" | "national";

export interface FarmGrassGrowthForecast {
  id: string;
  farmId: string;
  growthRateKgDmHaDay: number;
  provider: GrassGrowthForecastProvider;
  scope: GrassGrowthForecastScope;
  regionLabel?: string;
  validFrom: string;
  validTo: string;
  issuedAt: string;
  retrievedAt: string;
  source: string;
  sourceUrl?: string;
  modelName?: string;
  modelVersion?: string;
  createdAt?: string;
}

export type GrassDataFreshness = "HIGH" | "MEDIUM" | "LOW" | "STALE";
export type GrassFieldConfidence = GrassDataFreshness | "UNKNOWN";

export type GrassPresentationBand = "unknown" | "below_target" | "target" | "above_target" | "surplus";

export function isGrassCoverMethod(value: unknown): value is GrassCoverMethod {
  return typeof value === "string" && (GRASS_COVER_METHODS as readonly string[]).includes(value);
}

export function isGrassGrowthOrigin(value: unknown): value is GrassGrowthOrigin {
  return typeof value === "string" && (GRASS_GROWTH_ORIGINS as readonly string[]).includes(value);
}

/** `true` for a finite cover within (0, MAX_GRASS_COVER_KG_DM_HA]. */
export function isValidGrassCoverKgDmHa(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_GRASS_COVER_KG_DM_HA;
}

/** `true` for a finite growth rate within (0, MAX_GRASS_GROWTH_KG_DM_HA_DAY]. */
export function isValidGrassGrowthKgDmHaDay(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_GRASS_GROWTH_KG_DM_HA_DAY;
}

function parseInstant(value: string, label: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new RangeError(`grass-management: ${label} is not a valid timestamp (${value})`);
  return ms;
}

/** Newer first; equal instants break on id (lexicographically greater wins)
 * so the choice never depends on input/arrival order. */
function isNewer(candidateMs: number, candidateId: string, currentMs: number, currentId: string): boolean {
  if (candidateMs !== currentMs) return candidateMs > currentMs;
  return candidateId > currentId;
}

/**
 * The latest cover observation per field observed at or before `asOf`.
 * Observations after `asOf` are ignored (they were not evidence yet).
 */
export function latestGrassObservationByField(
  observations: readonly GrassCoverObservation[],
  asOf: string,
): Map<string, GrassCoverObservation> {
  const asOfMs = parseInstant(asOf, "asOf");
  const latest = new Map<string, { observation: GrassCoverObservation; ms: number }>();
  for (const observation of observations) {
    const ms = parseInstant(observation.observedAt, `observation ${observation.id} observedAt`);
    if (ms > asOfMs) continue;
    const current = latest.get(observation.fieldId);
    if (!current || isNewer(ms, observation.id, current.ms, current.observation.id)) {
      latest.set(observation.fieldId, { observation, ms });
    }
  }
  return new Map([...latest].map(([fieldId, entry]) => [fieldId, entry.observation]));
}

/** The latest farm growth observation at or before `asOf`, if any. */
export function latestGrassGrowthObservation(
  observations: readonly FarmGrassGrowthObservation[],
  asOf: string,
): FarmGrassGrowthObservation | undefined {
  const asOfMs = parseInstant(asOf, "asOf");
  let latest: { observation: FarmGrassGrowthObservation; ms: number } | undefined;
  for (const observation of observations) {
    const ms = parseInstant(observation.observedAt, `growth observation ${observation.id} observedAt`);
    if (ms > asOfMs) continue;
    if (!latest || isNewer(ms, observation.id, latest.ms, latest.observation.id)) latest = { observation, ms };
  }
  return latest?.observation;
}

/**
 * Select a forecast that was already issued by `asOf` and covers the whole
 * requested projection interval [asOf, targetAt]. Partial or stale forecasts
 * are never stretched beyond their published validity window.
 */
export function activeGrassGrowthForecast(
  forecasts: readonly FarmGrassGrowthForecast[],
  asOf: string,
  targetAt: string,
): FarmGrassGrowthForecast | undefined {
  const asOfMs = parseInstant(asOf, "asOf");
  const targetMs = parseInstant(targetAt, "targetAt");
  if (targetMs < asOfMs) throw new RangeError("grass-management: targetAt cannot be before asOf");

  let selected: { forecast: FarmGrassGrowthForecast; issuedMs: number } | undefined;
  for (const forecast of forecasts) {
    if (!isValidGrassGrowthKgDmHaDay(forecast.growthRateKgDmHaDay)) {
      throw new RangeError(`grass-management: forecast ${forecast.id} growth rate is invalid`);
    }
    const issuedMs = parseInstant(forecast.issuedAt, `forecast ${forecast.id} issuedAt`);
    const validFromMs = parseInstant(forecast.validFrom, `forecast ${forecast.id} validFrom`);
    const validToMs = parseInstant(forecast.validTo, `forecast ${forecast.id} validTo`);
    parseInstant(forecast.retrievedAt, `forecast ${forecast.id} retrievedAt`);
    if (validToMs < validFromMs) {
      throw new RangeError(`grass-management: forecast ${forecast.id} validity ends before it starts`);
    }
    if (issuedMs > asOfMs) continue;
    if (validFromMs > asOfMs || validToMs < targetMs) continue;
    if (!selected || isNewer(issuedMs, forecast.id, selected.issuedMs, selected.forecast.id)) {
      selected = { forecast, issuedMs };
    }
  }
  return selected?.forecast;
}

/**
 * Data freshness from evidence age alone (days, inclusive thresholds).
 * Describes how recent the data is — not scientific certainty.
 */
export function classifyGrassDataFreshness(ageDays: number): GrassDataFreshness {
  if (!Number.isFinite(ageDays) || ageDays < 0) {
    throw new RangeError(`grass-management: evidence age must be a finite, non-negative number of days (${ageDays})`);
  }
  if (ageDays <= GRASS_FRESHNESS_THRESHOLDS_DAYS.high) return "HIGH";
  if (ageDays <= GRASS_FRESHNESS_THRESHOLDS_DAYS.medium) return "MEDIUM";
  if (ageDays <= GRASS_FRESHNESS_THRESHOLDS_DAYS.low) return "LOW";
  return "STALE";
}

function assertTargets(targets: GrassPresentationTargets): void {
  const { targetMinKgDmHa: min, targetMaxKgDmHa: max, surplusFromKgDmHa: surplus } = targets;
  if (![min, max, surplus].every(Number.isFinite) || !(min > 0 && min <= max && max <= surplus)) {
    throw new RangeError("grass-management: presentation targets must be finite and ordered min <= max <= surplus");
  }
}

/**
 * Visual band for a cover value against configurable PRESENTATION targets
 * (not agronomic or legal rules). `below_target` is the "tight" band.
 */
export function grassPresentationBand(
  coverKgDmHa: number | undefined,
  targets: GrassPresentationTargets = DEFAULT_GRASS_PRESENTATION_TARGETS,
): GrassPresentationBand {
  assertTargets(targets);
  if (coverKgDmHa === undefined) return "unknown";
  if (!Number.isFinite(coverKgDmHa) || coverKgDmHa < 0) {
    throw new RangeError(`grass-management: cover must be a finite, non-negative number (${coverKgDmHa})`);
  }
  if (coverKgDmHa >= targets.surplusFromKgDmHa) return "surplus";
  if (coverKgDmHa > targets.targetMaxKgDmHa) return "above_target";
  if (coverKgDmHa >= targets.targetMinKgDmHa) return "target";
  return "below_target";
}

export interface GrassMeasuredCover {
  observationId: string;
  coverKgDmHa: number;
  method: GrassCoverMethod;
  observedAt: string;
  source: string;
  ageDays: number;
}

export interface GrassGrowthBasis {
  observationId: string;
  growthRateKgDmHaDay: number;
  origin: GrassGrowthOrigin;
  observedAt: string;
  source: string;
}

export interface GrassDemandWindow {
  id: string;
  dailyDemandKgDm: number;
  startedAt: string;
  endedAt?: string;
  source: string;
}

export interface GrassUnresolvedDemandWindow {
  id: string;
  startedAt: string;
  endedAt?: string;
}

/** How demand entered an estimate. `not_supplied` means grazing removal is
 * NOT accounted for — the estimate is growth-only and may overstate cover
 * on a grazed field. */
export type GrassDemandBasis =
  | { status: "not_supplied" }
  | { status: "applied"; dailyDemandKgDm: number; demandKgDmHaDay: number }
  | {
      status: "time_bounded";
      currentDailyDemandKgDm: number;
      demandRemovedKgDm: number;
      demandRemovedKgDmHa: number;
      windowCount: number;
      unresolvedSessionCount: number;
      completeness: "complete" | "partial";
    };

/** A cover value at a moment, explicitly labelled measured vs estimated. */
export type GrassCoverValue =
  | {
      basis: "measured";
      coverKgDmHa: number;
      /** Why the measured value is shown un-adjusted. */
      reason: "OBSERVED_AT_AS_OF" | "NO_GROWTH_EVIDENCE";
    }
  | {
      basis: "estimated";
      /** Display value, clamped at >= 0. */
      coverKgDmHa: number;
      /** Unclamped mass-balance result (may be negative under heavy demand). */
      rawCoverKgDmHa: number;
      clampedAtZero: boolean;
      elapsedDays: number;
      growth: GrassGrowthBasis;
      demand: GrassDemandBasis;
    };

export type GrassProjection =
  | {
      status: "available";
      horizonDays: number;
      atInstant: string;
      value: Extract<GrassCoverValue, { basis: "estimated" }>;
      growthSource: "current_growth" | "forecast";
      forecast?: {
        id: string;
        provider: GrassGrowthForecastProvider;
        scope: GrassGrowthForecastScope;
        regionLabel?: string;
        validFrom: string;
        validTo: string;
        issuedAt: string;
        source: string;
        sourceUrl?: string;
      };
    }
  | { status: "unavailable"; horizonDays: number; reason: "GROWTH_RATE_REQUIRED" | "CURRENT_GROWTH_REQUIRED" };

export type GrassFieldState =
  | {
      status: "unknown";
      fieldId: string;
      areaHa: number;
      reason: "NO_OBSERVATION";
      confidence: "UNKNOWN";
      band: "unknown";
    }
  | {
      status: "known";
      fieldId: string;
      areaHa: number;
      measured: GrassMeasuredCover;
      /** Cover as of `asOf`: the measurement itself, or a growth-adjusted estimate. */
      current: GrassCoverValue;
      projection?: GrassProjection;
      /** Freshness of the cover measurement (data freshness, not certainty). */
      confidence: GrassDataFreshness;
      /** Band of `current.coverKgDmHa`. */
      band: GrassPresentationBand;
    };

export interface BuildGrassFieldStateInput {
  fieldId: string;
  areaHa: number;
  observation?: GrassCoverObservation;
  /** Historical/current growth evidence used only to bring the last cover reading forward to asOf. */
  growth?: FarmGrassGrowthObservation;
  /** Future growth forecast used only from asOf into the projection horizon. */
  forecastGrowth?: FarmGrassGrowthForecast;
  asOf: string;
  /** Days beyond `asOf` to project. Requires growth evidence. */
  horizonDays?: number;
  /** Legacy constant quantified grazing demand on this field (kg DM/day).
   * New movement-aware callers should use demandWindows instead. */
  dailyDemandKgDm?: number;
  /** Time-bounded quantified demand from recorded cattle field movements. */
  demandWindows?: readonly GrassDemandWindow[];
  /** Recorded movement sessions whose demand cannot be quantified safely. */
  unresolvedDemandWindows?: readonly GrassUnresolvedDemandWindow[];
  targets?: GrassPresentationTargets;
}

function movementDemandForInterval(input: {
  intervalStartMs: number;
  intervalEndMs: number;
  areaHa: number;
  demandWindows?: readonly GrassDemandWindow[];
  unresolvedDemandWindows?: readonly GrassUnresolvedDemandWindow[];
}): { basis: GrassDemandBasis; removedKgDmHa: number } {
  const { intervalStartMs, intervalEndMs, areaHa } = input;
  const windows = input.demandWindows ?? [];
  const unresolvedWindows = input.unresolvedDemandWindows ?? [];

  if (windows.length === 0 && unresolvedWindows.length === 0) {
    return { basis: { status: "not_supplied" }, removedKgDmHa: 0 };
  }
  if (!(areaHa > 0)) {
    throw new RangeError("grass-management: a positive field area is required to apply movement demand");
  }

  let demandRemovedKgDm = 0;
  let currentDailyDemandKgDm = 0;
  for (const window of windows) {
    if (!Number.isFinite(window.dailyDemandKgDm) || window.dailyDemandKgDm < 0) {
      throw new RangeError(`grass-management: demand window ${window.id} has invalid dailyDemandKgDm`);
    }
    const startedMs = parseInstant(window.startedAt, `demand window ${window.id} startedAt`);
    const endedMs = window.endedAt === undefined
      ? undefined
      : parseInstant(window.endedAt, `demand window ${window.id} endedAt`);
    if (endedMs !== undefined && endedMs < startedMs) {
      throw new RangeError(`grass-management: demand window ${window.id} ends before it starts`);
    }

    const overlapStart = Math.max(intervalStartMs, startedMs);
    const overlapEnd = Math.min(intervalEndMs, endedMs ?? intervalEndMs);
    if (overlapEnd > overlapStart) {
      demandRemovedKgDm += window.dailyDemandKgDm * ((overlapEnd - overlapStart) / MS_PER_DAY);
    }

    if (startedMs <= intervalEndMs && (endedMs === undefined || endedMs > intervalEndMs)) {
      currentDailyDemandKgDm += window.dailyDemandKgDm;
    }
  }

  let unresolvedSessionCount = 0;
  for (const window of unresolvedWindows) {
    const startedMs = parseInstant(window.startedAt, `unresolved demand window ${window.id} startedAt`);
    const endedMs = window.endedAt === undefined
      ? undefined
      : parseInstant(window.endedAt, `unresolved demand window ${window.id} endedAt`);
    if (endedMs !== undefined && endedMs < startedMs) {
      throw new RangeError(`grass-management: unresolved demand window ${window.id} ends before it starts`);
    }
    if (startedMs <= intervalEndMs && (endedMs === undefined || endedMs > intervalStartMs)) {
      unresolvedSessionCount += 1;
    }
  }

  const demandRemovedKgDmHa = demandRemovedKgDm / areaHa;
  return {
    basis: {
      status: "time_bounded",
      currentDailyDemandKgDm,
      demandRemovedKgDm,
      demandRemovedKgDmHa,
      windowCount: windows.length,
      unresolvedSessionCount,
      completeness: unresolvedSessionCount > 0 ? "partial" : "complete",
    },
    removedKgDmHa: demandRemovedKgDmHa,
  };
}

function estimate(
  measuredKgDmHa: number,
  measuredMs: number,
  targetMs: number,
  areaHa: number,
  growth: FarmGrassGrowthObservation,
  input: {
    dailyDemandKgDm?: number;
    demandWindows?: readonly GrassDemandWindow[];
    unresolvedDemandWindows?: readonly GrassUnresolvedDemandWindow[];
  },
): Extract<GrassCoverValue, { basis: "estimated" }> {
  const elapsedDays = (targetMs - measuredMs) / MS_PER_DAY;

  let demand: GrassDemandBasis = { status: "not_supplied" };
  let removedKgDmHa = 0;
  if (input.dailyDemandKgDm !== undefined) {
    demand = {
      status: "applied",
      dailyDemandKgDm: input.dailyDemandKgDm,
      demandKgDmHaDay: input.dailyDemandKgDm / areaHa,
    };
    removedKgDmHa = demand.demandKgDmHaDay * elapsedDays;
  } else {
    const movementDemand = movementDemandForInterval({
      intervalStartMs: measuredMs,
      intervalEndMs: targetMs,
      areaHa,
      demandWindows: input.demandWindows,
      unresolvedDemandWindows: input.unresolvedDemandWindows,
    });
    demand = movementDemand.basis;
    removedKgDmHa = movementDemand.removedKgDmHa;
  }

  const raw = measuredKgDmHa + growth.growthRateKgDmHaDay * elapsedDays - removedKgDmHa;
  return {
    basis: "estimated",
    coverKgDmHa: Math.max(0, raw),
    rawCoverKgDmHa: raw,
    clampedAtZero: raw < 0,
    elapsedDays,
    growth: {
      observationId: growth.id,
      growthRateKgDmHaDay: growth.growthRateKgDmHaDay,
      origin: growth.origin,
      observedAt: growth.observedAt,
      source: growth.source,
    },
    demand,
  };
}

/**
 * One field's grass state as of `asOf`. Unknown without an observation (an
 * observation after `asOf` is not evidence yet and is treated as absent).
 * Throws `RangeError` on malformed numeric/timestamp input rather than
 * producing a plausible-looking figure.
 */
export function buildGrassFieldState(input: BuildGrassFieldStateInput): GrassFieldState {
  const {
    fieldId,
    areaHa,
    observation,
    growth,
    forecastGrowth,
    asOf,
    horizonDays,
    dailyDemandKgDm,
    demandWindows,
    unresolvedDemandWindows,
  } = input;
  const targets = input.targets ?? DEFAULT_GRASS_PRESENTATION_TARGETS;
  const asOfMs = parseInstant(asOf, "asOf");
  if (!Number.isFinite(areaHa) || areaHa < 0) {
    throw new RangeError(`grass-management: field ${fieldId} areaHa must be a finite, non-negative number (${areaHa})`);
  }
  if (horizonDays !== undefined && (!Number.isFinite(horizonDays) || horizonDays <= 0)) {
    throw new RangeError(`grass-management: horizonDays must be a finite, positive number (${horizonDays})`);
  }
  if (dailyDemandKgDm !== undefined && (!Number.isFinite(dailyDemandKgDm) || dailyDemandKgDm < 0)) {
    throw new RangeError(`grass-management: dailyDemandKgDm must be a finite, non-negative number (${dailyDemandKgDm})`);
  }
  if (dailyDemandKgDm !== undefined && ((demandWindows?.length ?? 0) > 0 || (unresolvedDemandWindows?.length ?? 0) > 0)) {
    throw new RangeError("grass-management: use either legacy dailyDemandKgDm or movement demand windows, not both");
  }
  if ((dailyDemandKgDm !== undefined || (demandWindows?.length ?? 0) > 0) && !(areaHa > 0)) {
    throw new RangeError(`grass-management: field ${fieldId} needs a positive areaHa to apply demand`);
  }

  const observedMs = observation ? parseInstant(observation.observedAt, `observation ${observation.id} observedAt`) : undefined;
  if (!observation || observedMs === undefined || observedMs > asOfMs) {
    return { status: "unknown", fieldId, areaHa, reason: "NO_OBSERVATION", confidence: "UNKNOWN", band: "unknown" };
  }
  if (observation.fieldId !== fieldId) {
    throw new RangeError(`grass-management: observation ${observation.id} belongs to field ${observation.fieldId}, not ${fieldId}`);
  }
  if (!isValidGrassCoverKgDmHa(observation.coverKgDmHa)) {
    throw new RangeError(`grass-management: observation ${observation.id} cover is outside (0, ${MAX_GRASS_COVER_KG_DM_HA}] kg DM/ha`);
  }

  // Growth recorded after `asOf` is not evidence yet.
  let usableGrowth: FarmGrassGrowthObservation | undefined;
  if (growth && parseInstant(growth.observedAt, `growth observation ${growth.id} observedAt`) <= asOfMs) {
    if (!isValidGrassGrowthKgDmHaDay(growth.growthRateKgDmHaDay)) {
      throw new RangeError(`grass-management: growth observation ${growth.id} rate is outside (0, ${MAX_GRASS_GROWTH_KG_DM_HA_DAY}] kg DM/ha/day`);
    }
    usableGrowth = growth;
  }

  const demandInput = { dailyDemandKgDm, demandWindows, unresolvedDemandWindows };

  const ageDays = (asOfMs - observedMs) / MS_PER_DAY;
  const measured: GrassMeasuredCover = {
    observationId: observation.id,
    coverKgDmHa: observation.coverKgDmHa,
    method: observation.method,
    observedAt: observation.observedAt,
    source: observation.source,
    ageDays,
  };

  let current: GrassCoverValue;
  if (ageDays === 0) {
    current = { basis: "measured", coverKgDmHa: observation.coverKgDmHa, reason: "OBSERVED_AT_AS_OF" };
  } else if (!usableGrowth) {
    // Honest: no growth evidence → show the measurement as measured, never a
    // growth-adjusted "current" figure.
    current = { basis: "measured", coverKgDmHa: observation.coverKgDmHa, reason: "NO_GROWTH_EVIDENCE" };
  } else {
    current = estimate(observation.coverKgDmHa, observedMs, asOfMs, areaHa, usableGrowth, demandInput);
  }

  let projection: GrassProjection | undefined;
  if (horizonDays !== undefined) {
    const targetMs = asOfMs + horizonDays * MS_PER_DAY;
    const targetAt = new Date(targetMs).toISOString();

    let validForecast: FarmGrassGrowthForecast | undefined;
    if (forecastGrowth) {
      if (!isValidGrassGrowthKgDmHaDay(forecastGrowth.growthRateKgDmHaDay)) {
        throw new RangeError(`grass-management: forecast ${forecastGrowth.id} growth rate is invalid`);
      }
      const issuedMs = parseInstant(forecastGrowth.issuedAt, `forecast ${forecastGrowth.id} issuedAt`);
      const validFromMs = parseInstant(forecastGrowth.validFrom, `forecast ${forecastGrowth.id} validFrom`);
      const validToMs = parseInstant(forecastGrowth.validTo, `forecast ${forecastGrowth.id} validTo`);
      parseInstant(forecastGrowth.retrievedAt, `forecast ${forecastGrowth.id} retrievedAt`);
      if (validToMs < validFromMs) {
        throw new RangeError(`grass-management: forecast ${forecastGrowth.id} validity ends before it starts`);
      }
      if (issuedMs <= asOfMs && validFromMs <= asOfMs && validToMs >= targetMs) {
        validForecast = forecastGrowth;
      }
    }

    if (validForecast) {
      if (ageDays > 0 && current.basis === "measured" && current.reason === "NO_GROWTH_EVIDENCE") {
        projection = { status: "unavailable", horizonDays, reason: "CURRENT_GROWTH_REQUIRED" };
      } else {
        const forecastAsGrowth: FarmGrassGrowthObservation = {
          id: validForecast.id,
          farmId: validForecast.farmId,
          growthRateKgDmHaDay: validForecast.growthRateKgDmHaDay,
          origin: validForecast.provider === "teagasc_most_regional" ? "regional_estimate" : "external_api",
          observedAt: validForecast.issuedAt,
          source: validForecast.source,
        };
        projection = {
          status: "available",
          horizonDays,
          atInstant: targetAt,
          value: estimate(
            current.coverKgDmHa,
            asOfMs,
            targetMs,
            areaHa,
            forecastAsGrowth,
            demandInput,
          ),
          growthSource: "forecast",
          forecast: {
            id: validForecast.id,
            provider: validForecast.provider,
            scope: validForecast.scope,
            ...(validForecast.regionLabel ? { regionLabel: validForecast.regionLabel } : {}),
            validFrom: validForecast.validFrom,
            validTo: validForecast.validTo,
            issuedAt: validForecast.issuedAt,
            source: validForecast.source,
            ...(validForecast.sourceUrl ? { sourceUrl: validForecast.sourceUrl } : {}),
          },
        };
      }
    } else {
      projection = usableGrowth
        ? {
            status: "available",
            horizonDays,
            atInstant: targetAt,
            value: estimate(
              observation.coverKgDmHa,
              observedMs,
              targetMs,
              areaHa,
              usableGrowth,
              demandInput,
            ),
            growthSource: "current_growth",
          }
        : { status: "unavailable", horizonDays, reason: "GROWTH_RATE_REQUIRED" };
    }
  }

  return {
    status: "known",
    fieldId,
    areaHa,
    measured,
    current,
    ...(projection ? { projection } : {}),
    confidence: classifyGrassDataFreshness(ageDays),
    band: grassPresentationBand(current.coverKgDmHa, targets),
  };
}

export interface GrassSummaryField {
  id: string;
  areaHa: number;
}

export interface GrassFieldDemandInput {
  demandWindows?: readonly GrassDemandWindow[];
  unresolvedDemandWindows?: readonly GrassUnresolvedDemandWindow[];
}

export interface FarmGrassSummary {
  version: typeof GRASS_MANAGEMENT_VERSION;
  asOf: string;
  states: GrassFieldState[];
  /** Area-weighted average of `current.coverKgDmHa` over KNOWN fields with
   * area > 0 only; undefined when there are none. Unknown fields are never
   * counted as zero. */
  averageCoverKgDmHa?: number;
  /** Basis of the values averaged above. */
  averageCoverBasis?: "measured" | "estimated" | "mixed";
  knownAreaHa: number;
  unknownAreaHa: number;
  /** Σ current cover × area over known fields (kg DM); undefined if none known. */
  knownCoverKgDm?: number;
  counts: Record<GrassFieldConfidence, number>;
  /** Latest cover observation used (≤ asOf) across the supplied fields. */
  latestWalkAt?: string;
  growth?: GrassGrowthBasis;
  growthRateKgDmHaDay?: number;
  /** Phase 1: no quantified demand is supplied, so these are never set —
   * no fabricated demand, balance or "days ahead". */
  dailyDemandKgDm: undefined;
  netBalanceKgDmDay: undefined;
}

/**
 * Farm-level grass summary as of `asOf` for the supplied (active) fields.
 * Observations for fields not in `fields` are ignored.
 */
export function buildFarmGrassSummary(
  fields: readonly GrassSummaryField[],
  observations: readonly GrassCoverObservation[],
  growthObservations: readonly FarmGrassGrowthObservation[],
  asOf: string,
  targets: GrassPresentationTargets = DEFAULT_GRASS_PRESENTATION_TARGETS,
  demandByField?: ReadonlyMap<string, GrassFieldDemandInput>,
): FarmGrassSummary {
  const latestByField = latestGrassObservationByField(observations, asOf);
  const growth = latestGrassGrowthObservation(growthObservations, asOf);

  const states = fields.map((field) => {
    const demand = demandByField?.get(field.id);
    return buildGrassFieldState({
      fieldId: field.id,
      areaHa: field.areaHa,
      observation: latestByField.get(field.id),
      growth,
      asOf,
      targets,
      demandWindows: demand?.demandWindows,
      unresolvedDemandWindows: demand?.unresolvedDemandWindows,
    });
  });

  const counts: Record<GrassFieldConfidence, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, STALE: 0, UNKNOWN: 0 };
  let knownAreaHa = 0;
  let unknownAreaHa = 0;
  let weightedCover = 0;
  let latestWalkMs: number | undefined;
  let latestWalkAt: string | undefined;
  const bases = new Set<"measured" | "estimated">();

  for (const state of states) {
    counts[state.confidence] += 1;
    if (state.status === "unknown") {
      unknownAreaHa += state.areaHa;
      continue;
    }
    const ms = Date.parse(state.measured.observedAt);
    if (latestWalkMs === undefined || ms > latestWalkMs) {
      latestWalkMs = ms;
      latestWalkAt = state.measured.observedAt;
    }
    if (state.areaHa > 0) {
      knownAreaHa += state.areaHa;
      weightedCover += state.current.coverKgDmHa * state.areaHa;
      bases.add(state.current.basis);
    }
  }

  const hasKnown = knownAreaHa > 0;
  const growthBasis: GrassGrowthBasis | undefined = growth
    ? {
        observationId: growth.id,
        growthRateKgDmHaDay: growth.growthRateKgDmHaDay,
        origin: growth.origin,
        observedAt: growth.observedAt,
        source: growth.source,
      }
    : undefined;

  return {
    version: GRASS_MANAGEMENT_VERSION,
    asOf,
    states,
    ...(hasKnown
      ? {
          averageCoverKgDmHa: weightedCover / knownAreaHa,
          averageCoverBasis: bases.size > 1 ? "mixed" : [...bases][0],
          knownCoverKgDm: weightedCover,
        }
      : {}),
    knownAreaHa,
    unknownAreaHa,
    counts,
    ...(latestWalkAt ? { latestWalkAt } : {}),
    ...(growthBasis ? { growth: growthBasis, growthRateKgDmHaDay: growthBasis.growthRateKgDmHaDay } : {}),
    dailyDemandKgDm: undefined,
    netBalanceKgDmDay: undefined,
  };
}

export interface GrassWedgeEntry {
  rank: number;
  fieldId: string;
  areaHa: number;
  /** Undefined for an unknown field — never zero. */
  coverKgDmHa?: number;
  basis: "projected" | "estimated" | "measured" | "unknown";
  confidence: GrassFieldConfidence;
  band: GrassPresentationBand;
}

/**
 * Grass wedge: known fields ranked by cover descending (an available
 * projection is preferred over the current value), unknown fields last.
 * Ties break on fieldId for a deterministic order.
 */
export function buildGrassWedge(
  states: readonly GrassFieldState[],
  targets: GrassPresentationTargets = DEFAULT_GRASS_PRESENTATION_TARGETS,
): GrassWedgeEntry[] {
  const entries = states.map((state): Omit<GrassWedgeEntry, "rank"> => {
    if (state.status === "unknown") {
      return { fieldId: state.fieldId, areaHa: state.areaHa, basis: "unknown", confidence: "UNKNOWN", band: "unknown" };
    }
    if (state.projection?.status === "available") {
      const cover = state.projection.value.coverKgDmHa;
      return {
        fieldId: state.fieldId,
        areaHa: state.areaHa,
        coverKgDmHa: cover,
        basis: "projected",
        confidence: state.confidence,
        band: grassPresentationBand(cover, targets),
      };
    }
    return {
      fieldId: state.fieldId,
      areaHa: state.areaHa,
      coverKgDmHa: state.current.coverKgDmHa,
      basis: state.current.basis,
      confidence: state.confidence,
      band: state.band,
    };
  });

  entries.sort((a, b) => {
    const aKnown = a.coverKgDmHa !== undefined;
    const bKnown = b.coverKgDmHa !== undefined;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (aKnown && bKnown && a.coverKgDmHa !== b.coverKgDmHa) return b.coverKgDmHa! - a.coverKgDmHa!;
    return a.fieldId < b.fieldId ? -1 : a.fieldId > b.fieldId ? 1 : 0;
  });

  return entries.map((entry, index) => ({ rank: index + 1, ...entry }));
}
