/**
 * REAL MET ÉIREANN EDR RESPONSE — CAPTURED EXTERNALLY.
 *
 * This is a genuine primary-source Met Éireann EDR CoverageJSON
 * response, NOT a hand-built approximation (contrast
 * `ATHENRY_HOURLY_FIXTURE` in `edr-parser.fixtures.ts`, which is
 * hand-built and explicitly labelled as such). It was captured
 * externally, from `observations-swob-nrt-10min`, station 102
 * (Valentia Observatory) — this sandboxed session has never fetched it
 * and has no outbound network access to `opendata2.met.ie` (confirmed
 * repeatedly — see `edr-client.ts`). It was supplied to this project
 * already captured, exactly as pasted below.
 *
 * This particular response happens to return ZERO observations for the
 * requested window (`domain.axes.t.values: []`,
 * `custom.count_total/numberReturned/numberMatched: 0`) — a genuine
 * empty result, not a fixture limitation. That absence of data is
 * itself the point of this fixture: it proves the parser handles a real
 * zero-observation response by returning an explicit empty observation
 * list, not by throwing, not by inventing data, and specifically not by
 * treating "no reading returned" as "rainfall was 0mm" (see
 * `edr-parser.test.ts`'s "real Met Éireann response" tests).
 *
 * `ranges` in the response as actually captured/supplied to this
 * project contains only one entry, `air_pressure_max` (also an empty
 * NdArray). The accompanying task description states the original
 * external capture had an empty range object for every one of the 21
 * `parameters` entries, not just this one — but only this one range
 * entry was actually supplied to this project in reproducible form, so
 * only this one is included here. The other 20 are deliberately NOT
 * backfilled with an assumed-identical empty-NdArray shape: this
 * project's standing rule is to record evidence exactly as given, never
 * to complete a pattern on its behalf, even where the missing entries
 * would almost certainly look the same.
 *
 * NONE of these 21 parameters is a rainfall parameter — see this
 * fixture's own `parameters`/`custom.parameter_names` below. This
 * response does not, and cannot, verify Met Éireann's real rainfall
 * parameter name or unit; both remain UNVERIFIED (see
 * `docs/evidence-register.md`).
 */

import type { CoverageJsonResponse } from "./edr-parser";

