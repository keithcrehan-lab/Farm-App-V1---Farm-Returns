import type { Field, SlurryAllocation } from "@/domain/types";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";
import type { FarmFertiliserAggregation } from "@/domain/fertiliser-plan";

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

function fieldHref(fieldId: string, anchor?: string): string {
  return `/fields?field=${encodeURIComponent(fieldId)}&chapter=nutrients${anchor ? `#${anchor}` : ""}`;
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
  href = fieldHref(field.id),
  detail?: string,
) {
  items.push({ id: `${field.id}:${key}`, fieldId: field.id, fieldName: field.name, label, complete, href, ...(detail ? { detail } : {}) });
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
}): FertiliserQuoteReadiness {
  const { fields, cycles, slurryAllocations, aggregation } = input;
  const futureSeason = Boolean(input.planningSeason && input.currentSeason && input.planningSeason > input.currentSeason);
  const cycleByField = new Map(cycles.map((cycle) => [cycle.fieldId, cycle]));
  const aggregateByField = new Map(aggregation.fields.map((entry) => [entry.fieldId, entry]));
  const allocationsByField = new Map<string, SlurryAllocation[]>();
  for (const allocation of slurryAllocations) {
    const list = allocationsByField.get(allocation.fieldId) ?? [];
    list.push(allocation);
    allocationsByField.set(allocation.fieldId, list);
  }

  const items: FertiliserQuoteReadinessItem[] = [];
  for (const field of fields) {
    const cycle = cycleByField.get(field.id);
    const aggregate = aggregateByField.get(field.id);
    const missingInputs = aggregate?.purchaseStatus.status === "UNKNOWN" || aggregate?.purchaseStatus.status === "WITHHELD_MIXED_EVIDENCE" || aggregate?.purchaseStatus.status === "RECOMMENDED_CREDIT_NOT_COUNTED"
      ? aggregate.purchaseStatus.missingInputs
      : [];

    add(items, field, "area", "Mapped field area", Number.isFinite(field.areaHa) && field.areaHa > 0);
    add(items, field, "cycle", "Field use / production cycle", Boolean(cycle), undefined, cycle ? undefined : "Choose how this field will be used this season.");

    if (!cycle) continue;

    add(items, field, "p-index", "Soil P Index", hasEvidence(field.fertility.pIndex?.value));
    add(items, field, "k-index", "Soil K Index", hasEvidence(field.fertility.kIndex?.value));
    add(items, field, "soil-test-date", "Soil test date", Boolean(field.fertility.verifiedTest?.sampleDate));
    if (!futureSeason) {
      const chemicalAppliedKnown = hasEvidence(cycle.evidence.chemicalNAppliedKgHa?.value)
        && hasEvidence(cycle.evidence.chemicalPAppliedKgHa?.value)
        && hasEvidence(cycle.evidence.chemicalKAppliedKgHa?.value);
      add(
        items,
        field,
        "prior-fertiliser",
        "Fertiliser already spread this season",
        chemicalAppliedKnown,
        undefined,
        chemicalAppliedKnown
          ? "Recorded as one field-level answer. Nutrient amounts are only needed when the answer is Yes."
          : "Answer No once to record N, P and K as zero, or Yes to enter the amounts already applied.",
      );
    }

    if (cycle.cropSystem === "GRASS_GRAZING") {
      add(
        items,
        field,
        "grazing-system",
        "Grazing production system",
        cycle.evidence.grazingProductionSystem?.value === "SUCKLER_CALF_TO_BEEF",
        fieldHref(field.id, "grazing-production-system"),
        cycle.evidence.grazingProductionSystem?.value && cycle.evidence.grazingProductionSystem.value !== "SUCKLER_CALF_TO_BEEF"
          ? "The recorded system is not yet supported by the current P3 grazing rule pack."
          : undefined,
      );
      add(
        items,
        field,
        "stocking-evidence",
        "Livestock / grazing stocking evidence",
        !missingInputs.includes("annualOrganicNStockingRateKgHa"),
        "/cattle/manage",
        "Used to establish the grazing stocking input for the field.",
      );
    }

    if (cycle.cropSystem === "GRASS_FIRST_CUT_SILAGE") {
      add(items, field, "yield-target", "First-cut production target", cycle.evidence.productionTargetTDMHa?.value === 5, undefined, "The current validated P3 rule is the published 5 t DM/ha first-cut table.");
    }

    add(items, field, "commonage", "Commonage status", Boolean(field.commonageStatus && field.commonageStatus.value !== "unknown"), undefined, "Farm Return checks this automatically from DAFM LPIS. Review only if public data cannot resolve it.");
    add(
      items,
      field,
      "water-buffer",
      "Nearest watercourse / buffer distance",
      Boolean(field.waterBufferContext?.value.featureType && Number.isFinite(field.waterBufferContext?.value.distanceM)),
      undefined,
      "Farm Return derives this automatically from the EPA mapped river network.",
    );

    const allocations = allocationsByField.get(field.id) ?? [];
    if (allocations.length > 0) {
      const allocationEvidenceComplete = allocations.every((allocation) => Boolean(allocation.applicationMethod?.value && allocation.applicationDate?.value)) && !missingInputs.includes("slurry");
      add(items, field, "slurry", "Planned slurry application evidence", allocationEvidenceComplete, undefined, "Required only because slurry is currently planned for this field.");
    }
  }

  const completeCount = items.filter((item) => item.complete).length;
  const totalCount = items.length;
  const percentage = totalCount === 0 ? 0 : Math.round((completeCount / totalCount) * 100);
  return {
    percentage,
    completeCount,
    totalCount,
    remainingCount: totalCount - completeCount,
    ready: totalCount > 0 && completeCount === totalCount && aggregation.status === "READY",
    items,
  };
}
