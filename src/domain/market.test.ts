import { describe, expect, it } from "vitest";
import {
  CSO_AGRI_INPUT_PRICE_INDEX,
  CSO_AGRI_OUTPUT_PRICE_INDEX,
  CSO_BULLOCKS_300_349KG,
  CSO_HEIFERS_300_349KG,
  agriPriceSqueezeRatio,
  averageSeries,
  latestPoint,
  trailing12MonthRange,
  trendPct,
  weanlingPriceSeries,
} from "./market";

describe("latestPoint", () => {
  it("returns the most recent real CSO observation (Jun 2026)", () => {
    expect(latestPoint(CSO_BULLOCKS_300_349KG)).toEqual({ month: "2026-06", value: 1308.04 });
  });
});

describe("trendPct", () => {
  it("computes month-over-month % change from the real series (May→Jun 2026)", () => {
    const pct = trendPct(CSO_BULLOCKS_300_349KG);
    expect(pct).toBeCloseTo(((1308.04 - 1342.26) / 1342.26) * 100, 5);
    expect(pct).toBeLessThan(0);
  });

  it("computes a 12-month-back trend when asked", () => {
    const pct = trendPct(CSO_BULLOCKS_300_349KG, 12);
    // Jun 2025 (1292.59) -> Jun 2026 (1308.04): still up year-on-year even
    // though the market has cooled since its spring-2025 peak.
    expect(pct).toBeCloseTo(((1308.04 - 1292.59) / 1292.59) * 100, 5);
    expect(pct).toBeGreaterThan(0);
  });

  it("returns 0 for an empty or single-point series rather than throwing", () => {
    expect(trendPct([])).toBe(0);
    expect(trendPct([{ month: "2026-06", value: 100 }])).toBe(0);
  });
});

describe("trailing12MonthRange", () => {
  it("returns the real min/max over the last 12 real months, not the full 24", () => {
    const { low, high } = trailing12MonthRange(CSO_BULLOCKS_300_349KG);
    // Trailing 12 months (Jul 2025-Jun 2026): min is the Jun 2026 print
    // (1308.04), max is the Aug 2025 print (1480.09) — the Feb/Mar 2025
    // values (which are lower still) fall outside this window and must
    // not leak in.
    expect(low).toBe(1308.04);
    expect(high).toBe(1480.09);
  });
});

describe("averageSeries / weanlingPriceSeries", () => {
  it("pairwise-averages two real month-aligned series", () => {
    const avg = averageSeries(CSO_BULLOCKS_300_349KG, CSO_HEIFERS_300_349KG);
    expect(avg[0]).toEqual({ month: "2024-07", value: (766.57 + 748.96) / 2 });
    expect(avg).toHaveLength(24);
  });

  it("blends Bullocks and Heifers 300-349kg for the sex-unrecorded weanling group", () => {
    const series = weanlingPriceSeries();
    const latest = latestPoint(series);
    expect(latest.month).toBe("2026-06");
    expect(latest.value).toBeCloseTo((1308.04 + 1256.86) / 2, 5);
  });
});

describe("agriPriceSqueezeRatio", () => {
  it("computes real output/input index ratio *100, showing the 2026 squeeze", () => {
    const ratio = agriPriceSqueezeRatio();
    const latest = latestPoint(ratio);
    expect(latest.month).toBe("2026-06");
    expect(latest.value).toBeCloseTo((142.8 / 137.35) * 100, 5);
  });

  it("shows the ratio falling from its spring-2025 peak to Jun 2026 (real cost-price squeeze)", () => {
    const ratio = agriPriceSqueezeRatio();
    const peak = ratio.find((p) => p.month === "2025-04")!;
    const latest = latestPoint(ratio);
    // Real data: output index peaked Apr 2025 (171.63) while input index
    // was still climbing gently — by Jun 2026 output has fallen back and
    // input has spiked on fertiliser costs, so the ratio is materially
    // lower than its 2025 peak.
    expect(latest.value).toBeLessThan(peak.value);
  });

  it("defaults to the real CSO output/input index constants when called with no args", () => {
    const withDefaults = agriPriceSqueezeRatio();
    const withExplicitArgs = agriPriceSqueezeRatio(CSO_AGRI_OUTPUT_PRICE_INDEX, CSO_AGRI_INPUT_PRICE_INDEX);
    expect(withDefaults).toEqual(withExplicitArgs);
  });
});

describe("embedded CSO series integrity", () => {
  it("every series covers the full real 24-month window, Jul 2024-Jun 2026", () => {
    for (const series of [
      CSO_BULLOCKS_300_349KG,
      CSO_HEIFERS_300_349KG,
      CSO_AGRI_OUTPUT_PRICE_INDEX,
      CSO_AGRI_INPUT_PRICE_INDEX,
    ]) {
      expect(series).toHaveLength(24);
      expect(series[0].month).toBe("2024-07");
      expect(series[series.length - 1].month).toBe("2026-06");
    }
  });
});
