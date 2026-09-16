"use server";

/**
 * Managed Quote Pilot, Checkpoint 1 — operator-facing actions. Every
 * action checks `isQuoteOperatorForCurrentUser()` explicitly and throws
 * if false — being signed in is not enough
 * (`managed-quotes-build-brief.md`'s "Access and integrity requirements").
 * This is defense in depth alongside the RLS policies the underlying
 * reads already carry (`quote_requests_operator_read`/
 * `quote_request_revisions_operator_read`) — never the only gate.
 */
import { isQuoteOperatorForCurrentUser } from "@/lib/farm-data/quote-operators";
import { getOperatorDemandInbox, type OperatorDemandInbox } from "@/orchestration/quotes";

async function requireQuoteOperator(): Promise<void> {
  const isOperator = await isQuoteOperatorForCurrentUser();
  if (!isOperator) {
    throw new Error("Managed quote pilot: the current session is not an authorised quote operator.");
  }
}

export async function getQuoteOperatorStatusAction(): Promise<boolean> {
  return isQuoteOperatorForCurrentUser();
}

export async function getOperatorDemandInboxAction(): Promise<OperatorDemandInbox> {
  await requireQuoteOperator();
  return getOperatorDemandInbox();
}
