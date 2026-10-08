import type {
  FarmFertiliserAggregatedProduct,
  FarmFertiliserAggregation,
  FarmFertiliserFieldPurchaseEntry,
  FarmFertiliserQuoteBasket,
} from "@/domain/fertiliser-plan";
import { roundKgUpToDisplayTonnes } from "@/domain/fertiliser-plan";
import type { FertiliserStockBand } from "@/domain/fertiliser-stock";
import type { FieldUse } from "@/domain/types";
import {
  aggregationStatusCounts,
  basketStatusPresentation,
  emptyRequirementMessage,
  farmFieldGroups,
  formatDisplayTonnes,
  formatProductKg,
  formatRemainingTonnes,
  pluralFields,
  type BasketStatusPresentation,
} from "@/lib/farm-fertiliser-basket-presentation";
import { formatHa } from "@/lib/format";
import type { StatusTone } from "@/lib/status";

/**
 * Farm Spatial V2 Phase 5 — the whole-farm nutrient plan's view of the
 * canonical farm fertiliser aggregation (`aggregateFarmFertiliserPurchasing`)
 * and its quote basket (`buildFarmFertiliserQuoteBasket`), both fetched once
 * by `getFarmFertiliserDemandAction` and passed through unchanged by
 * `getFertiliserPlanOverviewAction`.
 *
 * Presentation selection only: every quantity is the aggregation's own
 * `totalKg` / `displayTonnes` / contribution `quantityKg`, or the demand's
 * own `remainingTotalTonnes`. Nothing is summed, subtracted or re-rounded,
 * and neither input is mutated. Ordering (largest product first) is the only
 * selection made here.
 */

/** Requirement state per field — mirrors `FertiliserPlanFieldBreakdownRow.status`. */
export type FieldRequirementStatus = "OK" | "NOT_APPLICABLE" | "BLOCKED_INSUFFICIENT_EVIDENCE" | "AMBIGUOUS" | "LEGAL_PROHIBITION" | "UNKNOWN";

export interface WholeFarmFieldInput {
  fieldId: string;
  fieldName: string;
  areaHa: number;
  seasonalUse?: FieldUse;
  status: FieldRequirementStatus;
}

export const FIELD_USE_LABEL: Record<string, string> = {
  grazing: "Grazing",
  silage_1st_cut: "Silage (1st cut)",
  silage_2nd_cut: "Silage (2nd cut)",
  silage_3rd_cut: "Silage (3rd cut)",
  mixed: "Mixed",
  tillage: "Tillage",
  other: "Other",
};

export const REQUIREMENT_STATUS_LABEL: Record<FieldRequirementStatus, string> = {
  OK: "Included in plan",
  NOT_APPLICABLE: "Not applicable (tillage)",
  BLOCKED_INSUFFICIENT_EVIDENCE: "Missing evidence",
  AMBIGUOUS: "Needs review",
  LEGAL_PROHIBITION: "Legally restricted",
  UNKNOWN: "Not yet checked",
};

export function requirementStatusTone(status: FieldRequirementStatus): StatusTone {
  return status === "OK" ? "good" : status === "NOT_APPLICABLE" ? "neutral" : "attention";
}

export interface ProductQuantityView {
  productKey: string;
  name: string;
  npkAnalysis: string;
  /** Canonical `displayTonnes` (rounded up to 0.01 t by the domain). */
  tonnesText: string;
  /** Canonical exact `totalKg`. */
  kgText: string;
  fieldCountText: string;
  provisional: boolean;
  catalogueVerified: boolean;
}

export interface OutstandingQuantityView {
  status: BasketStatusPresentation;
  /** True only when the aggregation is the farm's whole requirement. */
  isWholeFarm: boolean;
  /** The largest canonical product line; `null` when nothing is aggregated. */
  primary: ProductQuantityView | null;
  supporting: ProductQuantityView[];
  emptyMessage: string | null;
}

function productView(product: FarmFertiliserAggregatedProduct): ProductQuantityView {
  return {
    productKey: product.productKey,
    name: product.name,
    npkAnalysis: product.npkAnalysis,
    tonnesText: formatDisplayTonnes(product.displayTonnes),
    kgText: formatProductKg(product.totalKg),
    fieldCountText: pluralFields(product.contributions.length),
    provisional: product.provisional,
    catalogueVerified: product.catalogueVerified,
  };
}

