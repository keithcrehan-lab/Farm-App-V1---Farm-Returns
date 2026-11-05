import "server-only";

import { deriveCattleGroupProductionPlanMetrics, type CattleGroupProductionPlan, type CattleGroupProductionPlanMetrics } from "@/domain/cattle-group-production-plan";
import { resolveGrassGrazingDemand } from "@/domain/grass-grazing-demand";
import type { GrazingDemandResolution } from "@/domain/grazing-demand";
import type { Field, LivestockGroup } from "@/domain/types";
import type { GrazingFieldSession } from "@/domain/grazing-field-pressure";
import { activeFields } from "@/domain/types";
import { listCattleGroupProductionPlansForFarm } from "@/lib/farm-data/cattle-group-production-plans";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";

export interface CattleOperationalGroupView {
  groupId: string;
  category: LivestockGroup["category"];
  system: LivestockGroup["system"];
  goal?: LivestockGroup["goal"];
  sex?: LivestockGroup["sex"];
  breed?: string;
  avgAgeMonths?: number;
  headCount?: number;
  averageWeightKg?: number;
  averageWeightSource?: string;
  currentField?: { id: string; name: string; since: string };
  productionPlan?: CattleGroupProductionPlan;
  productionMetrics: CattleGroupProductionPlanMetrics;
  grazingDemand?: GrazingDemandResolution;
}

export interface CattleOperationalView {
  state: "OK" | "UNAVAILABLE";
  fields: Pick<Field, "id" | "name" | "areaHa">[];
  groups: CattleOperationalGroupView[];
}

export async function loadCattleOperationalView(
  farmId: string,
  groups: readonly LivestockGroup[],
  asOfDate: string,
): Promise<CattleOperationalView> {
  try {
    const [fields, sessions, plans] = await Promise.all([
      listFieldsForFarm(farmId),
      listGrazingFieldSessionsForFarm(farmId),
      listCattleGroupProductionPlansForFarm(farmId),
    ]);
    const usableFields = activeFields(fields);
    const fieldNameById = new Map(usableFields.map((field) => [field.id, field.name]));
    const openSessionByGroup = new Map(
      sessions
        .filter((session): session is GrazingFieldSession & { endedAt?: undefined } => !session.endedAt)
        .map((session) => [session.livestockGroupId, session]),
    );
    const planByGroup = new Map(plans.map((plan) => [plan.groupId, plan]));

    return {
      state: "OK",
      fields: usableFields.map(({ id, name, areaHa }) => ({ id, name, areaHa })),
      groups: groups.map((group) => {
        const current = openSessionByGroup.get(group.id);
        const currentFieldName = current ? fieldNameById.get(current.fieldId) : undefined;
        const headCount = Number.isFinite(group.count.value) ? group.count.value : undefined;
        const averageWeightKg = group.avgWeightKg && Number.isFinite(group.avgWeightKg.value)
          ? group.avgWeightKg.value
          : undefined;
        const plan = planByGroup.get(group.id);
        const productionMetrics = deriveCattleGroupProductionPlanMetrics({
          plan,
          currentWeightKg: averageWeightKg,
          headCount,
          asOfDate,
        });
        const grazingDemand = headCount === undefined
          ? undefined
          : resolveGrassGrazingDemand({ group, headCount });

        return {
          groupId: group.id,
          category: group.category,
          system: group.system,
          ...(group.goal ? { goal: group.goal } : {}),
          ...(group.sex ? { sex: group.sex } : {}),
          ...(group.breed?.trim() ? { breed: group.breed.trim() } : {}),
          ...(group.avgAgeMonths !== undefined && Number.isFinite(group.avgAgeMonths) ? { avgAgeMonths: group.avgAgeMonths } : {}),
          ...(headCount !== undefined ? { headCount } : {}),
          ...(averageWeightKg !== undefined && group.avgWeightKg
            ? { averageWeightKg, averageWeightSource: group.avgWeightKg.source }
            : {}),
          ...(current && currentFieldName
            ? { currentField: { id: current.fieldId, name: currentFieldName, since: current.startedAt } }
            : {}),
          ...(plan ? { productionPlan: plan } : {}),
          productionMetrics,
          ...(grazingDemand ? { grazingDemand } : {}),
        };
      }),
    };
  } catch (error) {
    console.error("[cattle-operational] load failed", error);
    return { state: "UNAVAILABLE", fields: [], groups: [] };
  }
}
