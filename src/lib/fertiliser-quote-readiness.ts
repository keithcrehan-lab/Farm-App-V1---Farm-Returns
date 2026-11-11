import type {
  Field,
  FarmGrazingProductionSystem,
  SlurryAllocation,
} from "@/domain/types";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";
import type { FarmFertiliserAggregation } from "@/domain/fertiliser-plan";
import {
  purchaseStatusPresentation,
  unknownReasonMessage,
} from "@/lib/purchase-status-presentation";
import {
  fieldNutrientsHref,
  fieldOverviewFocusHref,
  type FieldNutrientFocusTarget,
} from "@/lib/field-nutrient-focus";
import { slurryAllocationsForPlanningSeason } from "@/lib/fertiliser-planning-season";

export interface FertiliserQuoteReadinessItem {
  id: string;
  fieldId: string;
  fieldName: string;
  label: string;
  complete: boolean;
  href: string;
  detail?: string;
}

export interface FertiliserQuoteReadiness {
  percentage: number;
  completeCount: number;
  totalCount: number;
  remainingCount: number;
  ready: boolean;
  items: FertiliserQuoteReadinessItem[];
}


function hasEvidence<T>(value: T | undefined | null): boolean {
  return value !== undefined && value !== null;
}

function add(
  items: FertiliserQuoteReadinessItem[],
  field: Field,
  key: string,
  label: string,
  complete: boolean,
  href: string,
  detail?: string,
) {
  items.push({
    id: `${field.id}:${key}`,
    fieldId: field.id,
    fieldName: field.name,
    label,
    complete,
    href,
    ...(detail ? { detail } : {}),
  });
}

/**
 * Quote-readiness is intentionally a view of the real P3 input contract,
 * not a second agronomy calculation. Each check corresponds to evidence
 * that P3 or its legal gates actually consume. The final aggregation status
 * is also consulted for inputs that are resolved through wider farm state
 * (for example grazing stocking evidence and slurry evidence).
 */
