/**
 * Parses AJM09's raw CSV body (`cso-fertiliser-client.ts`) into validated
 * rows. Server-only by association with its only caller
 * (`cso-fertiliser-sync.ts`) — no Node-only API used directly here, but
 * kept alongside the client rather than in `src/domain/` since it is
 * entirely about one external source's own wire format, not a domain
 * concept.
 *
 * The single most important property of this file: `rawValue` is NEVER
 * passed through `Number()`/`parseFloat`/unary `+`. Every VALUE cell
 * stays a plain JS string, split directly out of the CSV text, from here
 * all the way to `createMoneyAmount` in `cso-fertiliser-sync.ts` — the
 * exact decimal safety Phase 1 established for `MoneyAmount` construction
 * (`money.ts`'s own header: "no binary floating-point arithmetic may
 * occur during ingestion").
 *
 * Fails closed on structural change (brief §5): an unrecognised header
 * shape returns `status: "schema_unrecognised"` rather than guessing at a
 * changed API. A malformed *individual* row (wrong field count, unknown
 * STATISTIC code, unsupported UNIT, unparseable non-empty VALUE) is
 * rejected and counted, not silently dropped and not fatal to the whole
 * batch — UNLESS every row is rejected, which itself becomes
 * `schema_unrecognised` (a 100% rejection rate is itself evidence of an
 * unrecognised schema, not 2133 independently malformed rows).
 */

const EXPECTED_HEADER = ["STATISTIC", "Statistic Label", "TLIST(M1)", "Month", "C02069V02500", "Type of Fertiliser", "UNIT", "VALUE"];
const EXPECTED_STATISTIC_CODE = "AJM09C01";
const EXPECTED_UNIT = "Euro per Tonne";
const MONTH_CODE_PATTERN = /^\d{4}(0[1-9]|1[0-2])$/;
/** Matches the shape a real, unmodified AJM09 VALUE cell takes when
 * present — plain digits with an optional one decimal point, no sign
 * (fertiliser prices are never negative), no exponent. Intentionally
 * stricter than `money.ts`'s own canonical-decimal regex since this is
 * validating an *external* source's raw text, not an internal literal. */
const RAW_DECIMAL_VALUE_PATTERN = /^\d+(\.\d+)?$/;

export interface CsoFertiliserCsvRow {
  statistic: string;
  monthCode: string;
  referencePeriod: string;
  seriesCode: string;
  seriesLabel: string;
  unit: string;
  /** `{status:"present", raw: "645"}` — `raw` is the untouched CSV text,
   * never parsed to a number here. `{status:"missing"}` for a genuine
   * CSO-suppressed observation (empty VALUE cell) — this is NOT a €0
   * price; `cso-fertiliser-sync.ts` skips these rows entirely rather
   * than persisting a fabricated zero. */
  value: { status: "present"; raw: string } | { status: "missing" };
}

export type CsoFertiliserParseResult =
  | { status: "ok"; rows: CsoFertiliserCsvRow[]; rejectedRowCount: number; rejectedSamples: string[] }
  | { status: "schema_unrecognised"; reason: string };

