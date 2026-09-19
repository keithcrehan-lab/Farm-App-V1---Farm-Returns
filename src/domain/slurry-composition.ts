/**
 * Slurry Evidence & Composition V1 — the canonical slurry composition/
 * evidence record this campaign's brief asks for: which store/tank
 * (`Housing`) the slurry belongs to, what type it is, its dry-matter %
 * and (where known) its measured total N/P/K, where that figure came
 * from, and whether it is a farmer's own estimate or a real laboratory
 * result. Modelled on this app's two closest existing precedents —
 * `SoilTest` (a whole dated evidence record with its own lab/sample
 * fields, `src/domain/types.ts`) for the record's SHAPE, and
 * `fertiliser_stock_records`/`FertiliserStockRecord`
 * (`src/domain/fertiliser-stock.ts`) for the STORAGE discipline: an
 * insert-only, append-only table, never updated or deleted — a farmer
 * corrects a mistaken figure by recording a NEW result, never editing an
 * old one (CLAUDE.md "provenance is permanent"). The "current" record
 * for a housing/shed is derived on read (`currentSlurryCompositionByHousing`
 * below), exactly like `currentFertiliserStockByProduct` — never a
 * second, independently-maintained "latest" pointer that could drift
 * from the append-only history it's supposed to summarise.
 *
 * `status` deliberately reuses this app's own existing `DataStatus`
 * vocabulary (`types.ts`) rather than inventing a competing
 * ASSUMED/FARMER_PROVIDED/MEASURED enum of its own (the brief's own
 * §12 stop condition: "never invent a fourth competing scheme" once an
 * existing provenance pattern already fits):
 *   - "estimated" (`DataStatus`) — no record exists at all for this
 *     housing; the caller falls back to the unchanged Teagasc Table 9-1
 *     national-average DM% (`NATIONAL_AVG_SLURRY_DM_PCT`,
 *     `src/domain/nutrients.ts`). Deliberately NEVER a value on a
 *     persisted `SlurryComposition` row itself — an "assumed" state is
 *     the ABSENCE of a record (the same "unknown is not zero"
 *     discipline `fertiliser-stock.ts`'s own `FertiliserStockBandNotRecorded`
 *     already applies), never a fabricated placeholder row.
 *   - "farmer_adjusted" — the farmer's own estimate (e.g. "I know my
 *     slurry is roughly X% DM"), no laboratory involved.
 *   - "verified" — a real laboratory analysis result.
 *
 * ONLY `dmPct` is currently consumed by the nutrient engine
 * (`resolveEffectiveSlurryComposition`, `src/domain/nutrients.ts`). See
 * this file's own `nPerM3`/`pPerM3`/`kPerM3` doc comments, and that
 * function's header, for exactly why — Teagasc Table 9-8 (this app's
 * only real cattle-slurry availability rule) has no parameter for an
 * arbitrary measured total N/P/K composition at all, only DM% (picking
 * one of 4 published columns) and application rate. Storing a real
 * measured N/P/K here (for evidence, farmer records and future use) is
 * therefore deliberately NOT the same thing as that figure being used in
 * a calculation yet — never conflate "recorded" with "consumed".
 */
import type { DataStatus } from "./types";

export const SLURRY_COMPOSITION_VERSION = "slurry_composition_v1.0.0";

/** The only slurry type Table 9-8 (this app's one real slurry-nutrient
 * rule) covers. Kept as a literal union of one, rather than a bare
 * string, so a future addition (e.g. pig slurry, once a real Teagasc
 * table for it is wired in) is a deliberate, reviewed type change, never
 * a silent free-text drift. */
export const SLURRY_TYPES = ["cattle_slurry"] as const;
export type SlurryType = (typeof SLURRY_TYPES)[number];

/** This record's own provenance tier — see this file's header for why
 * these two values (never a third, competing "ASSUMED" row state). */
export type SlurryCompositionStatus = Extract<DataStatus, "farmer_adjusted" | "verified">;

export interface SlurryComposition {
  id: string;
  farmId: string;
  /** The slurry store/tank this result belongs to — `Housing.id`. */
  housingId: string;
  slurryType: SlurryType;
  status: SlurryCompositionStatus;
  /** Dry matter, %. The one field the nutrient engine actually consumes
   * today — see this file's own header. */
  dmPct: number;
  /** Measured/estimated total nitrogen, kg per m³ — NOT YET consumed by
   * `calculateNutrientPlan` (see this file's header). Recorded for the
   * farmer's own evidence and future use once a real Teagasc-sourced
   * conversion from measured composition to available nutrient exists. */
  nPerM3?: number;
  /** Measured/estimated total phosphorus, kg per m³ — same "recorded,
   * not yet consumed" caveat as `nPerM3` above. */
  pPerM3?: number;
  /** Measured/estimated total potassium, kg per m³ — same "recorded,
   * not yet consumed" caveat as `nPerM3` above. */
  kPerM3?: number;
  /** ISO date (YYYY-MM-DD) — when this sample/result is true as of
   * (a lab's own sample/report date, or the date a farmer's own estimate
   * is based on). Never assumed to be "today". */
  sampleDate: string;
  /** e.g. "Farmer estimate", "Teagasc laboratory report" — free text,
   * never fabricated. */
  source: string;
  /** Real laboratory/provider name — present for a `"verified"` result;
   * absent for a `"farmer_adjusted"` one (no lab was involved). */
  laboratory?: string;
  /** Real lab sample/report reference, if the farmer has one. */
  sampleRef?: string;
  note?: string;
  /** ISO datetime — when Farm Return actually captured this row
   * (`created_at`), distinct from `sampleDate`. Used only to break
   * same-tier, same-date ties in `currentSlurryCompositionByHousing`
   * below — never shown as if it were the sample date itself. */
  recordedAt: string;
}

