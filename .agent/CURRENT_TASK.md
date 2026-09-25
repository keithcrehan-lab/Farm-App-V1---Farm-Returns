# Task: Harden slurry plan persistence before Dev migration

Starting HEAD: auto

Verify command: `npm run typecheck && npm run build`

## Objective

Fix the three confirmed MEDIUM findings from:

`.agent/history/audit-20260925T174821Z.md`

Do not apply the migration to Dev yet.

Do not change scientific, economic, ranking or actionability semantics.

## Finding 1 — Concurrent saves can over-allocate a slurry store

Current race:

- store has 100 m³ available
- request A reads 100 m³ available
- request B reads 100 m³ available
- A validates and allocates 80 m³
- B independently validates and allocates 80 m³
- both inserts succeed
- persisted total becomes 160 m³

The current uniqueness constraint on `(field_id, housing_id)` does not prevent this.

Fix availability validation and insertion atomically at the database boundary.

Requirements:

- concurrency-safe
- farm/store scoped
- no client-only protection
- no fabricated remaining volume
- reject the second save if the committed allocation would exceed the store's real available volume
- maintain clear farmer-facing failure behaviour
- do not use arbitrary sleeps or retries as correctness controls

Prefer a transactional database function/RPC or equivalent locking mechanism using the existing Supabase/Postgres architecture.

If row locking is required, lock the canonical slurry-store/housing resource whose available volume is being consumed.

Add a regression that proves two concurrent saves cannot collectively exceed available volume.

## Finding 2 — Real persistence path lacks regression coverage

Add integration-level coverage for the canonical remote save path.

Exercise:

`createSlurryAllocationAction`
→ server-side farm ownership validation
→ field ownership validation
→ slurry store/housing ownership validation
→ volume validation
→ database persistence
→ subsequent read/evaluation sees the persisted allocation

Cover at minimum:

- valid allocation succeeds
- field belonging to another farm is rejected
- store/housing belonging to another farm is rejected
- allocation exceeding available volume is rejected
- successfully persisted allocation can be read by the normal What Matters pipeline

Do not replace these tests with only form mocks or handcrafted candidate objects.

Use the repository's existing test/database conventions.

## Finding 3 — Required build documentation missing

Update:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

Document:

- zero-allocation slurry planning entry flow
- canonical allocation creation path
- nullable farmer-planned `priority` / `score` migration rationale
- concurrency hardening
- current validation/test status
- migration has NOT yet been applied to Dev unless that becomes true during this task

Do not claim live Dev validation that has not happened.

## Migration safety

Review the existing migration:

`supabase/migrations/20260925000000_slurry_allocations_farmer_planned.sql`

If concurrency hardening requires an additional migration/function, add it forward-only.

Do not edit already-applied historical migrations.

Do not apply any migration to Farm Return V1 Dev in this task.

## Constraints

Do not:
- change slurry science
- change Phase 5 economics
- change Phase 8 ranking
- change Phase 9 selection
- change Phase 10/11 actionability
- invent allocation priority or score
- change the zero-allocation product flow beyond what is necessary for persistence safety
- redesign Today
- work on map/mobile/news/AI

## Acceptance criteria

- two concurrent saves cannot over-allocate a slurry store
- server-side ownership boundaries are covered by regression tests
- real remote save path is tested
- saved allocation can be observed by the real downstream evaluation/read path
- farmer-planned allocations still do not require invented priority/score
- required build-state and implementation-log files are updated
- targeted tests pass
- typecheck and build pass