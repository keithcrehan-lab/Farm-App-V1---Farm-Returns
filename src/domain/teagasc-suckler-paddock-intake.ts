/**
 * An ATOMIC suckler-cow + older grazing calf paddock planning allocation.
 *
 * BEEF2026 Table 1 records cow 700 kg ->14 kg grass DM/day, calf 200kg ->4;
 * both 2% liveweight, as separate contributions. This function returns ONE
 * composite demand, so neither contribution can be silently omitted.
 *
 * Not wired to persisted grazing sessions until the backend can ensure cow
 * and calf groups are linked and not counted again independently.
 */
export const SUCKLER_PAIR_RULE_ID = "TEAGASC_BEEF2026_COW_CALF_ATOMIC_V1";
export const SUCKLER_PAIR_SOURCE =
  "Teagasc BEEF2026, Benefits of paddock grazing in beef systems, Table 1: 40 x 700kg cows at 14kg and 40 x 200kg older grazing calves at 4kg DM/day, combined 720kg DM/day";

export interface SucklerPairInput {
  cowHeadCount: number;
  cowAverageWeightKg: number;
  calfHeadCount: number;
  calfAverageWeightKg: number;
  calfStage: "older_grazing" | "milk_dependent";
  /** Explicit no-concentrate/no-silage scenario; no unknown substitution. */
  supplementaryFeedRecordedNone: boolean;
}

export type SucklerPairResult =
  | { status: "READY"; cowKgDmDay: number; calfKgDmDay: number; totalKgDmDay: number;
      ruleId: typeof SUCKLER_PAIR_RULE_ID; source: typeof SUCKLER_PAIR_SOURCE;
      quantityBasis: "PLANNING_ALLOCATION"; confidence: "low";
      evidence: { cowHeadCount: number; calfHeadCount: number; cowAverageWeightKg: number; calfAverageWeightKg: number; calfStage: "older_grazing"; supplementaryFeedRecordedNone: true };
      limitations: readonly string[] }
  | { status: "INCOMPLETE"; missing: string[] }
  | { status: "OUT_OF_SCOPE"; reason: "WEIGHT_OUTSIDE_REFERENCE" | "UNSUPPORTED_CALF_STAGE" };

export function calculateSucklerPairAllocation(input: SucklerPairInput): SucklerPairResult {
  const missing: string[] = [];
  if (!Number.isInteger(input.cowHeadCount) || input.cowHeadCount <= 0) missing.push("cowHeadCount");
  if (!Number.isInteger(input.calfHeadCount) || input.calfHeadCount <= 0) missing.push("calfHeadCount");
  if (!Number.isFinite(input.cowAverageWeightKg) || input.cowAverageWeightKg <= 0) missing.push("cowAverageWeightKg");
  if (!Number.isFinite(input.calfAverageWeightKg) || input.calfAverageWeightKg <= 0) missing.push("calfAverageWeightKg");
  if (input.supplementaryFeedRecordedNone !== true) missing.push("supplementaryFeedRecordedNone");
  if (missing.length) return { status: "INCOMPLETE", missing };
  if (input.calfStage !== "older_grazing") return { status: "OUT_OF_SCOPE", reason: "UNSUPPORTED_CALF_STAGE" };
  // Reference window, not a biological threshold. Extrapolation needs review.
  if (input.cowAverageWeightKg < 650 || input.cowAverageWeightKg > 700
    || input.calfAverageWeightKg < 180 || input.calfAverageWeightKg > 220) {
    return { status: "OUT_OF_SCOPE", reason: "WEIGHT_OUTSIDE_REFERENCE" };
  }
  const cowKgDmDay = input.cowHeadCount * input.cowAverageWeightKg * 0.02;
  const calfKgDmDay = input.calfHeadCount * input.calfAverageWeightKg * 0.02;
  return {
    status: "READY",
    cowKgDmDay,
    calfKgDmDay,
    totalKgDmDay: cowKgDmDay + calfKgDmDay,
    ruleId: SUCKLER_PAIR_RULE_ID,
    source: SUCKLER_PAIR_SOURCE,
    quantityBasis: "PLANNING_ALLOCATION",
    confidence: "low",
    evidence: { cowHeadCount: input.cowHeadCount, calfHeadCount: input.calfHeadCount, cowAverageWeightKg: input.cowAverageWeightKg, calfAverageWeightKg: input.calfAverageWeightKg, calfStage: "older_grazing", supplementaryFeedRecordedNone: true },
    limitations: ["This is a source-scoped paddock HERBAGE ALLOCATION, not measured actual pasture intake or disappearance; neither cow nor calf contribution may be separately added again."],
  };
}
