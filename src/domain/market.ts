/**
 * Cattle/fertiliser price trend + agri price-index engine — Phase 4/7's
 * "CSO cashflow/revenue engine" gap, built from the "Farm Return Gap
 * Closure Data v5" workbook the user supplied (sheets `CSO_Cattle_24m`
 * [dataset AJM01], `CSO_Fertiliser_24m` [AJM09], `CSO_Indices_24m`
 * [AHM05]) — evidence class A-OFFICIAL, source CSO, 24 real monthly
 * observations Jul 2024–Jun 2026. See docs/evidence-register.md.
 *
 * Scope, deliberately narrower than "cashflow": the workbook's own README
 * names this gap's app use as "Trend, seasonality, low/base/high
 * scenarios" and flags "Historical observations are not forecasts." There
 * is no real per-farm sales/cost *timing* calendar anywhere in this data
 * model (which animal group sells in which month, at what weight) — so
 * building a real MONTHLY cashflow curve would mean inventing that
 * calendar, which CLAUDE.md's "never invent a number" rule forbids. This
 * module instead does exactly what the real data supports: real trend
 * statistics (latest observed price, month-over-month change, trailing
 * 12-month low/base/high range) for the specific cattle weight-bands and
 * fertiliser products this farm's own groups/inputs actually match, plus
 * a real agricultural output-vs-input price-index comparison (a genuine
 * "cost-price squeeze" indicator). `mockCashflow`'s monthly farm-margin
 * curve and `mockFinanceSummary.totalRevenueEur` are untouched — both
 * still need a real sales-calendar data source this workbook doesn't
 * supply, and are documented as such in README.md.
 *
 * Only the weight-band/product categories this farm's real groups and
 * market-price rows actually use are embedded here — not the full
 * ~14-category cattle table or ~27-category fertiliser table the source
 * data contains. That keeps every embedded series traceable to a real
 * on-screen consumer rather than being a speculative full data dump.
 */

import type { MarketPrice } from "./types";

export const MARKET_ENGINE_VERSION = "market_engine_v1.0.0";

export interface TimeSeriesPoint {
  /** "YYYY-MM", calendar month the observation covers. */
  month: string;
  value: number;
}

export const CSO_CATTLE_SOURCE_URL =
  "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM01/CSV/1.0/en";
export const CSO_FERTILISER_SOURCE_URL =
  "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en";
export const CSO_INDICES_SOURCE_URL =
  "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AHM05/CSV/1.0/en";

// ---------------------------------------------------------------------------
// CSO AJM01 — Monthly Cattle Prices per Head (€/head, live mart), 24 months.
// ---------------------------------------------------------------------------

/**
 * Closest CSO weight band to this farm's real Weanlings group
 * (mock-farm.ts's "lg-weanlings", avgWeightKg 335) — no `sex` is recorded
 * for that group, so `weanlingPriceSeries()` below averages this with the
 * matching Heifers band rather than guessing a sex mix.
 */
export const CSO_BULLOCKS_300_349KG: TimeSeriesPoint[] = [
  { month: "2024-07", value: 766.57 },
  { month: "2024-08", value: 760.91 },
  { month: "2024-09", value: 763.21 },
  { month: "2024-10", value: 796.68 },
  { month: "2024-11", value: 873.25 },
  { month: "2024-12", value: 927.94 },
  { month: "2025-01", value: 1003.89 },
  { month: "2025-02", value: 1056.7 },
  { month: "2025-03", value: 1129.51 },
  { month: "2025-04", value: 1195.67 },
  { month: "2025-05", value: 1323.04 },
  { month: "2025-06", value: 1292.59 },
  { month: "2025-07", value: 1407.17 },
  { month: "2025-08", value: 1480.09 },
  { month: "2025-09", value: 1366.83 },
  { month: "2025-10", value: 1427.3 },
  { month: "2025-11", value: 1398.16 },
  { month: "2025-12", value: 1310 },
  { month: "2026-01", value: 1394.33 },
  { month: "2026-02", value: 1401.57 },
  { month: "2026-03", value: 1363.37 },
  { month: "2026-04", value: 1337.7 },
  { month: "2026-05", value: 1342.26 },
  { month: "2026-06", value: 1308.04 },
];

