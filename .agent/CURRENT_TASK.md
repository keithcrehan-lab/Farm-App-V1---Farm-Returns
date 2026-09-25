# Task: Add slurry planning entry flow for zero-allocation farms

Starting HEAD: auto

Verify command: `npm run typecheck && npm run build`

## Objective

When Farm Return has slurry available and spreading is currently open on one or more fields, but there are no persisted field slurry allocations yet, Today must guide the farmer to create a real canonical slurry spreading plan.

Do not fabricate an economic opportunity before an allocation exists.

Reuse the existing slurry allocation model, persistence and validation.

## Current established Dev state

Live Dev audit confirmed:

- slurry volume exists in storage
- 10 active fields currently have an open spreading window
- there are no existing single-source field slurry allocations
- therefore What Matters has no real candidate to evaluate
- the existing `Add spreading details` flow only applies after an allocation already exists

The current sidebar wording:

`10 fields have a slurry opportunity`

is too strong for this state.

An open spreading window plus available slurry does not by itself establish an audited economic opportunity.

## Desired Today behaviour

When:

- slurry is available
- one or more fields are open/permitted for spreading
- no applicable persisted field allocations exist

Today should show a farmer-facing state approximately like:

**Slurry spreading is open**

You have 116 m³ available and 10 fields are currently open for spreading.

Create a spreading plan so Farm Return can evaluate where the slurry is likely to give you the best return.

**Plan slurry spreading →**

Use real counts/volume only when reliably available from existing data.

Do not call these fields economic "opportunities" until Farm Return has enough evidence to calculate one.

## Sidebar wording

For this zero-allocation state, replace misleading wording such as:

`10 fields have a slurry opportunity`

with factual wording such as:

`Spreading open on 10 fields`

Do not change the underlying regulatory logic.

## Plan slurry spreading interaction

Before building new persistence:

1. Inspect the existing slurry allocation data model.
2. Inspect existing allocation/planning screens.
3. Inspect existing server actions/store mutations used to create or edit slurry allocations.
4. Reuse the canonical path.

Do not create a second slurry-planning model.

The CTA should open the smallest existing or focused flow necessary to create a real field allocation.

The farmer should be able to provide only the information Farm Return cannot already know.

At minimum the canonical allocation must end up with enough real data to represent:

- slurry source/store
- target field
- allocated volume
- application method
- planned application date

Do not fabricate defaults.

## Use existing farm knowledge

Where Farm Return already knows something, do not ask the farmer to re-enter it unnecessarily.

Examples:
- known fields
- field size
- available slurry stores
- available slurry volume
- regulatory spreading window

Do not automatically choose a field, volume, date or method unless an existing audited rule explicitly supports doing so.

## After save

After the farmer creates a real allocation:

1. Persist through the canonical existing slurry allocation path.
2. Return to Today if the current navigation supports it cleanly.
3. What Matters must reevaluate against persisted server data.
4. The zero-allocation CTA must disappear when no longer applicable.
5. Existing `Add spreading details` behaviour should remain available if the new allocation is still missing method/date.
6. If the allocation is complete, the normal audited pipeline decides the next state.

Do not force a recommendation.

Possible next states include:
- ranked economic opportunity
- NEEDS_CONFIRMATION
- unsupported science
- missing economic evidence
- no positive economic opportunity
- regulatory/actionability restriction

## Multi-source constraint

Do not attempt to solve the existing multi-source combined-date limitation in this task.

Do not invent aggregation logic.

If the canonical creation path would create a multi-source allocation that cannot become a candidate, prevent misleading completion messaging and report the limitation honestly.

## Tests

Add focused regressions for:

- slurry available + fields open + zero allocations → `Plan slurry spreading` CTA
- zero-allocation state does not claim there are economic opportunities
- CTA uses real volume/count only when available
- CTA routes into the canonical allocation flow
- successful allocation save removes zero-allocation CTA
- resulting persisted allocation is visible to the real What Matters pipeline
- existing `Add spreading details` flow still works
- existing recommendation states remain unchanged
- internal codes do not leak into normal farmer UI

## Out of scope

Do not:
- change slurry science
- change regulatory rules
- change Phase 5 economics
- change Phase 8 ranking
- change Phase 9 selection
- change Phase 10/11 actionability
- fix multi-source resolver semantics
- redesign the overall Today page
- fix map interactions
- fix mobile layout
- build news
- change Ask AI
- change contractor-cost behaviour
