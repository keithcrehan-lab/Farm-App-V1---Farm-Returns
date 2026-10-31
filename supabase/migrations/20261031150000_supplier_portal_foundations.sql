-- Supplier Portal foundations -- supplier organisations, supplier
-- membership, operator-controlled routing of real farmer quote requests
-- (`quote_requests`, 20260911080000_quote_pilot_checkpoint1.sql) to a
-- supplier, and supplier-authored quotes with priced line items and an
-- append-only history.
--
-- STATUS: NOT APPLIED to any database. Written 2026-10-31 without a
-- local Postgres; never executed. Apply to Farm Return V1 Dev only after
-- review, then run supabase/validation/supplier_portal_rls_validation.sql
-- against that same project. Never apply to production from this repo.
--
-- NAMING: every object is prefixed `supplier_portal_`. Dev already holds
-- the unmerged managed-quote-pilot branch's own `quote_suppliers` /
-- `quote_supplier_responses` objects (see
-- 20261028094500_pilot_revoke_public_quote_rpc_execute.sql); this
-- migration neither depends on nor collides with them.
--
-- TRUST MODEL
-- * Supplier identity is never taken from the client. Every supplier
--   RPC derives the caller's supplier from `auth.uid()` via
--   `supplier_portal_current_supplier_id()`; a user has at most one
--   active membership (partial unique index below).
-- * Supplier membership, supplier creation and RFQ routing are
--   operator-only (`is_quote_operator_for_current_user()`, the existing
--   narrow allow-list). There is no self-serve supplier sign-up.
-- * Suppliers never read `quote_requests` / revisions / delivery
--   snapshots directly. The security-definer read RPCs return a
--   minimised RFQ: product, quantity, unit, packaging, delivery window,
--   town/city, county and the 3-character Eircode routing key. Never the
--   farm id, farmer contact name/phone/email, address lines, full
--   Eircode or the farm's estimate snapshot. Releasing farmer contact
--   details to a supplier is deliberately not built.
-- * A route that belongs to another supplier is reported as NOT_FOUND,
--   exactly like a route that does not exist (no existence oracle).
-- * Tables: RLS enabled; select-only grants; policies allow a member to
--   read their own supplier's rows and an operator to read all. No
--   insert/update/delete grant exists for `authenticated` -- every
--   write is an RPC with its own explicit checks (RLS does not apply
--   inside a security-definer function). PUBLIC execute is revoked on
--   every function (the 20260915233000 / 20261028094500 lesson).
-- * Totals are NOT stored. Submitted inputs are immutable (trigger
--   guards below) and totals are recomputed from them by
--   src/domain/supplier-quote.ts under the recorded `totals_method`.
--
-- Forward-only: no DROP, no TRUNCATE, no destructive change.

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.supplier_portal_organisations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  contact_email text check (contact_email is null or (length(contact_email) <= 254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  contact_phone text check (contact_phone is null or length(btrim(contact_phone)) between 1 and 40),
  service_counties text[] not null default '{}' check (cardinality(service_counties) <= 40),
  default_quote_validity_days integer check (default_quote_validity_days is null or default_quote_validity_days between 1 and 90),
  quote_terms text check (quote_terms is null or length(quote_terms) <= 2000),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger supplier_portal_organisations_set_updated_at
  before update on public.supplier_portal_organisations
  for each row execute function public.set_updated_at();

create table public.supplier_portal_members (
  supplier_id uuid not null references public.supplier_portal_organisations (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  active boolean not null default true,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (supplier_id, user_id)
);

-- One active supplier per user: the portal resolves "my supplier" from
-- the session alone, so it must never be ambiguous.
create unique index supplier_portal_members_one_active_per_user
  on public.supplier_portal_members (user_id) where active;

create table public.supplier_portal_rfq_routes (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier_portal_organisations (id),
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  routed_by uuid references auth.users (id) on delete set null,
  routed_at timestamptz not null default now(),
  supplier_first_viewed_at timestamptz,
  supplier_declined_at timestamptz,
  supplier_decline_reason text check (supplier_decline_reason is null or length(supplier_decline_reason) <= 500),
  unique (supplier_id, request_id),
  unique (id, supplier_id)
);

create index supplier_portal_rfq_routes_request_id_idx on public.supplier_portal_rfq_routes (request_id);

create table public.supplier_portal_quotes (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null,
  supplier_id uuid not null,
  quoted_revision_id uuid not null references public.quote_request_revisions (id) on delete cascade,
  quoted_revision_number integer not null check (quoted_revision_number >= 1),
  status text not null check (status in ('draft', 'submitted', 'withdrawn', 'discarded')),
  version integer not null default 1 check (version >= 1),
  currency text not null default 'EUR' check (currency = 'EUR'),
  delivery_charge_ex_vat numeric check (delivery_charge_ex_vat is null or (delivery_charge_ex_vat >= 0 and delivery_charge_ex_vat <= 100000 and delivery_charge_ex_vat = round(delivery_charge_ex_vat, 2))),
  delivery_vat_rate_percent numeric check (delivery_vat_rate_percent is null or (delivery_vat_rate_percent >= 0 and delivery_vat_rate_percent <= 100 and delivery_vat_rate_percent = round(delivery_vat_rate_percent, 2))),
  delivery_earliest date,
  delivery_latest date,
  valid_until date,
  payment_terms text check (payment_terms is null or length(payment_terms) <= 500),
  notes text check (notes is null or length(notes) <= 2000),
  totals_method text check (totals_method is null or totals_method = 'supplier_quote_totals_v1'),
  submitted_at timestamptz,
  submitted_by uuid references auth.users (id) on delete set null,
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users (id) on delete set null,
  withdraw_reason text check (withdraw_reason is null or length(withdraw_reason) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (delivery_earliest is null or delivery_latest is null or delivery_earliest <= delivery_latest),
  check ((status in ('submitted', 'withdrawn')) = (submitted_at is not null)),
  check ((status = 'withdrawn') = (withdrawn_at is not null)),
  check (status = 'draft' or status = 'discarded' or totals_method is not null),
  unique (id, supplier_id),
  -- Shared-discriminator composite FK (the quote pilot's cross-tenant
  -- lineage pattern): a quote's supplier must be its route's supplier.
  foreign key (route_id, supplier_id) references public.supplier_portal_rfq_routes (id, supplier_id) on delete cascade
);

create unique index supplier_portal_quotes_one_live_per_route
  on public.supplier_portal_quotes (route_id) where status in ('draft', 'submitted');
create index supplier_portal_quotes_supplier_id_idx on public.supplier_portal_quotes (supplier_id);

create table public.supplier_portal_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null,
  supplier_id uuid not null,
  line_number integer not null check (line_number between 1 and 50),
  product text not null check (length(btrim(product)) between 1 and 200),
  description text check (description is null or length(description) <= 500),
  quantity numeric not null check (quantity > 0 and quantity <= 100000 and quantity = round(quantity, 3)),
  unit text not null check (unit in ('kg', 'tonnes', 'bags')),
  unit_price_ex_vat numeric not null check (unit_price_ex_vat >= 0 and unit_price_ex_vat <= 100000 and unit_price_ex_vat = round(unit_price_ex_vat, 2)),
  vat_rate_percent numeric check (vat_rate_percent is null or (vat_rate_percent >= 0 and vat_rate_percent <= 100 and vat_rate_percent = round(vat_rate_percent, 2))),
  unique (quote_id, line_number),
  foreign key (quote_id, supplier_id) references public.supplier_portal_quotes (id, supplier_id) on delete cascade
);

create index supplier_portal_quote_lines_supplier_id_idx on public.supplier_portal_quote_lines (supplier_id);

create table public.supplier_portal_events (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null,
  supplier_id uuid not null,
  quote_id uuid references public.supplier_portal_quotes (id) on delete cascade,
  event_type text not null check (event_type in (
    'rfq_routed', 'rfq_viewed', 'rfq_declined',
    'draft_created', 'draft_saved', 'draft_discarded',
    'quote_submitted', 'quote_withdrawn'
  )),
  actor_user_id uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  foreign key (route_id, supplier_id) references public.supplier_portal_rfq_routes (id, supplier_id) on delete cascade
);

create index supplier_portal_events_route_id_idx on public.supplier_portal_events (route_id, occurred_at);

-- ---------------------------------------------------------------------
-- Integrity triggers -- defence in depth behind the RPCs.
-- ---------------------------------------------------------------------

-- Deletion: no client role holds a delete grant. A delete is accepted
-- only as a foreign-key cascade (pg_trigger_depth() > 1 -- the RI
-- action is itself a trigger), i.e. when the farmer's request/farm or
-- an account is deleted upstream; a direct delete, even by a privileged
-- role, is rejected. Actor columns (created_by, submitted_by, ...) are
-- excluded from the immutability comparison because an account deletion
-- legitimately nulls them (`on delete set null`).

-- A submitted quote is immutable except for the one allowed transition
-- submitted -> withdrawn; withdrawn/discarded quotes are terminal.
create or replace function public._supplier_portal_quotes_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'supplier_portal: quotes are never deleted directly';
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  if (new.route_id, new.supplier_id, new.quoted_revision_id, new.quoted_revision_number, new.currency,
      new.delivery_charge_ex_vat, new.delivery_vat_rate_percent, new.delivery_earliest, new.delivery_latest,
      new.valid_until, new.payment_terms, new.notes, new.totals_method, new.submitted_at, new.created_at)
     is distinct from
     (old.route_id, old.supplier_id, old.quoted_revision_id, old.quoted_revision_number, old.currency,
      old.delivery_charge_ex_vat, old.delivery_vat_rate_percent, old.delivery_earliest, old.delivery_latest,
      old.valid_until, old.payment_terms, old.notes, old.totals_method, old.submitted_at, old.created_at)
  then
    raise exception 'supplier_portal: a % quote cannot be changed', old.status;
  end if;
  if new.status = old.status
     and (new.withdrawn_at, new.withdraw_reason) is not distinct from (old.withdrawn_at, old.withdraw_reason) then
    return new; -- actor/version bookkeeping only
  end if;
  if old.status = 'submitted' and new.status = 'withdrawn' then
    return new;
  end if;
  raise exception 'supplier_portal: a % quote cannot move to %', old.status, new.status;
end;
$$;

create trigger supplier_portal_quotes_guard
  before update or delete on public.supplier_portal_quotes
  for each row execute function public._supplier_portal_quotes_guard();

-- Lines may change only while their quote is a draft.
create or replace function public._supplier_portal_quote_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  select status into v_status from public.supplier_portal_quotes
    where id = (case when tg_op = 'DELETE' then old.quote_id else new.quote_id end);
  if v_status is distinct from 'draft' then
    raise exception 'supplier_portal: lines of a % quote cannot be changed', coalesce(v_status, 'missing');
  end if;
  if tg_op = 'UPDATE' and (new.quote_id, new.supplier_id) is distinct from (old.quote_id, old.supplier_id) then
    raise exception 'supplier_portal: a line cannot move between quotes';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger supplier_portal_quote_lines_guard
  before insert or update or delete on public.supplier_portal_quote_lines
  for each row execute function public._supplier_portal_quote_lines_guard();

-- History is append-only (cascade deletion excepted, as above). An
-- account deletion nulling actor_user_id is the one permitted update.
create or replace function public._supplier_portal_events_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 and new.actor_user_id is null
     and (new.id, new.route_id, new.supplier_id, new.quote_id, new.event_type, new.occurred_at, new.detail)
         is not distinct from (old.id, old.route_id, old.supplier_id, old.quote_id, old.event_type, old.occurred_at, old.detail) then
    return new;
  end if;
  raise exception 'supplier_portal: history events are append-only';
end;
$$;

create trigger supplier_portal_events_append_only
  before update or delete on public.supplier_portal_events
  for each row execute function public._supplier_portal_events_append_only();

revoke all on function public._supplier_portal_quotes_guard() from public;
revoke all on function public._supplier_portal_quote_lines_guard() from public;
revoke all on function public._supplier_portal_events_append_only() from public;

-- ---------------------------------------------------------------------
-- Identity helper + RLS
-- ---------------------------------------------------------------------

-- Answers only for the caller's own session (never accepts a user id --
-- the is_quote_operator(uuid) enumeration lesson, 20260915233000).
create or replace function public.supplier_portal_current_supplier_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.supplier_id
  from public.supplier_portal_members m
  join public.supplier_portal_organisations o on o.id = m.supplier_id
  where m.user_id = auth.uid() and m.active and o.active
  limit 1;
$$;

revoke all on function public.supplier_portal_current_supplier_id() from public;
grant execute on function public.supplier_portal_current_supplier_id() to authenticated;

alter table public.supplier_portal_organisations enable row level security;
alter table public.supplier_portal_members enable row level security;
alter table public.supplier_portal_rfq_routes enable row level security;
alter table public.supplier_portal_quotes enable row level security;
alter table public.supplier_portal_quote_lines enable row level security;
alter table public.supplier_portal_events enable row level security;

create policy "supplier_portal_organisations_member_or_operator_read" on public.supplier_portal_organisations
  for select to authenticated
  using (id = (select public.supplier_portal_current_supplier_id()) or (select public.is_quote_operator_for_current_user()));

create policy "supplier_portal_members_self_or_operator_read" on public.supplier_portal_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_quote_operator_for_current_user()));

