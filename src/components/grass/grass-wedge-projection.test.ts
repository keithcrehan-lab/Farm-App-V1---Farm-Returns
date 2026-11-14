import { describe, expect, it } from "vitest";
import { wedgeForecastParts } from "./grass-wedge-projection";

describe("wedge forecast portions (display-only)", () => {
  it("splits future increased cover into retained current and projected gain", () => {
    expect(wedgeForecastParts(1850, 2100, 7)).toEqual({
      retainedKgDmHa: 1850, addedKgDmHa: 250, lostKgDmHa: 0,
    });
  });
  it("represents lost cover without changing the projected final height", () => {
    expect(wedgeForecastParts(1900, 1600, 3)).toEqual({
      retainedKgDmHa: 1600, addedKgDmHa: 0, lostKgDmHa: 300,
    });
  });
  it("handles no net change and a zero projected cover without inventing values", () => {
    expect(wedgeForecastParts(1600, 1600, 7)).toEqual({
      retainedKgDmHa: 1600, addedKgDmHa: 0, lostKgDmHa: 0,
    });
    expect(wedgeForecastParts(300, 0, 7)).toEqual({
      retainedKgDmHa: 0, addedKgDmHa: 0, lostKgDmHa: 300,
    });
  });
  it("keeps Now solid and unknown or invalid forecasts unsplit", () => {
    expect(wedgeForecastParts(1600, 1900, 0)).toBeUndefined();
    expect(wedgeForecastParts(undefined, 1900, 7)).toBeUndefined();
    expect(wedgeForecastParts(1600, undefined, 7)).toBeUndefined();
    expect(wedgeForecastParts(1600, Number.NaN, 7)).toBeUndefined();
    expect(wedgeForecastParts(1600, -1, 7)).toBeUndefined();
    expect(wedgeForecastParts(1600, 1900, -3)).toBeUndefined();
  });
});
