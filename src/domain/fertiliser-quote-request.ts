/**
 * Fertiliser Vertical Completion, Session 4 — the fertiliser quote request.
 *
 * The scientific calculation ends at the canonical `FarmFertiliserQuoteBasket`
 * (`buildFarmFertiliserQuoteBasket`, `./fertiliser-plan`). This module is the
 * commercial layer on top of it: it copies the basket's lines verbatim as the
 * canonical requirement, and lets the farmer set a separate requested
 * purchasing quantity, recipients, delivery details and a note. It never
 * reads a field plan, slurry figure or product selection, never recalculates
 * a quantity or price, and never mutates the basket.
 *
 * Lifecycle: DRAFT → READY_TO_SEND → SENT | FAILED (retryable), and any
 * non-SENT state → CANCELLED. SENT is reachable only through
 * `recordFertiliserQuoteDeliveryAttempt` with a successful attempt carrying a
 * provider reference. No supplier delivery integration exists in this
 * repository (`FERTILISER_QUOTE_DELIVERY_CAPABILITY`), so the farmer-facing
 * workflow ends at READY_TO_SEND. Not persisted: the request lives in the
 * client session only (durable persistence deferred — DOMAIN_CONTRACTS).
 *
 * No I/O, no id/timestamp generation — callers supply both.
 */
import { validateQuoteDeliveryWindow, type QuoteDeliveryWindow } from "./quote-request";
import {
  KG_PER_TONNE,
  TONNES_ROUNDING_DECIMALS,
  type FarmFertiliserBasketStatus,
  type FarmFertiliserQuoteBasket,
  type FarmFertiliserQuoteBasketFieldRef,
} from "./fertiliser-plan";

export const FERTILISER_QUOTE_REQUEST_VERSION = "fertiliser_quote_request_v1.0.0";

export type FertiliserQuoteRequestStatus = "DRAFT" | "READY_TO_SEND" | "SENT" | "FAILED" | "CANCELLED";

/** WHOLE_FARM: basket READY. WHOLE_FARM_PROVISIONAL: READY_WITH_PROVISIONAL_ITEMS.
 * PARTIAL: basket INCOMPLETE — only the known products, never the whole farm. */
export type FertiliserQuoteRequestCoverage = "WHOLE_FARM" | "WHOLE_FARM_PROVISIONAL" | "PARTIAL";

/** No email, supplier API, RFQ or webhook boundary exists in this repository;
 * nothing is ever sent to a supplier by Farm Return. */
export const FERTILISER_QUOTE_DELIVERY_CAPABILITY = {
  status: "UNAVAILABLE",
  reasonCode: "NO_SUPPLIER_DELIVERY_INTEGRATION",
} as const;

export interface FertiliserQuoteRequestLine {
  /** Basket identity: exact product name + N-P-K analysis (no catalogue id). */
  productKey: string;
  name: string;
  npkAnalysis: string;
  catalogueVerified: boolean;
  unit: "kg";
  /** The basket's exact canonical quantity — never edited. */
  canonicalQuantityKg: number;
  /** The basket's own display tonnes (rounded up to 0.01 t). */
  canonicalDisplayTonnes: number;
  /** What the farmer asks the supplier to quote for, to 0.01 t. */
  requestedTonnes: number;
  requestedQuantityKg: number;
  /** True when the farmer asked for less than the canonical requirement —
   * allowed, but always disclosed, never silent. */
  requestedBelowCanonical: boolean;
  /** The basket's estimate for the canonical quantity; `null` when unknown,
   * never €0. Not recomputed for the requested quantity. */
  estimatedCostEur: number | null;
  costBasis: "ESTIMATE";
  provisional: boolean;
}

export interface FertiliserQuoteRecipient {
  name: string;
  /** Free-text contact (email/phone) if the farmer supplied one. */
  contact: string | null;
}

export interface FertiliserQuoteRequestDetails {
  recipients: FertiliserQuoteRecipient[];
  deliveryLocation: string | null;
  deliveryWindow: QuoteDeliveryWindow | null;
  contact: string | null;
  farmerNote: string | null;
}

export interface FertiliserQuoteDeliveryAttempt {
  attemptedAt: string;
  recipientName: string;
  outcome: "SUCCEEDED" | "FAILED";
  providerReference: string | null;
  failureReason: string | null;
}

