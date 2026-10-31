/**
 * Supplier Portal — pure supplier-quote domain logic.
 *
 * A supplier answers a farmer's routed quote request (an "RFQ" from the
 * supplier's side) with a quote: priced line items, a delivery charge,
 * a delivery window and a validity date. This module validates that
 * input, computes its totals and owns the quote lifecycle and the
 * supplier-facing RFQ status. No I/O, no clock read (callers pass
 * `today`), no id generation — `AGENTS.md`'s domain-layer rule.
 *
 * Money is exact: every amount is parsed from a decimal string into an
 * integer number of cents (quantities into thousandths, VAT rates into
 * basis points) and multiplied with `BigInt`, never with binary floats.
 * Each line is rounded half-up to the cent, then lines are summed
 * (`docs/evidence-register.md` "Supplier Portal — quote totals").
 *
 * No VAT rate, price or delivery charge is encoded here: every rate is
 * supplier-declared on the quote itself. A line without a declared VAT
 * rate has UNKNOWN VAT — never 0 — and such a quote cannot be submitted.
 *
 * The persistence layer stores only the inputs; totals are recomputed
 * from those immutable inputs on every read with the method named by
 * `SUPPLIER_QUOTE_TOTALS_METHOD`, and an unknown method fails closed.
 */

import { QUOTE_REQUEST_UNITS, type QuoteRequestUnit } from "./quote-request";
import { isValidIsoUtcDateTime } from "./iso-datetime";

export const SUPPLIER_QUOTE_TOTALS_METHOD = "supplier_quote_totals_v1";
export const SUPPLIER_QUOTE_MAX_LINES = 50;
/** Input-sanity ceilings (not business rules): they keep every exact
 * cent total far inside `Number.MAX_SAFE_INTEGER`. */
export const SUPPLIER_QUOTE_MAX_QUANTITY = 100_000;
export const SUPPLIER_QUOTE_MAX_AMOUNT_EUR = 100_000;
export const SUPPLIER_QUOTE_TEXT_LIMITS = { product: 200, description: 500, paymentTerms: 500, notes: 2000, declineReason: 500, withdrawReason: 500 } as const;

export const SUPPLIER_QUOTE_UNITS = QUOTE_REQUEST_UNITS;

// ---------------------------------------------------------------------
// Exact decimals
// ---------------------------------------------------------------------

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

/**
 * Parses a non-negative decimal string (or a finite JS number, which is
 * read via its shortest round-trip spelling) into an integer scaled by
 * 10^scale. Returns null when the value is not a plain decimal or has
 * more fractional digits than `scale` — a value is never silently
 * rounded to fit.
 */
export function parseScaledDecimal(value: unknown, scale: number): bigint | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    text = String(value);
    if (/e/i.test(text)) return null;
  } else if (typeof value === "string") {
    text = value.trim();
  } else {
    return null;
  }
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) return null;
  const whole = match[1];
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (fraction.length > scale) return null;
  return BigInt(whole + fraction.padEnd(scale, "0"));
}

/** The canonical decimal spelling of a scaled integer, trailing zeros
 * trimmed when `fixed` is false. */
export function formatScaledDecimal(scaled: bigint, scale: number, fixed = false): string {
  const negative = scaled < BigInt(0);
  const abs = negative ? -scaled : scaled;
  const digits = abs.toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  let fraction = scale > 0 ? digits.slice(digits.length - scale) : "";
  if (!fixed) fraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Half-up integer division for non-negative operands. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
}

const QUANTITY_SCALE = 3;
const MONEY_SCALE = 2;
const RATE_SCALE = 2;

// ---------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------

export interface SupplierQuoteLineInput {
  product: string;
  description: string | null;
  /** Decimal string, up to 3 fractional digits, > 0. */
  quantity: string;
  unit: QuoteRequestUnit;
  /** Decimal string in EUR excluding VAT, up to 2 fractional digits. */
  unitPriceExVat: string;
  /** Decimal string percent, up to 2 fractional digits, 0–100; null = not yet declared. */
  vatRatePercent: string | null;
}

