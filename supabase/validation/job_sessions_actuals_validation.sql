-- Farm Return Next — live Dev-database validation for the GPS Job
-- Session + Confirm Actual contract (`job_sessions`, `job_actuals`, the
-- `confirm_job_session_actual` atomic RPC). Same self-rolling-back
-- technique as `supabase/validation/decisions_jobs_rls_validation.sql`
-- (Supabase's own recommended way to test RLS as two different real
-- users without a second login:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#testing-policies).
--
-- HOW TO RUN: a service-role/postgres connection (`supabase db query -f
-- <this file> --linked --project-ref <ref>`, or the Dashboard SQL
-- Editor). Run the whole file as one script — the leading `begin` and
-- trailing `rollback` must execute in the same session as everything
-- between them.
--
-- WHAT IT DOES: uses two of the project's own already-existing real
-- farms (both with at least one real field and one real livestock
-- group) — no new accounts. The entire script runs inside one
-- transaction, explicitly ROLLED BACK at the end regardless of outcome —
-- nothing persists in `job_sessions`/`job_actuals`/`decisions` after
-- running this, and nothing existing is touched or deleted.
--
-- PREREQUISITE: at least two farms owned by two different users, each
-- with at least one real field and one real livestock group. If none of
-- your farms satisfy this, the script aborts with a clear message naming
-- what's missing rather than fabricating fixture data.
--
-- Reads its own PASS/FAIL/SKIP results back via a real SELECT at the end
-- (a temporary results table, not RAISE NOTICE — `supabase db query`'s
-- Management-API execution path does not stream NOTICE output back, only
-- final query results; confirmed empirically running this script's own
-- first version against `Farm Return V1 Dev`).

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
  field_a_id uuid;
  field_b_id uuid;
  group_a_id uuid;
  group_b_id uuid;
  decision_a_id uuid;
  decision_a_spare_id uuid;
  decision_b_id uuid;
  session_a_id uuid;
  session_a2_id uuid;
  session_b_id uuid;
  actual_a_id uuid;
  actual_b_id uuid;
  rpc_result record;
  err_caught boolean;
  session_status text;
  actual_count int;
  privs_actual text;
  cols_actual text;
  privs_count int;
  cols_total int;
begin
  -- -------------------------------------------------------------------
  -- Setup (as the superuser connection this script runs under — bypasses
  -- RLS, same posture the decisions/jobs validation script's own setup
  -- already relies on).
  -- -------------------------------------------------------------------
  select f.id as farm_id, f.user_id, f.name into farm_a
  from public.farms f
  where exists (select 1 from public.fields fl where fl.farm_id = f.id)
    and exists (select 1 from public.livestock_groups lg where lg.farm_id = f.id)
  order by f.created_at asc
  limit 1;

  select f.id as farm_id, f.user_id, f.name into farm_b
  from public.farms f
  where f.user_id <> farm_a.user_id
    and exists (select 1 from public.fields fl where fl.farm_id = f.id)
    and exists (select 1 from public.livestock_groups lg where lg.farm_id = f.id)
  order by f.created_at asc
  limit 1;

  if farm_a.farm_id is null or farm_b.farm_id is null then
    raise exception 'VALIDATION ABORTED: need two farms, owned by two different users, each with a real field and a real livestock group. Found farm_a=%, farm_b=%', farm_a.farm_id, farm_b.farm_id;
  end if;

  select id into field_a_id from public.fields where farm_id = farm_a.farm_id order by created_at asc limit 1;
  select id into field_b_id from public.fields where farm_id = farm_b.farm_id order by created_at asc limit 1;
  select id into group_a_id from public.livestock_groups where farm_id = farm_a.farm_id order by created_at asc limit 1;
  select id into group_b_id from public.livestock_groups where farm_id = farm_b.farm_id order by created_at asc limit 1;

  insert into validation_results (line) values (format('--- Farm A: id=%s owner=%s field=%s group=%s ---', farm_a.farm_id, farm_a.user_id, field_a_id, group_a_id));
  insert into validation_results (line) values (format('--- Farm B: id=%s owner=%s field=%s group=%s ---', farm_b.farm_id, farm_b.user_id, field_b_id, group_b_id));

  -- Real decisions to authorise each job_sessions row (decision_id is
  -- NOT NULL + unique — a fresh one per real session).
  decision_a_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_a_id, farm_a.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":{"manual":true},"evidenceState":"MEASURED"}'::jsonb, 'accepted', 'farmer', now());

  decision_a_spare_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_a_spare_id, farm_a.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":{"manual":true},"evidenceState":"MEASURED"}'::jsonb, 'accepted', 'farmer', now());

  decision_b_id := gen_random_uuid();
  insert into public.decisions (id, farm_id, prompt_id, calculation_kind, estimate_snapshot, outcome, decided_by, decided_at)
  values (decision_b_id, farm_b.farm_id, gen_random_uuid(), 'validation_probe',
          '{"status":"OK","value":{"manual":true},"evidenceState":"MEASURED"}'::jsonb, 'accepted', 'farmer', now());

  -- A real, pre-existing Farm-B session + confirmed Actual, walked
  -- through the real lifecycle (insert as 'active', not a direct
  -- 'completed_estimated' insert — job_sessions_valid_initial_status
  -- would reject that) — this is what Test 2/9 prove User A/an
  -- unauthenticated request cannot see.
  session_b_id := gen_random_uuid();
  insert into public.job_sessions (id, farm_id, decision_id, activity_type, origin, status, primary_field_id)
  values (session_b_id, farm_b.farm_id, decision_b_id, 'fertiliser_spreading', 'manual', 'active', field_b_id);
  update public.job_sessions set status = 'completed_estimated' where id = session_b_id;

  actual_b_id := gen_random_uuid();
  insert into public.job_actuals (id, farm_id, job_session_id, revision, supersedes_revision, activity_type, completion_type, payload, note, confirmed_by, confirmed_at)
  values (actual_b_id, farm_b.farm_id, session_b_id, 1, null, 'fertiliser_spreading', 'whole',
          jsonb_build_object('activityType', 'fertiliser_spreading', 'completionType', 'whole', 'fieldIds', jsonb_build_array(field_b_id::text), 'product', 'CAN', 'quantity', 100, 'quantityUnit', 'kg', 'areaHa', 5.2),
          null, 'farmer', now());
  update public.job_sessions set status = 'confirmed_actual' where id = session_b_id;
  insert into validation_results (line) values (format('--- Setup: Farm B has a real completed session_b (id=%s) with a confirmed actual_b (id=%s). ---', session_b_id, actual_b_id));

  -- -------------------------------------------------------------------
  -- Impersonate User A.
  -- -------------------------------------------------------------------
  set local role authenticated;
  execute format('set local request.jwt.claims = %L', json_build_object('sub', farm_a.user_id, 'role', 'authenticated')::text);

  -- TEST 1 (positive): User A can select their own (empty) job_sessions/
  -- job_actuals without error.
  perform 1 from public.job_sessions where farm_id = farm_a.farm_id;
  perform 1 from public.job_actuals where farm_id = farm_a.farm_id;
  insert into validation_results (line) values (format('PASS — Test 1: User A can select job_sessions/job_actuals scoped to their own farm (no error).'));

  -- TEST 2 (negative, core isolation): User A sees zero rows for Farm B,
  -- despite session_b/actual_b genuinely existing.
  if exists (select 1 from public.job_sessions where farm_id = farm_b.farm_id) then
    insert into validation_results (line) values (format('FAIL — Test 2a: User A can see a job_sessions row belonging to Farm B. REAL CROSS-FARM LEAK.'));
  else
    insert into validation_results (line) values (format('PASS — Test 2a: User A sees zero job_sessions rows for Farm B.'));
  end if;
  if exists (select 1 from public.job_actuals where farm_id = farm_b.farm_id) then
    insert into validation_results (line) values (format('FAIL — Test 2b: User A can see a job_actuals row belonging to Farm B. REAL CROSS-FARM LEAK.'));
  else
    insert into validation_results (line) values (format('PASS — Test 2b: User A sees zero job_actuals rows for Farm B.'));
  end if;
  if exists (select 1 from public.job_sessions where id = session_b_id) then
    insert into validation_results (line) values (format('FAIL — Test 2c: User A can select Farm B''s session_b directly by id. REAL CROSS-FARM LEAK.'));
  else
    insert into validation_results (line) values (format('PASS — Test 2c: User A cannot select Farm B''s session_b directly by id.'));
  end if;

  -- TEST 3a (positive control): User A inserts a real job_session for
  -- their own Farm A.
  session_a_id := gen_random_uuid();
  insert into public.job_sessions (id, farm_id, decision_id, activity_type, origin, status, primary_field_id)
  values (session_a_id, farm_a.farm_id, decision_a_id, 'fertiliser_spreading', 'manual', 'ready', field_a_id);
  insert into validation_results (line) values (format('PASS — Test 3a: User A successfully inserted a job_sessions row for their own Farm A (positive control, id=%s).', session_a_id));

  -- TEST 3b (negative): User A cannot insert a job_sessions row with
  -- farm_id = Farm B, even referencing Farm B's own real decision.
  err_caught := false;
  begin
    insert into public.job_sessions (id, farm_id, decision_id, activity_type, origin, status)
    values (gen_random_uuid(), farm_b.farm_id, decision_b_id, 'fertiliser_spreading', 'manual', 'ready');
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 3b: User A cannot insert a job_sessions row against Farm B (rejected).'));
  else
    insert into validation_results (line) values (format('FAIL — Test 3b: User A inserted a job_sessions row against Farm B. REAL CROSS-FARM WRITE.'));
  end if;

  -- TEST 3c (negative, exercises job_sessions_check_same_farm's own
  -- cross-reference logic — not just RLS's farm_id check): own farm_id,
  -- foreign decision_id.
  err_caught := false;
  begin
    insert into public.job_sessions (id, farm_id, decision_id, activity_type, origin, status)
    values (gen_random_uuid(), farm_a.farm_id, decision_b_id, 'fertiliser_spreading', 'manual', 'ready');
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 3c: User A cannot insert a job_sessions row for Farm A referencing Farm B''s decision (rejected by job_sessions_check_same_farm).'));
  else
    insert into validation_results (line) values (format('FAIL — Test 3c: User A inserted a job_sessions row for Farm A referencing Farm B''s decision. REAL CROSS-FARM REFERENCE.'));
  end if;

  -- TEST 3d (negative, same shape for primary_field_id): own farm_id,
  -- own (unused, spare) decision_id, foreign primary_field_id.
  err_caught := false;
  begin
    insert into public.job_sessions (id, farm_id, decision_id, activity_type, origin, status, primary_field_id)
    values (gen_random_uuid(), farm_a.farm_id, decision_a_spare_id, 'fertiliser_spreading', 'manual', 'ready', field_b_id);
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 3d: User A cannot insert a job_sessions row for Farm A referencing Farm B''s field as primary_field_id (rejected).'));
  else
    insert into validation_results (line) values (format('FAIL — Test 3d: User A inserted a job_sessions row for Farm A referencing Farm B''s field. REAL CROSS-FARM REFERENCE.'));
  end if;

  -- TEST 4 (lifecycle integrity, negative): an insert may only ever start
  -- as ready/active, never further.
  err_caught := false;
  begin
    insert into public.job_sessions (id, farm_id, decision_id, activity_type, origin, status)
    values (gen_random_uuid(), farm_a.farm_id, decision_a_spare_id, 'fertiliser_spreading', 'manual', 'completed_estimated');
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 4a: a new job_sessions row cannot be inserted directly as completed_estimated (rejected by job_sessions_check_valid_initial_status).'));
  else
    insert into validation_results (line) values (format('FAIL — Test 4a: a new job_sessions row was inserted directly as completed_estimated. Lifecycle bypass.'));
  end if;

  -- TEST 4b (negative): ready -> confirmed_actual directly (skipping the
  -- whole lifecycle) must be rejected.
  err_caught := false;
  begin
    update public.job_sessions set status = 'confirmed_actual' where id = session_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 4b: ready -> confirmed_actual directly is rejected (job_sessions_check_valid_transition).'));
  else
    insert into validation_results (line) values (format('FAIL — Test 4b: ready -> confirmed_actual succeeded directly. REAL LIFECYCLE BYPASS.'));
  end if;

  -- TEST 4c (negative): completed_estimated -> confirmed_actual with NO
  -- job_actuals row yet must be rejected, even via a raw update (not the
  -- RPC) — this is the exact gap round 1/2's own fix closed.
  update public.job_sessions set status = 'active' where id = session_a_id;
  update public.job_sessions set status = 'completed_estimated' where id = session_a_id;
  err_caught := false;
  begin
    update public.job_sessions set status = 'confirmed_actual' where id = session_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 4c: completed_estimated -> confirmed_actual is rejected with no job_actuals row backing it (job_sessions_check_valid_transition''s job_actuals existence check).'));
  else
    insert into validation_results (line) values (format('FAIL — Test 4c: session moved to confirmed_actual with no job_actuals row at all. REAL INTEGRITY BUG.'));
  end if;

  -- TEST 5a (informational, not a security PASS/FAIL in itself): a raw
  -- insert directly into job_actuals for one's own farm still succeeds —
  -- confirmed here deliberately, not assumed. `confirm_job_session_actual`
  -- is `SECURITY INVOKER` (20260902030000's own header comment explains
  -- why), so it needs, and keeps, the exact same `insert` grant a raw
  -- client insert already required — revoking it would break the RPC's
  -- own ability to write at all, not close this path (confirmed live by
  -- this phase's own first validation attempt, which is exactly how this
  -- was caught: 20260902030000/20260902040000's own header comments).
  -- This is the same already-disclosed, already-accepted "an
  -- authenticated client can act on their own farm's data via direct
  -- REST" systemic risk every table in this schema carries
  -- (BLOCKERS.md) — not a new or worse exposure, and not the atomicity
  -- guarantee this contract's own RPC exists to provide (which is
  -- unconditional for every real app-originated write).
  err_caught := false;
  begin
    insert into public.job_actuals (id, farm_id, job_session_id, revision, supersedes_revision, activity_type, completion_type, payload, confirmed_by, confirmed_at)
    values (gen_random_uuid(), farm_a.farm_id, session_a_id, 1, null, 'fertiliser_spreading', 'whole',
            jsonb_build_object('activityType', 'fertiliser_spreading', 'completionType', 'whole', 'fieldIds', jsonb_build_array(field_a_id::text), 'product', 'CAN', 'quantity', 50, 'quantityUnit', 'kg', 'areaHa', 0.62),
            'farmer', now());
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('INFO — Test 5a: a raw insert directly into job_actuals for one''s own farm was unexpectedly rejected — re-check the insert grant if this ever changes; the RPC needs it to function.'));
  else
    insert into validation_results (line) values (format('PASS (disclosed, accepted) — Test 5a: a raw insert directly into job_actuals for one''s own farm succeeds, as intended given confirm_job_session_actual''s own SECURITY INVOKER design — the same systemic, already-accepted risk every table in this schema carries, not a new gap.'));
  end if;

  -- TEST 5b (negative): the RPC rejects an activity_type mismatch.
  err_caught := false;
  begin
    select * into rpc_result from public.confirm_job_session_actual(
      gen_random_uuid(), farm_a.farm_id, session_a_id, 'livestock_work', 'whole',
      jsonb_build_object('activityType', 'livestock_work', 'completionType', 'whole', 'action', 'dosed'),
      null, 'farmer', now(), 1, null
    );
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 5b: confirm_job_session_actual rejects an activity_type that does not match the session''s real activity_type.'));
  else
    insert into validation_results (line) values (format('FAIL — Test 5b: confirm_job_session_actual accepted a mismatched activity_type. REAL INTEGRITY BUG.'));
  end if;

  -- TEST 5c (negative): the RPC rejects a fieldId belonging to Farm B.
  err_caught := false;
  begin
    select * into rpc_result from public.confirm_job_session_actual(
      gen_random_uuid(), farm_a.farm_id, session_a_id, 'fertiliser_spreading', 'whole',
      jsonb_build_object('activityType', 'fertiliser_spreading', 'completionType', 'whole', 'fieldIds', jsonb_build_array(field_b_id::text), 'product', 'CAN', 'quantity', 50, 'quantityUnit', 'kg', 'areaHa', 5.2),
      null, 'farmer', now(), 1, null
    );
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 5c: confirm_job_session_actual rejects a payload referencing Farm B''s field. REAL CROSS-FARM REFERENCE REJECTED.'));
  else
    insert into validation_results (line) values (format('FAIL — Test 5c: confirm_job_session_actual accepted a payload referencing Farm B''s field. REAL CROSS-FARM LEAK.'));
  end if;

  -- TEST 5d (negative): the RPC rejects Farm B's livestock group for a
  -- livestock_work activity (needs a fresh session since session_a is
  -- fertiliser_spreading — none of the rejected attempts above consumed
  -- decision_a_spare, so it's still available).
  session_a2_id := gen_random_uuid();
  insert into public.job_sessions (id, farm_id, decision_id, activity_type, origin, status)
  values (session_a2_id, farm_a.farm_id, decision_a_spare_id, 'livestock_work', 'manual', 'active');
  update public.job_sessions set status = 'completed_estimated' where id = session_a2_id;

  err_caught := false;
  begin
    select * into rpc_result from public.confirm_job_session_actual(
      gen_random_uuid(), farm_a.farm_id, session_a2_id, 'livestock_work', 'whole',
      jsonb_build_object('activityType', 'livestock_work', 'completionType', 'whole', 'livestockGroupId', group_b_id::text, 'action', 'dosed'),
      null, 'farmer', now(), 1, null
    );
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 5d: confirm_job_session_actual rejects a livestockGroupId belonging to Farm B. REAL CROSS-FARM REFERENCE REJECTED.'));
  else
    insert into validation_results (line) values (format('FAIL — Test 5d: confirm_job_session_actual accepted Farm B''s livestock group. REAL CROSS-FARM LEAK.'));
  end if;

  -- TEST 5e (negative): the RPC rejects a job_session_id belonging to
  -- Farm B outright (User A cannot even see session_b, let alone confirm
  -- an Actual against it).
  err_caught := false;
  begin
    select * into rpc_result from public.confirm_job_session_actual(
      gen_random_uuid(), farm_a.farm_id, session_b_id, 'fertiliser_spreading', 'whole',
      jsonb_build_object('activityType', 'fertiliser_spreading', 'completionType', 'whole', 'fieldIds', jsonb_build_array(field_a_id::text), 'product', 'CAN', 'quantity', 50, 'quantityUnit', 'kg', 'areaHa', 0.62),
      null, 'farmer', now(), 1, null
    );
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 5e: confirm_job_session_actual rejects a job_session_id belonging to Farm B outright.'));
  else
    insert into validation_results (line) values (format('FAIL — Test 5e: confirm_job_session_actual accepted Farm B''s job_session_id. REAL CROSS-FARM WRITE.'));
  end if;

  -- TEST 5f (negative): the RPC's own gapless-revision trigger still
  -- fires — revision 2 with no revision 1 existing yet for session_a2 is
  -- rejected.
  err_caught := false;
  begin
    select * into rpc_result from public.confirm_job_session_actual(
      gen_random_uuid(), farm_a.farm_id, session_a2_id, 'livestock_work', 'whole',
      jsonb_build_object('activityType', 'livestock_work', 'completionType', 'whole', 'livestockGroupId', group_a_id::text, 'action', 'dosed'),
      null, 'farmer', now(), 2, 1
    );
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 5f: confirm_job_session_actual rejects revision 2 with no revision 1 existing (job_actuals_valid_revision''s gapless check still fires through the RPC).'));
  else
    insert into validation_results (line) values (format('FAIL — Test 5f: confirm_job_session_actual accepted a gapped revision. REAL REVISION-INTEGRITY BUG.'));
  end if;

  -- TEST 6 (positive, the real atomic path): a genuinely valid confirm
  -- for session_a2 succeeds and moves the session to confirmed_actual in
  -- the same call.
  actual_a_id := gen_random_uuid();
  select * into rpc_result from public.confirm_job_session_actual(
    actual_a_id, farm_a.farm_id, session_a2_id, 'livestock_work', 'whole',
    jsonb_build_object('activityType', 'livestock_work', 'completionType', 'whole', 'livestockGroupId', group_a_id::text, 'action', 'dosed'),
    null, 'farmer', now(), 1, null
  );
  select status into session_status from public.job_sessions where id = session_a2_id;
  if rpc_result.id = actual_a_id and session_status = 'confirmed_actual' then
    insert into validation_results (line) values (format('PASS — Test 6: confirm_job_session_actual atomically inserted the real job_actuals row (id=%s) AND moved session_a2 to confirmed_actual in one call.', rpc_result.id));
  else
    insert into validation_results (line) values (format('FAIL — Test 6: atomic confirm did not produce the expected result (actual id=%s, session status=%s).', rpc_result.id, session_status));
  end if;

  -- TEST 7 (negative, round 3/4 fix): a session that already has a
  -- confirmed Actual cannot be cancelled.
  err_caught := false;
  begin
    update public.job_sessions set status = 'cancelled' where id = session_a2_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 7: a confirmed_actual session with a real job_actuals row cannot be cancelled (job_sessions_check_valid_transition''s round-3/4 fix).'));
  else
    insert into validation_results (line) values (format('FAIL — Test 7: a confirmed session with a real Actual was cancelled. REAL INTEGRITY BUG.'));
  end if;

  -- TEST 8 (idempotency, positive): calling the RPC again with the exact
  -- same client-generated id returns the same row, without creating a
  -- second one or erroring.
  select * into rpc_result from public.confirm_job_session_actual(
    actual_a_id, farm_a.farm_id, session_a2_id, 'livestock_work', 'whole',
    jsonb_build_object('activityType', 'livestock_work', 'completionType', 'whole', 'livestockGroupId', group_a_id::text, 'action', 'dosed'),
    null, 'farmer', now(), 1, null
  );
  select count(*) into actual_count from public.job_actuals where job_session_id = session_a2_id;
  if rpc_result.id = actual_a_id and actual_count = 1 then
    insert into validation_results (line) values (format('PASS — Test 8: retrying confirm_job_session_actual with the same client-generated id returns the same row (id=%s), exactly one row total — real offline retry-safety.', rpc_result.id));
  else
    insert into validation_results (line) values (format('FAIL — Test 8: retry produced %s rows for session_a2 (expected exactly 1). REAL DUPLICATE-REVISION BUG.', actual_count));
  end if;

  -- TEST 9 (append-only, negative): job_actuals has no update/delete
  -- grant at all — a real Actual, once made, cannot be altered or erased.
  -- Checks the real grant directly (`has_table_privilege`), not only
  -- whether an exception was raised — an UPDATE/DELETE with a real
  -- table-level grant but no matching RLS policy for that command would
  -- silently affect zero rows without ever raising an exception at all,
  -- which a purely exception-based check would misread as "PASS" for the
  -- wrong reason (the same confound
  -- `decisions_jobs_rls_validation.sql`'s own round-2 fix already
  -- documented and fixed once for `decisions`/`jobs`).
  if has_table_privilege('authenticated', 'public.job_actuals', 'UPDATE') then
    insert into validation_results (line) values (format('FAIL — Test 9a: authenticated has a real UPDATE grant on job_actuals. Expected none.'));
  else
    insert into validation_results (line) values (format('PASS — Test 9a: authenticated has no UPDATE grant on job_actuals (has_table_privilege confirms).'));
  end if;

  -- Behavioural confirmation, secondary to the grant check above: with
  -- the grant genuinely absent, this now correctly *raises*
  -- (permission denied) rather than silently affecting zero rows —
  -- caught the same way every other negative test in this script is.
  err_caught := false;
  begin
    update public.job_actuals set note = 'tampered' where id = actual_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught then
    insert into validation_results (line) values (format('PASS — Test 9a (behavioural): the update attempt was rejected outright.'));
  else
    insert into validation_results (line) values (format('FAIL — Test 9a (behavioural): the update did not raise. Re-check row content next.'));
  end if;
  if exists (select 1 from public.job_actuals where id = actual_a_id and note = 'tampered') then
    insert into validation_results (line) values (format('FAIL — Test 9a (content check): job_actuals.note now reads ''tampered''. REAL INTEGRITY BUG.'));
  else
    insert into validation_results (line) values (format('PASS — Test 9a (content check): job_actuals.note was not actually changed.'));
  end if;

  if has_table_privilege('authenticated', 'public.job_actuals', 'DELETE') then
    insert into validation_results (line) values (format('FAIL — Test 9b: authenticated has a real DELETE grant on job_actuals. Expected none.'));
  else
    insert into validation_results (line) values (format('PASS — Test 9b: authenticated has no DELETE grant on job_actuals (has_table_privilege confirms).'));
  end if;

  err_caught := false;
  begin
    delete from public.job_actuals where id = actual_a_id;
  exception when others then
    err_caught := true;
  end;
  if err_caught and exists (select 1 from public.job_actuals where id = actual_a_id) then
    insert into validation_results (line) values (format('PASS — Test 9b (behavioural): the delete attempt was rejected outright; the row still exists.'));
  else
    insert into validation_results (line) values (format('FAIL — Test 9b (behavioural): the delete was not both rejected and non-destructive. REAL INTEGRITY BUG.'));
  end if;

  -- -------------------------------------------------------------------
  -- Mirror check from User B's own session, inside the same open
  -- transaction: User B cannot see what User A just created for Farm A.
  -- -------------------------------------------------------------------
  execute format('set local request.jwt.claims = %L', json_build_object('sub', farm_b.user_id, 'role', 'authenticated')::text);

  if exists (select 1 from public.job_sessions where id in (session_a_id, session_a2_id)) then
    insert into validation_results (line) values (format('FAIL — Test 10a: User B can see a job_sessions row User A just created for Farm A. REAL CROSS-FARM LEAK.'));
  else
    insert into validation_results (line) values (format('PASS — Test 10a: User B cannot see Farm A''s job_sessions rows.'));
  end if;
  if exists (select 1 from public.job_actuals where id = actual_a_id) then
    insert into validation_results (line) values (format('FAIL — Test 10b: User B can see the job_actuals row User A just confirmed for Farm A. REAL CROSS-FARM LEAK.'));
  else
    insert into validation_results (line) values (format('PASS — Test 10b: User B cannot see Farm A''s job_actuals row.'));
  end if;

  -- -------------------------------------------------------------------
  -- TEST 11 (negative): a completely unauthenticated request (anon, no
  -- claims) has zero access to job_sessions/job_actuals or the RPC.
  -- -------------------------------------------------------------------
  set local role anon;
  reset request.jwt.claims;

  if has_table_privilege('anon', 'public.job_sessions', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege('anon', 'public.job_sessions', 'SELECT,INSERT,UPDATE,REFERENCES') then
    insert into validation_results (line) values (format('FAIL — Test 11a: anon role has SOME real privilege on job_sessions. Expected none.'));
  else
    insert into validation_results (line) values (format('PASS — Test 11a: anon role has zero privileges on job_sessions.'));
  end if;

  if has_table_privilege('anon', 'public.job_actuals', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege('anon', 'public.job_actuals', 'SELECT,INSERT,UPDATE,REFERENCES') then
    insert into validation_results (line) values (format('FAIL — Test 11b: anon role has SOME real privilege on job_actuals. Expected none.'));
  else
    insert into validation_results (line) values (format('PASS — Test 11b: anon role has zero privileges on job_actuals.'));
  end if;

  if has_function_privilege('anon', 'public.confirm_job_session_actual(uuid,uuid,uuid,text,text,jsonb,text,text,timestamptz,integer,integer)', 'EXECUTE') then
    insert into validation_results (line) values (format('FAIL — Test 11c: anon role can execute confirm_job_session_actual. Expected no grant.'));
  else
    insert into validation_results (line) values (format('PASS — Test 11c: anon role cannot execute confirm_job_session_actual.'));
  end if;

  -- -------------------------------------------------------------------
  -- TEST 12 (Codex audit HIGH round 1, then round 2's own further HIGH
  -- against round 1's first attempt): re-checks `authenticated`'s
  -- *exact* real grants directly against every table this session's own
  -- default-ACL fix touched. Round 1's own first version of this test
  -- only checked for the *absence* of a few named excess privileges
  -- (TRUNCATE/TRIGGER/REFERENCES) — round 2 correctly pointed out that
  -- is not the same as confirming the table's *entire* real grant
  -- matches its documented intent exactly: it would not have caught an
  -- accidental DELETE/blanket-UPDATE regression on job_sessions (whose
  -- own intended shape is select/insert plus a narrow *column-scoped*
  -- update only), nor a regression that accidentally *removed* an
  -- intended grant (select/insert missing entirely would break the app,
  -- silently, with the old version of this test still reporting PASS).
  -- Every check below instead builds the table's real, complete,
  -- table-level grant set via `string_agg` and asserts it against the
  -- exact expected string — genuinely no more and no less than
  -- intended — plus, for the two tables with a real column-scoped
  -- update (job_sessions, notifications), a real column-level check
  -- that the update grant is exactly the intended column set, not a
  -- broader one.
  --
  -- `reset role` first: `information_schema.role_table_grants`/
  -- `role_column_grants` are standard-conforming views that only show
  -- rows the *current* role is authorised to see (grantor, grantee, a
  -- role the current role is a member of, or grantable-to) — running
  -- this as `anon` (Test 11's own role, still active here) silently
  -- returns zero rows for every one of `authenticated`'s own grants,
  -- which is not the same thing as "no grant exists" and would make
  -- every check below a false FAIL. `has_table_privilege`/
  -- `has_any_column_privilege` (Test 8/9/11's own functions) do not have
  -- this restriction, which is exactly why they, not these views, are
  -- the right tool while impersonating a specific role — this test uses
  -- the views instead specifically to get the *complete* grant set for
  -- an exact-match comparison, so needs a role with real visibility.
  -- -------------------------------------------------------------------
  reset role;
  select string_agg(privilege_type, ',' order by privilege_type) into privs_actual
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'job_actuals' and grantee = 'authenticated';
  if privs_actual is distinct from 'INSERT,SELECT' then
    insert into validation_results (line) values (format('FAIL — Test 12a: authenticated''s real grant on job_actuals is "%s", expected exactly "INSERT,SELECT". REAL SECURITY BUG.', coalesce(privs_actual, '<none>')));
  else
    insert into validation_results (line) values (format('PASS — Test 12a: authenticated''s real grant on job_actuals is exactly INSERT,SELECT — no more, no less.'));
  end if;

  -- `information_schema.role_table_grants` only lists a *table-level*
  -- (all-columns) privilege — job_sessions' own UPDATE is entirely
  -- column-scoped (`grant update (status, ...) on job_sessions to
  -- authenticated`), so it correctly does not appear here at all; the
  -- real check that UPDATE is scoped to exactly the intended columns,
  -- not the whole row, is Test 12b2 below (`role_column_grants`).
  select string_agg(privilege_type, ',' order by privilege_type) into privs_actual
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'job_sessions' and grantee = 'authenticated';
  if privs_actual is distinct from 'INSERT,SELECT' then
    insert into validation_results (line) values (format('FAIL — Test 12b: authenticated''s real table-level grant on job_sessions is "%s", expected exactly "INSERT,SELECT" (job_sessions'' own UPDATE must be column-scoped only, never table-level — checked separately below). REAL SECURITY BUG.', coalesce(privs_actual, '<none>')));
  else
    insert into validation_results (line) values (format('PASS — Test 12b: authenticated''s real table-level grant on job_sessions is exactly INSERT,SELECT (no table-level UPDATE — its own real UPDATE is column-scoped only, checked next).'));
  end if;

  select string_agg(column_name, ',' order by column_name) into cols_actual
    from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'job_sessions' and grantee = 'authenticated' and privilege_type = 'UPDATE';
  if cols_actual is distinct from 'active_intervals,cancelled_reason,device_metadata,field_segments,interruption_gaps,primary_field_id,status' then
    insert into validation_results (line) values (format('FAIL — Test 12b2: authenticated''s real UPDATE-able columns on job_sessions are "%s", expected exactly the seven intended mutable columns (not farm_id/decision_id/activity_type/origin/created_at/id/updated_at). REAL SECURITY BUG.', coalesce(cols_actual, '<none>')));
  else
    insert into validation_results (line) values (format('PASS — Test 12b2: authenticated can UPDATE exactly the seven intended job_sessions columns, no others — farm_id/decision_id/activity_type/origin/created_at/id/updated_at all correctly excluded.'));
  end if;

  select string_agg(privilege_type, ',' order by privilege_type) into privs_actual
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'telemetry_events' and grantee = 'authenticated';
  if privs_actual is distinct from 'INSERT,SELECT' then
    insert into validation_results (line) values (format('FAIL — Test 12c: authenticated''s real grant on telemetry_events is "%s", expected exactly "INSERT,SELECT". REAL SECURITY BUG.', coalesce(privs_actual, '<none>')));
  else
    insert into validation_results (line) values (format('PASS — Test 12c: authenticated''s real grant on telemetry_events is exactly INSERT,SELECT.'));
  end if;

  -- Same reasoning as job_sessions above — notifications' own UPDATE is
  -- entirely column-scoped (`update (state)`), correctly absent from
  -- the table-level grant; Test 12d2 below checks the column itself.
  select string_agg(privilege_type, ',' order by privilege_type) into privs_actual
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'notifications' and grantee = 'authenticated';
  if privs_actual is distinct from 'INSERT,SELECT' then
    insert into validation_results (line) values (format('FAIL — Test 12d: authenticated''s real table-level grant on notifications is "%s", expected exactly "INSERT,SELECT" (notifications'' own UPDATE must be column-scoped only, never table-level — checked separately below). REAL SECURITY BUG.', coalesce(privs_actual, '<none>')));
  else
    insert into validation_results (line) values (format('PASS — Test 12d: authenticated''s real table-level grant on notifications is exactly INSERT,SELECT (no table-level UPDATE — its own real UPDATE is column-scoped only, checked next).'));
  end if;

  select string_agg(column_name, ',' order by column_name) into cols_actual
    from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'notifications' and grantee = 'authenticated' and privilege_type = 'UPDATE';
  if cols_actual is distinct from 'state' then
    insert into validation_results (line) values (format('FAIL — Test 12d2: authenticated''s real UPDATE-able columns on notifications are "%s", expected exactly "state". REAL SECURITY BUG.', coalesce(cols_actual, '<none>')));
  else
    insert into validation_results (line) values (format('PASS — Test 12d2: authenticated can UPDATE exactly notifications.state, no other column.'));
  end if;

  select string_agg(privilege_type, ',' order by privilege_type) into privs_actual
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'livestock_individuals' and grantee = 'authenticated';
  if privs_actual is distinct from 'DELETE,INSERT,SELECT,UPDATE' then
    insert into validation_results (line) values (format('FAIL — Test 12e1: authenticated''s real grant on livestock_individuals is "%s", expected exactly "DELETE,INSERT,SELECT,UPDATE" (full CRUD is the correct, intended V1 posture — only TRUNCATE/TRIGGER/REFERENCES must be absent). REAL SECURITY BUG.', coalesce(privs_actual, '<none>')));
  else
    insert into validation_results (line) values (format('PASS — Test 12e1: authenticated''s real grant on livestock_individuals is exactly DELETE,INSERT,SELECT,UPDATE.'));
  end if;

  select string_agg(privilege_type, ',' order by privilege_type) into privs_actual
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'livestock_weight_observations' and grantee = 'authenticated';
  if privs_actual is distinct from 'DELETE,INSERT,SELECT,UPDATE' then
    insert into validation_results (line) values (format('FAIL — Test 12e2: authenticated''s real grant on livestock_weight_observations is "%s", expected exactly "DELETE,INSERT,SELECT,UPDATE". REAL SECURITY BUG.', coalesce(privs_actual, '<none>')));
  else
    insert into validation_results (line) values (format('PASS — Test 12e2: authenticated''s real grant on livestock_weight_observations is exactly DELETE,INSERT,SELECT,UPDATE.'));
  end if;

  select string_agg(privilege_type, ',' order by privilege_type) into privs_actual
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'supplier_quotes' and grantee = 'authenticated';
  if privs_actual is distinct from 'DELETE,INSERT,SELECT,UPDATE' then
    insert into validation_results (line) values (format('FAIL — Test 12e3: authenticated''s real grant on supplier_quotes is "%s", expected exactly "DELETE,INSERT,SELECT,UPDATE". REAL SECURITY BUG.', coalesce(privs_actual, '<none>')));
  else
    insert into validation_results (line) values (format('PASS — Test 12e3: authenticated''s real grant on supplier_quotes is exactly DELETE,INSERT,SELECT,UPDATE.'));
  end if;

  -- TEST 12f (Codex audit HIGH, round 3 — corrected during this same
  -- round's own verification, not left broken): 12b2/12d2 above only
  -- checked job_sessions/notifications' own UPDATE columns specifically
  -- — they did not rule out an unexpected *partial* UPDATE grant hiding
  -- among the other five tables. A first version of this check compared
  -- the full column-grant surface against an "empty except
  -- job_sessions/notifications" expectation and failed on every run —
  -- a real bug in the *check*, not the schema: `information_schema.
  -- role_column_grants` reflects SELECT/INSERT privileges per column
  -- for every column whenever the underlying grant is table-level (this
  -- is documented, correct Postgres behaviour, not a leak — a
  -- table-level `grant select, insert` genuinely does apply to every
  -- column), so "zero column-grant rows" is never the correct
  -- expectation for a table with any real select/insert grant at all.
  -- The invariant that's actually meaningful, and what this corrected
  -- version checks: on the five tables whose own intent is either no
  -- UPDATE at all (job_actuals, telemetry_events) or full-row UPDATE
  -- (the three V1 tables' own real full CRUD), the number of columns
  -- carrying UPDATE must be exactly zero or exactly the table's own
  -- real, current total column count — never some in-between, narrower
  -- subset, which is what a stray/mistaken column-scoped UPDATE grant
  -- would actually look like.
  select count(*) into privs_count from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'job_actuals' and grantee = 'authenticated' and privilege_type = 'UPDATE';
  if privs_count <> 0 then
    insert into validation_results (line) values (format('FAIL — Test 12f1: authenticated has UPDATE on %s column(s) of job_actuals, expected 0 (job_actuals has no UPDATE grant of any kind). REAL SECURITY BUG.', privs_count));
  else
    insert into validation_results (line) values (format('PASS — Test 12f1: authenticated has UPDATE on zero columns of job_actuals.'));
  end if;

  select count(*) into privs_count from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'telemetry_events' and grantee = 'authenticated' and privilege_type = 'UPDATE';
  if privs_count <> 0 then
    insert into validation_results (line) values (format('FAIL — Test 12f2: authenticated has UPDATE on %s column(s) of telemetry_events, expected 0. REAL SECURITY BUG.', privs_count));
  else
    insert into validation_results (line) values (format('PASS — Test 12f2: authenticated has UPDATE on zero columns of telemetry_events.'));
  end if;

  select count(*) into privs_count from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'livestock_individuals' and grantee = 'authenticated' and privilege_type = 'UPDATE';
  select count(*) into cols_total from information_schema.columns
    where table_schema = 'public' and table_name = 'livestock_individuals';
  if privs_count <> cols_total then
    insert into validation_results (line) values (format('FAIL — Test 12f3: authenticated has UPDATE on %s of livestock_individuals'' %s real columns, expected all of them (full-row UPDATE, matching its own real full-CRUD intent) — a narrower, partial UPDATE grant would itself be the bug. REAL SECURITY BUG.', privs_count, cols_total));
  else
    insert into validation_results (line) values (format('PASS — Test 12f3: authenticated has UPDATE on all %s real columns of livestock_individuals (genuine full-row UPDATE, not a narrower column-scoped grant).', cols_total));
  end if;

  select count(*) into privs_count from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'livestock_weight_observations' and grantee = 'authenticated' and privilege_type = 'UPDATE';
  select count(*) into cols_total from information_schema.columns
    where table_schema = 'public' and table_name = 'livestock_weight_observations';
  if privs_count <> cols_total then
    insert into validation_results (line) values (format('FAIL — Test 12f4: authenticated has UPDATE on %s of livestock_weight_observations'' %s real columns, expected all of them. REAL SECURITY BUG.', privs_count, cols_total));
  else
    insert into validation_results (line) values (format('PASS — Test 12f4: authenticated has UPDATE on all %s real columns of livestock_weight_observations.', cols_total));
  end if;

  select count(*) into privs_count from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'supplier_quotes' and grantee = 'authenticated' and privilege_type = 'UPDATE';
  select count(*) into cols_total from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_quotes';
  if privs_count <> cols_total then
    insert into validation_results (line) values (format('FAIL — Test 12f5: authenticated has UPDATE on %s of supplier_quotes'' %s real columns, expected all of them. REAL SECURITY BUG.', privs_count, cols_total));
  else
    insert into validation_results (line) values (format('PASS — Test 12f5: authenticated has UPDATE on all %s real columns of supplier_quotes.', cols_total));
  end if;

  -- TEST 12g (Codex audit HIGH, round 4): 12a-12f5 together cover
  -- SELECT/INSERT/DELETE/UPDATE at both table and column level, but
  -- PostgreSQL also supports a genuinely *column-scoped* `REFERENCES`
  -- grant (unlike DELETE/TRUNCATE/TRIGGER, which cannot be column-
  -- scoped at all) — a stray `grant references (some_column) on t to
  -- authenticated` would pass every check above undetected. None of
  -- these seven tables has *any* real REFERENCES grant, table- or
  -- column-level (12a-12e3's own exact-match table-level comparisons
  -- already confirm no table-level REFERENCES exists for any of the
  -- seven — role_table_grants would have surfaced it in that same
  -- aggregated string), so the correct expectation for column-scoped
  -- REFERENCES specifically is exactly zero rows, across all seven
  -- tables, full stop.
  select count(*) into privs_count from information_schema.role_column_grants
    where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'REFERENCES'
      and table_name in ('job_sessions', 'job_actuals', 'telemetry_events', 'notifications',
                          'livestock_individuals', 'livestock_weight_observations', 'supplier_quotes');
  if privs_count <> 0 then
    insert into validation_results (line) values (format('FAIL — Test 12g: authenticated has a column-scoped REFERENCES grant on %s column(s) across the seven tables, expected none. REAL SECURITY BUG.', privs_count));
  else
    insert into validation_results (line) values (format('PASS — Test 12g: authenticated has no column-scoped REFERENCES grant on any of the seven tables.'));
  end if;

  -- Restore the original (superuser) role before this block ends — the
  -- final SELECT below runs outside this do-block but inside the same
  -- transaction, and `validation_results` (a session-temporary table) was
  -- created by, and is only really guaranteed readable as, the role this
  -- script actually started as. `has_table_privilege`/`has_function_privilege`
  -- above already captured everything `anon`'s own real access looks
  -- like — nothing further needs to run as `anon`.
  reset role;

  insert into validation_results (line) values (format('--- All tests ran. Read every PASS/FAIL/SKIP line above (ordered by seq). The final ROLLBACK discards every write this script made — nothing persists. ---'));
end $$;

select seq, line from validation_results order by seq;

rollback;
