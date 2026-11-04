import type { CattleGroupProductionPlan, CattleGroupProductionPlanMetrics, GroupPlanMetric } from "@/domain/cattle-group-production-plan";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import type { GrazingDemandResolution } from "@/domain/grazing-demand";
import { formatAdgNumber, formatDate, formatDayMonth, formatEuroPerKg, formatEuroPrecise, formatKgNumber } from "./format";
import { listingOf, unavailableListing, type Listing } from "./view-state";
import type { DisplayState } from "./display-states";
import type { FieldVM, MetricVM } from "./animal-profile";

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
  targetWeightMissing: ds("CATTLE_OPS:TARGET_WEIGHT_MISSING", "Target weight not set"),
  targetDateMissing: ds("CATTLE_OPS:TARGET_DATE_MISSING", "Target date not set"),
  metricMissing: ds("CATTLE_OPS:PLAN_INPUT_MISSING", "Needs plan inputs"),
  grassMissing: ds("CATTLE_OPS:GRASS_DEMAND_MISSING", "Grass demand unresolved", "A valid beef group average weight and headcount are needed."),
} as const;

export interface CattleOperationalFieldChoiceVM {
  id: string;
  label: string;
}

export interface CattleGroupPlanFormVM {
  targetKg: string;
  targetDate: string;
  dietLabel: string;
  concentrateKgHeadDay: string;
  concentratePriceEurT: string;
  forageCostEurHeadDay: string;
  housingCostEurHeadDay: string;
  notes: string;
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
  currentWeight: MetricVM;
  targetWeight: MetricVM;
  requiredAdg: MetricVM;
  grassDemand: MetricVM;
  feedCostHeadDay: MetricVM;
  feedCostGroupDay: MetricVM;
  costPerTargetKg: MetricVM;
  form: CattleGroupPlanFormVM;
  returnOnGain: {
    title: string;
    subtitle: string;
    waitingTitle: string;
    waitingDetail: string;
    note: string;
    costLabel: string;
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

function metricFromPlan(metric: GroupPlanMetric, label: string, unit: string, kind: "adg" | "money" | "moneyPerKg"): MetricVM {
  if (metric.status === "unknown") return unknownMetric(label, OPS.metricMissing);
  const value =
    kind === "adg"
      ? formatAdgNumber(metric.value)
      : kind === "moneyPerKg"
        ? formatEuroPerKg(metric.value)
        : formatEuroPrecise(metric.value);
  return knownMetric(label, value, kind === "moneyPerKg" ? null : unit);
}

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

function formOf(plan: CattleGroupProductionPlan | undefined): CattleGroupPlanFormVM {
  return {
    targetKg: plan?.targetWeightKg === undefined ? "" : String(plan.targetWeightKg),
    targetDate: plan?.targetDate ?? "",
    dietLabel: plan?.dietLabel ?? "",
    concentrateKgHeadDay: plan?.concentrateKgHeadDay === undefined ? "" : String(plan.concentrateKgHeadDay),
    concentratePriceEurT: plan?.concentratePriceEurT === undefined ? "" : String(plan.concentratePriceEurT),
    forageCostEurHeadDay: plan?.forageCostEurHeadDay === undefined ? "" : String(plan.forageCostEurHeadDay),
    housingCostEurHeadDay: plan?.housingCostEurHeadDay === undefined ? "" : String(plan.housingCostEurHeadDay),
    notes: plan?.notes ?? "",
  };
}

function groupVM(group: CattleOperationsInputGroup, fields: Listing<CattleOperationalFieldChoiceVM>, defaultFieldId: string, asOfDate: string): CattleGroupOperationsVM {
  const location: FieldVM = group.currentField
    ? { label: "Current location", value: group.currentField.name, state: { code: "CATTLE_OPS:LOCATION_KNOWN", label: "Recorded", tone: "neutral", detail: null } }
    : { label: "Current location", value: null, state: OPS.locationMissing };

  const currentWeight = group.averageWeightKg === undefined
    ? unknownMetric("Current avg weight", OPS.weightMissing)
    : knownMetric("Current avg weight", formatKgNumber(group.averageWeightKg), "kg", group.averageWeightSource ?? "Recorded group average");

  const targetWeight = group.productionPlan?.targetWeightKg === undefined
    ? unknownMetric("Target weight", OPS.targetWeightMissing, group.productionPlan?.targetDate ? `Target date ${formatDate(group.productionPlan.targetDate)}` : OPS.targetDateMissing.label)
    : knownMetric(
        "Target weight",
        formatKgNumber(group.productionPlan.targetWeightKg),
        "kg",
        group.productionPlan.targetDate ? `by ${formatDate(group.productionPlan.targetDate)}` : OPS.targetDateMissing.label,
      );

  const grassDemand =
    group.grazingDemand?.status === "resolved"
      ? knownMetric("Grass demand", formatKgNumber(group.grazingDemand.dailyDemandKgDm), "kg DM/day", "Linked to the canonical cattle movement ledger")
      : unknownMetric("Grass demand", OPS.grassMissing);

  const costPerKg = group.productionMetrics.feedCostPerKgTargetGain.status === "known"
    ? formatEuroPerKg(group.productionMetrics.feedCostPerKgTargetGain.value)
    : "Cost of gain waiting for plan inputs";

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
    planButtonLabel: group.productionPlan ? "Edit plan" : "Set production plan",
    currentWeight,
    targetWeight,
    requiredAdg: metricFromPlan(group.productionMetrics.requiredAdgKgDay, "Required ADG", "kg/day", "adg"),
    grassDemand,
    feedCostHeadDay: metricFromPlan(group.productionMetrics.feedCostEurHeadDay, "Feed cost", "/head/day", "money"),
    feedCostGroupDay: metricFromPlan(group.productionMetrics.feedCostEurGroupDay, "Group/day", "/day", "money"),
    costPerTargetKg: metricFromPlan(group.productionMetrics.feedCostPerKgTargetGain, "Cost / target kg", "", "moneyPerKg"),
    form: formOf(group.productionPlan),
    returnOnGain: {
      title: "Return on gain",
      subtitle: "Cost of the next kg versus the value created by that kg.",
      waitingTitle: "Waiting for a validated value-of-gain series",
      waitingDetail: "A trajectory or crossover point is only shown when both sides of the comparison have defensible evidence.",
      note: "Farm Return will mark an economic optimum only when a validated market-value source and a defensible feed-response model are available.",
      costLabel: costPerKg,
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

export function buildCattleOperationsVM(input: CattleOperationsInput | undefined, asOfDate: string): CattleOperationsVM {
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
  const groups = input.groups.map((group) => groupVM(group, fieldChoices, defaultFieldId, asOfDate));
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
    currentWeight: unknownMetric("Current avg weight", OPS.unavailable),
    targetWeight: unknownMetric("Target weight", OPS.unavailable),
    requiredAdg: unknownMetric("Required ADG", OPS.unavailable),
    grassDemand: unknownMetric("Grass demand", OPS.unavailable),
    feedCostHeadDay: unknownMetric("Feed cost", OPS.unavailable),
    feedCostGroupDay: unknownMetric("Group/day", OPS.unavailable),
    costPerTargetKg: unknownMetric("Cost / target kg", OPS.unavailable),
    form: {
      targetKg: "",
      targetDate: "",
      dietLabel: "",
      concentrateKgHeadDay: "",
      concentratePriceEurT: "",
      forageCostEurHeadDay: "",
      housingCostEurHeadDay: "",
      notes: "",
    },
    returnOnGain: {
      title: "Return on gain",
      subtitle: "Cost of the next kg versus the value created by that kg.",
      waitingTitle: OPS.unavailable.label,
      waitingDetail: OPS.unavailable.detail ?? OPS.unavailable.label,
      note: "The economic view remains unavailable until the operational cattle data can be read.",
      costLabel: OPS.unavailable.label,
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
