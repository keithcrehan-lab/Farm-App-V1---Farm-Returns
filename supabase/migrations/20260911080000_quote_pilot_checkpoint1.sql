-- Managed Quote Pilot, Checkpoint 1 -- farmer request creation/revision/
-- withdrawal, reusable delivery details, and the operator's demand
-- inbox read surface. Scope and design:
-- docs/farm-return-next/MANAGED_QUOTE_PILOT_ARCHITECTURE.md sections
-- 4-6. Out of scope this migration (Checkpoints 2-3): quote_suppliers,
-- quote_enquiry_batches/_batch_lines, quote_enquiry_dispatches,
-- quote_supplier_responses, quote_farmer_offers, quote_offer_allocations,
-- quote_farmer_interest, quote_workflow_events.
--
-- STATUS: VALIDATED_DEV (2026-09-11) -- applied to Farm Return V1 Dev
-- (`whevugeisqlpfnrugfsd`, identified via .env.local + `supabase
-- projects list`, not guessed) via `supabase db push --linked`, no
-- errors. The companion validation script
-- (supabase/validation/quote_pilot_checkpoint1_rls_validation.sql) was
-- run for real against that same project -- 19/19 checks passed after
-- two real bugs in the validator itself (not this migration) were found
-- and fixed on its first live run. Full account:
-- docs/validation/quote-pilot-checkpoint1-dev-validation.md. Never
-- applied to production -- this account has no production project.
--
-- OPERATOR AUTHORITY: a new, narrow allow-list table (quote_operators),
-- never derived from farms.user_id or any farmer-editable field
-- (repository-review R3; architecture doc section 4). No self-serve
-- membership UI is built this pilot -- the one operator row is inserted
-- manually by the product owner once their own auth.users.id is known
-- (outstanding decision, architecture doc section 8), e.g.:
--   insert into public.quote_operators (user_id, granted_by, note)
--   values ('<owner-auth-uid>', '<owner-auth-uid>', 'Pilot operator (product owner)');
-- This migration does not perform that insert itself -- it would be a
-- guess at the owner's real user id, exactly what the owner asked this
-- build not to do.
--
-- CROSS-FARM LINEAGE: every parent/child relationship below uses the
-- "shared discriminator column, two/three composite foreign keys"
-- pattern the architecture doc's own Codex-audited section 5 requires --
-- a bare id reference trusted alongside an independently-set farm_id is
-- exactly the gap three audit rounds found and fixed at the document
-- level; this migration is that fix applied to real SQL, not a repeat of
-- the same shortcut.
--
-- WRITE PATH: farmers never insert/update quote_requests,
-- quote_request_revisions or quote_request_delivery_snapshots directly --
-- all three are written only by the security-definer RPCs below
-- (submit_quote_request / revise_quote_request / withdraw_quote_request),
-- the same "RPC-gated, security definer, explicit ownership checks
-- re-implemented inside the function" discipline
-- 20260829010000_decisions_jobs_client_access.sql already established
-- for this schema's very first security-definer functions (RLS does not
-- apply inside a security definer function -- CLAUDE.md's "never assume
-- RLS is the only enforcement layer" applied here with equal force).
-- Submit/revise are each exactly one RPC call, matching the architecture
-- doc's own atomicity requirement (a Server Action performs no other
-- write of its own).

-- ---------------------------------------------------------------------
-- quote_operators
-- ---------------------------------------------------------------------

create table public.quote_operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active boolean not null default true,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  note text
);

alter table public.quote_operators enable row level security;
-- Deliberately no policy at all for `authenticated` -- nobody can read
-- or write this table directly, not even their own row. The only way to
-- check membership is the security-definer helper below.
revoke all on public.quote_operators from anon, authenticated;

create or replace function public.is_quote_operator(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.quote_operators
    where user_id = p_user_id and active
  );
$$;

