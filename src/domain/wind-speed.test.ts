import { describe, expect, it } from "vitest";
import { metresPerSecondToKmPerHour } from "./wind-speed";

describe("metresPerSecondToKmPerHour", () => {
  it("converts a real observed wind speed using the exact 3.6 factor", () => {
    expect(metresPerSecondToKmPerHour(10)).toBe(36);
  });

  it("converts 0 m/s to 0 km/h", () => {
    expect(metresPerSecondToKmPerHour(0)).toBe(0);
  });

  it("handles a real fractional reading without rounding internally", () => {
    expect(metresPerSecondToKmPerHour(9.4)).toBeCloseTo(33.84, 5);
  });
});