create policy "supplier_portal_rfq_routes_member_or_operator_read" on public.supplier_portal_rfq_routes
  for select to authenticated
  using (supplier_id = (select public.supplier_portal_current_supplier_id()) or (select public.is_quote_operator_for_current_user()));

create policy "supplier_portal_quotes_member_or_operator_read" on public.supplier_portal_quotes
  for select to authenticated
  using (supplier_id = (select public.supplier_portal_current_supplier_id()) or (select public.is_quote_operator_for_current_user()));

create policy "supplier_portal_quote_lines_member_or_operator_read" on public.supplier_portal_quote_lines
  for select to authenticated
  using (supplier_id = (select public.supplier_portal_current_supplier_id()) or (select public.is_quote_operator_for_current_user()));

create policy "supplier_portal_events_member_or_operator_read" on public.supplier_portal_events
  for select to authenticated
  using (supplier_id = (select public.supplier_portal_current_supplier_id()) or (select public.is_quote_operator_for_current_user()));

revoke all on public.supplier_portal_organisations from anon, authenticated;
revoke all on public.supplier_portal_members from anon, authenticated;
revoke all on public.supplier_portal_rfq_routes from anon, authenticated;
revoke all on public.supplier_portal_quotes from anon, authenticated;
revoke all on public.supplier_portal_quote_lines from anon, authenticated;
revoke all on public.supplier_portal_events from anon, authenticated;
grant select on public.supplier_portal_organisations to authenticated;
grant select on public.supplier_portal_members to authenticated;
grant select on public.supplier_portal_rfq_routes to authenticated;
grant select on public.supplier_portal_quotes to authenticated;
grant select on public.supplier_portal_quote_lines to authenticated;
grant select on public.supplier_portal_events to authenticated;

