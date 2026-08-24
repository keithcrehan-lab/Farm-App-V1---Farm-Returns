/**
 * Parses Met Éireann's `metno-wdb2ts/locationforecast` XML response
 * (`weatherapi-0.4.xsd`) into this app's `ForecastPoint[]` schema.
 *
 * ✅ VERIFIED against a real, LIVE-fetched response (Co. Cork, this
 * farm's own coordinates — 2026-08-24, see `docs/evidence-register.md`
 * and `LOCATION_FORECAST_LIVE_REAL_RESPONSE` in
 * `forecast-parser.real-fixtures.ts`).
 *
 * Real, evidence-driven structure (not assumed from the XSD name alone):
 * each forecast timestamp is split across TWO separate `<time>` elements
 * that must be paired to form one usable point:
 *  - an INSTANT entry (`from === to`): temperature, wind, humidity,
 *    pressure, cloudiness, dewpoint, solar radiation, all AT that moment;
 *  - a WINDOW entry (`from < to`) whose `to` equals the instant entry's
 *    own timestamp: total precipitation accumulated OVER that preceding
 *    interval, plus a weather-symbol id — i.e. "rain that fell in the
 *    hour/3h/6h *leading up to* this timestamp," the same "ending at, not
 *    starting at" convention `edr-parser.ts` already found in Met
 *    Éireann's own hourly rainfall observations.
 * Pairing here is therefore done by WINDOW.to === INSTANT.from, not by
 * matching `from` values or list position (they are NOT adjacent by
 * `from`) — confirmed directly from the real captured response's own
 * ordering, not assumed from the schema name.
 *
 * The window's real interval width is itself evidence of forecast
 * resolution at that lead time (real, observed in the live response, per
 * data.gov.ie's own documented cadence): 1-hour windows out to ~90h,
 * 3-hour to ~144h, 6-hour beyond that — `windowStartIso` is kept on every
 * point precisely so a caller can see (and a UI can disclose) a coarser
 * window rather than silently presenting a 6-day-out 6-hour rainfall
 * total as if it were as precise as tomorrow's hourly one.
 *
 * `symbolId` (e.g. `"LightRainSun"`, `"Rain"`, `"PartlyCloud"`) is kept
 * as Met Éireann's own real string, never mapped to a icon/score here —
 * that mapping, if built, belongs in the UI layer with its own explicit,
 * reviewed vocabulary table, not invented inside the parser.
 */

import "server-only";
import { XMLParser } from "fast-xml-parser";

export interface ForecastPoint {
  /** The instant this point describes — always an INSTANT entry's own
   * timestamp, never a window's `from` or `to`. Always a FUTURE (or
   * current) timestamp, never assessed for "freshness" the way a past
   * observation is — see `extractForecastModelRuns` for the concept that
   * actually applies to a forecast: how recently the underlying model was
   * RUN, not how old each predicted point is. */
  validAt: string;
  airTemperatureC: number | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;
  windGustMps: number | null;
  humidityPct: number | null;
  pressureHPa: number | null;
  cloudinessPct: number | null;
  /** Total rainfall over the window ending at `validAt` — `null` when no
   * paired window entry was found, never 0. */
  rainfallMm: number | null;
  /** Start of the real rainfall window this reading covers — together
   * with `validAt` (the window's end) this tells a caller exactly how
   * wide (1h/3h/6h) this particular reading's window really is. `null`
   * whenever `rainfallMm` is. */
  rainfallWindowStartIso: string | null;
  /** Met Éireann's own real weather-symbol id for the window ending at
   * `validAt` (e.g. "Sun", "LightRainSun", "Rain") — not this app's
   * classification, kept verbatim. `null` when no paired window entry
   * was found. */
  symbolId: string | null;
  source: string;
  retrievedAt: string;
}

export interface ForecastModelRun {
  name: string;
  /** When this model run was issued — a PAST timestamp, the real anchor
   * for "how fresh is this forecast" (unlike any individual `validAt`,
   * which is future by design). */
  termin: string | null;
  runEnded: string | null;
  nextRun: string | null;
  /** The real [from, to] range of `<time>` entries this specific model
   * run actually supplies, per the response's own `<model>` metadata —
   * e.g. Harmonie covers the near term, EC the further-out tail. */
  coversFrom: string | null;
  coversTo: string | null;
}

/**
 * Reads the response's own `<model>` elements — real metadata about
 * which NWP model(s) produced this forecast and when each was run.
 * `docs/evidence-register.md` records the real models seen in the live
 * capture: `harmonie` (short-range) and three `ec_n1280_*` EC tiers
 * (progressively longer-range, coarser resolution). Never throws;
 * returns `[]` on an unparseable body.
 */
