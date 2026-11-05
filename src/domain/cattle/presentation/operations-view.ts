import type { CattleGroupProductionPlan, CattleGroupProductionPlanMetrics } from "@/domain/cattle-group-production-plan";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import type { GrazingDemandResolution } from "@/domain/grazing-demand";
import { formatDayMonth, formatKgNumber } from "./format";
import { listingOf, unavailableListing, type Listing, type SealedInput } from "./view-state";
import type { DisplayState } from "./display-states";
import type { FieldVM, MetricVM } from "./animal-profile";
import { sealGroupNutritionContext, type GroupNutritionContext } from "./nutrition-plan-view";
import { buildProductionAdvisoryVM, PRODUCTION_ADVISORY_UNAVAILABLE, type GroupAnimalFacts, type ProductionAdvisoryVM } from "./production-advisory";

const ds = (code: string, label: string, detail: string | null = null): DisplayState => ({
  code,
  label,
  tone: "unknown",
  detail,
});

const OPS = {
  unavailable: ds("CATTLE_OPS:UNAVAILABLE", "Operational cattle data couldn't be read", "Group movement and production-plan context are unavailable right now."),
  fieldsEmpty: ds("CATTLE_OPS:FIELDS_EMPTY", "No active fields", "Map an active field before recording a cattle movement."),
  locationMissing: ds("CATTLE_OPS:LOCATION_MISSING", "Field movement not recorded", "Record a group movement to link this group to a field and Grass."),
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
  goalLabel: string;
  planButtonLabel: string;
  headCount: MetricVM;
  currentWeight: MetricVM;
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
  /** Group record facts read by the production advisory (never re-asked). */
  sex?: "male" | "female" | "mixed";
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

export interface CattleOperationsInput {
  state: "OK" | "UNAVAILABLE";
  fields: readonly { id: string; name: string }[];
  groups: readonly CattleOperationsInputGroup[];
}

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

function groupVM(
  group: CattleOperationsInputGroup,
  fields: Listing<CattleOperationalFieldChoiceVM>,
  defaultFieldId: string,
  asOfDate: string,
  animals: GroupAnimalFacts | undefined,
): CattleGroupOperationsVM {
  const location: FieldVM = group.currentField
    ? { label: "Current location", value: group.currentField.name, state: { code: "CATTLE_OPS:LOCATION_KNOWN", label: "Recorded", tone: "neutral", detail: null } }
    : { label: "Current location", value: null, state: OPS.locationMissing };

  const currentWeight = group.averageWeightKg === undefined
    ? unknownMetric("Current avg weight", OPS.weightMissing)
    : knownMetric("Current avg weight", formatKgNumber(group.averageWeightKg), "kg", group.averageWeightSource ?? "Recorded group average");

  const grassDemand =
    group.grazingDemand?.status === "resolved"
      ? knownMetric("Grass demand", formatKgNumber(group.grazingDemand.dailyDemandKgDm), "kg DM/day", "Linked to the canonical cattle movement ledger")
      : unknownMetric("Grass demand", OPS.grassMissing);

  return {
    groupRef: group.groupId,
    overviewLocationLine: group.currentField
      ? `${group.currentField.name} · grazing since ${formatDayMonth(group.currentField.since)}`
      : OPS.locationMissing.label,
    location,
    locationDetail: group.currentField ? dateDistanceLabel(group.currentField.since, asOfDate) : OPS.locationMissing.detail ?? OPS.locationMissing.label,
    fieldChoices: fields,
    defaultFieldId: group.currentField?.id ?? defaultFieldId,
    goalLabel: goalLabel(group.goal),
    planButtonLabel: group.productionPlan ? "Save plan" : "Save production plan",
    headCount: group.headCount === undefined
      ? unknownMetric("Head", OPS.headMissing)
      : knownMetric("Head", String(group.headCount), "head"),
    currentWeight,
    grassDemand,
    nutrition: sealGroupNutritionContext({
      state: "OK",
      category: group.category,
      ...(group.goal ? { goal: group.goal } : {}),
      ...(group.system ? { system: group.system } : {}),
      ...(group.headCount !== undefined ? { headCount: group.headCount } : {}),
      ...(group.averageWeightKg !== undefined ? { averageWeightKg: group.averageWeightKg } : {}),
      ...(group.productionPlan ? { plan: group.productionPlan } : {}),
    }),
    advisory: buildProductionAdvisoryVM({
      category: group.category,
      ...(group.goal ? { goal: group.goal } : {}),
      ...(group.system ? { system: group.system } : {}),
      ...(group.sex ? { groupSex: group.sex } : {}),
      ...(group.breed ? { groupBreed: group.breed } : {}),
      ...(group.avgAgeMonths !== undefined ? { groupAvgAgeMonths: group.avgAgeMonths } : {}),
      ...(group.averageWeightKg !== undefined ? { groupAverageWeightKg: group.averageWeightKg } : {}),
      ...(group.averageWeightSource ? { groupAverageWeightSource: group.averageWeightSource } : {}),
      ...(animals ? { animals } : {}),
      currentFieldRecorded: group.currentField !== undefined,
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
  const occupied = new Set(input.groups.flatMap((group) => group.currentField ? [group.currentField.id] : [])).size;
  const groups = input.groups.map((group) => groupVM(group, fieldChoices, defaultFieldId, asOfDate, animalFacts[group.groupId]));
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
    goalLabel: OPS.unavailable.label,
    planButtonLabel: "Production plan unavailable",
    headCount: unknownMetric("Head", OPS.unavailable),
    currentWeight: unknownMetric("Current avg weight", OPS.unavailable),
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

export function cattlePlanResultMessage(result: { status: string; reasonCode?: string }): string {
  return result.status === "saved"
    ? "Production plan saved."
    : `Production plan wasn't saved: ${reasonText(result.reasonCode)}.`;
}
