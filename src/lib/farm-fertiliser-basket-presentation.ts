import type {
  FarmFertiliserAggregation,
  FarmFertiliserBasketStatus,
  FarmFertiliserFieldPurchaseEntry,
  FarmFertiliserQuoteBasket,
} from "@/domain/fertiliser-plan";
import { formatEur, formatNumber } from "@/lib/format";
import { nothingToBuyMessage, purchaseStatusPresentation } from "@/lib/purchase-status-presentation";
import type { StatusTone } from "@/lib/status";

/**
 * Fertiliser Vertical Completion, Session 3b — presentation selection for
 * the whole-farm fertiliser requirement and quote basket. Reads only the
 * canonical aggregation (`aggregateFarmFertiliserPurchasing`) and basket;
 * no quantity, price or status is derived here.
 */

export function pluralFields(n: number): string {
  return `${n} field${n === 1 ? "" : "s"}`;
}

export function awaitingEvidenceHeadline(n: number): string {
  return `${pluralFields(n)} ${n === 1 ? "requires" : "require"} more information before fertiliser can be included`;
}

export interface BasketStatusPresentation {
  label: string;
  tone: StatusTone;
  message: string;
}

export interface BasketStatusCounts {
  unresolvedFieldCount: number;
  provisionalFieldCount: number;
  unsupportedProductCount: number;
}

export function aggregationStatusCounts(aggregation: Pick<FarmFertiliserAggregation, "counts" | "unsupportedProducts">): BasketStatusCounts {
  return {
    unresolvedFieldCount: aggregation.counts.unresolved,
    provisionalFieldCount: aggregation.counts.provisional,
    unsupportedProductCount: aggregation.unsupportedProducts.length,
  };
}

export function basketStatusCounts(basket: Pick<FarmFertiliserQuoteBasket, "unresolvedFields" | "provisionalFieldCount" | "unsupportedProducts">): BasketStatusCounts {
  return {
    unresolvedFieldCount: basket.unresolvedFields.length,
    provisionalFieldCount: basket.provisionalFieldCount,
    unsupportedProductCount: basket.unsupportedProducts.length,
  };
}

export function basketStatusPresentation(status: FarmFertiliserBasketStatus, counts: BasketStatusCounts): BasketStatusPresentation {
  switch (status) {
    case "READY":
      return { label: "Ready", tone: "good", message: "Every field is resolved — this is the farm's full fertiliser purchase requirement." };
    case "READY_WITH_PROVISIONAL_ITEMS": {
      const n = counts.provisionalFieldCount;
      return {
        label: "Ready — provisional items",
        tone: "attention",
        message: `${pluralFields(n)} ${n === 1 ? "has" : "have"} planned slurry whose nutrient credit isn't counted yet, so ${n === 1 ? "its" : "their"} quantities are provisional.`,
      };
    }
    case "INCOMPLETE": {
      const parts: string[] = [];
      if (counts.unresolvedFieldCount > 0) parts.push(`${awaitingEvidenceHeadline(counts.unresolvedFieldCount)}.`);
      if (counts.unsupportedProductCount > 0) parts.push("A product isn't in Farm Return's verified catalogue.");
      parts.push("The figures below are a known subtotal, not the whole-farm requirement.");
      return { label: "Incomplete", tone: "risk", message: parts.join(" ") };
    }
  }
}

export function formatDisplayTonnes(tonnes: number): string {
  return `${formatNumber(tonnes, 2)} t`;
}

export function formatProductKg(kg: number): string {
  return `${formatNumber(kg, 1)} kg`;
}

export function formatProductCost(estimatedCostEur: number | null): string {
  return estimatedCostEur === null ? "Cost unavailable" : formatEur(estimatedCostEur);
}

export interface FarmCostSummary {
  label: string;
  value: string;
  /** Set when one or more products have no usable price. */
  unknownNote?: string;
}

/** Cost line for the farm summary or the basket. The figure is always the
 * sum of known costs; it is labelled a subtotal whenever the requirement is
 * incomplete or any product's price is unknown — never a fake €0 line. */
export function costSummary(input: {
  status: FarmFertiliserBasketStatus;
  knownCostSubtotalEur: number;
  estimatedTotalCostEur: number | null;
  unknownCostProductNames: readonly string[];
}): FarmCostSummary {
  const unknownNote =
    input.unknownCostProductNames.length > 0 ? `Price unavailable for ${input.unknownCostProductNames.join(", ")} — not included in the cost.` : undefined;
  const partial = input.status === "INCOMPLETE" || input.estimatedTotalCostEur === null;
  return {
    label: partial ? "Known subtotal (incomplete)" : "Estimated total cost",
    value: formatEur(input.knownCostSubtotalEur),
    ...(unknownNote ? { unknownNote } : {}),
  };
}

