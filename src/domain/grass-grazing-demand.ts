import type { LivestockCategory, LivestockGroup } from "@/domain/types";
import type { GrazingDemandResolution } from "@/domain/grazing-demand";

export const BEEF_GRAZING_DM_FRACTION_OF_LIVEWEIGHT = 0.02;
export const BEEF_GRAZING_DEMAND_RULE_ID = "TEAGASC_BEEF_GRAZING_2PCT_LW" as const;
export const BEEF_GRAZING_DEMAND_SOURCE =
  "Teagasc beef grazing guidance: herbage demand approximated at 2% of liveweight per head per day";

const SUPPORTED_BEEF_CATEGORIES = new Set<LivestockCategory>([
  "suckler_cow",
  "bull",
  "calf",
  "weanling",
  "store",
  "steer",
  "heifer",
]);

export type GrassGrazingDemandResolution = GrazingDemandResolution;

export function resolveGrassGrazingDemand(input: {
  group: Pick<LivestockGroup, "id" | "category" | "avgWeightKg">;
  headCount: number;
}): GrassGrazingDemandResolution {
  const { group, headCount } = input;

  if (!Number.isFinite(headCount) || headCount <= 0) {
    return {
      status: "unresolved",
      provider: "beef_liveweight_v1",
      groupId: group.id,
      category: group.category,
      headCount,
      reason: "INVALID_HEADCOUNT",
    };
  }

  if (!SUPPORTED_BEEF_CATEGORIES.has(group.category)) {
    return {
      status: "unresolved",
      provider: "beef_liveweight_v1",
      groupId: group.id,
      category: group.category,
      headCount,
      reason: "UNSUPPORTED_CATEGORY",
    };
  }

  const avgWeightKg = group.avgWeightKg?.value;
  if (!Number.isFinite(avgWeightKg) || (avgWeightKg ?? 0) <= 0) {
    return {
      status: "unresolved",
      provider: "beef_liveweight_v1",
      groupId: group.id,
      category: group.category,
      headCount,
      reason: "MISSING_AVG_WEIGHT",
      missing: ["avg_weight_kg"],
    };
  }

  const kgDmPerHeadDay = avgWeightKg! * BEEF_GRAZING_DM_FRACTION_OF_LIVEWEIGHT;
  return {
    status: "resolved",
    provider: "beef_liveweight_v1",
    groupId: group.id,
    category: group.category,
    headCount,
    kgDmPerHeadDay,
    dailyDemandKgDm: kgDmPerHeadDay * headCount,
    confidence: "medium",
    ruleId: BEEF_GRAZING_DEMAND_RULE_ID,
    source: BEEF_GRAZING_DEMAND_SOURCE,
    evidence: [
      {
        key: "avg_weight_kg",
        label: "Average liveweight",
        value: avgWeightKg!,
        unit: "kg",
        source: group.avgWeightKg?.source ?? "Recorded average liveweight",
      },
      {
        key: "head_count",
        label: "Movement headcount",
        value: headCount,
        unit: "head",
        source: "Recorded cattle movement",
      },
      {
        key: "intake_fraction",
        label: "Daily grazing intake basis",
        value: BEEF_GRAZING_DM_FRACTION_OF_LIVEWEIGHT * 100,
        unit: "% liveweight/day",
        source: BEEF_GRAZING_DEMAND_SOURCE,
      },
    ],
  };
}
