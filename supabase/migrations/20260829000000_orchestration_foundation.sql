-- Farm Return Next Checkpoint 1 — orchestration foundation schema.
--
-- Status: APPLIED_DEV — applied to `Farm Return V1 Dev` and independently
-- confirmed live by the product owner, 2026-09-01 (this build session
-- itself has no working network path to Supabase's Postgres/Management-
-- API endpoints, so the apply was necessarily done and confirmed from
-- elsewhere — see `docs/farm-return-next/BLOCKERS.md`'s dedicated entry
-- on that limitation).
--
-- Not yet VALIDATED_DEV — the schema this migration originally shipped
-- (no client grant on either table at all) has since been superseded,
-- additively, by `20260829010000_decisions_jobs_client_access.sql`
-- (grants `select, insert`) and
-- `20260829020000_jobs_weight_observation_reference.sql` — see those
-- migrations' own status lines for the current, real access model. The
-- real User A/User B cross-tenant RLS validation that current model
-- needs has a ready-to-run script,
-- `supabase/validation/decisions_jobs_rls_validation.sql` (covers both
-- tables together, since the grant/RLS story is only meaningful across
-- all three migrations combined) — run it and confirm every line reads
-- PASS before treating any of these three migrations as VALIDATED_DEV,
-- and update all three status lines (and
-- `docs/farm-return-next/BUILD_STATE.json`) together once it does.
--
-- This migration has been revised repeatedly against real Codex audit
-- findings — see `docs/farm-return-next/IMPLEMENTATION_LOG.md` for the
-- exact round count and every round's full detail (not restated as a
-- number here, since that number itself drifted stale across two prior
-- audit rounds; the log is now the only source for it). Highlights, each
-- a genuine bug this schema shipped at some point and doesn't any more:
-- a CRITICAL cross-farm gap (`jobs.target_type`/`target_id`, since
-- removed); a migration that would not even have applied (Postgres
-- rejects a subquery inside a CHECK constraint); `decided_by` accepting
-- `'auto_rule'` from any authenticated client despite no reviewed
-- auto-rule existing (fixed below by constraining it to `'farmer'`
-- only — `'auto_rule'` is added back via its own reviewed migration
-- alongside whichever checkpoint ships the first real auto-rule,
-- `SCIENTIFIC_RULES.md`, not before); and a `CHECK` constraint that
-- looked right but silently passed on `NULL` (Postgres CHECK semantics —
-- fixed below with `IS NOT DISTINCT FROM`). Two structural lessons from
-- that history, both applied here:
--
-- 1. `jobs.target_type`/`target_id` (round 2's Medium fix) reopened the
--    exact cross-farm gap 20260828070000_cross_farm_integrity.sql closed,
--    because enforcing ownership over a polymorphic target needs a real,
--    agreed set of target entity kinds that doesn't exist yet. Removed,
--    not patched — Vertical C adds a properly-enforced target reference
--    when it has one.
-- 2. `estimate_calibration` (this checkpoint's fourth table) generated a
--    genuine CRITICAL-adjacent HIGH finding on every one of rounds 3-5:
--    first missing provenance constraints, then an illegal CHECK
--    subquery, then a still-mutable table, then — the round that settled
--    it — Codex correctly pointing out real calibration provenance needs
--    to reference confirmed Actuals, not just Decisions, which don't
--    exist as a queryable concept anywhere yet.
--    `docs/farm-return-next/BUILD_PLAN.md`'s own dependency table already
--    said as much before any of this: "F — Learn calibration |
--    estimate_calibration writer/reader | Checkpoint 1's learn/,
--    **Vertical D (needs real Actuals)**." Five audit rounds spent
--    hardening a table with zero consumers this checkpoint
--    (`src/orchestration/learn/index.ts` stays types-only) confirmed that
--    dependency ordering empirically rather than overriding it under
--    audit pressure. **`estimate_calibration` is removed from this
--    migration entirely** — Vertical F adds it, correctly designed
--    against Vertical D's real Actuals, when it exists. This is the same
--    "defer rather than invent prematurely" call as `jobs`' target
--    columns above, made once instead of across three more audit rounds.
--
-- Two tables backing `docs/farm-return-next/ARCHITECTURE.md`'s data
-- model additions, forward-only, no existing table/constraint touched:
--
-- - decisions: a farmer's response to a Prompt (Decide stage).
--   `prompt_id` is a free-form label, not a foreign key — no `prompts`
--   table exists; per ARCHITECTURE.md, a Prompt is derived at request
--   time from an Estimate, never persisted as its own row. Because a
--   Prompt is never persisted, `calculation_kind`/`estimate_snapshot`
--   capture an immutable copy of the Prompt's `kind`/`basis` at decision
--   time (mirroring `src/orchestration/decide/index.ts`'s `Decision`
--   type exactly) — without this, Learn could never reconcile Estimate
--   vs Actual and Activity could never inspect the trace
--   `SCIENTIFIC_RULES.md` requires stay available. Select+insert only
--   (no update/delete policy or grant) — a decision, once made, is a
--   historical fact, the same "never overwrite provenance" principle
--   `product-requirements.md`'s data-precedence table already applies to
--   every `TrackedValue` in this app.
-- - jobs: an Act-stage record (a decision turned into a real, trackable
--   unit of work). `decision_id` links back to the decisions row that
--   authorised it — required (`not null`), no `on delete` override (the
--   default, restrictive), matching the Act-stage model literally: a job
--   with no decision behind it has no authorization. No target-entity
--   columns — see point 1 above.
--
-- Neither `decisions` nor `jobs` is granted to `authenticated` yet (see
-- "No client write/read access yet" below) — this checkpoint's one real
-- Act implementation (`actRecordWeightObservation`) writes straight to
-- the existing `livestock_weight_observations` table and does not touch
-- either table at all, so nothing is blocked by that.
--
-- No client write/read access yet: `decisions`'/`jobs`' RLS policies
-- below are real and correct, but neither table is `GRANT`ed to
-- `authenticated` in this migration -- Postgres checks table-level
-- grants before RLS ever runs, so with no grant, no authenticated client
-- can read or write a row regardless of policy. This closes a real Codex
-- audit HIGH the "honest deferral" comment on `estimate_snapshot`'s CHECK
-- constraint (below) didn't fully close on its own
-- (`docs/farm-return-next/audit-logs/20260829T012158Z.md`): "deferring a
-- sanctioned writer does not make the presently granted raw insert
-- safe" — correct, and the same reasoning as point 2 above (nothing
-- consumes either table this checkpoint) applies here too. A future
-- vertical enables real access with a one-line forward-only migration
-- (`grant select, insert on public.decisions to authenticated;` etc.)
-- once it has a real, designed writer — the policies don't need to be
-- touched again when that happens.
--
-- telemetry_events (raw Observe-stage phone events) and
-- estimate_calibration (Learn-stage output) are both deferred to their
-- owning verticals (A and F respectively, `docs/farm-return-next/
-- BUILD_PLAN.md`) rather than shipped as unconsumed schema this
-- checkpoint — the same lesson as point 2 above, applied consistently
-- rather than only to the table that forced it.
--
-- Cross-farm ownership: `jobs.decision_id` is a second foreign key into
-- another farm-scoped table (decisions), so it gets the same
-- before-insert-or-update trigger pattern
-- 20260828070000_cross_farm_integrity.sql established — RLS alone only
-- ever checks a row's own farm_id, never resolves what a *second*
-- foreign key actually points at.

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  prompt_id text not null,
  -- Mirrors Decision.calculationKind / Decision.estimateSnapshot
  -- (src/orchestration/decide/index.ts) exactly -- see this file's header
  -- comment.
  calculation_kind text not null,
  estimate_snapshot jsonb not null,
  outcome text not null check (outcome in ('accepted', 'edited', 'dismissed')),
  edits jsonb,
  -- 'auto_rule' deliberately not allowed yet -- see this file's header
  -- comment: no reviewed auto-rule exists, so nothing should be able to
  -- insert a row claiming one decided.
  decided_by text not null check (decided_by = 'farmer'),
  decided_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- decideAsFarmer (src/orchestration/decide/index.ts) already refuses to
  -- construct an accepted/edited Decision unless the Prompt's basis was
  -- "OK" -- but application code is never the only enforcement
  -- (CLAUDE.md). This table currently has no grant to `authenticated` at
  -- all (see "No client write/read access yet" above), which is the
  -- primary defense right now -- but this CHECK stays in place as a
  -- second, independent layer for whenever a real writer earns that
  -- grant, mirroring an accepted/edited row's own estimate_snapshot
  -- having to say status "OK" regardless of what wrote it.
  -- `= 'OK'` alone would be wrong: Postgres CHECK constraints PASS when
  -- the expression evaluates to NULL (not just TRUE), and
  -- `estimate_snapshot ->> 'status'` is NULL for any jsonb value with no
  -- `status` key (e.g. `{}`) -- silently permitting exactly the malformed
  -- snapshot this constraint exists to reject. `IS NOT DISTINCT FROM`
  -- treats NULL as a real, non-matching value instead.
  --
  -- Deliberately NOT validated further here (Codex audit finding, HIGH,
  -- deferred rather than fixed -- docs/farm-return-next/BLOCKERS.md):
  -- this only checks `status`, not the rest of an `OK` EngineOutcome's
  -- shape (`value` present, `evidenceState` one of its six real values).
  -- Encoding that in a CHECK constraint means re-encoding
  -- `src/domain/evidence.ts`'s discriminated union in SQL -- a second,
  -- separately-maintained copy of the same type, exactly the kind of
  -- domain-logic duplication `DOMAIN_CONTRACTS.md`'s reuse boundary
  -- exists to prevent, for a column no writer populates yet this
  -- checkpoint. The real fix is a single sanctioned insert path (a
  -- Postgres function/RPC only `decideAsFarmer`-equivalent server code
  -- calls, never a raw client insert) once Vertical B builds one --
  -- schema-level partial validation now, full validation designed later,
  -- not schema-level full validation guessed at now.
  check (outcome = 'dismissed' or estimate_snapshot ->> 'status' is not distinct from 'OK')
);

