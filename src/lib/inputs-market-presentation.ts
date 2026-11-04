/**
 * Inputs Market V1 — display formatting only. Every quantity and price is
 * already calculated by `src/domain/inputs-market.ts`; this module turns
 * those values into text and never derives a new number.
 */
import { formatEur } from "./format";
import { formatRemainingTonnes } from "./farm-fertiliser-basket-presentation";
import { roundKgUpToDisplayTonnes } from "@/domain/fertiliser-plan";
import {
  REFERENCE_PRICE_BASIS_LABEL,
  type ImpliedCost,
  type InputCategorySummary,
  type InputReferencePrice,
} from "@/domain/inputs-market";

/** The Fertiliser workspace's own tonnes display rule: rounded up to
 * 0.01 t (never understates) and never a false "0 t". */
export function formatInputTonnes(kg: number): string {
  return formatRemainingTonnes(roundKgUpToDisplayTonnes(kg), kg);
}

/** "2026-06" → "Jun 2026". */
export function formatReferencePeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IE", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function referencePriceProvenance(price: InputReferencePrice): string {
  if (price.status !== "available") return "Price not sourced";
  return `${REFERENCE_PRICE_BASIS_LABEL[price.basis]} · ${price.sourceLabel} · ${formatReferencePeriod(price.referencePeriod)}`;
}

export function impliedCostText(cost: ImpliedCost): string {
  return cost.status === "known" ? `≈ ${formatEur(cost.eur)}` : "Cost unavailable";
}

export function summaryCostText(summary: InputCategorySummary): string {
  if (summary.lines.length === 0) return "—";
  if (summary.lines.length === summary.linesWithUnknownCost) return "Cost unavailable";
  return `≈ ${formatEur(summary.knownImpliedCostEur)}`;
}

export function completenessText(summary: InputCategorySummary): string | null {
  if (summary.completeness !== "partial") return null;
  const parts: string[] = [];
  if (summary.gaps.length > 0) parts.push(`${summary.gaps.length} need${summary.gaps.length === 1 ? "s" : ""} input before sizing`);
  if (summary.linesWithUnknownCost > 0) parts.push(`${summary.linesWithUnknownCost} without a reference price`);
  return parts.length > 0 ? `Known subtotal — ${parts.join(", ")}.` : "Known subtotal.";
}
