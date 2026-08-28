# Supabase — Real Farm V1 persistence

**Live project**: `Farm Return V1 Dev` (`https://whevugeisqlpfnrugfsd.supabase.co`) —
configured in this developer's `.env.local` (git-ignored, never committed).
Migrations 1–2 were applied via the CLI/SQL editor when the project was
created; migration 3 (`20260828020000_rls_security_hardening.sql`) was
applied directly to the live project — Supabase Security Advisor returned
zero findings afterward — and only checked into this repo afterward for
history/reconciliation (`docs/real-mode-completion/BUILD_LOG.md`, Phase 1).
Do not re-run it against that project; it's idempotent (`drop policy if
exists` / `create or replace function`) but already applied. Apply the
full sequence to any *other* environment (a second dev project, CI, etc.)
the normal way below.

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

Three migrations, applied in order:

1. `migrations/20260828000000_init_farm_schema.sql` — see its own header
   comment for the design rationale (every `TrackedValue<T>`
   provenance-wrapped field is stored as `jsonb` in the exact shape
   `src/domain/types.ts` already uses, so persistence adapters are a
   near-direct passthrough rather than a second data model to keep in
   sync).
2. `migrations/20260828010000_field_archive_and_edit.sql` — adds
   `fields.archived_at` (soft delete).
3. `migrations/20260828020000_rls_security_hardening.sql` — fixes the
   trigger function's mutable search_path, scopes every policy to
   `to authenticated` with the initplan-optimised `(select auth.uid())`
   form, and explicitly revokes `anon`/scopes `authenticated` grants to
   exactly SELECT/INSERT/UPDATE/DELETE. Ownership predicates unchanged in
   substance.

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
