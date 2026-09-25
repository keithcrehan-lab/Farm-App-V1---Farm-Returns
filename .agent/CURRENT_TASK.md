# Task: Prevent stale What Matters responses overwriting newer state

Starting HEAD: auto

Verify command: `npm run typecheck && npm run build`

## Objective

Fix the confirmed MEDIUM finding from:

`.agent/history/audit-20260925T160848Z.md`

Do not change domain, scientific, economic, ranking or actionability semantics.

## Confirmed bug

Current race:

1. Farmer starts a What Matters confirmation request.
2. A previously failed farm write is retried.
3. Retry succeeds.
4. Today automatically reevaluates using the newly persisted farm data.
5. That newer evaluation completes and updates What Matters.
6. The older confirmation request then finishes.
7. `handlePilotConfirm` currently applies its response unconditionally.
8. The stale confirmation response overwrites the newer evaluation.

Because the synced-write counter has already settled, another automatic reevaluation does not occur.

The UI can therefore display stale What Matters state.

## Required fix

Coordinate stale-response protection across all async operations that can update What Matters state, including:

- automatic evaluation
- farmer confirmation
- contractor-rate save/evaluation

Use one coherent request/version ordering mechanism.

Any response that started before a newer What Matters state-producing request must not be allowed to overwrite the newer result.

Do not solve this with arbitrary delays or timeouts.

Do not trigger unnecessary evaluation loops.

## Regression tests

Add an exact regression for:

older confirmation starts
→ successful farm-write retry
→ newer automatic evaluation starts
→ newer evaluation finishes
→ older confirmation finishes afterwards

Expected:
the newer evaluation remains displayed.

Also test the inverse ordering:

confirmation starts
→ confirmation finishes before any newer evaluation

Expected:
the confirmation result is applied normally.

Where relevant, cover contractor-rate evaluation with the same stale-response guard.

## Constraints

Do not:
- change What Matters domain rules
- change Phase 5 economics
- change Phase 8 ranking
- change Phase 9 selection
- change Phase 10/11 actionability
- change slurry science
- alter persistence semantics
- redesign Today
- work on map/mobile/news/AI

## Acceptance criteria

- older confirmation cannot overwrite a newer automatic evaluation
- older contractor-rate/evaluation response cannot overwrite newer state
- normal confirmation responses still apply when they are current
- successful retry reevaluation behaviour remains intact
- no evaluation loop introduced
- targeted regression tests pass
- typecheck and build pass