export interface SupplierQuoteDraftInput {
  lines: SupplierQuoteLineInput[];
  /** null = not yet declared; "0" = delivery included at no charge. */
  deliveryChargeExVat: string | null;
  deliveryVatRatePercent: string | null;
  deliveryEarliest: string | null;
  deliveryLatest: string | null;
  validUntil: string | null;
  paymentTerms: string | null;
  notes: string | null;
}

export interface SupplierQuoteIssue {
  /** Dotted path, e.g. `lines.0.unitPriceExVat`. */
  path: string;
  message: string;
}

export type SupplierQuoteValidation<T> = { ok: true; value: T } | { ok: false; issues: SupplierQuoteIssue[] };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isRealCalendarDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value) && isValidIsoUtcDateTime(`${value}T00:00:00.000Z`);
}

function optionalText(raw: unknown, path: string, limit: number, issues: SupplierQuoteIssue[]): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") {
    issues.push({ path, message: "Must be text." });
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > limit) issues.push({ path, message: `Must be ${limit} characters or fewer.` });
  return trimmed;
}

function optionalDate(raw: unknown, path: string, issues: SupplierQuoteIssue[]): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (!isRealCalendarDate(raw)) {
    issues.push({ path, message: "Must be a real date (YYYY-MM-DD)." });
    return null;
  }
  return raw;
}

function scaledInRange(
  raw: unknown,
  path: string,
  scale: number,
  bounds: { min: bigint; max: bigint; minExclusive?: boolean; fixed?: boolean },
  label: string,
  issues: SupplierQuoteIssue[],
): string | null {
  const scaled = parseScaledDecimal(raw, scale);
  if (scaled === null) {
    issues.push({ path, message: `${label} must be a number with at most ${scale} decimal places.` });
    return null;
  }
  const tooLow = bounds.minExclusive ? scaled <= bounds.min : scaled < bounds.min;
  if (tooLow || scaled > bounds.max) {
    issues.push({ path, message: `${label} is out of range.` });
    return null;
  }
  return formatScaledDecimal(scaled, scale, bounds.fixed === true);
}

function optionalScaled(
  raw: unknown,
  path: string,
  scale: number,
  bounds: { min: bigint; max: bigint; fixed?: boolean },
  label: string,
  issues: SupplierQuoteIssue[],
): string | null {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return null;
  return scaledInRange(raw, path, scale, bounds, label, issues);
}

const ZERO = BigInt(0);
const MAX_QUANTITY_SCALED = BigInt(SUPPLIER_QUOTE_MAX_QUANTITY) * BigInt(10 ** QUANTITY_SCALE);
const MAX_AMOUNT_SCALED = BigInt(SUPPLIER_QUOTE_MAX_AMOUNT_EUR) * BigInt(10 ** MONEY_SCALE);
const MAX_RATE_SCALED = BigInt(100) * BigInt(10 ** RATE_SCALE);

/**
 * Structural validation of a quote draft. Drafts may be incomplete
 * (no price yet, no VAT rate yet, no validity date yet), but every value
 * present must be well-formed and in range. Unknown keys are dropped —
 * in particular any client-supplied supplier, farm or total field is
 * never carried forward.
 */
