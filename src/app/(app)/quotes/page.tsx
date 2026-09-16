import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listMyQuoteRequestsAction } from "@/app/actions/quote-requests";
import type { QuoteRequest } from "@/lib/farm-data/quote-requests";
import { QuotesPageClient } from "./QuotesPageClient";

/** Postgres SQLSTATE `undefined_table` — see `records/page.tsx`'s
 * identical constant/comment; the one specific, expected failure mode
 * while `20260911080000_quote_pilot_checkpoint1.sql` has not been
 * applied to whichever database this instance points at. */
const UNDEFINED_TABLE = "42P01";

function isUndefinedTableError(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === UNDEFINED_TABLE;
}

export default async function QuotesPage() {
  if (!isSupabaseConfigured()) {
    return <QuotesPageClient requests={[]} unavailable={false} />;
  }

  const farm = await getFarmForCurrentUser();
  if (!farm) {
    return <QuotesPageClient requests={[]} unavailable={false} />;
  }

  let requests: QuoteRequest[] = [];
  let unavailable = false;
  try {
    requests = await listMyQuoteRequestsAction();
  } catch (error) {
    if (isUndefinedTableError(error)) {
      unavailable = true;
    } else {
      console.error("[QuotesPage] listMyQuoteRequestsAction failed:", error);
      unavailable = true;
    }
  }

  return <QuotesPageClient requests={requests} unavailable={unavailable} />;
}
