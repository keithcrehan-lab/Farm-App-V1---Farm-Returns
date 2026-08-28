import { describe, expect, it } from "vitest";
import { IRISH_COUNTIES } from "./irish-counties";

describe("IRISH_COUNTIES", () => {
  it("lists all 26 counties of the Republic of Ireland, no duplicates", () => {
    expect(IRISH_COUNTIES).toHaveLength(26);
    expect(new Set(IRISH_COUNTIES.map((c) => c.name)).size).toBe(26);
  });

  it("gives every county a real-world [lng, lat] centroid, not a placeholder like [0, 0]", () => {
    for (const county of IRISH_COUNTIES) {
      const [lng, lat] = county.centroid;
      // Ireland's real bounding box, roughly -10.7 to -5.4 lng, 51.4 to 55.4 lat.
      expect(lng).toBeGreaterThan(-11);
      expect(lng).toBeLessThan(-5);
      expect(lat).toBeGreaterThan(51);
      expect(lat).toBeLessThan(56);
    }
  });
});
