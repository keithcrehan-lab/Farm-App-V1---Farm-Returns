-- Supplier Portal -- live cross-supplier isolation validation for
-- 20261031150000_supplier_portal_foundations.sql.
--
-- STATUS: RUN against Farm Return V1 Dev on 2026-10-31 after the
-- migration was applied. Result: 18/18 checks PASS. This script remains
-- rollback-only and safe to rerun against Dev when the portal changes.
--
-- HOW TO RUN: a service-role/postgres connection (`supabase db query -f
-- <this file> --linked`, or the Dashboard SQL editor), the whole file
-- as one script. Everything runs inside one transaction that is
-- unconditionally ROLLED BACK at the end -- nothing persists.
--
-- PREREQUISITES (nothing is created in auth.users):
-- * at least two existing auth.users accounts that are NOT quote
--   operators and have no active supplier membership (users A and B);
-- * at least one existing, non-withdrawn quote_requests row.
-- If a prerequisite is missing the script raises before testing.
--
-- Results are read back from a temp table (NOTICE output is dropped by
-- the Management API transport -- decisions_jobs_rls_validation.sql).
-- Any FAIL line is a real isolation defect.

begin;

create temp table _sp_results (n serial, test text, outcome text) on commit drop;
create temp table _sp_ctx (k text primary key, v uuid) on commit drop;
grant all on _sp_results, _sp_ctx to authenticated, anon;
grant usage, select on sequence _sp_results_n_seq to authenticated, anon;

do $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_request uuid;
  v_supplier_a uuid;
  v_supplier_b uuid;
begin
  select u.id into v_user_a from auth.users u
    where not exists (select 1 from public.quote_operators o where o.user_id = u.id and o.active)
      and not exists (select 1 from public.supplier_portal_members m where m.user_id = u.id and m.active)
    order by u.created_at limit 1;
  select u.id into v_user_b from auth.users u
    where u.id <> v_user_a
      and not exists (select 1 from public.quote_operators o where o.user_id = u.id and o.active)
      and not exists (select 1 from public.supplier_portal_members m where m.user_id = u.id and m.active)
    order by u.created_at limit 1;
  select id into v_request from public.quote_requests where withdrawn_at is null order by created_at limit 1;
  if v_user_a is null or v_user_b is null or v_request is null then
    raise exception 'PREREQUISITE: need two non-operator, non-member accounts and one active quote request';
  end if;

  insert into public.supplier_portal_organisations (display_name) values ('Validation Supplier A') returning id into v_supplier_a;
  insert into public.supplier_portal_organisations (display_name) values ('Validation Supplier B') returning id into v_supplier_b;
  insert into public.supplier_portal_members (supplier_id, user_id, role) values (v_supplier_a, v_user_a, 'member'), (v_supplier_b, v_user_b, 'admin');

  insert into _sp_ctx values ('user_a', v_user_a), ('user_b', v_user_b), ('supplier_a', v_supplier_a), ('supplier_b', v_supplier_b), ('request', v_request);
  with r as (
    insert into public.supplier_portal_rfq_routes (supplier_id, request_id) values (v_supplier_a, v_request) returning id
  ) insert into _sp_ctx select 'route_a', id from r;
  with r as (
    insert into public.supplier_portal_rfq_routes (supplier_id, request_id) values (v_supplier_b, v_request) returning id
  ) insert into _sp_ctx select 'route_b', id from r;
end $$;

