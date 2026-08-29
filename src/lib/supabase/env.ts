/**
 * Real Farm V1 Phase 2 — Supabase configuration presence check.
 *
 * `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set in
 * this repository's `.env.local` — creating a real Supabase project and
 * populating them is a genuine external-credential blocker documented in
 * `docs/real-farm-v1/BUILD_LOG.md` (Phase 2), not something this build can
 * fabricate. Every Supabase entry point checks this first and fails with a
 * clear, actionable error rather than a cryptic client-construction crash,
 * and route protection (`src/proxy.ts`) treats "not configured" as "auth
 * unavailable" rather than silently letting every request through.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "in .env.local (see docs/real-farm-v1/BUILD_LOG.md Phase 2 for setup steps). " +
        "Real Farm V1's account/persistence features cannot run without a real Supabase project.",
    );
  }
  return { url, anonKey };
}

/**
 * Farm Return Next Checkpoint 2, Vertical D — the first credential in
 * this codebase that isn't the anon/authenticated key. Deliberately NOT
 * `NEXT_PUBLIC_`-prefixed (unlike every other var here) — Next.js inlines
 * any `NEXT_PUBLIC_*` var into the client bundle at build time, and this
 * key must never reach a browser under any circumstance (it bypasses RLS
 * entirely — `src/lib/supabase/service-role.ts`'s own header comment has
 * the full reasoning for why this exists: Codex audit CRITICAL,
 * `docs/farm-return-next/audit-logs/20260829T194336Z.md`, round 4 on the
 * question of whether `decisions`/`jobs`' write path can be reached by
 * any authenticated client directly). Same "genuine external-credential
 * blocker, not something this build can fabricate" posture as
 * `requireSupabaseEnv` above — this environment has no real Supabase
 * project to pull it from either.
 */
export function requireSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Supabase service-role key is not configured: set SUPABASE_SERVICE_ROLE_KEY in .env.local " +
        "(Project Settings -> API -> service_role secret -- never the anon key, and never " +
        "NEXT_PUBLIC_-prefixed). Required for insertDecision/insertJob's privileged write path " +
        "(src/lib/supabase/service-role.ts); every other Supabase feature in this app works " +
        "without it.",
    );
  }
  return key;
}
