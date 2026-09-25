-- Slurry planning entry flow for zero-allocation farms.
--
-- A farmer can now create a real field slurry allocation themselves
-- (store, field, volume, method, date — `src/domain/slurry-allocation-plan.ts`,
-- `createSlurryAllocation` in `src/lib/farm-data/slurry.ts`). `priority`
-- and `score` are outputs of an allocation-scoring engine; no audited
-- engine has ranked a farmer-planned allocation, so storing a value in
-- either column would invent one. Both become nullable: NULL means
-- "not ranked", never a zero or a default priority.
--
-- Forward-only and additive: no existing row is touched, the existing
-- `priority` CHECK constraint still applies to every non-NULL value, and
-- RLS/cross-farm triggers on this table are unchanged.

alter table public.slurry_allocations
  alter column priority drop not null,
  alter column score drop not null;
