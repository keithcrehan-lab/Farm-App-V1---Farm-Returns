import type { CattleGroupProductionPlan, CattleGroupProductionPlanMetrics } from "@/domain/cattle-group-production-plan";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import type { GrazingDemandResolution } from "@/domain/grazing-demand";
import { formatDayMonth, formatKgNumber } from "./format";
import { listingOf, unavailableListing, type Listing, type SealedInput } from "./view-state";
import type { DisplayState } from "./display-states";
import type { FieldVM, MetricVM } from "./animal-profile";
import { sealGroupNutritionContext, type GroupNutritionContext } from "./nutrition-plan-view";
import { buildProductionAdvisoryVM, PRODUCTION_ADVISORY_UNAVAILABLE, type GroupAnimalFacts, type ProductionAdvisoryVM } from "./production-advisory";
import { groupLiveweightOf, groupLiveweightWords, usableGroupMeanKg, type GroupLiveweight } from "./group-liveweight";

const ds = (code: string, label: string, detail: string | null = null): DisplayState => ({
  code,
  label,
  tone: "unknown",
  detail,
});

const OPS = {
  unavailable: ds("CATTLE_OPS:UNAVAILABLE", "Operational cattle data couldn't be read", "Group movement and production-plan context are unavailable right now."),
  fieldsEmpty: ds("CATTLE_OPS:FIELDS_EMPTY", "No active fields", "Map an active field before recording a cattle movement."),
  housingEmpty: ds("CATTLE_OPS:HOUSING_EMPTY", "No sheds recorded", "Add a shed in Housing before moving cattle into housing."),
  locationMissing: ds("CATTLE_OPS:LOCATION_MISSING", "Location not recorded", "Record a move to a field or a shed to set where this group is."),
  locationConflict: ds("CATTLE_OPS:LOCATION_CONFLICT", "Field and shed both recorded", "An open field session and housing are both recorded. Record where the group is now; the move closes the other."),
  weightMissing: ds("CATTLE_OPS:WEIGHT_MISSING", "Group average not recorded", "A group average liveweight is needed for group-level demand and target economics."),
  headMissing: ds("CATTLE_OPS:HEAD_MISSING", "Head count not recorded", "A head count is needed to size the group's feed requirement."),
  grassMissing: ds("CATTLE_OPS:GRASS_DEMAND_MISSING", "Grass demand unresolved", "A valid beef group average weight and headcount are needed."),
} as const;

export interface CattleOperationalFieldChoiceVM {
  id: string;
  label: string;
}

export interface CattleGroupOperationsVM {
  groupRef: string;
  overviewLocationLine: string;
  location: FieldVM;
  locationDetail: string;
  fieldChoices: Listing<CattleOperationalFieldChoiceVM>;
  defaultFieldId: string;
  /** Sheds the group can be moved into (the farm's housing records). */
  housingChoices: Listing<CattleOperationalFieldChoiceVM>;
  defaultHousingId: string;
  /** The current management location's label for the move form ("Move to another field", …). */
  moveToFieldLabel: string;
  moveToHousingLabel: string;
  goalLabel: string;
  /** Why the farmer's own target is secondary (no target is derived without validated trajectory evidence). */
  productionTargetNote: string;
  planButtonLabel: string;
  headCount: MetricVM;
  currentWeight: MetricVM;
  /** Coverage and provenance of the current weight, always present (never a component-written fallback). */
  currentWeightDetail: string;
  grassDemand: MetricVM;
  /** Goal-first nutrition plan context — read only by `buildGroupNutritionVM`. */
  nutrition: SealedInput<GroupNutritionContext>;
  /** Production recommendation: readiness, confidence and economics (`production-advisory.ts`). */
  advisory: ProductionAdvisoryVM;
  returnOnGain: {
    title: string;
    subtitle: string;
    waitingTitle: string;
    waitingDetail: string;
    note: string;
  };
  health: { title: string; lead: string; detail: string };
  market: { title: string; lead: string; detail: string };
}

export interface CattleOperationsVM {
  fieldsOccupied: MetricVM;
  groups: Listing<CattleGroupOperationsVM>;
}

export interface CattleOperationsInputGroup {
  groupId: string;
  category: LivestockCategory;
  goal?: LivestockGoal;
  system?: "grazing" | "housed";
  /** The shed recorded on the group (only meaningful while housed). */
  currentHousing?: { id: string; name: string };
  /** Group record facts read by the production advisory (never re-asked). */
  sex?: "male" | "female" | "mixed";
  breed?: string;
  avgAgeMonths?: number;
  headCount?: number;
  /** The group record's own stored average (used only while no animal is recorded individually). */
  averageWeightKg?: number;
  averageWeightSource?: string;
  /** The resolved current liveweight with coverage; derived from `animalFacts` and the stored average when absent. */
  liveweight?: GroupLiveweight;
  currentField?: { id: string; name: string; since: string };
  productionPlan?: CattleGroupProductionPlan;
  productionMetrics: CattleGroupProductionPlanMetrics;
  grazingDemand?: GrazingDemandResolution;
}

