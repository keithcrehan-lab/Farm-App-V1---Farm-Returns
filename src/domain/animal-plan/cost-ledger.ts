/**
 * Cattle C10 — the animal direct-cost ledger contract (an isolated C10
 * capability; NOT part of the frozen cattle engine and never a C8 economic
 * observation or price source).
 *
 * Every entry keeps what later audit needs: animal, category, exact amount,
 * currency, effective date, source, whether it was charged to the animal
 * directly or ALLOCATED from a shared cost (with the allocation basis), and an
 * optional note / reference. The summary only adds up what was recorded: it
 * never claims the record is complete, never fills a missing category with
 * zero and never mixes currencies.
 *
 * Persistence is not decided (no table, no migration): demonstration entries
 * are fixtures and say so through `source.kind`.
 */

import Decimal from "decimal.js";
import { comparePlanDates, isPlanDate } from "./plan-dates";

export const ANIMAL_COST_CATEGORIES = ["FEED", "MEDICINE", "VETERINARY", "BEDDING", "OTHER"] as const;
export type AnimalCostCategory = (typeof ANIMAL_COST_CATEGORIES)[number];

/** DIRECT: charged to this animal. ALLOCATED: a share of a shared cost (the basis must be stated). */
export type CostAttribution = "DIRECT" | "ALLOCATED";

export const COST_SOURCE_KINDS = ["FARMER_ENTRY", "INVOICE", "ALLOCATION", "DEMONSTRATION_FIXTURE"] as const;
export type CostSourceKind = (typeof COST_SOURCE_KINDS)[number];

export interface AnimalCostEntry {
  entryId: string;
  animalId: string;
  category: AnimalCostCategory;
  /** Exact non-negative decimal string in `currency` (e.g. "42.50"). */
  amount: string;
  /** ISO 4217 code. */
  currency: string;
  /** Calendar date the cost applies to (`YYYY-MM-DD`). */
  effectiveDate: string;
  source: { kind: CostSourceKind; ref: string | null };
  attribution: CostAttribution;
  /** Required for ALLOCATED entries (e.g. "1/40 of the October concentrate delivery"); `null` for DIRECT. */
  allocationBasis: string | null;
  note: string | null;
}

export type CostEntryIssueCode =
  | "COST_ENTRY_INVALID_AMOUNT"
  | "COST_ENTRY_INVALID_DATE"
  | "COST_ENTRY_INVALID_CATEGORY"
  | "COST_ENTRY_INVALID_CURRENCY"
  | "COST_ENTRY_ALLOCATION_BASIS_MISSING"
  | "COST_ENTRY_DUPLICATE_ID";

export interface CostCategoryTotal {
  category: AnimalCostCategory;
  /** `null` = no entry recorded in this category (never "0"). */
  amount: string | null;
  entryCount: number;
  directAmount: string | null;
  allocatedAmount: string | null;
}

export type CostSummaryState =
  /** No entry recorded for the animal up to the date: the cost is unknown, never zero. */
  | "NONE_RECORDED"
  /** At least one valid entry; totals are of recorded entries only. */
  | "RECORDED"
  /** A malformed entry: no total is reported (fail closed). */
  | "INVALID"
  /** Entries in more than one currency: no total is reported. */
  | "MIXED_CURRENCY";

export interface AnimalCostSummary {
  animalId: string;
  asOfDate: string;
  state: CostSummaryState;
  currency: string | null;
  /** Set only when RECORDED. */
  total: string | null;
  direct: string | null;
  allocated: string | null;
  /** Always one row per category, in `ANIMAL_COST_CATEGORIES` order. */
  byCategory: CostCategoryTotal[];
  entryCount: number;
  /** Entries dated after `asOfDate` (not counted; never dropped silently). */
  futureEntryIds: string[];
  issues: { entryId: string; code: CostEntryIssueCode }[];
  /** The counted entries, oldest first (then id). */
  entries: AnimalCostEntry[];
}

/**
 * What a caller has for an animal's costs: the summary, or UNAVAILABLE when no summary could be
 * produced (e.g. the valuation date couldn't be read). UNAVAILABLE is never "none recorded".
 */
export type AnimalCostRead = AnimalCostSummary | { state: "UNAVAILABLE"; reason: string };

const AMOUNT_RE =/^\d{1,9}(\.\d{1,4})?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

