import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getQuoteOperatorStatusAction } from "@/app/actions/quote-operator";

/**
 * Managed Quote Pilot — the operator-only `/operator/...` segment.
 * Deliberately no farmer chrome at all
 * (`MANAGED_QUOTE_PILOT_ARCHITECTURE.md` section 7's own wireframe note:
 * "gated by `getQuoteOperatorForCurrentUser()`, no farmer chrome") — this
 * is a separate, minimal shell, not `AppShell` with an operator flag
 * bolted on. A real path segment, not a `(operator)` route group — the
 * farmer-facing `/quotes` (Checkpoint 1) already occupies that path, so
 * an operator-only route group resolving to the same `/quotes` URL would
 * collide with it (a real build error this session hit and fixed).
 *
 * Mock mode (no Supabase configured) has no real `quote_operators` table
 * to check membership against — rather than fabricate a mock-mode
 * operator experience nobody asked for, this segment is simply
 * unreachable in mock mode, the same as it would be for a genuinely
 * unauthorised farmer.
 */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    redirect("/today");
  }
  const isOperator = await getQuoteOperatorStatusAction();
  if (!isOperator) {
    redirect("/today");
  }
  return <div className="min-h-dvh bg-fr-bg">{children}</div>;
}
