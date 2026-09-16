import "server-only";

/**
 * Managed Quote Pilot, Checkpoint 1 — quote request persistence.
 *
 * Every write goes through the security-definer RPCs
 * (`20260911080000_quote_pilot_checkpoint1.sql`) — this module never
 * issues a raw `insert`/`update` against `quote_requests`/
 * `quote_request_revisions`/`quote_request_delivery_snapshots` (the
 * table grants are select-only; a raw write would be rejected anyway,
 * but the RPC is also where the one-transaction atomicity the
 * architecture doc requires actually lives). Reads use plain `select`,
 * scoped by RLS exactly like every other farm-data module in this app.
 */
import { createClient } from "@/lib/supabase/server";
import type { QuoteDeliveryWindow, QuoteRequestEstimateSnapshot, QuoteRequestUnit } from "@/domain/quote-request";
import { deriveQuoteRequestFarmerStatus } from "@/domain/quote-request";
import type { FarmDeliveryDetailsInput } from "./farm-delivery-details";

export interface QuoteRequestRevision {
  id: string;
  requestId: string;
  farmId: string;
  revisionNumber: number;
  product: string;
  quantity: number;
  unit: QuoteRequestUnit;
  packaging: string | null;
  quantityBasis: "estimated" | "farmer_entered";
  estimateSnapshot: QuoteRequestEstimateSnapshot | null;
  deliveryWindow: QuoteDeliveryWindow;
  createdAt: string;
  disclosureVersion: string;
  disclosureAcceptedAt: string;
}

export interface QuoteRequest {
  id: string;
  farmId: string;
  withdrawnAt: string | null;
  status: "requested" | "withdrawn";
  createdAt: string;
  currentRevision: QuoteRequestRevision;
}

interface QuoteRequestRevisionRow {
  id: string;
  request_id: string;
  farm_id: string;
  revision_number: number;
  product: string;
  quantity: number;
  unit: QuoteRequestUnit;
  packaging: string | null;
  quantity_basis: "estimated" | "farmer_entered";
  estimate_snapshot: {
    remainingRequirementKg: number;
    truncated: boolean;
    applicationsWithUnknownComposition: number;
    fieldsWithBlockedEvidence: number;
    asOf: string;
  } | null;
  delivery_window_start: string;
  delivery_window_end: string;
  created_at: string;
  disclosure_version: string;
  disclosure_accepted_at: string;
}

interface QuoteRequestRow {
  id: string;
  farm_id: string;
  withdrawn_at: string | null;
  created_at: string;
  current_revision: QuoteRequestRevisionRow | QuoteRequestRevisionRow[] | null;
}

function rowToRevision(row: QuoteRequestRevisionRow): QuoteRequestRevision {
  return {
    id: row.id,
    requestId: row.request_id,
    farmId: row.farm_id,
    revisionNumber: row.revision_number,
    product: row.product,
    quantity: row.quantity,
    unit: row.unit,
    packaging: row.packaging,
    quantityBasis: row.quantity_basis,
    estimateSnapshot: row.estimate_snapshot,
    deliveryWindow: { start: row.delivery_window_start, end: row.delivery_window_end },
    createdAt: row.created_at,
    disclosureVersion: row.disclosure_version,
    disclosureAcceptedAt: row.disclosure_accepted_at,
  };
}

function rowToRequest(row: QuoteRequestRow): QuoteRequest {
  // PostgREST returns an embedded to-one relationship as an object, but
  // some client versions/configurations return a one-element array —
  // handled explicitly rather than assumed, matching this codebase's
  // existing embedded-select callers.
  const revisionRow = Array.isArray(row.current_revision) ? row.current_revision[0] : row.current_revision;
  if (!revisionRow) {
    throw new Error(`quote-requests: request ${row.id} has no resolvable current revision — data integrity issue`);
  }
  return {
    id: row.id,
    farmId: row.farm_id,
    withdrawnAt: row.withdrawn_at,
    status: deriveQuoteRequestFarmerStatus(row.withdrawn_at),
    createdAt: row.created_at,
    currentRevision: rowToRevision(revisionRow),
  };
}

// Embeds via the composite FK `quote_requests_current_revision_same_farm`
// (`current_revision_id, farm_id` -> `quote_request_revisions (id,
// farm_id)`) added in `20260911080000_quote_pilot_checkpoint1.sql` — the
// same cross-farm-lineage constraint that makes this join structurally
// safe, not just conventionally correct.
const REQUEST_WITH_CURRENT_REVISION_SELECT = "id, farm_id, withdrawn_at, created_at, current_revision:quote_request_revisions!quote_requests_current_revision_same_farm(*)";

export async function listQuoteRequestsForFarm(farmId: string): Promise<QuoteRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_requests")
    .select(REQUEST_WITH_CURRENT_REVISION_SELECT)
    .eq("farm_id", farmId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as QuoteRequestRow[]).map(rowToRequest);
}

