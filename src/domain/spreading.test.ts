import { describe, expect, it } from "vitest";
import {
  DRAINAGE_CLASS_SMD_MODEL,
  DUNSANY_VALIDATION_SERIES,
  assessWeatherHardStops,
  isGroundFrozen,
  isGroundSaturated,
  smdForDrainage,
  smdTrend,
  soilDrynessIndex,
} from "./spreading";

describe("soilDrynessIndex", () => {
  it("rescales real SMD onto the class's real [minimum, 110] range", () => {
    // Well-drained: minimum 0, max 110 -> SMD 55 is the exact midpoint.
    expect(soilDrynessIndex(55, "well_drained")).toBeCloseTo(50, 5);
    // Moderately-drained: minimum -10, max 110 (range 120) -> SMD -10 is 0.
    expect(soilDrynessIndex(-10, "moderately_drained")).toBeCloseTo(0, 5);
    expect(soilDrynessIndex(110, "moderately_drained")).toBeCloseTo(100, 5);
  });

  it("clamps below the minimum and above the theoretical max rather than going out of [0,100]", () => {
    expect(soilDrynessIndex(-50, "poorly_drained")).toBe(0);
    expect(soilDrynessIndex(500, "well_drained")).toBe(100);
  });

  it("matches the real Jun 11 2026 Dunsany saturation event across all three classes", () => {
    const day = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-06-11")!;
    expect(soilDrynessIndex(day.smdWellDrainedMm, "well_drained")).toBe(0);
    expect(soilDrynessIndex(day.smdModeratelyDrainedMm, "moderately_drained")).toBe(0);
    expect(soilDrynessIndex(day.smdPoorlyDrainedMm, "poorly_drained")).toBe(0);
  });
});

describe("isGroundSaturated", () => {
  it("is false for a normal mid-season dry day (real Jul 15 2026 data)", () => {
    const day = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-07-15")!;
    expect(isGroundSaturated(day.smdWellDrainedMm, "well_drained")).toBe(false);
    expect(isGroundSaturated(day.smdPoorlyDrainedMm, "poorly_drained")).toBe(false);
  });

  it("is true for the real Jun 7 2026 event where well-drained SMD hit its floor", () => {
    const day = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-06-07")!;
    expect(day.smdWellDrainedMm).toBe(0);
    expect(isGroundSaturated(day.smdWellDrainedMm, "well_drained")).toBe(true);
    // Moderately/poorly-drained hadn't reached their -10mm floor yet that day.
    expect(isGroundSaturated(day.smdModeratelyDrainedMm, "moderately_drained")).toBe(false);
  });

  it("is true for all three classes on the real Jun 11 2026 event (13.8mm rain day)", () => {
    const day = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-06-11")!;
    expect(day.rainfallMm).toBe(13.8);
    for (const drainage of ["well_drained", "moderately_drained", "poorly_drained"] as const) {
      expect(isGroundSaturated(smdForDrainage(day, drainage), drainage)).toBe(true);
    }
  });

  it("triggers exactly at the class's own minimum, not just below it", () => {
    for (const [drainage, model] of Object.entries(DRAINAGE_CLASS_SMD_MODEL)) {
      expect(isGroundSaturated(model.minimumSmdMm, drainage as keyof typeof DRAINAGE_CLASS_SMD_MODEL)).toBe(true);
      expect(isGroundSaturated(model.minimumSmdMm + 0.1, drainage as keyof typeof DRAINAGE_CLASS_SMD_MODEL)).toBe(false);
    }
  });
});

describe("isGroundFrozen", () => {
  it("is never true across the real 92-day Dunsany window (May-Jul, no frost days)", () => {
    for (const day of DUNSANY_VALIDATION_SERIES) {
      expect(isGroundFrozen(day.soilTemp10cmC)).toBe(false);
    }
  });

  it("triggers at and below the real physical freezing point", () => {
    expect(isGroundFrozen(0)).toBe(true);
    expect(isGroundFrozen(-1)).toBe(true);
    expect(isGroundFrozen(0.1)).toBe(false);
  });
});

describe("smdTrend", () => {
  it("reads the real May 8-9 2026 transition as drying (rain stopped, PE resumed)", () => {
    const may8 = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-05-08")!;
    const may9 = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-05-09")!;
    expect(smdTrend(may9.smdWellDrainedMm, may8.smdWellDrainedMm)).toBe("drying");
  });

  it("reads the real Jun 6-7 2026 transition as wetting (12.5mm rain day)", () => {
    const jun6 = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-06-06")!;
    const jun7 = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-06-07")!;
    expect(smdTrend(jun7.smdWellDrainedMm, jun6.smdWellDrainedMm)).toBe("wetting");
  });

  it("reads no change as steady", () => {
    expect(smdTrend(40, 40)).toBe("steady");
  });
});

describe("assessWeatherHardStops", () => {
  it("returns no hard stops on a real ordinary dry day", () => {
    const day = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-07-15")!;
    const stops = assessWeatherHardStops({
      smdMm: day.smdWellDrainedMm,
      drainage: "well_drained",
      soilTemp10cmC: day.soilTemp10cmC,
    });
    expect(stops).toEqual([]);
  });

  it("flags saturation on the real Jun 11 2026 event for a moderately-drained field", () => {
    const day = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-06-11")!;
    const stops = assessWeatherHardStops({
      smdMm: day.smdModeratelyDrainedMm,
      drainage: "moderately_drained",
      soilTemp10cmC: day.soilTemp10cmC,
    });
    expect(stops).toHaveLength(1);
    expect(stops[0].reason).toMatch(/saturated/i);
  });

  it("flags frozen ground when soil temp is at or below 0°C, independent of SMD", () => {
    const stops = assessWeatherHardStops({ smdMm: 60, drainage: "well_drained", soilTemp10cmC: -0.5 });
    expect(stops).toHaveLength(1);
    expect(stops[0].reason).toMatch(/frozen/i);
  });

  it("can return both hard stops together", () => {
    const stops = assessWeatherHardStops({ smdMm: -10, drainage: "poorly_drained", soilTemp10cmC: -1 });
    expect(stops).toHaveLength(2);
  });
});

describe("DUNSANY_VALIDATION_SERIES integrity", () => {
  it("covers the full real 92-day window, 1 May-31 Jul 2026", () => {
    expect(DUNSANY_VALIDATION_SERIES).toHaveLength(92);
    expect(DUNSANY_VALIDATION_SERIES[0].date).toBe("2026-05-01");
    expect(DUNSANY_VALIDATION_SERIES[DUNSANY_VALIDATION_SERIES.length - 1].date).toBe("2026-07-31");
  });

  it("smdForDrainage reads the correct real column for each class", () => {
    const day = DUNSANY_VALIDATION_SERIES.find((d) => d.date === "2026-06-12")!;
    expect(smdForDrainage(day, "well_drained")).toBe(2.6);
    expect(smdForDrainage(day, "moderately_drained")).toBe(2.6);
    expect(smdForDrainage(day, "poorly_drained")).toBe(-6.9);
  });
});
