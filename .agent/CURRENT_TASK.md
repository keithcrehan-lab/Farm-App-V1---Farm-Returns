# Task: Enforce slurry allocation capacity at database boundary

Starting HEAD: auto

Verify command: `npm run typecheck && npm run build`

## Objective

Fix the two confirmed MEDIUM findings from:

`.agent/history/audit-20260925T181932Z.md`

Do not apply migrations to Farm Return V1 Dev during this task.

The invariant must become true regardless of which write path is used:

> Persisted slurry allocations must never collectively exceed the canonical available volume of their slurry store/housing source.

Do not rely solely on the application RPC to enforce this.

## Finding 1 — Direct writes bypass capacity enforcement

Current state:

- `create_farmer_planned_slurry_allocation` uses locking/capacity validation.
- authenticated users also retain owner-scoped INSERT/UPDATE rights on `slurry_allocations`.
- direct table writes can therefore bypass the RPC.
- two direct allocations against separate fields can collectively exceed store capacity.

Fix this at the PostgreSQL database boundary.

## Required database invariant

All relevant mutation paths must enforce store capacity, including:

- INSERT into `slurry_allocations`
- UPDATE of allocated volume
- UPDATE moving an allocation to another slurry store/housing source
- any existing RPC that writes allocations

A caller must not be able to persist a state where:

`sum(active/current allocated volume for store) > canonical available volume for that store`

Use the repository's actual allocation semantics when defining which rows contribute to allocated volume.

Do not invent new scientific or planning semantics.

## Concurrency safety

The capacity check must be concurrency-safe.

Two concurrent transactions must not both observe the same available volume and commit allocations that collectively exceed it.

Prefer a database-level implementation such as:

- a trigger/function that locks the canonical housing/store row before validating the resulting allocation total, or
- another PostgreSQL mechanism that enforces the same invariant for every write path.

The lock must cover the resource whose capacity is being consumed.

For UPDATE operations that move an allocation between stores, reason carefully about locking both old and new sources and avoid deadlock-prone inconsistent lock ordering.

Do not use advisory sleeps, client retries, or UI state as the correctness mechanism.

## Security

Preserve farm ownership boundaries.

Review:

- RLS
- function execution privileges
- SECURITY DEFINER / SECURITY INVOKER behaviour
- search_path if SECURITY DEFINER is used
- authenticated grants

Do not weaken existing ownership checks.

If direct INSERT/UPDATE privileges are no longer necessary because all legitimate writes can safely go through canonical functions, removing/restricting them is acceptable only after verifying existing application paths will not break.

Prefer defence in depth where practical:
- ownership through RLS/function checks
- capacity invariant at database boundary

## Existing RPC

Keep or adapt the existing farmer-plan RPC so it uses the same database invariant.

Do not maintain two divergent capacity algorithms.

The RPC should produce a clear controlled error when capacity has been consumed by another transaction.

## Finding 2 — Real SQL is not tested

The existing JavaScript stand-in does not prove the migration's locking or RLS behaviour.

Add real PostgreSQL/Supabase integration coverage using the repository's existing database-test conventions if available.

Tests should execute the actual migration/database objects, not reproduce their logic in JavaScript.

Cover at minimum:

### Concurrent writes

Given a store with 100 m³:

- transaction A attempts 80 m³
- transaction B attempts 80 m³ concurrently

Expected:

- at most one succeeds
- final persisted allocation total <= 100 m³

### Direct table bypass attempt

Attempt allocations through the direct table mutation path that previously bypassed the RPC.

Expected:

- database invariant still prevents over-allocation

### Update volume

Existing allocation increased beyond remaining capacity.

Expected:
- rejected

### Move between stores

Move/update an allocation from one store to another where the destination lacks capacity.

Expected:
- rejected
- original persisted state remains valid

### Ownership

Authenticated farmer must not allocate against:
- another farm's field
- another farm's slurry store/housing source

### Valid path

Normal canonical farmer allocation succeeds and remains readable by the normal Farm Return data/evaluation path.

## Test-environment limitation

If this repository genuinely has no available way to execute PostgreSQL integration tests locally:

1. implement the database invariant correctly,
2. add whatever migration-level/static regression coverage is possible,
3. clearly report the missing real-Postgres execution as BLOCKED rather than claiming it has been runtime-tested.

Do not replace real SQL execution with another JavaScript simulation and claim the acceptance criterion is satisfied.

## Migration discipline

Use forward-only migrations.

Do not rewrite an already-applied historical migration.

The existing new migrations have not yet been applied to Farm Return V1 Dev, but preserve migration ordering and repository conventions.

