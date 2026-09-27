cat > .agent/CURRENT_TASK.md <<'EOF'
# Task: Phase 1B — Farmer-facing slurry plan lifecycle UI
Starting HEAD: 9a6e8dc

## Context

Phase 1A is frozen at:

`9a6e8dc`

Phase 1A introduced and validated the canonical slurry-allocation lifecycle:

- planned
- completed
- cancelled

It also introduced:

- atomic plan editing;
- cancellation with reservation release;
- completion with actual physical volume;
- store reconciliation;
- store observation identity;
- current physical slurry reconciliation after completed withdrawals;
- database-boundary capacity protection;
- historical preservation of planned versus actual values.

Phase 1A has:

- full test coverage;
- real PostgreSQL validation;
- concurrency validation;
- Codex audit 0/0/0/0;
- deployment to `Farm Return V1 Dev`;
- post-deployment schema/RPC/trigger verification.

Do NOT redesign or weaken Phase 1A.

This phase is UI/application integration only.

---

# Objective

Build the farmer-facing UI for managing the slurry spreading plan lifecycle.

The farmer must be able to:

1. see their current slurry plan;
2. see how much physical slurry is currently available;
3. see how much of that slurry is reserved in planned spreading;
4. edit an existing planned allocation;
5. cancel an existing planned allocation;
6. mark a planned allocation as spread;
7. record the actual physical volume spread;
8. record the actual spread date;
9. resolve store-reconciliation ambiguity through plain farmer language where necessary;
10. see completed and cancelled allocations as history.

The UI must expose useful farmer concepts, not database implementation details.

---

# Non-negotiable accounting semantics

Preserve these distinctions everywhere.

## Current physical slurry

This means reconciled physical volume:

`latest valid store observation - completed withdrawals since that observation`

Do NOT display raw `capacity × last fill %` as current volume after withdrawals have occurred.

The latest recorded tank reading remains historical evidence and may be shown separately.

## Planned slurry

Planned allocations reserve physical slurry but do NOT remove it from the tank.

## Unallocated slurry

Where displayed:

`current reconciled physical volume - active planned reservations`

Do not mix this with total physical volume.

## Completed allocation

Completion:

- preserves planned volume;
- records actual physical volume separately;
- releases the planned reservation;
- deducts the actual completed withdrawal from current physical slurry where appropriate.

## Cancelled allocation

Cancellation:

- preserves the historical allocation;
- releases the reservation;
- does NOT deduct physical slurry.

---

# Existing backend

Use the canonical Phase 1A lifecycle functions and actions.

Inspect and reuse the existing implementation, including:

`src/app/actions/slurry-allocation-lifecycle.ts`

and the Phase 1A domain/storage functions.

Do NOT create a second lifecycle implementation in the UI.

Do NOT reproduce capacity calculations independently in React.

Database/domain authority remains canonical.

---

# Primary farmer experience

Use the existing Farm Return visual language and existing spreading screens.

Inspect the current `/spreading/plan` flow and related components before changing the information architecture.

Prefer extending the existing spreading experience over creating a disconnected duplicate feature.

The intended experience is approximately:

## Slurry plan

Top summary:

- Current slurry: `X m³`
- Reserved in plan: `Y m³`
- Unallocated: `Z m³`

Where there are multiple stores, farm totals may be shown first with a simple store breakdown available below.

These must use canonical reconciled values.

Do not invent values when data is unavailable.

---

# Planned allocations

Show active planned allocations prominently.

Each planned allocation should show farmer-relevant information such as:

- field name;
- planned slurry volume;
- planned date, if one exists;
- spreading method, if one exists;
- source store only where useful.

Do not show:

- raw database IDs;
- internal lifecycle enum names;
- `store_observation_seq`;
- reconciliation enum values;
- internal error codes.

Actions:

- Edit
- Mark as spread
- Cancel

Completed or cancelled records must not expose these actions.

---

# Edit planned allocation

The farmer must be able to edit a planned allocation.

Support the fields already safely supported by the canonical Phase 1A update path.

At minimum:

- field;
- source store;
- planned volume.

Preserve existing application method/date where the current plan architecture supports them.

