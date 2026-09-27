# Slurry allocation lifecycle and store reconciliation (Phase 1A)

Migration: `supabase/migrations/20260926000000_slurry_allocation_lifecycle.sql`
(authority). Domain mirror: `src/domain/slurry-allocation-lifecycle.ts`.
Data layer: `src/lib/farm-data/slurry.ts`, `src/lib/farm-data/housing.ts`.
Server actions: `src/app/actions/slurry-allocation-lifecycle.ts` (called by
the Phase 1B farmer UI — see "Phase 1B" below).

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

### Real PostgreSQL validation (disposable project only)

After commit `c8b9065` the migration was applied successfully to the
disposable Supabase project `Farm Return Slurry Capacity Test`. There it
passed:

- migration application;
- create reservation; edit upward and downward; over-capacity edit rejection;
- cancellation and reservation release;
- completion with actual below planned, and actual above planned with capacity enforcement;
- repeated-completion rejection; completed-plan edit rejection;
- genuine store re-observation; direct observation-identity mutation protection; estimated-fill observation semantics;
- conflicting lower store observation rejection;
- authenticated RLS and cross-farm refusal;
- direct-table capacity enforcement;
- concurrent create/create, edit/create, complete/create and cancel/create.

Temporary concurrency fixtures were removed afterwards and the baseline
store reservations were verified restored.

After commit `a63f49a` the remaining concurrency cases were run on the same
disposable project, and all passed:

- concurrent edit/edit on the same physical store: one capacity-consuming
  edit committed; the competing edit was rejected with
  `VOLUME_EXCEEDS_AVAILABLE`;
- concurrent store move/store move into the same destination store: one
  move committed; the competing move was rejected when destination capacity
  was exhausted;
- concurrent completion/completion of two different allocations: one
  completion committed; the competing one was rejected rather than
  over-consuming the store;
- concurrent completion/completion of the same allocation: one completion
  committed; the competing one was rejected with `ALREADY_COMPLETED`;
- concurrent allocation creation versus a lower farmer store observation:
  the allocation committed; the conflicting lower observation was rejected
  with `housing_store_volume_below_allocated`, and no reservation or store
  state was silently altered;
- post-test invariant checks: reconciled physical volume, withdrawals and
  active reservations remained internally consistent.

All temporary concurrency fixtures were deleted. The test-store baseline
was rechecked and restored (`Store A2` active reservations = 21 m³).

`Farm Return V1 Dev` was inspected read-only. The constraint
`slurry_allocations_field_id_housing_id_key` exists there as
`UNIQUE (field_id, housing_id)`, so the pre-migration constraint name the
lifecycle migration expects is present.

**The migration is NOT yet applied to `Farm Return V1 Dev`.** Still
outstanding:

- applying it to `Farm Return V1 Dev` and verifying it there;
- the live farmer flow against Dev (which depends on the Phase 1B UX).

## Phase 1B — farmer-facing slurry plan

Screen: `/spreading/plan` (linked from `/spreading` and from What Matters),
component `src/components/farm/SlurryPlanLifecycle.tsx`, view/copy module
`src/domain/slurry-plan-lifecycle-view.ts`. No migration; the Phase 1A
schema, RPCs and triggers are unchanged and remain the authority.

**Terminology.** "Current slurry" / "Current estimate" is the reconciled
physical volume (last reading − completed withdrawals since). "Last tank
reading" is the observation itself (fill %, date, estimated or not), shown as
evidence; when spreading has been recorded since, the screen says the
reading's volume "then, less slurry recorded as spread since" — the
reconciled figure is never presented as a new farmer reading. "Reserved in
plan" is Σ planned volumes (still in the tank). "Unallocated" is the
database's own `available` (current − reserved, floored at 0). Farm totals sum
each store's own reconciliation; a store without a positive capacity shows
"current volume unknown" and is left out of the totals, never shown as 0.

**Lifecycle.** Each planned allocation shows field, planned volume, planned
date, method and (with several stores) its source store, with Mark as spread,
Edit and Cancel. Edit changes field, store and planned volume through
`update_planned_slurry_allocation` (method/date are untouched and kept).
Cancel asks for confirmation, then calls `cancel_planned_slurry_allocation`.
Mark as spread shows the planned volume beside an editable actual volume
(pre-filled with the planned amount, saved only on submit) and a spread date
(empty until chosen; a "Today" shortcut; future dates refused); actual may be
below, equal to or above planned — the database enforces capacity.

**Reconciliation question.** The completion is first sent without a
reconciliation, so the RPC infers it whenever the date is unambiguous. Only a
`RECONCILIATION_REQUIRED` refusal shows "Was this spreading already included
in your latest tank reading?" — "Yes, the tank reading was taken after this
slurry was spread." → `reflected_in_observation`; "No, the slurry was spread
after the tank reading." → `withdrawn_after_observation`. Changing the date
clears the answer.

**Authority and errors.** Nothing is optimistic. After every attempt (saved,
refused or failed) the farm store re-reads `loadSlurryPlanStateAction`
(reconciled stores + all records) so server state wins; the screen also
re-reads on open. Refusals are shown in farmer language
(`describeSlurryLifecycleIssues`); stale refusals (`NOT_PLANNED`,
`ALREADY_COMPLETED`, `ALLOCATION_NOT_FOUND`) close the sheet and say the plan
was already changed; unexpected errors show a generic retry message and keep
the farmer's input. No issue code, enum or SQL text is rendered.

**History.** A collapsed "History" section lists completed plans (field,
"Planned X m³ · Spread Y m³" when they differ, spread date, method) and
cancelled plans (field, planned volume, cancellation date), with no actions.

**Demo farm.** Without a database, the farm store applies the same rules
through the Phase 1A mirror (`applyLocalSlurry*` in the view module); a real
account never uses it.

No recommendation logic (field choice, rates, timing, weather, economics) is
added; the farmer's own plans remain the only input.

Tests: `src/domain/slurry-plan-lifecycle-view.test.ts`,
`src/components/farm/SlurryPlanLifecycle.test.tsx`,
`src/app/(app)/spreading/plan/page.test.tsx`,
`src/app/actions/slurry-allocation-lifecycle.test.ts`.
