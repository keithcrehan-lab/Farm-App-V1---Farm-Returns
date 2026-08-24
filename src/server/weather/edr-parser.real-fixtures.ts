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

/**
 * REAL MET ÉIREANN EDR RESPONSE — LIVE-FETCHED BY THIS RUNTIME.
 *
 * Unlike `VALENTIA_EMPTY_REAL_RESPONSE` above (externally captured and
 * supplied to a prior, network-blocked sandboxed session), this response
 * was fetched directly by this session, which has normal network egress:
 *
 *   GET https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min
 *     /locations/0018?datetime=2026-08-23T00:00:00Z/2026-08-24T00:00:00Z
 *     &f=CoverageJSON&parameter-name=precipitation_amount,air_temperature,
 *     relative_humidity,wind_speed,wind_direction,air_pressure,
 *     grass_temperature,soil_temperature_10cm
 *
 * HTTP 200, station Athenry (`custom.station_id: 18`), collection
 * `observations-swob-nrt-60min`, 25 real hourly readings per parameter
 * (2026-08-23T00:00 through 2026-08-24T00:00, inclusive) — exactly this
 * app's `DEFAULT_EDR_PARAMETER_NAMES` filter, confirming that filter's
 * real names all resolve on this collection. Values are pasted exactly
 * as returned, not rounded, trimmed, or otherwise adjusted. See
 * `docs/evidence-register.md` for the full write-up (including the
 * confirmed knots wind-speed unit and the `-99` missing-reading sentinel
 * documented in each parameter's own `description.en` text below —
 * neither happens to occur in this particular window, so the sentinel
 * handling itself is exercised by a separate, hand-built test case, not
 * this fixture).
 */
