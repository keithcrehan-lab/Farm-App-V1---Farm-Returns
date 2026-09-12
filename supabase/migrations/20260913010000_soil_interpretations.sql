-- Fertiliser Vertical V1 — Checkpoint 2, Laboratory Evidence.
-- See docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md
-- for the frozen object model this migration implements the next link
-- of: LabResult -> SoilInterpretation.
--
-- Insert-only, versioned: a `soil_interpretations` row is a permanent
-- record of "this real methodology version, applied to this real
-- LabResult, on this date, produced these outputs" — never updated in
-- place. A future methodology-version bump inserts a NEW row rather
-- than rewriting history, so a historical interpretation stays exactly
-- reproducible even after the current classification logic changes
-- (campaign "Historical interpretations must remain reproducible").
-- `src/lib/farm-data/soil-interpretations.ts`'s own reader always takes
-- the most recent row (`order by calculated_at desc limit 1`) as "the
-- current interpretation" for a LabResult — no separate "is current"
-- flag needed for a table this schema expects to stay small (at most a
-- handful of rows per LabResult, one per real methodology change).
--
-- Deliberately does NOT re-derive `src/domain/nutrients.ts`'s own P/K
-- Index classification in SQL — `p_index_status`/`p_index_value`/
-- `k_index_value` below are the real, already-computed output of
-- `src/domain/soil-interpretation.ts`'s `interpretLabResult` (itself a
-- thin, reused call into `pIndexFromMgL`/`kIndexFromMgL`), persisted
-- here as a plain result, not recomputed or re-validated by this
-- migration's own constraints beyond basic shape.
--
-- Status: NOT YET APPLIED to `Farm Return V1 Dev` -- same disclosed gap
-- as every other migration in this checkpoint.

create table public.soil_interpretations (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  lab_result_id uuid not null references public.lab_results (id) on delete cascade,
  field_id uuid not null references public.fields (id),
  methodology_version text not null,
  -- The real EngineOutcome.status this interpretation's own P Index
  -- classification produced -- `pIndexFromMgL` only ever returns "OK"
  -- or "AMBIGUOUS" today (src/domain/nutrients.ts's own comment), but
  -- this column stays a plain text field rather than a narrow CHECK
  -- enum, the same "CHECK stops at structural shape" precedent
  -- `decisions_estimate_snapshot_ok_shape`'s own comment already
  -- established, so a future genuinely-blocked case is never rejected
  -- by this migration's own over-narrow assumption.
  p_index_status text not null,
  p_index_value smallint not null check (p_index_value between 1 and 4),
  p_index_conservative_treatment boolean not null default false,
  k_index_value smallint not null check (k_index_value between 1 and 4),
  ph double precision not null check (ph > 0 and ph < 14),
  lime_requirement_t_ha double precision null check (lime_requirement_t_ha is null or lime_requirement_t_ha >= 0),
  crop_group text not null check (crop_group in ('grassland', 'other_crop')),
  soil_material text not null check (soil_material in ('mineral', 'peat')),
  calculated_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.soil_interpretations is
  'Fertiliser Vertical V1 Checkpoint 2 -- one row per real interpretation run of a LabResult. Immutable, append-only, versioned: a methodology change inserts a new row, never rewrites an old one. The most recent row (by calculated_at) is the current interpretation for its lab_result_id.';

create index soil_interpretations_lab_result_id_idx on public.soil_interpretations (lab_result_id);
create index soil_interpretations_field_id_idx on public.soil_interpretations (field_id);

-- ---------------------------------------------------------------------------
-- Cross-farm ownership AND real evidence-chain shape. lab_result_id's
-- own farm is verified via a real exists-lookup (the same shape
-- assert_job_session_belongs_to_farm/assert_field_belongs_to_farm
-- already use), not a second, separately maintained helper function for
-- a single-caller check.
--
-- Codex audit HIGH (round 1 of this checkpoint's own audit, 2026-09-12):
-- the first version verified `lab_result_id` belongs to the same farm
-- but never that this interpretation's own `field_id` actually matches
-- that LabResult's real `field_id` -- an interpretation could otherwise
-- be persisted claiming a different field than the evidence it was
-- supposedly derived from. Same "structural, not truthfulness" class of
-- check `lab_results_check_same_farm`'s own header comment (this
-- checkpoint's other migration) just added for the equivalent gap.
-- ---------------------------------------------------------------------------
create or replace function public.soil_interpretations_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  lab_result_field_id uuid;
begin
  select field_id into lab_result_field_id from public.lab_results where id = new.lab_result_id and farm_id = new.farm_id;
  if lab_result_field_id is null then
    raise exception 'lab_result % does not belong to farm %', new.lab_result_id, new.farm_id
      using errcode = 'foreign_key_violation';
  end if;
  if lab_result_field_id is distinct from new.field_id then
    raise exception 'soil_interpretations: field % does not match lab_result %''s own real field', new.field_id, new.lab_result_id
      using errcode = 'check_violation';
  end if;
  perform public.assert_field_belongs_to_farm(new.field_id, new.farm_id);
  return new;
end;
$$;

create trigger soil_interpretations_same_farm
  before insert on public.soil_interpretations
  for each row execute function public.soil_interpretations_check_same_farm();

-- ---------------------------------------------------------------------------
-- RLS -- identical owner-scoped, insert-only pattern as lab_results/
-- soil_core_observations.
-- ---------------------------------------------------------------------------
alter table public.soil_interpretations enable row level security;

create policy soil_interpretations_owner_select on public.soil_interpretations
  for select to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy soil_interpretations_owner_insert on public.soil_interpretations
  for insert to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.soil_interpretations from anon;
grant select, insert on public.soil_interpretations to authenticated;

-- Status: PENDING_DEV_VALIDATION -- reviewed manually against this
-- schema's own established patterns; not yet run against a live
-- database (no Dev credentials in this environment). Apply with
-- `supabase db push` against Farm Return V1 Dev only, never production.