-- ---------------------------------------------------------------------
-- Private payload helpers (no grant; reached only from the RPCs below)
-- ---------------------------------------------------------------------

create or replace function public._supplier_portal_decimal(p_value jsonb, p_scale integer, p_field text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_text text;
  v_number numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) not in ('string', 'number') then
    raise exception 'SUPPLIER_PORTAL_INVALID: % must be a decimal', p_field;
  end if;
  v_text := btrim(p_value #>> '{}');
  if v_text = '' then
    return null;
  end if;
  if v_text !~ '^[0-9]+(\.[0-9]+)?$' then
    raise exception 'SUPPLIER_PORTAL_INVALID: % must be a plain non-negative decimal', p_field;
  end if;
  v_number := v_text::numeric;
  if v_number <> round(v_number, p_scale) then
    raise exception 'SUPPLIER_PORTAL_INVALID: % has more than % decimal places', p_field, p_scale;
  end if;
  return v_number;
end;
$$;

create or replace function public._supplier_portal_text(p_value jsonb, p_limit integer, p_field text)
returns text
language plpgsql
immutable
as $$
declare
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string' then
    raise exception 'SUPPLIER_PORTAL_INVALID: % must be text', p_field;
  end if;
  v_text := btrim(p_value #>> '{}');
  if v_text = '' then
    return null;
  end if;
  if length(v_text) > p_limit then
    raise exception 'SUPPLIER_PORTAL_INVALID: % is longer than % characters', p_field, p_limit;
  end if;
  return v_text;
end;
$$;

create or replace function public._supplier_portal_date(p_value jsonb, p_field text)
returns date
language plpgsql
immutable
as $$
declare
  v_text text;
  v_date date;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'string' then
    raise exception 'SUPPLIER_PORTAL_INVALID: % must be a date string', p_field;
  end if;
  v_text := btrim(p_value #>> '{}');
  if v_text = '' then
    return null;
  end if;
  if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'SUPPLIER_PORTAL_INVALID: % must be YYYY-MM-DD', p_field;
  end if;
  begin
    v_date := v_text::date;
  exception when others then
    raise exception 'SUPPLIER_PORTAL_INVALID: % is not a real date', p_field;
  end;
  if to_char(v_date, 'YYYY-MM-DD') <> v_text then
    raise exception 'SUPPLIER_PORTAL_INVALID: % is not a real date', p_field;
  end if;
  return v_date;
end;
$$;

create or replace function public._supplier_portal_dublin_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Dublin')::date;
$$;

create or replace function public._supplier_portal_require_supplier()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid;
begin
  v_supplier_id := public.supplier_portal_current_supplier_id();
  if v_supplier_id is null then
    raise exception 'SUPPLIER_PORTAL_FORBIDDEN: the current session is not an active supplier member' using errcode = '42501';
  end if;
  return v_supplier_id;
end;
$$;

create or replace function public._supplier_portal_require_operator()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_quote_operator_for_current_user(), false) then
    raise exception 'SUPPLIER_PORTAL_FORBIDDEN: the current session is not an authorised quote operator' using errcode = '42501';
  end if;
end;
$$;

-- A quote as the supplier sees it. Amounts are exact decimal text.
create or replace function public._supplier_portal_quote_json(p_quote_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', q.id,
    'status', q.status,
    'version', q.version,
    'quotedRevisionNumber', q.quoted_revision_number,
    'currency', q.currency,
    'deliveryChargeExVat', q.delivery_charge_ex_vat::text,
    'deliveryVatRatePercent', q.delivery_vat_rate_percent::text,
    'deliveryEarliest', q.delivery_earliest,
    'deliveryLatest', q.delivery_latest,
    'validUntil', q.valid_until,
    'paymentTerms', q.payment_terms,
    'notes', q.notes,
    'totalsMethod', q.totals_method,
    'submittedAt', q.submitted_at,
    'withdrawnAt', q.withdrawn_at,
    'withdrawReason', q.withdraw_reason,
    'createdAt', q.created_at,
    'updatedAt', q.updated_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lineNumber', l.line_number,
        'product', l.product,
        'description', l.description,
        'quantity', l.quantity::text,
        'unit', l.unit,
        'unitPriceExVat', l.unit_price_ex_vat::text,
        'vatRatePercent', l.vat_rate_percent::text
      ) order by l.line_number)
      from public.supplier_portal_quote_lines l where l.quote_id = q.id
    ), '[]'::jsonb)
  )
  from public.supplier_portal_quotes q
  where q.id = p_quote_id;