export function costEntryIssues(e: AnimalCostEntry): CostEntryIssueCode[] {
  const out: CostEntryIssueCode[] = [];
  if (typeof e.amount !== "string" || !AMOUNT_RE.test(e.amount)) out.push("COST_ENTRY_INVALID_AMOUNT");
  if (!isPlanDate(e.effectiveDate)) out.push("COST_ENTRY_INVALID_DATE");
  if (!(ANIMAL_COST_CATEGORIES as readonly string[]).includes(e.category)) out.push("COST_ENTRY_INVALID_CATEGORY");
  if (typeof e.currency !== "string" || !CURRENCY_RE.test(e.currency)) out.push("COST_ENTRY_INVALID_CURRENCY");
  if (e.attribution === "ALLOCATED" && (typeof e.allocationBasis !== "string" || e.allocationBasis.trim() === "")) out.push("COST_ENTRY_ALLOCATION_BASIS_MISSING");
  return out;
}

const sum = (values: readonly string[]): string | null => (values.length === 0 ? null : values.reduce((acc, v) => acc.plus(v), new Decimal(0)).toFixed());

/**
 * Sums one animal's recorded direct costs up to and including `asOfDate`.
 * Entries of other animals are ignored; entries after the date are listed in
 * `futureEntryIds`. Totals are exact decimal strings.
 */
export function summariseAnimalCosts(entries: readonly AnimalCostEntry[], animalId: string, asOfDate: string): AnimalCostSummary {
  const own = entries.filter((e) => e.animalId === animalId);
  const issues: AnimalCostSummary["issues"] = [];
  const seen = new Map<string, number>();
  for (const e of own) seen.set(e.entryId, (seen.get(e.entryId) ?? 0) + 1);
  for (const e of own) {
    for (const code of costEntryIssues(e)) issues.push({ entryId: e.entryId, code });
    if ((seen.get(e.entryId) ?? 0) > 1) issues.push({ entryId: e.entryId, code: "COST_ENTRY_DUPLICATE_ID" });
  }
  const valid = issues.length === 0;
  const counted = valid ? own.filter((e) => comparePlanDates(e.effectiveDate, asOfDate) <= 0) : [];
  const futureEntryIds = valid ? own.filter((e) => comparePlanDates(e.effectiveDate, asOfDate) > 0).map((e) => e.entryId).sort() : [];
  counted.sort((a, b) => comparePlanDates(a.effectiveDate, b.effectiveDate) || (a.entryId < b.entryId ? -1 : 1));
  const currencies = [...new Set(counted.map((e) => e.currency))];
  const state: CostSummaryState = !valid ? "INVALID" : currencies.length > 1 ? "MIXED_CURRENCY" : counted.length === 0 ? "NONE_RECORDED" : "RECORDED";
  const known = state === "RECORDED";
  const byCategory = ANIMAL_COST_CATEGORIES.map((category) => {
    const rows = known ? counted.filter((e) => e.category === category) : [];
    return {
      category,
      amount: sum(rows.map((r) => r.amount)),
      entryCount: rows.length,
      directAmount: sum(rows.filter((r) => r.attribution === "DIRECT").map((r) => r.amount)),
      allocatedAmount: sum(rows.filter((r) => r.attribution === "ALLOCATED").map((r) => r.amount)),
    };
  });
  return {
    animalId,
    asOfDate,
    state,
    currency: known ? currencies[0] : null,
    total: known ? sum(counted.map((e) => e.amount)) : null,
    direct: known ? (sum(counted.filter((e) => e.attribution === "DIRECT").map((e) => e.amount)) ?? "0") : null,
    allocated: known ? (sum(counted.filter((e) => e.attribution === "ALLOCATED").map((e) => e.amount)) ?? "0") : null,
    byCategory,
    entryCount: counted.length,
    futureEntryIds,
    issues,
    entries: known ? counted.map((e) => ({ ...e, source: { ...e.source } })) : [],
  };
}

/**
 * Recorded direct cost per kilogram of liveweight (exact decimal), or `null`
 * when either side is unknown — never a figure over a missing cost or weight.
 */
export function costPerKgLiveweight(summary: AnimalCostSummary, liveweightKg: number | null): string | null {
  if (summary.state !== "RECORDED" || summary.total === null) return null;
  if (liveweightKg === null || !Number.isFinite(liveweightKg) || liveweightKg <= 0) return null;
  return new Decimal(summary.total).dividedBy(liveweightKg).toFixed();
}
