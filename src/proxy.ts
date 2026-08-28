import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Real Farm V1 Phase 2 — route protection entry point.
 *
 * Named `proxy` (not `middleware`) per this Next.js version's renamed file
 * convention — see `src/lib/supabase/proxy.ts`'s header comment.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every route except static assets and image optimisation —
     * API routes are intentionally included (the same "verify auth
     * everywhere, not just in proxy" principle applies in reverse: a
     * route handler can still opt into its own check, but nothing should
     * silently bypass session refresh either).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
