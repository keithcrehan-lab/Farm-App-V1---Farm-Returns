"use server";

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listLivestockGroupsForFarm, updateLivestockGroup } from "@/lib/farm-data/livestock";
import type { LivestockGoal } from "@/domain/types";
import { saveCattleGroupProductionPlan, type SaveCattleGroupProductionPlanInput } from "@/lib/farm-data/cattle-group-production-plans";
import type { CattleFeedingSituation, SilageQualityBasis } from "@/domain/cattle-group-production-plan";
import { silageColumnsFor } from "@/domain/cattle-nutrition-plan";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FEEDING_SITUATIONS: readonly string[] = ["housed_grass_silage", "at_grass", "other_diet"];
const GOALS: readonly string[] = ["maintain", "grow", "breed", "sell_store", "finish_slaughter"];

function validOptionalNumber(value: number | null | undefined): boolean {
  return value === null || value === undefined || (Number.isFinite(value) && value >= 0);
}

export interface CattleProductionMilestone {
  groupId: string;
  groupLabel: string;
  targetDate: string;
  targetWeightKg?: number;
  goal?: string;
}

export type LoadCattleProductionMilestonesResult =
  | { status: "ok"; milestones: CattleProductionMilestone[] }
  | { status: "unavailable" };

export async function loadCattleProductionMilestonesAction(): Promise<LoadCattleProductionMilestonesResult> {
  try {
    const farm = await getFarmForCurrentUser();
    if (!farm) return { status: "unavailable" };
    const [groups, plans] = await Promise.all([
      listLivestockGroupsForFarm(farm.id),
      import("@/lib/farm-data/cattle-group-production-plans").then(({ listCattleGroupProductionPlansForFarm }) =>
        listCattleGroupProductionPlansForFarm(farm.id),
      ),
    ]);
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const milestones = plans
      .filter((plan) => Boolean(plan.targetDate))
      .flatMap((plan) => {
        const group = groupById.get(plan.groupId);
        if (!group || !plan.targetDate) return [];
        return [{
          groupId: group.id,
          groupLabel: group.label,
          targetDate: plan.targetDate,
          ...(plan.targetWeightKg !== undefined ? { targetWeightKg: plan.targetWeightKg } : {}),
          ...(group.goal ? { goal: group.goal } : {}),
        }];
      })
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.groupLabel.localeCompare(b.groupLabel));
    return { status: "ok", milestones };
  } catch (error) {
    console.error("[cattle-production-plan] milestone load failed", error);
    return { status: "unavailable" };
  }
}

export type SaveCattleGroupProductionPlanResult =
  | { status: "saved" }
  | { status: "rejected"; reasonCode: string };

/**
 * Saves the group's production target and feeding context. `goal` (optional) is the group's own goal — owned by
 * `livestock_groups.goal`, set here because the production target editor is where the farmer chooses it; `null`
 * clears it, absent leaves it unchanged. It is validated with everything else before anything is written.
 */
export async function saveCattleGroupProductionPlanAction(input: {
  groupId: string;
  goal?: LivestockGoal | null;
  targetKg?: number | null;
  targetDate?: string | null;
  dietLabel?: string | null;
  concentrateKgHeadDay?: number | null;
  concentratePriceEurT?: number | null;
  forageCostEurHeadDay?: number | null;
  housingCostEurHeadDay?: number | null;
  notes?: string | null;
  feedingSituation?: CattleFeedingSituation | null;
  silageQualityBasis?: SilageQualityBasis | null;
  silageDmdPct?: number | null;
  silageCpPct?: number | null;
  silageAnalysisDate?: string | null;
}): Promise<SaveCattleGroupProductionPlanResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) return { status: "rejected", reasonCode: "NO_FARM" };
  const groups = await listLivestockGroupsForFarm(farm.id);
  const group = groups.find((candidate) => candidate.id === input.groupId);
  if (!group) return { status: "rejected", reasonCode: "GROUP_NOT_FOUND" };

  const p: SaveCattleGroupProductionPlanInput = {
    targetWeightKg: input.targetKg,
    targetDate: input.targetDate,
    dietLabel: input.dietLabel,
    concentrateKgHeadDay: input.concentrateKgHeadDay,
    concentratePriceEurT: input.concentratePriceEurT,
    forageCostEurHeadDay: input.forageCostEurHeadDay,
    housingCostEurHeadDay: input.housingCostEurHeadDay,
    notes: input.notes,
  };
  if (p.targetWeightKg !== null && p.targetWeightKg !== undefined && (!Number.isFinite(p.targetWeightKg) || p.targetWeightKg <= 0)) {
    return { status: "rejected", reasonCode: "TARGET_WEIGHT_INVALID" };
  }
  if (p.targetDate !== null && p.targetDate !== undefined && (!DATE_RE.test(p.targetDate) || !Number.isFinite(Date.parse(`${p.targetDate}T00:00:00.000Z`)))) {
    return { status: "rejected", reasonCode: "TARGET_DATE_INVALID" };
  }
  for (const value of [
    p.concentrateKgHeadDay,
    p.concentratePriceEurT,
    p.forageCostEurHeadDay,
    p.housingCostEurHeadDay,
  ]) {
    if (!validOptionalNumber(value)) return { status: "rejected", reasonCode: "DIET_COST_INPUT_INVALID" };
  }
  if (input.feedingSituation !== undefined && input.feedingSituation !== null && !FEEDING_SITUATIONS.includes(input.feedingSituation)) {
    return { status: "rejected", reasonCode: "FEEDING_SITUATION_INVALID" };
  }
  if (input.goal !== undefined && input.goal !== null && !GOALS.includes(input.goal)) {
    return { status: "rejected", reasonCode: "GOAL_INVALID" };
  }
  const silage = silageColumnsFor(input, new Date().toISOString().slice(0, 10));
  if (!silage.ok) return { status: "rejected", reasonCode: silage.reasonCode };
  Object.assign(p, silage.columns, input.feedingSituation !== undefined ? { feedingSituation: input.feedingSituation } : {});

  if (input.goal !== undefined && (input.goal ?? undefined) !== group.goal) {
    await updateLivestockGroup(group.id, { goal: input.goal, farmerName: farm.ownerName.trim() || "Farmer" });
  }
  await saveCattleGroupProductionPlan(farm.id, group.id, p);
  revalidatePath("/cattle");
  revalidatePath(`/cattle/groups/${group.id}`);
  revalidatePath("/plan");
  return { status: "saved" };
}