export const ATHENRY_LIVE_HOURLY_REAL_RESPONSE: CoverageJsonResponse = {
  type: "Coverage",
  domain: {
    type: "Domain",
    domainType: "PointSeries",
    axes: {
      x: { values: [-8.785556] },
      y: { values: [53.289167] },
      t: {
        values: [
          "2026-08-23T00:00:00+00:00",
          "2026-08-23T01:00:00+00:00",
          "2026-08-23T02:00:00+00:00",
          "2026-08-23T03:00:00+00:00",
          "2026-08-23T04:00:00+00:00",
          "2026-08-23T05:00:00+00:00",
          "2026-08-23T06:00:00+00:00",
          "2026-08-23T07:00:00+00:00",
          "2026-08-23T08:00:00+00:00",
          "2026-08-23T09:00:00+00:00",
          "2026-08-23T10:00:00+00:00",
          "2026-08-23T11:00:00+00:00",
          "2026-08-23T12:00:00+00:00",
          "2026-08-23T13:00:00+00:00",
          "2026-08-23T14:00:00+00:00",
          "2026-08-23T15:00:00+00:00",
          "2026-08-23T16:00:00+00:00",
          "2026-08-23T17:00:00+00:00",
          "2026-08-23T18:00:00+00:00",
          "2026-08-23T19:00:00+00:00",
          "2026-08-23T20:00:00+00:00",
          "2026-08-23T21:00:00+00:00",
          "2026-08-23T22:00:00+00:00",
          "2026-08-23T23:00:00+00:00",
          "2026-08-24T00:00:00+00:00",
        ],
      },
    },
    referencing: [
      { coordinates: ["x", "y"], system: { type: "GeographicCRS", id: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } },
      { coordinates: ["t"], system: { type: "TemporalRS", calendar: "Gregorian" } },
    ],
  },
  parameters: {
    precipitation_amount: {
      type: "Parameter",
      description: { en: "Total rainfall from RainA for the hour  -99 if no rain gauge" },
      observedProperty: { label: { en: "Total rainfall" } },
      unit: { label: { en: "mm" } },
    },
    air_temperature: {
      type: "Parameter",
      description: { en: "DryA 1-minute avg temperature at top of hour  -99 if no sensor" },
      observedProperty: { label: { en: "Air temperature" } },
      unit: { label: { en: "°C" } },
    },
    relative_humidity: {
      type: "Parameter",
      description: { en: "One minute average humidity from humidity sensor A  -99 if no sensor" },
      observedProperty: { label: { en: "Humidity" } },
      unit: { label: { en: "%RH" } },
    },
    wind_speed: {
      type: "Parameter",
      description: { en: "Average 3 second wind speed at the top of the hour  -99 if no sensor. Measured in knots" },
      observedProperty: { label: { en: "Wind speed" } },
      unit: { label: { en: "kts" } },
    },
    wind_direction: {
      type: "Parameter",
      description: { en: "Average 3 second wind direction at the top of the hour  -99 if no sensor. In degrees true  T." },
      observedProperty: { label: { en: "Wind Direction" } },
      unit: { label: { en: "Deg" } },
    },
    air_pressure: {
      type: "Parameter",
      description: { en: "One minute average pressure at top of hour  -99 if no sensor" },
      observedProperty: { label: { en: "Air pressure" } },
      unit: { label: { en: "hPa" } },
    },
    grass_temperature: {
      type: "Parameter",
      description: { en: "GrassA 1-minute avg temperature at top of hour  -99 if no sensor" },
      observedProperty: { label: { en: "Grass temperature" } },
      unit: { label: { en: "°C" } },
    },
    soil_temperature_10cm: {
      type: "Parameter",
      description: { en: "10cmA 1-minute avg temperature at top of hour  -99 if no sensor" },
      observedProperty: { label: { en: "Soil temperature at 10cm" } },
      unit: { label: { en: "°C" } },
    },
  },
  ranges: {
    precipitation_amount: {
      type: "NdArray",
      dataType: "float",
      axisNames: ["t"],
      shape: [25],
      values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    air_temperature: {
      type: "NdArray",
      dataType: "float",
      axisNames: ["t"],
      shape: [25],
      values: [
        12.2, 11.91, 11.9, 11.9, 11.85, 11.92, 12.09, 12.49, 13.22, 14.18, 15.18, 16.59, 16.68, 17.05, 17.14, 17.51,
        18.24, 17.66, 17.12, 15.28, 12.98, 11.58, 10.81, 10.42, 9.81,
      ],
    },
    relative_humidity: {
      type: "NdArray",
      dataType: "float",
      axisNames: ["t"],
      shape: [25],
      values: [
        87, 88.4, 89.7, 91.2, 90.9, 89.9, 89.4, 87.8, 84.2, 78.47, 75.83, 66.44, 59.6, 60.63, 60.91, 54.3, 53.41,
        55.71, 59.57, 63.88, 72.52, 78.11, 81.7, 83.3, 85.6,
      ],
    },
    wind_speed: {
      type: "NdArray",
      dataType: "float",
      axisNames: ["t"],
      shape: [25],
      values: [
        5.833, 3.333, 2.6, 1.467, 1.733, 3.133, 2.7, 2.3, 2.833, 5.1, 5.733, 7.033, 3.333, 7.167, 8.67, 6, 5.267,
        6.033, 3.833, 5.433, 4.633, 4.667, 3.967, 6.133, 4.167,
      ],
    },
    wind_direction: {
      type: "NdArray",
      dataType: "float",
      axisNames: ["t"],
      shape: [25],
      values: [
        316, 348.6, 343.4, 346.7, 7.626, 37.41, 66.32, 62.77, 61.63, 88, 97.1, 106.5, 155.2, 119.7, 91, 132.1, 90.8,
        77.11, 50.96, 60.97, 51.32, 66.07, 67.48, 69.05, 75.94,
      ],
    },
    air_pressure: {
      type: "NdArray",
      dataType: "float",
      axisNames: ["t"],
      shape: [25],
      values: [
        1022.83, 1022.71, 1022.698, 1022.443, 1021.987, 1022.023, 1022.165, 1022.462, 1022.508, 1022.435, 1022.302,
        1022.01, 1021.948, 1021.865, 1021.41, 1020.987, 1020.537, 1019.948, 1019.407, 1019.102, 1019.09, 1019.135,
        1018.895, 1018.583, 1018.198,
      ],
    },
    grass_temperature: {
      type: "NdArray",
      dataType: "float",
      axisNames: ["t"],
      shape: [25],
      values: [
        12.44, 12.72, 12.92, 12.82, 12.62, 12.46, 12.95, 14.63, 16.94, 19.6, 24.6, 31.8, 27.53, 26.87, 26.16, 26.38,
        32.03, 26.1, 18.66, 11.92, 8.04, 7.177, 6.499, 6.523, 6.04,
      ],
    },
    soil_temperature_10cm: {
      type: "NdArray",
      dataType: "float",
      axisNames: ["t"],
      shape: [25],
      values: [
        17.81, 17.42, 17.13, 16.88, 16.66, 16.45, 16.25, 16.11, 16.08, 16.2, 16.54, 17.21, 17.98, 18.53, 19.07, 19.53,
        20.01, 20.61, 20.65, 20.18, 19.32, 18.44, 17.65, 16.96, 16.33,
      ],
    },
  },
  custom: {
    collection_id: "observations-swob-nrt-60min",
    station_id: 18,
    station_name: "Athenry",
    parameter_names: [
      "precipitation_amount",
      "air_temperature",
      "relative_humidity",
      "wind_speed",
      "wind_direction",
      "air_pressure",
      "grass_temperature",
      "soil_temperature_10cm",
    ],
    links: [
      {
        href: "https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min/locations/18?parameter-name=precipitation_amount%2Cair_temperature%2Crelative_humidity%2Cwind_speed%2Cwind_direction%2Cair_pressure%2Cgrass_temperature%2Csoil_temperature_10cm&datetime=2026-08-23T00%3A00%3A00Z%2F2026-08-24T00%3A00%3A00Z&limit=2000&offset=0&f=covjson",
        rel: "self",
        type: "application/prs.coverage+json",
        title: "Timeseries (CovJSON)",
      },
      {
        href: "https://opendata2.met.ie/edr/collections/observations-swob-nrt-60min/locations/18?parameter-name=precipitation_amount%2Cair_temperature%2Crelative_humidity%2Cwind_speed%2Cwind_direction%2Cair_pressure%2Cgrass_temperature%2Csoil_temperature_10cm&datetime=2026-08-23T00%3A00%3A00Z%2F2026-08-24T00%3A00%3A00Z&limit=2000&offset=0",
        rel: "alternate",
        type: "application/json",
        title: "Timeseries (JSON)",
      },
    ],
    count_total: 200,
    numberReturned: 200,
    numberMatched: 200,
  },
};
