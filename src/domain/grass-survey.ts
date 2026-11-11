/**
 * Grass surveys: a walk, quad run or drone flight saved as one record
 * (route, weather, readings and the results worked out from them).
 *
 * Pure functions only. Growth is derived from the change in measured cover
 * between two readings of the same field; a field grazed in between, a
 * reading too close or too far apart, or a fall in cover gives no growth
 * figure (never a guessed one).
 */

export const GRASS_SURVEY_MODES = ["walk", "quad", "drone"] as const;
export type GrassSurveyMode = (typeof GRASS_SURVEY_MODES)[number];

export function isGrassSurveyMode(value: unknown): value is GrassSurveyMode {
  return typeof value === "string" && (GRASS_SURVEY_MODES as readonly string[]).includes(value);
}

export interface SurveyTrackPoint {
  recordedAt: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
}

export interface SurveyWeather {
  status: string;
  stationName: string | null;
  distanceKm: number | null;
  observedAt: string | null;
  airTemperatureC: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  soilTemperatureC: number | null;
  rainfall7dMm: number | null;
  reason?: string;
}

export type SurveyFieldStatus = "measured" | "grazed" | "skipped" | "not_visited";

export interface SurveyFieldResult {
  fieldId: string;
  name: string;
  areaHa: number;
  status: SurveyFieldStatus;
  coverKgDmHa: number | null;
  previousCoverKgDmHa: number | null;
  daysSincePrevious: number | null;
  growthKgDmHaDay: number | null;
  growthNote: string | null;
}

export interface SurveyResults {
  version: 1;
  durationMin: number;
  distanceM: number;
  fieldsMeasured: number;
  fieldsTotal: number;
  farmCoverKgDmHa: number | null;
  farmCoverFieldCount: number;
  farmCoverChange: number | null;
  farmGrowthKgDmHaDay: number | null;
  farmGrowthFieldCount: number;
  fields: SurveyFieldResult[];
}

const DAY_MS = 86_400_000;
export const MIN_GROWTH_INTERVAL_DAYS = 1;
export const MAX_GROWTH_INTERVAL_DAYS = 60;
/** Track points less accurate than this are left out of the distance. */
export const MAX_TRACK_ACCURACY_M = 50;

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Fastest believable movement between two fixes, by how the farmer is
 * getting around. A jump faster than this is a bad fix (a phone's first
 * wifi/cell-tower guess, or a reflection off a shed), not real movement.
 */
export const MAX_TRACK_SPEED_MPS: Record<GrassSurveyMode, number> = { walk: 4, quad: 20, drone: 25 };
/** Allowance for ordinary GPS wobble on top of the speed limit. */
const JUMP_SLACK_M = 15;
/** Consecutive agreeing fixes that outvote the point before them. */
const OUTVOTE_RUN = 3;

function plausibleStep(a: SurveyTrackPoint, b: SurveyTrackPoint, maxSpeed: number): boolean {
  const seconds = Math.max(1, (Date.parse(b.recordedAt) - Date.parse(a.recordedAt)) / 1000);
  return haversineM(a.lat, a.lng, b.lat, b.lng) <= maxSpeed * seconds + JUMP_SLACK_M;
}

/**
 * The route as it should be drawn and measured: in time order, without
 * inaccurate fixes and without impossible jumps. A lone bad fix is dropped;
 * if the bad fix came first (so everything after it looks like a jump), a
 * run of fixes that agree with each other replaces it.
 */
export function cleanSurveyTrack(points: readonly SurveyTrackPoint[], mode: GrassSurveyMode = "walk"): SurveyTrackPoint[] {
  const maxSpeed = MAX_TRACK_SPEED_MPS[mode];
  const good = points
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(Date.parse(p.recordedAt)))
    .filter((p) => p.accuracyM === null || p.accuracyM <= MAX_TRACK_ACCURACY_M)
    .slice()
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  let kept: SurveyTrackPoint[] = [];
  let rejected: SurveyTrackPoint[] = [];
  for (const p of good) {
    const last = kept.at(-1);
    if (!last || plausibleStep(last, p, maxSpeed)) {
      kept.push(p);
      rejected = [];
      continue;
    }
    // Rejected: start or extend a run of rejected fixes that agree with each other.
    if (rejected.length && !plausibleStep(rejected.at(-1)!, p, maxSpeed)) rejected = [];
    rejected.push(p);
    // Enough agreeing fixes outvote a shorter kept stretch: that stretch was the bad one.
    if (rejected.length >= OUTVOTE_RUN && rejected.length > kept.length) {
      kept = rejected;
      rejected = [];
    }
  }
  return kept;
}