create index decisions_farm_id_idx on public.decisions (farm_id);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  -- not null (Codex audit finding, HIGH): the Act-stage model this table
  -- backs is "a decision turned into a real, trackable unit of work"
  -- (ARCHITECTURE.md) -- a job with no decision behind it has no
  -- authorization/provenance at all, contradicting that model. The first
  -- version's `on delete set null` rationale ("job history survives if
  -- its decision is later removed") was also just wrong: decisions is
  -- select+insert-only, so a decision is never actually deleted in
  -- practice; a farm's own cascade-delete already removes both tables'
  -- rows via their own farm_id, independent of this column. Left as the
  -- default (restrict) rather than repeating a dead rationale.
  decision_id uuid not null references public.decisions (id),
  job_type text not null,
  status text not null check (status in ('proposed', 'scheduled', 'in_progress', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create index jobs_farm_id_idx on public.jobs (farm_id);
create index jobs_decision_id_idx on public.jobs (decision_id);

-- ---------------------------------------------------------------------------
-- Cross-farm ownership trigger: jobs.decision_id must belong to the same
-- farm as the jobs row itself.
--
-- GRANT DEPENDENCY (Codex audit round 11, MEDIUM,
-- docs/farm-return-next/audit-logs/20260829T012813Z.md): this function is
-- security-invoker (the default -- not `security definer`, matching
-- every other assert_*_belongs_to_farm helper in this schema, e.g.
-- 20260828070000_cross_farm_integrity.sql's), so it runs the `select ...
-- from public.decisions` query AS the calling role. Every prior migration
-- in this schema granted both sides of a cross-table check together in
-- the same statement, so this never mattered before -- this migration is
-- the first to split them (jobs currently has no grant either, so this
-- doesn't bite today). Whoever adds `grant ... on public.jobs to
-- authenticated` later MUST also `grant select on public.decisions to
-- authenticated` in the same migration, or every authenticated `jobs`
-- insert will fail with a permission error instead of running this check
-- at all -- not a security hole (fails closed, just noisily), but a real
-- footgun for whoever does it without reading this comment.
-- ---------------------------------------------------------------------------

create or replace function public.assert_decision_belongs_to_farm(p_decision_id uuid, p_farm_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.decisions where id = p_decision_id and farm_id = p_farm_id) then
    raise exception 'decision % does not belong to farm %', p_decision_id, p_farm_id
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
  return new;
end;
$$;

drop trigger if exists jobs_same_farm on public.jobs;
create trigger jobs_same_farm
  before insert or update on public.jobs
  for each row execute function public.jobs_check_same_farm();

-- ---------------------------------------------------------------------------
-- RLS — identical pattern to every table in this schema: owner-scoped via
-- farms.user_id, authenticated-only, anon revoked.
-- ---------------------------------------------------------------------------

alter table public.decisions enable row level security;
alter table public.jobs enable row level security;

-- decisions is select+insert only, deliberately no update/delete policy
-- (unlike every other "_owner_all" policy in this schema) -- see this
-- file's header comment.
create policy "decisions_owner_select" on public.decisions
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "decisions_owner_insert" on public.decisions
  for insert
  to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "jobs_owner_all" on public.jobs
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.decisions, public.jobs from anon;
-- No `grant ... to authenticated` for either table -- see this file's
-- header comment ("No client write/read access yet"). The policies above
-- are real and ready; a future migration adds the grant once a real,
-- designed writer exists for each table.
revoke all on public.decisions, public.jobs from authenticated;
