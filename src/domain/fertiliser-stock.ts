/**
 * Fertiliser Overview and Stock Visuals campaign — the smallest reliable
 * record of fertiliser/lime stock: a dated, farmer-observed quantity for
 * one product, source-attributed, with an auditable correction history (a
 * farmer corrects a mistaken count by adding a NEW record — CLAUDE.md
 * "provenance is permanent" — never editing an old one; see
 * `supabase/migrations/20260917000000_fertiliser_stock_and_slurry_provenance.sql`'s
 * own header for the real insert-only, no-update/delete RLS policy this
 * mirrors at the database layer).
 *
 * **Deliberately NOT an inventory/order-management system** (disclosed
 * scope limit, confirmed with the product owner mid-campaign): no
 * delivery, application or movement automatically adjusts a running
 * balance here — no reliable source of automatic stock movements exists
 * anywhere in this app yet (there is no delivery-receipt record, and a
 * confirmed fertiliser Actual's own product/quantity, `fertiliser-plan.ts`'s
 * own header explains, cannot reliably resolve to a real kg figure for
 * every real record). Each stock record is a full point-in-time
 * observation ("as of this date, I have X kg of Product Y"), never a
 * delta; the CURRENT balance for a product is simply its own most recent
 * record (`currentFertiliserStockByProduct` below). A farmer who wants to
 * log a delivery or an application against stock does so by recording a
 * fresh total, honestly labelled throughout this UI as a dated manual
 * observation, never implied to be a continuously-updated running
 * balance. The "confirmed incoming delivery" band of the stock visual
 * this module also feeds (`buildFertiliserStockBand`) is therefore always
 * `0`/undefined this build — there is no reliable incoming-delivery
 * record to draw it from (the brief's own explicit instruction: "If
 * incoming-delivery tracking does not exist, implement stock versus
 * requirement first... Quote requests never count as incoming stock").
 * The field is kept (never removed) so a future campaign that adds a
 * real, reliable delivery-receipt record can populate it without
 * reshaping this type.
 */

export const FERTILISER_STOCK_VERSION = "fertiliser_stock_v1.0.0";

export const FERTILISER_STOCK_UNITS = ["kg", "t"] as const;
export type FertiliserStockUnit = (typeof FERTILISER_STOCK_UNITS)[number];

export interface FertiliserStockRecord {
  id: string;
  farmId: string;
  product: string;
  quantity: number;
  unit: FertiliserStockUnit;
  /** ISO date (YYYY-MM-DD) — the date this observation is true as of,
   * farmer-entered, never assumed to be "today". */
  effectiveDate: string;
  /** e.g. "Farmer count", "Delivery docket", "Weighbridge" — free text,
   * never fabricated; the UI defaults it to "Farmer entered" but never
   * hides the field. */
  source: string;
  note?: string;
  /** ISO datetime — when Farm Return actually captured this row
   * (`created_at`), distinct from `effectiveDate`. Used only to break
   * same-day ties in `currentFertiliserStockByProduct` — never shown as
   * if it were the observation date itself. */
  recordedAt: string;
}

export function fertiliserStockRecordQuantityKg(record: Pick<FertiliserStockRecord, "quantity" | "unit">): number {
  return record.unit === "t" ? record.quantity * 1000 : record.quantity;
}

export interface NewFertiliserStockRecordInput {
  product: string;
  quantity: number;
  unit: FertiliserStockUnit;
  effectiveDate: string;
  source: string;
  note?: string;
}

export interface FertiliserStockRecordValidationError {
  field: "product" | "quantity" | "unit" | "effectiveDate" | "source";
  message: string;
}

/**
 * Codex audit MEDIUM (round 1): `new Date(value).getTime()` alone does
 * NOT reject a nonexistent calendar date — `new Date("2026-02-30")`
 * quietly rolls over to a real, valid `2026-03-02` timestamp rather than
 * failing, so a value like that previously passed this module's own
 * "Enter a valid date" check and reached PostgreSQL's real `date` column,
 * which then throws a raw database exception instead of the honest,
 * field-level validation error this function promises. Fixed with a real
 * round-trip check: a strict `YYYY-MM-DD` shape, then re-derives
 * year/month/day from the constructed UTC date and requires an EXACT
 * match against the input — a real rollover (Feb 30 -> Mar 2) fails this,
 * a real valid date (leap-year Feb 29) does not.
 */
function isValidCalendarDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Real validation shared by the client form and the server action
 * before it ever reaches the database (defense in depth on top of the
 * migration's own `check` constraints — CLAUDE.md "never assume
 * application code is the only writer").
 */
export function validateNewFertiliserStockRecordInput(input: NewFertiliserStockRecordInput, today: string): FertiliserStockRecordValidationError[] {
  const errors: FertiliserStockRecordValidationError[] = [];
  if (!input.product || input.product.trim().length === 0) {
    errors.push({ field: "product", message: "Choose or enter a product" });
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    errors.push({ field: "quantity", message: "Enter a quantity greater than zero" });
  }
  if (!FERTILISER_STOCK_UNITS.includes(input.unit)) {
    errors.push({ field: "unit", message: "Unit must be kg or t" });
  }
  if (!input.effectiveDate || !isValidCalendarDateString(input.effectiveDate)) {
    errors.push({ field: "effectiveDate", message: "Enter a valid date" });
  } else if (input.effectiveDate > today) {
    errors.push({ field: "effectiveDate", message: "Effective date cannot be in the future" });
  }
  if (!input.source || input.source.trim().length === 0) {
    errors.push({ field: "source", message: "Enter where this figure came from" });
  }
  return errors;
}

export interface CurrentFertiliserStock {
  product: string;
  quantityKg: number;
  effectiveDate: string;
  source: string;
  recordedAt: string;
  note?: string;
}

function isMoreRecentStockRecord(a: FertiliserStockRecord, b: FertiliserStockRecord): boolean {
  if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate > b.effectiveDate;
  return a.recordedAt > b.recordedAt;
}

/**
 * Codex audit HIGH (round 1): product identity is free text (the stock
 * form's own "Other product…" path) — without this, "Urea", "urea" and
 * " Urea " would each form a separate, real balance, so a farmer's real
 * recorded stock could silently fail to offset its own real demand row
 * (shown as a false shortfall) while also appearing as an unrelated
 * false surplus under the differently-cased spelling. This is a
 * MATCHING key only — trimmed, lower-cased, internal whitespace
 * collapsed — never a display value and never what gets stored; the
 * farmer's own original spelling is always preserved and shown (see
 * `currentFertiliserStockByProduct`'s own `product` field below, which
 * returns the real spelling of whichever record currently wins, never
 * this normalised key).
 */
export function normaliseFertiliserProductKey(product: string): string {
  return product.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The real current stock balance per product — each product's own most
 * recent record (by `effectiveDate`, ties broken by `recordedAt` so a
 * same-day correction always wins over an earlier same-day entry). Never
 * sums or averages across records: a new record is a farmer's full
 * replacement count, not a delta on top of the previous one. A product
 * with no record at all is simply absent from the returned map — "unknown
 * is not zero" (brief's own DATA INTEGRITY section): callers must never
 * treat a missing map entry as a confirmed zero balance.
 *
 * Keyed by `normaliseFertiliserProductKey`, not the raw product string —
 * callers must normalise their own lookup key the same way (this
 * module's own `normaliseFertiliserProductKey`, exported for exactly
 * that). Each entry's own `product` field is still the real, as-typed
 * spelling of whichever record currently wins — never the normalised key
 * itself, which is for matching only.
 */
export function currentFertiliserStockByProduct(records: readonly FertiliserStockRecord[]): Map<string, CurrentFertiliserStock> {
  const latestByKey = new Map<string, FertiliserStockRecord>();
  for (const record of records) {
    const key = normaliseFertiliserProductKey(record.product);
    const existing = latestByKey.get(key);
    if (!existing || isMoreRecentStockRecord(record, existing)) {
      latestByKey.set(key, record);
    }
  }
  const out = new Map<string, CurrentFertiliserStock>();
  for (const [key, record] of latestByKey) {
    out.set(key, {
      product: record.product,
      quantityKg: fertiliserStockRecordQuantityKg(record),
      effectiveDate: record.effectiveDate,
      source: record.source,
      recordedAt: record.recordedAt,
      note: record.note,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stock band — the pure arithmetic behind the farm-wide overview's stock
// column visual (solid = stock, hatched = confirmed incoming, empty =
// shortfall). One discriminated shape so "stock genuinely never recorded"
// (brief: "Stock not recorded", never rendered as a false, confirmed
// shortfall) can never be confused with "recorded, and happens to be
// zero".
// ---------------------------------------------------------------------------

export interface FertiliserStockBandNotRecorded {
  status: "not_recorded";
  product: string;
  npkAnalysis?: string;
  remainingRequirementKg: number;
  hasRemainingRequirement: boolean;
}

export interface FertiliserStockBandRecorded {
  status: "recorded";
  product: string;
  npkAnalysis?: string;
  /** Height denominator for the visual — the real REMAINING planned
   * requirement, never the full recommended total (brief section 3:
   * "Remaining planned requirement"). Clamped to >= 0 — a genuinely
   * negative remaining requirement is not a real domain state
   * (`aggregateFarmFertiliserDemand`'s own `Math.max(0, ...)` already
   * guarantees this upstream; clamped again here defensively). */
  remainingRequirementKg: number;
  hasRemainingRequirement: boolean;
  /** Real most-recently-recorded stock, as-is — never capped to the
   * requirement (a real surplus is a real, larger number). */
  stockKg: number;
  stockAsOf: string;
  stockSource: string;
  /** Always `0` this build — see this module's own header for the
   * disclosed "no reliable incoming-delivery record" scope limit. */
  confirmedIncomingKg: number;
  /** Real portion of `stockKg` that fits within the remaining
   * requirement — the SOLID band's own height, `stockKg` capped to
   * `remainingRequirementKg`. */
  cappedStockKg: number;
  /** Real portion of `confirmedIncomingKg` that fits in whatever
   * headroom is left after `cappedStockKg` — the HATCHED band's own
   * height. Always `0` this build (see `confirmedIncomingKg` above). */
  cappedIncomingKg: number;
  /** `max(0, remaining - cappedStock - cappedIncoming)` — the EMPTY
   * band's own height; `cappedStockKg + cappedIncomingKg + shortfallKg`
   * always sums to exactly `remainingRequirementKg` (or `0` when there is
   * no remaining requirement at all). */
  shortfallKg: number;
  /** `max(0, stockKg + confirmedIncomingKg - remainingRequirementKg)` —
   * a genuine surplus, disclosed explicitly rather than silently clamped
   * away (brief: "show surplus explicitly"). */
  surplusKg: number;
  /** 0-100, `cappedStockKg / remainingRequirementKg * 100` — `0` when
   * there is no remaining requirement (never divides by zero). */
  stockPct: number;
  incomingPct: number;
  shortfallPct: number;
}

export type FertiliserStockBand = FertiliserStockBandNotRecorded | FertiliserStockBandRecorded;

function safePct(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function buildFertiliserStockBand(params: {
  product: string;
  npkAnalysis?: string;
  remainingRequirementKg: number;
  currentStock?: CurrentFertiliserStock;
  /** Always omitted/`0` this build — see this module's own header. */
  confirmedIncomingKg?: number;
}): FertiliserStockBand {
  const remaining = Math.max(0, params.remainingRequirementKg);
  const hasRemainingRequirement = remaining > 0;

  if (!params.currentStock) {
    return {
      status: "not_recorded",
      product: params.product,
      npkAnalysis: params.npkAnalysis,
      remainingRequirementKg: remaining,
      hasRemainingRequirement,
    };
  }

  const stockKg = params.currentStock.quantityKg;
  const confirmedIncomingKg = params.confirmedIncomingKg ?? 0;

  const cappedStockKg = Math.min(stockKg, remaining);
  const headroomAfterStock = remaining - cappedStockKg;
  const cappedIncomingKg = Math.min(confirmedIncomingKg, headroomAfterStock);
  const shortfallKg = Math.max(0, remaining - cappedStockKg - cappedIncomingKg);
  const surplusKg = Math.max(0, stockKg + confirmedIncomingKg - remaining);

  return {
    status: "recorded",
    product: params.product,
    npkAnalysis: params.npkAnalysis,
    remainingRequirementKg: remaining,
    hasRemainingRequirement,
    stockKg,
    stockAsOf: params.currentStock.effectiveDate,
    stockSource: params.currentStock.source,
    confirmedIncomingKg,
    cappedStockKg,
    cappedIncomingKg,
    shortfallKg,
    surplusKg,
    stockPct: safePct(cappedStockKg, remaining),
    incomingPct: safePct(cappedIncomingKg, remaining),
    shortfallPct: safePct(shortfallKg, remaining),
  };
}