grant execute on function public.is_quote_operator(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- farm_delivery_details -- reusable, farmer-owned; a plain farmer-CRUD
-- table, the same ownership pattern supplier_quotes already uses. Not
-- itself sent anywhere -- a request's own delivery snapshot (below) is
-- the immutable copy that travels with a sent enquiry.
-- ---------------------------------------------------------------------

create table public.farm_delivery_details (
  farm_id uuid primary key references public.farms (id) on delete cascade,
  contact_name text not null,
  contact_phone text,
  contact_email text,
  address_line1 text not null,
  address_line2 text,
  town_or_city text not null,
  county text not null,
  eircode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger farm_delivery_details_set_updated_at
  before update on public.farm_delivery_details
  for each row execute function public.set_updated_at();

alter table public.farm_delivery_details enable row level security;

create policy "farm_delivery_details_owner_all" on public.farm_delivery_details
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.farm_delivery_details from anon;
grant select, insert, update, delete on public.farm_delivery_details to authenticated;

-- ---------------------------------------------------------------------
-- quote_requests -- one row per farmer ask; current_revision_id always
-- points at the latest immutable revision. idempotency_key (brief Q02):
-- a client-generated key, unique per farm, lets a retried submit return
-- the existing request instead of creating duplicate demand.
-- ---------------------------------------------------------------------

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  idempotency_key text not null,
  -- Nullable only for the instant between this row's own insert and its
  -- first revision's insert inside submit_quote_request's single
  -- transaction -- never observably null to any reader outside that
  -- function, since both statements commit or roll back together.
  current_revision_id uuid,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, farm_id),
  unique (farm_id, idempotency_key)
);

create index quote_requests_farm_id_idx on public.quote_requests (farm_id);

alter table public.quote_requests enable row level security;

create policy "quote_requests_farmer_read_own" on public.quote_requests
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "quote_requests_operator_read" on public.quote_requests
  for select
  to authenticated
  using (public.is_quote_operator((select auth.uid())));

-- No insert/update/delete policy at all -- every write goes through the
-- security-definer RPCs below, which run as their owning role and are
-- therefore ungated by RLS; the table-level grant is select-only.
revoke all on public.quote_requests from anon;
grant select on public.quote_requests to authenticated;

-- ---------------------------------------------------------------------
-- quote_request_revisions -- immutable once inserted; a revise creates a
-- new row and repoints quote_requests.current_revision_id, never edits
-- an existing revision.
-- ---------------------------------------------------------------------

create table public.quote_request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  farm_id uuid not null,
  revision_number integer not null check (revision_number >= 1),
  product text not null check (length(trim(product)) > 0),
  quantity numeric not null check (quantity > 0 and quantity = quantity and quantity < 'Infinity'),
  unit text not null check (unit in ('kg', 'tonnes', 'bags')),
  packaging text,
  quantity_basis text not null check (quantity_basis in ('estimated', 'farmer_entered')),
  -- Present iff quantity_basis = 'estimated' -- mirrors
  -- src/domain/quote-request.ts's QuoteRequestEstimateSnapshot exactly;
  -- the CHECK below keeps that pairing enforced at the database layer
  -- too, not only in the RPC/domain validation above it.
  estimate_snapshot jsonb,
  delivery_window_start date not null,
  delivery_window_end date not null,
  created_at timestamptz not null default now(),
  check (delivery_window_start <= delivery_window_end),
  check (
    (quantity_basis = 'estimated' and estimate_snapshot is not null)
    or (quantity_basis = 'farmer_entered' and estimate_snapshot is null)
  ),
  unique (id, farm_id),
  unique (request_id, revision_number),
  -- Composite FK, shared-discriminator-column pattern (architecture doc
  -- section 5, Codex-audited): a revision's own farm_id must match its
  -- request's farm_id -- the database itself rejects a mismatch, not
  -- only application code.
  foreign key (request_id, farm_id) references public.quote_requests (id, farm_id) on delete cascade
);

create index quote_request_revisions_request_id_idx on public.quote_request_revisions (request_id);
create index quote_request_revisions_farm_id_idx on public.quote_request_revisions (farm_id);

-- The other half of the same pattern: quote_requests.current_revision_id
-- must resolve to a revision whose own farm_id matches the request's --
-- added after quote_request_revisions exists, since it references it.
alter table public.quote_requests
  add constraint quote_requests_current_revision_same_farm
  foreign key (current_revision_id, farm_id) references public.quote_request_revisions (id, farm_id);