export function validateSupplierQuoteDraft(input: unknown): SupplierQuoteValidation<SupplierQuoteDraftInput> {
  const issues: SupplierQuoteIssue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ path: "", message: "Expected a quote object." }] };
  }
  const raw = input as Record<string, unknown>;
  const rawLines = raw.lines;
  const lines: SupplierQuoteLineInput[] = [];
  if (!Array.isArray(rawLines)) {
    issues.push({ path: "lines", message: "Expected a list of line items." });
  } else if (rawLines.length > SUPPLIER_QUOTE_MAX_LINES) {
    issues.push({ path: "lines", message: `A quote can have at most ${SUPPLIER_QUOTE_MAX_LINES} line items.` });
  } else {
    rawLines.forEach((rawLine, index) => {
      const base = `lines.${index}`;
      if (typeof rawLine !== "object" || rawLine === null || Array.isArray(rawLine)) {
        issues.push({ path: base, message: "Expected a line item." });
        return;
      }
      const line = rawLine as Record<string, unknown>;
      const product = optionalText(line.product, `${base}.product`, SUPPLIER_QUOTE_TEXT_LIMITS.product, issues);
      if (product === null) issues.push({ path: `${base}.product`, message: "Product is required." });
      const description = optionalText(line.description, `${base}.description`, SUPPLIER_QUOTE_TEXT_LIMITS.description, issues);
      const quantity = scaledInRange(line.quantity, `${base}.quantity`, QUANTITY_SCALE, { min: ZERO, max: MAX_QUANTITY_SCALED, minExclusive: true }, "Quantity", issues);
      const unit = line.unit;
      if (typeof unit !== "string" || !(SUPPLIER_QUOTE_UNITS as readonly string[]).includes(unit)) {
        issues.push({ path: `${base}.unit`, message: "Unit must be kg, tonnes or bags." });
      }
      const unitPriceExVat = scaledInRange(line.unitPriceExVat, `${base}.unitPriceExVat`, MONEY_SCALE, { min: ZERO, max: MAX_AMOUNT_SCALED, fixed: true }, "Unit price", issues);
      const vatRatePercent = optionalScaled(line.vatRatePercent, `${base}.vatRatePercent`, RATE_SCALE, { min: ZERO, max: MAX_RATE_SCALED }, "VAT rate", issues);
      if (product !== null && quantity !== null && unitPriceExVat !== null && typeof unit === "string" && (SUPPLIER_QUOTE_UNITS as readonly string[]).includes(unit)) {
        lines.push({ product, description, quantity, unit: unit as QuoteRequestUnit, unitPriceExVat, vatRatePercent });
      }
    });
  }

  const deliveryChargeExVat = optionalScaled(raw.deliveryChargeExVat, "deliveryChargeExVat", MONEY_SCALE, { min: ZERO, max: MAX_AMOUNT_SCALED, fixed: true }, "Delivery charge", issues);
  const deliveryVatRatePercent = optionalScaled(raw.deliveryVatRatePercent, "deliveryVatRatePercent", RATE_SCALE, { min: ZERO, max: MAX_RATE_SCALED }, "Delivery VAT rate", issues);
  const deliveryEarliest = optionalDate(raw.deliveryEarliest, "deliveryEarliest", issues);
  const deliveryLatest = optionalDate(raw.deliveryLatest, "deliveryLatest", issues);
  if (deliveryEarliest && deliveryLatest && deliveryEarliest > deliveryLatest) {
    issues.push({ path: "deliveryLatest", message: "Latest delivery date must be on or after the earliest." });
  }
  const validUntil = optionalDate(raw.validUntil, "validUntil", issues);
  const paymentTerms = optionalText(raw.paymentTerms, "paymentTerms", SUPPLIER_QUOTE_TEXT_LIMITS.paymentTerms, issues);
  const notes = optionalText(raw.notes, "notes", SUPPLIER_QUOTE_TEXT_LIMITS.notes, issues);

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: { lines, deliveryChargeExVat, deliveryVatRatePercent, deliveryEarliest, deliveryLatest, validUntil, paymentTerms, notes },
  };
}

/**
 * Completeness checks a draft must pass before submission. `today` is
 * the caller's Europe/Dublin calendar date; the database repeats the
 * same check at the write boundary.
 */
export function supplierQuoteSubmissionIssues(draft: SupplierQuoteDraftInput, today: string): SupplierQuoteIssue[] {
  const issues: SupplierQuoteIssue[] = [];
  if (draft.lines.length === 0) issues.push({ path: "lines", message: "Add at least one priced line item." });
  draft.lines.forEach((line, index) => {
    if (line.vatRatePercent === null) issues.push({ path: `lines.${index}.vatRatePercent`, message: "Declare the VAT rate for this line." });
  });
  if (draft.deliveryChargeExVat === null) {
    issues.push({ path: "deliveryChargeExVat", message: "Enter the delivery charge (0 if delivery is included)." });
  } else if (parseScaledDecimal(draft.deliveryChargeExVat, MONEY_SCALE)! > ZERO && draft.deliveryVatRatePercent === null) {
    issues.push({ path: "deliveryVatRatePercent", message: "Declare the VAT rate for the delivery charge." });
  }
  if (draft.deliveryEarliest === null) issues.push({ path: "deliveryEarliest", message: "Enter the earliest delivery date." });
  if (draft.deliveryLatest === null) issues.push({ path: "deliveryLatest", message: "Enter the latest delivery date." });
  if (draft.validUntil === null) {
    issues.push({ path: "validUntil", message: "Enter the date this quote is valid until." });
  } else if (draft.validUntil < today) {
    issues.push({ path: "validUntil", message: "The validity date has already passed." });
  }
  return issues;
}