/** Route length in metres. Ignores inaccurate fixes, impossible jumps and sub-3 m GPS jitter. */
export function trackDistanceM(points: readonly SurveyTrackPoint[], mode: GrassSurveyMode = "walk"): number {
  const good = cleanSurveyTrack(points, mode);
  if (good.length < 2) return 0;
  let total = 0;
  let last = good[0];
  for (const p of good.slice(1)) {
    const d = haversineM(last.lat, last.lng, p.lat, p.lng);
    if (d >= 3) {
      total += d;
      last = p;
    }
  }
  return Math.round(total);
}

export interface SurveyResultsInput {
  fields: ReadonlyArray<{ id: string; name: string; areaHa: number }>;
  observations: ReadonlyArray<{ id: string; fieldId: string; coverKgDmHa: number; observedAt: string }>;
  surveyObservationIds: ReadonlyArray<string>;
  startedAt: string;
  finishedAt: string;
  grazingSessions: ReadonlyArray<{ fieldId: string; startedAt: string; endedAt?: string }>;
  markedGrazedFieldIds: ReadonlyArray<string>;
  skippedFieldIds: ReadonlyArray<string>;
  distanceM: number;
  previousFarmCoverKgDmHa?: number | null;
}

const byTime = <T extends { observedAt: string }>(a: T, b: T) => Date.parse(a.observedAt) - Date.parse(b.observedAt);

function areaWeighted(values: Array<{ value: number; areaHa: number }>): number | null {
  const usable = values.filter((v) => v.areaHa > 0 && Number.isFinite(v.value));
  const area = usable.reduce((s, v) => s + v.areaHa, 0);
  if (!usable.length || area <= 0) return null;
  return usable.reduce((s, v) => s + v.value * v.areaHa, 0) / area;
}

export function computeSurveyResults(input: SurveyResultsInput): SurveyResults {
  const inSurvey = new Set(input.surveyObservationIds);
  const finishedMs = Date.parse(input.finishedAt);
  const grazed = new Set(input.markedGrazedFieldIds);
  const skipped = new Set(input.skippedFieldIds);

  const fields: SurveyFieldResult[] = input.fields.map((field) => {
    const history = input.observations.filter((o) => o.fieldId === field.id && Date.parse(o.observedAt) <= finishedMs).sort(byTime);
    const surveyReading = history.filter((o) => inSurvey.has(o.id)).at(-1) ?? null;
    const latest = history.at(-1) ?? null;
    const status: SurveyFieldStatus = surveyReading ? "measured" : grazed.has(field.id) ? "grazed" : skipped.has(field.id) ? "skipped" : "not_visited";

    const base: SurveyFieldResult = {
      fieldId: field.id,
      name: field.name,
      areaHa: field.areaHa,
      status,
      coverKgDmHa: latest ? latest.coverKgDmHa : null,
      previousCoverKgDmHa: null,
      daysSincePrevious: null,
      growthKgDmHaDay: null,
      growthNote: null,
    };
    if (!surveyReading) return base;

    const tNow = Date.parse(surveyReading.observedAt);
    const previous = history.filter((o) => !inSurvey.has(o.id) && Date.parse(o.observedAt) < tNow).at(-1) ?? null;
    if (!previous) return { ...base, growthNote: "First reading for this field" };

    const tPrev = Date.parse(previous.observedAt);
    const days = (tNow - tPrev) / DAY_MS;
    const withPrev = { ...base, previousCoverKgDmHa: previous.coverKgDmHa, daysSincePrevious: Math.round(days * 10) / 10 };
    if (days < MIN_GROWTH_INTERVAL_DAYS) return { ...withPrev, growthNote: "Last reading less than a day ago" };
    if (days > MAX_GROWTH_INTERVAL_DAYS) return { ...withPrev, growthNote: "Last reading over 60 days ago" };
    const grazedBetween = grazed.has(field.id) || input.grazingSessions.some((s) =>
      s.fieldId === field.id && Date.parse(s.startedAt) < tNow && (s.endedAt === undefined || Date.parse(s.endedAt) > tPrev));
    if (grazedBetween) return { ...withPrev, growthNote: "Grazed since the last reading" };
    const growth = (surveyReading.coverKgDmHa - previous.coverKgDmHa) / days;
    if (growth < 0) return { ...withPrev, growthNote: "Cover fell; likely grazed or cut" };
    return { ...withPrev, growthKgDmHaDay: Math.round(growth * 10) / 10 };
  });

  const coverValues = fields.filter((f) => f.coverKgDmHa !== null).map((f) => ({ value: f.coverKgDmHa as number, areaHa: f.areaHa }));
  const growthValues = fields.filter((f) => f.growthKgDmHaDay !== null).map((f) => ({ value: f.growthKgDmHaDay as number, areaHa: f.areaHa }));
  const farmCover = areaWeighted(coverValues);
  const farmGrowth = areaWeighted(growthValues);
  const previousCover = input.previousFarmCoverKgDmHa ?? null;

  return {
    version: 1,
    durationMin: Math.max(0, Math.round((finishedMs - Date.parse(input.startedAt)) / 60_000)),
    distanceM: input.distanceM,
    fieldsMeasured: fields.filter((f) => f.status === "measured").length,
    fieldsTotal: fields.length,
    farmCoverKgDmHa: farmCover === null ? null : Math.round(farmCover),
    farmCoverFieldCount: coverValues.length,
    farmCoverChange: farmCover !== null && previousCover !== null ? Math.round(farmCover - previousCover) : null,
    farmGrowthKgDmHaDay: farmGrowth === null ? null : Math.round(farmGrowth * 10) / 10,
    farmGrowthFieldCount: growthValues.length,
    fields,
  };
}

