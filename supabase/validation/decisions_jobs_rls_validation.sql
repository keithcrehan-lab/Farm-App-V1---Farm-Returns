-- Farm Return Next — live RLS validation for `decisions`/`jobs`
-- (User A / User B cross-tenant isolation), per the architectural
-- security review's rule 8 ("prove that User A cannot read, insert,
-- update or associate a Decision/Job belonging to User B or a farm they
-- do not have authorised access to").
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor (a service-role/postgres
-- connection — required so this script can `SET LOCAL ROLE authenticated`
-- and impersonate two different real users' `auth.uid()` in turn, the
-- same technique Supabase's own docs recommend for testing RLS without
-- a real second login: https://supabase.com/docs/guides/database/postgres/row-level-security#testing-policies).
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
-- precondition fails), the transaction aborts on its own and nothing
-- persists either way.
--
-- PREREQUISITE: at least two farms, owned by two different real
-- `auth.users` accounts, must exist in this project already (any two
-- real accounts you've signed up with count — they don't need any
-- existing decisions/jobs).
--
-- Reads its own PASS/FAIL results back via RAISE NOTICE — watch the
-- "Results"/log/messages pane, not a returned table. A single "FAIL"
-- line anywhere means a real, live security gap — stop and investigate
-- before treating anything as validated.

begin;

do $$
declare
  farm_a record;
  farm_b record;
  decision_a_id uuid;
  job_a_id uuid;
  err_caught boolean;
begin
  -- ---------------------------------------------------------------------
  -- Setup: two real, distinct, already-existing farms (different owners).
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
  -- silently — this is the correct RLS behaviour, not an error).
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

  -- TEST 3 (negative, the exact scenario rule 3 named): User A cannot
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
    raise notice 'PASS — Test 3: User A cannot insert a decisions row against Farm B (rejected).';
  else
    raise notice 'FAIL — Test 3: User A inserted a decisions row against Farm B. REAL CROSS-FARM WRITE.';
  end if;

  -- Test 3b (jobs, farm_id=Farm B) is deliberately deferred to right
  -- after Test 4 creates a real `decision_a_id` — a jobs insert with a
  -- non-existent `decision_id` would fail on the `not null references
  -- decisions(id)` foreign key alone, which would "pass" this test even
  -- if RLS enforced nothing at all. Using a real, existing decision
  -- instead makes this a clean, unconfounded test of RLS/the same-farm
  -- trigger specifically, not an accidental FK check.

  -- ---------------------------------------------------------------------
  -- TEST 4 (positive control): User A CAN insert a real decision/job for
  -- their OWN farm — proves grants/RLS aren't just blocking everything.
  -- ---------------------------------------------------------------------
  decision_a_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_a_id, farm_a.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":null,"evidenceState":"MEASURED"}'::jsonb, 'dismissed', 'farmer', now());
  raise notice 'PASS — Test 4a: User A successfully inserted a decisions row for their own Farm A (positive control).';

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

  -- TEST 5 (negative): no update/delete grant on decisions at all.
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
    raise notice 'PASS — Test 5b: User A cannot delete their own decisions row (no delete grant, by design).';
  else
    raise notice 'FAIL — Test 5b: User A deleted a decisions row. Expected no delete grant to exist.';
  end if;

  -- TEST 6 (negative): User A cannot update their own job's status either
  -- (defence in depth — jobs has no update grant to any authenticated
  -- user at all right now, own farm or not).
  err_caught := false;
  begin
    update public.jobs set status = 'proposed' where id = job_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    raise notice 'PASS — Test 6: User A cannot update their own jobs row status (no update grant, by design).';
  else
    raise notice 'FAIL — Test 6: User A updated a jobs row. Expected no update grant to exist.';
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

  raise notice '--- All tests ran. Read every PASS/FAIL line above. The final ROLLBACK statement (outside this block) discards every write this script made — nothing persists. ---';
end $$;

-- Unconditional — discards every insert this script made (Tests 3/3b's
-- rejected attempts insert nothing anyway; Tests 4a/4b's successful
-- inserts are what this undoes). Never a COMMIT.
rollback;