$$;

-- An RFQ as the supplier sees it: the minimised farmer request (see
-- header), the supplier's own quotes, and optionally its history.
create or replace function public._supplier_portal_rfq_json(p_route_id uuid, p_include_events boolean)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'routeId', r.id,
    'routedAt', r.routed_at,
    'firstViewedAt', r.supplier_first_viewed_at,
    'declinedAt', r.supplier_declined_at,
    'declineReason', r.supplier_decline_reason,
    'request', jsonb_build_object(
      'requestedAt', qr.created_at,
      'withdrawn', qr.withdrawn_at is not null,
      'revisionNumber', qrr.revision_number,
      'revisedAt', qrr.created_at,
      'product', qrr.product,
      'quantity', qrr.quantity::text,
      'unit', qrr.unit,
      'packaging', qrr.packaging,
      'deliveryWindowStart', qrr.delivery_window_start,
      'deliveryWindowEnd', qrr.delivery_window_end,
      'townOrCity', s.town_or_city,
      'county', s.county,
      'eircodeRoutingKey', case
        when s.eircode is null or length(regexp_replace(s.eircode, '[[:space:]]', '', 'g')) < 3 then null
        else upper(left(regexp_replace(s.eircode, '[[:space:]]', '', 'g'), 3))
      end
    ),
    'quotes', coalesce((
      select jsonb_agg(public._supplier_portal_quote_json(q.id) order by q.created_at, q.id)
      from public.supplier_portal_quotes q where q.route_id = r.id
    ), '[]'::jsonb),
    'events', case when p_include_events then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'type', e.event_type,
        'quoteId', e.quote_id,
        'occurredAt', e.occurred_at,
        'actor', case
          when e.actor_user_id = auth.uid() then 'you'
          when e.event_type = 'rfq_routed' then 'farm_return'
          else 'team'
        end,
        'detail', e.detail
      ) order by e.occurred_at, e.id)
      from public.supplier_portal_events e where e.route_id = r.id
    ), '[]'::jsonb) else null end
  )
  from public.supplier_portal_rfq_routes r
  join public.quote_requests qr on qr.id = r.request_id
  join public.quote_request_revisions qrr on qrr.id = qr.current_revision_id
  left join public.quote_request_delivery_snapshots s on s.revision_id = qrr.id
  where r.id = p_route_id;
$$;

revoke all on function public._supplier_portal_decimal(jsonb, integer, text) from public;
revoke all on function public._supplier_portal_text(jsonb, integer, text) from public;
revoke all on function public._supplier_portal_date(jsonb, text) from public;
revoke all on function public._supplier_portal_dublin_today() from public;
revoke all on function public._supplier_portal_require_supplier() from public;
revoke all on function public._supplier_portal_require_operator() from public;
revoke all on function public._supplier_portal_quote_json(uuid) from public;
revoke all on function public._supplier_portal_rfq_json(uuid, boolean) from public;

-- ---------------------------------------------------------------------
-- Supplier RPCs
-- ---------------------------------------------------------------------

-- The caller's own supplier context, or null when the session is not an
-- active supplier member (never an error -- the portal shows an honest
-- "no supplier access" state).
create or replace function public.supplier_portal_get_my_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'supplierId', o.id,
    'displayName', o.display_name,
    'role', m.role,
    'contactEmail', o.contact_email,
    'contactPhone', o.contact_phone,
    'serviceCounties', to_jsonb(o.service_counties),
    'defaultQuoteValidityDays', o.default_quote_validity_days,
    'quoteTerms', o.quote_terms
  )
  from public.supplier_portal_members m
  join public.supplier_portal_organisations o on o.id = m.supplier_id
  where m.user_id = auth.uid() and m.active and o.active
  limit 1;
$$;

