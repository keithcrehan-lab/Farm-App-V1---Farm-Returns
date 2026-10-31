import type { LivestockGroup } from "./types";

export const GRAZING_FIELD_PRESSURE_VERSION = "grazing_field_pressure_v1.0.0";

export interface GrazingFieldSession {
  id: string;
  farmId: string;
  livestockGroupId: string;
  fieldId: string;
  startedAt: string;
  endedAt?: string;
  headCountSnapshot: number;
  livestockCategorySnapshot: LivestockGroup["category"];
  livestockUnitsPerHeadSnapshot: number;
  source: string;
  recordedBy?: string;
  createdAt: string;
}

export interface FieldGrazingPressure {
  version: typeof GRAZING_FIELD_PRESSURE_VERSION;
  fieldId: string;
  status: "READY" | "NO_RECORDED_GRAZING" | "INCOMPLETE_TRACKING" | "INVALID_EVIDENCE";
  trackingStart?: string;
  asOf: string;
  trackingDays?: number;
  headDays?: number;
  livestockUnitDays?: number;
  averageStockingRateLUHa?: number;
  annualOrganicNStockingRateKgHa?: number;
  sourceSessionIds: string[];
  missingGroupIds: string[];
  limitations: string[];
}

const DAY_MS = 86_400_000;

/**
 * Teagasc Green Book 5th ed. (2020), Table 12-3 suckler calf-to-beef.
 * These are the published LU/ha and annual organic-N pairs used by the
 * grazing N/P/K tables. Keeping the pair explicit avoids deriving organic N
 * from the chemical-N recommendation or from the statutory NAP GSR.
 */
export const SUCKLER_CALF_TO_BEEF_LU_ORGANIC_N_ROWS = [
  { stockingRateLUHa: 1.0, organicNKgHa: 80 },
  { stockingRateLUHa: 1.25, organicNKgHa: 99 },
  { stockingRateLUHa: 1.5, organicNKgHa: 118 },
  { stockingRateLUHa: 1.75, organicNKgHa: 138 },
  { stockingRateLUHa: 2.0, organicNKgHa: 158 },
  { stockingRateLUHa: 2.25, organicNKgHa: 176 },
  { stockingRateLUHa: 2.5, organicNKgHa: 196 },
  { stockingRateLUHa: 2.75, organicNKgHa: 215 },
  { stockingRateLUHa: 3.0, organicNKgHa: 235 },
] as const;

