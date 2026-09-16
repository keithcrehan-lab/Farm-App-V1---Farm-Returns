-- Grassland Fertiliser Pilot Completion, Checkpoint C -- Codex audit
-- round 4 CRITICAL + HIGH (this checkpoint's own re-review):
--
-- HIGH (the real functional break, fixed first): round 3's own
-- `20260915233000_quote_pilot_revoke_public_execute_and_harden_operator_check.sql`
-- revoked EVERY execute grant on `is_quote_operator(uuid)` (both
-- `authenticated` and `PUBLIC`), but `quote_requests_operator_read`/
-- `quote_request_revisions_operator_read` (`20260911080000_quote_pilot_checkpoint1.sql`)
-- still called that exact function inside their own `USING` clause.
-- Any RLS policy expression is evaluated under the QUERYING role's own
-- privileges, so `authenticated` losing execute on a function its own
-- policy invokes breaks that policy outright -- the real operator
-- demand-inbox read (`getOperatorDemandInboxAction`) would have started
-- failing with a permission error the moment this migration landed,
-- for every real operator, not a theoretical risk. Fixed: both real
-- policies are updated (`alter policy ... using (...)`, never
-- `drop policy` + recreate -- Postgres supports changing a policy's own
-- condition in place, no DDL data loss, no `DROP` at all) to call
-- `public.is_quote_operator_for_current_user()` instead -- the same
-- real function `lib/farm-data/quote-operators.ts` itself now calls.
--
-- CRITICAL: round 3's own migration deliberately left the OLD
-- 17-parameter `submit_quote_request`/18-parameter `revise_quote_request`/
-- 12-parameter `_validate_quote_request_payload` signatures untouched,
-- reasoning that Dev had already genuinely dropped them (via the
-- original, un-rewritten `20260911150000_quote_pilot_disclosure_fields.sql`)
-- and a `REVOKE` on an already-dropped function would itself error.
-- Correct for Dev specifically, but wrong for what this migration file
-- itself claims and for a FRESH database replaying this repo's own
-- history from scratch (which, per that file's own rewritten,
-- `revoke`-not-`drop` content, would still have those old signatures
-- present with `PUBLIC` execute never revoked) -- this migration
-- previously left a real fresh-database gap while claiming a complete
-- fix. Fixed properly this time: `to_regprocedure(...)` (returns NULL
-- for a function that does not exist, rather than erroring the way a
-- direct `::regprocedure` cast or a bare `REVOKE` would) gates each of
-- the three old-signature revokes, so this exact same migration file is
-- now correct whether replayed against a fresh database (old signatures
-- present, genuinely revoked) or against Dev (old signatures already
-- gone, the conditional revoke is skipped as a real no-op, never an
-- error).
--
-- STATUS: additive to every quote-pilot migration already applied --
-- no schema change, no `DROP` of anything, policy conditions changed
-- in place via `alter policy`.

do $$
begin
  if to_regprocedure('public.submit_quote_request(text, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text)') is not null then
    revoke all on function public.submit_quote_request(
      text, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text
    ) from public, authenticated;
  end if;

  if to_regprocedure('public.revise_quote_request(uuid, integer, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text)') is not null then
    revoke all on function public.revise_quote_request(
      uuid, integer, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text
    ) from public, authenticated;
  end if;

  if to_regprocedure('public._validate_quote_request_payload(text, numeric, text, text, text, jsonb, date, date, text, text, text, text)') is not null then
    revoke all on function public._validate_quote_request_payload(
      text, numeric, text, text, text, jsonb, date, date, text, text, text, text
    ) from public, authenticated;
  end if;
end $$;

-- The real fix for the HIGH above: both real operator-read policies
-- now call the new, hardened, zero-argument function.

alter policy "quote_requests_operator_read" on public.quote_requests
  using (public.is_quote_operator_for_current_user());

alter policy "quote_request_revisions_operator_read" on public.quote_request_revisions
  using (public.is_quote_operator_for_current_user());
