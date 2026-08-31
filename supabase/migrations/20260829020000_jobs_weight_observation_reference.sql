-- Farm Return Next Checkpoint 2, Vertical D — closes a real HIGH finding
-- from the overnight autonomous build run's Codex audit against
-- `farm-return-next-checkpoint2-jobs-persistence-revised`'s final diff
-- (`docs/farm-return-next/audit-logs/20260831T204350Z.md`, run against
-- the `select, insert` grant migration
-- `20260829010000_decisions_jobs_client_access.sql`):
--
-- "`persistRecordWeightObservationAuditTrail` requires and verifies the
-- exact `observationId`, but then discards it: the inserted Decision
-- contains only the input edits, and the Job contains only `decisionId`,
-- type, and status ... Consequently, neither persisted row identifies the
-- Actual that justified the `confirmed` status. Duplicate observations
-- with identical animal/date/weight are indistinguishable, deletion or
-- correction cannot be traced to the original Actual, and Learn/Records
-- cannot reconstruct the required Estimate->Decision->Job->Actual
-- provenance."
--
-- This is the identical gap the original checkpoint's own round 10-12
-- Codex audits found and deliberately deferred (`docs/farm-return-next/
-- BLOCKERS.md`'s "round 10's deferred finding" — reasoned as the same
-- "Actuals aren't a queryable concept yet" gap `estimate_calibration`'s
-- own pre-existing entry already named, and the same "no agreed
-- target-entity kind convention yet" gap `jobs`' own pre-existing
-- target-entity entry already named, both explicitly deferred to future
-- verticals (F and C respectively) designing a real, general Actual/
-- target-entity model). That reasoning correctly identified the risk of
-- a premature, ungeneralised fix: a raw `jobs.target_type`/`target_id`
-- polymorphic pair, invented here for one job type alone, would be
-- exactly the schema decision those two deferrals were trying to avoid
-- pre-empting.
--
-- On review (this overnight run, not a rubber-stamp acceptance of the
-- restated finding), the deferral was right to avoid the *generic*
-- design, but wrong to defer the *narrow* one: `jobs.weight_observation_id`
-- below does not invent a polymorphic target-entity model, or claim to be
-- the general "Actual" reference Vertical F/C will still need to design
-- for every future job type. It is a single, nullable, same-farm-enforced
-- foreign key scoped exactly to the one real job type this checkpoint
-- ships (`record_weight_observation`) — additive, and superseded (not
-- contradicted) whenever a real general model exists: a future migration
-- can add the general `target_type`/`target_id` pair alongside this
-- column, backfill it from this column for existing `record_weight_observation`
-- rows, and leave this column as a job-type-specific convenience or drop
-- it once nothing reads it, without this column ever having stood in the
-- way of that design. Leaving `jobs` with zero pointer to the Actual that
-- justified a `confirmed` status is a real, present gap in
-- `SCIENTIFIC_RULES.md`'s inspectable-trace requirement, not a
-- theoretical one — worth closing narrowly now rather than carrying
-- indefinitely on the promise of a future generic fix.
--
-- Nullable: only `record_weight_observation` jobs populate it; a future
-- job type with no single "Actual" row of this shape (or with more than
-- one) leaves it null, same as `decisions.field_id`/`jobs.decision_id`'s
-- own "absent when not applicable" precedent.

alter table public.jobs
  add column weight_observation_id uuid null references public.livestock_weight_observations (id);

comment on column public.jobs.weight_observation_id is
  'The specific livestock_weight_observations row that justified this job''s confirmed status, for record_weight_observation jobs. Same-farm-enforced by jobs_check_same_farm below (extended, not replaced). Deliberately job-type-specific, not a general target_type/target_id polymorphic reference -- see this migration''s own header comment.';

create index jobs_weight_observation_id_idx on public.jobs (weight_observation_id);