function time(value: string): number {
  return Date.parse(value);
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function organicNStockingRateFromLUHa(stockRateLUHa: number): number | null {
  if (!Number.isFinite(stockRateLUHa) || stockRateLUHa < 0) return null;
  const rows = SUCKLER_CALF_TO_BEEF_LU_ORGANIC_N_ROWS;
  if (stockRateLUHa <= rows[0].stockingRateLUHa) return rows[0].organicNKgHa;
  const last = rows[rows.length - 1];
  if (stockRateLUHa >= last.stockingRateLUHa) return last.organicNKgHa;
  for (let i = 0; i < rows.length - 1; i += 1) {
    const lower = rows[i];
    const upper = rows[i + 1];
    if (stockRateLUHa >= lower.stockingRateLUHa && stockRateLUHa <= upper.stockingRateLUHa) {
      const fraction =
        (stockRateLUHa - lower.stockingRateLUHa) /
        (upper.stockingRateLUHa - lower.stockingRateLUHa);
      return lower.organicNKgHa + fraction * (upper.organicNKgHa - lower.organicNKgHa);
    }
  }
  return last.organicNKgHa;
}

function intersectionDays(
  session: GrazingFieldSession,
  fromMs: number,
  toMs: number,
): number {
  const start = Math.max(time(session.startedAt), fromMs);
  const end = Math.min(session.endedAt ? time(session.endedAt) : toMs, toMs);
  return Math.max(0, end - start) / DAY_MS;
}

function groupHasContinuousCoverage(
  sessions: readonly GrazingFieldSession[],
  groupId: string,
  fromMs: number,
  toMs: number,
): boolean {
  const intervals = sessions
    .filter((session) => session.livestockGroupId === groupId)
    .map((session) => ({
      start: Math.max(time(session.startedAt), fromMs),
      end: Math.min(session.endedAt ? time(session.endedAt) : toMs, toMs),
    }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  if (intervals.length === 0 || intervals[0].start > fromMs) return false;
  let coveredUntil = intervals[0].end;
  for (let i = 1; i < intervals.length; i += 1) {
    if (intervals[i].start > coveredUntil + 1) return false;
    coveredUntil = Math.max(coveredUntil, intervals[i].end);
  }
  return coveredUntil >= toMs - 1;
}

/**
 * Converts recorded field moves into an observed, field-specific stocking
 * pressure for the continuously tracked period only.
 *
 * It fails closed if any currently grazing group lacks continuous movement
 * history over the common tracking window. The statutory holding-level GSR is
 * deliberately outside this function and remains unchanged.
 */
export function calculateFieldGrazingPressure(args: {
  fieldId: string;
  fieldAreaHa: number;
  livestockGroups: readonly LivestockGroup[];
  sessions: readonly GrazingFieldSession[];
  seasonStart: string;
  asOf: string;
}): FieldGrazingPressure {
  const base: Pick<FieldGrazingPressure, "version" | "fieldId" | "asOf" | "sourceSessionIds" | "missingGroupIds" | "limitations"> = {
    version: GRAZING_FIELD_PRESSURE_VERSION,
    fieldId: args.fieldId,
    asOf: args.asOf,
    sourceSessionIds: [],
    missingGroupIds: [],
    limitations: [],
  };

  if (!finitePositive(args.fieldAreaHa)) {
    return { ...base, status: "INVALID_EVIDENCE", limitations: ["Field area must be greater than zero."] };
  }

  const seasonStartMs = time(args.seasonStart);
  const asOfMs = time(args.asOf);
  if (!Number.isFinite(seasonStartMs) || !Number.isFinite(asOfMs) || asOfMs <= seasonStartMs) {
    return { ...base, status: "INVALID_EVIDENCE", limitations: ["Invalid grazing-pressure time window."] };
  }

  const grazingGroups = args.livestockGroups.filter(
    (group) => group.system === "grazing" && group.count.value > 0,
  );
  if (grazingGroups.length === 0) {
    return { ...base, status: "NO_RECORDED_GRAZING" };
  }

  const validSessions = args.sessions.filter((session) => {
    const start = time(session.startedAt);
    const end = session.endedAt ? time(session.endedAt) : asOfMs;
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      finitePositive(session.headCountSnapshot) &&
      finitePositive(session.livestockUnitsPerHeadSnapshot)
    );
  });
  if (validSessions.length !== args.sessions.length) {
    return { ...base, status: "INVALID_EVIDENCE", limitations: ["One or more grazing sessions are malformed."] };
  }

  const firstByGroup = new Map<string, number>();
  for (const group of grazingGroups) {
    const starts = validSessions
      .filter((session) => session.livestockGroupId === group.id)
      .map((session) => Math.max(time(session.startedAt), seasonStartMs))
      .filter((value) => value < asOfMs);
    if (starts.length === 0) {
      base.missingGroupIds.push(group.id);
      continue;
    }
    firstByGroup.set(group.id, Math.min(...starts));
  }
  if (base.missingGroupIds.length > 0) {
    return {
      ...base,
      status: "INCOMPLETE_TRACKING",
      limitations: ["Every currently grazing group needs a recorded field location before field-specific stocking pressure can replace the holding-level fallback."],
    };
  }

  const trackingStartMs = Math.max(seasonStartMs, ...firstByGroup.values());
  if (trackingStartMs >= asOfMs) {
    return { ...base, status: "INCOMPLETE_TRACKING", limitations: ["The common grazing-tracking window has not started yet."] };
  }

  const missingCoverage = grazingGroups
    .filter((group) => !groupHasContinuousCoverage(validSessions, group.id, trackingStartMs, asOfMs))
    .map((group) => group.id);
  if (missingCoverage.length > 0) {
    return {
      ...base,
      status: "INCOMPLETE_TRACKING",
      trackingStart: new Date(trackingStartMs).toISOString(),
      missingGroupIds: missingCoverage,
      limitations: ["A gap in livestock-location history prevents field-specific grazing pressure from being used."],
    };
  }

  const fieldSessions = validSessions.filter(
    (session) => session.fieldId === args.fieldId && intersectionDays(session, trackingStartMs, asOfMs) > 0,
  );
  const trackingDays = (asOfMs - trackingStartMs) / DAY_MS;
  let headDays = 0;
  let livestockUnitDays = 0;
  for (const session of fieldSessions) {
    const days = intersectionDays(session, trackingStartMs, asOfMs);
    headDays += session.headCountSnapshot * days;
    livestockUnitDays +=
      session.headCountSnapshot *
      session.livestockUnitsPerHeadSnapshot *
      days;
  }

  const averageStockingRateLUHa = livestockUnitDays / (args.fieldAreaHa * trackingDays);
  const annualOrganicNStockingRateKgHa = organicNStockingRateFromLUHa(averageStockingRateLUHa);
  if (annualOrganicNStockingRateKgHa === null) {
    return { ...base, status: "INVALID_EVIDENCE", limitations: ["Could not translate the observed LU/ha into the published Table 12-3 organic-N scale."] };
  }

  return {
    ...base,
    status: "READY",
    trackingStart: new Date(trackingStartMs).toISOString(),
    trackingDays,
    headDays,
    livestockUnitDays,
    averageStockingRateLUHa,
    annualOrganicNStockingRateKgHa,
    sourceSessionIds: fieldSessions.map((session) => session.id).sort(),
    limitations: [
      "Field stocking pressure is annualised from the continuously recorded movement window; it is an agronomic demand input, not the statutory NAP grassland stocking rate.",
    ],
  };
}
