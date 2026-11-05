/**
 * Manage herd — the read-only context shown beside each group's own record. Manage herd edits only what the
 * `livestock_groups` row owns (name, breed, and the headcount while no animal is recorded individually); everything
 * else is read here from its owning record and changed in that record's workflow:
 *
 * - individual count / latest weighing: the real cattle evaluation (`loadRealCattle` → `realHerdView`);
 * - current field: the group's open `grazing_field_sessions` row (`loadCattleOperationalView`);
 * - production target and required ADG: `cattle_group_production_plans` via `deriveCattleGroupProductionPlanMetrics`.
 *
 * Nothing is computed afresh and nothing is written. A source that can't be read is UNAVAILABLE (said as such), never
 * replaced by a guess; the group itself still renders from the farm store.
 */

import "server-only";

import type { LivestockGroup } from "@/domain/types";
import { formatAdg, formatDate, formatKgNumber } from "@/domain/cattle/presentation/format";
import { loadCattleOperationalView, type CattleOperationalView } from "./operational-view";
import { loadRealCattle, realHerdView, type RealEvaluation } from "./real-service";

export type ManageHerdFact = { state: "KNOWN"; value: string; detail: string } | { state: "NOT_RECORDED"; detail: string } | { state: "UNAVAILABLE"; detail: string };

export interface ManageHerdGroupContext {
  groupId: string;
  /** Individually recorded animals in the group; `null` when the animal records couldn't be read. */
  individuals: number | null;
  /** The stored group headcount disagrees with the individual records (shown, neither figure overwritten). */
  headcountNote: string | null;
  /** Current field from the open grazing session; NOT_RECORDED when there is none (no field is assumed). */
  currentField: ManageHerdFact;
  /** The last weighing of any animal in the group (an individual fact, not a group average). */
  latestIndividualWeight: ManageHerdFact;
  production: {
    target: ManageHerdFact;
    requiredAdg: ManageHerdFact;
    hasTarget: boolean;
  };
}

export interface ManageHerdContext {
  state: "OK" | "PARTIAL" | "UNAVAILABLE";
  groups: Record<string, ManageHerdGroupContext>;
}

export const MANAGE_HERD_COPY = {
  animalsUnavailable: "Individual animal records couldn't be read just now.",
  movementsUnavailable: "Field movements couldn't be read just now.",
  noOpenMovement: "No current field movement is recorded for this group.",
  plansUnavailable: "The production plan couldn't be read just now.",
  noTarget: "No target set",
  noTargetDetail: "Set a target weight and date in the group's production plan.",
  noIndividualWeight: "No individual animal in this group has a weight recorded.",
  noIndividuals: "No individual animals are recorded in this group.",
} as const;

const unavailable = (detail: string): ManageHerdFact => ({ state: "UNAVAILABLE", detail });
const notRecorded = (detail: string): ManageHerdFact => ({ state: "NOT_RECORDED", detail });

const ADG_REASON: Readonly<Record<string, string>> = {
  CURRENT_GROUP_WEIGHT_REQUIRED: "Needs a current group weight.",
  TARGET_DATE_REQUIRED: "Needs a target date.",
  TARGET_DATE_INVALID: "The target date can't be read.",
  TARGET_DATE_NOT_IN_FUTURE: "The target date isn't in the future.",
  TARGET_WEIGHT_AND_CURRENT_WEIGHT_REQUIRED: "Needs a target weight and a current group weight.",
  TARGET_WEIGHT_NOT_ABOVE_CURRENT_WEIGHT: "The target weight isn't above the current weight.",
};

type OpsGroup = CattleOperationalView["groups"][number];

function currentFieldOf(operational: CattleOperationalView | null, ops: OpsGroup | undefined): ManageHerdFact {
  if (operational?.state !== "OK") return unavailable(MANAGE_HERD_COPY.movementsUnavailable);
  if (!ops?.currentField) return notRecorded(MANAGE_HERD_COPY.noOpenMovement);
  return { state: "KNOWN", value: ops.currentField.name, detail: `Since ${formatDate(ops.currentField.since)} · from the latest field movement` };
}

