import "server-only";

/**
 * Farm Return Next Checkpoint 2, Vertical D — the first service-role
 * Supabase client in this codebase. Every other `src/lib/farm-data/*.ts`
 * mutation in this app goes through `./server.ts`'s session-scoped
 * client (the anon/authenticated key, RLS-enforced) — this is
 * deliberately different, and deliberately not a pattern to reach for by
 * default; see `insertDecision`/`insertJob`'s own header comments for why
 * these two specific writes need it.
 *
 * Four real, independent Codex audit rounds
 * (`docs/farm-return-next/audit-logs/20260829T192805Z.md`,
 * `20260829T193529Z.md`, `20260829T194336Z.md` — the fourth restating the
 * same concern a third time, explicitly rejecting this checkpoint's
 * earlier "every sibling table has the identical exposure" deferral as
 * insufficient for a table whose entire purpose is to be a trustworthy
 * audit trail) converged on the same point: any authenticated client
 * holding a valid session JWT can call a `security definer` RPC granted
 * `execute` to `authenticated` directly, bypassing `decideAsFarmer`/
 * `actRecordWeightObservation` entirely, with a shape-valid but
 * fabricated payload — `"server-only"` prevents this module from being
 * bundled into client code, but does nothing to stop a hand-crafted REST
 * call using a real user's own token. The only way to make a write path
 * genuinely unreachable by any client-held credential is to require a
 * credential no client ever holds — this module's service-role key,
 * which Next.js never inlines into a browser bundle (deliberately not
 * `NEXT_PUBLIC_`-prefixed, `env.ts`'s own comment) and which this app has
 * never needed until this specific case.
 *
 * `authenticated` is granted `select` only on `decisions`/`jobs`
 * (`20260829010000_decisions_jobs_client_access.sql`) — no `insert` at
 * all, via RPC or otherwise. `insertDecision`/`insertJob` first verify
 * farm ownership using the *regular*, RLS-respecting, session-scoped
 * client (so a caller can never write to a farm the signed-in user
 * doesn't actually own, even though the eventual insert itself runs
 * privileged), then perform the actual insert through this service-role
 * client. This client bypasses RLS by design (Supabase's `service_role`
 * database role is RLS-exempt) — every `decisions`/`jobs` CHECK
 * constraint and cross-farm trigger still applies regardless of which
 * role performs the insert (triggers/constraints are role-independent),
 * so `decisions_estimate_snapshot_ok_shape`/`decisions_check_field_same_farm`/
 * `jobs_check_same_farm`/`jobs_decision_id_unique` all still enforce
 * exactly as documented.
 *
 * Not yet validated against a real Supabase project (no credentials
 * available in the environment that authored this) — same disclosed
 * limitation as every other real-mode feature in this branch. Whoever
 * applies `20260829010000_decisions_jobs_client_access.sql` to
 * `Farm Return V1 Dev` should also set `SUPABASE_SERVICE_ROLE_KEY` in
 * `.env.local` and confirm Supabase's own default project setup already
 * grants `service_role` full privileges on `public.decisions`/
 * `public.jobs` (Supabase's platform-level default for every table in the
 * `public` schema, not something this migration grants explicitly — no
 * migration in this branch has ever needed to, since this is the first
 * privileged write path this app has built).
 */
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { requireSupabaseEnv, requireSupabaseServiceRoleKey } from "./env";

export function createServiceRoleClient() {
  const { url } = requireSupabaseEnv();
  const serviceRoleKey = requireSupabaseServiceRoleKey();

  // No cookie/session wiring (unlike ./server.ts) -- this client is
  // stateless and never represents a signed-in browser session; it
  // authenticates as the `service_role` database role via the key alone.
  return createSupabaseJsClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
