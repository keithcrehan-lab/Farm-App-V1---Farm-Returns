"use server";

/**
 * Managed Quote Pilot, Checkpoint 1 — farmer-facing quote request
 * actions. Every action resolves the caller's own farm via
 * `getFarmForCurrentUser()` first, the same discipline every other
 * action in this app uses — nothing here trusts a caller-supplied farm
 * id. Submit/revise/withdraw all delegate to the security-definer RPCs
 * (`src/lib/farm-data/quote-requests.ts`), which derive the farm from
 * `auth.uid()` server-side regardless of anything this layer passes —
 * defense in depth, not the only gate.
 */
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import {
  getQuoteRequestPrefillContext,
  listMyQuoteRequests,
  reviseQuoteRequestOrchestrated,
  submitQuoteRequestOrchestrated,
  withdrawQuoteRequestOrchestrated,
  type QuoteRequestFormInput,
  type QuoteRequestPrefillContext,
} from "@/orchestration/quotes";
import { getFarmDeliveryDetails, upsertFarmDeliveryDetails, type FarmDeliveryDetails, type FarmDeliveryDetailsInput } from "@/lib/farm-data/farm-delivery-details";
import type { QuoteRequest } from "@/lib/farm-data/quote-requests";
import { StaleQuoteRequestRevisionError, type SubmitOrReviseQuoteRequestResult } from "@/lib/farm-data/quote-requests";

async function requireFarmId(): Promise<string> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("Managed quote pilot: no real farm for the current session");
  }
  return farm.id;
}

export async function getQuoteRequestPrefillContextAction(): Promise<QuoteRequestPrefillContext> {
  await requireFarmId();
  return getQuoteRequestPrefillContext();
}

export async function getFarmDeliveryDetailsAction(): Promise<FarmDeliveryDetails | null> {
  const farmId = await requireFarmId();
  return getFarmDeliveryDetails(farmId);
}

export async function saveFarmDeliveryDetailsAction(input: FarmDeliveryDetailsInput): Promise<FarmDeliveryDetails> {
  const farmId = await requireFarmId();
  return upsertFarmDeliveryDetails(farmId, input);
}

export async function listMyQuoteRequestsAction(): Promise<QuoteRequest[]> {
  const farmId = await requireFarmId();
  return listMyQuoteRequests(farmId);
}

export interface SubmitQuoteRequestActionResult {
  ok: true;
  result: SubmitOrReviseQuoteRequestResult;
}

export interface SubmitQuoteRequestActionError {
  ok: false;
  error: string;
}

export async function submitQuoteRequestAction(
  idempotencyKey: string,
  input: QuoteRequestFormInput,
): Promise<SubmitQuoteRequestActionResult | SubmitQuoteRequestActionError> {
  await requireFarmId();
  try {
    const result = await submitQuoteRequestOrchestrated(idempotencyKey, input);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not submit the quote request." };
  }
}

export async function reviseQuoteRequestAction(
  requestId: string,
  expectedRevisionNumber: number,
  input: QuoteRequestFormInput,
): Promise<SubmitQuoteRequestActionResult | SubmitQuoteRequestActionError> {
  await requireFarmId();
  try {
    const result = await reviseQuoteRequestOrchestrated(requestId, expectedRevisionNumber, input);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof StaleQuoteRequestRevisionError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the change." };
  }
}

export async function withdrawQuoteRequestAction(requestId: string): Promise<{ ok: true } | SubmitQuoteRequestActionError> {
  await requireFarmId();
  try {
    await withdrawQuoteRequestOrchestrated(requestId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not withdraw the request." };
  }
}