export interface FertiliserQuoteRequest {
  requestVersion: typeof FERTILISER_QUOTE_REQUEST_VERSION;
  requestId: string;
  createdAt: string;
  farmId: string;
  status: FertiliserQuoteRequestStatus;
  coverage: FertiliserQuoteRequestCoverage;
  /** Basket references, copied verbatim. */
  basketStatus: FarmFertiliserBasketStatus;
  basketVersion: FarmFertiliserQuoteBasket["basketVersion"];
  aggregationVersion: FarmFertiliserQuoteBasket["aggregationVersion"];
  engineVersions: string[];
  basketCreatedAt: string;
  isCompleteFarmRequirement: boolean;
  currency: "EUR";
  lines: FertiliserQuoteRequestLine[];
  unresolvedFields: FarmFertiliserQuoteBasketFieldRef[];
  unsupportedProducts: string[];
  details: FertiliserQuoteRequestDetails;
  readyAt: string | null;
  cancelledAt: string | null;
  deliveryAttempts: FertiliserQuoteDeliveryAttempt[];
}

export type FertiliserQuoteRequestIssue =
  | "EMPTY_BASKET"
  | "MISSING_PRODUCT_IDENTITY"
  | "INVALID_CANONICAL_QUANTITY"
  | "UNKNOWN_PRODUCT"
  | "INVALID_REQUESTED_QUANTITY"
  | "MISSING_DELIVERY_LOCATION"
  | "MISSING_CONTACT"
  | "INVALID_DELIVERY_WINDOW"
  | "INVALID_RECIPIENT"
  | "INVALID_STATUS_TRANSITION"
  | "UNKNOWN_RECIPIENT"
  | "MISSING_PROVIDER_REFERENCE";

export type FertiliserQuoteResult<T> = { ok: true; value: T } | { ok: false; issues: FertiliserQuoteRequestIssue[] };

function fail<T>(...issues: FertiliserQuoteRequestIssue[]): FertiliserQuoteResult<T> {
  return { ok: false, issues };
}

const TONNE_FACTOR = 10 ** TONNES_ROUNDING_DECIMALS;

function coverageFor(status: FarmFertiliserBasketStatus): FertiliserQuoteRequestCoverage {
  switch (status) {
    case "READY":
      return "WHOLE_FARM";
    case "READY_WITH_PROVISIONAL_ITEMS":
      return "WHOLE_FARM_PROVISIONAL";
    case "INCOMPLETE":
      return "PARTIAL";
  }
}

/** Exact kg for a 0.01 t quantity, without binary floating-point noise. */
function hundredthsTonnesToKg(tonnes: number): number {
  return (Math.round(tonnes * TONNE_FACTOR) * KG_PER_TONNE) / TONNE_FACTOR;
}

/**
 * A DRAFT request from the canonical basket. Each line's requested quantity
 * starts at the basket's display tonnes (already rounded UP to 0.01 t, so
 * never below the canonical requirement). An INCOMPLETE basket yields a
 * PARTIAL request that keeps the basket status and unresolved fields.
 */
export function createFertiliserQuoteRequestDraft(
  basket: FarmFertiliserQuoteBasket,
  meta: { requestId: string; createdAt: string },
): FertiliserQuoteResult<FertiliserQuoteRequest> {
  if (basket.lines.length === 0) return fail("EMPTY_BASKET");
  const issues = new Set<FertiliserQuoteRequestIssue>();
  for (const line of basket.lines) {
    if (!line.name?.trim() || !line.npkAnalysis?.trim()) issues.add("MISSING_PRODUCT_IDENTITY");
    if (!Number.isFinite(line.quantityKg) || line.quantityKg <= 0 || !Number.isFinite(line.displayTonnes) || line.displayTonnes <= 0) {
      issues.add("INVALID_CANONICAL_QUANTITY");
    }
  }
  if (issues.size > 0) return { ok: false, issues: [...issues] };

  return {
    ok: true,
    value: {
      requestVersion: FERTILISER_QUOTE_REQUEST_VERSION,
      requestId: meta.requestId,
      createdAt: meta.createdAt,
      farmId: basket.farmId,
      status: "DRAFT",
      coverage: coverageFor(basket.status),
      basketStatus: basket.status,
      basketVersion: basket.basketVersion,
      aggregationVersion: basket.aggregationVersion,
      engineVersions: [...basket.engineVersions],
      basketCreatedAt: basket.createdAt,
      isCompleteFarmRequirement: basket.isCompleteFarmRequirement,
      currency: basket.currency,
      lines: basket.lines.map((line) => {
        const requestedQuantityKg = hundredthsTonnesToKg(line.displayTonnes);
        return {
          productKey: line.productKey,
          name: line.name,
          npkAnalysis: line.npkAnalysis,
          catalogueVerified: line.catalogueVerified,
          unit: line.unit,
          canonicalQuantityKg: line.quantityKg,
          canonicalDisplayTonnes: line.displayTonnes,
          requestedTonnes: line.displayTonnes,
          requestedQuantityKg,
          requestedBelowCanonical: requestedQuantityKg < line.quantityKg,
          estimatedCostEur: line.estimatedCostEur,
          costBasis: "ESTIMATE" as const,
          provisional: line.provisional,
        };
      }),
      unresolvedFields: basket.unresolvedFields.map((f) => ({ ...f })),
      unsupportedProducts: [...basket.unsupportedProducts],
      details: { recipients: [], deliveryLocation: null, deliveryWindow: null, contact: null, farmerNote: null },
      readyAt: null,
      cancelledAt: null,
      deliveryAttempts: [],
    },
  };
}

