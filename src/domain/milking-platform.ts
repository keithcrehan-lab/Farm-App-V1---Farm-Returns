/**
 * Scientific engine V3 — Phase K: `MILKING_PLATFORM_N_DISTRIBUTION`.
 *
 * `rules_statutory/milking_platform_table14_2026.csv` (S.I. 119/2026
 * Table 14) — all 6 chemical-N-allowance bands × 4 platform-stocking-rate
 * bands, copied verbatim. Grounded exactly in `GFT037`-`GFT046`. Not
 * previously implemented anywhere in this codebase (this app has no
 * dairy/milking-platform concept modelled at all yet — same "dairy isn't
 * a modelled enterprise here" scope note `nutrients.ts` already carries).
 */

import { blockedInsufficientEvidence, ok, type EngineOutcome } from "./evidence";

export const MILKING_PLATFORM_VERSION = "milking_platform_v1.0.0";

export type MilkingPlatformAllowanceKgHa = 114 | 150 | 185 | 200 | 214 | 241;
export type OrganicNToMoveKgHa = 0 | 20 | 40 | ">=41";

interface PlatformStockingRateBand {
  min: number | undefined;
  max: number | undefined;
  organicNToMoveKgHa: OrganicNToMoveKgHa;
}

/** `milking_platform_table14_2026.csv`, all 25 rows, grouped by their
 * `milking_platform_available_chemical_N_allowance_kg_ha` value. */
const MILKING_PLATFORM_TABLE_14: Record<MilkingPlatformAllowanceKgHa, PlatformStockingRateBand[]> = {
  114: [
    { min: undefined, max: 386, organicNToMoveKgHa: 0 },
    { min: 387, max: 406, organicNToMoveKgHa: 20 },
    { min: 407, max: 426, organicNToMoveKgHa: 40 },
    { min: 427, max: undefined, organicNToMoveKgHa: ">=41" },
  ],
  150: [
    { min: undefined, max: 350, organicNToMoveKgHa: 0 },
    { min: 351, max: 370, organicNToMoveKgHa: 20 },
    { min: 371, max: 390, organicNToMoveKgHa: 40 },
    { min: 391, max: undefined, organicNToMoveKgHa: ">=41" },
  ],
  185: [
    { min: undefined, max: 315, organicNToMoveKgHa: 0 },
    { min: 316, max: 335, organicNToMoveKgHa: 20 },
    { min: 336, max: 355, organicNToMoveKgHa: 40 },
    { min: 356, max: undefined, organicNToMoveKgHa: ">=41" },
  ],
  200: [
    { min: undefined, max: 300, organicNToMoveKgHa: 0 },
    { min: 301, max: 320, organicNToMoveKgHa: 20 },
    { min: 321, max: 340, organicNToMoveKgHa: 40 },
    { min: 341, max: undefined, organicNToMoveKgHa: ">=41" },
  ],
  214: [
    { min: undefined, max: 286, organicNToMoveKgHa: 0 },
    { min: 287, max: 306, organicNToMoveKgHa: 20 },
    { min: 307, max: 326, organicNToMoveKgHa: 40 },
    { min: 327, max: undefined, organicNToMoveKgHa: ">=41" },
  ],
  241: [
    { min: undefined, max: 259, organicNToMoveKgHa: 0 },
    { min: 260, max: 279, organicNToMoveKgHa: 20 },
    { min: 280, max: 299, organicNToMoveKgHa: 40 },
    { min: 300, max: undefined, organicNToMoveKgHa: ">=41" },
  ],
};

/**
 * `GFT037`-`GFT046`. Do NOT substitute a whole-holding stocking rate for
 * the defined milking-platform stocking rate (spec Section F) — this
 * function takes `platformStockingRate` as an already-correctly-scoped
 * input; it does not derive it from any whole-farm figure itself.
 */
export function lookupMilkingPlatformOrganicNToMove(
  allowanceKgHa: MilkingPlatformAllowanceKgHa,
  platformStockingRate: number,
): EngineOutcome<OrganicNToMoveKgHa> {
  const bands = MILKING_PLATFORM_TABLE_14[allowanceKgHa];
  for (const band of bands) {
    const aboveMin = band.min === undefined || platformStockingRate >= band.min;
    const belowMax = band.max === undefined || platformStockingRate <= band.max;
    if (aboveMin && belowMax) return ok(band.organicNToMoveKgHa, "DERIVED");
  }
  // Unreachable given the table's bands are exhaustive and contiguous —
  // kept as an explicit fail-closed fallback rather than a silent `never`.
  return blockedInsufficientEvidence("MILKING_PLATFORM_STOCKING_RATE_OUT_OF_RANGE", ["platformStockingRate outside the published table range"]);
}
