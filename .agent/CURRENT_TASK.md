# Task: Phase 1A — Canonical slurry allocation lifecycle and store reconciliation

## Objective

Implement the backend/domain foundation for a trustworthy slurry-allocation lifecycle.

This phase exists because a planned slurry allocation currently reserves physical slurry indefinitely. There is no complete lifecycle for editing, cancelling/releasing, or completing/spreading an allocation.

The future recommendation engine must be able to create allocations without corrupting the farm's available-slurry balance.

This is NOT a slurry-rate recommendation task.

Do not implement new agronomy.
Do not implement new nutrient coefficients.
Do not implement the scientific recommendation engine.
Do not implement spreadable-area logic.
Do not redesign the slurry-plan UI beyond anything strictly necessary for backend integration/tests.
Do not change the frozen finite-resource/ranking science.

## Canonical principle

A slurry allocation is a plan/reservation until it is acted upon.

The lifecycle must preserve these meanings:

- PLANNED:
  reserves physical slurry from the relevant store.

- COMPLETED:
  the planned reservation is no longer an active reservation because slurry was actually spread.
  The actual physical removal from the store must be reconciled so that completion cannot make the same slurry available again.

- CANCELLED:
  the allocation remains historically visible/auditable but releases its reservation.

The system must not rely on deleting history to release slurry.

If the existing schema already expresses equivalent lifecycle semantics, reuse them rather than creating duplicate concepts.

---

# First: inspect the real current architecture

Before modifying anything, trace:

- `slurry_allocations`
- all migrations affecting it
- farmer-planned allocation RPC
- store-capacity database trigger
- housing/store capacity and fill model
- existing slurry spreading actual/job actual model
- any existing job completion/state model
- allocation server actions
- allocation domain types
- Today/What Matters reads of allocations
- nutrient/economic reads of allocations
- any existing audit/provenance/fingerprinting fields

Do not assume column names or lifecycle fields that do not exist.

Document the chosen lifecycle design in code/docs before implementation.

## Important evidence constraint

The recently frozen evidence audit established that:

- recorded physical slurry m3 is not automatically regulatory neat slurry;
- historical statutory N/P must NOT be reconstructed from physical allocation volume alone;
- multi-field historical actuals can lack a defensible per-field split.

This phase deals with PHYSICAL slurry resource accounting only.

Do not infer regulatory neat volume.
Do not derive statutory manure N/P from completed physical m3.
Do not modify regulatory nutrient science.

---

# Required lifecycle behaviour

## 1. Planned allocation

A planned allocation:

- belongs to exactly one farm;
- belongs to exactly one field;
- references the relevant slurry store/housing source;
- has a physical planned volume in m3;
- reserves that physical volume;
- participates in the existing database capacity invariant;
- remains editable only while in the appropriate planned state.

The database must continue to guarantee:

sum(active planned reservations for store) <= physical slurry currently available for reservation

under concurrency.

Do not weaken the existing capacity protection.

---

## 2. Edit planned allocation

Provide a canonical, authorised way to edit a still-planned allocation.

At minimum support:

- changing planned physical volume;
- changing destination field where existing domain semantics permit it;
- changing source store only if current architecture supports this safely.

The edit must be transactional.

Increasing a planned volume must fail if insufficient unreserved slurry remains.

Decreasing a planned volume must release the difference immediately.

Moving an allocation between stores, if supported, must:

- release the source reservation;
- acquire the destination reservation;
- remain atomic;
- never temporarily allow over-allocation.

A completed or cancelled allocation must not be silently editable back into a plan.

If reopening is required, it must be an explicit future lifecycle transition, not accidental mutation.

---

## 3. Cancel allocation

Cancellation must:

- preserve the allocation record;
- mark the allocation cancelled using canonical lifecycle state;
- record cancellation timestamp;
- record actor/source where existing provenance architecture supports it;
- release the entire active reservation;
- not create a spreading actual;
- not alter historical completed usage;
- be idempotent or safely reject repeated cancellation without corrupting state.

A cancelled row must NOT count against available slurry.

Do not hard-delete the row as the normal cancellation path.

---

## 4. Complete allocation

Completion means slurry was actually spread.

Completion must be an explicit transition from a valid planned state.

The operation must accept or resolve the ACTUAL PHYSICAL VOLUME SPREAD.

Do not assume actual volume always equals planned volume.

Preserve both:

- planned volume
- actual completed physical volume

If actual < planned:
- release the unused reserved quantity;
- consume/reconcile only actual physical slurry.