/** Products ordered largest canonical `totalKg` first (stable for ties). */
export function orderedProducts(aggregation: Pick<FarmFertiliserAggregation, "products">): FarmFertiliserAggregatedProduct[] {
  return [...aggregation.products].sort((a, b) => b.totalKg - a.totalKg);
}

export function outstandingQuantityView(aggregation: FarmFertiliserAggregation): OutstandingQuantityView {
  const products = orderedProducts(aggregation).map(productView);
  return {
    status: basketStatusPresentation(aggregation.status, aggregationStatusCounts(aggregation)),
    isWholeFarm: aggregation.status !== "INCOMPLETE",
    primary: products[0] ?? null,
    supporting: products.slice(1),
    emptyMessage: products.length === 0 ? emptyRequirementMessage(aggregation) : null,
  };
}

export interface StillToBuyLine {
  product: string;
  npkAnalysis: string | null;
  /** `shortfall`: recorded stock, the canonical `shortfallKg`.
   * `stock_not_recorded`: stock unknown, so the figure is the remaining
   * requirement, never a confirmed purchase. */
  basis: "shortfall" | "stock_not_recorded";
  text: string;
}

/** Per product from the canonical stock bands (`buildFertiliserStockBand`,
 * IMPLEMENTATION_MAP §6.4): a recorded band's `shortfallKg`; a not-recorded
 * band's remaining requirement, disclosed as such (unknown stock is never
 * zero). Gated on the exact kg, never the rounded tonnes. */
export function stillToBuyLines(bands: readonly FertiliserStockBand[]): StillToBuyLine[] {
  return bands.flatMap((band): StillToBuyLine[] => {
    const kg = band.status === "recorded" ? band.shortfallKg : band.remainingRequirementKg;
    if (!(kg > 0)) return [];
    return [
      {
        product: band.product,
        npkAnalysis: band.npkAnalysis ?? null,
        basis: band.status === "recorded" ? "shortfall" : "stock_not_recorded",
        text: formatRemainingTonnes(roundKgUpToDisplayTonnes(kg), kg),
      },
    ];
  });
}

export interface FieldContributionView {
  productKey: string;
  name: string;
  npkAnalysis: string;
  kgText: string;
  provisional: boolean;
}

export interface FieldPurchaseView {
  label: string;
  tone: StatusTone;
  /** The canonical reason for a field that contributes nothing. */
  detail: string | null;
  contributions: FieldContributionView[];
}

export interface WholeFarmFieldRow {
  fieldId: string;
  fieldName: string;
  /** Area and seasonal use; `null` for a field only the aggregation knows. */
  identityText: string | null;
  requirement: { label: string; tone: StatusTone } | null;
  purchase: FieldPurchaseView;
  /** The field's spatial nutrient plan. */
  fieldPlanHref: string;
  /** The field's planner, where "Plan this application" persists a plan. */
  plannerHref: string;
  /** Only a field contributing products has an application to plan. */
  canPlanApplication: boolean;
}

function purchaseClassLabel(entry: FarmFertiliserFieldPurchaseEntry): { label: string; tone: StatusTone } {
  switch (entry.purchaseClass) {
    case "INCLUDED":
      return entry.provisional ? { label: "Provisional quantity", tone: "attention" } : { label: "Contributes to purchase", tone: "good" };
    case "NO_PURCHASE":
      return { label: "No fertiliser needed", tone: "neutral" };
    case "EXCLUDED":
      return { label: "Excluded from purchasing", tone: "neutral" };
    case "UNRESOLVED":
      return { label: "Needs more information", tone: "attention" };
  }
}

/**
 * One row per field: its requirement state (the per-field recompute the
 * overview already ran) beside its purchasing state and product kg (the
 * canonical aggregation). Rows follow the overview's field order; a field
 * present only in the aggregation is still listed, never dropped.
 */
