/**
 * A hand-built fixture matching the real `weatherapi-0.4.xsd` shape
 * `forecast-parser.ts` was verified against (see
 * `LOCATION_FORECAST_LIVE_REAL_RESPONSE` in `forecast-parser.real-fixtures.ts`
 * for the genuine captured response) — used to exercise structural edge
 * cases a 44-entry real excerpt doesn't conveniently cover: an instant
 * entry with no paired window, and a single small, easy-to-hand-verify
 * pair.
 */

export const MINIMAL_FORECAST_FIXTURE = `<weatherdata xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://www.met.ie/Open_Data/weatherapi-0.4.xsd" created="2026-08-24T17:00:00Z">
   <meta>
      <model name="harmonie" termin="2026-08-24T12:00:00Z" runended="2026-08-24T15:34:41Z" nextrun="2026-08-24T22:00:00Z" from="2026-08-24T18:00:00Z" to="2026-08-26T18:00:00Z" />
   </meta>
   <product class="pointData">
      <time datatype="forecast" from="2026-08-24T18:00:00Z" to="2026-08-24T18:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="19.0"/>
            <windDirection id="dd" deg="81.3" name="E"/>
            <windSpeed id="ff" mps="3.9" beaufort="3" name="Gentle breeze"/>
            <humidity value="53.2" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1014.8"/>
            <cloudiness id="NN" percent="100.0"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T17:00:00Z" to="2026-08-24T18:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.2" minvalue="0.1" maxvalue="0.3" probability="28.6"/>
<symbol id="LightRain" number="9"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T19:00:00Z" to="2026-08-24T19:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="18.5"/>
         </location>
      </time>
   </product>
</weatherdata>`;
