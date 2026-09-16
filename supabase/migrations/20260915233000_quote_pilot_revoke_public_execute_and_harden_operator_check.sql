-- Grassland Fertiliser Pilot Completion, Checkpoint C -- Codex audit
-- round 3 CRITICAL (this checkpoint's own re-review): every quote-pilot
-- function this checkpoint ported or added grants `execute` explicitly
-- to `authenticated`, but PostgreSQL ALSO grants `execute` to the
-- implicit `PUBLIC` pseudo-role by default at function-creation time --
-- a separate, independent grant that revoking from a NAMED role
-- (`authenticated`, `anon`) never removes, since Postgres unions every
-- applicable grant rather than letting a narrower revoke override a
-- broader one. None of these functions' own migrations ever explicitly
-- revoked `PUBLIC`, so every one of them -- including the two
-- SECURITY DEFINER RPCs this checkpoint's own round 2 fix
-- ("retirement") revoked only `authenticated` from -- remained callable
-- by literally any role, `anon` included. The real, concrete harm Codex
-- named: `is_quote_operator(uuid)` is `SECURITY DEFINER` and takes an
-- ARBITRARY caller-supplied `p_user_id`, never deriving the caller's
-- own real identity internally -- with `PUBLIC` execute never revoked,
-- any anonymous caller could query real operator-membership status for
-- any arbitrary real user id, a genuine information-disclosure
-- primitive against a table (`quote_operators`) this same migration
-- deliberately revoked all direct grants on specifically so this
-- function would be the only path to it.
--
-- Fixed two ways, both real:
-- 1. `revoke execute ... from public` added for every real function
--    this checkpoint's own migrations define (every signature, current
--    AND retired/superseded ones still physically present), then
--    `grant execute ... to authenticated` re-added only where a real
--    application caller genuinely needs it -- the exact same real
--    functions already had this grant; PUBLIC is now the only thing
--    that changes.
-- 2. A genuinely new, zero-argument `is_quote_operator_for_current_user()`
--    replaces `is_quote_operator(uuid)` as the real path this app's own
--    code uses (`src/lib/farm-data/quote-operators.ts`, updated in the
--    same commit) -- it derives `auth.uid()` internally rather than
--    trusting any caller-supplied identity, so the enumeration
--    primitive is closed at its structural root, not merely by a grant.
--    The old `is_quote_operator(uuid)` is NOT dropped (`AGENTS.md`'s
--    forward-only rule, the same real constraint this checkpoint's own
--    round 2 CRITICAL fix already established the pattern for) -- its
--    every grant (`authenticated` and `PUBLIC`) is revoked instead,
--    leaving it inert, harmless dead code no real caller uses any more.
--
-- Disclosed scope: this migration only touches the quote-pilot
-- functions this checkpoint's own commits define -- whether this same
-- "PUBLIC execute never explicitly revoked" gap exists more broadly
-- across this repo's own pre-existing migration history (outside this
-- checkpoint's own real diff) is a real, separate question this
-- migration does not investigate or claim to have answered; flagged
-- honestly as an open question for a future, dedicated review rather
-- than silently assumed to be fine or fixed here.
--
-- STATUS: additive to `20260911080000_quote_pilot_checkpoint1.sql`,
-- `20260911150000_quote_pilot_disclosure_fields.sql`,
-- `20260915230000_quote_pilot_submit_idempotency_payload_check.sql`,
-- `20260915231000_quote_pilot_submit_idempotency_payload_check_round2.sql`,
-- `20260915232000_quote_pilot_idempotency_ignore_estimate_asof.sql`
-- (all already applied) -- pure grant/revoke changes plus one new
-- additive function; no DDL data loss, no `DROP`.

-- Codex audit round 4 CRITICAL (this checkpoint's own further
-- re-review): the paragraph below originally left the old
-- `submit_quote_request(17-param)`/`revise_quote_request(18-param)`/
-- `_validate_quote_request_payload(12-param)` signatures untouched here
-- because Dev had already genuinely dropped them, reasoning that a bare
-- `REVOKE` (no `IF EXISTS` form) would error against Dev's own real
-- state -- correct for Dev, but it left this migration file itself
-- genuinely incomplete for a FRESH database replay, where those old
-- signatures would still exist (present-but-revoked, per the rewritten
-- disclosure_fields file) with `PUBLIC` never actually revoked. Fixed
-- properly in the later, genuine follow-up,
-- `20260916000000_quote_pilot_operator_policies_and_conditional_revoke.sql`
-- (`to_regprocedure(...)`-gated conditional revokes, correct on both
-- Dev and a fresh replay) -- see that file's own header for the full
-- account, including the real functional break its own HIGH fix closes
-- (the operator RLS policies below still called the exact function this
-- file's own next paragraph revokes every grant on).
--
-- Retired/superseded signature still physically present on Dev (never
-- dropped -- `is_quote_operator` has only ever had this one real
-- signature).
-- rather than dropped -- a deliberate, disclosed asymmetry between
-- Dev's own real (already-happened) history and this repo's own
-- committed (forward-looking) migration file content, not an
-- inconsistency this migration failed to notice.

revoke all on function public.is_quote_operator(uuid) from public, authenticated;

-- Current, real, still-in-use signatures -- revoke PUBLIC, keep the
-- real, already-established `authenticated` grant (re-asserted
-- explicitly below so this migration is self-contained and correct on
-- its own, not dependent on remembering an earlier file's own grant).

revoke execute on function public._validate_quote_request_payload(
  text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, timestamptz
) from public;

revoke execute on function public.submit_quote_request(
  text, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text, text, timestamptz
) from public;
grant execute on function public.submit_quote_request(
  text, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text, text, timestamptz
) to authenticated;

revoke execute on function public.revise_quote_request(
  uuid, integer, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text, text, timestamptz
) from public;
grant execute on function public.revise_quote_request(
  uuid, integer, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text, text, timestamptz
) to authenticated;

revoke execute on function public.withdraw_quote_request(uuid) from public;
grant execute on function public.withdraw_quote_request(uuid) to authenticated;

-- `_quote_request_payload_matches` is `language sql` (not security
-- definer) and has never been granted to `authenticated` at all -- only
-- `submit_quote_request` itself calls it internally. Revoking PUBLIC
-- here means no external caller (of any role) can invoke it directly
-- any more, matching its own intended internal-helper-only scope.
revoke execute on function public._quote_request_payload_matches(
  uuid, text, numeric, text, text, text, jsonb, date, date, text, text, text, text, text, text, text, text, text, timestamptz
) from public;

-- The real, structural fix for `is_quote_operator`'s own arbitrary-
-- identity design: a genuinely new function deriving the caller's own
-- real identity internally, never accepting one as input.
create or replace function public.is_quote_operator_for_current_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.quote_operators
    where user_id = auth.uid() and active
  );
$$;

revoke execute on function public.is_quote_operator_for_current_user() from public;
grant execute on function public.is_quote_operator_for_current_user() to authenticated;
