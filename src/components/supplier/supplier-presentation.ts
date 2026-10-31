/**
 * Supplier Portal — display-only helpers (labels, tones, formatting).
 * No calculation: amounts arrive as exact integer cents from
 * `src/domain/supplier-quote.ts`.
 */
import type { SupplierQuoteStatus, SupplierRfqStatus } from "@/domain/supplier-quote";
import type { SupplierPortalEvent } from "@/lib/farm-data/supplier-portal";
import type { StatusTone } from "@/lib/status";
import { formatEur } from "@/lib/format";

export const RFQ_STATUS_LABEL: Record<SupplierRfqStatus, string> = {
  NEW: "New",
  OPEN: "Awaiting quote",
  DRAFT: "Draft in progress",
  QUOTE_SUBMITTED: "Quote submitted",
  QUOTE_NEEDS_REVIEW: "Farmer changed request",
  QUOTE_EXPIRED: "Quote expired",
  DECLINED: "Declined",
  FARMER_WITHDRAWN: "Withdrawn by farmer",
};

export const RFQ_STATUS_TONE: Record<SupplierRfqStatus, StatusTone> = {
  NEW: "info",
  OPEN: "info",
  DRAFT: "attention",
  QUOTE_SUBMITTED: "good",
  QUOTE_NEEDS_REVIEW: "risk",
  QUOTE_EXPIRED: "attention",
  DECLINED: "neutral",
  FARMER_WITHDRAWN: "neutral",
};

export const QUOTE_STATUS_LABEL: Record<SupplierQuoteStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  withdrawn: "Withdrawn",
  discarded: "Discarded",
};

export const QUOTE_STATUS_TONE: Record<SupplierQuoteStatus, StatusTone> = {
  draft: "attention",
  submitted: "good",
  withdrawn: "neutral",
  discarded: "neutral",
};

const EVENT_LABEL: Record<SupplierPortalEvent["type"], string> = {
  rfq_routed: "RFQ sent to your supplier account",
  rfq_viewed: "RFQ first opened",
  rfq_declined: "RFQ declined",
  draft_created: "Draft quote started",
  draft_saved: "Draft saved",
  draft_discarded: "Draft discarded",
  quote_submitted: "Quote submitted",
  quote_withdrawn: "Quote withdrawn",
};

const ACTOR_LABEL: Record<SupplierPortalEvent["actor"], string> = {
  you: "you",
  team: "a colleague",
  farm_return: "Farm Return",
};

export function describeSupplierEvent(event: SupplierPortalEvent): string {
  const reason = typeof event.detail.reason === "string" ? ` — “${event.detail.reason}”` : "";
  return `${EVENT_LABEL[event.type]} by ${ACTOR_LABEL[event.actor]}${reason}`;
}

/** Exact cents → "€1,234.56"; null (UNKNOWN) → "—". */
export function formatCents(cents: number | null): string {
  return cents === null ? "—" : formatEur(cents / 100, true);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Dublin" });
}

export function formatIsoDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  return new Date(`${isoDate}T12:00:00.000Z`).toLocaleDateString("en-IE", { dateStyle: "medium", timeZone: "UTC" });
}

export function formatDeliveryArea(request: { townOrCity: string | null; county: string | null; eircodeRoutingKey: string | null }): string {
  const parts = [request.townOrCity, request.county ? `Co. ${request.county}` : null, request.eircodeRoutingKey ? `Eircode area ${request.eircodeRoutingKey}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Delivery area not provided";
}
