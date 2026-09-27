# Slurry allocation lifecycle and store reconciliation (Phase 1A)

Migration: `supabase/migrations/20260926000000_slurry_allocation_lifecycle.sql`
(authority). Domain mirror: `src/domain/slurry-allocation-lifecycle.ts`.
Data layer: `src/lib/farm-data/slurry.ts`, `src/lib/farm-data/housing.ts`.
Server actions: `src/app/actions/slurry-allocation-lifecycle.ts` (no UI
calls them yet; the farmer-facing UX is Phase 1B).

**This covers physical slurry only.** Every volume here is a physical m³ held in a store or
spread from it. It is never regulatory neat slurry. Nothing derives
statutory N/P from a planned or completed volume
(`SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md`). No agronomy, rate logic or
nutrient coefficient is introduced.

## States and transitions

| State | Meaning | Reserves store slurry? |
|---|---|---|
| `planned` | A plan to spread slurry from one store on one field of one farm | Yes, `volume_m3` |
| `completed` | The slurry was actually spread. `actual_volume_m3` and `actual_spread_date` are recorded beside the planned `volume_m3` | No. See "Completion" |
| `cancelled` | Kept for history, with `cancelled_at` and `cancelled_by` | No |

Allowed transitions:

- `planned → planned`: edit the volume, field or store.
- `planned → completed`
- `planned → cancelled`

`completed` and `cancelled` are terminal and immutable. Reopening a row would
need a new, explicit transition in the future. A completed or cancelled row
cannot be deleted directly. It is only removed when its store or farm is
deleted. Pre-existing rows become `planned`, and the migration invents no
completion or cancellation history for them. The `slurry_allocations_lifecycle_valid` CHECK
constraint ties each lifecycle column to its state.

## Store reconciliation

The existing store model is one point-in-time observation:
`storage_capacity_m3 × storage_fill_pct`. A percentage cannot be
decremented losslessly, so the observation is left untouched. Instead, the
migration gives the observation a database-owned identity
(`housing.store_observation_seq` and `store_observed_at`). Each completion
records which observation it was reconciled against.

```
observed   = capacity × fill% / 100            (non-finite → 0)
withdrawn  = Σ actual_volume_m3 of completed rows of the store with
             store_reconciliation = 'withdrawn_after_observation'
             and store_observation_seq = the store's current seq
reconciled = observed − withdrawn              (physical slurry in the store now)
reserved   = Σ volume_m3 of 'planned' rows of the store
available  = round(max(0, reconciled − reserved), 2)
```

The reconciled figure is used everywhere a store volume is read:
`buildSlurryTankView` and `listHousingForFarm` both apply it.

### What counts as a new observation

The sequence advances **only** on a genuine new store-volume reading: a
write that leaves the row `farmer_recorded` with a new, non-null
`storage_fill_recorded_at`. Two paths produce that:

- the canonical `record_slurry_store_observation` RPC. It always creates a new observation, even when the percentage is unchanged, because it stamps `clock_timestamp()`.
- the Housing form, when the farmer actually typed a fill during that edit (`housing/page.tsx` `fillPctTouched`).

A new observation supersedes all earlier withdrawals: they belong to an older
sequence number. This is how a legitimately lower reading is recorded
without subtracting the same slurry twice.

The following writes are **not** new observations, so completed withdrawals
stay deducted:

- a direct write to `store_observation_seq` or `store_observed_at`. The trigger discards both and restores the old values, so no client write can create a baseline.
- an `estimated` fill change. This corrects the current baseline estimate; it is not a tank reading.
- a capacity-only correction.
- a `farmer_recorded` fill change that keeps the old reading timestamp.
- any other housing edit.

Known conservative limit: suppose an `estimated` correction is lowered to
reflect slurry that was already recorded as withdrawn. That slurry is then
counted twice, so availability is under-stated, never over-stated. The fix
is to record a farmer reading.

### Completion

The caller supplies three things:

- the actual physical volume (> 0)
- the actual spread date (not in the future, Europe/Dublin)
- how the spread relates to the store's current observation