export const VALENTIA_EMPTY_REAL_RESPONSE: CoverageJsonResponse = {
  type: "Coverage",
  domain: {
    type: "Domain",
    domainType: "PointSeries",
    axes: {
      x: { values: [-10.240833] },
      y: { values: [51.938333] },
      t: { values: [] },
    },
    referencing: [
      {
        coordinates: ["x", "y"],
        system: { type: "GeographicCRS", id: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
      },
      { coordinates: ["t"], system: { type: "TemporalRS", calendar: "Gregorian" } },
    ],
  },
  parameters: {
    air_pressure_max: {
      type: "Parameter",
      description: { en: "Max pressure over previous 10 minutes  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum air pressure" } },
      unit: { label: { en: "hPa" } },
    },
    air_pressure_min: {
      type: "Parameter",
      description: { en: "Min pressure over previous 10 minutes  -99 if no sensor" },
      observedProperty: { label: { en: "Minimum air pressure" } },
      unit: { label: { en: "hPa" } },
    },
    air_temperature_max: {
      type: "Parameter",
      description: { en: "Ten minute max of DryA  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum air temperature" } },
      unit: { label: { en: "°C" } },
    },
    air_temperature_min: {
      type: "Parameter",
      description: { en: "Ten minute min of DryA  -99 if no sensor" },
      observedProperty: { label: { en: "Air temperature" } },
      unit: { label: { en: "°C" } },
    },
    grass_temperature_max: {
      type: "Parameter",
      description: { en: "Ten minute max of GrassA  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum grass temperature" } },
      unit: { label: { en: "°C" } },
    },
    grass_temperature_min: {
      type: "Parameter",
      description: { en: "Ten minute min of GrassA  -99 if no sensor" },
      observedProperty: { label: { en: "Grass temperature" } },
      unit: { label: { en: "°C" } },
    },
    relative_humidity_max: {
      type: "Parameter",
      description: { en: "Ten minute max of HumA  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum humidity" } },
      unit: { label: { en: "%RH" } },
    },
    relative_humidity_min: {
      type: "Parameter",
      description: { en: "Ten minute min of HumA  -99 if no sensor" },
      observedProperty: { label: { en: "Minimum humidity" } },
      unit: { label: { en: "%RH" } },
    },
    soil_temperature_100cm_max: {
      type: "Parameter",
      description: { en: "Ten minute max of 100cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum soil temperature at 100cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_100cm_min: {
      type: "Parameter",
      description: { en: "Ten minute min of 100cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Soil temperature at 100cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_10cm_max: {
      type: "Parameter",
      description: { en: "Ten minute max of 10cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum soil temperature at 10cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_10cm_min: {
      type: "Parameter",
      description: { en: "Ten minute min of 10cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Soil temperature at 10cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_20cm_max: {
      type: "Parameter",
      description: { en: "Ten minute max of 20cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum soil temperature at 20cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_20cm_min: {
      type: "Parameter",
      description: { en: "Ten minute min of 20cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Soil temperature at 20cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_30cm_max: {
      type: "Parameter",
      description: { en: "Ten minute max of 30cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum soil temperature at 30cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_30cm_min: {
      type: "Parameter",
      description: { en: "Ten minute min of 30cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Soil temperature at 30cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_50cm_max: {
      type: "Parameter",
      description: { en: "Ten minute max of 50cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum soil temperature at 50cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_50cm_min: {
      type: "Parameter",
      description: { en: "Ten minute min of 50cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Soil temperature at 50cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_5cm_max: {
      type: "Parameter",
      description: { en: "Ten minute max of 5cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Maximum soil temperature at 5cm" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_5cm_min: {
      type: "Parameter",
      description: { en: "Ten minute min of 5cmA  -99 if no sensor" },
      observedProperty: { label: { en: "Soil temperature at 5cm" } },
      unit: { label: { en: "°C" } },
    },
    visibility: {
      type: "Parameter",
      description: { en: "Ten minute visibility possible values 0 - 50000" },
      observedProperty: { label: { en: "Visibility" } },
      unit: { label: { en: "m" } },
    },
  },
  ranges: {
    air_pressure_max: { type: "NdArray", dataType: "float", axisNames: ["t"], shape: [0], values: [] },
  },
  custom: {
    collection_id: "observations-swob-nrt-10min",
    station_id: 102,
    station_name: "Valentia Observatory",
    parameter_names: [
      "air_pressure_max",
      "air_pressure_min",
      "air_temperature_max",
      "air_temperature_min",
      "grass_temperature_max",
      "grass_temperature_min",
      "relative_humidity_max",
      "relative_humidity_min",
      "soil_temperature_100cm_max",
      "soil_temperature_100cm_min",
      "soil_temperature_10cm_max",
      "soil_temperature_10cm_min",
      "soil_temperature_20cm_max",
      "soil_temperature_20cm_min",
      "soil_temperature_30cm_max",
      "soil_temperature_30cm_min",
      "soil_temperature_50cm_max",
      "soil_temperature_50cm_min",
      "soil_temperature_5cm_max",
      "soil_temperature_5cm_min",
      "visibility",
    ],
    links: [
      {
        href: "https://opendata2.met.ie/edr/collections/observations-swob-nrt-10min/locations/102?datetime=2026-04-24T08%3A00%3A00Z%2F2026-04-24T09%3A00%3A00Z&limit=2000&offset=0&f=covjson",
        rel: "self",
        type: "application/prs.coverage+json",
        title: "Timeseries (CovJSON)",
      },
      {
        href: "https://opendata2.met.ie/edr/collections/observations-swob-nrt-10min/locations/102?datetime=2026-04-24T08%3A00%3A00Z%2F2026-04-24T09%3A00%3A00Z&limit=2000&offset=0",
        rel: "alternate",
        type: "application/json",
        title: "Timeseries (JSON)",
      },
    ],
    count_total: 0,
    numberReturned: 0,
    numberMatched: 0,
  },
};
