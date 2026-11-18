import { describe, expect, it } from "vitest";
import {
  DAIRY_MIDSEASON_ROWS,
  DAIRY_MEAL_KG_FRESH_ANCHORS,
  estimateDairyMidseasonIntake,
} from "./teagasc-dairy-midseason-intake";

describe("Teagasc 2025 published dairy mid-season grass DMI Table 1", () => {
  it.each(DAIRY_MIDSEASON_ROWS.flatMap((r) => DAIRY_MEAL_KG_FRESH_ANCHORS.map((kg, i) =>
    [r.coverKgDmHa, kg, r.grassDmiByMealKgFresh[i]] as const
  )))("matches published anchor: cover %i, concentrate %i kg fresh gives %s kg grazed DM", (cover, meal, expected) => {
    expect(estimateDairyMidseasonIntake(cover, meal)).toMatchObject({
      status: "READY", grassKgDmPerHeadDay: expected, exactTableCell: true,
    });
  });

  it("interpolates within published bounds and discloses modelled results", () => {
    const r = estimateDairyMidseasonIntake(1700, 3);
    expect(r.status).toBe("READY");
    if (r.status !== "READY") return;
    // 1400kg row: 15.9; 2000kg row: 14.25; midway = 15.075.
    expect(r.grassKgDmPerHeadDay).toBeCloseTo(15.075, 10);
    expect(r.exactTableCell).toBe(false);
  });

  it.each([
    [1399, 4, "COVER_OUTSIDE_SOURCE"], [2001, 4, "COVER_OUTSIDE_SOURCE"],
    [NaN, 4, "COVER_OUTSIDE_SOURCE"], [Infinity, 4, "COVER_OUTSIDE_SOURCE"],
    [1500, -1, "MEAL_OUTSIDE_SOURCE"], [1500, 7, "MEAL_OUTSIDE_SOURCE"],
    [1500, NaN, "MEAL_OUTSIDE_SOURCE"], [1500, Infinity, "MEAL_OUTSIDE_SOURCE"],
  ] as const)("refuses extrapolation cover=%s meal=%s", (cover, meal, reason) => {
    expect(estimateDairyMidseasonIntake(cover, meal)).toEqual({ status: "OUT_OF_SCOPE", reason });
  });

  it("accepts only floating-point noise from adding multiple meal records at 6kg", () => {
    expect(estimateDairyMidseasonIntake(1400, 6 + 5e-10)).toMatchObject({ status: "READY", grassKgDmPerHeadDay: 14.9, exactTableCell: true });
    expect(estimateDairyMidseasonIntake(1400, 6.00001)).toEqual({ status: "OUT_OF_SCOPE", reason: "MEAL_OUTSIDE_SOURCE" });
  });

  it("more concentrate does not increase estimated grazed grass for fixed cover", () => {
    for (const cover of [1400, 1450, 1700, 1900, 2000]) {
      let last = Infinity;
      for (const meal of [0, 0.5, 1, 2, 3, 4, 5, 6]) {
        const r = estimateDairyMidseasonIntake(cover, meal);
        if (r.status !== "READY") throw new Error("unexpected missing table scenario");
        expect(r.grassKgDmPerHeadDay).toBeLessThanOrEqual(last);
        last = r.grassKgDmPerHeadDay;
      }
    }
  });
});