export function buildFertiliserQuoteReadiness(input: {
  fields: readonly Field[];
  cycles: readonly FieldProductionCycle[];
  slurryAllocations: readonly SlurryAllocation[];
  aggregation: FarmFertiliserAggregation;
  planningSeason?: string;
  currentSeason?: string;
  farmGrazingProductionSystem?: FarmGrazingProductionSystem;
}): FertiliserQuoteReadiness {
  const { fields, cycles, slurryAllocations, aggregation } = input;
  const futureSeason = Boolean(
    input.planningSeason &&
    input.currentSeason &&
    input.planningSeason > input.currentSeason,
  );
  const cycleByField = new Map(cycles.map((cycle) => [cycle.fieldId, cycle]));
  const aggregateByField = new Map(
    aggregation.fields.map((entry) => [entry.fieldId, entry]),
  );
  // Only slurry planned for the season being quoted is P3 input; slurry in
  // any other season must never ask for evidence or block this quote.
  const seasonAllocations = input.planningSeason
    ? slurryAllocationsForPlanningSeason(slurryAllocations, input.planningSeason)
    : slurryAllocations;
  const allocationsByField = new Map<string, SlurryAllocation[]>();
  for (const allocation of seasonAllocations) {
    const list = allocationsByField.get(allocation.fieldId) ?? [];
    list.push(allocation);
    allocationsByField.set(allocation.fieldId, list);
  }

  const items: FertiliserQuoteReadinessItem[] = [];
  for (const field of fields) {
    const nutrientsHref = (focus?: FieldNutrientFocusTarget) =>
      fieldNutrientsHref(field.id, {
        focus,
        planningSeason: input.planningSeason,
      });
    const cycle = cycleByField.get(field.id);
    const aggregate = aggregateByField.get(field.id);
    const missingInputs =
      aggregate?.purchaseStatus.status === "UNKNOWN" ||
      aggregate?.purchaseStatus.status === "WITHHELD_MIXED_EVIDENCE" ||
      aggregate?.purchaseStatus.status === "RECOMMENDED_CREDIT_NOT_COUNTED"
        ? aggregate.purchaseStatus.missingInputs
        : [];

    add(
      items,
      field,
      "area",
      "Mapped field area",
      Number.isFinite(field.areaHa) && field.areaHa > 0,
      fieldOverviewFocusHref(field.id, "field-area", input.planningSeason),
    );
    add(
      items,
      field,
      "cycle",
      "Field use / production cycle",
      Boolean(cycle),
      fieldOverviewFocusHref(field.id, "field-use", input.planningSeason),
      cycle ? undefined : "Choose how this field will be used this season.",
    );

    if (!cycle) continue;

    add(
      items,
      field,
      "p-index",
      "Soil P Index",
      hasEvidence(field.fertility.pIndex?.value),
      nutrientsHref("soil-p"),
    );
    add(
      items,
      field,
      "k-index",
      "Soil K Index",
      hasEvidence(field.fertility.kIndex?.value),
      nutrientsHref("soil-k"),
    );
    add(
      items,
      field,
      "soil-test-date",
      "Soil test date",
      Boolean(field.fertility.verifiedTest?.sampleDate),
      nutrientsHref("soil-test-date"),
    );
    if (!futureSeason) {
      const chemicalAppliedKnown =
        hasEvidence(cycle.evidence.chemicalNAppliedKgHa?.value) &&
        hasEvidence(cycle.evidence.chemicalPAppliedKgHa?.value) &&
        hasEvidence(cycle.evidence.chemicalKAppliedKgHa?.value);
      add(
        items,
        field,
        "prior-fertiliser",
        "Fertiliser already spread this season",
        chemicalAppliedKnown,
        nutrientsHref("prior-fertiliser"),
        chemicalAppliedKnown
          ? "Recorded as one field-level answer. Nutrient amounts are only needed when the answer is Yes."
          : "Answer No once to record N, P and K as zero, or Yes to enter the amounts already applied.",
      );
    }

    if (cycle.cropSystem === "GRASS_GRAZING" || cycle.cropSystem === "GRASS_WHITE_CLOVER_GRAZING") {
      add(
        items,
        field,
        "stocking-evidence",
        "Livestock / grazing stocking evidence",
        !missingInputs.includes("annualOrganicNStockingRateKgHa") &&
          !missingInputs.includes("livestockGroups"),
        "/cattle/manage",
        "Used to establish the grazing stocking input for the field.",
      );
    }

    if (cycle.cropSystem === "GRASS_FIRST_CUT_SILAGE") {
      add(
        items,
        field,
        "yield-target",
        "First-cut production target",
        cycle.evidence.productionTargetTDMHa?.value === 5,
        nutrientsHref("production-target"),
        "The current validated P3 rule is the published 5 t DM/ha first-cut table.",
      );
    }

    add(
      items,
      field,
      "commonage",
      "Commonage status",
      Boolean(
        field.commonageStatus && field.commonageStatus.value !== "unknown",
      ),
      nutrientsHref("commonage"),
      "Farm Return checks this automatically from DAFM LPIS. Review only if public data cannot resolve it.",
    );
    // Inside the 3 m chemical-fertiliser strip the strip itself must be
    // measurable, so the water row stays open until it is.
    const waterStripUnresolved = missingInputs.includes(
      "waterBufferContext.chemicalStripWaterLines",
    );
    add(
      items,
      field,
      "water-buffer",
      "Nearest watercourse / buffer distance",
      Boolean(
        field.waterBufferContext?.value.featureType &&
        Number.isFinite(field.waterBufferContext?.value.distanceM),
      ) && !waterStripUnresolved,
      nutrientsHref("water-buffer"),
      waterStripUnresolved && aggregate?.purchaseStatus.status === "UNKNOWN"
        ? unknownReasonMessage(aggregate.purchaseStatus.reasonCode)
        : "Farm Return derives this automatically from the EPA mapped river network.",
    );

    const allocations = allocationsByField.get(field.id) ?? [];
    if (allocations.length > 0) {
      const allocationEvidenceComplete =
        allocations.every((allocation) =>
          Boolean(
            allocation.applicationMethod?.value &&
            allocation.applicationDate?.value,
          ),
        ) && !missingInputs.includes("slurry");
      const slurryPresentation =
        aggregate && missingInputs.includes("slurry")
          ? purchaseStatusPresentation(aggregate.purchaseStatus)
          : undefined;
      add(
        items,
        field,
        "slurry",
        "Planned slurry application evidence",
        allocationEvidenceComplete,
        nutrientsHref("slurry-spreading"),
        slurryPresentation?.kind === "unavailable"
          ? slurryPresentation.message
          : "Required only because slurry is currently planned for this field.",
      );
    }

    if (aggregate?.purchaseClass === "UNRESOLVED") {
      const fieldAlreadyHasMissingItem = items.some(
        (item) => item.fieldId === field.id && !item.complete,
      );
      if (!fieldAlreadyHasMissingItem) {
        const presentation = purchaseStatusPresentation(
          aggregate.purchaseStatus,
        );
        add(
          items,
          field,
          "calculation-evidence",
          "Fertiliser calculation evidence",
          false,
          nutrientsHref(),
          presentation.kind === "unavailable"
            ? presentation.message
            : "Farm Return still cannot produce a complete fertiliser recommendation for this field from the evidence on file.",
        );
      }
    }
  }

  const hasGrazingField = fields.some(
    (field) => cycleByField.get(field.id)?.cropSystem === "GRASS_GRAZING",
  );
  if (hasGrazingField) {
    items.unshift({
      id: "farm:grazing-system",
      fieldId: "__farm__",
      fieldName: "Farm setup",
      label: "Farm grazing system",
      complete: Boolean(input.farmGrazingProductionSystem),
      href: "/settings#grazing-production-system",
      detail: input.farmGrazingProductionSystem
        ? "Used as the farm baseline. Recorded cattle movements override it when they provide stronger field-specific evidence."
        : "Choose this once for the farm. You will not need to enter it separately for every field.",
    });
  }

  // A non-ready aggregation must always be explained by an actionable row:
  // otherwise the farmer sees "not ready" with nothing to resolve.
  if (
    aggregation.status !== "READY" &&
    !items.some((item) => !item.complete)
  ) {
    items.push({
      id: "farm:aggregation",
      fieldId: "__farm__",
      fieldName: "Farm setup",
      label: "Fertiliser plan evidence",
      complete: false,
      href: `/fertiliser-plan/calculations${input.planningSeason ? `?season=${encodeURIComponent(input.planningSeason)}` : ""}`,
      detail:
        aggregation.unsupportedProducts.length > 0
          ? "A recommended product is not in the verified fertiliser catalogue, so the farm requirement cannot be confirmed for a quote."
          : "Farm Return cannot yet confirm the whole-farm fertiliser requirement from the evidence on file. Review the calculations.",
    });
  }

  const completeCount = items.filter((item) => item.complete).length;
  const totalCount = items.length;
  const ready =
    totalCount > 0 &&
    completeCount === totalCount &&
    aggregation.status === "READY";
  const rawPercentage =
    totalCount === 0 ? 0 : Math.round((completeCount / totalCount) * 100);
  // 100% means "ready to quote". Every listed input can be complete while the
  // canonical aggregation is still provisional/unresolved, and rounding can
  // reach 100 with an item missing — neither may ever display as 100%.
  const percentage = ready ? 100 : Math.min(99, rawPercentage);
  return {
    percentage,
    completeCount,
    totalCount,
    remainingCount: totalCount - completeCount,
    ready,
    items,
  };
}