If actual > planned:
- completion must be allowed only if sufficient unreserved physical slurry exists;
- the database must prevent over-consumption/over-allocation under concurrency.

Completion must be transactional.

Repeated completion must not consume slurry twice.

A completed allocation must no longer count as an active reservation.

---

# Critical store reconciliation requirement

Do NOT implement completion as merely:

`status = completed`

because that would release the reservation while leaving the store's physical volume unchanged, making already-spread slurry appear available again.

Trace the current canonical physical-store model first.

Implement the smallest sound reconciliation model that ensures:

physical slurry spread on completion cannot become available for allocation again

while preserving existing store semantics.

## Preferred architectural rule

Do not create a second independent "available slurry" truth if the existing housing/store model can be safely extended.

However, do not mutate a percentage-based fill estimate in a scientifically/auditably lossy way merely for convenience.

If the current `storage_capacity_m3 × storage_fill_pct` model cannot support lossless completion/reconciliation, introduce the minimal explicit physical-volume consumption/ledger mechanism necessary.

Any new mechanism must have clear semantics:

- observed/declared physical store volume
- active planned reservations
- completed physical withdrawals/spreading
- remaining allocatable physical volume
- observation/reconciliation timestamp

Avoid double subtraction.

Example of the invariant conceptually:

available_for_new_allocation
=
current_reconciled_physical_volume
-
active_planned_reservations

The implementation may differ based on the existing architecture.

## STOP condition

If there is no defensible way to distinguish:

- a new farmer/store fill observation
from
- historical withdrawals since that observation

without creating ambiguous double-counting,

STOP before implementing an unsafe approximation.

Document:

- the existing volume semantics;
- why they are insufficient;
- the minimal schema/ledger design required.

Do not quietly decrement both a store observation and a withdrawal ledger in a way that double-counts slurry use.

---

# 5. Actual spreading linkage

Inspect the existing `SlurrySpreadingActual` / job-actual architecture.

Where safe, completion should create or link to a canonical physical spreading actual rather than invent a parallel actual-history system.

Requirements:

- one completed field allocation must retain a defensible field-specific actual volume;
- planned volume and actual volume remain distinguishable;
- completion timestamp/date is retained;
- application method/date evidence may be linked/preserved if already known;
- do NOT derive statutory N/P from the actual physical volume;
- do NOT force unsupported scientific transformations.

If the existing job-actual model cannot represent this safely, document the gap and implement only the minimal auditable physical completion record needed for this phase.

Do not silently map one physical quantity across multiple fields.

---

# 6. Lifecycle state model

Use an explicit, finite state model.

At minimum the domain must distinguish the equivalents of:

- planned
- completed
- cancelled

If existing terminology differs, reuse existing terminology where semantically correct.

Define and test permitted transitions.

Conceptually:

PLANNED -> COMPLETED
PLANNED -> CANCELLED

Disallow accidental transitions such as:

COMPLETED -> PLANNED
CANCELLED -> COMPLETED
COMPLETED -> CANCELLED

unless an existing audited business rule explicitly requires them.

Do not use nullable timestamps alone as an ambiguous implicit state machine if a clear state field is safer.

---

# 7. Capacity invariant

Update the existing database invariant so it operates on ACTIVE RESERVATIONS only.

A cancelled allocation must not consume reservation capacity.

A completed allocation must not consume reservation capacity.

But completed physical withdrawal must still be reflected in the underlying physical resource, so capacity cannot reappear.

All critical resource arithmetic must be enforced at the database transaction boundary, not only in TypeScript.

Protect against:

- concurrent create/create;
- create/edit races;
- edit/edit races;
- complete/create races;
- cancel/create races;
- store change races if store moves are supported;
- repeated completion;
- direct authenticated table/RPC writes where relevant.

Preserve existing same-farm/ownership protections.

---

# 8. Store observation/reconciliation

A later farmer observation such as:

"Tank is now 42% full"

must have defined semantics.

Audit and document whether this observation:

- replaces the previous physical baseline;
- reconciles historical withdrawals;
- starts a new reconciliation period;
- or follows some existing model.

The new lifecycle must not make it impossible to record a legitimate lower fill level.

The previous problem where outstanding allocations could block a legitimate lower-store observation must be resolved through lifecycle/reconciliation semantics, not by weakening capacity safety.

Do not automatically cancel valid future planned reservations merely because the farmer records a lower fill level.

If the lower observation conflicts with existing active reservations, return an explicit conflict state/error that preserves both facts and tells the caller reconciliation is required.

