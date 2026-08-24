/**
 * A hand-built fixture matching the documented OGC EDR / CoverageJSON
 * `PointSeries` response shape (https://covjson.org) — used only to test
 * `parseEdrObservationsResponse` against a structurally valid response.
 *
 * This is NOT a captured real Met Éireann response. This environment
 * cannot reach `opendata2.met.ie` to capture one (confirmed — see
 * `edr-client.ts`). The parameter keys used here (`"rainfall"`,
 * `"temperature"`, …) are this fixture's own choice from
 * `EDR_PARAMETER_ALIASES`'s first candidate for each field — real Met
 * Éireann keys may differ, which is exactly what
 * `EdrParseResult.diagnostics` exists to surface once a real response is
 * available to compare against.
 */

import type { CoverageJsonResponse } from "./edr-parser";

export const ATHENRY_HOURLY_FIXTURE: CoverageJsonResponse = {
  type: "Coverage",
  domain: {
    domainType: "PointSeries",
    axes: {
      t: {
        values: ["2026-04-23T00:00:00Z", "2026-04-23T01:00:00Z", "2026-04-23T02:00:00Z"],
      },
    },
  },
  parameters: {
    rainfall: { unit: { symbol: "mm" }, observedProperty: { label: { en: "Rainfall" } } },
    temperature: { unit: { symbol: "Cel" }, observedProperty: { label: { en: "Air Temperature" } } },
    // A parameter this fixture deliberately doesn't map, to exercise
    // `unmatchedRangeKeys` — real responses may well include readings
    // this app's schema has no field for yet.
    visibility: { unit: { symbol: "m" }, observedProperty: { label: { en: "Visibility" } } },
  },
  ranges: {
    rainfall: { axisNames: ["t"], shape: [3], values: [0, 0.2, null] },
    temperature: { axisNames: ["t"], shape: [3], values: [8.1, 7.9, 7.6] },
    visibility: { axisNames: ["t"], shape: [3], values: [35000, 32000, 30000] },
  },
};
