# Supplier Portal v1 (2026-10-31)

Fertiliser suppliers answer real farmer quote requests (`quote_requests`,
Managed Quote Pilot Checkpoint 1) with priced quotes, inside Farm Return.
Branch `fertiliser-engine-v2`.

## Status

| Piece | Status |
|---|---|
| Domain (`src/domain/supplier-quote.ts`) — validation, exact totals, lifecycle, RFQ status, KPIs | BUILT, unit-tested |
| Migration `supabase/migrations/20261031150000_supplier_portal_foundations.sql` | WRITTEN, **NOT APPLIED to any database, never executed** (no local Postgres in the build environment) |
| Isolation validation `supabase/validation/supplier_portal_rfq_isolation_validation.sql` | WRITTEN, **NOT RUN** |
| Supplier UI `/supplier` (overview, RFQ inbox, RFQ detail + quote editor, quotes history, settings) | BUILT; renders an honest "unavailable" state until the migration exists |
| Operator UI `/operator/suppliers` (create supplier, link account, route request) | BUILT, same gate as `/operator/quotes` |
| Farmer-facing view of supplier quotes / acceptance / contact release | **NOT BUILT** |
| Email/notification to suppliers when an RFQ is routed | **NOT BUILT** |

Until the migration is applied, nothing here is operational: suppliers see
"not set up on this database yet", operators see the same on
`/operator/suppliers`, and existing farmer/operator flows are unchanged.

## Flow

1. A farmer submits a quote request (existing flow, unchanged). Their
   disclosure already says delivery information "is shared with the
   supplier(s) Farm Return contacts for this request".
2. An operator (`quote_operators` allow-list) creates a supplier, links an
   existing Farm Return account to it (by sign-in email; no account is
   created and no invitation sent) and routes the request to it.
3. The supplier member signs in, opens `/supplier`, sees the RFQ, drafts a
   quote (line items, quantities, unit prices ex VAT, supplier-declared VAT
   rates, delivery charge, delivery window, validity, terms, notes), saves
   and submits it, and can later withdraw it, discard a draft, or decline
   the RFQ.
4. If the farmer revises the request, a live quote is flagged
   "Farmer changed request"; submission is refused until the draft is
   re-saved against the current revision. If the farmer withdraws, no
   submission is possible.

## Trust model

- **Supplier identity is server-derived.** `supplier_portal_current_supplier_id()`
  reads `auth.uid()`; a user has at most one active membership (partial
  unique index). No supplier RPC, data-layer function or Server Action
  accepts a supplier id; extra payload fields are dropped by validation.
- **Membership, supplier creation and routing are operator-only.** There is
  no self-serve supplier sign-up.
- **Minimised RFQ.** Suppliers never read `quote_requests`, revisions or
  delivery snapshots directly. RPCs return product, quantity, unit,
  packaging, delivery window, town/city, county and the 3-character Eircode
  routing key — never the farm id, farmer name/phone/email, address lines,
  full Eircode or estimate snapshot. The data layer's strict schemas also
  strip any such field should an RPC ever regress.
- **No existence oracle.** Another supplier's RFQ/quote is reported as
  `NOT_FOUND`, identical to a missing one.
- **RLS + RPC.** All six tables have RLS enabled, select-only grants and
  member-own/operator-all read policies; no client write grants. Every write
  is a security-definer RPC with explicit membership/ownership/state checks.
  PUBLIC execute is revoked on every function.
- **Immutability.** Triggers make submitted quotes and their lines immutable
  (only submitted → withdrawn), withdrawn/discarded terminal, history
  append-only, and reject direct deletes (cascade from an upstream
  farm/request/account deletion is allowed).
- **Optimistic concurrency.** Each quote carries a `version`; stale writes
  fail with `STALE`, never overwrite.
- **Totals are never stored or trusted from the client.** They are recomputed
  from the immutable stored inputs by `computeSupplierQuoteTotals` under the
  recorded `totals_method` (`supplier_quote_totals_v1`); an unknown method
  fails closed (no total shown). VAT is UNKNOWN (never 0) until every rate is
  declared, and such a quote cannot be submitted. No VAT rate is encoded.

## Applying the migration (Dev only)

1. Review the migration. Apply to **Farm Return V1 Dev** only (`supabase db
   push --linked` against the Dev project). Never production.
2. Run `supabase/validation/supplier_portal_rfq_isolation_validation.sql`
   on Dev (needs two non-operator accounts and one active quote request); it
   rolls back. Any `FAIL` blocks use.
3. As an operator, create a supplier on `/operator/suppliers`, link a test
   account, route a request, and walk the quote lifecycle as that account.

Known pre-existing issue (not introduced here): this branch's
`20261028094500_pilot_revoke_public_quote_rpc_execute.sql` revokes
functions defined only on the unmerged managed-quote-pilot branch
(`record_quote_supplier_response`, …), so a **fresh** replay of this
branch's migrations would fail at that file. Dev already has those
functions. This migration has a later timestamp and does not depend on them.

## Limitations

- Farmers cannot see, compare or accept supplier quotes in Farm Return yet;
  submitted quotes are recorded for Farm Return only. Farmer contact
  release after acceptance is not built.
- No notification to suppliers on routing; operators tell them out of band.
- Decline is final for that supplier/RFQ (no reopen).
- One active supplier membership per account; operators manage membership.
- The inbox loads at most 500 most-recent RFQs.
- Quantities: up to 3 decimals; prices and delivery charge: whole cents;
  VAT rates: up to 2 decimals, 0–100; ceilings of 100,000 per quantity and
  €100,000 per unit price/delivery charge are input-sanity limits.
- Prefilled quote quantity is the farmer's request quantity; if that has
  more than 3 decimals the supplier must restate it.
- Totals method v1 rounds each line half-up to the cent then sums; a
  supplier whose invoicing rounds differently (e.g. per VAT band) will see a
  cent-level difference.