alter table public.quote_request_revisions enable row level security;

create policy "quote_request_revisions_farmer_read_own" on public.quote_request_revisions
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "quote_request_revisions_operator_read" on public.quote_request_revisions
  for select
  to authenticated
  using (public.is_quote_operator((select auth.uid())));

revoke all on public.quote_request_revisions from anon;
grant select on public.quote_request_revisions to authenticated;

-- ---------------------------------------------------------------------
-- quote_request_delivery_snapshots -- immutable copy of
-- farm_delivery_details taken at submission/revision time (brief Q09: a
-- later profile edit never rewrites a sent snapshot). One per revision.
-- Farmer-read only this checkpoint -- operator read is deferred to
-- Checkpoint 2, when enquiry generation is the first real reason an
-- operator needs to see a delivery address at all (least-privilege:
-- Checkpoint 1's demand inbox needs product/quantity/unit/window/status
-- only, never an address).
-- ---------------------------------------------------------------------

create table public.quote_request_delivery_snapshots (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null,
  farm_id uuid not null,
  contact_name text not null,
  contact_phone text,
  contact_email text,
  address_line1 text not null,
  address_line2 text,
  town_or_city text not null,
  county text not null,
  eircode text,
  created_at timestamptz not null default now(),
  unique (revision_id),
  foreign key (revision_id, farm_id) references public.quote_request_revisions (id, farm_id) on delete cascade
);

create index quote_request_delivery_snapshots_farm_id_idx on public.quote_request_delivery_snapshots (farm_id);

alter table public.quote_request_delivery_snapshots enable row level security;

create policy "quote_request_delivery_snapshots_farmer_read_own" on public.quote_request_delivery_snapshots
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.quote_request_delivery_snapshots from anon;
grant select on public.quote_request_delivery_snapshots to authenticated;

-- ---------------------------------------------------------------------
-- RPCs -- submit / revise / withdraw. Each is one atomic transaction
-- (a single PL/pgSQL function body), security definer so it can write
-- to tables `authenticated` has no direct write grant on, with its own
-- explicit ownership check as the first real statement in every branch
-- (RLS does not apply inside a security definer function).
--
-- `_validate_quote_request_payload` (below) is a private helper, not
-- granted `execute` to `authenticated` -- a security-definer caller
-- reaches it under its own owning role regardless of grants, exactly
-- like the two RPCs below reach the tables they write to. Added after
-- Codex audit MEDIUM (Checkpoint 1 review, `20260911T115909Z.md`): the
-- first version of these RPCs re-validated only quantity/unit/
-- quantityBasis/delivery-window-ordering, silently trusting a direct
-- caller for product/packaging non-emptiness, the delivery contact/
-- address fields' non-emptiness, and the estimate_snapshot's own real
-- shape (only "is not null" was checked) -- every one of those *is*
-- checked by `src/domain/quote-request.ts`'s TypeScript validators, but
-- a direct RPC call bypassing that layer had nothing else re-checking
-- them at the actual write boundary. This closes that gap for both
-- RPCs from one shared definition, rather than drifting two copies.
-- ---------------------------------------------------------------------

