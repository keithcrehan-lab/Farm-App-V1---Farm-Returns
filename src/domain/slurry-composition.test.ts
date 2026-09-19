import { describe, expect, it } from "vitest";
import { currentSlurryCompositionByHousing, validateNewSlurryCompositionInput, type SlurryComposition, type NewSlurryCompositionInput } from "./slurry-composition";

function record(overrides: Partial<SlurryComposition> & Pick<SlurryComposition, "id" | "housingId" | "status" | "sampleDate" | "recordedAt">): SlurryComposition {
  return {
    farmId: "farm-1",
    slurryType: "cattle_slurry",
    dmPct: 6,
    source: "test",
    ...overrides,
  };
}

describe("currentSlurryCompositionByHousing", () => {
  it("returns nothing for a housing with no records — 'unknown is not zero'", () => {
    const map = currentSlurryCompositionByHousing([]);
    expect(map.has("housing-1")).toBe(false);
  });

  it("groups by housing — records for a different housing never bleed into this one's current record", () => {
    const a = record({ id: "a", housingId: "housing-1", status: "farmer_adjusted", sampleDate: "2026-06-01", recordedAt: "2026-06-01T00:00:00.000Z", dmPct: 7 });
    const b = record({ id: "b", housingId: "housing-2", status: "farmer_adjusted", sampleDate: "2026-06-01", recordedAt: "2026-06-01T00:00:00.000Z", dmPct: 9 });
    const map = currentSlurryCompositionByHousing([a, b]);
    expect(map.get("housing-1")?.id).toBe("a");
    expect(map.get("housing-2")?.id).toBe("b");
  });

  it("a real measured (verified) result always outranks a farmer-provided one, even an OLDER measured result vs a NEWER farmer estimate — brief §6's explicit hierarchy, not simply 'most recent'", () => {
    const olderLabResult = record({ id: "lab", housingId: "housing-1", status: "verified", sampleDate: "2026-01-01", recordedAt: "2026-01-01T00:00:00.000Z", dmPct: 9.4 });
    const newerFarmerGuess = record({ id: "farmer", housingId: "housing-1", status: "farmer_adjusted", sampleDate: "2026-08-01", recordedAt: "2026-08-01T00:00:00.000Z", dmPct: 5 });
    const map = currentSlurryCompositionByHousing([olderLabResult, newerFarmerGuess]);
    expect(map.get("housing-1")?.id).toBe("lab");
  });

  it("within the same tier, the most recent sampleDate wins", () => {
    const older = record({ id: "older", housingId: "housing-1", status: "farmer_adjusted", sampleDate: "2026-01-01", recordedAt: "2026-01-01T00:00:00.000Z" });
    const newer = record({ id: "newer", housingId: "housing-1", status: "farmer_adjusted", sampleDate: "2026-06-01", recordedAt: "2026-06-01T00:00:00.000Z" });
    const map = currentSlurryCompositionByHousing([older, newer]);
    expect(map.get("housing-1")?.id).toBe("newer");
  });

  it("ties on sampleDate are broken by the most recently recorded", () => {
    const first = record({ id: "first", housingId: "housing-1", status: "farmer_adjusted", sampleDate: "2026-06-01", recordedAt: "2026-06-01T09:00:00.000Z" });
    const correction = record({ id: "correction", housingId: "housing-1", status: "farmer_adjusted", sampleDate: "2026-06-01", recordedAt: "2026-06-01T15:00:00.000Z" });
    const map = currentSlurryCompositionByHousing([first, correction]);
    expect(map.get("housing-1")?.id).toBe("correction");
  });

  it("never mutates/deletes a superseded record — every input record is still real history, only the returned map's own 'current' pointer changes", () => {
    const older = record({ id: "older", housingId: "housing-1", status: "farmer_adjusted", sampleDate: "2026-01-01", recordedAt: "2026-01-01T00:00:00.000Z" });
    const newer = record({ id: "newer", housingId: "housing-1", status: "farmer_adjusted", sampleDate: "2026-06-01", recordedAt: "2026-06-01T00:00:00.000Z" });
    const input = [older, newer];
    currentSlurryCompositionByHousing(input);
    expect(input).toEqual([older, newer]);
  });
});

function validInput(overrides: Partial<NewSlurryCompositionInput> = {}): NewSlurryCompositionInput {
  return {
    housingId: "housing-1",
    slurryType: "cattle_slurry",
    status: "farmer_adjusted",
    dmPct: 8,
    sampleDate: "2026-06-01",
    source: "Farmer estimate",
    ...overrides,
  };
}

describe("validateNewSlurryCompositionInput", () => {
  const today = "2026-06-15";

  it("accepts a valid farmer-provided input", () => {
    expect(validateNewSlurryCompositionInput(validInput(), today)).toEqual([]);
  });

  it("accepts a valid laboratory result with a laboratory name", () => {
    const errors = validateNewSlurryCompositionInput(validInput({ status: "verified", laboratory: "Southern Agri Labs" }), today);
    expect(errors).toEqual([]);
  });

  it("rejects a laboratory (verified) result with no laboratory name", () => {
    const errors = validateNewSlurryCompositionInput(validInput({ status: "verified" }), today);
    expect(errors.some((e) => e.field === "laboratory")).toBe(true);
  });

  it("rejects a dry matter % outside 0-100", () => {
    expect(validateNewSlurryCompositionInput(validInput({ dmPct: 0 }), today).some((e) => e.field === "dmPct")).toBe(true);
    expect(validateNewSlurryCompositionInput(validInput({ dmPct: 101 }), today).some((e) => e.field === "dmPct")).toBe(true);
  });

  it("rejects a future sample date", () => {
    const errors = validateNewSlurryCompositionInput(validInput({ sampleDate: "2026-07-01" }), today);
    expect(errors.some((e) => e.field === "sampleDate")).toBe(true);
  });

  it("rejects a negative N/P/K value", () => {
    const errors = validateNewSlurryCompositionInput(validInput({ nPerM3: -1 }), today);
    expect(errors.some((e) => e.field === "nPerM3")).toBe(true);
  });

  it("accepts a farmer-provided input with no N/P/K at all — dmPct alone is scientifically usable", () => {
    expect(validateNewSlurryCompositionInput(validInput(), today)).toEqual([]);
  });
});
