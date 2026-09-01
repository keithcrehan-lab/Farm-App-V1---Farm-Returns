-- Farm Return Next — live RLS validation for `decisions`/`jobs`
-- (User A / User B cross-tenant isolation), per the architectural
-- security review's rule 8 ("prove that User A cannot read, insert,
-- update or associate a Decision/Job belonging to User B or a farm they
-- do not have authorised access to").
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor (a service-role/postgres
-- connection — required so this script can `SET LOCAL ROLE authenticated`
-- / `anon` and impersonate two different real users' `auth.uid()` in
-- turn, the same technique Supabase's own docs recommend for testing RLS
-- without a real second login: https://supabase.com/docs/guides/database/postgres/row-level-security#testing-policies).
-- `psql`/`supabase db query` as the `postgres` role also works. Run the
-- whole file as one script/paste — the leading `BEGIN` and trailing
-- `ROLLBACK` must execute in the same session as everything between
-- them.
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
-- Reads its own PASS/FAIL/SKIP results back via RAISE NOTICE — watch the
-- "Results"/log/messages pane, not a returned table. A single "FAIL"
-- line anywhere means a real, live security gap — stop and investigate
-- before treating anything as validated. A SKIP line means that one
-- check could not run in this project as-is (see its own notice text for
-- why) — it is not a PASS and should not be read as one.
--
-- Codex audit (2026-09-01, docs/farm-return-next/audit-logs/
-- 20260901T132443Z.md) found this script's first version had two real
-- gaps, both fixed in this version:
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

begin;

do $$
declare
  farm_a record;
  farm_b record;
  decision_a_id uuid;
  decision_b_id uuid;
  job_a_id uuid;
  field_b_id uuid;
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

  select f.id as farm_id, f.user_id, f.name into farm_b
  from public.farms f
  where f.user_id <> farm_a.user_id
  order by f.created_at asc
  limit 1;

  if farm_a.farm_id is null or farm_b.farm_id is null then
    raise exception 'VALIDATION ABORTED: need at least two farms owned by two different users in this project to run this script. Found farm_a=%, farm_b=%', farm_a.farm_id, farm_b.farm_id;
  end if;

  raise notice '--- Farm A: id=% owner=% name=% ---', farm_a.farm_id, farm_a.user_id, farm_a.name;
  raise notice '--- Farm B: id=% owner=% name=% ---', farm_b.farm_id, farm_b.user_id, farm_b.name;

  decision_b_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_b_id, farm_b.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());
  raise notice '--- Setup: created a real decisions row on Farm B (id=%) for Test 3c to reference. ---', decision_b_id;

  select fl.id into field_b_id
  from public.fields fl
  where fl.farm_id = farm_b.farm_id
  order by fl.created_at asc
  limit 1;
  if field_b_id is null then
    raise notice '--- Setup: Farm B has no existing field — Test 3d will be SKIPPED (see its own notice). ---';
  else
    raise notice '--- Setup: Farm B has an existing field (id=%) for Test 3d to reference. ---', field_b_id;
  end if;

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
  raise notice 'PASS — Test 1: User A can select decisions/jobs scoped to their own farm (no error).';

  -- TEST 2 (negative, the core isolation check): User A selecting
  -- Farm B's decisions/jobs must return zero rows (RLS filters them out
  -- silently — this is the correct RLS behaviour, not an error). Note
  -- this also implicitly proves User A cannot see the Farm-B decision
  -- this script's own setup step just created above.
  if exists (select 1 from public.decisions where farm_id = farm_b.farm_id) then
    raise notice 'FAIL — Test 2a: User A can see a decisions row belonging to Farm B. REAL CROSS-FARM LEAK.';
  else
    raise notice 'PASS — Test 2a: User A sees zero decisions rows for Farm B.';
  end if;
  if exists (select 1 from public.jobs where farm_id = farm_b.farm_id) then
    raise notice 'FAIL — Test 2b: User A can see a jobs row belonging to Farm B. REAL CROSS-FARM LEAK.';
  else
    raise notice 'PASS — Test 2b: User A sees zero jobs rows for Farm B.';
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
    raise notice 'PASS — Test 3a: User A cannot insert a decisions row against Farm B (rejected).';
  else
    raise notice 'FAIL — Test 3a: User A inserted a decisions row against Farm B. REAL CROSS-FARM WRITE.';
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
  raise notice 'PASS — Test 4a: User A successfully inserted a decisions row for their own Farm A (positive control).';

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
    raise notice 'PASS — Test 5a: User A cannot update their own decisions row (no update grant, by design).';
  else
    raise notice 'FAIL — Test 5a: User A updated a decisions row. Expected no update grant to exist.';
  end if;

  err_caught := false;
  begin
    delete from public.decisions where id = decision_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    raise notice 'PASS — Test 5b: User A cannot delete their own, currently-unreferenced decisions row (no delete grant, by design).';
  else
    raise notice 'FAIL — Test 5b: User A deleted a decisions row. Expected no delete grant to exist.';
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
  raise notice 'PASS — Test 4b: User A successfully inserted a jobs row for their own Farm A, referencing their own decision (positive control).';

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
    raise notice 'PASS — Test 3b: User A cannot insert a jobs row against Farm B, even referencing their own real Farm-A decision (rejected).';
  else
    raise notice 'FAIL — Test 3b: User A inserted a jobs row against Farm B. REAL CROSS-FARM WRITE.';
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
    raise notice 'PASS — Test 3c: User A cannot insert a jobs row for their own Farm A that references Farm B''s decision (rejected by jobs_check_same_farm).';
  else
    raise notice 'FAIL — Test 3c: User A inserted a jobs row for Farm A referencing Farm B''s decision. REAL CROSS-FARM REFERENCE.';
  end if;

  -- TEST 3d (negative, exercises decisions_check_field_same_farm's own
  -- cross-reference logic — same shape as Test 3c, for decisions/field_id
  -- instead of jobs/decision_id). Only runs if Farm B has a real,
  -- existing field (see this file's own header comment on why this
  -- script does not fabricate one).
  if field_b_id is null then
    raise notice 'SKIP — Test 3d: Farm B has no existing field in this project, so this check could not run. Not a PASS — re-run after Farm B has at least one field if you need this specific check confirmed.';
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
      raise notice 'PASS — Test 3d: User A cannot insert a decisions row for their own Farm A that references Farm B''s field (rejected by decisions_check_field_same_farm).';
    else
      raise notice 'FAIL — Test 3d: User A inserted a decisions row for Farm A referencing Farm B''s field. REAL CROSS-FARM REFERENCE.';
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
    raise notice 'PASS — Test 6a: User A cannot update their own jobs row status (no update grant, by design).';
  else
    raise notice 'FAIL — Test 6a: User A updated a jobs row. Expected no update grant to exist.';
  end if;

  err_caught := false;
  begin
    delete from public.jobs where id = job_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    raise notice 'PASS — Test 6b: User A cannot delete their own jobs row (no delete grant, by design).';
  else
    raise notice 'FAIL — Test 6b: User A deleted a jobs row. Expected no delete grant to exist.';
  end if;

  -- ---------------------------------------------------------------------
  -- Switch to User B's simulated session, confirm the mirror image: User
  -- B cannot see or touch what User A just (successfully) created for
  -- Farm A above, still inside the same open transaction.
  -- ---------------------------------------------------------------------
  execute format('set local request.jwt.claims = %L', json_build_object('sub', farm_b.user_id, 'role', 'authenticated')::text);

  if exists (select 1 from public.decisions where id = decision_a_id) then
    raise notice 'FAIL — Test 7a: User B can see the decisions row User A just created for Farm A. REAL CROSS-FARM LEAK.';
  else
    raise notice 'PASS — Test 7a: User B cannot see the decisions row User A created for Farm A.';
  end if;
  if exists (select 1 from public.jobs where id = job_a_id) then
    raise notice 'FAIL — Test 7b: User B can see the jobs row User A just created for Farm A. REAL CROSS-FARM LEAK.';
  else
    raise notice 'PASS — Test 7b: User B cannot see the jobs row User A created for Farm A.';
  end if;

  -- ---------------------------------------------------------------------
  -- TEST 8a/8b (negative): a completely unauthenticated request (the
  -- `anon` role, no session/claims at all) has zero access to either
  -- table — `revoke all on public.decisions, public.jobs from anon`
  -- (20260829000000_orchestration_foundation.sql). This is a stronger
  -- claim than RLS returning zero rows: with no grant at all, Postgres
  -- denies the query outright (`permission denied for table ...`)
  -- before RLS is even evaluated.
  -- ---------------------------------------------------------------------
  set local role anon;

  err_caught := false;
  begin
    perform 1 from public.decisions where farm_id = farm_a.farm_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    raise notice 'PASS — Test 8a: anonymous (no session) select on decisions is rejected (no grant to anon).';
  else
    raise notice 'FAIL — Test 8a: anonymous select on decisions succeeded. Expected no grant to anon at all.';
  end if;

  err_caught := false;
  begin
    insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
    values (gen_random_uuid(), farm_a.farm_id, gen_random_uuid(), 'validation_probe',
            '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    raise notice 'PASS — Test 8b: anonymous (no session) insert on decisions is rejected (no grant to anon).';
  else
    raise notice 'FAIL — Test 8b: anonymous insert on decisions succeeded. Expected no grant to anon at all.';
  end if;

  err_caught := false;
  begin
    perform 1 from public.jobs where farm_id = farm_a.farm_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    raise notice 'PASS — Test 8c: anonymous (no session) select on jobs is rejected (no grant to anon).';
  else
    raise notice 'FAIL — Test 8c: anonymous select on jobs succeeded. Expected no grant to anon at all.';
  end if;

  err_caught := false;
  begin
    insert into public.jobs (farm_id, decision_id, job_type, status)
    values (farm_a.farm_id, decision_a_id, 'validation_probe', 'dismissed');
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    raise notice 'PASS — Test 8d: anonymous (no session) insert on jobs is rejected (no grant to anon).';
  else
    raise notice 'FAIL — Test 8d: anonymous insert on jobs succeeded. Expected no grant to anon at all.';
  end if;

  raise notice '--- All tests ran. Read every PASS/FAIL/SKIP line above. The final ROLLBACK statement (outside this block) discards every write this script made (including this script''s own setup step, the Farm-B decision it created) — nothing persists. ---';
end $$;

-- Unconditional — discards every insert this script made (Tests
-- 3a/3b/3c/3d/8b/8d's rejected attempts insert nothing anyway; the
-- setup step's Farm-B decision and Tests 4a/4b's successful Farm-A
-- inserts are what this undoes). Never a COMMIT.
rollback;