create or replace function public.supplier_portal_list_rfqs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid := public._supplier_portal_require_supplier();
begin
  return coalesce((
    select jsonb_agg(public._supplier_portal_rfq_json(r.id, false) order by r.routed_at desc, r.id)
    from (
      select id, routed_at from public.supplier_portal_rfq_routes
      where supplier_id = v_supplier_id
      order by routed_at desc, id
      limit 500
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.supplier_portal_get_rfq(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid := public._supplier_portal_require_supplier();
begin
  if not exists (select 1 from public.supplier_portal_rfq_routes where id = p_route_id and supplier_id = v_supplier_id) then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: RFQ not found';
  end if;
  return public._supplier_portal_rfq_json(p_route_id, true);
end;
$$;

create or replace function public.supplier_portal_mark_rfq_viewed(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid := public._supplier_portal_require_supplier();
  v_updated integer;
begin
  if not exists (select 1 from public.supplier_portal_rfq_routes where id = p_route_id and supplier_id = v_supplier_id) then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: RFQ not found';
  end if;
  update public.supplier_portal_rfq_routes
    set supplier_first_viewed_at = now()
    where id = p_route_id and supplier_id = v_supplier_id and supplier_first_viewed_at is null;
  get diagnostics v_updated = row_count;
  if v_updated > 0 then
    insert into public.supplier_portal_events (route_id, supplier_id, event_type, actor_user_id)
      values (p_route_id, v_supplier_id, 'rfq_viewed', auth.uid());
  end if;
end;
$$;

create or replace function public.supplier_portal_decline_rfq(p_route_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid := public._supplier_portal_require_supplier();
  v_route public.supplier_portal_rfq_routes%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_route from public.supplier_portal_rfq_routes
    where id = p_route_id and supplier_id = v_supplier_id for update;
  if not found then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: RFQ not found';
  end if;
  if v_route.supplier_declined_at is not null then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: this RFQ was already declined';
  end if;
  if exists (select 1 from public.supplier_portal_quotes where route_id = p_route_id and status in ('draft', 'submitted')) then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: discard the draft or withdraw the quote before declining';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'SUPPLIER_PORTAL_INVALID: reason is longer than 500 characters';
  end if;
  update public.supplier_portal_rfq_routes
    set supplier_declined_at = now(), supplier_decline_reason = v_reason
    where id = p_route_id;
  insert into public.supplier_portal_events (route_id, supplier_id, event_type, actor_user_id, detail)
    values (p_route_id, v_supplier_id, 'rfq_declined', auth.uid(), jsonb_strip_nulls(jsonb_build_object('reason', v_reason)));
end;
$$;

-- Create (p_quote_id null) or replace the content of the caller's draft.
-- Always (re)prices against the farmer's CURRENT revision.
create or replace function public.supplier_portal_save_quote_draft(
  p_route_id uuid,
  p_quote_id uuid,
  p_expected_version integer,
  p_header jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid := public._supplier_portal_require_supplier();
  v_route public.supplier_portal_rfq_routes%rowtype;
  v_quote public.supplier_portal_quotes%rowtype;
  v_withdrawn_at timestamptz;
  v_revision_id uuid;
  v_revision_number integer;
  v_quote_id uuid;
  v_version integer;
  v_line jsonb;
  v_index integer;
  v_unit text;
  v_quantity numeric;
  v_price numeric;
  v_rate numeric;
  v_product text;
  v_charge numeric;
  v_charge_rate numeric;
  v_earliest date;
  v_latest date;
  v_valid_until date;
  v_terms text;
  v_notes text;
begin
  select * into v_route from public.supplier_portal_rfq_routes
    where id = p_route_id and supplier_id = v_supplier_id for update;
  if not found then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: RFQ not found';
  end if;
  if v_route.supplier_declined_at is not null then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: this RFQ was declined';
  end if;
  select qr.withdrawn_at, qr.current_revision_id, qrr.revision_number
    into v_withdrawn_at, v_revision_id, v_revision_number
    from public.quote_requests qr
    join public.quote_request_revisions qrr on qrr.id = qr.current_revision_id
    where qr.id = v_route.request_id;
  if v_withdrawn_at is not null then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: the farmer withdrew this request';
  end if;

  -- Validate the complete payload before writing anything.
  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception 'SUPPLIER_PORTAL_INVALID: header must be an object';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'SUPPLIER_PORTAL_INVALID: lines must be an array';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'SUPPLIER_PORTAL_INVALID: at most 50 lines';
  end if;
  v_charge := public._supplier_portal_decimal(p_header -> 'deliveryChargeExVat', 2, 'deliveryChargeExVat');
  if v_charge is not null and v_charge > 100000 then
    raise exception 'SUPPLIER_PORTAL_INVALID: deliveryChargeExVat is out of range';
  end if;
  v_charge_rate := public._supplier_portal_decimal(p_header -> 'deliveryVatRatePercent', 2, 'deliveryVatRatePercent');
  if v_charge_rate is not null and v_charge_rate > 100 then
    raise exception 'SUPPLIER_PORTAL_INVALID: deliveryVatRatePercent is out of range';
  end if;
  v_earliest := public._supplier_portal_date(p_header -> 'deliveryEarliest', 'deliveryEarliest');
  v_latest := public._supplier_portal_date(p_header -> 'deliveryLatest', 'deliveryLatest');
  if v_earliest is not null and v_latest is not null and v_earliest > v_latest then
    raise exception 'SUPPLIER_PORTAL_INVALID: deliveryEarliest must be on or before deliveryLatest';
  end if;
  v_valid_until := public._supplier_portal_date(p_header -> 'validUntil', 'validUntil');
  v_terms := public._supplier_portal_text(p_header -> 'paymentTerms', 500, 'paymentTerms');
  v_notes := public._supplier_portal_text(p_header -> 'notes', 2000, 'notes');

  for v_line, v_index in select value, ordinality::integer from jsonb_array_elements(p_lines) with ordinality loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'SUPPLIER_PORTAL_INVALID: line % must be an object', v_index;
    end if;
    v_product := public._supplier_portal_text(v_line -> 'product', 200, 'product');
    if v_product is null then
      raise exception 'SUPPLIER_PORTAL_INVALID: line % product is required', v_index;
    end if;
    perform public._supplier_portal_text(v_line -> 'description', 500, 'description');
    v_quantity := public._supplier_portal_decimal(v_line -> 'quantity', 3, 'quantity');
    if v_quantity is null or v_quantity <= 0 or v_quantity > 100000 then
      raise exception 'SUPPLIER_PORTAL_INVALID: line % quantity must be > 0 and <= 100000', v_index;
    end if;
    v_unit := v_line ->> 'unit';
    if v_unit is null or v_unit not in ('kg', 'tonnes', 'bags') then
      raise exception 'SUPPLIER_PORTAL_INVALID: line % unit must be kg, tonnes or bags', v_index;
    end if;
    v_price := public._supplier_portal_decimal(v_line -> 'unitPriceExVat', 2, 'unitPriceExVat');
    if v_price is null or v_price > 100000 then
      raise exception 'SUPPLIER_PORTAL_INVALID: line % unit price is required and must be <= 100000', v_index;
    end if;
    v_rate := public._supplier_portal_decimal(v_line -> 'vatRatePercent', 2, 'vatRatePercent');
    if v_rate is not null and v_rate > 100 then
      raise exception 'SUPPLIER_PORTAL_INVALID: line % VAT rate must be <= 100', v_index;
    end if;
  end loop;

  if p_quote_id is null then
    if exists (select 1 from public.supplier_portal_quotes where route_id = p_route_id and status in ('draft', 'submitted')) then
      raise exception 'SUPPLIER_PORTAL_CONFLICT: this RFQ already has a live quote';
    end if;
    insert into public.supplier_portal_quotes (
      route_id, supplier_id, quoted_revision_id, quoted_revision_number, status, version,
      delivery_charge_ex_vat, delivery_vat_rate_percent, delivery_earliest, delivery_latest,
      valid_until, payment_terms, notes, created_by, updated_by
    ) values (
      p_route_id, v_supplier_id, v_revision_id, v_revision_number, 'draft', 1,
      v_charge, v_charge_rate, v_earliest, v_latest,
      v_valid_until, v_terms, v_notes, auth.uid(), auth.uid()
    ) returning id, version into v_quote_id, v_version;
    insert into public.supplier_portal_events (route_id, supplier_id, quote_id, event_type, actor_user_id, detail)
      values (p_route_id, v_supplier_id, v_quote_id, 'draft_created', auth.uid(), jsonb_build_object('quotedRevisionNumber', v_revision_number));
  else
    select * into v_quote from public.supplier_portal_quotes
      where id = p_quote_id and supplier_id = v_supplier_id and route_id = p_route_id for update;
    if not found then
      raise exception 'SUPPLIER_PORTAL_NOT_FOUND: quote not found';
    end if;
    if v_quote.status <> 'draft' then
      raise exception 'SUPPLIER_PORTAL_CONFLICT: only a draft can be edited (this quote is %)', v_quote.status;
    end if;
    if p_expected_version is null or v_quote.version <> p_expected_version then
      raise exception 'SUPPLIER_PORTAL_STALE: expected version % but current is %', p_expected_version, v_quote.version;
    end if;
    update public.supplier_portal_quotes set
      quoted_revision_id = v_revision_id,
      quoted_revision_number = v_revision_number,
      version = version + 1,
      delivery_charge_ex_vat = v_charge,
      delivery_vat_rate_percent = v_charge_rate,
      delivery_earliest = v_earliest,
      delivery_latest = v_latest,
      valid_until = v_valid_until,
      payment_terms = v_terms,
      notes = v_notes,
      updated_by = auth.uid(),
      updated_at = now()
    where id = p_quote_id
    returning id, version into v_quote_id, v_version;
    delete from public.supplier_portal_quote_lines where quote_id = p_quote_id;
    insert into public.supplier_portal_events (route_id, supplier_id, quote_id, event_type, actor_user_id, detail)
      values (p_route_id, v_supplier_id, v_quote_id, 'draft_saved', auth.uid(), jsonb_build_object('version', v_version, 'quotedRevisionNumber', v_revision_number));
  end if;

  for v_line, v_index in select value, ordinality::integer from jsonb_array_elements(p_lines) with ordinality loop
    insert into public.supplier_portal_quote_lines (
      quote_id, supplier_id, line_number, product, description, quantity, unit, unit_price_ex_vat, vat_rate_percent
    ) values (
      v_quote_id, v_supplier_id, v_index,
      public._supplier_portal_text(v_line -> 'product', 200, 'product'),
      public._supplier_portal_text(v_line -> 'description', 500, 'description'),
      public._supplier_portal_decimal(v_line -> 'quantity', 3, 'quantity'),
      v_line ->> 'unit',
      public._supplier_portal_decimal(v_line -> 'unitPriceExVat', 2, 'unitPriceExVat'),
      public._supplier_portal_decimal(v_line -> 'vatRatePercent', 2, 'vatRatePercent')
    );
  end loop;

  return jsonb_build_object('quoteId', v_quote_id, 'version', v_version);
end;
$$;

create or replace function public.supplier_portal_submit_quote(p_quote_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid := public._supplier_portal_require_supplier();
  v_quote public.supplier_portal_quotes%rowtype;
  v_route public.supplier_portal_rfq_routes%rowtype;
  v_withdrawn_at timestamptz;
  v_current_revision_id uuid;
  v_version integer;
  v_route_id uuid;
begin
  -- Lock order route -> quote, the same order save_quote_draft uses, so
  -- a concurrent save and submit can never deadlock.
  select route_id into v_route_id from public.supplier_portal_quotes
    where id = p_quote_id and supplier_id = v_supplier_id;
  if v_route_id is null then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: quote not found';
  end if;
  select * into v_route from public.supplier_portal_rfq_routes
    where id = v_route_id and supplier_id = v_supplier_id for update;
  select * into v_quote from public.supplier_portal_quotes
    where id = p_quote_id and supplier_id = v_supplier_id for update;
  if v_quote.status <> 'draft' then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: only a draft can be submitted (this quote is %)', v_quote.status;
  end if;
  if p_expected_version is null or v_quote.version <> p_expected_version then
    raise exception 'SUPPLIER_PORTAL_STALE: expected version % but current is %', p_expected_version, v_quote.version;
  end if;
  if v_route.supplier_declined_at is not null then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: this RFQ was declined';
  end if;
  select withdrawn_at, current_revision_id into v_withdrawn_at, v_current_revision_id
    from public.quote_requests where id = v_route.request_id;
  if v_withdrawn_at is not null then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: the farmer withdrew this request';
  end if;
  if v_current_revision_id <> v_quote.quoted_revision_id then
    raise exception 'SUPPLIER_PORTAL_REQUEST_REVISED: the farmer changed this request -- review and save the draft again';
  end if;
  if not exists (select 1 from public.supplier_portal_quote_lines where quote_id = p_quote_id) then
    raise exception 'SUPPLIER_PORTAL_INCOMPLETE: add at least one priced line';
  end if;
  if exists (select 1 from public.supplier_portal_quote_lines where quote_id = p_quote_id and vat_rate_percent is null) then
    raise exception 'SUPPLIER_PORTAL_INCOMPLETE: every line needs a declared VAT rate';
  end if;
  if v_quote.delivery_charge_ex_vat is null then
    raise exception 'SUPPLIER_PORTAL_INCOMPLETE: the delivery charge is required (0 if included)';
  end if;
  if v_quote.delivery_charge_ex_vat > 0 and v_quote.delivery_vat_rate_percent is null then
    raise exception 'SUPPLIER_PORTAL_INCOMPLETE: the delivery charge needs a declared VAT rate';
  end if;
  if v_quote.delivery_earliest is null or v_quote.delivery_latest is null then
    raise exception 'SUPPLIER_PORTAL_INCOMPLETE: the delivery window is required';
  end if;
  if v_quote.valid_until is null or v_quote.valid_until < public._supplier_portal_dublin_today() then
    raise exception 'SUPPLIER_PORTAL_INCOMPLETE: the validity date is required and must not have passed';
  end if;

  update public.supplier_portal_quotes set
    status = 'submitted',
    totals_method = 'supplier_quote_totals_v1',
    submitted_at = now(),
    submitted_by = auth.uid(),
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_quote_id
  returning version into v_version;
  insert into public.supplier_portal_events (route_id, supplier_id, quote_id, event_type, actor_user_id, detail)
    values (v_quote.route_id, v_supplier_id, p_quote_id, 'quote_submitted', auth.uid(), jsonb_build_object('quotedRevisionNumber', v_quote.quoted_revision_number));
  return jsonb_build_object('quoteId', p_quote_id, 'version', v_version);
end;
$$;

create or replace function public.supplier_portal_withdraw_quote(p_quote_id uuid, p_expected_version integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid := public._supplier_portal_require_supplier();
  v_quote public.supplier_portal_quotes%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_quote from public.supplier_portal_quotes
    where id = p_quote_id and supplier_id = v_supplier_id for update;
  if not found then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: quote not found';
  end if;
  if v_quote.status <> 'submitted' then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: only a submitted quote can be withdrawn (this quote is %)', v_quote.status;
  end if;
  if p_expected_version is null or v_quote.version <> p_expected_version then
    raise exception 'SUPPLIER_PORTAL_STALE: expected version % but current is %', p_expected_version, v_quote.version;
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'SUPPLIER_PORTAL_INVALID: reason is longer than 500 characters';
  end if;
  update public.supplier_portal_quotes set
    status = 'withdrawn',
    withdrawn_at = now(),
    withdrawn_by = auth.uid(),
    withdraw_reason = v_reason,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_quote_id;
  insert into public.supplier_portal_events (route_id, supplier_id, quote_id, event_type, actor_user_id, detail)
    values (v_quote.route_id, v_supplier_id, p_quote_id, 'quote_withdrawn', auth.uid(), jsonb_strip_nulls(jsonb_build_object('reason', v_reason)));
end;
$$;

create or replace function public.supplier_portal_discard_draft(p_quote_id uuid, p_expected_version integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid := public._supplier_portal_require_supplier();
  v_quote public.supplier_portal_quotes%rowtype;
begin
  select * into v_quote from public.supplier_portal_quotes
    where id = p_quote_id and supplier_id = v_supplier_id for update;
  if not found then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: quote not found';
  end if;
  if v_quote.status <> 'draft' then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: only a draft can be discarded (this quote is %)', v_quote.status;
  end if;
  if p_expected_version is null or v_quote.version <> p_expected_version then
    raise exception 'SUPPLIER_PORTAL_STALE: expected version % but current is %', p_expected_version, v_quote.version;
  end if;
  update public.supplier_portal_quotes set
    status = 'discarded',
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_quote_id;
  insert into public.supplier_portal_events (route_id, supplier_id, quote_id, event_type, actor_user_id)
    values (v_quote.route_id, v_supplier_id, p_quote_id, 'draft_discarded', auth.uid());
end;
$$;

-- Supplier admins edit their own contact/settings. The display name is
-- operator-controlled (a supplier cannot rename itself to impersonate
-- another).
create or replace function public.supplier_portal_update_my_settings(
  p_contact_email text,
  p_contact_phone text,
  p_service_counties text[],
  p_default_quote_validity_days integer,
  p_quote_terms text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier_id uuid := public._supplier_portal_require_supplier();
  v_role text;
  v_counties text[];
begin
  select role into v_role from public.supplier_portal_members
    where supplier_id = v_supplier_id and user_id = auth.uid() and active;
  if v_role is distinct from 'admin' then
    raise exception 'SUPPLIER_PORTAL_FORBIDDEN: only a supplier admin can change settings' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct btrim(c) order by btrim(c)), '{}')
    into v_counties
    from unnest(coalesce(p_service_counties, '{}')) c
    where btrim(c) <> '';
  if exists (select 1 from unnest(v_counties) c where length(c) > 40) then
    raise exception 'SUPPLIER_PORTAL_INVALID: a county name is longer than 40 characters';
  end if;
  update public.supplier_portal_organisations set
    contact_email = nullif(btrim(coalesce(p_contact_email, '')), ''),
    contact_phone = nullif(btrim(coalesce(p_contact_phone, '')), ''),
    service_counties = v_counties,
    default_quote_validity_days = p_default_quote_validity_days,
    quote_terms = nullif(btrim(coalesce(p_quote_terms, '')), '')
  where id = v_supplier_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Operator RPCs (is_quote_operator_for_current_user allow-list)
-- ---------------------------------------------------------------------

create or replace function public.supplier_portal_operator_create_supplier(p_display_name text, p_contact_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public._supplier_portal_require_operator();
  insert into public.supplier_portal_organisations (display_name, contact_email, created_by)
    values (btrim(p_display_name), nullif(btrim(coalesce(p_contact_email, '')), ''), auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;

-- Links an EXISTING Farm Return account (looked up by its sign-in email)
-- to a supplier. Never creates an account or sends an invitation.
create or replace function public.supplier_portal_operator_grant_member(p_supplier_id uuid, p_user_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  perform public._supplier_portal_require_operator();
  if p_role not in ('admin', 'member') then
    raise exception 'SUPPLIER_PORTAL_INVALID: role must be admin or member';
  end if;
  if not exists (select 1 from public.supplier_portal_organisations where id = p_supplier_id and active) then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: supplier not found or inactive';
  end if;
  select id into v_user_id from auth.users where lower(email) = lower(btrim(p_user_email)) limit 1;
  if v_user_id is null then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: no Farm Return account uses that email -- the person must sign up first';
  end if;
  if exists (select 1 from public.supplier_portal_members where user_id = v_user_id and active and supplier_id <> p_supplier_id) then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: that account is already an active member of another supplier';
  end if;
  insert into public.supplier_portal_members (supplier_id, user_id, role, active, granted_by, granted_at, revoked_at)
    values (p_supplier_id, v_user_id, p_role, true, auth.uid(), now(), null)
    on conflict (supplier_id, user_id) do update
      set role = excluded.role, active = true, granted_by = excluded.granted_by, granted_at = excluded.granted_at, revoked_at = null;
  return v_user_id;
end;
$$;

create or replace function public.supplier_portal_operator_revoke_member(p_supplier_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  perform public._supplier_portal_require_operator();
  update public.supplier_portal_members
    set active = false, revoked_at = now()
    where supplier_id = p_supplier_id and user_id = p_user_id and active;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: no active membership to revoke';
  end if;
end;
$$;

-- Routes one real, active farmer request to one supplier. Idempotent per
-- (supplier, request): a repeat returns the existing route.
create or replace function public.supplier_portal_operator_route_request(p_request_id uuid, p_supplier_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route_id uuid;
  v_withdrawn_at timestamptz;
begin
  perform public._supplier_portal_require_operator();
  select withdrawn_at into v_withdrawn_at from public.quote_requests where id = p_request_id;
  if not found then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: quote request not found';
  end if;
  if v_withdrawn_at is not null then
    raise exception 'SUPPLIER_PORTAL_CONFLICT: the farmer withdrew this request';
  end if;
  if not exists (select 1 from public.supplier_portal_organisations where id = p_supplier_id and active) then
    raise exception 'SUPPLIER_PORTAL_NOT_FOUND: supplier not found or inactive';
  end if;
  select id into v_route_id from public.supplier_portal_rfq_routes
    where supplier_id = p_supplier_id and request_id = p_request_id;
  if v_route_id is not null then
    return v_route_id;
  end if;
  begin
    insert into public.supplier_portal_rfq_routes (supplier_id, request_id, routed_by)
      values (p_supplier_id, p_request_id, auth.uid())
      returning id into v_route_id;
  exception when unique_violation then
    select id into v_route_id from public.supplier_portal_rfq_routes
      where supplier_id = p_supplier_id and request_id = p_request_id;
    return v_route_id;
  end;
  insert into public.supplier_portal_events (route_id, supplier_id, event_type, actor_user_id)
    values (v_route_id, p_supplier_id, 'rfq_routed', auth.uid());
  return v_route_id;
end;
$$;

create or replace function public.supplier_portal_operator_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform public._supplier_portal_require_operator();
  return jsonb_build_object(
    'suppliers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'displayName', o.display_name,
        'contactEmail', o.contact_email,
        'active', o.active,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', u.email, 'role', m.role, 'active', m.active) order by u.email)
          from public.supplier_portal_members m join auth.users u on u.id = m.user_id
          where m.supplier_id = o.id
        ), '[]'::jsonb)
      ) order by o.display_name)
      from public.supplier_portal_organisations o
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'routeId', r.id,
        'requestId', r.request_id,
        'supplierId', r.supplier_id,
        'routedAt', r.routed_at,
        'firstViewedAt', r.supplier_first_viewed_at,
        'declinedAt', r.supplier_declined_at,
        'liveQuoteStatus', (
          select q.status from public.supplier_portal_quotes q
          where q.route_id = r.id and q.status in ('draft', 'submitted') limit 1
        )
      ) order by r.routed_at desc)
      from public.supplier_portal_rfq_routes r
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: PUBLIC revoked everywhere; authenticated only on entry points.
-- ---------------------------------------------------------------------

revoke all on function public.supplier_portal_get_my_context() from public;
revoke all on function public.supplier_portal_list_rfqs() from public;
revoke all on function public.supplier_portal_get_rfq(uuid) from public;
revoke all on function public.supplier_portal_mark_rfq_viewed(uuid) from public;
revoke all on function public.supplier_portal_decline_rfq(uuid, text) from public;
revoke all on function public.supplier_portal_save_quote_draft(uuid, uuid, integer, jsonb, jsonb) from public;
revoke all on function public.supplier_portal_submit_quote(uuid, integer) from public;
revoke all on function public.supplier_portal_withdraw_quote(uuid, integer, text) from public;
revoke all on function public.supplier_portal_discard_draft(uuid, integer) from public;
revoke all on function public.supplier_portal_update_my_settings(text, text, text[], integer, text) from public;
revoke all on function public.supplier_portal_operator_create_supplier(text, text) from public;
revoke all on function public.supplier_portal_operator_grant_member(uuid, text, text) from public;
revoke all on function public.supplier_portal_operator_revoke_member(uuid, uuid) from public;
revoke all on function public.supplier_portal_operator_route_request(uuid, uuid) from public;
revoke all on function public.supplier_portal_operator_overview() from public;

grant execute on function public.supplier_portal_get_my_context() to authenticated;
grant execute on function public.supplier_portal_list_rfqs() to authenticated;
grant execute on function public.supplier_portal_get_rfq(uuid) to authenticated;
grant execute on function public.supplier_portal_mark_rfq_viewed(uuid) to authenticated;
grant execute on function public.supplier_portal_decline_rfq(uuid, text) to authenticated;
grant execute on function public.supplier_portal_save_quote_draft(uuid, uuid, integer, jsonb, jsonb) to authenticated;
grant execute on function public.supplier_portal_submit_quote(uuid, integer) to authenticated;
grant execute on function public.supplier_portal_withdraw_quote(uuid, integer, text) to authenticated;
grant execute on function public.supplier_portal_discard_draft(uuid, integer) to authenticated;
grant execute on function public.supplier_portal_update_my_settings(text, text, text[], integer, text) to authenticated;
grant execute on function public.supplier_portal_operator_create_supplier(text, text) to authenticated;
grant execute on function public.supplier_portal_operator_grant_member(uuid, text, text) to authenticated;
grant execute on function public.supplier_portal_operator_revoke_member(uuid, uuid) to authenticated;
grant execute on function public.supplier_portal_operator_route_request(uuid, uuid) to authenticated;
grant execute on function public.supplier_portal_operator_overview() to authenticated;