Do not allow the UI to bypass store-capacity validation.

If the requested change cannot fit within current available slurry, show a plain-language farmer error such as:

> There isn't enough unallocated slurry in this store for that change.

Do not expose:

`VOLUME_EXCEEDS_AVAILABLE`

or other internal error strings directly.

Successful edit should refresh/revalidate the relevant plan and volume displays immediately.

---

# Cancel planned allocation

Provide a simple confirmation step.

Example concept:

> Cancel this spreading plan?
>
> The slurry will become available for another field.

Cancellation must call the canonical cancellation action.

After success:

- remove it from active planned allocations;
- show it in history;
- update reserved/unallocated volume;
- leave current physical tank volume unchanged.

Do not hard-delete the allocation.

---

# Mark as spread

This is the most important Phase 1B interaction.

The farmer selects:

`Mark as spread`

The completion interaction should clearly distinguish:

- Planned volume: X m³
- Actual volume spread: editable value
- Spread date

The planned amount may be used as a convenient initial value for the actual-volume input, but it remains editable and must only be persisted after explicit farmer confirmation.

Do not silently convert planned volume into actual volume without the farmer submitting the completion.

The farmer must be able to record:

- actual < planned;
- actual = planned;
- actual > planned.

The Phase 1A backend remains responsible for capacity enforcement.

If actual > planned but sufficient physical slurry exists, completion may succeed.

If insufficient physical slurry exists, give a farmer-readable error.

---

# Spread date

Provide a low-friction date input.

A quick "Today" interaction is acceptable.

Do not fabricate an historical date.

The submitted farmer-confirmed date must be what is persisted.

---

# Store reconciliation ambiguity

Do NOT expose:

- `withdrawn_after_observation`
- `reflected_in_observation`

to the farmer.

Allow the canonical completion path to infer reconciliation where unambiguous.

If Phase 1A requires explicit reconciliation because the spread and latest tank observation are ambiguous, translate this into a plain-language question.

Example:

> Was this spreading already included in your latest tank reading?

Options:

- Yes, the tank reading was taken after this slurry was spread.
- No, the slurry was spread after the tank reading.

Map those answers to the existing canonical reconciliation states.

Only ask this question when genuinely required.

Do not ask every farmer on every completion.

---

# History

Add a simple history section for terminal allocations.

It should include:

## Completed

Show:

- field;
- planned volume;
- actual volume;
- actual spread date;
- method where useful.

If planned and actual differ, show both clearly.

Example:

`Planned 30 m³ · Spread 27 m³`

Do not rewrite the original planned value.

## Cancelled

Show:

- field;
- planned volume;
- cancelled status;
- cancellation date where available.

Keep history secondary to active work.

A collapsed section or tabs are acceptable if consistent with existing Farm Return patterns.

---

# Tank/store presentation

Phase 1A fixed an important distinction.

If the last farmer reading was:

`100 m³`

and since then:

`60 m³`

was completed/spread, the UI must show:

`Current slurry: 40 m³`

not 100 m³.

The original reading may still be shown as contextual evidence.

Example:

`Current estimate: 40 m³`

`Last tank reading: 50%`

when these genuinely differ.

Do not imply the reconciled current fill is a new farmer observation.

The original observation remains distinct.

---

# Multiple stores

Do not assume there is only one slurry store.

Farm-level summary values should aggregate safely from canonical store reconciliation.

Allocation cards may show source store where necessary to avoid ambiguity.

Editing/moving an allocation between stores must use the Phase 1A atomic update path.

---

# Error handling

Translate known lifecycle errors into plain farmer language.

Do not leak internal errors such as:

- `NOT_PLANNED`
- `ALREADY_COMPLETED`
- `RECONCILIATION_REQUIRED`
- `VOLUME_EXCEEDS_AVAILABLE`
- SQL constraint names
- PostgreSQL errors

Unexpected errors should show a generic recoverable message and preserve the farmer's current input where practical.

No invalid optimistic state should remain visible after the server rejects a transition.

---

# Concurrency / stale UI

The UI must assume the underlying plan may have changed since the page loaded.

Examples:

- another tab completed the allocation;
- another plan consumed the remaining store capacity;
- a tank reading changed;
- another action cancelled the plan.

Server/database authority wins.

On a rejected stale action:

- do not overwrite canonical state;
- refresh/revalidate;
- explain the outcome plainly.

---

# Mobile UX

This feature must work comfortably on a phone.

Target at minimum a 390 px wide viewport.

Requirements:

- no horizontal overflow;
- buttons comfortably tappable;
- completion/edit interactions usable without precision tapping;
- key volume summary visible without excessive scrolling;
- history visually secondary;
- no dense desktop table as the only interaction model.

Prefer cards/sheets/dialogs consistent with the existing Farm Return UI.

---

# Accessibility

Use proper:

- labels;
- button semantics;
- form error association;
- keyboard interaction;
- focus behaviour for dialogs/sheets;
- readable units.

Do not communicate state by colour alone.

---

# No duplicate science

This phase does NOT decide:

- which field should receive slurry;
- recommended m³/ha;
- recommended total m³;
- P/K/N requirements;
- spreading-method science;
- optimal timing;
- economic ranking;
- weather actionability.

Those belong to later recommendation phases.

Existing manually planned allocations remain the input to this lifecycle UI.

Do NOT add new agronomic recommendation logic.

---

# Database scope

Prefer NO new migration.

Phase 1A already provides the required lifecycle schema.

If a database schema change appears necessary, STOP and explain exactly what missing invariant/data makes it necessary.

Do not casually add columns to work around a UI issue.

Do not modify:

`20260926000000_slurry_allocation_lifecycle.sql`

It has been validated, audited and deployed.

Any genuinely necessary future DB change must be forward-only.

---

# Tests

Add meaningful regression coverage for the farmer-facing lifecycle.

At minimum test:

A. planned allocations render as active;

B. completed/cancelled allocations are not treated as active;

C. current slurry uses reconciled physical volume;

D. raw last-observation volume does not reappear as current after completed withdrawals;

E. planned reservations are shown separately from current physical volume;

F. unallocated volume derives from current reconciled physical volume minus active reservations;

G. edit success updates the plan;

H. over-capacity edit displays farmer-readable error;

I. cancellation removes item from active plan but preserves history;

J. cancellation releases reservation without reducing physical volume;

K. completion actual < planned preserves both values;

L. completion actual = planned;

M. completion actual > planned where backend accepts it;

N. rejected over-capacity completion remains uncompleted in UI;

O. repeated/stale completion cannot create duplicate completion;

P. same-day/ambiguous reconciliation asks the farmer the plain-language clarification question;

Q. unambiguous reconciliation does not ask unnecessary questions;

R. completed records cannot be edited/cancelled/completed again through UI;

S. cancelled records cannot be edited/completed;

T. internal error codes are not rendered to farmer;

U. multiple stores remain distinct;

V. source-store move revalidates canonical capacity;

W. current/observed fill distinction is rendered correctly;

X. 390 px mobile layout has no intentional horizontal overflow;

Y. existing spreading-plan creation flow still works.

Use existing test infrastructure and patterns.

---

# Documentation

Update:

`docs/farm-return-next/SLURRY_ALLOCATION_LIFECYCLE.md`

with a short Phase 1B section describing:

- farmer-facing lifecycle;
- current versus observed volume terminology;
- planned/reserved versus physical volume;
- completion flow;
- reconciliation question semantics;
- history behaviour.

Do not rewrite the Phase 1A validation record.

---

# Definition of done

Phase 1B is complete when:

- farmer can manage planned allocations end-to-end;
- farmer can edit;
- farmer can cancel;
- farmer can complete;
- actual physical volume is captured;
- actual date is captured;
- reconciliation ambiguity is handled in farmer language;
- completed/cancelled history is visible;
- reconciled physical volume is consistently displayed;
- active reservations remain distinct from physical volume;
- mobile UX works;
- no internal implementation details leak;
- no scientific recommendation logic is introduced;
- no Phase 1A invariant is weakened;
- tests pass;
- typecheck passes;
- build passes.

Verify command: `npm run typecheck && npm run build`
EOF

./scripts/agent-status