create or replace function public._validate_quote_request_payload(
  p_product text,
  p_quantity numeric,
  p_unit text,
  p_packaging text,
  p_quantity_basis text,
  p_estimate_snapshot jsonb,
  p_delivery_window_start date,
  p_delivery_window_end date,
  p_contact_name text,
  p_address_line1 text,
  p_town_or_city text,
  p_county text
)
returns void
language plpgsql
as $$
begin
  if p_product is null or btrim(p_product) = '' then
    raise exception 'quote_request: product must be a non-empty string';
  end if;
  if p_quantity is null or not (p_quantity > 0) or p_quantity = 'NaN'::numeric then
    raise exception 'quote_request: quantity must be a real, finite, positive number';
  end if;
  if p_unit not in ('kg', 'tonnes', 'bags') then
    raise exception 'quote_request: unrecognised unit %', p_unit;
  end if;
  if p_packaging is not null and btrim(p_packaging) = '' then
    raise exception 'quote_request: packaging, if present, must be a non-empty string';
  end if;
  if p_quantity_basis not in ('estimated', 'farmer_entered') then
    raise exception 'quote_request: unrecognised quantityBasis %', p_quantity_basis;
  end if;
  if p_quantity_basis = 'estimated' then
    if p_estimate_snapshot is null then
      raise exception 'quote_request: estimateSnapshot is required when quantityBasis is estimated';
    end if;
    if not (
      p_estimate_snapshot ? 'remainingRequirementKg'
      and p_estimate_snapshot ? 'truncated'
      and p_estimate_snapshot ? 'applicationsWithUnknownComposition'
      and p_estimate_snapshot ? 'fieldsWithBlockedEvidence'
      and p_estimate_snapshot ? 'asOf'
    ) then
      raise exception 'quote_request: estimateSnapshot is missing a required field';
    end if;
    if jsonb_typeof(p_estimate_snapshot->'remainingRequirementKg') <> 'number'
       or (p_estimate_snapshot->>'remainingRequirementKg')::numeric < 0 then
      raise exception 'quote_request: estimateSnapshot.remainingRequirementKg must be a real, non-negative number';
    end if;
    if jsonb_typeof(p_estimate_snapshot->'truncated') <> 'boolean' then
      raise exception 'quote_request: estimateSnapshot.truncated must be a boolean';
    end if;
    if jsonb_typeof(p_estimate_snapshot->'applicationsWithUnknownComposition') <> 'number'
       or (p_estimate_snapshot->>'applicationsWithUnknownComposition')::numeric < 0 then
      raise exception 'quote_request: estimateSnapshot.applicationsWithUnknownComposition must be a real, non-negative number';
    end if;
    if jsonb_typeof(p_estimate_snapshot->'fieldsWithBlockedEvidence') <> 'number'
       or (p_estimate_snapshot->>'fieldsWithBlockedEvidence')::numeric < 0 then
      raise exception 'quote_request: estimateSnapshot.fieldsWithBlockedEvidence must be a real, non-negative number';
    end if;
    if jsonb_typeof(p_estimate_snapshot->'asOf') <> 'string' then
      raise exception 'quote_request: estimateSnapshot.asOf must be a string';
    end if;
  elsif p_estimate_snapshot is not null then
    raise exception 'quote_request: estimateSnapshot must be omitted when quantityBasis is farmer_entered';
  end if;
  if p_delivery_window_start is null or p_delivery_window_end is null then
    raise exception 'quote_request: delivery window start/end are required';
  end if;
  if p_delivery_window_start > p_delivery_window_end then
    raise exception 'quote_request: delivery window start must be on or before end';
  end if;
  if p_contact_name is null or btrim(p_contact_name) = '' then
    raise exception 'quote_request: contact name must be a non-empty string';
  end if;
  if p_address_line1 is null or btrim(p_address_line1) = '' then
    raise exception 'quote_request: address line 1 must be a non-empty string';
  end if;
  if p_town_or_city is null or btrim(p_town_or_city) = '' then
    raise exception 'quote_request: town/city must be a non-empty string';
  end if;
  if p_county is null or btrim(p_county) = '' then
    raise exception 'quote_request: county must be a non-empty string';
  end if;
end;
$$;