export const CSO_HEIFERS_300_349KG: TimeSeriesPoint[] = [
  { month: "2024-07", value: 748.96 },
  { month: "2024-08", value: 764.39 },
  { month: "2024-09", value: 751.54 },
  { month: "2024-10", value: 771.78 },
  { month: "2024-11", value: 841.63 },
  { month: "2024-12", value: 902.33 },
  { month: "2025-01", value: 960.86 },
  { month: "2025-02", value: 1076.42 },
  { month: "2025-03", value: 1121.67 },
  { month: "2025-04", value: 1177.12 },
  { month: "2025-05", value: 1287.4 },
  { month: "2025-06", value: 1304.79 },
  { month: "2025-07", value: 1378.9 },
  { month: "2025-08", value: 1471.5 },
  { month: "2025-09", value: 1336.49 },
  { month: "2025-10", value: 1402.27 },
  { month: "2025-11", value: 1342.65 },
  { month: "2025-12", value: 1300.6 },
  { month: "2026-01", value: 1324.07 },
  { month: "2026-02", value: 1344.01 },
  { month: "2026-03", value: 1313.61 },
  { month: "2026-04", value: 1286.68 },
  { month: "2026-05", value: 1252.76 },
  { month: "2026-06", value: 1256.86 },
];

/**
 * Closest CSO weight band to the mock "Store bullock (400kg)" market-price
 * row (mock-farm.ts's `mp-store`) — this farm has no live group at this
 * weight, so it's kept as a general store-cattle price reference only.
 */
export const CSO_BULLOCKS_400_449KG: TimeSeriesPoint[] = [
  { month: "2024-07", value: 1012.39 },
  { month: "2024-08", value: 1051.94 },
  { month: "2024-09", value: 1049.03 },
  { month: "2024-10", value: 1091.95 },
  { month: "2024-11", value: 1160.45 },
  { month: "2024-12", value: 1205.09 },
  { month: "2025-01", value: 1315.15 },
  { month: "2025-02", value: 1392.03 },
  { month: "2025-03", value: 1523.96 },
  { month: "2025-04", value: 1582.37 },
  { month: "2025-05", value: 1639.76 },
  { month: "2025-06", value: 1605.26 },
  { month: "2025-07", value: 1711.65 },
  { month: "2025-08", value: 1813.19 },
  { month: "2025-09", value: 1738.17 },
  { month: "2025-10", value: 1770.5 },
  { month: "2025-11", value: 1750.5 },
  { month: "2025-12", value: 1669.88 },
  { month: "2026-01", value: 1659.01 },
  { month: "2026-02", value: 1653.49 },
  { month: "2026-03", value: 1623.01 },
  { month: "2026-04", value: 1635.17 },
  { month: "2026-05", value: 1585.32 },
  { month: "2026-06", value: 1567.62 },
];

// ---------------------------------------------------------------------------
// CSO AJM09 — Monthly Fertiliser Prices (€/tonne), 24 months.
// ---------------------------------------------------------------------------

/** Exact product match to the mock "18-6-12" market-price row. */
export const CSO_COMPOUND_18_6_12: TimeSeriesPoint[] = [
  { month: "2024-07", value: 480 },
  { month: "2024-08", value: 475 },
  { month: "2024-09", value: 475 },
  { month: "2024-10", value: 475 },
  { month: "2024-11", value: 476 },
  { month: "2024-12", value: 477 },
  { month: "2025-01", value: 487 },
  { month: "2025-02", value: 503 },
  { month: "2025-03", value: 526 },
  { month: "2025-04", value: 543 },
  { month: "2025-05", value: 539 },
  { month: "2025-06", value: 534 },
  { month: "2025-07", value: 541 },
  { month: "2025-08", value: 540 },
  { month: "2025-09", value: 543 },
  { month: "2025-10", value: 543 },
  { month: "2025-11", value: 542 },
  { month: "2025-12", value: 541 },
  { month: "2026-01", value: 542 },
  { month: "2026-02", value: 553 },
  { month: "2026-03", value: 622 },
  { month: "2026-04", value: 644 },
  { month: "2026-05", value: 651 },
  { month: "2026-06", value: 651 },
];

/**
 * Near match, not exact, to the mock "Protected Urea (46-0-0)" row: CSO
 * AJM09 tracks generic urea, not specifically stabilised/protected urea.
 * Same nutrient content (46% N) and the dominant driver of urea's own
 * price, so used as the real price series with that caveat surfaced.
 */
export const CSO_UREA_46N: TimeSeriesPoint[] = [
  { month: "2024-07", value: 465 },
  { month: "2024-08", value: 459 },
  { month: "2024-09", value: 457 },
  { month: "2024-10", value: 458 },
  { month: "2024-11", value: 458 },
  { month: "2024-12", value: 461 },
  { month: "2025-01", value: 471 },
  { month: "2025-02", value: 484 },
  { month: "2025-03", value: 536 },
  { month: "2025-04", value: 558 },
  { month: "2025-05", value: 545 },
  { month: "2025-06", value: 537 },
  { month: "2025-07", value: 548 },
  { month: "2025-08", value: 549 },
  { month: "2025-09", value: 551 },
  { month: "2025-10", value: 551 },
  { month: "2025-11", value: 546 },
  { month: "2025-12", value: 541 },
  { month: "2026-01", value: 541 },
  { month: "2026-02", value: 562 },
  { month: "2026-03", value: 665 },
  { month: "2026-04", value: 754 },
  { month: "2026-05", value: 759 },
  { month: "2026-06", value: 748 },
];

