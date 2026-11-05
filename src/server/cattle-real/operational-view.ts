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
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { tracked } from "@/domain/types";
import { groupLiveweightOf, usableGroupMeanKg, type GroupLiveweight } from "@/domain/cattle/presentation";

/**
 * Per group, its current liveweight with coverage (`group-liveweight.ts`), resolved from the cattle evaluation's
 * individual records (`realGroupLiveweights`). A group missing from the map has no animal recorded individually and
 * uses its own stored average.
 */
export type GroupLiveweights = Readonly<Record<string, GroupLiveweight>>;

export interface CattleOperationalGroupView {
  groupId: string;
  category: LivestockGroup["category"];
  system: LivestockGroup["system"];
  goal?: LivestockGroup["goal"];
  sex?: LivestockGroup["sex"];
  currentHousing?: { id: string; name: string };
  breed?: string;
  avgAgeMonths?: number;
  headCount?: number;
  /** The group record's own stored average (legacy; authoritative only while no animal is recorded individually). */
  averageWeightKg?: number;
  averageWeightSource?: string;
  /** The current liveweight with coverage: individual records where they exist, else the stored average. */
  liveweight: GroupLiveweight;
  currentField?: { id: string; name: string; since: string };
  productionPlan?: CattleGroupProductionPlan;
  productionMetrics: CattleGroupProductionPlanMetrics;
  grazingDemand?: GrazingDemandResolution;
}

export interface CattleOperationalView {
  state: "OK" | "UNAVAILABLE";
  fields: Pick<Field, "id" | "name" | "areaHa">[];
  housing?: { id: string; name: string }[];
  groups: CattleOperationalGroupView[];
}

export async function loadCattleOperationalView(
  farmId: string,
  groups: readonly LivestockGroup[],
  asOfDate: string,
  liveweights: GroupLiveweights,
): Promise<CattleOperationalView> {
  try {
    const [fields, sessions, plans, housing] = await Promise.all([
      listFieldsForFarm(farmId),
      listGrazingFieldSessionsForFarm(farmId),
      listCattleGroupProductionPlansForFarm(farmId),
      listHousingForFarm(farmId),
    ]);
    const shedById = new Map(housing.map((shed) => [shed.id, shed.shedName]));
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
      housing: housing.map((shed) => ({ id: shed.id, name: shed.shedName })),
      groups: groups.map((group) => {
        const current = openSessionByGroup.get(group.id);
        const currentFieldName = current ? fieldNameById.get(current.fieldId) : undefined;
        const headCount = Number.isFinite(group.count.value) ? group.count.value : undefined;
        const averageWeightKg = group.avgWeightKg && Number.isFinite(group.avgWeightKg.value)
          ? group.avgWeightKg.value
          : undefined;
        const liveweight = liveweights[group.id]
          ?? groupLiveweightOf(undefined, averageWeightKg !== undefined && group.avgWeightKg ? { kg: averageWeightKg, source: group.avgWeightKg.source } : undefined);
        // Feed sizing and grass demand use only a whole-group current average (full individual coverage or the
        // group record's own average) — a partial covered mean is never passed on (fail closed).
        const usableWeightKg = usableGroupMeanKg(liveweight);
        const plan = planByGroup.get(group.id);
        const productionMetrics = deriveCattleGroupProductionPlanMetrics({
          plan,
          currentWeightKg: usableWeightKg,
          headCount,
          asOfDate,
        });
        const grazingDemand = headCount === undefined
          ? undefined
          : resolveGrassGrazingDemand({
              group: {
                id: group.id,
                category: group.category,
                ...(usableWeightKg !== undefined
                  ? { avgWeightKg: liveweight.state === "GROUP_RECORD" && group.avgWeightKg ? group.avgWeightKg : tracked(usableWeightKg, "verified", "Individual animal records") }
                  : {}),
              },
              headCount,
            });
        const shed = group.system === "housed" && group.housingId ? shedById.get(group.housingId) : undefined;

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
          liveweight,
          ...(shed !== undefined && group.housingId ? { currentHousing: { id: group.housingId, name: shed } } : {}),
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