// ---------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------

export interface SupplierQuoteLineTotals {
  lineNumber: number;
  exVatCents: number;
  /** null = VAT rate not declared (UNKNOWN, never 0). */
  vatCents: number | null;
  incVatCents: number | null;
}

export interface SupplierQuoteVatBand {
  ratePercent: string;
  netCents: number;
  vatCents: number;
}

export interface SupplierQuoteTotals {
  method: typeof SUPPLIER_QUOTE_TOTALS_METHOD;
  lines: SupplierQuoteLineTotals[];
  goodsExVatCents: number;
  /** null = delivery charge not declared. */
  deliveryExVatCents: number | null;
  /** Ex-VAT total; null while the delivery charge is undeclared. */
  totalExVatCents: number | null;
  /** null while any VAT rate (or the delivery charge) is undeclared. */
  vatCents: number | null;
  totalIncVatCents: number | null;
  vatBands: SupplierQuoteVatBand[];
  /** True only when every figure above is known. */
  complete: boolean;
}

function scaledOrThrow(value: string, scale: number, label: string): bigint {
  const scaled = parseScaledDecimal(value, scale);
  if (scaled === null) throw new Error(`computeSupplierQuoteTotals: ${label} "${value}" is not a valid decimal`);
  return scaled;
}

/**
 * Exact totals for a structurally valid draft (the output of
 * `validateSupplierQuoteDraft`, or stored inputs read back from the
 * database). Per line: ex-VAT = round_half_up(quantity × unit price) to
 * the cent; VAT = round_half_up(ex-VAT × rate) to the cent. Delivery is
 * one more ex-VAT amount with its own rate. Totals are sums of rounded
 * lines. Throws on malformed input — callers validate first.
 */
export function computeSupplierQuoteTotals(draft: Pick<SupplierQuoteDraftInput, "lines" | "deliveryChargeExVat" | "deliveryVatRatePercent">): SupplierQuoteTotals {
  const thousand = BigInt(1000);
  const tenThousand = BigInt(10000);
  const bands = new Map<string, { net: bigint; vat: bigint }>();
  let goods = ZERO;
  let vat: bigint | null = ZERO;

  const addBand = (rateScaled: bigint, net: bigint, lineVat: bigint) => {
    const key = formatScaledDecimal(rateScaled, RATE_SCALE);
    const band = bands.get(key) ?? { net: ZERO, vat: ZERO };
    band.net += net;
    band.vat += lineVat;
    bands.set(key, band);
  };

  const lines = draft.lines.map((line, index): SupplierQuoteLineTotals => {
    const quantity = scaledOrThrow(line.quantity, QUANTITY_SCALE, "quantity");
    const price = scaledOrThrow(line.unitPriceExVat, MONEY_SCALE, "unit price");
    const ex = divideRoundHalfUp(quantity * price, thousand);
    goods += ex;
    if (line.vatRatePercent === null) {
      vat = null;
      return { lineNumber: index + 1, exVatCents: Number(ex), vatCents: null, incVatCents: null };
    }
    const rate = scaledOrThrow(line.vatRatePercent, RATE_SCALE, "VAT rate");
    const lineVat = divideRoundHalfUp(ex * rate, tenThousand);
    if (vat !== null) vat += lineVat;
    addBand(rate, ex, lineVat);
    return { lineNumber: index + 1, exVatCents: Number(ex), vatCents: Number(lineVat), incVatCents: Number(ex + lineVat) };
  });

  let delivery: bigint | null = null;
  if (draft.deliveryChargeExVat === null) {
    vat = null;
  } else {
    delivery = scaledOrThrow(draft.deliveryChargeExVat, MONEY_SCALE, "delivery charge");
    if (delivery > ZERO) {
      if (draft.deliveryVatRatePercent === null) {
        vat = null;
      } else {
        const rate = scaledOrThrow(draft.deliveryVatRatePercent, RATE_SCALE, "delivery VAT rate");
        const deliveryVat = divideRoundHalfUp(delivery * rate, tenThousand);
        if (vat !== null) vat += deliveryVat;
        addBand(rate, delivery, deliveryVat);
      }
    }
  }

  const totalEx = delivery === null ? null : goods + delivery;
  const finalVat = vat as bigint | null;
  const totalInc = totalEx !== null && finalVat !== null ? totalEx + finalVat : null;
  const vatBands = [...bands.entries()]
    .sort(([a], [b]) => Number(parseScaledDecimal(a, RATE_SCALE)! - parseScaledDecimal(b, RATE_SCALE)!))
    .map(([ratePercent, band]) => ({ ratePercent, netCents: Number(band.net), vatCents: Number(band.vat) }));

  return {
    method: SUPPLIER_QUOTE_TOTALS_METHOD,
    lines,
    goodsExVatCents: Number(goods),
    deliveryExVatCents: delivery === null ? null : Number(delivery),
    totalExVatCents: totalEx === null ? null : Number(totalEx),
    vatCents: finalVat === null ? null : Number(finalVat),
    totalIncVatCents: totalInc === null ? null : Number(totalInc),
    vatBands,
    complete: totalInc !== null,
  };
}