No unknown should become zero.

---

# 9. Provenance/audit

Reuse the existing evidence/provenance/fingerprinting architecture where appropriate.

For material lifecycle events retain enough information to reconstruct:

- allocation ID
- farm
- field
- store
- planned volume
- actual completed volume if any
- original creation timestamp
- latest relevant lifecycle timestamp
- lifecycle state
- completion timestamp
- cancellation timestamp
- relevant actor/source where architecture supports it
- link to actual spreading record if created

Do not overwrite historical planned volume with actual volume.

Do not erase cancelled history.

---

# 10. Domain/API requirements

Create or adapt canonical domain operations for:

- create planned allocation
- update planned allocation
- cancel planned allocation
- complete planned allocation
- read active reservations
- read lifecycle/history where required

Avoid having UI/server actions manually reproduce resource arithmetic.

Prefer one canonical persistence path per transition.

If RPCs are appropriate to guarantee atomicity, use them.

Runtime validation is required.

Do not rely solely on TypeScript types.

---

# 11. Current recommendation/economic paths

Audit all current readers of `slurry_allocations`.

Update them only as necessary so that:

- current/future planning sees active planned allocations;
- cancelled allocations are ignored as active plans;
- completed allocations are not treated as future planned applications;
- historical actual records remain available where appropriate;
- finite-resource availability uses active reservations only;
- no current scientific calculation starts treating completed physical m3 as statutory neat slurry.

Be conservative.

Do not refactor unrelated engines.

---

# 12. UI scope for Phase 1A

Do NOT build the final farmer-facing edit/cancel/complete experience in this phase.

Small internal changes required to keep existing screens compiling are permitted.

The farmer-facing lifecycle UX will be Phase 1B after database/domain behaviour is independently verified.

---

# 13. Database migration requirements

If schema changes are required:

- create forward-only migration(s);
- preserve existing rows;
- migrate existing farmer-planned allocations conservatively;
- do not invent completion/cancellation history for old rows;
- existing rows that represent current plans should remain planned unless repository evidence proves otherwise;
- include database constraints for valid lifecycle combinations;
- include indexes required by active-reservation calculations;
- update RLS/RPC security deliberately;
- preserve same-farm protections.

Do not rewrite old migration files.

---

# 14. Tests

Add high-quality tests covering at least:

A. planned allocation reserves slurry

B. editing planned volume upward succeeds when capacity exists

C. editing upward fails when it would exceed capacity

D. editing downward releases reservation

E. cancellation releases reservation

F. cancellation preserves historical row

G. completed allocation stops being an active reservation

H. completion consumes/reconciles actual physical volume so capacity does not reappear

I. actual volume below planned releases unused reservation

J. actual volume above planned succeeds only where enough physical capacity remains

K. repeated completion cannot consume twice

L. completed allocation cannot be edited as a plan

M. cancelled allocation cannot be completed

N. direct/alternative persistence paths cannot bypass the capacity invariant

O. cross-farm access is rejected

P. concurrent transitions cannot over-allocate or over-consume a store

Q. a legitimate later lower store observation can be represented/reconciled without silently deleting history

R. a conflicting store observation versus active future reservations produces an explicit conflict rather than corrupting data

S. archived/cancelled/completed records do not count as active reservation capacity where applicable

Use real Postgres validation if available.

If local Postgres/Supabase is unavailable, do not claim concurrency/database behaviour is proven from mocks alone.

Clearly identify any validation that still requires real PostgreSQL testing.

---

# 15. Documentation

Update the appropriate Farm Return domain/architecture documentation with:

- lifecycle state meanings;
- allowed transitions;
- reservation semantics;
- completion semantics;
- physical-store reconciliation semantics;
- distinction between physical volume and regulatory neat slurry;
- database invariants;
- known exclusions from this phase.

Do not change the frozen scientific evidence audit except to link/reference the implemented lifecycle if genuinely necessary.

---

# 16. Non-goals

Explicitly do NOT implement:

- recommended slurry m3/ha;
- Teagasc rate logic;
- 33 m3/ha vs 90 kg K resolution;
- DM interpolation;
- new NFRV rules;
- regulatory neat-slurry nutrient reconstruction;
- spreadable-area calculation;
- whole-farm recommendation optimisation;
- new farmer evidence-check workflow;
- farmer-facing final recommendation cards;
- weather changes;
- Rainfall Window Score changes;
- fertiliser-price changes.

---

# Acceptance criteria

Phase 1A is complete only when:

