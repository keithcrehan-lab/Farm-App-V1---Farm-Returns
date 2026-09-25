# Task: Make missing slurry details actionable from What Matters

Starting HEAD: auto

Verify command: `npm run typecheck && npm run build`

## Objective

When What Matters knows slurry opportunities exist but cannot create an audited economic candidate because planned slurry spreading is missing `applicationMethod` and/or `applicationDate`, guide the farmer directly to complete those missing details.

Do not change any scientific, economic, ranking or actionability logic.

## Current established behaviour

The live Dev flow has been verified:

slurry opportunity exists
→ `buildRealCandidates()`
→ allocation missing applicationMethod and/or applicationDate
→ candidate skipped
→ candidates.length === 0
→ Phase 8 is not reached
→ What Matters cannot rank a recommendation

This is correct domain behaviour and must remain unchanged.

The product problem is that the farmer currently receives an explanation but no direct way to resolve it.

## Desired farmer experience

For the `NO_CANDIDATE_DATA` / missing slurry planning-details state, What Matters should communicate approximately:

**Slurry opportunities found**

Farm Return needs the planned spreading method and date before it can work out which opportunity is likely to give you the best return.

**Add spreading details →**

Use the actual number of relevant opportunities only if that count is reliably available from existing data. Do not fabricate a count.

Do not use internal terminology such as:
- NO_CANDIDATE_DATA
- applicationMethod
- applicationDate
- candidate
- Phase 8

Normal farmer-facing wording should use terms such as:
- spreading method
- planned date
- slurry opportunity

## Interaction

Clicking `Add spreading details →` must take the farmer to the smallest existing Farm Return flow capable of supplying the missing information.

Before implementing anything new:

1. Inspect the existing slurry planning/allocation UI.
2. Inspect existing routes and server actions for editing slurry allocations.
3. Reuse the canonical existing persistence path wherever possible.
4. Do not create a parallel slurry-planning model or duplicate persistence logic.

If an existing slurry planning screen can edit method/date:
- navigate directly to it;
- preserve enough context for the farmer to understand why they were sent there;
- prefer returning to Today after completion if existing navigation supports this cleanly.

If there is no existing UI capable of safely editing these existing canonical fields:
- add only the smallest focused UI necessary to edit the existing canonical slurry allocation;
- use existing server-side validation and persistence;
- do not introduce a new data model.

If no safe canonical write path exists, STOP and report BLOCKED rather than inventing one.

## Adaptive input behaviour

Only ask the farmer for information that is actually missing.

Examples:

- method missing, date present → ask for method only
- date missing, method present → ask for date only
- both missing → ask for both

Do not make the farmer re-enter information Farm Return already knows.

Do not fabricate defaults.

## After save

When the missing planning details are successfully persisted:

1. The canonical slurry allocation must contain the saved values.
2. Returning to Today must cause What Matters to evaluate the real updated data.
3. The old missing-details message must not remain due to stale client state.
4. Do not force the result to become ACTIONABLE.
5. The normal audited pipeline must decide what happens next.

Possible legitimate outcomes after completion include:
- ranked economic opportunity
- NEEDS_CONFIRMATION
- unsupported scientific evidence
- missing economic evidence
- no positive economic opportunity
- regulatory/actionability restriction

The UI must not promise that entering the details will necessarily produce a recommendation.

## UX constraints

Keep the Today card concise.

The main What Matters card should explain:
- what is missing
- why Farm Return needs it
- what the farmer can do next

Detailed editing belongs in the destination flow, not inside a large permanent form on Today.

The contractor-cost setup behaviour must remain unchanged.

## Tests

Add focused regression tests covering:

- missing method + date presents CTA
- missing method only presents appropriate route/action
- missing date only presents appropriate route/action
- no fabricated count
- internal codes do not leak to farmer UI
- completed data no longer shows the missing-details CTA
- saved data flows back through the real evaluation path
- existing other What Matters states remain unchanged

Use the real existing routing/persistence interfaces in tests where practical.

## Out of scope

Do not:
- change Phase 5 economics
- change Phase 8 ranking
- change Phase 9 selection
- change Phase 10/11 actionability
- change slurry science
- invent weather rules
- redesign the overall Today page
- fix map interactions
- fix mobile layout
- build news
- change Ask AI
- alter contractor-cost behaviour