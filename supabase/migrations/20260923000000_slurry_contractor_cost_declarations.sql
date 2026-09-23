-- Farmer-Entered Contractor Rate campaign
-- (docs/farm-return-next/IMPLEMENTATION_LOG.md's own dated entry for this
-- campaign has the full account; `src/domain/slurry-realisation-cost.ts`'s
-- own header has the full data-model/audit rationale for why this
-- replaced the earlier automatic SLURRY_REALISATION_COST_IE_V1 benchmark.)
--
-- `slurry_contractor_cost_declarations` — the one persisted, farm-level
-- farmer declaration of their own real slurry-spreading contractor rate
-- (EUR/ha). Insert/select only, exactly the same discipline
-- `fertiliser_stock_records`/`slurry_composition_records` already
-- established: a farmer correcting the rate is a NEW row, never an edit
-- of an old one (CLAUDE.md "provenance is permanent"). The current/
-- effective rate is derived on read (latest row for the farm), never
-- stored redundantly. `declared_at` is the row's own `created_at` —
-- server-generated, never a client-supplied timestamp, so it cannot be
-- forged by a direct Server Action call (Codex audit HIGH, fixed by this
-- migration: the earlier design reused the client-suppliable
-- `evaluatedAt` as the declaration's own provenance timestamp).
create table public.slurry_contractor_cost_declarations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  rate_per_ha numeric not null check (rate_per_ha > 0),
  currency text not null check (currency = 'EUR'),
  declared_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index slurry_contractor_cost_declarations_farm_id_idx on public.slurry_contractor_cost_declarations (farm_id, created_at desc);

alter table public.slurry_contractor_cost_declarations enable row level security;

create policy "slurry_contractor_cost_declarations_owner_read" on public.slurry_contractor_cost_declarations
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "slurry_contractor_cost_declarations_owner_insert" on public.slurry_contractor_cost_declarations
  for insert
  to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

-- No update/delete policy at all -- see this file's own header comment.
revoke all on public.slurry_contractor_cost_declarations from anon;
grant select, insert on public.slurry_contractor_cost_declarations to authenticated;