export interface NewSlurryCompositionInput {
  housingId: string;
  slurryType: SlurryType;
  status: SlurryCompositionStatus;
  dmPct: number;
  nPerM3?: number;
  pPerM3?: number;
  kPerM3?: number;
  sampleDate: string;
  source: string;
  laboratory?: string;
  sampleRef?: string;
  note?: string;
}

export interface SlurryCompositionValidationError {
  field: "housingId" | "dmPct" | "sampleDate" | "source" | "laboratory" | "nPerM3" | "pPerM3" | "kPerM3";
  message: string;
}

/**
 * Codex audit MEDIUM precedent this mirrors exactly
 * (`fertiliser-stock.ts`'s own `isValidCalendarDateString`, round 1 of
 * that campaign) — `new Date(value).getTime()` alone does not reject a
 * nonexistent calendar date (e.g. "2026-02-30" silently rolls over to a
 * real date). A real round-trip check instead.
 */
function isValidCalendarDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Real validation shared by the client form and the server action before
 * either ever reaches the database (defense in depth on top of the
 * migration's own `check` constraints — CLAUDE.md "never assume
 * application code is the only writer"). `laboratory` required only for
 * a `"verified"` (real lab) result — a PRODUCT judgement call, not a
 * scientific fact (`docs/evidence-register.md`): a lab result with no
 * named lab is not meaningfully distinguishable from a farmer's own
 * estimate, so this app asks for one rather than accepting an
 * unattributed "verified" claim.
 */
export function validateNewSlurryCompositionInput(input: NewSlurryCompositionInput, today: string): SlurryCompositionValidationError[] {
  const errors: SlurryCompositionValidationError[] = [];
  if (!input.housingId) {
    errors.push({ field: "housingId", message: "Choose which shed/tank this result belongs to" });
  }
  if (!Number.isFinite(input.dmPct) || input.dmPct <= 0 || input.dmPct > 100) {
    errors.push({ field: "dmPct", message: "Enter a dry matter % between 0 and 100" });
  }
  if (!input.sampleDate || !isValidCalendarDateString(input.sampleDate)) {
    errors.push({ field: "sampleDate", message: "Enter a valid date" });
  } else if (input.sampleDate > today) {
    errors.push({ field: "sampleDate", message: "Sample/result date cannot be in the future" });
  }
  if (!input.source || input.source.trim().length === 0) {
    errors.push({ field: "source", message: "Enter where this figure came from" });
  }
  if (input.status === "verified" && (!input.laboratory || input.laboratory.trim().length === 0)) {
    errors.push({ field: "laboratory", message: "Enter the laboratory/provider name for a laboratory result" });
  }
  for (const [field, value] of [
    ["nPerM3", input.nPerM3],
    ["pPerM3", input.pPerM3],
    ["kPerM3", input.kPerM3],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      errors.push({ field, message: "Must be zero or a positive number" });
    }
  }
  return errors;
}

/** Tier rank — `"verified"` always outranks `"farmer_adjusted"`, per the
 * brief's own explicit hierarchy (§6: "Measured composition, if valid ↓
 * Farmer-provided composition ↓ Canonical Teagasc assumption"). This is
 * a real, deliberate product/scientific-evidence ranking, not simply
 * "whichever is more recent" — an older real lab result still outranks a
 * newer farmer guess. */
const STATUS_RANK: Record<SlurryCompositionStatus, number> = { verified: 2, farmer_adjusted: 1 };

function isBetterCompositionRecord(a: SlurryComposition, b: SlurryComposition): boolean {
  const rankA = STATUS_RANK[a.status];
  const rankB = STATUS_RANK[b.status];
  if (rankA !== rankB) return rankA > rankB;
  if (a.sampleDate !== b.sampleDate) return a.sampleDate > b.sampleDate;
  return a.recordedAt > b.recordedAt;
}

/**
 * The real current/effective composition record per housing/shed —
 * highest tier wins (`"verified"` over `"farmer_adjusted"`), ties broken
 * by the most recent `sampleDate` then `recordedAt`. Never sums or
 * averages across records — a farmer's/lab's latest result at its own
 * tier fully replaces the previous one for calculation purposes, while
 * every prior record stays permanently retrievable (this module never
 * deletes/updates a row — see this file's own header). A housing with no
 * record at all is simply absent from the returned map — callers must
 * treat a missing entry as "no measured/farmer composition on file", not
 * a confirmed zero (`resolveEffectiveSlurryComposition`,
 * `src/domain/nutrients.ts`, is exactly this fallback).
 */
export function currentSlurryCompositionByHousing(records: readonly SlurryComposition[]): Map<string, SlurryComposition> {
  const out = new Map<string, SlurryComposition>();
  for (const record of records) {
    const existing = out.get(record.housingId);
    if (!existing || isBetterCompositionRecord(record, existing)) {
      out.set(record.housingId, record);
    }
  }
  return out;
}
