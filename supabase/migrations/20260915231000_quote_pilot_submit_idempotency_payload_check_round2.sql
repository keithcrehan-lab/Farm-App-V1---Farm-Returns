-- Grassland Fertiliser Pilot Completion, Checkpoint C -- Codex audit
-- MEDIUM (round 1 of this checkpoint's own review): `submit_quote_request`'s
-- idempotency-key early-return path (`20260911150000_quote_pilot_disclosure_fields.sql`)
-- returned the EXISTING request the moment `idempotency_key` matched,
-- without ever comparing the newly-submitted payload against what that
-- key originally committed. A real farmer retry sequence this app's own
-- client genuinely allows (an ambiguous failure leaves the form open
-- and editable, `RequestQuoteSheet.tsx`) could therefore: submit once
-- (commits for real, but the response is lost to the client -- a real
-- network failure mode, not a hypothetical), edit the form, retry with
-- the SAME `idempotencyKey` (never regenerated mid-sheet-lifetime by
-- design -- the whole point of an idempotency key), and be shown a
-- "submitted" reference whose real stored product/quantity/delivery
-- window/address genuinely differs from the form they just looked at
-- and confirmed. `submit_quote_request` (Checkpoint C's own exact
-- CREATE OR REPLACE target, identical signature -- Postgres treats this
-- as an in-place function replacement, not a second overload) now
-- compares the new payload against the real, already-persisted revision
-- + delivery snapshot for that same idempotency key and raises a clear,
-- real error (`IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`) instead
-- of silently returning the old result whenever they genuinely differ.
-- An identical retry (the actual, intended idempotency use case) is
-- completely unaffected -- every field must match for that path to be
-- taken at all.
--
-- Codex audit round 2 MEDIUM x2 (this same checkpoint's own re-review):
-- round 1's own comparison (a) omitted `disclosure_version`/
-- `disclosure_accepted_at` from the early-return check, contradicting
-- its own "every field must match" claim, and (b) the SEPARATE
-- concurrent-insert race-path copy of this same comparison omitted the
-- entire delivery snapshot AND the disclosure fields -- a real,
-- duplicated-logic drift between two copies of what should be one rule.
-- Fixed at the real root, not by patching both copies separately again:
-- extracted into one shared internal helper,
-- `_quote_request_payload_matches`, comparing every real field
-- (revision + delivery snapshot + disclosure) exactly once; both the
-- early-return path and the concurrent-insert race path now call it,
-- so they cannot drift apart again.
--
-- STATUS: additive to `20260911150000_quote_pilot_disclosure_fields.sql`
-- and `20260915230000_quote_pilot_submit_idempotency_payload_check.sql`
-- (both already applied) -- no schema change, no new column, no change
-- to any other RPC (`revise_quote_request` uses a real optimistic-
-- concurrency `expected_revision_number` instead of an idempotency key,
-- a structurally different and already-correct mechanism this finding
-- does not apply to). Only `submit_quote_request`'s own body changes
-- (`create or replace`, identical signature -- a real in-place fix, not
-- a second overload), plus this one new internal helper.

create or replace function public._quote_request_payload_matches(
  p_request_id uuid,
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
returns boolean
language sql
stable
as $$
  select
    (qrr.product = p_product)
    and (qrr.quantity = p_quantity)
    and (qrr.unit = p_unit)
    and (qrr.packaging is not distinct from p_packaging)
    and (qrr.quantity_basis = p_quantity_basis)
    and (qrr.estimate_snapshot is not distinct from p_estimate_snapshot)
    and (qrr.delivery_window_start = p_delivery_window_start)
    and (qrr.delivery_window_end = p_delivery_window_end)
    and (qrr.disclosure_version = p_disclosure_version)
    and (qrr.disclosure_accepted_at = p_disclosure_accepted_at)
    and (qrds.contact_name = p_contact_name)
    and (qrds.contact_phone is not distinct from p_contact_phone)
    and (qrds.contact_email is not distinct from p_contact_email)
    and (qrds.address_line1 = p_address_line1)
    and (qrds.address_line2 is not distinct from p_address_line2)
    and (qrds.town_or_city = p_town_or_city)
    and (qrds.county = p_county)
    and (qrds.eircode is not distinct from p_eircode)
  from public.quote_requests qr
  join public.quote_request_revisions qrr on qrr.id = qr.current_revision_id
  join public.quote_request_delivery_snapshots qrds on qrds.revision_id = qrr.id
  where qr.id = p_request_id;
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
    -- Real payload-equality check (Codex audit MEDIUM, this checkpoint's
    -- own round 1/2) -- a genuine retry of the identical submission is
    -- the only case this early-return path may take; anything else is a
    -- real, different submission that happened to reuse a stale key,
    -- never silently confirmed as if it were the original.
    if not public._quote_request_payload_matches(
      v_existing_request_id, p_product, p_quantity, p_unit, p_packaging, p_quantity_basis, p_estimate_snapshot,
      p_delivery_window_start, p_delivery_window_end, p_contact_name, p_contact_phone, p_contact_email,
      p_address_line1, p_address_line2, p_town_or_city, p_county, p_eircode,
      p_disclosure_version, p_disclosure_accepted_at
    ) then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: idempotency key % was already used for a real request with different content -- refusing to silently confirm a different submission under it', p_idempotency_key;
    end if;

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
    -- A real concurrent submission under the same key won the race
    -- between this call's own check above and this insert -- re-check
    -- payload equality against whichever row actually landed, via the
    -- exact same shared helper the early-return path above uses (Codex
    -- audit round 2 MEDIUM: this copy previously used its own,
    -- incomplete comparison and had already drifted from the
    -- early-return path's own more complete one).
    select id into v_existing_request_id
      from public.quote_requests
      where farm_id = v_farm_id and idempotency_key = p_idempotency_key;

    if not public._quote_request_payload_matches(
      v_existing_request_id, p_product, p_quantity, p_unit, p_packaging, p_quantity_basis, p_estimate_snapshot,
      p_delivery_window_start, p_delivery_window_end, p_contact_name, p_contact_phone, p_contact_email,
      p_address_line1, p_address_line2, p_town_or_city, p_county, p_eircode,
      p_disclosure_version, p_disclosure_accepted_at
    ) then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: idempotency key % was already used for a real request with different content -- refusing to silently confirm a different submission under it', p_idempotency_key;
    end if;

    return query
      select qr.id, qr.current_revision_id, qrr.revision_number
      from public.quote_requests qr
      join public.quote_request_revisions qrr on qrr.id = qr.current_revision_id
      where qr.id = v_existing_request_id;
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
