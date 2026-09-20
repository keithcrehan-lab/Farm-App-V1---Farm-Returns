/**
 * Economic Opportunity Engine, Phase 2 — the one trusted, service-role
 * Supabase client in this codebase. `import "server-only"` makes it a
 * build error for any client component to import this file.
 *
 * Distinct from `server.ts`'s per-request, cookie-based, anon-key client
 * (used for every farmer-facing read/write, subject to RLS): this client
 * authenticates as `service_role`, which bypasses RLS and grants
 * entirely at the Postgres role level. It exists ONLY for
 * `src/server/market/cso-fertiliser-sync.ts` writing to
 * `market_price_observations` — a global-reference table no
 * `authenticated` role has (or should have) an INSERT grant for (see
 * `supabase/migrations/20260920000000_market_price_observations.sql`).
 * Never use this client for any farmer-owned table or any code path a
 * client component can reach.
 */

import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/** `false` when `SUPABASE_SERVICE_ROLE_KEY` isn't set — the sync
 * pipeline treats this the same as a source-unavailable outage (fails
 * closed, leaves prior observations untouched) rather than throwing a
 * raw construction error. Deliberately a plain server env var, never
 * `NEXT_PUBLIC_*` — this key must never reach a browser bundle. */
export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase service-role client is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "in .env.local. Check isServiceRoleConfigured() before calling this to fail closed instead.",
    );
  }
  return createSupabaseClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