function productionOf(operational: CattleOperationalView | null, ops: OpsGroup | undefined): ManageHerdGroupContext["production"] {
  if (operational?.state !== "OK") {
    return { target: unavailable(MANAGE_HERD_COPY.plansUnavailable), requiredAdg: unavailable(MANAGE_HERD_COPY.plansUnavailable), hasTarget: false };
  }
  const plan = ops?.productionPlan;
  const weight = plan?.targetWeightKg;
  const date = plan?.targetDate;
  if (weight === undefined && date === undefined) {
    return { target: notRecorded(MANAGE_HERD_COPY.noTargetDetail), requiredAdg: notRecorded(MANAGE_HERD_COPY.noTargetDetail), hasTarget: false };
  }
  const value = [weight !== undefined ? `${formatKgNumber(weight)} kg` : "Weight not set", date ? `by ${formatDate(date)}` : "date not set"].join(" ");
  const adg = ops?.productionMetrics.requiredAdgKgDay;
  const requiredAdg: ManageHerdFact =
    adg?.status === "known"
      ? { state: "KNOWN", value: formatAdg(adg.value), detail: "From the production plan's target and the group's current weight." }
      : notRecorded(adg ? (ADG_REASON[adg.reason] ?? "Not enough recorded to work this out.") : "Not enough recorded to work this out.");
  return { target: { state: "KNOWN", value, detail: "From the group's production plan." }, requiredAdg, hasTarget: true };
}

/** Pure: the per-group context from whichever sources loaded (`null` = that source couldn't be read). */
export function manageHerdContextOf(
  groupIds: readonly string[],
  evaluation: RealEvaluation | null,
  operational: CattleOperationalView | null,
): ManageHerdContext {
  const continuity = evaluation ? realHerdView(evaluation).continuity : null;
  const continuityGroups = continuity?.groups.state === "ITEMS" ? continuity.groups.items : [];
  const groups: Record<string, ManageHerdGroupContext> = {};

  for (const groupId of groupIds) {
    const fact = evaluation?.records.groupFacts.find((f) => f.groupRef === groupId);
    const ops = operational?.groups.find((g) => g.groupId === groupId);
    const individuals = fact ? fact.individuals : null;
    const headcountNote =
      fact && fact.individuals > 0 && fact.headcount !== null && fact.headcount !== fact.individuals
        ? `The group record holds ${fact.headcount} head, but ${fact.individuals} ${fact.individuals === 1 ? "animal is" : "animals are"} recorded individually. Neither figure is changed here.`
        : null;

    let latestIndividualWeight: ManageHerdFact;
    if (individuals === null) latestIndividualWeight = unavailable(MANAGE_HERD_COPY.animalsUnavailable);
    else if (individuals === 0) latestIndividualWeight = notRecorded(MANAGE_HERD_COPY.noIndividuals);
    else {
      const latest = continuityGroups.find((g) => g.groupRef === groupId)?.latestWeight;
      latestIndividualWeight =
        latest?.state === "KNOWN"
          ? { state: "KNOWN", value: `${latest.value} ${latest.unit}`, detail: `${latest.label} · ${latest.summary}` }
          : notRecorded(MANAGE_HERD_COPY.noIndividualWeight);
    }

    groups[groupId] = {
      groupId,
      individuals,
      headcountNote,
      currentField: currentFieldOf(operational, ops),
      latestIndividualWeight,
      production: productionOf(operational, ops),
    };
  }

  const state = evaluation && operational?.state === "OK" ? "OK" : evaluation || operational?.state === "OK" ? "PARTIAL" : "UNAVAILABLE";
  return { state, groups };
}

/** The route loader: the farm is resolved server-side; any failure leaves that source UNAVAILABLE. */
export async function loadManageHerdContext(): Promise<ManageHerdContext> {
  try {
    const real = await loadRealCattle();
    if (real.state !== "OK") return { state: "UNAVAILABLE", groups: {} };
    const e = real.evaluation;
    const groups: readonly LivestockGroup[] = e.sourceGroups;
    const asOfDate = e.outputs.viewpoint.effectiveAt.slice(0, 10);
    const operational = await loadCattleOperationalView(e.farmId, groups, asOfDate);
    return manageHerdContextOf(groups.map((g) => g.id), e, operational);
  } catch (error) {
    console.error("[manage-herd] context load failed", error);
    return { state: "UNAVAILABLE", groups: {} };
  }
}
