-- Farm Return Next — Supports Intelligence + Farm Strategy phase.
-- `support_profile_facts` — the small, genuinely-new set of farmer-
-- answered facts `src/domain/support-profile.ts`'s own registered
-- `SupportProfileFactKey` union needs and cannot derive from any
-- existing farm-model table (date of birth, date became head of
-- holding, agricultural qualification level, 2026 BISS participation).
-- Key/value rather than one column per fact — the same rationale
-- `financial_assumptions` (20260828000000_init_farm_schema.sql) already
-- established: a new `SupportProfileFactKey` doesn't need a migration,
-- `support-profile.ts`'s own registered key union is what defines the
-- valid set.
--
-- Deliberately NOT a generic/open key: `key` has a CHECK constraint
-- against the exact four keys `support-profile.ts` currently registers,
-- so a typo or an unregistered key is rejected by the database itself,
-- not just by application-layer discipline — the same "loud failure over
-- silent scope creep" instinct `20260902080000_revoke_default_privileges_
-- public_schema.sql`'s own header comment already applies to grants.
--
-- Follows `financial_assumptions`'s exact RLS/grant shape
-- (owner-scoped via a `farms` subquery, `to authenticated` only,
-- `updated_at` trigger, unique per farm+key for upsert semantics) and
-- `20260902080000`'s now-standing default-privilege revocation for the
-- `public` schema — explicit `authenticated`-only grants are required
-- here, or this table would start with none at all.
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` (never
-- production) and live-verified for real (schema/RLS-enabled, exact
-- authenticated/anon grants, the key CHECK constraint, upsert/unique
-- semantics, and a real two-tenant cross-farm isolation test against
-- this project's own two real farms), 11/11 PASS. See
-- `docs/validation/support-profile-facts-dev-validation.md`.

create table public.support_profile_facts (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  key text not null check (key in ('date_of_birth', 'head_of_holding_since', 'agricultural_qualification_level', 'biss_participant_2026')),
  value jsonb not null,
  status text not null default 'farmer_confirmed' check (status in ('farmer_confirmed', 'self_declared')),
  source text not null default 'farmer_entered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, key)
);

create trigger support_profile_facts_set_updated_at
  before update on public.support_profile_facts
  for each row execute function public.set_updated_at();

create index support_profile_facts_farm_id_idx on public.support_profile_facts (farm_id);

alter table public.support_profile_facts enable row level security;

create policy "support_profile_facts_owner_all" on public.support_profile_facts
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.support_profile_facts from anon;
grant select, insert, update, delete on public.support_profile_facts to authenticated;
