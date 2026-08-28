# Supabase — Real Farm V1 persistence

No live Supabase project exists in the environment this was built in — see
`docs/real-farm-v1/BUILD_LOG.md` (Phase 2/3) for the documented credential
blocker. This directory holds everything needed to stand one up.

## Setup

1. Create a project at <https://supabase.com/dashboard>.
2. Project Settings → API → copy the Project URL and `anon` `public` key
   into `.env.local` (see `.env.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
3. Apply the schema — either:
   - **Supabase CLI**: `supabase link --project-ref <ref>` then
     `supabase db push` (applies every file in `migrations/` in order), or
   - **SQL editor**: paste `migrations/20260828000000_init_farm_schema.sql`
     into <https://supabase.com/dashboard/project/_/sql/new> and run it.
4. In Authentication → Providers, confirm Email is enabled. Authentication
   → URL Configuration → add your dev/prod origin(s) to "Redirect URLs" so
   `/auth/callback` (email confirmation + password reset links) resolves —
   see `src/app/actions/auth.ts` and `src/app/auth/callback/route.ts`.
5. Restart the dev server so the new env vars are picked up.

Once those env vars are set, `isSupabaseConfigured()`
(`src/lib/supabase/env.ts`) flips true and the app's auth gate
(`src/proxy.ts`) and persistence adapters become live — no code changes.

## Schema

One migration, `migrations/20260828000000_init_farm_schema.sql` — see its
own header comment for the design rationale (every `TrackedValue<T>`
provenance-wrapped field is stored as `jsonb` in the exact shape
`src/domain/types.ts` already uses, so persistence adapters are a
near-direct passthrough rather than a second data model to keep in sync).

Tables: `farms`, `fields`, `housing`, `livestock_groups`,
`slurry_allocations`, `financial_assumptions` — all scoped to
`auth.users` via Row Level Security (a farm's rows are only visible to its
owning user; child tables check ownership through `farm_id`). See
`docs/data-model.md` for the conceptual entity definitions this schema
implements.

**Not yet migrated**: the two remaining `localStorage` silos audited in
`docs/real-farm-v1/IMPLEMENTATION_AUDIT.md` (`farm-return:audit-trace:v1`,
`farm-return:peer-review:v1` — Scientific Engine v3's recommendation audit
trace and peer-review records). Out of scope for Phase 3's farm-model
tables; a follow-up migration should add these once the Phase 16
reports/auditability work revisits them, so a farmer's audit trail
survives the same way their farm data now does.