/** Exact product match to the mock "0-7-30" market-price row. */
export const CSO_COMPOUND_0_7_30: TimeSeriesPoint[] = [
  { month: "2024-07", value: 503 },
  { month: "2024-08", value: 497 },
  { month: "2024-09", value: 490 },
  { month: "2024-10", value: 491 },
  { month: "2024-11", value: 491 },
  { month: "2024-12", value: 498 },
  { month: "2025-01", value: 505 },
  { month: "2025-02", value: 508 },
  { month: "2025-03", value: 516 },
  { month: "2025-04", value: 521 },
  { month: "2025-05", value: 518 },
  { month: "2025-06", value: 514 },
  { month: "2025-07", value: 516 },
  { month: "2025-08", value: 518 },
  { month: "2025-09", value: 521 },
  { month: "2025-10", value: 521 },
  { month: "2025-11", value: 521 },
  { month: "2025-12", value: 523 },
  { month: "2026-01", value: 523 },
  { month: "2026-02", value: 525 },
  { month: "2026-03", value: 553 },
  { month: "2026-04", value: 568 },
  { month: "2026-05", value: 569 },
  { month: "2026-06", value: 570 },
];

// ---------------------------------------------------------------------------
// CSO AHM05 — Core Agricultural Input/Output Price Indices (Base 2020=100).
// ---------------------------------------------------------------------------

export const CSO_AGRI_OUTPUT_PRICE_INDEX: TimeSeriesPoint[] = [
  { month: "2024-07", value: 142.02 },
  { month: "2024-08", value: 143.44 },
  { month: "2024-09", value: 148.52 },
  { month: "2024-10", value: 149.72 },
  { month: "2024-11", value: 152.52 },
  { month: "2024-12", value: 154.32 },
  { month: "2025-01", value: 158.65 },
  { month: "2025-02", value: 163.46 },
  { month: "2025-03", value: 167.09 },
  { month: "2025-04", value: 171.63 },
  { month: "2025-05", value: 170.21 },
  { month: "2025-06", value: 168.54 },
  { month: "2025-07", value: 166.54 },
  { month: "2025-08", value: 165.22 },
  { month: "2025-09", value: 160.24 },
  { month: "2025-10", value: 156.3 },
  { month: "2025-11", value: 153.08 },
  { month: "2025-12", value: 147.11 },
  { month: "2026-01", value: 148.25 },
  { month: "2026-02", value: 148.02 },
  { month: "2026-03", value: 145.78 },
  { month: "2026-04", value: 146.57 },
  { month: "2026-05", value: 144.88 },
  { month: "2026-06", value: 142.8 },
];

export const CSO_AGRI_INPUT_PRICE_INDEX: TimeSeriesPoint[] = [
  { month: "2024-07", value: 125.4 },
  { month: "2024-08", value: 124.74 },
  { month: "2024-09", value: 123.75 },
  { month: "2024-10", value: 123.15 },
  { month: "2024-11", value: 123.76 },
  { month: "2024-12", value: 123.94 },
  { month: "2025-01", value: 125.96 },
  { month: "2025-02", value: 126.91 },
  { month: "2025-03", value: 127.95 },
  { month: "2025-04", value: 128.31 },
  { month: "2025-05", value: 128.03 },
  { month: "2025-06", value: 127.75 },
  { month: "2025-07", value: 128.46 },
  { month: "2025-08", value: 128.27 },
  { month: "2025-09", value: 127.87 },
  { month: "2025-10", value: 127.85 },
  { month: "2025-11", value: 127.91 },
  { month: "2025-12", value: 127.9 },
  { month: "2026-01", value: 128.4 },
  { month: "2026-02", value: 128.96 },
  { month: "2026-03", value: 135.23 },
  { month: "2026-04", value: 138.43 },
  { month: "2026-05", value: 138.03 },
  { month: "2026-06", value: 137.35 },
];

// ---------------------------------------------------------------------------
// Trend statistics — generic over any of the series above.
// ---------------------------------------------------------------------------

export function latestPoint(series: TimeSeriesPoint[]): TimeSeriesPoint {
  return series[series.length - 1];
}

/**
 * % change of the latest observation vs the one `monthsBack` months earlier
 * in the same series (default 1 = month-over-month, matching the single
 * step the mock `MarketPrice.changePct` field already displays).
 */
export function trendPct(series: TimeSeriesPoint[], monthsBack = 1): number {
  const latest = series[series.length - 1];
  const prior = series[series.length - 1 - monthsBack];
  if (!latest || !prior || prior.value === 0) return 0;
  return ((latest.value - prior.value) / prior.value) * 100;
}