Do not apply any migration to Dev in this task.

## Documentation

Update:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

State truthfully:

- capacity invariant implementation
- concurrency design
- SQL/runtime validation actually performed
- whether real PostgreSQL integration testing remains outstanding
- Dev migration status remains not applied

## Constraints

Do not:
- change slurry science
- change regulatory rules
- change Phase 5 economics
- change Phase 8 ranking
- change Phase 9 selection
- change Phase 10/11 actionability
- invent priority or score
- alter farmer-facing planning UX except where needed for accurate persistence errors
- redesign Today
- work on map/mobile/news/AI

## Acceptance criteria

- capacity cannot be bypassed through direct allocation INSERT
- capacity cannot be bypassed through allocation UPDATE
- concurrent writes cannot over-allocate a store
- moving allocations between stores preserves the invariant
- ownership isolation remains intact
- canonical create RPC uses the same invariant rather than a divergent duplicate
- PostgreSQL integration tests execute the real SQL where infrastructure permits
- limitations are reported honestly where infrastructure does not permit execution
- build documentation is current
- targeted tests pass
- typecheck and build pass

## Additional invariant discovered during implementation

The current trigger protects allocation INSERT/UPDATE paths, but lowering the canonical available volume of a slurry store/housing source can still leave persisted allocations above the new available volume.

This violates the task's stated invariant.

Extend database-level protection so that any mutation which reduces the canonical available slurry volume below already-allocated volume is rejected, or otherwise handled through an existing explicit domain mechanism if one already exists.

Do not silently delete, shrink or rewrite farmer allocations.

Add coverage for:

Given:
- store available volume = 100 m³
- existing allocations = 80 m³

Attempt:
- reduce canonical available volume to 60 m³

Expected:
- mutation is rejected
- existing store volume and allocations remain unchanged

Also verify a reduction to exactly 80 m³ succeeds if repository semantics permit it.

Do not invent new slurry-volume semantics. Inspect the canonical store-volume write path first.

## Real PostgreSQL validation completed

The database implementation has now been executed against a real isolated Supabase PostgreSQL 17 test project:

Farm Return Slurry Capacity Test

The full Farm Return migration chain applied successfully, including:

- 20260925000000_slurry_allocations_farmer_planned
- 20260925010000_create_farmer_planned_slurry_allocation_rpc
- 20260925020000_slurry_allocations_store_capacity_invariant

Real PostgreSQL tests established:

1. Concurrent capacity enforcement

Given a store containing 100 m³:

- transaction A attempted an 80 m³ allocation
- transaction B concurrently attempted another 80 m³ allocation against a different field

Result:

- one transaction succeeded
- the second was rejected with VOLUME_EXCEEDS_AVAILABLE
- final persisted allocation count = 1
- final allocated volume = 80 m³

Therefore the real PostgreSQL row-lock implementation prevented the 160 m³ over-allocation race.

2. Direct table-write bypass

With 80 m³ already allocated from a 100 m³ store, an authenticated direct table INSERT attempted another 30 m³.

Result:

- rejected by the database capacity trigger
- available volume reported as 20 m³

Therefore direct table writes cannot bypass the store-capacity invariant.

3. Allocation UPDATE

An existing 80 m³ allocation was increased to 110 m³.

Result:

- rejected with VOLUME_EXCEEDS_AVAILABLE

4. Move between stores

A 20 m³ allocation was moved to a destination store with only 10 m³ available.

Result:

- rejected
- original allocation remained valid

5. Store fill reduction

With 80 m³ allocated:

- reducing available volume to 60 m³ was rejected
- reducing available volume to exactly 80 m³ succeeded

No allocations were silently modified.

6. Physical storage-capacity reduction

With 80 m³ allocated, reducing physical capacity such that canonical available volume became 60 m³ was rejected.

The rejected mutation left the store at its previous valid state.

7. Canonical RPC

The real `create_farmer_planned_slurry_allocation` PostgreSQL function successfully created a 25 m³ farmer plan.

The resulting allocation retained:

- priority = null
- score = null

No ranking information was fabricated.

8. Ownership isolation

Authenticated cross-farm allocation attempts were rejected.

9. Migration state

The disposable PostgreSQL project confirms all three new slurry-planning migrations are applied successfully.

10. Security review

Supabase database advisors reported no new slurry-specific security finding from these migrations.

Remaining validation:

- migrations have NOT yet been applied to Farm Return V1 Dev
- the final live farmer UI flow has NOT yet been tested against Dev

Do not claim either of those steps is complete yet.