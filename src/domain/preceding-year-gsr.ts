/**
 * Season-bound evidence for the LESS stocking-rate trigger.
 *
 * S.I. 588/2025 Art. 19(1)(b) / `rules_statutory/less_requirements_2026.csv`
 * `LESS_GSR_100`: Low Emission Slurry Spreading is required where the
 * holding's grassland stocking rate from grazing-livestock manure in the
 * PREVIOUS calendar year was 100 kg N/ha or more, before exports. The
 * current herd record (`calculateStatutoryGrasslandStockingRateKgHa`) is a
 * different year's figure and can never stand in for it: a herd destocked
 * since last year would hide an obligation that still applies.
 *
 * The only source is an explicit, provenanced record of the preceding
 * year's figure (typically the DAFM Nitrates Statement / Annual Fertiliser
 * Statement). For an application in year Y the record for Y-1 is required;
 * a record for any other year never applies. No record, an invalid record
 * or tied records that disagree leave the trigger UNRESOLVED — a non-LESS
 * method then stays unresolved, never permitted.
 */

export const PRECEDING_YEAR_GSR_VERSION = "preceding_year_gsr_v1.1.1";

export const PRECEDING_YEAR_GSR_RULE = {
  ruleId: "LESS_GSR_100_PRECEDING_YEAR",
  legislation: "S.I. No. 588/2025, Article 19(1)(b); rules_statutory/less_requirements_2026.csv LESS_GSR_100",
  text: "Previous-year grassland stocking rate from grazing livestock manure of 100 kg N/ha or more, prior to export, requires Low Emission Slurry Spreading.",
} as const;

export type PrecedingYearGsrStatus = "farmer_adjusted" | "verified";

export interface PrecedingYearGsrRecord {
  id: string;
  /** The calendar year the stocking rate describes (YYYY). */
  referenceYear: string;
  /** Grazing-livestock organic N per ha of grassland, before exports. */
  gsrKgNHa: number;
  status: PrecedingYearGsrStatus;
  /** Where the figure came from, e.g. "DAFM Nitrates Statement 2026". */
  source: string;
  recordedAt: string;
  recordedBy?: string;
  /** Database-assigned insertion order of a `farm_preceding_year_gsr_records`
   * row (`20261103135704_preceding_year_gsr_record_order.sql`): strictly
   * increasing and unique, the authoritative "later" key. Absent on legacy
   * records (JSON on `farms`, or rows inserted before that migration). */
  recordOrder?: number;
}

export interface NewPrecedingYearGsrInput {
  referenceYear: string;
  gsrKgNHa: number;
  status: PrecedingYearGsrStatus;
  source: string;
}

export type PrecedingYearGsrResolution =
  | {
      status: "RESOLVED";
      referenceYear: string;
      gsrKgNHa: number;
      evidenceStatus: PrecedingYearGsrStatus;
      source: string;
      recordedAt: string;
      recordId: string;
      /** How "latest" was decided: the database insertion order, or the
       * lower-authority recorded time of legacy records. */
      orderBasis: "DATABASE_RECORD_ORDER" | "LEGACY_RECORDED_AT";
      version: typeof PRECEDING_YEAR_GSR_VERSION;
    }
  | {
      status: "UNRESOLVED";
      referenceYear: string | undefined;
      reasonCode:
        | "PRECEDING_YEAR_GSR_NOT_RECORDED"
        | "PRECEDING_YEAR_GSR_CONFLICT"
        | "PRECEDING_YEAR_GSR_INVALID"
        | "APPLICATION_DATE_INVALID";
      version: typeof PRECEDING_YEAR_GSR_VERSION;
    };

function isYear(value: string): boolean {
  return /^\d{4}$/.test(value);
}

function isValidRecord(record: PrecedingYearGsrRecord): boolean {
  return (
    isYear(record.referenceYear) &&
    Number.isFinite(record.gsrKgNHa) &&
    record.gsrKgNHa >= 0 &&
    (record.status === "farmer_adjusted" || record.status === "verified") &&
    record.source.trim().length > 0 &&
    !Number.isNaN(Date.parse(record.recordedAt))
  );
}

export function validateNewPrecedingYearGsrInput(input: NewPrecedingYearGsrInput, today: string): string[] {
  const issues: string[] = [];
  if (!isYear(input.referenceYear)) issues.push("REFERENCE_YEAR_INVALID");
  // A statement can only exist for a year that has already ended.
  else if (input.referenceYear >= today.slice(0, 4)) issues.push("REFERENCE_YEAR_NOT_COMPLETE");
  if (!Number.isFinite(input.gsrKgNHa) || input.gsrKgNHa < 0 || input.gsrKgNHa > 1000) issues.push("GSR_INVALID");
  if (input.status !== "farmer_adjusted" && input.status !== "verified") issues.push("STATUS_INVALID");
  if (input.source.trim().length === 0) issues.push("SOURCE_REQUIRED");
  return issues;
}

