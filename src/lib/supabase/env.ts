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