1. allocation lifecycle is explicit and finite;
2. planned allocations alone reserve future physical slurry;
3. cancellation releases reservation without deleting history;
4. completion records actual physical use and cannot make spread slurry available again;
5. planned and actual volumes remain separately auditable;
6. capacity remains enforced at the database boundary;
7. completion/cancel/edit transitions are atomic;
8. concurrency cannot produce over-allocation;
9. later store-volume observations have defined reconciliation semantics;
10. physical slurry remains distinct from regulatory neat slurry;
11. no scientific recommendation logic has been introduced;
12. typecheck passes;
13. build passes;
14. relevant automated tests pass;
15. any required real-Postgres validation still outstanding is explicitly identified rather than simulated away.

## Required final report

Return:

- starting commit
- final commit
- files changed
- migrations added
- lifecycle model implemented
- exact store reconciliation model
- database invariants
- actions/RPCs added or changed
- existing readers updated
- tests run and result counts
- real PostgreSQL validation performed, if any
- remaining runtime validation required
- any STOP condition encountered
- any follow-up required for Phase 1B

Verify command: `npm run typecheck && npm run build`

## Resume constraint — harden store observation identity

Partial Phase 1A work already exists in the working tree from a Claude run that hit its usage limit.

PRESERVE and continue that work unless repository evidence proves a redesign is necessary.

Before completing Phase 1A, independently review the partial migration's store-observation mechanism.

Current partial design contains:

- `housing.store_observation_seq`
- `housing.store_observed_at`
- `record_slurry_store_observation(...)`
- `housing_track_store_observation()` trigger

The intended invariant is:

> `store_observation_seq` and `store_observed_at` are database-owned observation identity, and historical withdrawals may only be superseded by a genuine new store-volume observation.

The current partial trigger appears to treat a direct change to `store_observation_seq` itself as a new observation.

That must NOT become a way for a generic/direct housing UPDATE to manufacture a new baseline and make previously completed withdrawals disappear from the reconciled-volume calculation.

Required:

1. Trace all current write paths to:
   - `storage_fill_pct`
   - `storage_fill_status`
   - `storage_fill_recorded_at`
   - `store_observation_seq`
   - `store_observed_at`

2. Ensure a new observation sequence can only arise from a semantically valid store-volume observation/reconciliation event.

3. A direct write to database-owned observation identity fields must not by itself create a new observation.

4. Preserve the ability for the canonical `record_slurry_store_observation(...)` path to record a genuine new observation even where the reported fill percentage is unchanged.

5. Do not solve this by weakening RLS, ownership or capacity invariants.

6. Add regression tests proving:
   - a completed withdrawal remains deducted if a client attempts to mutate observation identity directly;
   - a genuine new observation supersedes withdrawals from the previous observation sequence;
   - an unchanged-percentage genuine re-observation works through the canonical path;
   - generic housing updates that do not represent a new volume observation do not reset withdrawal accounting.

Also inspect whether existing "estimated" fill updates should semantically count as new physical observations. Do not assume that every change to `storage_fill_pct` represents a farmer-observed tank reading. Preserve the distinction between estimated and farmer-recorded evidence where the existing model supports it.

If the existing generic housing-write architecture makes this impossible to enforce without ambiguous double counting, use the existing STOP condition and document the minimal safe redesign rather than approximating.
## Post-build real PostgreSQL validation

After commit `c8b9065`, migration:

`20260926000000_slurry_allocation_lifecycle.sql`

was applied successfully to the disposable Supabase project:

`Farm Return Slurry Capacity Test`

It has NOT been applied to `Farm Return V1 Dev`.

Real PostgreSQL validation passed for:

- lifecycle migration application;
- create reservation;
- edit upward/downward;
- over-capacity edit rejection;
- cancellation and reservation release;
- actual volume below planned on completion;
- actual volume above planned with capacity enforcement;
- repeated-completion rejection;
- completed-plan edit rejection;
- genuine store re-observation;
- direct observation-identity mutation protection;
- estimated-fill observation semantics;
- conflicting lower store observation rejection;
- authenticated RLS;
- cross-farm refusal;
- direct-table capacity enforcement;
- concurrent create/create;
- concurrent edit/create;
- concurrent complete/create;
- concurrent cancel/create.

Temporary concurrency fixtures were removed after testing and baseline store reservations were verified restored.

Update lifecycle documentation only as necessary so it accurately distinguishes:

- validated on disposable real PostgreSQL;
- NOT yet deployed to Farm Return V1 Dev.

Do not change application behaviour or the validated migration logic merely to document this validation.