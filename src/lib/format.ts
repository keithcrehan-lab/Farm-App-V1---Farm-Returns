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

/**
 * Codex audit HIGH (Fertiliser Overview and Stock Visuals campaign,
 * round 2): ANY fixed display precision has a real value below which a
 * genuinely positive quantity rounds to a literal "0" — bumping the
 * decimal count only moves that threshold, it never removes it. This is
 * the same "never show a false zero" pattern
 * `FarmFertiliserPurchaseRequirementCard.tsx`'s own `formatRemainingTonnes`
 * already established for tonnes (`"< 0.01 t"` rather than a misleading
 * `"0.00 t"`) — generalised here so every other real, always non-negative
 * production quantity in this app can reuse the identical discipline
 * instead of each screen inventing its own version. Checks the ACTUAL
 * rounded output (not just `value < 10^-maximumFractionDigits`) so it
 * stays correct regardless of `Intl.NumberFormat`'s own real rounding
 * behaviour at the boundary. `value` must already be a real, non-negative
 * domain quantity — this is a display formatter, not a calculation.
 */
export function formatNonNegative(value: number, maximumFractionDigits: number): string {
  const formatted = formatNumber(value, maximumFractionDigits);
  if (value > 0 && Number.parseFloat(formatted.replace(/[^0-9.-]/g, "")) === 0) {
    return `< ${formatNumber(1 / 10 ** maximumFractionDigits, maximumFractionDigits)}`;
  }
  return formatted;
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