/** Splits one CSV line into fields, honouring double-quoted fields
 * (AJM09's own format quotes every field) including an escaped `""`
 * inside a quoted field. Minimal — not a general CSV library — scoped to
 * exactly this dataset's own well-formed quoting. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function monthCodeToReferencePeriod(monthCode: string): string {
  return `${monthCode.slice(0, 4)}-${monthCode.slice(4, 6)}`;
}

export function parseCsoFertiliserCsv(rawBody: string): CsoFertiliserParseResult {
  // Strip a leading UTF-8 BOM — a genuine, live-confirmed detail of
  // AJM09's real response (see cso-fertiliser-client.real-fixtures.ts).
  const body = rawBody.charCodeAt(0) === 0xfeff ? rawBody.slice(1) : rawBody;
  const lines = body.split(/\r\n|\n/).filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { status: "schema_unrecognised", reason: "Empty response body." };
  }

  const header = splitCsvLine(lines[0]);
  if (header.length !== EXPECTED_HEADER.length || !header.every((col, i) => col === EXPECTED_HEADER[i])) {
    return {
      status: "schema_unrecognised",
      reason: `Unexpected CSV header — expected [${EXPECTED_HEADER.join(", ")}], got [${header.join(", ")}]. AJM09's structure may have changed; this pipeline does not guess at a new shape.`,
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length === 0) {
    return { status: "schema_unrecognised", reason: "CSV header present but no data rows." };
  }

  const rows: CsoFertiliserCsvRow[] = [];
  const rejectedSamples: string[] = [];
  let rejectedRowCount = 0;

  for (const line of dataLines) {
    const fields = splitCsvLine(line);
    if (fields.length !== EXPECTED_HEADER.length) {
      rejectedRowCount++;
      if (rejectedSamples.length < 5) rejectedSamples.push(`wrong field count (${fields.length}): ${line.slice(0, 120)}`);
      continue;
    }
    const [statistic, , monthCode, , seriesCode, seriesLabel, unit, rawValue] = fields;

    if (statistic !== EXPECTED_STATISTIC_CODE) {
      rejectedRowCount++;
      if (rejectedSamples.length < 5) rejectedSamples.push(`unexpected STATISTIC "${statistic}"`);
      continue;
    }
    if (!MONTH_CODE_PATTERN.test(monthCode)) {
      rejectedRowCount++;
      if (rejectedSamples.length < 5) rejectedSamples.push(`unexpected TLIST(M1) "${monthCode}"`);
      continue;
    }
    if (unit !== EXPECTED_UNIT) {
      rejectedRowCount++;
      if (rejectedSamples.length < 5) rejectedSamples.push(`unsupported UNIT "${unit}" for series "${seriesCode}"`);
      continue;
    }
    if (rawValue !== "" && !RAW_DECIMAL_VALUE_PATTERN.test(rawValue)) {
      rejectedRowCount++;
      if (rejectedSamples.length < 5) rejectedSamples.push(`unparseable VALUE "${rawValue}" for series "${seriesCode}" ${monthCode}`);
      continue;
    }

    rows.push({
      statistic,
      monthCode,
      referencePeriod: monthCodeToReferencePeriod(monthCode),
      seriesCode,
      seriesLabel,
      unit,
      value: rawValue === "" ? { status: "missing" } : { status: "present", raw: rawValue },
    });
  }

  if (rows.length === 0) {
    return {
      status: "schema_unrecognised",
      reason: `Every data row (${rejectedRowCount}) was rejected — treated as an unrecognised schema, not independently malformed data. Samples: ${rejectedSamples.join("; ")}`,
    };
  }

  return { status: "ok", rows, rejectedRowCount, rejectedSamples };
}

/** Extracts the dataset's own last-revised timestamp and revision-policy
 * note from the small JSON-stat metadata document — only `updated` (a
 * date string) and `extension.reasons` are read; never the `value` array
 * (see this module's header for why). Returns `null` fields, never
 * throws, on any unexpected metadata shape — this is non-critical
 * provenance enrichment, not required for a valid observation. */
export function parseCsoFertiliserMetadata(rawBody: string): { updatedAt: string | null; revisionReasons: string[] } {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null) return { updatedAt: null, revisionReasons: [] };
    const obj = parsed as Record<string, unknown>;
    const updatedAt = typeof obj.updated === "string" ? obj.updated : null;
    const extension = typeof obj.extension === "object" && obj.extension !== null ? (obj.extension as Record<string, unknown>) : {};
    const reasons = Array.isArray(extension.reasons) ? extension.reasons.filter((r): r is string => typeof r === "string") : [];
    return { updatedAt, revisionReasons: reasons };
  } catch {
    return { updatedAt: null, revisionReasons: [] };
  }
}