function hasRecordOrder(record: PrecedingYearGsrRecord): boolean {
  return record.recordOrder !== undefined;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Days since 1970-01-01 of a proleptic Gregorian civil date (H. Hinnant's
 * days_from_civil), so no component is ever normalised by `Date`. */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** A legacy `recordedAt` as a precision-preserving instant: whole epoch
 * seconds plus the fractional digits as written (up to PostgreSQL's
 * microseconds and beyond), so `.123100` and `.123900` stay distinct where
 * `Date.parse` would collapse both to one millisecond. Accepts the ISO
 * (`T`, `Z`/`±HH:MM`) and PostgreSQL (` `, `±HH`/`±HHMM`) forms these
 * timestamps originate in. Every component is validated before any
 * arithmetic — month lengths and leap years, hour 00–23, minute and second
 * 00–59 (no leap second), 1–9 fractional digits, an explicit zone with an
 * offset of at most ±14:00 — so an impossible time is never normalised into
 * a plausible one. Anything else, including a zoneless local time, has no
 * trustworthy order and yields `undefined`. */
function legacyInstant(recordedAt: string): { seconds: number; fraction: string } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?)$/.exec(recordedAt);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s, fraction = "", utc, sign, offH, offM = "00"] = match;
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, s].map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  let offsetMinutes = 0;
  if (utc === undefined) {
    const [oh, om] = [Number(offH), Number(offM)];
    if (om > 59 || oh * 60 + om > 14 * 60) return undefined;
    offsetMinutes = (sign === "-" ? -1 : 1) * (oh * 60 + om);
  }
  const seconds = daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offsetMinutes * 60;
  return { seconds, fraction: fraction.padEnd(9, "0") };
}

function compareLegacyInstants(a: { seconds: number; fraction: string }, b: { seconds: number; fraction: string }): number {
  if (a.seconds !== b.seconds) return a.seconds - b.seconds;
  return a.fraction < b.fraction ? -1 : a.fraction > b.fraction ? 1 : 0;
}

/** The preceding-year stocking rate that governs an application on
 * `applicationDate` (YYYY-MM-DD). Records are append-only; the latest
 * record for the reference year applies.
 *
 * "Latest" is the database insertion order (`recordOrder`) whenever any
 * record for the year carries one — it is unique and strictly increasing,
 * so two corrections inserted within the same millisecond are still
 * ordered and never tie. Ordered records are always later than unordered
 * ones (the legacy JSON column is no longer written, and unordered table
 * rows predate the order column). Every order for the year must be a
 * positive safe integer, unique across the year's ordered records, or the
 * whole year fails closed. Only when no record has an order does the
 * lower-authority fallback apply: the latest `recordedAt`, compared at its
 * full written precision. Records at the genuinely same instant that differ
 * in value, status or source are a conflict; an untrustworthy timestamp
 * fails closed. */
export function resolvePrecedingYearGsr(
  records: readonly PrecedingYearGsrRecord[],
  applicationDate: string,
): PrecedingYearGsrResolution {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(applicationDate))
    return { status: "UNRESOLVED", referenceYear: undefined, reasonCode: "APPLICATION_DATE_INVALID", version: PRECEDING_YEAR_GSR_VERSION };
  const referenceYear = String(Number(applicationDate.slice(0, 4)) - 1);
  const forYear = records.filter((record) => record.referenceYear === referenceYear);
  if (forYear.length === 0)
    return { status: "UNRESOLVED", referenceYear, reasonCode: "PRECEDING_YEAR_GSR_NOT_RECORDED", version: PRECEDING_YEAR_GSR_VERSION };
  const invalid = { status: "UNRESOLVED", referenceYear, reasonCode: "PRECEDING_YEAR_GSR_INVALID", version: PRECEDING_YEAR_GSR_VERSION } as const;

  const ordered = forYear.filter(hasRecordOrder);
  if (ordered.length > 0) {
    const orders = ordered.map((record) => record.recordOrder as number);
    // The database order is a positive, unique sequence value; anything
    // else — zero, negative, fractional or any duplicate — is not database
    // evidence.
    if (!orders.every((order) => Number.isSafeInteger(order) && order > 0)) return invalid;
    if (new Set(orders).size !== orders.length) return invalid;
    const latestOrder = Math.max(...orders);
    const latest = ordered.find((record) => record.recordOrder === latestOrder) as PrecedingYearGsrRecord;
    if (!isValidRecord(latest)) return invalid;
    return resolved(referenceYear, latest, "DATABASE_RECORD_ORDER");
  }

  const timed = forYear.map((record) => ({ record, at: legacyInstant(record.recordedAt) }));
  if (timed.some(({ at }) => at === undefined)) return invalid;
  const instants = timed as { record: PrecedingYearGsrRecord; at: { seconds: number; fraction: string } }[];
  const latestAt = instants.reduce((max, { at }) => (compareLegacyInstants(at, max) > 0 ? at : max), instants[0].at);
  const latest = instants.filter(({ at }) => compareLegacyInstants(at, latestAt) === 0).map(({ record }) => record);
  if (!latest.every(isValidRecord)) return invalid;
  // Only fully equivalent evidence may be tie-broken by id.
  if (new Set(latest.map((record) => JSON.stringify([record.gsrKgNHa, record.status, record.source]))).size > 1)
    return { status: "UNRESOLVED", referenceYear, reasonCode: "PRECEDING_YEAR_GSR_CONFLICT", version: PRECEDING_YEAR_GSR_VERSION };
  const record = [...latest].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  return resolved(referenceYear, record, "LEGACY_RECORDED_AT");
}

function resolved(
  referenceYear: string,
  record: PrecedingYearGsrRecord,
  orderBasis: "DATABASE_RECORD_ORDER" | "LEGACY_RECORDED_AT",
): PrecedingYearGsrResolution {
  return {
    status: "RESOLVED",
    referenceYear,
    gsrKgNHa: record.gsrKgNHa,
    evidenceStatus: record.status,
    source: record.source,
    recordedAt: record.recordedAt,
    recordId: record.id,
    orderBasis,
    version: PRECEDING_YEAR_GSR_VERSION,
  };
}
