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
