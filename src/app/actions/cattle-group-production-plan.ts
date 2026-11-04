"use server";

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { saveCattleGroupProductionPlan, type SaveCattleGroupProductionPlanInput } from "@/lib/farm-data/cattle-group-production-plans";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export async function saveCattleGroupProductionPlanAction(input: {
  groupId: string;
  targetKg?: number | null;
  targetDate?: string | null;
  dietLabel?: string | null;
  concentrateKgHeadDay?: number | null;
  concentratePriceEurT?: number | null;
  forageCostEurHeadDay?: number | null;
  housingCostEurHeadDay?: number | null;
  notes?: string | null;
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

  await saveCattleGroupProductionPlan(farm.id, group.id, p);
  revalidatePath("/cattle");
  revalidatePath(`/cattle/groups/${group.id}`);
  revalidatePath("/plan");
  return { status: "saved" };
}