/** Parses a farmer-typed tonnes figure: finite, positive, at most 0.01 t
 * precision (the existing purchase rounding). Zero, negative, blank and
 * malformed input are rejected — never coerced. */
export function parseRequestedTonnes(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed) && !/^\.\d{1,2}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isEditable(request: FertiliserQuoteRequest): boolean {
  return request.status === "DRAFT" || request.status === "READY_TO_SEND" || request.status === "FAILED";
}

/** Returns a new request with one line's requested quantity changed. The
 * canonical quantity is untouched. Editing a READY_TO_SEND / FAILED request
 * returns it to DRAFT so it must be reviewed again. */
export function setRequestedQuantity(request: FertiliserQuoteRequest, productKey: string, requestedTonnes: number): FertiliserQuoteResult<FertiliserQuoteRequest> {
  if (!isEditable(request)) return fail("INVALID_STATUS_TRANSITION");
  if (!request.lines.some((l) => l.productKey === productKey)) return fail("UNKNOWN_PRODUCT");
  if (typeof requestedTonnes !== "number" || !Number.isFinite(requestedTonnes) || requestedTonnes <= 0) return fail("INVALID_REQUESTED_QUANTITY");
  if (Math.abs(requestedTonnes * TONNE_FACTOR - Math.round(requestedTonnes * TONNE_FACTOR)) > 1e-6) return fail("INVALID_REQUESTED_QUANTITY");
  const tonnes = Math.round(requestedTonnes * TONNE_FACTOR) / TONNE_FACTOR;
  const requestedQuantityKg = hundredthsTonnesToKg(tonnes);
  return {
    ok: true,
    value: {
      ...request,
      status: "DRAFT",
      readyAt: null,
      lines: request.lines.map((l) =>
        l.productKey === productKey ? { ...l, requestedTonnes: tonnes, requestedQuantityKg, requestedBelowCanonical: requestedQuantityKg < l.canonicalQuantityKg } : l,
      ),
    },
  };
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export interface FertiliserQuoteRequestDetailsInput {
  recipients?: readonly { name: string; contact?: string | null }[];
  deliveryLocation?: string | null;
  deliveryWindow?: { start: string; end: string } | null;
  contact?: string | null;
  farmerNote?: string | null;
}

/** Returns a new request with the quote details replaced. Blank strings
 * become `null`; a delivery window must be two real dates, start ≤ end. */
export function setQuoteRequestDetails(request: FertiliserQuoteRequest, input: FertiliserQuoteRequestDetailsInput): FertiliserQuoteResult<FertiliserQuoteRequest> {
  if (!isEditable(request)) return fail("INVALID_STATUS_TRANSITION");
  const issues: FertiliserQuoteRequestIssue[] = [];
  let deliveryWindow: QuoteDeliveryWindow | null = null;
  if (input.deliveryWindow) {
    try {
      deliveryWindow = validateQuoteDeliveryWindow(input.deliveryWindow);
    } catch {
      issues.push("INVALID_DELIVERY_WINDOW");
    }
  }
  const recipients: FertiliserQuoteRecipient[] = [];
  const seen = new Set<string>();
  for (const r of input.recipients ?? []) {
    const name = blankToNull(r.name);
    if (!name) {
      issues.push("INVALID_RECIPIENT");
      continue;
    }
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    recipients.push({ name, contact: blankToNull(r.contact) });
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      ...request,
      status: "DRAFT",
      readyAt: null,
      details: {
        recipients,
        deliveryLocation: blankToNull(input.deliveryLocation),
        deliveryWindow,
        contact: blankToNull(input.contact),
        farmerNote: blankToNull(input.farmerNote),
      },
    },
  };
}