/** Operator demand-inbox read — every farm's requests, RLS-scoped to
 * `is_quote_operator_for_current_user()` rather than farm ownership (the
 * migration's own `quote_requests_operator_read`/
 * `quote_request_revisions_operator_read` policies). Never reads
 * `quote_request_delivery_snapshots` — Checkpoint 1's inbox needs no
 * delivery address at all (architecture doc section 5's own
 * least-privilege note). */
export async function listQuoteRequestsForOperatorInbox(): Promise<QuoteRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_requests")
    .select(REQUEST_WITH_CURRENT_REVISION_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as QuoteRequestRow[]).map(rowToRequest);
}

export interface SubmitOrReviseQuoteRequestResult {
  requestId: string;
  revisionId: string;
  revisionNumber: number;
}

interface RpcRevisionInput {
  product: string;
  quantity: number;
  unit: QuoteRequestUnit;
  packaging?: string;
  quantityBasis: "estimated" | "farmer_entered";
  estimateSnapshot?: QuoteRequestEstimateSnapshot;
  deliveryWindow: QuoteDeliveryWindow;
  delivery: FarmDeliveryDetailsInput;
  disclosureVersion: string;
  disclosureAcceptedAt: string;
}

export async function submitQuoteRequest(idempotencyKey: string, input: RpcRevisionInput): Promise<SubmitOrReviseQuoteRequestResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_quote_request", {
    p_idempotency_key: idempotencyKey,
    p_product: input.product,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_packaging: input.packaging ?? null,
    p_quantity_basis: input.quantityBasis,
    p_estimate_snapshot: input.estimateSnapshot ?? null,
    p_delivery_window_start: input.deliveryWindow.start,
    p_delivery_window_end: input.deliveryWindow.end,
    p_contact_name: input.delivery.contactName,
    p_contact_phone: input.delivery.contactPhone ?? null,
    p_contact_email: input.delivery.contactEmail ?? null,
    p_address_line1: input.delivery.addressLine1,
    p_address_line2: input.delivery.addressLine2 ?? null,
    p_town_or_city: input.delivery.townOrCity,
    p_county: input.delivery.county,
    p_eircode: input.delivery.eircode ?? null,
    p_disclosure_version: input.disclosureVersion,
    p_disclosure_accepted_at: input.disclosureAcceptedAt,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { request_id: string; revision_id: string; revision_number: number };
  return { requestId: row.request_id, revisionId: row.revision_id, revisionNumber: row.revision_number };
}

/** Thrown when the caller's `expectedRevisionNumber` no longer matches
 * the request's real current revision — a stale concurrent edit (brief
 * Q14), never silently overwritten. Mirrors `StaleJobActualRevisionError`'s
 * own established shape for this exact class of conflict. */
export class StaleQuoteRequestRevisionError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly expectedRevisionNumber: number,
  ) {
    super(`Quote request ${requestId} was edited elsewhere since revision ${expectedRevisionNumber} — reload before retrying.`);
    this.name = "StaleQuoteRequestRevisionError";
  }
}

export async function reviseQuoteRequest(
  requestId: string,
  expectedRevisionNumber: number,
  input: RpcRevisionInput,
): Promise<SubmitOrReviseQuoteRequestResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revise_quote_request", {
    p_request_id: requestId,
    p_expected_revision_number: expectedRevisionNumber,
    p_product: input.product,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_packaging: input.packaging ?? null,
    p_quantity_basis: input.quantityBasis,
    p_estimate_snapshot: input.estimateSnapshot ?? null,
    p_delivery_window_start: input.deliveryWindow.start,
    p_delivery_window_end: input.deliveryWindow.end,
    p_contact_name: input.delivery.contactName,
    p_contact_phone: input.delivery.contactPhone ?? null,
    p_contact_email: input.delivery.contactEmail ?? null,
    p_address_line1: input.delivery.addressLine1,
    p_address_line2: input.delivery.addressLine2 ?? null,
    p_town_or_city: input.delivery.townOrCity,
    p_county: input.delivery.county,
    p_eircode: input.delivery.eircode ?? null,
    p_disclosure_version: input.disclosureVersion,
    p_disclosure_accepted_at: input.disclosureAcceptedAt,
  });
  if (error) {
    if (error.message?.startsWith("STALE_REVISION")) {
      throw new StaleQuoteRequestRevisionError(requestId, expectedRevisionNumber);
    }
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { request_id: string; revision_id: string; revision_number: number };
  return { requestId: row.request_id, revisionId: row.revision_id, revisionNumber: row.revision_number };
}

export async function withdrawQuoteRequest(requestId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_quote_request", { p_request_id: requestId });
  if (error) throw error;
}