The relationship is resolved by `slurry_store_reconciliation_for_spread`:

- The spread is dated after the observation date: `withdrawn_after_observation`. The actual volume is withdrawn, and it must fit within `reconciled − other reservations`. If actual < planned, the rest is released. If actual > planned, completion succeeds only when enough unreserved slurry exists.
- The spread is dated before an exactly-timed observation: `reflected_in_observation`. The observation already excludes this slurry, so nothing further is withdrawn.
- The spread is on the same day, or before a legacy observation of unknown time: the case is ambiguous. The RPC raises `RECONCILIATION_REQUIRED` rather than guess.

A second completion is refused with `ALREADY_COMPLETED`, so slurry is never consumed twice.

### Conflicting observations

A store change that would leave `reconciled < reserved` (at 2 dp) is
rejected with `housing_store_volume_below_allocated`. The error detail
carries the observed, withdrawn and reserved figures, and it maps to
`STORE_OBSERVATION_CONFLICT`. Reservations are never cancelled or shrunk
automatically. Completed and cancelled rows no longer block a lower reading.

## Database invariants (enforced for every write path)

- `slurry_allocations_store_capacity` fires on every INSERT and UPDATE. It enforces:
  - the transition rules;
  - database-owned lifecycle stamps: `completed_at/by`, `cancelled_at/by` and `store_observation_seq`;
  - that consumption (insert, volume increase, store move, withdrawn completion) is at most `reconciled − other active reservations`, checked under a `for update` lock on the store row.
- `housing_store_observation` owns the observation identity.
- `housing_store_volume_covers_allocations` fires on every housing UPDATE and rejects any reduction of the reconciled volume below active reservations, under the same lock.
- Lock order: allocation row first, then store. REPEATABLE READ is refused, because it would read a stale snapshot after the lock.
- All functions are `security invoker` with a pinned search_path. RLS and `slurry_allocations_same_farm` still apply. The lifecycle RPCs scope every lookup to `p_farm_id`, and `anon` cannot execute any of them.
- There is one active plan per field and store: a partial unique index on `status = 'planned'`.

## Readers

`listSlurryAllocationsForFarm` now returns **only planned rows**. Every
current reader goes through it: planning, nutrient plan, fertiliser
economics, Today, What Matters, decisions, job sessions and AI context. As
a result, completed and cancelled rows are never treated as future
applications. The full history is available from
`listSlurryAllocationRecordsForFarm`. `updateSlurryApplicationMethod` and
`updateSlurryApplicationDate` target the planned row only.

## Spreading-actual linkage (gap, deliberately not bridged)

`SlurrySpreadingActual` (`src/domain/job-actual.ts`) is a job-session record
that covers several fields (`fieldIds[]`), has no store reference, and may
use gallons. It cannot hold a defensible per-field, per-store actual volume,
and splitting one quantity across fields would be invented. The completed
allocation row is therefore the minimal auditable physical completion
record. A future explicit link to a job actual needs its own per-field
evidence.

## Exclusions

These are out of scope for this phase:

- recommended rates
- Teagasc rate logic
- DM interpolation
- NFRV
- neat-slurry or statutory N/P reconstruction
- spreadable area
- whole-farm optimisation
- the farmer-facing edit, cancel and complete UX (Phase 1B)
- weather and price changes

## Validation

- Pure mirror tests: `src/domain/slurry-allocation-lifecycle.test.ts`
- Static SQL-shape tests: `src/lib/farm-data/slurry-lifecycle-migration.test.ts`
- Mapper and action tests

**The SQL has not been executed.** No PostgreSQL server is available to this
repository's runner, and the migration is not yet applied to `Farm Return V1
Dev`. The following still need real-PostgreSQL validation:

- trigger firing order;
- concurrent create/edit/complete/cancel/observation races;
- RLS and cross-farm refusal;
- the `auth.uid()` stamps;
- direct-table bypass attempts;
- dropping the constraint `slurry_allocations_field_id_housing_id_key`. Its name is PostgreSQL's default for the original unique constraint and should be verified against Dev.
