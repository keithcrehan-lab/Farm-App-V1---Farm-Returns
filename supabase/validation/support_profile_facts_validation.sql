-- Farm Return Next — Supports Intelligence + Farm Strategy phase.
-- Live validation for `support_profile_facts`
-- (`20260904000000_support_profile_facts.sql`), against
-- `Farm Return V1 Dev` only.
--
-- HOW TO RUN: `supabase db query -f <this file> --linked`, or the
-- Dashboard SQL Editor, on a service-role/postgres connection — needed
-- so this script can `set local role authenticated` and impersonate a
-- real user's `auth.uid()`, the same technique
-- `decisions_jobs_rls_validation.sql` already established (see that
-- file's own header for the full account, not repeated here). Results
-- come back via a real `select` at the end (a temp table), not `RAISE
-- NOTICE` — the same fix that script's own header documents finding was
-- needed for `supabase db query`'s Management-API transport.
--
-- Entirely wrapped in one transaction, explicitly ROLLED BACK at the
-- end — nothing this script inserts/updates persists in real data
-- either way.
--
-- SCOPE: this Dev project currently holds one real farm/user
-- (`BUILD_STATE.json`'s own "KC" farm note) — a real two-tenant
-- cross-farm isolation test (Test 5 below) only runs if a second real
-- farm/user actually exists at run time; otherwise it SKIPs with an
-- honest note, exactly like `decisions_jobs_rls_validation.sql`'s own
-- Test 3d precedent for the same reason. Every other test here (schema
-- shape, RLS-enabled, grants, CHECK constraint, upsert/unique semantics,
-- single-farm read/write) needs only the one real farm.

create temporary table validation_results (seq serial primary key, line text not null);
grant all on validation_results to authenticated, anon;
grant usage, select on sequence validation_results_seq_seq to authenticated, anon;

begin;

do $$
declare
  farm_a record;
  farm_b record;
  fact_id uuid;
  rejected boolean;
begin
  select f.id as farm_id, f.user_id, f.name into farm_a from public.farms f order by f.created_at limit 1;
  if farm_a.farm_id is null then
    raise exception 'VALIDATION ABORTED: need at least one real farm in this project to run this script.';
  end if;
  insert into validation_results (line) values (format('--- Farm A: id=%s owner=%s name=%s ---', farm_a.farm_id, farm_a.user_id, farm_a.name));

  select f.id as farm_id, f.user_id, f.name into farm_b from public.farms f where f.user_id <> farm_a.user_id limit 1;

  -- TEST 1: table/RLS shape.
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'support_profile_facts') then
    insert into validation_results (line) values ('PASS — Test 1a: support_profile_facts table exists.');
  else
    insert into validation_results (line) values ('FAIL — Test 1a: support_profile_facts table does not exist.');
  end if;

  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'support_profile_facts' and c.relrowsecurity) then
    insert into validation_results (line) values ('PASS — Test 1b: RLS is enabled on support_profile_facts.');
  else
    insert into validation_results (line) values ('FAIL — Test 1b: RLS is NOT enabled on support_profile_facts.');
  end if;

  -- TEST 2: grants — authenticated has full CRUD, anon has none.
  if (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'support_profile_facts' and grantee = 'authenticated' and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) = 4 then
    insert into validation_results (line) values ('PASS — Test 2a: authenticated has select/insert/update/delete on support_profile_facts.');
  else
    insert into validation_results (line) values ('FAIL — Test 2a: authenticated grants on support_profile_facts are not exactly select/insert/update/delete.');
  end if;

  if (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'support_profile_facts' and grantee = 'anon') = 0 then
    insert into validation_results (line) values ('PASS — Test 2b: anon has zero grants on support_profile_facts.');
  else
    insert into validation_results (line) values ('FAIL — Test 2b: anon has a grant on support_profile_facts. REAL SECURITY GAP.');
  end if;

  -- TEST 3: CHECK constraint rejects an unregistered key (as postgres,
  -- pre-impersonation — the constraint is DB-level, not RLS).
  rejected := false;
  begin
    insert into public.support_profile_facts (farm_id, key, value) values (farm_a.farm_id, 'not_a_real_key', '"x"'::jsonb);
  exception when check_violation then
    rejected := true;
  end;
  if rejected then
    insert into validation_results (line) values ('PASS — Test 3: an unregistered key is rejected by the database CHECK constraint.');
  else
    insert into validation_results (line) values ('FAIL — Test 3: an unregistered key was accepted. REAL SCOPE-CREEP GAP.');
    delete from public.support_profile_facts where farm_id = farm_a.farm_id and key = 'not_a_real_key';
  end if;

  -- Simulate Farm A's own real authenticated session from here on.
  set local role authenticated;
  execute format('set local request.jwt.claims = %L', json_build_object('sub', farm_a.user_id, 'role', 'authenticated')::text);

  -- TEST 4: single-farm upsert/unique semantics, as the real owner.
  insert into public.support_profile_facts (farm_id, key, value) values (farm_a.farm_id, 'date_of_birth', '"2000-01-01"'::jsonb)
    on conflict (farm_id, key) do update set value = excluded.value
    returning id into fact_id;
  insert into validation_results (line) values ('PASS — Test 4a: Farm A can insert its own support_profile_facts row.');

  insert into public.support_profile_facts (farm_id, key, value) values (farm_a.farm_id, 'date_of_birth', '"1999-06-15"'::jsonb)
    on conflict (farm_id, key) do update set value = excluded.value;
  if (select count(*) from public.support_profile_facts where farm_id = farm_a.farm_id and key = 'date_of_birth') = 1
     and (select value from public.support_profile_facts where farm_id = farm_a.farm_id and key = 'date_of_birth') = '"1999-06-15"'::jsonb then
    insert into validation_results (line) values ('PASS — Test 4b: re-answering the same key upserts (one row, latest value), matching upsertSupportProfileFact''s own contract.');
  else
    insert into validation_results (line) values ('FAIL — Test 4b: re-answering the same key did not upsert correctly.');
  end if;

  -- TEST 5: real two-tenant cross-farm isolation, only if a second real
  -- farm/user exists in this project.
  if farm_b.farm_id is null then
    insert into validation_results (line) values ('SKIP — Test 5: only one real farm/user exists in this project — cannot run a real two-tenant cross-farm isolation test. Structural RLS (Test 1b) and the owner-scoped policy predicate (identical to financial_assumptions'' own already-validated predicate) are the evidence in the meantime.');
  else
    insert into validation_results (line) values (format('--- Farm B: id=%s owner=%s name=%s ---', farm_b.farm_id, farm_b.user_id, farm_b.name));
    if exists (select 1 from public.support_profile_facts where farm_id = farm_b.farm_id) then
      insert into validation_results (line) values ('FAIL — Test 5a: Farm A can see a support_profile_facts row belonging to Farm B. REAL CROSS-FARM LEAK.');
    else
      insert into validation_results (line) values ('PASS — Test 5a: Farm A sees zero support_profile_facts rows for Farm B.');
    end if;

    rejected := false;
    begin
      insert into public.support_profile_facts (farm_id, key, value) values (farm_b.farm_id, 'biss_participant_2026', 'true'::jsonb);
    exception when others then
      rejected := true;
    end;
    if rejected then
      insert into validation_results (line) values ('PASS — Test 5b: Farm A cannot insert a support_profile_facts row for Farm B (RLS with-check rejects it).');
    else
      insert into validation_results (line) values ('FAIL — Test 5b: Farm A inserted a support_profile_facts row for Farm B. REAL CROSS-FARM WRITE GAP.');
      set local role postgres;
      reset request.jwt.claims;
      delete from public.support_profile_facts where farm_id = farm_b.farm_id and key = 'biss_participant_2026';
      set local role authenticated;
      execute format('set local request.jwt.claims = %L', json_build_object('sub', farm_a.user_id, 'role', 'authenticated')::text);
    end if;
  end if;

  set local role postgres;
  reset request.jwt.claims;
end $$;

select line from validation_results order by seq;

rollback;
