-- Economic Opportunity Engine, Phase 2 — Fertiliser Market Evidence V1
-- (docs/farm-return-next/DOMAIN_CONTRACTS.md's Phase 1 "Economic
-- Opportunity Engine" section; src/domain/market-evidence.ts has the full
-- canonical-observation rationale; src/server/market/ has the CSO
-- adapter/sync pipeline that writes here.)
--
-- `market_price_observations` — GLOBAL REFERENCE DATA, not farmer-owned:
-- an immutable, append-only record of one official-source price
-- observation for one reference period. Deliberately NOT
-- `supplier_quotes`/`financial_assumptions` (farmer-owned, mutable,
-- different evidence class) and NOT `decisions` (farmer-decision ledger).
--
-- Immutability / revision model: a genuine CSO revision of an
-- already-published reference period is a NEW row, never an UPDATE of the
-- old one (same "provenance is permanent" discipline
-- `slurry_composition_records`/`fertiliser_stock_records` already
-- established). `content_hash` + the composite unique constraint below
-- give idempotent re-sync: an identical re-fetch of the same source
-- observation content conflicts harmlessly (`on conflict do nothing`);
-- a genuinely revised value gets a different `content_hash` and is
-- inserted as a new, additional row, leaving the prior row retrievable.
-- There is no UPDATE or DELETE grant to any role below — the table has no
-- "current value" column to overwrite by design; callers select the
-- latest row per (dataset_id, source_series_code, reference_period)
-- ordered by retrieved_at.
--
-- Money: `price_amount` is `text`, not `numeric` — PostgREST/Supabase-js
-- serialises a `numeric` column as a JSON *number*, which would
-- re-introduce IEEE-754 float parsing on read-back exactly where Phase 1
-- (src/domain/money.ts) spent its whole design keeping money as an exact
-- canonical decimal *string* start to finish. `text` guarantees this
-- column always arrives over PostgREST as a JSON string. The CHECK
-- constraint mirrors money.ts's own CANONICAL_DECIMAL_STRING regex
-- exactly, so the DB layer enforces the same "no NaN/Infinity/scientific
-- notation/leading-zero" invariant `createMoneyAmount` enforces in
-- TypeScript — defence in depth at the boundary, not a second source of
-- truth for the rule.
--
-- RLS: no existing "global reference data, not farm-owned" table existed
-- in this schema before this migration (Phase 0/2 audits confirmed) —
-- every other table's RLS policy scopes rows to an owning farm/user. This
-- is the first genuinely global-reference table, so its policy is
-- correspondingly simple: any authenticated app user may SELECT (it's not
-- farm-specific, so there is nothing to scope a read policy to), and
-- nobody gets an INSERT/UPDATE/DELETE grant at all — ingestion happens
-- only through `service_role` (src/server/market/cso-fertiliser-sync.ts),
-- which bypasses RLS/grants entirely at the Postgres role level, exactly
-- like every other server-only trusted-write path in this stack.

create table public.market_price_observations (
  id uuid primary key default gen_random_uuid(),

  -- Identity.
  source_id text not null check (length(btrim(source_id)) > 0),
  dataset_id text not null check (length(btrim(dataset_id)) > 0),
  source_series_code text not null check (length(btrim(source_series_code)) > 0),
  source_series_label text not null check (length(btrim(source_series_label)) > 0),

  -- Product/category mapping — see cso-fertiliser-mapping.ts. Never
  -- fabricated: `mapped_product` is null whenever `mapping_kind` is
  -- 'UNSUPPORTED_MAPPING'.
  mapped_product text,
  mapping_kind text not null check (
    mapping_kind in ('EXACT_PRODUCT_MATCH', 'CATEGORY_BENCHMARK', 'DERIVED_PROXY', 'UNSUPPORTED_MAPPING')
  ),
  check (mapping_kind <> 'UNSUPPORTED_MAPPING' or mapped_product is null),

  -- Money — see this file's header comment.
  price_amount text not null check (price_amount ~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$'),
  currency text not null check (currency = 'EUR'),
  price_basis text not null check (price_basis in ('per_kg', 'per_tonne', 'per_bag', 'per_unit', 'lump_sum')),

  -- Source basis — UNKNOWN where the official source does not state it;
  -- never inferred (brief: "If VAT or delivery basis is not established
  -- by the official source: store UNKNOWN. Do not infer it.").
  vat_treatment text not null check (vat_treatment in ('exclusive', 'inclusive', 'exempt', 'unknown')),
  delivery_basis text not null check (delivery_basis in ('included', 'excluded', 'unknown')),
  geography text not null default 'Ireland',

  -- Time — reference period vs retrieval time are different facts and
  -- must never be conflated (brief §8). `reference_period` is the
  -- source's own "YYYY-MM" calendar-month label; `source_updated_at` is
  -- the official dataset's own last-revised timestamp where available
  -- (nullable — not always obtainable); `retrieved_at` is when Farm
  -- Return itself fetched this row.
  reference_period text not null check (reference_period ~ '^\d{4}-\d{2}$'),
  source_updated_at timestamptz,
  retrieved_at timestamptz not null default now(),

  -- Provenance / idempotency.
  content_hash text not null check (length(content_hash) = 64),
  ingestion_batch_id uuid not null,
  source_url text,

  -- Status — explicit, so this row can never be read as a supplier
  -- quotation (brief §7 "STATUS"). Only one value exists today; kept as
  -- its own column (not a comment) so a future supplier-quote-derived
  -- evidence class is structurally distinguishable, not just
  -- documented.
  benchmark_status text not null default 'INDICATIVE' check (benchmark_status = 'INDICATIVE'),

  created_at timestamptz not null default now(),

  -- Idempotent re-sync / preserved revision — see this file's header.
  unique (dataset_id, source_series_code, reference_period, content_hash)
);

create index market_price_observations_lookup_idx
  on public.market_price_observations (dataset_id, source_series_code, reference_period, retrieved_at desc);

create index market_price_observations_batch_idx
  on public.market_price_observations (ingestion_batch_id);

alter table public.market_price_observations enable row level security;

create policy "market_price_observations_read" on public.market_price_observations
  for select
  to authenticated
  using (true);

-- No insert/update/delete policy for any application role — see this
-- file's header comment. Ingestion writes only via `service_role`, which
-- bypasses RLS and grants entirely at the Postgres role level.
revoke all on public.market_price_observations from anon;
grant select on public.market_price_observations to authenticated;
