/**
 * Farmer-facing state of the independent county growth feed.
 * A published rate is an externally supplied regional *prediction*, not a
 * measurement of this farm; showing it never alters farmer-entered evidence.
 */
export type RegionalGrassDisplay =
  | { status: "published"; county: string; growthKgDmHaDay: number; validFrom: string; validTo: string; current: boolean; sourceUrl: string }
  | { status: "not_published"; county: string }
  | { status: "unavailable"; county: string }
  | { status: "county_missing" };

export function regionalGrowthForDisplay(
  county: string | null | undefined,
  reading: { growthKgDmHaDay: number; validFrom: string; validTo: string; sourceUrl: string } | null,
  asOf = new Date().toISOString().slice(0, 10),
): RegionalGrassDisplay {
  const name = county?.trim();
  if (!name) return { status: "county_missing" };
  if (!reading) return { status: "not_published", county: name };
  return {
    status: "published",
    county: name,
    growthKgDmHaDay: reading.growthKgDmHaDay,
    validFrom: reading.validFrom,
    validTo: reading.validTo,
    current: reading.validFrom <= asOf && reading.validTo >= asOf,
    sourceUrl: reading.sourceUrl,
  };
}
