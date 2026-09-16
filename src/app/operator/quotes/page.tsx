/**
 * Grassland Fertiliser Pilot Completion, Checkpoint C (audit F3/F12) —
 * the admin/operator retrieval screen: "Admin must retrieve exact
 * submitted demand via authorised workflow." Deliberately minimal,
 * scoped to Checkpoint 1's own real inbox shape (`getOperatorDemandInboxAction`,
 * ported from the managed-quote-pilot worktree — see DOMAIN_CONTRACTS.md
 * for the full port account) — no supplier-enquiry/offer/allocation UI,
 * which the campaign brief explicitly does not require ("Supplier email
 * automation/tendering NOT acceptance requirements"). Access is gated
 * entirely by `src/app/operator/layout.tsx` (real `is_quote_operator_for_current_user`
 * allow-list check, redirects to `/today` otherwise) — this page
 * assumes it is only ever reached by an authorised operator.
 */
import type { OperatorDemandInbox } from "@/orchestration/quotes";
import { getOperatorDemandInboxAction } from "@/app/actions/quote-operator";
import { OperatorQuotesClient } from "./OperatorQuotesClient";

/** Postgres SQLSTATE `undefined_table` — same real, expected failure
 * mode `(app)/quotes/page.tsx`'s identical constant/comment already
 * documents, while `20260911080000_quote_pilot_checkpoint1.sql` has not
 * been applied to whichever database this instance points at. */
const UNDEFINED_TABLE = "42P01";

function isUndefinedTableError(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === UNDEFINED_TABLE;
}

export default async function OperatorQuotesPage() {
  let inbox: OperatorDemandInbox = { requests: [], groups: [] };
  let unavailable = false;
  try {
    inbox = await getOperatorDemandInboxAction();
  } catch (error) {
    if (isUndefinedTableError(error)) {
      unavailable = true;
    } else {
      console.error("[OperatorQuotesPage] getOperatorDemandInboxAction failed:", error);
      unavailable = true;
    }
  }

  return <OperatorQuotesClient inbox={inbox} unavailable={unavailable} />;
}
