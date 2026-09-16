-- Grassland Fertiliser Pilot Completion, Checkpoint C -- Codex audit
-- round 3 HIGH (this checkpoint's own re-review): round 2's own
-- `_quote_request_payload_matches` compares the entire real
-- `estimate_snapshot` JSONB for exact equality, but its own `asOf`
-- field (`orchestration/quotes/index.ts`'s `getQuoteRequestPrefillContext`/
-- `submitQuoteRequestOrchestrated`) is server-generated metadata --
-- the real instant this app happened to compute the estimate -- freshly
-- regenerated (`new Date().toISOString()`) on every single call, never
-- something the farmer submitted or controls. A genuine retry of an
-- unchanged "estimated" request (the real, disclosed idempotency use
-- case this whole mechanism exists for) would therefore ALWAYS produce
-- a different `asOf` from the first attempt and be wrongly rejected as
-- `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` -- a real regression
-- round 2's own fix introduced, breaking exactly the retry safety this
-- checkpoint's own acceptance criteria require ("prevent accidental
-- duplicate demand from repeated clicks/retries").
--
-- Fixed: the comparison now excludes `asOf` specifically from the
-- estimate-snapshot equality check (`jsonb - 'asOf'`, Postgres's own
-- key-removal operator -- `null - 'asOf'` is `null`, and `null is not
-- distinct from null` is true, so the farmer_entered case, where both
-- sides are genuinely null, is unaffected) while every other real
-- estimate field (`remainingRequirementKg`/`truncated`/
-- `applicationsWithUnknownComposition`/`fieldsWithBlockedEvidence`)
-- still must match exactly -- a genuine demand recalculation between
-- attempts (a real, different requirement) is still correctly rejected
-- as a real payload difference, never silently smoothed over.
--
-- STATUS: additive to `20260915231000_quote_pilot_submit_idempotency_payload_check_round2.sql`
-- (already applied) -- `create or replace function`, identical
-- signature, a real in-place fix (this repo's own established
-- "new migration per fix round" convention -- see that file's own
-- header for the identical precedent against round 1). Only
-- `_quote_request_payload_matches`'s own body changes.

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
    and ((qrr.estimate_snapshot - 'asOf') is not distinct from (p_estimate_snapshot - 'asOf'))
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
