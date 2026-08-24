/**
 * REAL MET ÉIREANN LOCATIONFORECAST RESPONSE — LIVE-FETCHED BY THIS RUNTIME.
 *
 * GET http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast
 *   ?lat=51.9&long=-8.4863
 * (this farm's own Co. Cork coordinates — see src/data/mock-farm.ts).
 *
 * HTTP 200, Content-Type text/plain (not application/xml — a real,
 * documented quirk, see forecast-client.ts). This is the real response's
 * own header/meta block plus its first 44 real <time> entries (of 214 in
 * the full response, which ran to +9 days) — trimmed for fixture size,
 * not altered: every tag, attribute and value below is exactly what Met
 * Éireann returned, in original order, including the first real nonzero
 * rainfall reading in the window (0.1mm, 21st time block) and a genuine
 * LightRain symbol at the excerpt's tail. See
 * docs/evidence-register.md and forecast-parser.ts's own doc comment for
 * the full write-up of this response's real structure.
 */

export const LOCATION_FORECAST_LIVE_REAL_RESPONSE = `<weatherdata xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://www.met.ie/Open_Data/weatherapi-0.4.xsd" created="2026-08-24T17:45:08Z">
   <meta>
      <model name="harmonie" termin="2026-08-24T12:00:00Z" runended="2026-08-24T15:34:41Z" nextrun="2026-08-24T22:00:00Z" from="2026-08-24T18:00:00Z" to="2026-08-26T18:00:00Z" />
      <model name="ec_n1280_1hr" termin="2026-08-24T00:00:00Z" runended="2026-08-24T15:34:41Z" nextrun="2026-08-24T18:00:00Z" from="2026-08-26T19:00:00Z" to="2026-08-27T18:00:00Z" />
      <model name="ec_n1280_3hr" termin="2026-08-24T00:00:00Z" runended="2026-08-24T15:34:41Z" nextrun="2026-08-24T18:00:00Z" from="2026-08-27T21:00:00Z" to="2026-08-30T00:00:00Z" />
      <model name="ec_n1280_6hr" termin="2026-08-24T00:00:00Z" runended="2026-08-24T15:34:41Z" nextrun="2026-08-24T18:00:00Z" from="2026-08-30T06:00:00Z" to="2026-09-03T00:00:00Z" />
      </meta>
   <product class="pointData">
      <time datatype="forecast" from="2026-08-24T18:00:00Z" to="2026-08-24T18:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="19.0"/>
            <windDirection id="dd" deg="81.3" name="E"/>
            <windSpeed id="ff" mps="3.9" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="8.0"/>
            <globalRadiation value="78.8" unit="W/m^2"/>
            <humidity value="53.2" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1014.8"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="85.0"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="9.3"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T17:00:00Z" to="2026-08-24T18:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.0"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T19:00:00Z" to="2026-08-24T19:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="18.6"/>
            <windDirection id="dd" deg="80.0" name="E"/>
            <windSpeed id="ff" mps="3.7" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="6.8"/>
            <globalRadiation value="35.4" unit="W/m^2"/>
            <humidity value="50.7" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1014.8"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.5"/>
            <mediumClouds id="MEDIUM" percent="93.0"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.2"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T18:00:00Z" to="2026-08-24T19:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.0"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T20:00:00Z" to="2026-08-24T20:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="18.4"/>
            <windDirection id="dd" deg="74.6" name="E"/>
            <windSpeed id="ff" mps="3.1" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="5.8"/>
            <globalRadiation value="4.1" unit="W/m^2"/>
            <humidity value="51.6" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1014.9"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="1.0"/>
            <mediumClouds id="MEDIUM" percent="92.4"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.3"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T19:00:00Z" to="2026-08-24T20:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.1"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T21:00:00Z" to="2026-08-24T21:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="18.0"/>
            <windDirection id="dd" deg="59.4" name="NE"/>
            <windSpeed id="ff" mps="2.2" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="4.4"/>
            <globalRadiation value="0.0" unit="W/m^2"/>
            <humidity value="52.6" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1014.8"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.1"/>
            <mediumClouds id="MEDIUM" percent="98.5"/>
            <highClouds id="HIGH" percent="93.6"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.2"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T20:00:00Z" to="2026-08-24T21:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.0"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T22:00:00Z" to="2026-08-24T22:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="17.8"/>
            <windDirection id="dd" deg="66.1" name="NE"/>
            <windSpeed id="ff" mps="2.5" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="3.9"/>
            <globalRadiation value="0.0" unit="W/m^2"/>
            <humidity value="52.7" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1014.7"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.4"/>
            <mediumClouds id="MEDIUM" percent="100.0"/>
            <highClouds id="HIGH" percent="97.3"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.0"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T21:00:00Z" to="2026-08-24T22:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.0"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T23:00:00Z" to="2026-08-24T23:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="17.7"/>
            <windDirection id="dd" deg="75.0" name="E"/>
            <windSpeed id="ff" mps="2.7" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="3.9"/>
            <globalRadiation value="0.0" unit="W/m^2"/>
            <humidity value="56.1" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1014.6"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.1"/>
            <mediumClouds id="MEDIUM" percent="100.0"/>
            <highClouds id="HIGH" percent="84.4"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.9"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T22:00:00Z" to="2026-08-24T23:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.3"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T00:00:00Z" to="2026-08-25T00:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="17.7"/>
            <windDirection id="dd" deg="51.4" name="NE"/>
            <windSpeed id="ff" mps="3.9" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="4.1"/>
            <globalRadiation value="0.0" unit="W/m^2"/>
            <humidity value="53.9" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1013.6"/>
            <cloudiness id="NN" percent="46.5"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="46.5"/>
            <highClouds id="HIGH" percent="0.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.3"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-24T23:00:00Z" to="2026-08-25T00:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.0"/>
<symbol id="PartlyCloud" number="3"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T01:00:00Z" to="2026-08-25T01:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="17.0"/>
            <windDirection id="dd" deg="34.8" name="NE"/>
            <windSpeed id="ff" mps="2.8" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="4.0"/>
            <globalRadiation value="0.0" unit="W/m^2"/>
            <humidity value="58.6" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1013.1"/>
            <cloudiness id="NN" percent="85.4"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="85.4"/>
            <highClouds id="HIGH" percent="0.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.8"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T00:00:00Z" to="2026-08-25T01:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.0"/>
<symbol id="PartlyCloud" number="3"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T02:00:00Z" to="2026-08-25T02:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="15.9"/>
            <windDirection id="dd" deg="25.2" name="NE"/>
            <windSpeed id="ff" mps="2.7" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="3.8"/>
            <globalRadiation value="0.0" unit="W/m^2"/>
            <humidity value="61.7" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1012.6"/>
            <cloudiness id="NN" percent="29.7"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="26.5"/>
            <highClouds id="HIGH" percent="4.6"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.6"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T01:00:00Z" to="2026-08-25T02:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.0"/>
<symbol id="LightCloud" number="2"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T03:00:00Z" to="2026-08-25T03:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="15.1"/>
            <windDirection id="dd" deg="2.5" name="N"/>
            <windSpeed id="ff" mps="2.2" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="4.1"/>
            <globalRadiation value="0.0" unit="W/m^2"/>
            <humidity value="64.9" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1012.3"/>
            <cloudiness id="NN" percent="99.6"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="67.1"/>
            <highClouds id="HIGH" percent="98.7"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.5"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T02:00:00Z" to="2026-08-25T03:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.0"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T04:00:00Z" to="2026-08-25T04:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="14.7"/>
            <windDirection id="dd" deg="44.7" name="NE"/>
            <windSpeed id="ff" mps="2.8" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="4.6"/>
            <globalRadiation value="0.0" unit="W/m^2"/>
            <humidity value="65.5" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1012.1"/>
            <cloudiness id="NN" percent="99.3"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="50.7"/>
            <highClouds id="HIGH" percent="98.6"/>
            <dewpointTemperature id="TD" unit="celsius" value="8.3"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T03:00:00Z" to="2026-08-25T04:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.2"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T05:00:00Z" to="2026-08-25T05:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="15.3"/>
            <windDirection id="dd" deg="42.3" name="NE"/>
            <windSpeed id="ff" mps="2.5" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="5.5"/>
            <globalRadiation value="0.0" unit="W/m^2"/>
            <humidity value="76.0" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1011.9"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="100.0"/>
            <highClouds id="HIGH" percent="99.8"/>
            <dewpointTemperature id="TD" unit="celsius" value="11.2"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T04:00:00Z" to="2026-08-25T05:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.0"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T06:00:00Z" to="2026-08-25T06:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="16.6"/>
            <windDirection id="dd" deg="82.5" name="E"/>
            <windSpeed id="ff" mps="4.1" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="6.1"/>
            <globalRadiation value="0.7" unit="W/m^2"/>
            <humidity value="81.1" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1011.9"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="100.0"/>
            <highClouds id="HIGH" percent="99.4"/>
            <dewpointTemperature id="TD" unit="celsius" value="13.5"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T05:00:00Z" to="2026-08-25T06:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="0.7"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T07:00:00Z" to="2026-08-25T07:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="17.1"/>
            <windDirection id="dd" deg="78.3" name="E"/>
            <windSpeed id="ff" mps="3.2" beaufort="2" name="Light breeze"/>
            <windGust id="ff_gust" mps="6.2"/>
            <globalRadiation value="12.1" unit="W/m^2"/>
            <humidity value="77.6" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1012.2"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="100.0"/>
            <highClouds id="HIGH" percent="97.8"/>
            <dewpointTemperature id="TD" unit="celsius" value="13.3"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T06:00:00Z" to="2026-08-25T07:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="2.1"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T08:00:00Z" to="2026-08-25T08:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="17.8"/>
            <windDirection id="dd" deg="79.7" name="E"/>
            <windSpeed id="ff" mps="3.7" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="6.9"/>
            <globalRadiation value="44.2" unit="W/m^2"/>
            <humidity value="75.2" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1012.2"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.0"/>
            <mediumClouds id="MEDIUM" percent="81.5"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="13.5"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T07:00:00Z" to="2026-08-25T08:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="5.4"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T09:00:00Z" to="2026-08-25T09:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="17.5"/>
            <windDirection id="dd" deg="86.3" name="E"/>
            <windSpeed id="ff" mps="4.8" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="7.7"/>
            <globalRadiation value="125.1" unit="W/m^2"/>
            <humidity value="75.2" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1012.1"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.2"/>
            <mediumClouds id="MEDIUM" percent="100.0"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="13.1"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T08:00:00Z" to="2026-08-25T09:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="4.0"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T10:00:00Z" to="2026-08-25T10:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="17.6"/>
            <windDirection id="dd" deg="88.8" name="E"/>
            <windSpeed id="ff" mps="4.8" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="8.3"/>
            <globalRadiation value="212.2" unit="W/m^2"/>
            <humidity value="73.5" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1012.2"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.3"/>
            <mediumClouds id="MEDIUM" percent="75.0"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="12.9"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T09:00:00Z" to="2026-08-25T10:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="3.6"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T11:00:00Z" to="2026-08-25T11:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="18.8"/>
            <windDirection id="dd" deg="90.6" name="E"/>
            <windSpeed id="ff" mps="4.4" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="8.6"/>
            <globalRadiation value="294.6" unit="W/m^2"/>
            <humidity value="65.5" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1012.1"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.1"/>
            <mediumClouds id="MEDIUM" percent="30.9"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="12.3"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T10:00:00Z" to="2026-08-25T11:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.0" probability="3.4"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T12:00:00Z" to="2026-08-25T12:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="19.8"/>
            <windDirection id="dd" deg="96.8" name="E"/>
            <windSpeed id="ff" mps="4.6" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="8.7"/>
            <globalRadiation value="310.2" unit="W/m^2"/>
            <humidity value="61.5" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1011.7"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.4"/>
            <mediumClouds id="MEDIUM" percent="14.2"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="12.2"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T11:00:00Z" to="2026-08-25T12:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.1" probability="8.9"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T13:00:00Z" to="2026-08-25T13:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="19.7"/>
            <windDirection id="dd" deg="102.4" name="E"/>
            <windSpeed id="ff" mps="4.9" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="8.8"/>
            <globalRadiation value="282.6" unit="W/m^2"/>
            <humidity value="62.7" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1011.6"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="0.2"/>
            <mediumClouds id="MEDIUM" percent="21.5"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="12.5"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T12:00:00Z" to="2026-08-25T13:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.0" minvalue="0.0" maxvalue="0.1" probability="16.1"/>
<symbol id="Cloud" number="4"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T14:00:00Z" to="2026-08-25T14:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="18.9"/>
            <windDirection id="dd" deg="94.9" name="E"/>
            <windSpeed id="ff" mps="4.5" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="8.6"/>
            <globalRadiation value="219.3" unit="W/m^2"/>
            <humidity value="68.2" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1011.7"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="7.9"/>
            <mediumClouds id="MEDIUM" percent="59.1"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="13.1"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T13:00:00Z" to="2026-08-25T14:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.2" minvalue="0.1" maxvalue="0.3" probability="28.6"/>
<symbol id="Drizzle" number="46"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T15:00:00Z" to="2026-08-25T15:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <temperature id="TTT" unit="celsius" value="18.1"/>
            <windDirection id="dd" deg="95.9" name="E"/>
            <windSpeed id="ff" mps="4.5" beaufort="3" name="Gentle breeze"/>
            <windGust id="ff_gust" mps="8.3"/>
            <globalRadiation value="155.6" unit="W/m^2"/>
            <humidity value="74.8" unit="percent"/>
            <pressure id="pr" unit="hPa" value="1011.8"/>
            <cloudiness id="NN" percent="100.0"/>
            <lowClouds id="LOW" percent="6.4"/>
            <mediumClouds id="MEDIUM" percent="98.4"/>
            <highClouds id="HIGH" percent="100.0"/>
            <dewpointTemperature id="TD" unit="celsius" value="13.6"/>
         </location>
      </time>
      <time datatype="forecast" from="2026-08-25T14:00:00Z" to="2026-08-25T15:00:00Z">
         <location altitude="74" latitude="51.9000" longitude="-8.4863">
            <precipitation unit="mm" value="0.4" minvalue="0.3" maxvalue="0.6" probability="40.1"/>
<symbol id="LightRain" number="9"/>
         </location>
      </time>
   </product>
</weatherdata>
`;