/**
 * Trailing 12-month low/high — a real "scenario range" derived directly
 * from what this price has actually done over the last year, not an
 * invented forecast band (the source workbook's own "low/base/high
 * scenarios" framing, with "base" left as the latest real observation).
 */
export function trailing12MonthRange(series: TimeSeriesPoint[]): { low: number; high: number } {
  const window = series.slice(-12);
  const values = window.map((p) => p.value);
  return { low: Math.min(...values), high: Math.max(...values) };
}

/** Pairwise average of two same-length, same-month-aligned series. */
export function averageSeries(a: TimeSeriesPoint[], b: TimeSeriesPoint[]): TimeSeriesPoint[] {
  return a.map((point, i) => ({ month: point.month, value: (point.value + b[i].value) / 2 }));
}

/**
 * This farm's real Weanlings group (mock-farm.ts "lg-weanlings") has no
 * recorded `sex`, so this blends the two closest CSO weight-band series
 * (Bullocks + Heifers 300-349kg, both bracketing the group's real
 * avgWeightKg of 335) rather than assuming a sex mix that isn't recorded.
 */
export function weanlingPriceSeries(): TimeSeriesPoint[] {
  return averageSeries(CSO_BULLOCKS_300_349KG, CSO_HEIFERS_300_349KG);
}

/**
 * Real cost-price squeeze indicator: agricultural output price index vs
 * input price index, both Base 2020=100. A falling ratio means input
 * costs are eating into output prices faster than the reverse — this
 * farm's own 24-month window shows exactly that shift (output prices
 * peaked ~Apr 2025 and have fallen since, while input prices jumped
 * sharply from Feb 2026 as fertiliser prices spiked — see
 * CSO_COMPOUND_18_6_12 and CSO_UREA_46N above over the same months).
 */
export function agriPriceSqueezeRatio(
  outputIndex: TimeSeriesPoint[] = CSO_AGRI_OUTPUT_PRICE_INDEX,
  inputIndex: TimeSeriesPoint[] = CSO_AGRI_INPUT_PRICE_INDEX,
): TimeSeriesPoint[] {
  return outputIndex.map((point, i) => ({
    month: point.month,
    value: (point.value / inputIndex[i].value) * 100,
  }));
}

// ---------------------------------------------------------------------------
// Wiring into the mock MarketPrice list (src/data/mock-farm.ts).
// ---------------------------------------------------------------------------
// Only rows this real data genuinely matches are overridden — everything
// else (Beef/Heifer per-kg carcass grid, Feed ingredients) stays the mock
// Bord Bia/CSO figure it already was, since no real per-kg-carcass or
// feed-ingredient series exists in this workbook.

export interface RealMarketPriceOverride {
  price: number;
  changePct: number;
  asOf: string;
  status: "estimated" | "verified";
  range: { low: number; high: number };
}

function overrideFromSeries(
  series: TimeSeriesPoint[],
  status: "estimated" | "verified",
): RealMarketPriceOverride {
  const latest = latestPoint(series);
  const range = trailing12MonthRange(series);
  return {
    price: Math.round(latest.value),
    changePct: Math.round(trendPct(series) * 10) / 10,
    asOf: `${latest.month}-01`,
    status,
    range: { low: Math.round(range.low), high: Math.round(range.high) },
  };
}

/** Keyed by the mock `MarketPrice.id` each real series genuinely matches. */
export function realMarketPriceOverridesById(): Record<string, RealMarketPriceOverride> {
  return {
    // Blended Bullocks+Heifers 300-349kg — "estimated" because Farm Return
    // combines two official series (sex not recorded for this farm's group).
    "mp-weanling": overrideFromSeries(weanlingPriceSeries(), "estimated"),
    // Single official CSO series each — "verified".
    "mp-store": overrideFromSeries(CSO_BULLOCKS_400_449KG, "verified"),
    "mp-1861-12": overrideFromSeries(CSO_COMPOUND_18_6_12, "verified"),
    "mp-urea": overrideFromSeries(CSO_UREA_46N, "verified"),
    "mp-0-7-30": overrideFromSeries(CSO_COMPOUND_0_7_30, "verified"),
  };
}

/**
 * Applies the real overrides above onto a mock `MarketPrice[]` list,
 * matched by id — rows with no real match pass through unchanged. Source
 * label stays "CSO" (already what the mock rows carried for these ids).
 */
export function withRealMarketPrices(mockPrices: MarketPrice[]): MarketPrice[] {
  const overrides = realMarketPriceOverridesById();
  return mockPrices.map((p) => {
    const o = overrides[p.id];
    if (!o) return p;
    return { ...p, price: o.price, changePct: o.changePct, asOf: o.asOf, status: o.status, range: o.range };
  });
}