create or replace function public.submit_quote_request(
  p_idempotency_key text,
  p_product text,
  p_quantity numeric,
  p_unit text,
  p_packaging text,
  p_quantity_basis text,
  p_estimate_snapshot jsonb,
  p_delivery_window_start date,
  p_delivery_window_end date,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address_line1 text,
  p_address_line2 text,
  p_town_or_city text,
  p_county text,
  p_eircode text
)
returns table (request_id uuid, revision_id uuid, revision_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm_id uuid;
  v_existing_request_id uuid;
  v_request_id uuid;
  v_revision_id uuid;
begin
  select id into v_farm_id from public.farms where user_id = auth.uid() order by created_at asc limit 1;
  if v_farm_id is null then
    raise exception 'submit_quote_request: no real farm for the current session';
  end if;

  -- Codex audit HIGH (Checkpoint 1 verification review,
  -- `20260911T121215Z.md`): the TypeScript validator trims `product`/
  -- `packaging` before this RPC ever sees them, but the RPC itself
  -- stored whatever it was given -- a direct caller could submit
  -- "18-6-12" and " 18-6-12 " as two different products, landing in two
  -- different demand groups despite being the same real product.
  -- Normalised here, at the actual write boundary, not only upstream.
  p_product := btrim(p_product);
  if p_packaging is not null then
    p_packaging := btrim(p_packaging);
  end if;

  -- Idempotency (brief Q02): a retried submit with the same key returns
  -- the request already created by the first attempt, never a second
  -- one, and never re-counts its quantity. This first check is a fast
  -- path only -- the real guarantee is the exception handler below,
  -- which also closes the race between this check and the insert.
  select id into v_existing_request_id
    from public.quote_requests
    where farm_id = v_farm_id and idempotency_key = p_idempotency_key;
  if v_existing_request_id is not null then
    return query
      select qr.id, qr.current_revision_id, qrr.revision_number
      from public.quote_requests qr
      join public.quote_request_revisions qrr on qrr.id = qr.current_revision_id
      where qr.id = v_existing_request_id;
    return;
  end if;

  -- Defense-in-depth re-validation -- the Server Action already calls
  -- src/domain/quote-request.ts's validateQuoteRequestRevisionInput;
  -- this function never trusts that as the only gate (CLAUDE.md's "never
  -- assume application code is the only writer").
  perform public._validate_quote_request_payload(
    p_product, p_quantity, p_unit, p_packaging, p_quantity_basis, p_estimate_snapshot,
    p_delivery_window_start, p_delivery_window_end, p_contact_name, p_address_line1, p_town_or_city, p_county
  );

  v_request_id := gen_random_uuid();
  v_revision_id := gen_random_uuid();

  -- Codex audit HIGH (Checkpoint 1 review, `20260911T115909Z.md`): the
  -- read-then-insert above is not itself atomic -- two concurrent
  -- submits with the same (farm_id, idempotency_key) can both pass the
  -- check above, race the unique constraint, and the loser would
  -- previously have raised a raw constraint-violation error instead of
  -- returning the winner's real request, breaking the documented Q02
  -- contract under concurrency. Fixed with an explicit exception
  -- handler: Postgres blocks the losing insert on the winner's row lock
  -- until the winner COMMITS (or rolls back), so by the time this
  -- handler's own re-select runs, the winning transaction's request,
  -- revision AND delivery snapshot are all guaranteed fully committed
  -- and visible -- never a partially-formed row.
  begin
    insert into public.quote_requests (id, farm_id, idempotency_key, current_revision_id)
      values (v_request_id, v_farm_id, p_idempotency_key, null);
  exception when unique_violation then
    return query
      select qr.id, qr.current_revision_id, qrr.revision_number
      from public.quote_requests qr
      join public.quote_request_revisions qrr on qrr.id = qr.current_revision_id
      where qr.farm_id = v_farm_id and qr.idempotency_key = p_idempotency_key;
    return;
  end;

  insert into public.quote_request_revisions (
    id, request_id, farm_id, revision_number, product, quantity, unit, packaging,
    quantity_basis, estimate_snapshot, delivery_window_start, delivery_window_end
  ) values (
    v_revision_id, v_request_id, v_farm_id, 1, p_product, p_quantity, p_unit, p_packaging,
    p_quantity_basis, p_estimate_snapshot, p_delivery_window_start, p_delivery_window_end
  );

  update public.quote_requests set current_revision_id = v_revision_id where id = v_request_id;

  insert into public.quote_request_delivery_snapshots (
    id, revision_id, farm_id, contact_name, contact_phone, contact_email,
    address_line1, address_line2, town_or_city, county, eircode
  ) values (
    gen_random_uuid(), v_revision_id, v_farm_id, p_contact_name, p_contact_phone, p_contact_email,
    p_address_line1, p_address_line2, p_town_or_city, p_county, p_eircode
  );

  return query select v_request_id, v_revision_id, 1;
end;
$$;

grant execute on function public.submit_quote_request(
  text, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.revise_quote_request(
  p_request_id uuid,
  p_expected_revision_number integer,
  p_product text,
  p_quantity numeric,
  p_unit text,
  p_packaging text,
  p_quantity_basis text,
  p_estimate_snapshot jsonb,
  p_delivery_window_start date,
  p_delivery_window_end date,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address_line1 text,
  p_address_line2 text,
  p_town_or_city text,
  p_county text,
  p_eircode text
)
returns table (request_id uuid, revision_id uuid, revision_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm_id uuid;
  v_current_revision_number integer;
  v_withdrawn_at timestamptz;
  v_new_revision_number integer;
  v_revision_id uuid;
begin
  select id into v_farm_id from public.farms where user_id = auth.uid() order by created_at asc limit 1;
  if v_farm_id is null then
    raise exception 'revise_quote_request: no real farm for the current session';
  end if;

  -- Normalised here too -- see submit_quote_request's own identical
  -- comment (Codex audit HIGH, `20260911T121215Z.md`).
  p_product := btrim(p_product);
  if p_packaging is not null then
    p_packaging := btrim(p_packaging);
  end if;

  -- `for update` locks the request row for the rest of this
  -- transaction, serialising a concurrent revise against the same
  -- request (brief Q14: stale concurrent edits must not silently
  -- overwrite each other).
  select qrr.revision_number, qr.withdrawn_at
    into v_current_revision_number, v_withdrawn_at
    from public.quote_requests qr
    join public.quote_request_revisions qrr on qrr.id = qr.current_revision_id
    where qr.id = p_request_id and qr.farm_id = v_farm_id
    for update of qr;

  if v_current_revision_number is null then
    raise exception 'revise_quote_request: request not found, or not owned by this farm';
  end if;
  if v_withdrawn_at is not null then
    raise exception 'revise_quote_request: cannot revise a withdrawn request';
  end if;
  if v_current_revision_number <> p_expected_revision_number then
    raise exception 'STALE_REVISION: expected revision % but current is %', p_expected_revision_number, v_current_revision_number;
  end if;

  perform public._validate_quote_request_payload(
    p_product, p_quantity, p_unit, p_packaging, p_quantity_basis, p_estimate_snapshot,
    p_delivery_window_start, p_delivery_window_end, p_contact_name, p_address_line1, p_town_or_city, p_county
  );

  v_new_revision_number := v_current_revision_number + 1;
  v_revision_id := gen_random_uuid();

  insert into public.quote_request_revisions (
    id, request_id, farm_id, revision_number, product, quantity, unit, packaging,
    quantity_basis, estimate_snapshot, delivery_window_start, delivery_window_end
  ) values (
    v_revision_id, p_request_id, v_farm_id, v_new_revision_number, p_product, p_quantity, p_unit, p_packaging,
    p_quantity_basis, p_estimate_snapshot, p_delivery_window_start, p_delivery_window_end
  );

  update public.quote_requests set current_revision_id = v_revision_id where id = p_request_id;

  insert into public.quote_request_delivery_snapshots (
    id, revision_id, farm_id, contact_name, contact_phone, contact_email,
    address_line1, address_line2, town_or_city, county, eircode
  ) values (
    gen_random_uuid(), v_revision_id, v_farm_id, p_contact_name, p_contact_phone, p_contact_email,
    p_address_line1, p_address_line2, p_town_or_city, p_county, p_eircode
  );

  return query select p_request_id, v_revision_id, v_new_revision_number;
end;
$$;

grant execute on function public.revise_quote_request(
  uuid, integer, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.withdraw_quote_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm_id uuid;
  v_updated integer;
begin
  select id into v_farm_id from public.farms where user_id = auth.uid() order by created_at asc limit 1;
  if v_farm_id is null then
    raise exception 'withdraw_quote_request: no real farm for the current session';
  end if;

  update public.quote_requests
    set withdrawn_at = now()
    where id = p_request_id and farm_id = v_farm_id and withdrawn_at is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'withdraw_quote_request: request not found, not owned by this farm, or already withdrawn';
  end if;
end;
$$;

grant execute on function public.withdraw_quote_request(uuid) to authenticated;
