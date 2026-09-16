-- Grassland Fertiliser Pilot Completion, Checkpoint C -- Codex audit
-- round 6 MEDIUM x2 (this checkpoint's own re-review, first CLEAN round
-- on Critical/High -- both genuine correctness issues, fixed for real
-- rather than deferred, since Checkpoint C's own acceptance criteria
-- explicitly require honest reference/confirmation behaviour):
--
-- 1. `p_idempotency_key` was never validated -- a direct authenticated
--    caller (bypassing the real UI, which always generates a genuine
--    `crypto.randomUUID()`) could submit `''` or arbitrary oversized
--    text as the per-farm uniqueness key. Fixed: rejected up front
--    unless it is a real, well-formed UUID string (the exact shape
--    every genuine real caller already produces).
-- 2. An idempotent retry never checked whether the existing request had
--    since been withdrawn. If a farmer's own real request was withdrawn
--    while a delayed/retried submission under the same key was still in
--    flight, the retry would report `{ok: true}` and the UI would show
--    "Your quote request has been submitted" for a request that is
--    genuinely no longer active -- a false confirmation, exactly what
--    Checkpoint C's own "explicitly submit, receive unique reference +
--    confirmation" requirement depends on being honest. Fixed: both the
--    early-return path and the concurrent-insert race path now also
--    check `withdrawn_at`, raising a clear, real
--    `IDEMPOTENCY_KEY_REUSED_REQUEST_WITHDRAWN` error instead of
--    silently confirming a withdrawn request as freshly submitted.
--
-- STATUS: additive to `20260915231000_quote_pilot_submit_idempotency_payload_check_round2.sql`
-- (already applied) -- `create or replace function`, identical
-- signature, a real in-place fix (this repo's own established
-- "new migration per fix round" convention). Only `submit_quote_request`'s
-- own body changes.

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
  v_existing_withdrawn_at timestamptz;
  v_request_id uuid;
  v_revision_id uuid;
begin
  select id into v_farm_id from public.farms where user_id = auth.uid() order by created_at asc limit 1;
  if v_farm_id is null then
    raise exception 'submit_quote_request: no real farm for the current session';
  end if;

  -- Real UUID-shape validation (Codex audit round 6 MEDIUM) -- every
  -- genuine real caller (`RequestQuoteSheet.tsx`'s own `crypto.randomUUID()`)
  -- already produces exactly this shape; a blank or arbitrary-length
  -- key is rejected outright rather than silently accepted as a real
  -- uniqueness key.
  if p_idempotency_key is null or p_idempotency_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'submit_quote_request: idempotencyKey must be a real UUID string';
  end if;

  p_product := btrim(p_product);
  if p_packaging is not null then
    p_packaging := btrim(p_packaging);
  end if;

  select id, withdrawn_at into v_existing_request_id, v_existing_withdrawn_at
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

    -- Codex audit round 6 MEDIUM -- a genuinely withdrawn request must
    -- never be reported back as a fresh, active "submitted" confirmation.
    if v_existing_withdrawn_at is not null then
      raise exception 'IDEMPOTENCY_KEY_REUSED_REQUEST_WITHDRAWN: idempotency key % matches a request that was withdrawn on % -- refusing to report a withdrawn request as a real active submission', p_idempotency_key, v_existing_withdrawn_at;
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
    -- payload equality (and withdrawal status, Codex audit round 6
    -- MEDIUM) against whichever row actually landed, the same real
    -- discipline as the early-return path above.
    select id, withdrawn_at into v_existing_request_id, v_existing_withdrawn_at
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

    if v_existing_withdrawn_at is not null then
      raise exception 'IDEMPOTENCY_KEY_REUSED_REQUEST_WITHDRAWN: idempotency key % matches a request that was withdrawn on % -- refusing to report a withdrawn request as a real active submission', p_idempotency_key, v_existing_withdrawn_at;
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