export function wholeFarmFieldRows(fields: readonly WholeFarmFieldInput[], aggregation: Pick<FarmFertiliserAggregation, "fields" | "products">): WholeFarmFieldRow[] {
  const entryById = new Map(aggregation.fields.map((f) => [f.fieldId, f]));
  const detailById = new Map(farmFieldGroups(aggregation).flatMap((g) => g.fields.map((f) => [f.fieldId, f.detail] as const)));
  const contributionsFor = (fieldId: string): FieldContributionView[] =>
    orderedProducts(aggregation).flatMap((product) =>
      product.contributions
        .filter((c) => c.fieldId === fieldId)
        .map((c) => ({ productKey: product.productKey, name: product.name, npkAnalysis: product.npkAnalysis, kgText: formatProductKg(c.quantityKg), provisional: c.provisional })),
    );

  const row = (fieldId: string, fieldName: string, input: WholeFarmFieldInput | undefined): WholeFarmFieldRow => {
    const entry = entryById.get(fieldId);
    const purchase: FieldPurchaseView = entry
      ? { ...purchaseClassLabel(entry), detail: detailById.get(fieldId) || null, contributions: contributionsFor(fieldId) }
      : { label: "Not in the farm purchase total", tone: "attention", detail: "Farm Return couldn't include this field in the farm aggregation.", contributions: [] };
    return {
      fieldId,
      fieldName,
      identityText: input ? `${formatHa(input.areaHa)}${input.seasonalUse ? ` · ${FIELD_USE_LABEL[input.seasonalUse] ?? input.seasonalUse}` : ""}` : null,
      requirement: input ? { label: REQUIREMENT_STATUS_LABEL[input.status], tone: requirementStatusTone(input.status) } : null,
      purchase,
      fieldPlanHref: `/today/field/${encodeURIComponent(fieldId)}`,
      plannerHref: `/nutrients?field=${fieldId}`,
      canPlanApplication: entry?.purchaseClass === "INCLUDED",
    };
  };

  const known = new Set(fields.map((f) => f.fieldId));
  return [
    ...fields.map((f) => row(f.fieldId, f.fieldName, f)),
    ...aggregation.fields.filter((f) => !known.has(f.fieldId)).map((f) => row(f.fieldId, f.fieldName, undefined)),
  ];
}

/**
 * Plan handoff. Farm Return has no whole-farm plan record: the only
 * persisted fertiliser plan is a field's accepted Decision, created by
 * "Plan this application" on `/nutrients?field=<id>`. This screen therefore
 * hands off per field and never claims to have saved anything.
 */
export const PLAN_HANDOFF = {
  title: "Add to Plan",
  persistence: "Not saved",
  message:
    "Farm Return doesn't keep a whole-farm fertiliser plan yet, so nothing on this page is saved to Plan. Each field's application is saved from its own planner with “Plan this application”.",
} as const;

export interface PlanHandoffView {
  plannableFieldCount: number;
  summary: string;
}

export function planHandoffView(aggregation: Pick<FarmFertiliserAggregation, "fields">): PlanHandoffView {
  const n = aggregation.fields.filter((f) => f.purchaseClass === "INCLUDED").length;
  return {
    plannableFieldCount: n,
    summary: n === 0 ? "No field currently has a fertiliser application to plan." : `${pluralFields(n)} ${n === 1 ? "has" : "have"} an application to plan — use “Plan application” on ${n === 1 ? "its row" : "each row"}.`,
  };
}

/**
 * Market handoff. The quote request is a copy of the canonical basket; a
 * requested quantity edited there never flows back to the requirement.
 */
export interface MarketHandoffView {
  available: boolean;
  coverage: string;
  separation: string;
}

export function marketHandoffView(basket: Pick<FarmFertiliserQuoteBasket, "lines" | "isCompleteFarmRequirement" | "status">): MarketHandoffView {
  return {
    available: basket.lines.length > 0,
    coverage:
      basket.lines.length === 0
        ? "There's nothing to quote for yet."
        : basket.isCompleteFarmRequirement
          ? `${basket.lines.length} product${basket.lines.length === 1 ? "" : "s"} — the farm's full fertiliser requirement${basket.status === "READY_WITH_PROVISIONAL_ITEMS" ? ", with provisional quantities" : ""}.`
          : `${basket.lines.length} product${basket.lines.length === 1 ? "" : "s"} — a known subtotal, not the farm's full requirement.`,
    separation:
      "Supplier quotes are commercial. You can change the quantity you request, but that never changes the calculated requirement above.",
  };
}