/** Every reason the request cannot be READY_TO_SEND yet (empty when ready). */
export function fertiliserQuoteRequestIssues(request: FertiliserQuoteRequest): FertiliserQuoteRequestIssue[] {
  const issues: FertiliserQuoteRequestIssue[] = [];
  if (request.lines.length === 0) issues.push("EMPTY_BASKET");
  if (request.lines.some((l) => !l.name.trim() || !l.npkAnalysis.trim())) issues.push("MISSING_PRODUCT_IDENTITY");
  if (request.lines.some((l) => !Number.isFinite(l.requestedQuantityKg) || l.requestedQuantityKg <= 0)) issues.push("INVALID_REQUESTED_QUANTITY");
  if (!request.details.deliveryLocation) issues.push("MISSING_DELIVERY_LOCATION");
  if (!request.details.contact) issues.push("MISSING_CONTACT");
  return issues;
}

/** DRAFT → READY_TO_SEND once complete. Idempotent for an already
 * READY_TO_SEND request (a repeated click never creates a second record). */
export function markFertiliserQuoteRequestReady(request: FertiliserQuoteRequest, readyAt: string): FertiliserQuoteResult<FertiliserQuoteRequest> {
  if (request.status === "READY_TO_SEND") return { ok: true, value: request };
  if (request.status !== "DRAFT") return fail("INVALID_STATUS_TRANSITION");
  const issues = fertiliserQuoteRequestIssues(request);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { ...request, status: "READY_TO_SEND", readyAt } };
}

/**
 * Records one real external delivery attempt (provider-neutral; no provider
 * is wired today). SENT only for a SUCCEEDED attempt with a provider
 * reference to a named recipient; a FAILED attempt leaves the request FAILED
 * and retryable. A SENT request accepts no further attempt, so one action can
 * never produce two SENT records.
 */
export function recordFertiliserQuoteDeliveryAttempt(
  request: FertiliserQuoteRequest,
  attempt: FertiliserQuoteDeliveryAttempt,
): FertiliserQuoteResult<FertiliserQuoteRequest> {
  if (request.status !== "READY_TO_SEND" && request.status !== "FAILED") return fail("INVALID_STATUS_TRANSITION");
  if (!request.details.recipients.some((r) => r.name === attempt.recipientName)) return fail("UNKNOWN_RECIPIENT");
  if (attempt.outcome === "SUCCEEDED" && !blankToNull(attempt.providerReference)) return fail("MISSING_PROVIDER_REFERENCE");
  return {
    ok: true,
    value: {
      ...request,
      status: attempt.outcome === "SUCCEEDED" ? "SENT" : "FAILED",
      deliveryAttempts: [...request.deliveryAttempts, { ...attempt }],
    },
  };
}

export function cancelFertiliserQuoteRequest(request: FertiliserQuoteRequest, cancelledAt: string): FertiliserQuoteResult<FertiliserQuoteRequest> {
  if (request.status === "SENT" || request.status === "CANCELLED") return fail("INVALID_STATUS_TRANSITION");
  return { ok: true, value: { ...request, status: "CANCELLED", cancelledAt } };
}

function formatTonnesFixed(tonnes: number): string {
  return tonnes.toFixed(TONNES_ROUNDING_DECIMALS);
}

/**
 * The deterministic, human-readable request a supplier can quote from
 * without Farm Return internals. Contains no estimated prices, field names,
 * recipient contacts or calculation versions (those stay request metadata).
 */
export function renderFertiliserQuoteRequestText(request: FertiliserQuoteRequest): string {
  const out: string[] = [request.coverage === "PARTIAL" ? "Farm Return fertiliser quote request (partial)" : "Farm Return fertiliser quote request"];
  out.push(`Reference: ${request.requestId}`);
  out.push("");
  for (const line of request.lines) {
    out.push(`Product: ${line.name} (N-P-K ${line.npkAnalysis}) — Quantity: ${formatTonnesFixed(line.requestedTonnes)} tonnes`);
  }
  out.push("");
  out.push(`Delivery: ${request.details.deliveryLocation ?? "Not specified"}`);
  if (request.details.deliveryWindow) {
    out.push(`Delivery window: ${request.details.deliveryWindow.start} to ${request.details.deliveryWindow.end}`);
  }
  out.push(`Contact: ${request.details.contact ?? "Not specified"}`);
  if (request.details.farmerNote) out.push(`Notes: ${request.details.farmerNote}`);
  const partial = request.coverage === "PARTIAL";
  const provisional = request.lines.some((l) => l.provisional);
  if (partial || provisional) out.push("");
  if (partial) out.push("This request covers only part of the farm's fertiliser requirement; further quantities may follow.");
  if (provisional) out.push("Some quantities are provisional and may change.");
  out.push("Bag quantities not specified. This is a request for a quote, not an order.");
  return out.join("\n");
}
