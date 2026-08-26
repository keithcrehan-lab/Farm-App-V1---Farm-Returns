import { describe, expect, it } from "vitest";
import {
  HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT,
  isEligibleForElevatedNRate,
  napMaxAvailableNGrazingKgHaEligibilityGated,
} from "./high-rate-n-eligibility";

describe("isEligibleForElevatedNRate", () => {
  it("real evidence threshold: 5% non-grass eligible area", () => {
    expect(HIGH_RATE_N_NON_GRASS_ELIGIBILITY_THRESHOLD_PCT).toBe(5);
  });

  it("GFT023: GSR 184, 0% non-grass -> NOT eligible", () => {
    expect(isEligibleForElevatedNRate(184, 0)).toBe(false);
  });

  it("GFT024: GSR 184, 5% non-grass -> eligible", () => {
    expect(isEligibleForElevatedNRate(184, 5)).toBe(true);
  });

  it("GSR at or below 170 never needs eligibility — the ordinary bands already apply", () => {
    expect(isEligibleForElevatedNRate(170, 0)).toBe(true);
    expect(isEligibleForElevatedNRate(85, 0)).toBe(true);
  });
});

describe("napMaxAvailableNGrazingKgHaEligibilityGated", () => {
  it("GFT023: GSR 184, ineligible (0% non-grass) -> 185 kg/ha (the ordinary 131-170 band's own rate, NOT the raw table's 241)", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(184, 0)).toBe(185);
  });

  it("GFT024: GSR 184, eligible (5% non-grass) -> 241 kg/ha (the real elevated rate)", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(184, 5)).toBe(241);
  });

  it("GSR >210, ineligible -> still falls back to 185, never the raw table's 214", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(250, 0)).toBe(185);
  });

  it("GSR >210, eligible -> the real elevated 214", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(250, 10)).toBe(214);
  });

  it("GSR at or below 170 is completely unaffected by eligibility either way", () => {
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(100, 0)).toBe(114);
    expect(napMaxAvailableNGrazingKgHaEligibilityGated(100, 50)).toBe(114);
  });
});
