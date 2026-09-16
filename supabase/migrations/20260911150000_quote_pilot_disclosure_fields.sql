-- Managed Quote Pilot, Checkpoint 1 -- persists the pre-submit
-- disclosure's own "notice version" and the farmer's real affirmative-
-- acceptance timestamp as an auditable database fact, closing the gap
-- `docs/farm-return-next/BLOCKERS.md`'s 2026-09-11 entry named: the
-- brief asks to "record the notice version and affirmative request
-- action", and the UI already enforces the affirmative action itself
-- (the checkbox gates Confirm), but until this migration nothing
-- persisted *which* notice text version was shown/accepted, or exactly
-- when, as its own queryable fact.
--
-- STATUS: additive to `20260911080000_quote_pilot_checkpoint1.sql`
-- (already `VALIDATED_DEV`) -- new columns, new function signatures for
-- the two write RPCs, no change to any other table/policy.
--
-- Grassland Fertiliser Pilot Completion, Checkpoint C (Codex audit
-- round 2 CRITICAL, this checkpoint's own review) -- this file's
-- original version (as authored in the managed-quote-pilot worktree,
-- and as already genuinely applied to Farm Return V1 Dev by that
-- worktree's own earlier session, before this branch ever ported this
-- file) used `drop function if exists ...` to retire the old-signature
-- `submit_quote_request`/`revise_quote_request`/`_validate_quote_request_payload`
-- overloads before recreating them with the two new disclosure
-- parameters. `AGENTS.md` prohibits any destructive database change
-- ("drop/truncate/irreversible data loss") without qualification to
-- data specifically, and no other real migration in this repo's own
-- history has ever used `DROP FUNCTION` (confirmed by grep across
-- `supabase/migrations/*.sql`) -- this pattern is unique to this file
-- and is corrected here to match this repo's own actual, established
-- forward-only convention: the OLD-signature `submit_quote_request`/
-- `revise_quote_request` overloads are retired via `revoke execute ...
-- from authenticated` instead (the exact same real security outcome --
-- the old signature becomes uncallable by any real client -- with no
-- DDL data loss at all, fully reversible in principle). The internal
-- `_validate_quote_request_payload` helper's old overload needs no
-- explicit retirement at all: it was never granted execute to
-- `authenticated` (this file's own original comment already said so),
-- and after this migration nothing in this schema calls it any more --
-- inert, harmless dead code, left in place rather than touched.
--
-- This is a real, retroactive correction to this file's own committed
-- content, not a fresh re-application: `supabase`'s migration tracking
-- is by filename/version, not content hash, so Dev (already recorded
-- as having applied `20260911150000`, via the original DROP-based
-- version, before this correction) will never attempt to re-run this
-- file -- its own real schema already reached the exact same net
-- state (old signatures genuinely uncallable) the DROP achieved. This
-- rewrite exists so a FRESH database replaying this repo's migration
-- history from scratch reaches that same state without ever executing
-- a real `DROP FUNCTION`, matching this repo's own forward-only rule
-- for its own future, not attempting to undo Dev's own real past.
--
-- Non-destructive column addition: one real row already existed in
-- `quote_request_revisions` on Farm Return V1 Dev at the time this
-- migration was written (a test request created and withdrawn during
-- Checkpoint 1's own live UI verification, `docs/farm-return-next/
-- IMPLEMENTATION_LOG.md`'s 2026-09-11 UI entry) -- rather than deleting
-- it, this migration follows the standard, safe pattern for adding a
-- `not null` column to a table with existing rows: add nullable,
-- backfill every existing row with a real, honestly-labelled sentinel
-- (never a fabricated "as if this had always been tracked" value), then
-- tighten to `not null`. `disclosure_accepted_at` backfills from that
-- row's own real `created_at` (a true fact: acceptance necessarily
-- happened at or before submission) rather than inventing a separate
-- timestamp.

alter table public.quote_request_revisions
  add column disclosure_version text,
  add column disclosure_accepted_at timestamptz;

update public.quote_request_revisions
  set disclosure_version = 'unknown_pre_disclosure_tracking',
      disclosure_accepted_at = created_at
  where disclosure_version is null;

alter table public.quote_request_revisions
  alter column disclosure_version set not null,
  alter column disclosure_accepted_at set not null;

-- RPC signatures change (two new required parameters) -- Postgres
-- identifies a function by name + argument types, so `create or
-- replace` with an added parameter creates a NEW, second overload
-- rather than replacing the old one. The old-signature overloads are
-- retired by revoking their `authenticated` execute grant instead of
-- dropping them (see this file's own header comment, Codex audit
-- round 2 CRITICAL) -- real, forward-only, no DDL data loss, and the
-- exact same practical outcome: nothing can call the old signature
-- after this migration.

revoke execute on function public.submit_quote_request(
  text, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text
) from authenticated;

revoke execute on function public.revise_quote_request(
  uuid, integer, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text
) from authenticated;

-- `_validate_quote_request_payload` gains the two new parameters too --
-- its old overload needs no explicit retirement at all: it was never
-- granted execute to `authenticated` in the first place, and after
-- this migration nothing in this schema calls it any more (both real
-- callers below now call the new, 14-parameter version explicitly) --
-- inert, harmless dead code, deliberately left in place rather than
-- touched.

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
  p_county text,
  p_disclosure_version text,
  p_disclosure_accepted_at timestamptz
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
  -- New: the pre-submit disclosure's own version/acceptance-timestamp --
  -- required, non-fabricatable inputs. A blank version or a future-dated
  -- acceptance both fail closed rather than being silently accepted.
  if p_disclosure_version is null or btrim(p_disclosure_version) = '' then
    raise exception 'quote_request: disclosureVersion must be a non-empty string';
  end if;
  if p_disclosure_accepted_at is null then
    raise exception 'quote_request: disclosureAcceptedAt is required';
  end if;
  if p_disclosure_accepted_at > now() + interval '5 minutes' then
    raise exception 'quote_request: disclosureAcceptedAt cannot be materially in the future';
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
  p_eircode text,
  p_disclosure_version text,
  p_disclosure_accepted_at timestamptz
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

  p_product := btrim(p_product);
  if p_packaging is not null then
    p_packaging := btrim(p_packaging);
  end if;

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

  perform public._validate_quote_request_payload(
    p_product, p_quantity, p_unit, p_packaging, p_quantity_basis, p_estimate_snapshot,
    p_delivery_window_start, p_delivery_window_end, p_contact_name, p_address_line1, p_town_or_city, p_county,
    p_disclosure_version, p_disclosure_accepted_at
  );

  v_request_id := gen_random_uuid();
  v_revision_id := gen_random_uuid();

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
    quantity_basis, estimate_snapshot, delivery_window_start, delivery_window_end,
    disclosure_version, disclosure_accepted_at
  ) values (
    v_revision_id, v_request_id, v_farm_id, 1, p_product, p_quantity, p_unit, p_packaging,
    p_quantity_basis, p_estimate_snapshot, p_delivery_window_start, p_delivery_window_end,
    p_disclosure_version, p_disclosure_accepted_at
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
  text, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text, text, timestamptz
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
  p_eircode text,
  p_disclosure_version text,
  p_disclosure_accepted_at timestamptz
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

  p_product := btrim(p_product);
  if p_packaging is not null then
    p_packaging := btrim(p_packaging);
  end if;

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
    p_delivery_window_start, p_delivery_window_end, p_contact_name, p_address_line1, p_town_or_city, p_county,
    p_disclosure_version, p_disclosure_accepted_at
  );

  v_new_revision_number := v_current_revision_number + 1;
  v_revision_id := gen_random_uuid();

  insert into public.quote_request_revisions (
    id, request_id, farm_id, revision_number, product, quantity, unit, packaging,
    quantity_basis, estimate_snapshot, delivery_window_start, delivery_window_end,
    disclosure_version, disclosure_accepted_at
  ) values (
    v_revision_id, p_request_id, v_farm_id, v_new_revision_number, p_product, p_quantity, p_unit, p_packaging,
    p_quantity_basis, p_estimate_snapshot, p_delivery_window_start, p_delivery_window_end,
    p_disclosure_version, p_disclosure_accepted_at
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
  uuid, integer, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text, text, timestamptz
) to authenticated;