-- ---- As user B: create and submit a quote on B's own route -----------
select set_config('request.jwt.claims', json_build_object('sub', (select v from _sp_ctx where k = 'user_b'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_result jsonb;
begin
  v_result := public.supplier_portal_save_quote_draft(
    (select v from _sp_ctx where k = 'route_b'), null, null,
    jsonb_build_object('deliveryChargeExVat', '0', 'deliveryEarliest', to_char(current_date + 3, 'YYYY-MM-DD'),
                       'deliveryLatest', to_char(current_date + 10, 'YYYY-MM-DD'), 'validUntil', to_char(current_date + 14, 'YYYY-MM-DD')),
    jsonb_build_array(jsonb_build_object('product', 'Validation product', 'quantity', '1', 'unit', 'tonnes', 'unitPriceExVat', '100.00', 'vatRatePercent', '0'))
  );
  insert into _sp_ctx values ('quote_b', (v_result ->> 'quoteId')::uuid);
  perform public.supplier_portal_submit_quote((v_result ->> 'quoteId')::uuid, (v_result ->> 'version')::integer);
  insert into _sp_results (test, outcome) values ('B can draft and submit on its own route', 'PASS');
exception when others then
  insert into _sp_results (test, outcome) values ('B can draft and submit on its own route', 'FAIL: ' || sqlerrm);
end $$;

-- ---- As user A: every cross-supplier path must fail ------------------
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select v from _sp_ctx where k = 'user_a'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_list jsonb;
  v_detail jsonb;
  v_count integer;
begin
  v_list := public.supplier_portal_list_rfqs();
  insert into _sp_results (test, outcome) values ('A lists only its own route',
    case when jsonb_array_length(v_list) = (select count(*) from public.supplier_portal_rfq_routes where supplier_id = (select v from _sp_ctx where k = 'supplier_a'))
          and not v_list @> jsonb_build_array(jsonb_build_object('routeId', (select v from _sp_ctx where k = 'route_b')))
         then 'PASS' else 'FAIL' end);

  v_detail := public.supplier_portal_get_rfq((select v from _sp_ctx where k = 'route_a'));
  insert into _sp_results (test, outcome) values ('A sees no farmer identity or contact fields',
    case when v_detail::text !~* '(farm_?id|contact_?name|contact_?phone|contact_?email|address_?line|"eircode")'
          and (v_detail -> 'quotes') = '[]'::jsonb
         then 'PASS' else 'FAIL: ' || v_detail::text end);

  begin
    perform public.supplier_portal_get_rfq((select v from _sp_ctx where k = 'route_b'));
    insert into _sp_results (test, outcome) values ('A cannot read B''s route', 'FAIL: returned data');
  exception when others then
    insert into _sp_results (test, outcome) values ('A cannot read B''s route', case when sqlerrm like 'SUPPLIER_PORTAL_NOT_FOUND%' then 'PASS' else 'FAIL: ' || sqlerrm end);
  end;

  begin
    perform public.supplier_portal_save_quote_draft((select v from _sp_ctx where k = 'route_b'), null, null, '{}'::jsonb, '[]'::jsonb);
    insert into _sp_results (test, outcome) values ('A cannot draft on B''s route', 'FAIL: accepted');
  exception when others then
    insert into _sp_results (test, outcome) values ('A cannot draft on B''s route', case when sqlerrm like 'SUPPLIER_PORTAL_NOT_FOUND%' then 'PASS' else 'FAIL: ' || sqlerrm end);
  end;

  begin
    perform public.supplier_portal_withdraw_quote((select v from _sp_ctx where k = 'quote_b'), 2, null);
    insert into _sp_results (test, outcome) values ('A cannot withdraw B''s quote', 'FAIL: accepted');
  exception when others then
    insert into _sp_results (test, outcome) values ('A cannot withdraw B''s quote', case when sqlerrm like 'SUPPLIER_PORTAL_NOT_FOUND%' then 'PASS' else 'FAIL: ' || sqlerrm end);
  end;

  begin
    perform public.supplier_portal_save_quote_draft((select v from _sp_ctx where k = 'route_a'), (select v from _sp_ctx where k = 'quote_b'), 2, '{}'::jsonb, '[]'::jsonb);
    insert into _sp_results (test, outcome) values ('A cannot edit B''s quote via A''s own route', 'FAIL: accepted');
  exception when others then
    insert into _sp_results (test, outcome) values ('A cannot edit B''s quote via A''s own route', case when sqlerrm like 'SUPPLIER_PORTAL_NOT_FOUND%' then 'PASS' else 'FAIL: ' || sqlerrm end);
  end;

  select count(*) into v_count from public.supplier_portal_quotes where supplier_id = (select v from _sp_ctx where k = 'supplier_b');
  insert into _sp_results (test, outcome) values ('RLS hides B''s quotes from A', case when v_count = 0 then 'PASS' else 'FAIL: ' || v_count end);
  select count(*) into v_count from public.supplier_portal_quote_lines where supplier_id = (select v from _sp_ctx where k = 'supplier_b');
  insert into _sp_results (test, outcome) values ('RLS hides B''s quote lines from A', case when v_count = 0 then 'PASS' else 'FAIL: ' || v_count end);
  select count(*) into v_count from public.supplier_portal_organisations where id = (select v from _sp_ctx where k = 'supplier_b');
  insert into _sp_results (test, outcome) values ('RLS hides B''s organisation from A', case when v_count = 0 then 'PASS' else 'FAIL: ' || v_count end);
  begin
    select count(*) into v_count from public.quote_request_delivery_snapshots;
    insert into _sp_results (test, outcome) values ('Supplier cannot directly read farmer delivery snapshots', 'FAIL: direct SELECT unexpectedly succeeded with ' || v_count || ' row(s)');
  exception when insufficient_privilege then
    insert into _sp_results (test, outcome) values ('Supplier cannot directly read farmer delivery snapshots', 'PASS');
  when others then
    insert into _sp_results (test, outcome) values ('Supplier cannot directly read farmer delivery snapshots', case when sqlerrm like 'permission denied%' then 'PASS' else 'FAIL: ' || sqlerrm end);
  end;

  begin
    insert into public.supplier_portal_quotes (route_id, supplier_id, quoted_revision_id, quoted_revision_number, status)
      select (select v from _sp_ctx where k = 'route_a'), (select v from _sp_ctx where k = 'supplier_a'), current_revision_id, 1, 'submitted'
      from public.quote_requests where id = (select v from _sp_ctx where k = 'request');
    insert into _sp_results (test, outcome) values ('A cannot insert quotes directly', 'FAIL: accepted');
  exception when others then
    insert into _sp_results (test, outcome) values ('A cannot insert quotes directly', 'PASS');
  end;

  begin
    perform public.supplier_portal_update_my_settings('a@example.invalid', null, '{}', 14, null);
    insert into _sp_results (test, outcome) values ('Non-admin member cannot change settings', 'FAIL: accepted');
  exception when others then
    insert into _sp_results (test, outcome) values ('Non-admin member cannot change settings', case when sqlerrm like 'SUPPLIER_PORTAL_FORBIDDEN%' then 'PASS' else 'FAIL: ' || sqlerrm end);
  end;

  begin
    perform public.supplier_portal_operator_route_request((select v from _sp_ctx where k = 'request'), (select v from _sp_ctx where k = 'supplier_a'));
    insert into _sp_results (test, outcome) values ('Supplier member cannot route requests', 'FAIL: accepted');
  exception when others then
    insert into _sp_results (test, outcome) values ('Supplier member cannot route requests', case when sqlerrm like 'SUPPLIER_PORTAL_FORBIDDEN%' then 'PASS' else 'FAIL: ' || sqlerrm end);
  end;
end $$;

-- ---- Immutability of B's submitted quote (as postgres) ---------------
reset role;
do $$
begin
  begin
    update public.supplier_portal_quote_lines set unit_price_ex_vat = 1 where quote_id = (select v from _sp_ctx where k = 'quote_b');
    insert into _sp_results (test, outcome) values ('Submitted quote lines are immutable even to postgres', 'FAIL: accepted');
  exception when others then
    insert into _sp_results (test, outcome) values ('Submitted quote lines are immutable even to postgres', 'PASS');
  end;
  begin
    update public.supplier_portal_quotes set valid_until = valid_until + 30 where id = (select v from _sp_ctx where k = 'quote_b');
    insert into _sp_results (test, outcome) values ('Submitted quote header is immutable even to postgres', 'FAIL: accepted');
  exception when others then
    insert into _sp_results (test, outcome) values ('Submitted quote header is immutable even to postgres', 'PASS');
  end;
  begin
    delete from public.supplier_portal_events where supplier_id = (select v from _sp_ctx where k = 'supplier_b');
    insert into _sp_results (test, outcome) values ('History cannot be deleted directly', 'FAIL: accepted');
  exception when others then
    insert into _sp_results (test, outcome) values ('History cannot be deleted directly', 'PASS');
  end;
end $$;

-- ---- Anonymous: no execute ------------------------------------------
set local role anon;
do $$
begin
  begin
    perform public.supplier_portal_list_rfqs();
    insert into _sp_results (test, outcome) values ('anon cannot execute supplier RPCs', 'FAIL: accepted');
  exception when insufficient_privilege then
    insert into _sp_results (test, outcome) values ('anon cannot execute supplier RPCs', 'PASS');
  when others then
    insert into _sp_results (test, outcome) values ('anon cannot execute supplier RPCs', 'FAIL: unexpected ' || sqlerrm);
  end;
end $$;

reset role;
select n, test, outcome from _sp_results order by n;

rollback;
