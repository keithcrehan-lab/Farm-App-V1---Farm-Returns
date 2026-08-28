-- Real Mode Completion Phase 1 — RLS security hardening.
--
-- Reconciles the repository's migration history with the live
-- `Farm Return V1 Dev` Supabase project, which already received this
-- hardening pass directly (Supabase Security Advisor findings on the
-- schema `20260828000000_init_farm_schema.sql` created) before this
-- file existed in the repo. This is written FORWARD from that migration's
-- original policies/function — applying it to a fresh database reaches
-- the same end state the live project is already in; it is NOT re-run
-- against the live project (which already has it), only checked into
-- history so a fresh environment (or a future reviewer) can reach the
-- same, already-hardened state from a clean `supabase db push`.
--
-- Three findings addressed, matching Supabase's standard Security
-- Advisor categories for this schema shape:
--
-- 1. "Function Search Path Mutable" — `set_updated_at()` had no fixed
--    `search_path`, letting a caller with schema-creation rights shadow
--    `pg_catalog` objects the trigger implicitly resolves. Fixed with an
--    explicit `set search_path = pg_catalog`.
-- 2. "Auth RLS Initplan" — every policy's `auth.uid()` call was
--    re-evaluated per row; wrapping it as `(select auth.uid())` lets
--    Postgres evaluate it once per statement (an optimisation, not a
--    behaviour change — same predicate, same access decision).
-- 3. Policies had no explicit `to authenticated` role target and table
--    grants were never explicitly scoped, so `anon`'s standard Supabase
--    default-privilege grant on `public` schema objects was still in
--    effect (RLS `using`/`with check` would still have blocked reads/
--    writes for an actually-unauthenticated request, since `auth.uid()`
--    is null for `anon` — but relying on that alone is a defence-in-depth
--    gap Advisor flags: an anonymous key should have no table-level
--    privilege on these tables at all, not just an RLS predicate that
--    happens to always evaluate false for it). Explicit `to authenticated`
--    on every policy plus an explicit, minimal grant set closes this.
--
-- Ownership predicates (farm/user-scoped) are unchanged in substance —
-- only how they're evaluated and which role they apply to changed.

-- ---------------------------------------------------------------------------
-- 1. Fixed search_path on the trigger function
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Explicit grants — anon gets nothing on these tables; authenticated
--    gets exactly the CRUD verbs the app uses (no TRUNCATE/REFERENCES/
--    TRIGGER), RLS still governs which *rows* within that.
-- ---------------------------------------------------------------------------

revoke all on public.farms, public.fields, public.housing,
  public.livestock_groups, public.slurry_allocations, public.financial_assumptions
  from anon;

grant select, insert, update, delete on
  public.farms, public.fields, public.housing,
  public.livestock_groups, public.slurry_allocations, public.financial_assumptions
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Policies — drop and recreate with `to authenticated` and the
--    initplan-optimised `(select auth.uid())` form. Same ownership
--    predicates as the original migration, not weakened or widened.
-- ---------------------------------------------------------------------------

drop policy if exists "farms_owner_all" on public.farms;
create policy "farms_owner_all" on public.farms
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "fields_owner_all" on public.fields;
create policy "fields_owner_all" on public.fields
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

drop policy if exists "housing_owner_all" on public.housing;
create policy "housing_owner_all" on public.housing
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

drop policy if exists "livestock_groups_owner_all" on public.livestock_groups;
create policy "livestock_groups_owner_all" on public.livestock_groups
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

drop policy if exists "slurry_allocations_owner_all" on public.slurry_allocations;
create policy "slurry_allocations_owner_all" on public.slurry_allocations
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

drop policy if exists "financial_assumptions_owner_all" on public.financial_assumptions;
create policy "financial_assumptions_owner_all" on public.financial_assumptions
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
