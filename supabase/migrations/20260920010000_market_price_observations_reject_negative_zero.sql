-- Economic Opportunity Engine, Phase 2 review hardening (2026-09-20).
--
-- market_price_observations.price_amount's existing CHECK constraint
-- (previous migration) mirrors src/domain/money.ts's
-- CANONICAL_DECIMAL_STRING regex, but money.ts's createMoneyAmount
-- rejects the literal string "-0" with a SEPARATE explicit check *after*
-- that regex passes ("-0" is not accepted -- negative zero has no
-- economic meaning; use "0"). The regex alone
-- (`^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`) still matches "-0", so a row written
-- directly through the service-role trust boundary (bypassing
-- src/server/market/cso-fertiliser-repository.ts's toInsertRow, which
-- always sources price_amount from an already-validated MoneyAmount)
-- could persist "-0" -- a second, meaningless serialisation of zero the
-- TypeScript domain layer already refuses to construct.
--
-- Purely additive: adds one new, separately-named CHECK constraint
-- rather than dropping/replacing the existing one (whose Postgres
-- auto-generated name this migration does not need to know or risk
-- getting wrong). No column added, no other constraint/table touched,
-- forward-only.

alter table public.market_price_observations
  add constraint market_price_observations_price_amount_not_negative_zero
  check (price_amount <> '-0');