/** Totals for a stored quote: fails closed on a totals method this code
 * does not implement rather than presenting a figure computed some
 * other way. A draft (method null) uses the current method. */
export function computeStoredSupplierQuoteTotals(
  quote: Pick<SupplierQuoteDraftInput, "lines" | "deliveryChargeExVat" | "deliveryVatRatePercent"> & { totalsMethod: string | null },
): SupplierQuoteTotals | { method: string; unsupported: true } {
  if (quote.totalsMethod !== null && quote.totalsMethod !== SUPPLIER_QUOTE_TOTALS_METHOD) {
    return { method: quote.totalsMethod, unsupported: true };
  }
  return computeSupplierQuoteTotals(quote);
}

// ---------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------

export const SUPPLIER_QUOTE_STATUSES = ["draft", "submitted", "withdrawn", "discarded"] as const;
export type SupplierQuoteStatus = (typeof SUPPLIER_QUOTE_STATUSES)[number];
export type SupplierQuoteAction = "save" | "submit" | "withdraw" | "discard";

const TRANSITIONS: Record<SupplierQuoteStatus, Partial<Record<SupplierQuoteAction, SupplierQuoteStatus>>> = {
  draft: { save: "draft", submit: "submitted", discard: "discarded" },
  submitted: { withdraw: "withdrawn" },
  withdrawn: {},
  discarded: {},
};

/** The status a quote moves to under `action`, or null when the
 * transition is not allowed (a submitted quote is immutable; withdrawn
 * and discarded are terminal). Mirrors the database RPC guards. */
export function nextSupplierQuoteStatus(from: SupplierQuoteStatus, action: SupplierQuoteAction): SupplierQuoteStatus | null {
  return TRANSITIONS[from][action] ?? null;
}

export function isLiveSupplierQuoteStatus(status: SupplierQuoteStatus): boolean {
  return status === "draft" || status === "submitted";
}

/**
 * Supplier-facing RFQ status, derived from workflow facts only. Precedence
 * (first match wins), so a stronger fact is never hidden by a weaker one:
 * 1. FARMER_WITHDRAWN — the farmer withdrew the request.
 * 2. DECLINED — the supplier declined it.
 * 3. QUOTE_NEEDS_REVIEW — a live quote (draft or submitted) was priced
 *    against an earlier revision than the farmer's current one.
 * 4. QUOTE_EXPIRED — a submitted quote whose validity date has passed.
 * 5. QUOTE_SUBMITTED / DRAFT — the live quote's own status.
 * 6. OPEN — viewed, no live quote; NEW — never viewed.
 */
export type SupplierRfqStatus = "NEW" | "OPEN" | "DRAFT" | "QUOTE_SUBMITTED" | "QUOTE_NEEDS_REVIEW" | "QUOTE_EXPIRED" | "DECLINED" | "FARMER_WITHDRAWN";

export interface SupplierRfqStatusFacts {
  requestWithdrawn: boolean;
  declined: boolean;
  viewed: boolean;
  currentRevisionNumber: number;
  liveQuote: { status: SupplierQuoteStatus; quotedRevisionNumber: number; validUntil: string | null } | null;
  today: string;
}