-- ---------------------------------------------------------------------------
-- Codex audit finding against this migration's first version
-- (docs/farm-return-next/audit-logs/20260831T205318Z.md), HIGH, resolved
-- here rather than deferred: a nullable column with no CHECK is only ever
-- populated by application discipline (`insertJob`'s own caller), and
-- `authenticated` already has direct table-level `insert` on `jobs`
-- (`20260829010000_decisions_jobs_client_access.sql`) -- exactly the
-- "never assume application code is the only writer" situation this
-- schema has repeatedly hardened against elsewhere
-- (`decisions_estimate_snapshot_ok_shape`, `decisions_check_field_same_farm`,
-- `jobs_decision_id_unique`). Two real, narrowly-scoped CHECK constraints,
-- each naming only the one concrete `job_type` string literal this
-- checkpoint actually knows about (not a guess at future job types'
-- requirements, which is exactly the premature generalisation this
-- migration's own header comment already reasoned against for the column
-- itself):
--
-- 1. A `record_weight_observation` job cannot be `confirmed` without a
--    `weight_observation_id` -- closes the actual provenance gap Codex
--    named ("a caller can still insert a `record_weight_observation` job
--    as `confirmed` with `weight_observation_id = NULL`"). Other statuses
--    for this job type stay unconstrained (a not-yet-confirmed job
--    legitimately has no Actual yet).
-- 2. `weight_observation_id` cannot be set on any job type other than
--    `record_weight_observation` -- this column's own doc comment already
--    says what it means; a value on an unrelated job type would
--    contradict that meaning at the database level, not just in prose.
-- ---------------------------------------------------------------------------
alter table public.jobs
  add constraint jobs_confirmed_weight_observation_requires_reference
    check (job_type <> 'record_weight_observation' or status <> 'confirmed' or weight_observation_id is not null),
  add constraint jobs_weight_observation_id_matches_job_type
    check (weight_observation_id is null or job_type = 'record_weight_observation');

-- ---------------------------------------------------------------------------
-- Cross-farm ownership: jobs.weight_observation_id must belong to the same
-- farm as the jobs row itself, identical reasoning to
-- jobs.decision_id/decisions.field_id's own triggers. Extends the existing
-- `jobs_check_same_farm` function (`create or replace`, same pattern
-- `20260829010000_decisions_jobs_client_access.sql` already used to reuse
-- `assert_field_belongs_to_farm` across migrations) rather than adding a
-- second trigger -- the existing `jobs_same_farm` trigger
-- (`20260829000000_orchestration_foundation.sql`) already fires `before
-- insert or update` and needs no change itself.
--
-- security invoker (the default), matching every other assert_*_belongs_to_farm
-- helper in this schema. `livestock_weight_observations` already grants
-- `select` to `authenticated` (`20260828040000_individual_animals.sql`),
-- so this trigger's own `select` runs with the same grant every other
-- same-farm check in this schema already depends on -- no new grant
-- dependency introduced (unlike jobs_check_same_farm's own original
-- decisions-select dependency, already resolved before this migration).
-- ---------------------------------------------------------------------------

create or replace function public.assert_weight_observation_belongs_to_farm(p_observation_id uuid, p_farm_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.livestock_weight_observations
    where id = p_observation_id and farm_id = p_farm_id
  ) then
    raise exception 'weight observation % does not belong to farm %', p_observation_id, p_farm_id
      using errcode = 'foreign_key_violation';
  end if;
end;
$$;

create or replace function public.jobs_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.decision_id is not null then
    perform public.assert_decision_belongs_to_farm(new.decision_id, new.farm_id);
  end if;
  if new.weight_observation_id is not null then
    perform public.assert_weight_observation_belongs_to_farm(new.weight_observation_id, new.farm_id);
  end if;
  return new;
end;
$$;

-- No new grant statements: `jobs` already grants `select, insert` to
-- `authenticated` (`20260829010000_decisions_jobs_client_access.sql`,
-- table-level -- covers every column including this new one, no
-- column-scoped insert grant exists on this table to extend), and
-- `weight_observation_id` carries no `update` path either (`jobs` grants
-- no `update` at all, unchanged by this migration).
--
-- Status: PENDING_DEV_VALIDATION -- not yet applied to any database, same
-- disclosed limitation as every migration in this branch. A human with
-- database access applying this migration (alongside
-- 20260829000000_orchestration_foundation.sql and
-- 20260829010000_decisions_jobs_client_access.sql, in that order) should
-- additionally confirm: an authenticated user's `insert` on `jobs` with a
-- `weight_observation_id` belonging to a `livestock_weight_observations`
-- row on a different farm is rejected by `jobs_check_same_farm` (the new
-- check added here), the same way a cross-farm `decision_id` already is;
-- an `insert` of a `record_weight_observation` job with `status =
-- 'confirmed'` and `weight_observation_id` left `null` is rejected by
-- `jobs_confirmed_weight_observation_requires_reference`; an `insert` of
-- any other `job_type` with a non-null `weight_observation_id` is
-- rejected by `jobs_weight_observation_id_matches_job_type`.
