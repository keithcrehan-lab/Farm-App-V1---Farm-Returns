import { describe, expect, it } from "vitest";
import { isLiveReading, isUsableReadingLocation, pickReadingFix } from "./reading-location";

const NOW = Date.UTC(2026, 10, 11, 8, 0, 0);
const fix = (ageS: number, accuracyM: number | null) => ({ lat: 52.7, lng: -8.78, accuracyM, at: NOW - ageS * 1000 });

describe("pickReadingFix", () => {
  it("keeps the tightest fresh fix", () => {
    expect(pickReadingFix([fix(2, 18), fix(5, 6)], NOW)?.accuracyM).toBe(6);
  });

  it("refuses stale or vague fixes rather than pinning the reading in the wrong place", () => {
    expect(pickReadingFix([fix(45, 5)], NOW)).toBeNull();
    expect(pickReadingFix([fix(1, 120)], NOW)).toBeNull();
    expect(pickReadingFix([null, undefined], NOW)).toBeNull();
  });

  it("accepts a fresh fix with no reported accuracy", () => {
    expect(pickReadingFix([fix(1, null)], NOW)).not.toBeNull();
  });
});

describe("isLiveReading", () => {
  it("treats a reading timed now as live and a back-dated one as not", () => {
    expect(isLiveReading(NOW - 60_000, NOW)).toBe(true);
    expect(isLiveReading(NOW - 3 * 3_600_000, NOW)).toBe(false);
  });
});

describe("isUsableReadingLocation", () => {
  it("pins accurate locations only", () => {
    expect(isUsableReadingLocation({ lat: 52.7, lng: -8.78, accuracyM: 8 })).toBe(true);
    expect(isUsableReadingLocation({ lat: 52.7, lng: -8.78, accuracyM: 900 })).toBe(false);
    expect(isUsableReadingLocation({ lat: null, lng: null, accuracyM: null })).toBe(false);
  });
});