export function deriveSupplierRfqStatus(facts: SupplierRfqStatusFacts): SupplierRfqStatus {
  if (facts.requestWithdrawn) return "FARMER_WITHDRAWN";
  if (facts.declined) return "DECLINED";
  const live = facts.liveQuote && isLiveSupplierQuoteStatus(facts.liveQuote.status) ? facts.liveQuote : null;
  if (live) {
    if (live.quotedRevisionNumber < facts.currentRevisionNumber) return "QUOTE_NEEDS_REVIEW";
    if (live.status === "submitted") {
      return live.validUntil !== null && live.validUntil < facts.today ? "QUOTE_EXPIRED" : "QUOTE_SUBMITTED";
    }
    return "DRAFT";
  }
  return facts.viewed ? "OPEN" : "NEW";
}

/** What the supplier may do on an RFQ in its current state. */
export function supplierRfqPermissions(status: SupplierRfqStatus, liveQuoteStatus: SupplierQuoteStatus | null) {
  const closed = status === "FARMER_WITHDRAWN" || status === "DECLINED";
  return {
    canEditDraft: !closed && liveQuoteStatus !== "submitted",
    canSubmit: !closed && liveQuoteStatus === "draft",
    canWithdraw: liveQuoteStatus === "submitted",
    canDiscard: liveQuoteStatus === "draft",
    canDecline: !closed && liveQuoteStatus === null,
  };
}

// ---------------------------------------------------------------------
// Overview KPIs
// ---------------------------------------------------------------------

export interface SupplierPortalKpiInput {
  status: SupplierRfqStatus;
  liveQuote: { status: SupplierQuoteStatus; validUntil: string | null; totalIncVatCents: number | null } | null;
}

export interface SupplierPortalKpis {
  totalRfqs: number;
  newRfqs: number;
  awaitingQuote: number;
  drafts: number;
  submitted: number;
  needsReview: number;
  expired: number;
  closed: number;
  /** Submitted, unexpired quotes whose validity ends within 7 days of today. */
  expiringWithinWeek: number;
  /** Sum of inc-VAT totals of submitted, unexpired quotes — offers, not orders. */
  liveSubmittedValueCents: number;
  /** Submitted quotes whose total could not be computed (e.g. unsupported method) — excluded from the sum above, never counted as 0. */
  liveSubmittedValueUnknown: number;
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function summariseSupplierPortal(rfqs: SupplierPortalKpiInput[], today: string): SupplierPortalKpis {
  const weekAhead = addDaysToIsoDate(today, 7);
  const kpis: SupplierPortalKpis = {
    totalRfqs: rfqs.length,
    newRfqs: 0,
    awaitingQuote: 0,
    drafts: 0,
    submitted: 0,
    needsReview: 0,
    expired: 0,
    closed: 0,
    expiringWithinWeek: 0,
    liveSubmittedValueCents: 0,
    liveSubmittedValueUnknown: 0,
  };
  for (const rfq of rfqs) {
    switch (rfq.status) {
      case "NEW":
        kpis.newRfqs += 1;
        kpis.awaitingQuote += 1;
        break;
      case "OPEN":
        kpis.awaitingQuote += 1;
        break;
      case "DRAFT":
        kpis.drafts += 1;
        kpis.awaitingQuote += 1;
        break;
      case "QUOTE_NEEDS_REVIEW":
        kpis.needsReview += 1;
        break;
      case "QUOTE_EXPIRED":
        kpis.expired += 1;
        break;
      case "QUOTE_SUBMITTED":
        kpis.submitted += 1;
        break;
      case "DECLINED":
      case "FARMER_WITHDRAWN":
        kpis.closed += 1;
        break;
    }
    if (rfq.status === "QUOTE_SUBMITTED" && rfq.liveQuote) {
      if (rfq.liveQuote.validUntil !== null && rfq.liveQuote.validUntil <= weekAhead) kpis.expiringWithinWeek += 1;
      if (rfq.liveQuote.totalIncVatCents === null) kpis.liveSubmittedValueUnknown += 1;
      else kpis.liveSubmittedValueCents += rfq.liveQuote.totalIncVatCents;
    }
  }
  return kpis;
}
