-- Fertiliser Vertical V1 — Checkpoint 2, Laboratory Evidence.
-- See docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md
-- for the frozen object model this migration implements one link of:
-- CompositeSample -> LabResult.
--
-- `job_session_id` (unique) is the CompositeSample this result belongs
-- to -- the identical "job_sessions.id already IS the permanent identity,
-- no separate mutable row" reasoning
-- `20260912000000_soil_core_observations.sql`'s own header comment
-- already established for CompositeSample, applied here at the other
-- end of the same relationship. The `unique` constraint is the real,
-- structural enforcement of the campaign's own critical rule: a
-- CompositeSample can have at most one LabResult, and a LabResult can
-- never be attached to an individual `soil_core_observations` row --
-- no such foreign key path exists anywhere in this schema.
--
-- Raw measurements only -- no derived P/K Index lives on this table.
-- `soil_interpretations` (next migration) holds the versioned,
-- reproducible derived classification, kept structurally separate so a
-- future methodology change never requires re-entering (or risks
-- silently rewriting) what the laboratory actually measured.
--
-- Status: NOT YET APPLIED to `Farm Return V1 Dev` -- same disclosed gap
-- as every other migration in this checkpoint (no live Supabase
-- credentials in this environment).

create table public.lab_results (
  -- Client-generated (uuid, no default) -- same offline-first
  -- idempotency-key pattern every table in this contract uses.
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  job_session_id uuid not null references public.job_sessions (id) on delete cascade,
  field_id uuid not null references public.fields (id),
  laboratory text not null,
  -- The laboratory's own report/sample reference -- distinct from this
  -- app's own `job_sessions.id`-derived Sample ID (FR-SOIL-...).
  lab_report_ref text not null,
  analysis_date date not null,
  ph double precision not null check (ph > 0 and ph < 14),
  -- Raw Morgan's P/K, mg/L -- the laboratory's own measured values,
  -- never a derived index. Non-negative only; no upper bound imposed
  -- (a genuinely extreme measured value must never be silently
  -- rejected as "impossible" by this schema).
  p_mg_l double precision not null check (p_mg_l >= 0),
  k_mg_l double precision not null check (k_mg_l >= 0),
  mg_mg_l double precision null check (mg_mg_l is null or mg_mg_l >= 0),
  organic_matter_pct double precision null check (organic_matter_pct is null or (organic_matter_pct >= 0 and organic_matter_pct <= 100)),
  -- A laboratory-reported lime requirement, when supplied -- passed
  -- through verbatim, never derived (no validated Irish model exists in
  -- this codebase to compute one from pH alone -- see
  -- src/domain/soil-interpretation.ts's own doc comment).
  lime_requirement_t_ha double precision null check (lime_requirement_t_ha is null or lime_requirement_t_ha >= 0),
  -- A farmer-entered reference to the source report (a filename, an
  -- external link, a physical filing reference) -- NOT a real upload/
  -- storage mechanism. No Supabase Storage bucket or file-upload path
  -- exists anywhere in this codebase yet (checked before writing this
  -- migration); building one is out of this checkpoint's scope. Never
  -- presented in the UI as "the report is stored here."
  source_document_ref text null,
  entered_by text not null check (entered_by = 'farmer'),
  entered_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint lab_results_job_session_unique unique (job_session_id)
);

comment on table public.lab_results is
  'Fertiliser Vertical V1 Checkpoint 2 -- one row per CompositeSample''s real laboratory result (job_session_id, unique). Immutable, append-only evidence: never updated or deleted once inserted. Raw measured values only -- see soil_interpretations for the derived, versioned classification.';

create index lab_results_job_session_id_idx on public.lab_results (job_session_id);
create index lab_results_field_id_idx on public.lab_results (field_id);

-- ---------------------------------------------------------------------------
-- Cross-farm ownership AND real evidence-chain shape -- reuses the same
-- existing helper functions as soil_core_observations_check_same_farm
-- (20260912000000), never a second, ad hoc check for the same-farm half.
--
-- Codex audit HIGH (round 1 of this checkpoint's own audit, 2026-09-12):
-- the first version of this trigger checked only same-farm ownership --
-- it never verified the session this LabResult claims to attach to is
-- actually the CompositeSample the campaign's own chain requires (a
-- real, CONFIRMED soil_sampling session, `field_id` matching that
-- session's own real field). `recordLabResultForCompositeSample`
-- (`src/orchestration/lab-result/index.ts`) already checks all of this
-- in application code, but the database's own `select, insert` grant to
-- `authenticated` means a direct REST call bypassing that orchestration
-- could otherwise attach a lab result to an in-progress session, a
-- non-soil-sampling activity, or a field the session was never actually
-- run against -- the same "structural, not truthfulness" class of check
-- `job_actuals_check_same_farm`'s own header comment already documents
-- as this schema's real, existing discipline.
-- ---------------------------------------------------------------------------
create or replace function public.lab_results_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  session_status text;
  session_activity_type text;
  session_field_id uuid;
begin
  perform public.assert_job_session_belongs_to_farm(new.job_session_id, new.farm_id);
  perform public.assert_field_belongs_to_farm(new.field_id, new.farm_id);

  select status, activity_type, primary_field_id into session_status, session_activity_type, session_field_id
    from public.job_sessions where id = new.job_session_id;

  if session_activity_type <> 'soil_sampling' then
    raise exception 'lab_results: job_session % is not a soil_sampling session (activity_type "%")', new.job_session_id, session_activity_type
      using errcode = 'check_violation';
  end if;
  if session_status <> 'confirmed_actual' then
    raise exception 'lab_results: job_session % is "%" -- a lab result can only attach to a confirmed composite sample', new.job_session_id, session_status
      using errcode = 'check_violation';
  end if;
  if session_field_id is distinct from new.field_id then
    raise exception 'lab_results: field % does not match job_session %''s own real field', new.field_id, new.job_session_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger lab_results_same_farm
  before insert on public.lab_results
  for each row execute function public.lab_results_check_same_farm();

-- ---------------------------------------------------------------------------
-- RLS -- identical owner-scoped, insert-only pattern as
-- soil_core_observations: a lab result is permanent evidence, never
-- edited or removed once entered. No update/delete policy or grant.
-- ---------------------------------------------------------------------------
alter table public.lab_results enable row level security;

create policy lab_results_owner_select on public.lab_results
  for select to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy lab_results_owner_insert on public.lab_results
  for insert to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.lab_results from anon;
grant select, insert on public.lab_results to authenticated;

-- Status: PENDING_DEV_VALIDATION -- reviewed manually against this
-- schema's own established patterns; not yet run against a live
-- database (no Dev credentials in this environment). Apply with
-- `supabase db push` against Farm Return V1 Dev only, never production.