export function extractForecastModelRuns(xmlText: string): ForecastModelRun[] {
  try {
    const parsed = parser.parse(xmlText);
    const models = parsed?.weatherdata?.meta?.model;
    const list: Array<Record<string, string | undefined>> = Array.isArray(models) ? models : models ? [models] : [];
    return list.map((m) => ({
      name: m["@_name"] ?? "",
      termin: m["@_termin"] ?? null,
      runEnded: m["@_runended"] ?? null,
      nextRun: m["@_nextrun"] ?? null,
      coversFrom: m["@_from"] ?? null,
      coversTo: m["@_to"] ?? null,
    }));
  } catch {
    return [];
  }
}

export interface ForecastParseDiagnostics {
  instantEntryCount: number;
  windowEntryCount: number;
  /** Instant entries with no matching window (`to === from`) found —
   * real, not necessarily a bug (the very first live-fetched response
   * paired every instant), but worth surfacing rather than silently
   * leaving `rainfallMm`/`symbolId` null with no trace of why. */
  unpairedInstantTimestamps: string[];
}

export interface ForecastParseResult {
  points: ForecastPoint[];
  diagnostics: ForecastParseDiagnostics;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Always arrays, even with exactly one real element — a response with
  // only the very next hour available (short outage, edge of coverage)
  // must not silently collapse to a single object and break every
  // `.map()`/`.find()` below.
  isArray: (name) => name === "time",
});

function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

interface RawTimeEntry {
  "@_from": string;
  "@_to": string;
  location?: {
    temperature?: { "@_value"?: string };
    windDirection?: { "@_deg"?: string };
    windSpeed?: { "@_mps"?: string };
    windGust?: { "@_mps"?: string };
    humidity?: { "@_value"?: string };
    pressure?: { "@_value"?: string };
    cloudiness?: { "@_percent"?: string };
    precipitation?: { "@_value"?: string };
    symbol?: { "@_id"?: string };
  };
}

/**
 * Never throws — a malformed/unexpected XML body (including one that
 * isn't XML at all) degrades to zero points with diagnostics, exactly
 * like `edr-parser.ts`'s handling of an unexpected response shape.
 */
export function parseLocationForecastResponse(
  xmlText: string,
  context: { source: string; retrievedAt: string },
): ForecastParseResult {
  let times: RawTimeEntry[] = [];
  try {
    const parsed = parser.parse(xmlText);
    times = parsed?.weatherdata?.product?.time ?? [];
  } catch {
    // Not well-formed XML — fall through with times = [], never throw.
  }

  const instants = times.filter((t) => t["@_from"] === t["@_to"]);
  const windows = times.filter((t) => t["@_from"] !== t["@_to"]);
  const windowByEndTime = new Map(windows.map((w) => [w["@_to"], w]));

  const unpairedInstantTimestamps: string[] = [];

  const points: ForecastPoint[] = instants.map((instant) => {
    const validAt = instant["@_from"];
    const loc = instant.location;
    const window = windowByEndTime.get(validAt);
    if (!window) unpairedInstantTimestamps.push(validAt);
    const windowLoc = window?.location;

    return {
      validAt,
      airTemperatureC: toNumberOrNull(loc?.temperature?.["@_value"]),
      windSpeedMps: toNumberOrNull(loc?.windSpeed?.["@_mps"]),
      windDirectionDeg: toNumberOrNull(loc?.windDirection?.["@_deg"]),
      windGustMps: toNumberOrNull(loc?.windGust?.["@_mps"]),
      humidityPct: toNumberOrNull(loc?.humidity?.["@_value"]),
      pressureHPa: toNumberOrNull(loc?.pressure?.["@_value"]),
      cloudinessPct: toNumberOrNull(loc?.cloudiness?.["@_percent"]),
      rainfallMm: window ? toNumberOrNull(windowLoc?.precipitation?.["@_value"]) : null,
      rainfallWindowStartIso: window ? window["@_from"] : null,
      symbolId: window ? (windowLoc?.symbol?.["@_id"] ?? null) : null,
      source: context.source,
      retrievedAt: context.retrievedAt,
    };
  });

  // Sort by time — the real response interleaves instant/window entries
  // rather than listing instants in order, so the parsed points aren't
  // naturally sorted without this.
  points.sort((a, b) => a.validAt.localeCompare(b.validAt));

  return {
    points,
    diagnostics: {
      instantEntryCount: instants.length,
      windowEntryCount: windows.length,
      unpairedInstantTimestamps,
    },
  };
}
