const eurFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurFormatterPrecise = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

export function formatEur(value: number, precise = false): string {
  return precise ? eurFormatterPrecise.format(value) : eurFormatter.format(value);
}

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("en-IE", { maximumFractionDigits }).format(value);
}

export function formatPct(value: number, opts: { showSign?: boolean } = {}): string {
  const { showSign = true } = opts;
  const sign = showSign && value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}%`;
}

export function formatHa(value: number): string {
  return `${formatNumber(value, 1)} ha`;
}

const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** Meteorological-convention degrees (direction the wind blows FROM) to a
 * 16-point compass label — a standard, non-invented mapping (360/16 = 22.5°
 * per sector), purely presentational. */
export function formatWindDirection(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_POINTS[index];
}
