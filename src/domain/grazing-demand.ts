import type { LivestockCategory } from "@/domain/types";

/**
 * Common grazing-demand contract consumed by Grass.
 *
 * Grass owns the time/field mass balance. It must not know how an animal's
 * nutritional requirement was derived. Today the provider is the beef
 * liveweight rule; future providers can use individual-animal goals,
 * diet/nutrition models or dairy lactation state and still return this shape.
 */
export type GrazingDemandProvider =
  | "beef_liveweight_v1"
  | "animal_nutrition"
  | "dairy_nutrition";

export type GrazingDemandConfidence = "high" | "medium" | "low";

export interface GrazingDemandEvidence {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  source: string;
}

export type GrazingDemandResolution =
  | {
      status: "resolved";
      provider: GrazingDemandProvider;
      groupId: string;
      category: LivestockCategory;
      headCount: number;
      kgDmPerHeadDay: number;
      dailyDemandKgDm: number;
      confidence: GrazingDemandConfidence;
      source: string;
      ruleId: string;
      evidence: readonly GrazingDemandEvidence[];
    }
  | {
      status: "unresolved";
      provider?: GrazingDemandProvider;
      groupId: string;
      category: LivestockCategory;
      headCount: number;
      reason:
        | "UNSUPPORTED_CATEGORY"
        | "MISSING_AVG_WEIGHT"
        | "INVALID_HEADCOUNT"
        | "GROUP_NOT_FOUND"
        | "NUTRITION_INPUTS_INCOMPLETE";
      missing?: readonly string[];
    };
