import "server-only";

/**
 * Supplier Portal — persistence. Every read and write is a
 * security-definer RPC (`20261031150000_supplier_portal_foundations.sql`)
 * that derives the caller's supplier from `auth.uid()` — no function
 * here accepts or forwards a supplier id for a supplier-side call. RPC
 * payloads are parsed with strict schemas so a malformed response fails
 * loudly rather than rendering a half-understood record.
 */
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SUPPLIER_QUOTE_STATUSES, SUPPLIER_QUOTE_UNITS, type SupplierQuoteDraftInput } from "@/domain/supplier-quote";

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------

export type SupplierPortalErrorCode = "FORBIDDEN" | "NOT_FOUND" | "STALE" | "CONFLICT" | "INVALID" | "INCOMPLETE" | "REQUEST_REVISED" | "UNAVAILABLE";

export class SupplierPortalError extends Error {
  constructor(
    public readonly code: SupplierPortalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SupplierPortalError";
  }
}

/** Postgres SQLSTATE `undefined_table` / `undefined_function` — the
 * migration has not been applied to the connected database. */
const MISSING_SCHEMA_CODES = new Set(["42P01", "42883", "PGRST202"]);

export function toSupplierPortalError(error: { code?: string; message?: string } | null | undefined): SupplierPortalError {
  const message = error?.message ?? "Supplier portal request failed.";
  if (error?.code && MISSING_SCHEMA_CODES.has(error.code)) {
    return new SupplierPortalError("UNAVAILABLE", "The supplier portal is not set up on this database yet.");
  }
  const match = /^SUPPLIER_PORTAL_([A-Z_]+):\s*([\s\S]*)$/.exec(message);
  if (match) {
    const code = match[1] as SupplierPortalErrorCode;
    const known: SupplierPortalErrorCode[] = ["FORBIDDEN", "NOT_FOUND", "STALE", "CONFLICT", "INVALID", "INCOMPLETE", "REQUEST_REVISED"];
    if (known.includes(code)) return new SupplierPortalError(code, match[2]);
  }
  if (error?.code === "42501") return new SupplierPortalError("FORBIDDEN", "Not permitted.");
  return new SupplierPortalError("CONFLICT", message);
}

// ---------------------------------------------------------------------
// Payload schemas
// ---------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const decimalText = z.string().regex(/^\d+(\.\d+)?$/);

const contextSchema = z.object({
  supplierId: z.string().uuid(),
  displayName: z.string(),
  role: z.enum(["admin", "member"]),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  serviceCounties: z.array(z.string()),
  defaultQuoteValidityDays: z.number().int().nullable(),
  quoteTerms: z.string().nullable(),
});
export type SupplierPortalContext = z.infer<typeof contextSchema>;

const lineSchema = z.object({
  lineNumber: z.number().int(),
  product: z.string(),
  description: z.string().nullable(),
  quantity: decimalText,
  unit: z.enum(SUPPLIER_QUOTE_UNITS),
  unitPriceExVat: decimalText,
  vatRatePercent: decimalText.nullable(),
});

const quoteSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(SUPPLIER_QUOTE_STATUSES),
  version: z.number().int(),
  quotedRevisionNumber: z.number().int(),
  currency: z.literal("EUR"),
  deliveryChargeExVat: decimalText.nullable(),
  deliveryVatRatePercent: decimalText.nullable(),
  deliveryEarliest: isoDate.nullable(),
  deliveryLatest: isoDate.nullable(),
  validUntil: isoDate.nullable(),
  paymentTerms: z.string().nullable(),
  notes: z.string().nullable(),
  totalsMethod: z.string().nullable(),
  submittedAt: z.string().nullable(),
  withdrawnAt: z.string().nullable(),
  withdrawReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(lineSchema),
});
export type SupplierPortalQuote = z.infer<typeof quoteSchema>;

const eventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["rfq_routed", "rfq_viewed", "rfq_declined", "draft_created", "draft_saved", "draft_discarded", "quote_submitted", "quote_withdrawn"]),
  quoteId: z.string().uuid().nullable(),
  occurredAt: z.string(),
  actor: z.enum(["you", "team", "farm_return"]),
  detail: z.record(z.string(), z.unknown()),
});
export type SupplierPortalEvent = z.infer<typeof eventSchema>;

/** The minimised farmer request a supplier may see — no farm id, no
 * contact details, no address lines, no full Eircode. */
const requestSchema = z.object({
  requestedAt: z.string(),
  withdrawn: z.boolean(),
  revisionNumber: z.number().int(),
  revisedAt: z.string(),
  product: z.string(),
  quantity: decimalText,
  unit: z.enum(SUPPLIER_QUOTE_UNITS),
  packaging: z.string().nullable(),
  deliveryWindowStart: isoDate,
  deliveryWindowEnd: isoDate,
  townOrCity: z.string().nullable(),
  county: z.string().nullable(),
  eircodeRoutingKey: z.string().nullable(),
});
export type SupplierPortalRequest = z.infer<typeof requestSchema>;

const rfqSchema = z.object({
  routeId: z.string().uuid(),
  routedAt: z.string(),
  firstViewedAt: z.string().nullable(),
  declinedAt: z.string().nullable(),
  declineReason: z.string().nullable(),
  request: requestSchema,
  quotes: z.array(quoteSchema),
  events: z.array(eventSchema).nullable(),
});
export type SupplierPortalRfq = z.infer<typeof rfqSchema>;

function parse<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new SupplierPortalError("CONFLICT", `Supplier portal returned an unexpected ${what} shape.`);
  }
  return result.data;
}

// ---------------------------------------------------------------------
// Supplier reads
// ---------------------------------------------------------------------

/** The caller's own supplier context; null when the session is not an
 * active supplier member (or is signed out). */
export async function getMySupplierPortalContext(): Promise<SupplierPortalContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("supplier_portal_get_my_context");
  if (error) throw toSupplierPortalError(error);
  if (data === null || data === undefined) return null;
  return parse(contextSchema, data, "context");
}

export async function listMySupplierRfqs(): Promise<SupplierPortalRfq[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("supplier_portal_list_rfqs");
  if (error) throw toSupplierPortalError(error);
  return parse(z.array(rfqSchema), data, "RFQ list");
}

export async function getMySupplierRfq(routeId: string): Promise<SupplierPortalRfq> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("supplier_portal_get_rfq", { p_route_id: routeId });
  if (error) throw toSupplierPortalError(error);
  return parse(rfqSchema, data, "RFQ");
}

// ---------------------------------------------------------------------
// Supplier writes
// ---------------------------------------------------------------------

export async function markMySupplierRfqViewed(routeId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("supplier_portal_mark_rfq_viewed", { p_route_id: routeId });
  if (error) throw toSupplierPortalError(error);
}

export async function declineMySupplierRfq(routeId: string, reason: string | null): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("supplier_portal_decline_rfq", { p_route_id: routeId, p_reason: reason });
  if (error) throw toSupplierPortalError(error);
}

export interface SupplierQuoteVersionRef {
  quoteId: string;
  version: number;
}

const versionRefSchema = z.object({ quoteId: z.string().uuid(), version: z.number().int() });

/** `draft` must already be the output of `validateSupplierQuoteDraft`. */
export async function saveMySupplierQuoteDraft(
  routeId: string,
  existing: { quoteId: string; expectedVersion: number } | null,
  draft: SupplierQuoteDraftInput,
): Promise<SupplierQuoteVersionRef> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("supplier_portal_save_quote_draft", {
    p_route_id: routeId,
    p_quote_id: existing?.quoteId ?? null,
    p_expected_version: existing?.expectedVersion ?? null,
    p_header: {
      deliveryChargeExVat: draft.deliveryChargeExVat,
      deliveryVatRatePercent: draft.deliveryVatRatePercent,
      deliveryEarliest: draft.deliveryEarliest,
      deliveryLatest: draft.deliveryLatest,
      validUntil: draft.validUntil,
      paymentTerms: draft.paymentTerms,
      notes: draft.notes,
    },
    p_lines: draft.lines.map((line) => ({
      product: line.product,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceExVat: line.unitPriceExVat,
      vatRatePercent: line.vatRatePercent,
    })),
  });
  if (error) throw toSupplierPortalError(error);
  return parse(versionRefSchema, data, "save result");
}