export function farmCostSummary(
  aggregation: Pick<FarmFertiliserAggregation, "status" | "knownCostSubtotalEur" | "estimatedTotalCostEur" | "productsWithUnknownCost" | "products">,
): FarmCostSummary {
  return costSummary({
    ...aggregation,
    unknownCostProductNames: aggregation.products.filter((p) => aggregation.productsWithUnknownCost.includes(p.productKey)).map((p) => p.name),
  });
}

export function basketCostSummary(
  basket: Pick<FarmFertiliserQuoteBasket, "status" | "knownCostSubtotalEur" | "estimatedTotalCostEur" | "productsWithUnknownCost" | "lines">,
): FarmCostSummary {
  return costSummary({
    ...basket,
    unknownCostProductNames: basket.lines.filter((l) => basket.productsWithUnknownCost.includes(l.productKey)).map((l) => l.name),
  });
}

export interface FieldGroupLine {
  fieldId: string;
  fieldName: string;
  detail: string;
}

export interface FieldGroupPresentation {
  key: "awaiting" | "provisional" | "none_needed" | "excluded";
  heading: string;
  fields: FieldGroupLine[];
}

function fieldDetail(entry: FarmFertiliserFieldPurchaseEntry): string {
  if (entry.aggregationReasonCode) return "Farm Return couldn't read this field's product quantities, so nothing is counted for it.";
  const status = entry.purchaseStatus;
  switch (status.status) {
    case "NONE_NEEDED":
    case "PROHIBITED":
      return nothingToBuyMessage(status) ?? "";
    case "RECOMMENDED_CREDIT_NOT_COUNTED": {
      const presentation = purchaseStatusPresentation(status);
      return presentation.kind === "products" && presentation.provisional ? presentation.provisional.headline : "Slurry nutrient credit not included";
    }
    default: {
      const presentation = purchaseStatusPresentation(status);
      return presentation.kind === "unavailable" ? presentation.message : "";
    }
  }
}

/** Field groups in display order; empty groups are omitted. Every field
 * that contributes nothing appears in exactly one group. */
export function farmFieldGroups(aggregation: Pick<FarmFertiliserAggregation, "fields">): FieldGroupPresentation[] {
  const line = (f: FarmFertiliserFieldPurchaseEntry): FieldGroupLine => ({ fieldId: f.fieldId, fieldName: f.fieldName, detail: fieldDetail(f) });
  const awaiting = aggregation.fields.filter((f) => f.purchaseClass === "UNRESOLVED");
  const provisional = aggregation.fields.filter((f) => f.purchaseClass === "INCLUDED" && f.provisional);
  const noneNeeded = aggregation.fields.filter((f) => f.purchaseClass === "NO_PURCHASE");
  const excluded = aggregation.fields.filter((f) => f.purchaseClass === "EXCLUDED");
  const groups: FieldGroupPresentation[] = [
    { key: "awaiting", heading: awaitingEvidenceHeadline(awaiting.length), fields: awaiting.map(line) },
    { key: "provisional", heading: `${pluralFields(provisional.length)} with provisional quantities`, fields: provisional.map(line) },
    { key: "none_needed", heading: `${pluralFields(noneNeeded.length)} ${noneNeeded.length === 1 ? "needs" : "need"} no fertiliser`, fields: noneNeeded.map(line) },
    { key: "excluded", heading: `${pluralFields(excluded.length)} excluded from purchasing`, fields: excluded.map(line) },
  ];
  return groups.filter((g) => g.fields.length > 0);
}

/** The message shown when the aggregation holds no product. */
export function emptyRequirementMessage(aggregation: Pick<FarmFertiliserAggregation, "counts" | "fields">): string {
  if (aggregation.counts.unresolved > 0) return `No fertiliser can be totalled yet — ${awaitingEvidenceHeadline(aggregation.counts.unresolved)}.`;
  if (aggregation.counts.noPurchase > 0) return "No fertiliser purchase is currently needed on this farm.";
  if (aggregation.fields.length === 0) return "No fields recorded yet.";
  return "No field on this farm currently has a fertiliser purchase to plan.";
}