export interface CattleOperationsInput {
  state: "OK" | "UNAVAILABLE";
  fields: readonly { id: string; name: string }[];
  /** The farm's sheds; absent = none recorded. */
  housing?: readonly { id: string; name: string }[];
  groups: readonly CattleOperationsInputGroup[];
}

const PRODUCTION_TARGET_NOTE =
  "Secondary to the recommendation above: your own goal, target weight and date drive the feeding plan below. Farm Return doesn't derive a target for you, because it holds no validated trajectory evidence.";

const unknownMetric = (label: string, state: DisplayState, caption: string | null = null): MetricVM => ({
  label,
  value: null,
  unit: null,
  state,
  caption,
});

const knownMetric = (label: string, value: string, unit: string | null, caption: string | null = null): MetricVM => ({
  label,
  value,
  unit,
  state: { code: "CATTLE_OPS:KNOWN", label: "Recorded", tone: "neutral", detail: null },
  caption,
});

function goalLabel(goal: LivestockGoal | undefined): string {
  if (goal === "maintain") return "Maintain";
  if (goal === "grow") return "Grow";
  if (goal === "breed") return "Breed";
  if (goal === "sell_store") return "Sell as store";
  if (goal === "finish_slaughter") return "Finish to slaughter";
  return "Production goal not set";
}

