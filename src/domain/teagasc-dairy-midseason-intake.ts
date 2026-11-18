/**
 * Teagasc mid-season dairy grass intake scenario (CODE_VERIFIED, not farm validated).
 *
 * Source: Teagasc, Tips on maintaining performance during the mid-season,
 * 12 May 2025, Table 1 (also Nutrition Q&A Table 4, INRA2018 model).
 * https://teagasc.ie/news--events/daily/tips-on-maintaining-performance-during-the-mid-season/
 *
 * The values are kg *grazed grass* DM/cow/day, NOT total diet DM, at a
 * measured pre-grazing cover and meal as-fed (88% DM) per cow/day.
 * Only 1,400–2,000 kg DM/ha and 0–6 kg concentrate fresh are supported.
 * Bilinear interpolation is Farm Return modelling policy between published
 * anchor values; never extrapolate outside them.
 */
export const DAIRY_MIDSEASON_TABLE_VERSION = "teagasc_dairy_midseason_table_v1.0.0";
export const DAIRY_MEAL_DM_FRACTION = 0.88;

export const DAIRY_MIDSEASON_SOURCE =
  "Teagasc, Tips on maintaining performance during the mid-season (12 May 2025), Table 1: grass DMI by pre-grazing cover and 0–6 kg concentrate/cow/day at 88% dry matter (INRA2018-based example)";

export const DAIRY_MIDSEASON_ROWS = [
  { coverKgDmHa: 1400, grassDmiByMealKgFresh: [16.8, 16.2, 15.6, 14.9] },
  { coverKgDmHa: 2000, grassDmiByMealKgFresh: [14.8, 14.5, 14.0, 13.4] },
] as const;

export const DAIRY_MEAL_KG_FRESH_ANCHORS = [0, 2, 4, 6] as const;

export type DairyMidseasonIntake =
  | {
      status: "READY";
      grassKgDmPerHeadDay: number;
      exactTableCell: boolean;
      source: typeof DAIRY_MIDSEASON_SOURCE;
      coverRangeKgDmHa: readonly [number, number];
      mealRangeKgFreshHeadDay: readonly [number, number];
      mealDmFraction: typeof DAIRY_MEAL_DM_FRACTION;
    }
  | { status: "OUT_OF_SCOPE"; reason: "COVER_OUTSIDE_SOURCE" | "MEAL_OUTSIDE_SOURCE" };

function interpolateMeal(row: readonly number[], meal: number): number {
  if (meal === 6) return row[3];
  const lowerIdx = Math.floor(meal / 2);
  const share = (meal - 2 * lowerIdx) / 2;
  return row[lowerIdx] * (1 - share) + row[lowerIdx + 1] * share;
}

export function estimateDairyMidseasonIntake(
  preGrazingCoverKgDmHa: number,
  mealKgFreshHeadDay: number,
): DairyMidseasonIntake {
  if (!Number.isFinite(preGrazingCoverKgDmHa) || preGrazingCoverKgDmHa < 1400 || preGrazingCoverKgDmHa > 2000) {
    return { status: "OUT_OF_SCOPE", reason: "COVER_OUTSIDE_SOURCE" };
  }
  // Summed feed records can produce a one-ULP overshoot at the source's
  // 6kg boundary. Tolerate arithmetic noise only, never meaningful excess.
  const roundingTolerance = 1e-9; // numeric precision policy, not science
  if (!Number.isFinite(mealKgFreshHeadDay) || mealKgFreshHeadDay < 0 || mealKgFreshHeadDay > 6 + roundingTolerance) {
    return { status: "OUT_OF_SCOPE", reason: "MEAL_OUTSIDE_SOURCE" };
  }
  const mealKg = Math.min(6, mealKgFreshHeadDay);
  const low = interpolateMeal(DAIRY_MIDSEASON_ROWS[0].grassDmiByMealKgFresh, mealKg);
  const high = interpolateMeal(DAIRY_MIDSEASON_ROWS[1].grassDmiByMealKgFresh, mealKg);
  const coverFraction = (preGrazingCoverKgDmHa - 1400) / 600;
  const grassKgDmPerHeadDay = low * (1 - coverFraction) + high * coverFraction;
  return {
    status: "READY",
    grassKgDmPerHeadDay,
    exactTableCell: (preGrazingCoverKgDmHa === 1400 || preGrazingCoverKgDmHa === 2000)
      && DAIRY_MEAL_KG_FRESH_ANCHORS.some((x) => x === mealKg),
    source: DAIRY_MIDSEASON_SOURCE,
    coverRangeKgDmHa: [1400, 2000],
    mealRangeKgFreshHeadDay: [0, 6],
    mealDmFraction: DAIRY_MEAL_DM_FRACTION,
  };
}
