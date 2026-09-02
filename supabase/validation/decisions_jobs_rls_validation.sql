-- Farm Return Next — live RLS validation for `decisions`/`jobs`
-- (User A / User B cross-tenant isolation), per the architectural
-- security review's rule 8 ("prove that User A cannot read, insert,
-- update or associate a Decision/Job belonging to User B or a farm they
-- do not have authorised access to").
--
-- HOW TO RUN: a service-role/postgres connection (`supabase db query -f
-- <this file> --linked --project-ref <ref>`, or the Dashboard SQL
-- Editor) — required so this script can `SET LOCAL ROLE authenticated`
-- / `anon` and impersonate two different real users' `auth.uid()` in
-- turn, the same technique Supabase's own docs recommend for testing RLS
-- without a real second login: https://supabase.com/docs/guides/database/postgres/row-level-security#testing-policies.
-- `psql` also works. Run the whole file as one script/paste — the
-- leading `BEGIN` and trailing `ROLLBACK` must execute in the same
-- session as everything between them.
--
-- WHAT IT DOES: uses two of *your own already-existing* real farms — no
-- new accounts, no passwords, nothing created in `auth.users`. The
-- entire script runs inside one transaction that is explicitly ROLLED
-- BACK at the very end regardless of outcome (the `ROLLBACK` on the last
-- line is not conditional) — nothing persists in `decisions`/`jobs`
-- after running this, and nothing is deleted from your real data either.
-- If the script errors out partway (e.g. the "need two farms"
-- precondition fails, or a positive-control insert unexpectedly fails
-- because an earlier test found a real bug — see Test 5b's own comment),
-- the transaction aborts on its own and nothing persists either way.
--
-- PREREQUISITE: at least two farms, owned by two different real
-- `auth.users` accounts, must exist in this project already (any two
-- real accounts you've signed up with count — they don't need any
-- existing decisions/jobs). Test 3d (below) additionally needs Farm B to
-- already have at least one real field; if it doesn't, that one test is
-- skipped with an explicit SKIP notice rather than fabricating a field
-- row (a `fields` row has several NOT NULL jsonb columns —
-- `planned_use`/`mapped_soil`/`fertility` — whose real shape this script
-- has no business guessing at).
--
-- Reads its own PASS/FAIL/SKIP results back via a real SELECT at the end
-- (a temporary results table, not RAISE NOTICE — `supabase db query`'s
-- Management-API execution path does not stream NOTICE output back, only
-- final query results; confirmed empirically running this script's
-- original version against `Farm Return V1 Dev` (2026-09-02, Phase A of
-- the decisions/jobs Dev-validation phase): the run completed with zero
-- errors but returned zero rows, since every result line was a RAISE
-- NOTICE the API transport silently discards — the exact "incomplete
-- validator" gap `supabase/validation/job_sessions_actuals_validation.sql`
-- had already found and fixed the same way for its own, later-written
-- script, but this file — the older of the two — had never been
-- migrated to match). A single "FAIL" line anywhere means a real, live
-- security gap — stop and investigate before treating anything as
-- validated. A SKIP line means that one check could not run in this
-- project as-is (see its own text for why) — it is not a PASS and
-- should not be read as one.
--
-- Codex audit (2026-09-01, docs/farm-return-next/audit-logs/
-- 20260901T132443Z.md) found this script's first version had two real
-- gaps, both fixed in that version:
-- 1. (CRITICAL) The original Test 5b (decisions delete, expected
--    rejected) ran *after* Test 4b had already inserted a `jobs` row
--    referencing `decision_a_id` — so even if an unsafe delete grant
--    existed, the delete would still raise a foreign-key error (the
--    referencing job), and the test would report a false PASS. Fixed by
--    reordering: Test 5b now runs on `decision_a_id` before any job
--    references it, making a delete-grant bug the *only* thing that
--    could make it raise.
-- 2. (CRITICAL) The original script never exercised
--    `jobs_check_same_farm`'s or `decisions_check_field_same_farm`'s own
--    cross-reference logic specifically — every negative test used a
--    foreign `farm_id`, which RLS's own `with check` already rejects
--    before either trigger runs. Fixed by adding Test 3c (own `farm_id`,
--    foreign-farm `decision_id`) and Test 3d (own `farm_id`,
--    foreign-farm `field_id`) — both use a legitimately-owned `farm_id`
--    so only the trigger's own cross-reference check can be what rejects
--    them. Also added Test 6b (jobs delete, mirroring Test 5b for jobs)
--    and Test 8 (anonymous/no-session access, mirroring the migration's
--    own documented `revoke all ... from anon` claim) — both named
--    explicitly in the migration's checklist but missing from the first
--    version of this script.
--
-- Round 2 (docs/farm-return-next/audit-logs/20260901T133149Z.md) found
-- two further real MEDIUM gaps in Test 8 itself, both fixed: switching
-- to the `anon` role doesn't clear `request.jwt.claims`, so the test
-- wasn't actually claims-less as its own text said (fixed with `reset
-- request.jwt.claims`); and the insert sub-tests treated any raised
-- error as proof of "no grant," which an accidental grant could still
-- pass behind an unrelated RLS rejection (fixed by asserting
-- `has_table_privilege('anon', ..., ...)` directly, with the behavioural
-- insert/select attempts kept only as a secondary, defence-in-depth
-- confirmation).
--
-- Round 3 (docs/farm-return-next/audit-logs/20260901T133704Z.md) found
-- one further real MEDIUM: the round-2 fix only checked SELECT/INSERT,
-- so an accidental UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grant to
-- `anon` would have gone completely undetected despite the test's own
-- "zero access"/`revoke all` claim. Fixed by checking all seven
-- privileges via `has_table_privilege`'s comma-separated list form
-- (true if ANY is held) per table.
--
-- Phase A (2026-09-02, decisions/jobs real Dev-database validation) —
-- REAL FINDING, fixed: this script's every `raise notice` call was
-- converted to `insert into validation_results (line) values (...)`,
-- exactly mirroring `job_sessions_actuals_validation.sql`'s own
-- established pattern (a session-temporary `validation_results` table,
-- readable via a real `select` before the final `rollback`), because
-- `supabase db query`'s execution path does not surface `RAISE NOTICE`
-- output at all — this script had never actually produced a visible
-- PASS/FAIL result when run that way, only when pasted into the
-- Dashboard SQL Editor's own console (which does render NOTICE). No test
-- logic changed — every assertion, ordering rationale, and prior audit
-- fix above is unchanged; only how a result reaches the caller changed.
-- The first live run against `Farm Return V1 Dev` with this fix still
-- failed — `grant all on validation_results to authenticated, anon`
-- does not itself extend to the table's own backing `serial` sequence,
-- so the very first `insert` while impersonating `authenticated` raised
-- `permission denied for sequence validation_results_seq_seq` — fixed
-- with an explicit `grant usage, select on sequence
-- validation_results_seq_seq to authenticated, anon`, matching
-- `job_sessions_actuals_validation.sql`'s own already-correct version of
-- this exact grant line.

begin;

create temporary table validation_results (seq serial primary key, line text not null);
-- Created (and owned) by this script's own superuser connection, before
-- any `set local role` below — grant explicitly so a later insert while
-- impersonating `authenticated`/`anon` doesn't itself fail with a
-- permission error unrelated to whatever that line is actually testing.
grant all on validation_results to authenticated, anon;
grant usage, select on sequence validation_results_seq_seq to authenticated, anon;

do $$
declare
  farm_a record;
  farm_b record;
  decision_a_id uuid;
  decision_a2_id uuid;
  decision_a3_id uuid;
  decision_a4_id uuid;
  decision_a5_id uuid;
  decision_b_id uuid;
  job_a_id uuid;
  field_b_id uuid;
  individual_a_id uuid;
  individual_b_id uuid;
  weight_obs_a_id uuid;
  weight_obs_b_id uuid;
  err_caught boolean;
begin
  -- ---------------------------------------------------------------------
  -- Setup: two real, distinct, already-existing farms (different
  -- owners), a real decision on Farm B (created here, as the superuser/
  -- service-role connection this script runs under — bypasses RLS, same
  -- as reading `farms` itself already relies on), and Farm B's own first
  -- real field if it has one. All three reads/writes happen before the
  -- role switch below, while this session still has full access.
  -- ---------------------------------------------------------------------
  select f.id as farm_id, f.user_id, f.name into farm_a
  from public.farms f
  order by f.created_at asc
  limit 1;

  -- Prefer a Farm B that already has a real field, so Test 3d (below)
  -- can actually run instead of SKIP — this is a real-data preference,
  -- not fabrication: it only changes *which* of the project's own
  -- already-existing farms gets picked, never creates one. Falls back to
  -- the earliest other-owner farm if none of them have a field, in which
  -- case Test 3d still honestly SKIPs exactly as before (Phase A,
  -- 2026-09-02, real Dev-database validation — the original
  -- "earliest other-owner farm, full stop" selection left Test 3d
  -- skipped on this project even though a real, eligible Farm B existed
  -- further down the list).
  select f.id as farm_id, f.user_id, f.name into farm_b
  from public.farms f
  where f.user_id <> farm_a.user_id
    and exists (select 1 from public.fields fl where fl.farm_id = f.id)
  order by f.created_at asc
  limit 1;

  if farm_b.farm_id is null then
    select f.id as farm_id, f.user_id, f.name into farm_b
    from public.farms f
    where f.user_id <> farm_a.user_id
    order by f.created_at asc
    limit 1;
  end if;

  if farm_a.farm_id is null or farm_b.farm_id is null then
    raise exception 'VALIDATION ABORTED: need at least two farms owned by two different users in this project to run this script. Found farm_a=%, farm_b=%', farm_a.farm_id, farm_b.farm_id;
  end if;

  insert into validation_results (line) values (format('--- Farm A: id=%s owner=%s name=%s ---', farm_a.farm_id, farm_a.user_id, farm_a.name));
  insert into validation_results (line) values (format('--- Farm B: id=%s owner=%s name=%s ---', farm_b.farm_id, farm_b.user_id, farm_b.name));

  decision_b_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_b_id, farm_b.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());
  insert into validation_results (line) values (format('--- Setup: created a real decisions row on Farm B (id=%s) for Test 3c to reference. ---', decision_b_id));

  select fl.id into field_b_id
  from public.fields fl
  where fl.farm_id = farm_b.farm_id
  order by fl.created_at asc
  limit 1;
  if field_b_id is null then
    insert into validation_results (line) values ('--- Setup: Farm B has no existing field — Test 3d will be SKIPPED (see its own notice). ---');
  else
    insert into validation_results (line) values (format('--- Setup: Farm B has an existing field (id=%s) for Test 3d to reference. ---', field_b_id));
  end if;

  -- A real `livestock_individuals` + `livestock_weight_observations` row
  -- on each farm (Phase A, 2026-09-02) — needed for Test 9a-9d below,
  -- which exercise `20260829020000_jobs_weight_observation_reference.sql`'s
  -- own two CHECK constraints and its extended same-farm trigger, none of
  -- which the original version of this script ever touched (that
  -- migration's own status comment named exactly this gap). Neither
  -- table had any real row in this project as of this write, so these
  -- are created here — structurally valid, explicitly-labelled test
  -- fixtures (`category: 'calf'`, `source: 'validation_probe'`), never a
  -- scientific/production value, same category of thing this script's
  -- own `decisions`/`jobs` setup rows already are. Rolled back with
  -- everything else at the end.
  insert into public.livestock_individuals (id, farm_id, category)
  values (gen_random_uuid(), farm_a.farm_id, 'calf')
  returning id into individual_a_id;
  insert into public.livestock_weight_observations (id, farm_id, animal_id, weight_kg, observed_date, source)
  values (gen_random_uuid(), farm_a.farm_id, individual_a_id, 42.0, current_date, 'validation_probe')
  returning id into weight_obs_a_id;
  insert into validation_results (line) values (format('--- Setup: created a real livestock_individuals + livestock_weight_observations row on Farm A (weight_obs_a_id=%s) for Test 9b/9c to reference. ---', weight_obs_a_id));

  insert into public.livestock_individuals (id, farm_id, category)
  values (gen_random_uuid(), farm_b.farm_id, 'calf')
  returning id into individual_b_id;
  insert into public.livestock_weight_observations (id, farm_id, animal_id, weight_kg, observed_date, source)
  values (gen_random_uuid(), farm_b.farm_id, individual_b_id, 42.0, current_date, 'validation_probe')
  returning id into weight_obs_b_id;
  insert into validation_results (line) values (format('--- Setup: created a real livestock_individuals + livestock_weight_observations row on Farm B (weight_obs_b_id=%s) for Test 9d to reference. ---', weight_obs_b_id));

  -- ---------------------------------------------------------------------
  -- Simulate User A's own session (RLS-enforced, not the superuser
  -- connection this script itself is running under).
  -- ---------------------------------------------------------------------
  set local role authenticated;
  execute format('set local request.jwt.claims = %L', json_build_object('sub', farm_a.user_id, 'role', 'authenticated')::text);

  -- TEST 1 (positive): User A can select their own (currently empty)
  -- decisions/jobs without error.
  perform 1 from public.decisions where farm_id = farm_a.farm_id;
  perform 1 from public.jobs where farm_id = farm_a.farm_id;
  insert into validation_results (line) values ('PASS — Test 1: User A can select decisions/jobs scoped to their own farm (no error).');

  -- TEST 2 (negative, the core isolation check): User A selecting
  -- Farm B's decisions/jobs must return zero rows (RLS filters them out
  -- silently — this is the correct RLS behaviour, not an error). Note
  -- this also implicitly proves User A cannot see the Farm-B decision
  -- this script's own setup step just created above.
  if exists (select 1 from public.decisions where farm_id = farm_b.farm_id) then
    insert into validation_results (line) values ('FAIL — Test 2a: User A can see a decisions row belonging to Farm B. REAL CROSS-FARM LEAK.');
  else
    insert into validation_results (line) values ('PASS — Test 2a: User A sees zero decisions rows for Farm B.');
  end if;
  if exists (select 1 from public.jobs where farm_id = farm_b.farm_id) then
    insert into validation_results (line) values ('FAIL — Test 2b: User A can see a jobs row belonging to Farm B. REAL CROSS-FARM LEAK.');
  else
    insert into validation_results (line) values ('PASS — Test 2b: User A sees zero jobs rows for Farm B.');
  end if;

  -- TEST 3a (negative, the exact scenario rule 3 named): User A cannot
  -- create a Decision against Farm B merely by setting farm_id = Farm B.
  err_caught := false;
  begin
    insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
    values (gen_random_uuid(), farm_b.farm_id, gen_random_uuid(), 'validation_probe',
            '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 3a: User A cannot insert a decisions row against Farm B (rejected).');
  else
    insert into validation_results (line) values ('FAIL — Test 3a: User A inserted a decisions row against Farm B. REAL CROSS-FARM WRITE.');
  end if;

  -- Test 3b (jobs, farm_id=Farm B) is deliberately deferred to right
  -- after Test 4b creates a real `decision_a_id` — a jobs insert with a
  -- non-existent `decision_id` would fail on the `not null references
  -- decisions(id)` foreign key alone, which would "pass" this test even
  -- if RLS enforced nothing at all. Using a real, existing decision
  -- instead makes this a clean, unconfounded test of RLS/the same-farm
  -- trigger specifically, not an accidental FK check.

  -- ---------------------------------------------------------------------
  -- TEST 4a (positive control): User A CAN insert a real decision for
  -- their OWN farm — proves grants/RLS aren't just blocking everything.
  -- ---------------------------------------------------------------------
  decision_a_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_a_id, farm_a.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());
  insert into validation_results (line) values ('PASS — Test 4a: User A successfully inserted a decisions row for their own Farm A (positive control).');

  -- TEST 5a/5b (negative): no update/delete grant on decisions at all.
  -- Run now, deliberately BEFORE Test 4b creates a job referencing
  -- `decision_a_id` below — Test 5b's delete attempt must be the only
  -- thing standing between `decision_a_id` and removal, or a real
  -- unsafe-delete-grant bug could be masked by an unrelated foreign-key
  -- error from a referencing job (the exact confound Codex found in this
  -- script's first version — see this file's header comment).
  err_caught := false;
  begin
    update public.decisions set outcome = 'accepted' where id = decision_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 5a: User A cannot update their own decisions row (no update grant, by design).');
  else
    insert into validation_results (line) values ('FAIL — Test 5a: User A updated a decisions row. Expected no update grant to exist.');
  end if;

  err_caught := false;
  begin
    delete from public.decisions where id = decision_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 5b: User A cannot delete their own, currently-unreferenced decisions row (no delete grant, by design).');
  else
    insert into validation_results (line) values ('FAIL — Test 5b: User A deleted a decisions row. Expected no delete grant to exist.');
  end if;

  -- ---------------------------------------------------------------------
  -- TEST 4b (positive control): User A CAN insert a real job for their
  -- OWN farm, referencing their own decision. If Test 5b just found a
  -- real delete-grant bug and `decision_a_id` no longer exists, this
  -- insert will itself fail with an uncaught foreign-key error and abort
  -- the whole script here — a loud, correct failure mode (the FAIL line
  -- above already told you why), not a silent one.
  -- ---------------------------------------------------------------------
  insert into public.jobs (farm_id, decision_id, job_type, status)
  values (farm_a.farm_id, decision_a_id, 'validation_probe', 'dismissed')
  returning id into job_a_id;
  insert into validation_results (line) values ('PASS — Test 4b: User A successfully inserted a jobs row for their own Farm A, referencing their own decision (positive control).');

  -- TEST 3b (now unconfounded): User A cannot insert a jobs row with
  -- farm_id = Farm B while referencing their own, real Farm-A decision
  -- (decision_a_id genuinely exists, so this can only be rejected by RLS
  -- and/or the jobs_check_same_farm trigger, never by a missing-FK
  -- accident).
  err_caught := false;
  begin
    insert into public.jobs (farm_id, decision_id, job_type, status)
    values (farm_b.farm_id, decision_a_id, 'validation_probe', 'dismissed');
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 3b: User A cannot insert a jobs row against Farm B, even referencing their own real Farm-A decision (rejected).');
  else
    insert into validation_results (line) values ('FAIL — Test 3b: User A inserted a jobs row against Farm B. REAL CROSS-FARM WRITE.');
  end if;

  -- TEST 3c (negative, exercises jobs_check_same_farm's own
  -- cross-reference logic specifically — not just RLS's farm_id check):
  -- User A inserts a job against their OWN Farm A (passes RLS's `with
  -- check` on farm_id) but references Farm B's decision
  -- (`decision_b_id`, created in setup above). Only the
  -- `jobs_check_same_farm` trigger's own `assert_decision_belongs_to_farm`
  -- call can reject this — RLS alone has nothing to say about it, since
  -- farm_id is legitimately User A's own.
  err_caught := false;
  begin
    insert into public.jobs (farm_id, decision_id, job_type, status)
    values (farm_a.farm_id, decision_b_id, 'validation_probe', 'dismissed');
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 3c: User A cannot insert a jobs row for their own Farm A that references Farm B''s decision (rejected by jobs_check_same_farm).');
  else
    insert into validation_results (line) values ('FAIL — Test 3c: User A inserted a jobs row for Farm A referencing Farm B''s decision. REAL CROSS-FARM REFERENCE.');
  end if;

  -- TEST 3d (negative, exercises decisions_check_field_same_farm's own
  -- cross-reference logic — same shape as Test 3c, for decisions/field_id
  -- instead of jobs/decision_id). Only runs if Farm B has a real,
  -- existing field (see this file's own header comment on why this
  -- script does not fabricate one).
  if field_b_id is null then
    insert into validation_results (line) values ('SKIP — Test 3d: Farm B has no existing field in this project, so this check could not run. Not a PASS — re-run after Farm B has at least one field if you need this specific check confirmed.');
  else
    err_caught := false;
    begin
      insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at, field_id)
      values (gen_random_uuid(), farm_a.farm_id, gen_random_uuid(), 'validation_probe',
              '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now(), field_b_id);
    exception when others then
      err_caught := true;
    end;
    if err_caught then
      insert into validation_results (line) values ('PASS — Test 3d: User A cannot insert a decisions row for their own Farm A that references Farm B''s field (rejected by decisions_check_field_same_farm).');
    else
      insert into validation_results (line) values ('FAIL — Test 3d: User A inserted a decisions row for Farm A referencing Farm B''s field. REAL CROSS-FARM REFERENCE.');
    end if;
  end if;

  -- TEST 6a/6b (negative): User A cannot update or delete their own
  -- job's row either (defence in depth — jobs has no update or delete
  -- grant to any authenticated user at all right now, own farm or not).
  err_caught := false;
  begin
    update public.jobs set status = 'proposed' where id = job_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 6a: User A cannot update their own jobs row status (no update grant, by design).');
  else
    insert into validation_results (line) values ('FAIL — Test 6a: User A updated a jobs row. Expected no update grant to exist.');
  end if;

  err_caught := false;
  begin
    delete from public.jobs where id = job_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 6b: User A cannot delete their own jobs row (no delete grant, by design).');
  else
    insert into validation_results (line) values ('FAIL — Test 6b: User A deleted a jobs row. Expected no delete grant to exist.');
  end if;

  -- ---------------------------------------------------------------------
  -- TEST 9a-9d (Phase A, 2026-09-02): exercise
  -- `20260829020000_jobs_weight_observation_reference.sql`'s own two
  -- CHECK constraints and its extension of `jobs_check_same_farm` — that
  -- migration's own status comment named these as still needing real
  -- confirmation, and no version of this script had ever touched them.
  -- Each sub-test gets its own fresh decision — `jobs.decision_id` is
  -- unique (`jobs_decision_id_unique`), and `decision_a_id` already has
  -- a real job attached to it (Test 4b, still present — Test 6b's own
  -- delete attempt was expected to, and did, fail).
  -- ---------------------------------------------------------------------
  decision_a2_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_a2_id, farm_a.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());
  decision_a3_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_a3_id, farm_a.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());
  decision_a4_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_a4_id, farm_a.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());
  decision_a5_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_a5_id, farm_a.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());

  -- TEST 9a (CHECK jobs_confirmed_weight_observation_requires_reference):
  -- a `record_weight_observation` job cannot be inserted as `confirmed`
  -- with `weight_observation_id = null`.
  err_caught := false;
  begin
    insert into public.jobs (farm_id, decision_id, job_type, status, weight_observation_id)
    values (farm_a.farm_id, decision_a2_id, 'record_weight_observation', 'confirmed', null);
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 9a: a confirmed record_weight_observation job cannot be inserted with no weight_observation_id (rejected by jobs_confirmed_weight_observation_requires_reference).');
  else
    insert into validation_results (line) values ('FAIL — Test 9a: a confirmed record_weight_observation job was inserted with no weight_observation_id. REAL PROVENANCE-INTEGRITY BUG.');
  end if;

  -- TEST 9b (CHECK jobs_weight_observation_id_matches_job_type): a real,
  -- own-farm weight_observation_id cannot be set on any job type other
  -- than record_weight_observation — this is a pure type-mismatch check,
  -- not a cross-farm one (weight_obs_a_id genuinely belongs to Farm A).
  err_caught := false;
  begin
    insert into public.jobs (farm_id, decision_id, job_type, status, weight_observation_id)
    values (farm_a.farm_id, decision_a3_id, 'validation_probe', 'proposed', weight_obs_a_id);
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 9b: a non-record_weight_observation job cannot carry a weight_observation_id, even a real own-farm one (rejected by jobs_weight_observation_id_matches_job_type).');
  else
    insert into validation_results (line) values ('FAIL — Test 9b: a validation_probe job was inserted with a real weight_observation_id set. REAL DATA-INTEGRITY BUG.');
  end if;

  -- TEST 9c (positive control): the legitimate shape — own-farm
  -- weight_observation_id, job_type=record_weight_observation,
  -- status=confirmed — succeeds. Proves 9a/9b aren't blocking everything.
  begin
    insert into public.jobs (farm_id, decision_id, job_type, status, weight_observation_id)
    values (farm_a.farm_id, decision_a4_id, 'record_weight_observation', 'confirmed', weight_obs_a_id);
    insert into validation_results (line) values ('PASS — Test 9c: a confirmed record_weight_observation job with its own farm''s real weight_observation_id inserts successfully (positive control).');
  exception when others then
    insert into validation_results (line) values ('FAIL — Test 9c: the legitimate record_weight_observation shape was rejected. Expected success.');
  end;

  -- TEST 9d (cross-farm, exercises assert_weight_observation_belongs_to_farm
  -- via the extended jobs_check_same_farm trigger): User A's own Farm A
  -- job cannot reference Farm B's real weight_observation_id, even though
  -- every other field on the row is otherwise valid.
  err_caught := false;
  begin
    insert into public.jobs (farm_id, decision_id, job_type, status, weight_observation_id)
    values (farm_a.farm_id, decision_a5_id, 'record_weight_observation', 'confirmed', weight_obs_b_id);
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 9d: User A cannot insert a job for their own Farm A that references Farm B''s real weight_observation_id (rejected by jobs_check_same_farm''s assert_weight_observation_belongs_to_farm check).');
  else
    insert into validation_results (line) values ('FAIL — Test 9d: User A inserted a job for Farm A referencing Farm B''s weight_observation_id. REAL CROSS-FARM REFERENCE.');
  end if;

  -- ---------------------------------------------------------------------
  -- Switch to User B's simulated session, confirm the mirror image: User
  -- B cannot see or touch what User A just (successfully) created for
  -- Farm A above, still inside the same open transaction.
  -- ---------------------------------------------------------------------
  execute format('set local request.jwt.claims = %L', json_build_object('sub', farm_b.user_id, 'role', 'authenticated')::text);

  if exists (select 1 from public.decisions where id = decision_a_id) then
    insert into validation_results (line) values ('FAIL — Test 7a: User B can see the decisions row User A just created for Farm A. REAL CROSS-FARM LEAK.');
  else
    insert into validation_results (line) values ('PASS — Test 7a: User B cannot see the decisions row User A created for Farm A.');
  end if;
  if exists (select 1 from public.jobs where id = job_a_id) then
    insert into validation_results (line) values ('FAIL — Test 7b: User B can see the jobs row User A just created for Farm A. REAL CROSS-FARM LEAK.');
  else
    insert into validation_results (line) values ('PASS — Test 7b: User B cannot see the jobs row User A created for Farm A.');
  end if;

  -- ---------------------------------------------------------------------
  -- TEST 8 (negative): a completely unauthenticated request (the `anon`
  -- role, no session/claims at all) has zero access to either table —
  -- `revoke all on public.decisions, public.jobs from anon`
  -- (20260829000000_orchestration_foundation.sql).
  --
  -- Codex audit round 2 (docs/farm-return-next/audit-logs/
  -- 20260901T133149Z.md, both MEDIUM, fixed here) found two real gaps
  -- in this test's first version:
  -- 1. Switching role to `anon` does not clear `request.jwt.claims` —
  --    User B's claims (set two blocks above) were still in the session
  --    when this test ran, so it wasn't actually testing "no session at
  --    all" the way its own text claimed. Fixed with `reset
  --    request.jwt.claims` right after the role switch.
  -- 2. The insert sub-tests (8b/8d) treated any raised error as proof of
  --    "no grant" — but an `insert` also runs RLS's own `with check`
  --    clause, which would raise an error of its own even if `anon` had
  --    accidentally been granted table-level `insert` (RLS still has no
  --    matching policy for a claims-less anon request). That would let
  --    a real accidental-grant bug hide behind an RLS error and still
  --    report PASS. Fixed by checking the grant directly with
  --    `has_table_privilege` first — a real, unambiguous fact
  --    independent of what RLS would separately decide — and treating
  --    the behavioural insert attempt as a secondary, defence-in-depth
  --    confirmation rather than the sole basis for PASS/FAIL.
  -- ---------------------------------------------------------------------
  set local role anon;
  reset request.jwt.claims;

  -- `has_table_privilege`'s comma-separated privilege-list form returns
  -- true if ANY of the listed privileges is held at the table level.
  -- `TRUNCATE` and `TRIGGER` are table-level-only privileges with no
  -- per-column variant; there is no `MAINTAIN` in this Postgres major
  -- version's privilege set to also check. But `SELECT`/`INSERT`/
  -- `UPDATE`/`REFERENCES` can ALSO be granted per-column (this schema
  -- has actually discussed doing exactly that elsewhere —
  -- `20260829010000_decisions_jobs_client_access.sql`'s own header
  -- comment considered, then rejected, `grant update (status) on
  -- public.jobs to authenticated` — so this is not a purely theoretical
  -- gap in this codebase) — `has_table_privilege` alone would not catch
  -- a column-scoped grant of one of those four. `has_any_column_privilege`
  -- checks that separately; both must be clear for the "zero privileges"
  -- claim to actually hold.
  if has_table_privilege('anon', 'public.decisions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege('anon', 'public.decisions', 'SELECT,INSERT,UPDATE,REFERENCES') then
    insert into validation_results (line) values ('FAIL — Test 8a: anon role has SOME real privilege (table- or column-level) on decisions. Expected none (revoke all ... from anon).');
  else
    insert into validation_results (line) values ('PASS — Test 8a: anon role has zero table- and column-level privileges on decisions (has_table_privilege + has_any_column_privilege both confirm).');
  end if;

  if has_table_privilege('anon', 'public.decisions', 'INSERT') then
    insert into validation_results (line) values ('FAIL — Test 8b: anon role has a real INSERT grant on decisions. Expected none (revoke all ... from anon).');
  else
    insert into validation_results (line) values ('PASS — Test 8b: anon role has no INSERT grant on decisions (has_table_privilege confirms).');
  end if;

  if has_table_privilege('anon', 'public.jobs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege('anon', 'public.jobs', 'SELECT,INSERT,UPDATE,REFERENCES') then
    insert into validation_results (line) values ('FAIL — Test 8c: anon role has SOME real privilege (table- or column-level) on jobs. Expected none (revoke all ... from anon).');
  else
    insert into validation_results (line) values ('PASS — Test 8c: anon role has zero table- and column-level privileges on jobs (has_table_privilege + has_any_column_privilege both confirm).');
  end if;

  if has_table_privilege('anon', 'public.jobs', 'INSERT') then
    insert into validation_results (line) values ('FAIL — Test 8d: anon role has a real INSERT grant on jobs. Expected none (revoke all ... from anon).');
  else
    insert into validation_results (line) values ('PASS — Test 8d: anon role has no INSERT grant on jobs (has_table_privilege confirms).');
  end if;

  -- Behavioural confirmation (defence in depth, not the sole basis for
  -- the PASS/FAIL above): the actual queries should still fail too,
  -- whether from the missing grant directly or (if that were somehow
  -- absent) from RLS having no anon-reachable policy either way.
  err_caught := false;
  begin
    perform 1 from public.decisions where farm_id = farm_a.farm_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 8e: anonymous select on decisions raises an error in practice, as expected.');
  else
    insert into validation_results (line) values ('FAIL — Test 8e: anonymous select on decisions returned without error. Expected rejection.');
  end if;

  err_caught := false;
  begin
    insert into public.jobs (farm_id, decision_id, job_type, status)
    values (farm_a.farm_id, decision_a_id, 'validation_probe', 'dismissed');
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values ('PASS — Test 8f: anonymous insert on jobs raises an error in practice, as expected.');
  else
    insert into validation_results (line) values ('FAIL — Test 8f: anonymous insert on jobs succeeded without error. Expected rejection.');
  end if;

  -- Restore the original (superuser) role before this block ends — the
  -- final SELECT below runs outside this do-block but inside the same
  -- transaction, and `validation_results` (a session-temporary table)
  -- was created by, and is only really guaranteed readable as, the role
  -- this script actually started as. Same reasoning as
  -- `job_sessions_actuals_validation.sql`'s own equivalent comment.
  reset role;

  insert into validation_results (line) values ('--- All tests ran. Read every PASS/FAIL/SKIP line above (ordered by seq). The final ROLLBACK discards every write this script made (including this script''s own setup step, the Farm-B decision it created) — nothing persists. ---');
end $$;

select seq, line from validation_results order by seq;

-- Unconditional — discards every insert this script made (Tests
-- 3a/3b/3c/3d/8f's rejected attempts insert nothing anyway; the setup
-- step's Farm-B decision and Tests 4a/4b's successful Farm-A inserts
-- are what this undoes). Never a COMMIT.
rollback;