function dateDistanceLabel(since: string, asOfDate: string): string {
  const start = Date.parse(since);
  const end = Date.parse(`${asOfDate}T23:59:59.999Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return `Since ${formatDayMonth(since)}`;
  const days = Math.floor((end - start) / 86_400_000);
  return `Since ${formatDayMonth(since)} · ${days} grazing day${days === 1 ? "" : "s"}`;
}

interface Placement {
  location: FieldVM;
  detail: string;
  overview: string;
  /** The production system as the advisory may use it (unresolved on a conflict). */
  system: "grazing" | "housed" | undefined;
  conflict: boolean;
}

const placed = (value: string): FieldVM => ({ label: "Current location", value, state: { code: "CATTLE_OPS:LOCATION_KNOWN", label: "Recorded", tone: "neutral", detail: null } });

/** One authoritative current location: a field (open grazing session) OR a shed — a group recorded in both is a conflict. */
function placementOf(group: CattleOperationsInputGroup, asOfDate: string): Placement {
  if (group.currentField && group.system === "housed") {
    return { location: { label: "Current location", value: null, state: OPS.locationConflict }, detail: OPS.locationConflict.detail ?? OPS.locationConflict.label, overview: OPS.locationConflict.label, system: undefined, conflict: true };
  }
  if (group.currentField) {
    return {
      location: placed(group.currentField.name),
      detail: dateDistanceLabel(group.currentField.since, asOfDate),
      overview: `${group.currentField.name} · grazing since ${formatDayMonth(group.currentField.since)}`,
      system: "grazing",
      conflict: false,
    };
  }
  if (group.system === "housed") {
    const shed = group.currentHousing?.name;
    return {
      location: placed(shed ? `Housed · ${shed}` : "Housed"),
      detail: shed ? "Housed. Moving the group to a field closes housing and starts a dated grazing session." : "Housed, but the shed isn't recorded. Record a move into housing to set the shed.",
      overview: shed ? `Housed · ${shed}` : "Housed · shed not recorded",
      system: "housed",
      conflict: false,
    };
  }
  return {
    location: { label: "Current location", value: null, state: OPS.locationMissing },
    detail: OPS.locationMissing.detail ?? OPS.locationMissing.label,
    overview: OPS.locationMissing.label,
    system: group.system,
    conflict: false,
  };
}

function groupVM(
  group: CattleOperationsInputGroup,
  fields: Listing<CattleOperationalFieldChoiceVM>,
  defaultFieldId: string,
  housing: Listing<CattleOperationalFieldChoiceVM>,
  defaultHousingId: string,
  asOfDate: string,
  animals: GroupAnimalFacts | undefined,
): CattleGroupOperationsVM {
  const placement = placementOf(group, asOfDate);
  const liveweight =
    group.liveweight ??
    groupLiveweightOf(animals, group.averageWeightKg !== undefined ? { kg: group.averageWeightKg, source: group.averageWeightSource ?? "Recorded group average" } : undefined);
  const weightWords = groupLiveweightWords(liveweight);
  const usableWeightKg = usableGroupMeanKg(liveweight);
  const currentWeight: MetricVM =
    weightWords.value === null
      ? unknownMetric("Current avg weight", { code: `CATTLE_OPS:WEIGHT_${liveweight.state}`, label: weightWords.stateLabel, tone: "unknown", detail: weightWords.detail })
      : knownMetric("Current avg weight", weightWords.value, "kg", weightWords.detail);

  const grassDemand =
    group.grazingDemand?.status === "resolved"
      ? knownMetric("Grass demand", formatKgNumber(group.grazingDemand.dailyDemandKgDm), "kg DM/day", "Linked to the canonical cattle movement ledger")
      : unknownMetric("Grass demand", OPS.grassMissing);

  return {
    groupRef: group.groupId,
    overviewLocationLine: placement.overview,
    location: placement.location,
    locationDetail: placement.detail,
    fieldChoices: fields,
    defaultFieldId: group.currentField?.id ?? defaultFieldId,
    housingChoices: housing,
    defaultHousingId: group.currentHousing?.id ?? defaultHousingId,
    moveToFieldLabel: placement.system === "grazing" && !placement.conflict ? "Move to another field" : "Move to a field",
    moveToHousingLabel: placement.system === "housed" && !placement.conflict ? "Move to another shed" : "Move to housing",
    goalLabel: goalLabel(group.goal),
    productionTargetNote: PRODUCTION_TARGET_NOTE,
    planButtonLabel: group.productionPlan ? "Save plan" : "Save production plan",
    headCount: group.headCount === undefined
      ? unknownMetric("Head", OPS.headMissing)
      : knownMetric("Head", String(group.headCount), "head"),
    currentWeight,
    currentWeightDetail: weightWords.detail,
    grassDemand,
    nutrition: sealGroupNutritionContext({
      state: "OK",
      category: group.category,
      ...(group.goal ? { goal: group.goal } : {}),
      ...(group.system ? { system: group.system } : {}),
      ...(group.headCount !== undefined ? { headCount: group.headCount } : {}),
      ...(usableWeightKg !== undefined ? { averageWeightKg: usableWeightKg } : {}),
      ...(group.productionPlan ? { plan: group.productionPlan } : {}),
    }),
    advisory: buildProductionAdvisoryVM({
      category: group.category,
      ...(group.goal ? { goal: group.goal } : {}),
      ...(placement.system ? { system: placement.system } : {}),
      ...(placement.conflict ? { locationConflict: true } : {}),
      ...(group.sex ? { groupSex: group.sex } : {}),
      ...(group.breed ? { groupBreed: group.breed } : {}),
      ...(group.avgAgeMonths !== undefined ? { groupAvgAgeMonths: group.avgAgeMonths } : {}),
      liveweight,
      ...(animals ? { animals } : {}),
      ...(group.productionPlan
        ? {
            plan: {
              ...(group.productionPlan.feedingSituation ? { feedingSituation: group.productionPlan.feedingSituation } : {}),
              ...(group.productionPlan.silageQualityBasis ? { silageQualityBasis: group.productionPlan.silageQualityBasis } : {}),
              ...(group.productionPlan.concentratePriceEurT !== undefined ? { concentratePriceEurT: group.productionPlan.concentratePriceEurT } : {}),
            },
          }
        : {}),
      asOfDate,
    }),
    returnOnGain: {
      title: "Return on gain",
      subtitle: "Cost of the next kg versus the value created by that kg.",
      waitingTitle: "Waiting for a validated value-of-gain series",
      waitingDetail: "A trajectory or crossover point is only shown when both sides of the comparison have defensible evidence.",
      note: "Farm Return will mark an economic optimum only when a validated market-value source and a defensible feed-response model are available.",
    },
    health: {
      title: "Health & medicines",
      lead: "Medicine records are awaiting a production data source.",
      detail: "This area is reserved for treatment history, medicine stock, withdrawal status and barcode-assisted recording. Health status is not inferred from an empty store.",
    },
    market: {
      title: "Market value",
      lead: "Live valuation is awaiting an approved price source for this group.",
      detail: "Current value, value per kg gained and the economic optimum will appear only when the pricing basis matches the animal category and sale system.",
    },
  };
}

/**
 * `animalFacts`: per group, its individually recorded members' facts
 * (`groupAnimalFactsOf`) — read by the production advisory only.
 */
export function buildCattleOperationsVM(
  input: CattleOperationsInput | undefined,
  asOfDate: string,
  animalFacts: Readonly<Record<string, GroupAnimalFacts>> = {},
): CattleOperationsVM {
  if (!input || input.state !== "OK") {
    return {
      fieldsOccupied: unknownMetric("Fields occupied", OPS.unavailable),
      groups: unavailableListing(OPS.unavailable),
    };
  }
  const fieldItems = input.fields.map((field) => ({ id: field.id, label: field.name }));
  const fieldChoices = listingOf(fieldItems, OPS.fieldsEmpty);
  // first-item: active fields preserve the farm store's owner order; this is only the move form's initial selection, never an inferred cattle location.
  const defaultFieldId = fieldItems[0]?.id ?? "";
  const housingItems = (input.housing ?? []).map((shed) => ({ id: shed.id, label: shed.name }));
  const housingChoices = listingOf(housingItems, OPS.housingEmpty);
  // first-item: the farm's sheds in their stored order; only the housing form's initial selection.
  const defaultHousingId = housingItems[0]?.id ?? "";
  const occupied = new Set(input.groups.flatMap((group) => group.currentField && group.system !== "housed" ? [group.currentField.id] : [])).size;
  const groups = input.groups.map((group) => groupVM(group, fieldChoices, defaultFieldId, housingChoices, defaultHousingId, asOfDate, animalFacts[group.groupId]));
  return {
    fieldsOccupied: knownMetric("Fields occupied", String(occupied), "current"),
    groups: listingOf(groups, { code: "CATTLE_OPS:GROUPS_EMPTY", label: "No cattle groups", tone: "unknown", detail: "Create a cattle group before adding a production plan." }),
  };
}

function unavailableGroupVM(groupRef: string): CattleGroupOperationsVM {
  return {
    groupRef,
    overviewLocationLine: OPS.unavailable.label,
    location: { label: "Current location", value: null, state: OPS.unavailable },
    locationDetail: OPS.unavailable.detail ?? OPS.unavailable.label,
    fieldChoices: unavailableListing(OPS.unavailable),
    defaultFieldId: "",
    housingChoices: unavailableListing(OPS.unavailable),
    defaultHousingId: "",
    moveToFieldLabel: "Move to a field",
    moveToHousingLabel: "Move to housing",
    goalLabel: OPS.unavailable.label,
    productionTargetNote: PRODUCTION_TARGET_NOTE,
    planButtonLabel: "Production plan unavailable",
    headCount: unknownMetric("Head", OPS.unavailable),
    currentWeight: unknownMetric("Current avg weight", OPS.unavailable),
    currentWeightDetail: OPS.unavailable.detail ?? OPS.unavailable.label,
    grassDemand: unknownMetric("Grass demand", OPS.unavailable),
    nutrition: sealGroupNutritionContext({ state: "UNAVAILABLE" }),
    advisory: PRODUCTION_ADVISORY_UNAVAILABLE,
    returnOnGain: {
      title: "Return on gain",
      subtitle: "Cost of the next kg versus the value created by that kg.",
      waitingTitle: OPS.unavailable.label,
      waitingDetail: OPS.unavailable.detail ?? OPS.unavailable.label,
      note: "The economic view remains unavailable until the operational cattle data can be read.",
    },
    health: {
      title: "Health & medicines",
      lead: OPS.unavailable.label,
      detail: OPS.unavailable.detail ?? OPS.unavailable.label,
    },
    market: {
      title: "Market value",
      lead: OPS.unavailable.label,
      detail: OPS.unavailable.detail ?? OPS.unavailable.label,
    },
  };
}

export function cattleGroupOperationsFor(view: CattleOperationsVM, groupRef: string): CattleGroupOperationsVM {
  if (view.groups.state !== "ITEMS") return unavailableGroupVM(groupRef);
  return view.groups.items.find((group) => group.groupRef === groupRef) ?? unavailableGroupVM(groupRef);
}

export function cattleGroupLocationLine(view: CattleOperationsVM, groupRef: string): string {
  return cattleGroupOperationsFor(view, groupRef).overviewLocationLine;
}

function reasonText(reasonCode: string | undefined): string {
  return reasonCode ? reasonCode.replaceAll("_", " ").toLowerCase() : "unknown reason";
}

export function cattleMovementResultMessage(result: { status: string; reasonCode?: string }): string {
  return result.status === "saved"
    ? "Movement recorded. Grass and fertiliser context will use the new field."
    : `Movement wasn't saved: ${reasonText(result.reasonCode)}.`;
}

export function cattleHousingMoveResultMessage(result: { status: string; reasonCode?: string }): string {
  if (result.status === "saved") return "Moved into housing. Any open grazing session was closed on that date; Grass and fertiliser context no longer count this group on a field.";
  if (result.status === "unchanged") return "The group is already recorded in that shed. Nothing was changed.";
  return `Move to housing wasn't saved: ${reasonText(result.reasonCode)}.`;
}

export function cattlePlanResultMessage(result: { status: string; reasonCode?: string }): string {
  return result.status === "saved"
    ? "Production plan saved."
    : `Production plan wasn't saved: ${reasonText(result.reasonCode)}.`;
}