export async function submitMySupplierQuote(quoteId: string, expectedVersion: number): Promise<SupplierQuoteVersionRef> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("supplier_portal_submit_quote", { p_quote_id: quoteId, p_expected_version: expectedVersion });
  if (error) throw toSupplierPortalError(error);
  return parse(versionRefSchema, data, "submit result");
}

export async function withdrawMySupplierQuote(quoteId: string, expectedVersion: number, reason: string | null): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("supplier_portal_withdraw_quote", { p_quote_id: quoteId, p_expected_version: expectedVersion, p_reason: reason });
  if (error) throw toSupplierPortalError(error);
}

export async function discardMySupplierQuoteDraft(quoteId: string, expectedVersion: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("supplier_portal_discard_draft", { p_quote_id: quoteId, p_expected_version: expectedVersion });
  if (error) throw toSupplierPortalError(error);
}

export interface SupplierPortalSettingsInput {
  contactEmail: string | null;
  contactPhone: string | null;
  serviceCounties: string[];
  defaultQuoteValidityDays: number | null;
  quoteTerms: string | null;
}

export async function updateMySupplierPortalSettings(input: SupplierPortalSettingsInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("supplier_portal_update_my_settings", {
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone,
    p_service_counties: input.serviceCounties,
    p_default_quote_validity_days: input.defaultQuoteValidityDays,
    p_quote_terms: input.quoteTerms,
  });
  if (error) throw toSupplierPortalError(error);
}

// ---------------------------------------------------------------------
// Operator (quote_operators allow-list; the RPCs re-check it)
// ---------------------------------------------------------------------

const operatorOverviewSchema = z.object({
  suppliers: z.array(
    z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      contactEmail: z.string().nullable(),
      active: z.boolean(),
      members: z.array(z.object({ userId: z.string().uuid(), email: z.string().nullable(), role: z.enum(["admin", "member"]), active: z.boolean() })),
    }),
  ),
  routes: z.array(
    z.object({
      routeId: z.string().uuid(),
      requestId: z.string().uuid(),
      supplierId: z.string().uuid(),
      routedAt: z.string(),
      firstViewedAt: z.string().nullable(),
      declinedAt: z.string().nullable(),
      liveQuoteStatus: z.enum(["draft", "submitted"]).nullable(),
    }),
  ),
});
export type SupplierPortalOperatorOverview = z.infer<typeof operatorOverviewSchema>;

export async function getSupplierPortalOperatorOverview(): Promise<SupplierPortalOperatorOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("supplier_portal_operator_overview");
  if (error) throw toSupplierPortalError(error);
  return parse(operatorOverviewSchema, data, "operator overview");
}

export async function operatorCreateSupplier(displayName: string, contactEmail: string | null): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("supplier_portal_operator_create_supplier", { p_display_name: displayName, p_contact_email: contactEmail });
  if (error) throw toSupplierPortalError(error);
  return parse(z.string().uuid(), data, "supplier id");
}

export async function operatorGrantSupplierMember(supplierId: string, userEmail: string, role: "admin" | "member"): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("supplier_portal_operator_grant_member", { p_supplier_id: supplierId, p_user_email: userEmail, p_role: role });
  if (error) throw toSupplierPortalError(error);
}

export async function operatorRevokeSupplierMember(supplierId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("supplier_portal_operator_revoke_member", { p_supplier_id: supplierId, p_user_id: userId });
  if (error) throw toSupplierPortalError(error);
}

export async function operatorRouteRequestToSupplier(requestId: string, supplierId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("supplier_portal_operator_route_request", { p_request_id: requestId, p_supplier_id: supplierId });
  if (error) throw toSupplierPortalError(error);
  return parse(z.string().uuid(), data, "route id");
}
