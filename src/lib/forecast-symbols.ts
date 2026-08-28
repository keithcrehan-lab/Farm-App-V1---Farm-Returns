import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, type LucideIcon } from "lucide-react";

/**
 * Presentational icon/label lookup for Met Éireann's `symbolId` string
 * (e.g. "LightRainSun", "Rain", "PartlyCloud") — deliberately kept here,
 * in the UI layer, per `forecast-parser.ts`'s own doc comment: the parser
 * keeps `symbolId` as Met Éireann's raw string and never classifies it,
 * so any icon/label vocabulary belongs in a separate, explicit, reviewed
 * table like this one, not invented inside the parsing pipeline.
 *
 * This is presentation only — a "which icon looks right" choice, not an
 * agronomic classification or a spreading-suitability judgement. The
 * vocabulary below covers the common Met Éireann/MET Norway symbol ids
 * (the underlying `locationforecast` API is MET Norway's `metno-wdb2ts`
 * product); an id not in this table is never hidden or guessed at — the
 * raw id itself is shown as a fallback label so nothing is silently lost.
 */
export interface ForecastSymbolDisplay {
  icon: LucideIcon;
  label: string;
}

const SYMBOL_TABLE: Record<string, ForecastSymbolDisplay> = {
  Sun: { icon: Sun, label: "Sunny" },
  LightCloud: { icon: Sun, label: "Light cloud" },
  PartlyCloud: { icon: Cloud, label: "Partly cloudy" },
  Cloud: { icon: Cloud, label: "Cloudy" },
  LightRainSun: { icon: CloudDrizzle, label: "Light rain, sun" },
  LightRain: { icon: CloudDrizzle, label: "Light rain" },
  LightRainThunderSun: { icon: CloudLightning, label: "Light rain, thunder, sun" },
  LightRainThunder: { icon: CloudLightning, label: "Light rain, thunder" },
  Rain: { icon: CloudRain, label: "Rain" },
  RainSun: { icon: CloudRain, label: "Rain, sun" },
  RainThunder: { icon: CloudLightning, label: "Rain, thunder" },
  RainThunderSun: { icon: CloudLightning, label: "Rain, thunder, sun" },
  HeavyRain: { icon: CloudRain, label: "Heavy rain" },
  HeavyRainSun: { icon: CloudRain, label: "Heavy rain, sun" },
  Rainshower: { icon: CloudRain, label: "Rain shower" },
  RainshowerSun: { icon: CloudRain, label: "Rain shower, sun" },
  RainshowerThunder: { icon: CloudLightning, label: "Rain shower, thunder" },
  Sleet: { icon: CloudDrizzle, label: "Sleet" },
  SleetSun: { icon: CloudDrizzle, label: "Sleet, sun" },
  SleetShower: { icon: CloudDrizzle, label: "Sleet shower" },
  Snow: { icon: CloudSnow, label: "Snow" },
  SnowSun: { icon: CloudSnow, label: "Snow, sun" },
  Snowshower: { icon: CloudSnow, label: "Snow shower" },
  Fog: { icon: CloudFog, label: "Fog" },
  Thunder: { icon: CloudLightning, label: "Thunder" },
};

const FALLBACK_ICON: LucideIcon = Cloud;

/**
 * Looks up the real display for a Met Éireann symbol id. Never fabricates
 * a description for an id it doesn't recognise — falls back to a neutral
 * icon plus the raw id itself, so an unmapped real value is visible for
 * review rather than silently mislabelled as something it might not be.
 */
export function forecastSymbolDisplay(symbolId: string | null): ForecastSymbolDisplay {
  if (!symbolId) return { icon: FALLBACK_ICON, label: "—" };
  return SYMBOL_TABLE[symbolId] ?? { icon: FALLBACK_ICON, label: symbolId };
}
