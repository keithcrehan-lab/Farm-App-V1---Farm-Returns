import { describe, expect, it } from "vitest";
import { regionalGrowthForDisplay } from "./regional-grass-display";

describe("regional grass growth presentation", () => {
  const row = {
    growthKgDmHaDay: 34,
    validFrom: "2026-11-12",
    validTo: "2026-11-18",
    sourceUrl: "https://teagasc.ie/",
  };

  it("shows a current approved county prediction without mixing it with farm evidence", () => {
    expect(regionalGrowthForDisplay("Galway", row, "2026-11-13")).toEqual({
      status: "published", county: "Galway", growthKgDmHaDay: 34,
      validFrom: "2026-11-12", validTo: "2026-11-18",
      current: true, sourceUrl: row.sourceUrl,
    });
  });

  it("labels expired or not-yet-effective predictions as non-current", () => {
    expect(regionalGrowthForDisplay("Galway", row, "2026-11-19")).toMatchObject({ status: "published", current: false });
    expect(regionalGrowthForDisplay("Galway", row, "2026-11-11")).toMatchObject({ status: "published", current: false });
  });

  it("distinguishes unpublished figures from missing farm county", () => {
    expect(regionalGrowthForDisplay("Galway", null)).toEqual({ status: "not_published", county: "Galway" });
    expect(regionalGrowthForDisplay("", null)).toEqual({ status: "county_missing" });
    expect(regionalGrowthForDisplay(null, null)).toEqual({ status: "county_missing" });
  });
});