export type LngLat = [number, number];
export type LngLatBounds = [LngLat, LngLat];

export interface SurveyMapViewInput {
  /** Cleaned route (see `cleanSurveyTrack`). */
  route: ReadonlyArray<{ lat: number; lng: number }>;
  /** Where readings were taken. */
  readings: ReadonlyArray<{ lat: number; lng: number }>;
  fields: ReadonlyArray<{ id: string; ring: ReadonlyArray<readonly number[]> }>;
}

export interface SurveyMapView {
  bounds: LngLatBounds | null;
  /** Fields close enough to the walk to draw without shrinking it. */
  fieldIds: string[];
  /** Set when the walk is nowhere near any mapped field: how far away the nearest one is. */
  nearestFieldKm: number | null;
}

/** Fields further than this from the walk are left out of the view. */
const FIELD_VIEW_MARGIN_M = 300;

function boundsOf(points: ReadonlyArray<{ lat: number; lng: number }>): LngLatBounds | null {
  if (!points.length) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

/**
 * What a walk's map should show. The walk itself (route and reading spots)
 * sets the view; mapped fields are added only when they are near it, so a
 * distant out-farm (or a walk somewhere else entirely) never shrinks the
 * route to a dot. With no route or readings, the view is the farm's fields.
 */
export function surveyMapView(input: SurveyMapViewInput): SurveyMapView {
  const walk = [...input.route, ...input.readings];
  const fieldPoints = input.fields.map((f) => ({ id: f.id, points: f.ring.map((c) => ({ lng: c[0], lat: c[1] })) })).filter((f) => f.points.length > 0);
  const walkBounds = boundsOf(walk);
  if (!walkBounds) {
    return { bounds: boundsOf(fieldPoints.flatMap((f) => f.points)), fieldIds: fieldPoints.map((f) => f.id), nearestFieldKm: null };
  }
  const midLat = (walkBounds[0][1] + walkBounds[1][1]) / 2;
  const dLat = FIELD_VIEW_MARGIN_M / 111_320;
  const dLng = dLat / Math.max(0.01, Math.cos((midLat * Math.PI) / 180));
  const [[w, s], [e, n]] = walkBounds;
  const near = fieldPoints.filter((f) => {
    const b = boundsOf(f.points)!;
    return b[0][0] <= e + dLng && b[1][0] >= w - dLng && b[0][1] <= n + dLat && b[1][1] >= s - dLat;
  });
  let nearestFieldKm: number | null = null;
  if (!near.length && fieldPoints.length) {
    const cLat = (s + n) / 2, cLng = (w + e) / 2;
    const nearestM = Math.min(...fieldPoints.flatMap((f) => f.points.map((p) => haversineM(cLat, cLng, p.lat, p.lng))));
    nearestFieldKm = Math.round(nearestM / 100) / 10;
  }
  return {
    bounds: boundsOf([...walk, ...near.flatMap((f) => f.points)]),
    fieldIds: near.map((f) => f.id),
    nearestFieldKm,
  };
}
