# Task: Fix slurry completion flow audit mediums

Starting HEAD: auto

Verify command: `npm run typecheck && npm run build`

## Objective

Fix the two confirmed MEDIUM findings from:

`.agent/history/audit-20260925T135144Z.md`

Do not redesign the Today page or change scientific, economic, ranking or actionability semantics.

## Finding 1 — Successful retry leaves CTA stale

Current bug:

failed save
→ pending write completes
→ Today evaluates unchanged server data
→ missing-details CTA remains
→ farmer retries and save succeeds
→ pending write completes again
→ `pilotEvaluationStarted.current` prevents another evaluation
→ stale CTA remains visible

Fix this so that a successful persistence completion always allows What Matters to reevaluate against the newly saved canonical data.

Requirements:
- handle failure → return to Today → successful retry
- do not introduce evaluation loops
- do not repeatedly evaluate when nothing changed
- do not bypass the canonical persistence path
- keep the existing one-evaluation-per-stable-state behaviour where possible

Add a regression test reproducing the exact failure → successful retry sequence.

## Finding 2 — Multi-source allocation CTA cannot resolve the state

Current behaviour:

A field can receive slurry from multiple housing/source allocations.

The current resolver deliberately does not produce a combined application date for this case.

Therefore, even after the farmer completes the visible date fields, the field can still never become a What Matters candidate.

Do not offer an actionable `Add spreading details` CTA for a case that the current canonical resolver cannot resolve.

Requirements:
- detect this unsupported multi-source case using existing domain data
- exclude it from the actionable completion CTA
- explain the limitation in farmer-facing language
- do not expose internal codes
- do not change the existing resolver
- do not invent a combined date
- do not change scientific logic

Add regression coverage showing:
- multi-source allocation does not receive the completion CTA
- completing dates does not incorrectly imply the field can become a candidate
- normal single-source missing method/date flow still works

## Constraints

Do not:
- change slurry science
- change Phase 5 economics
- change Phase 8 ranking
- change Phase 9 selection
- change Phase 10/11 actionability
- invent aggregation rules for multiple slurry sources
- redesign Today
- change contractor-cost behaviour
- work on map/mobile/news/AI

## Acceptance criteria

- successful retry causes What Matters to reevaluate using persisted data
- stale CTA cannot remain after successful save
- no evaluation loop is introduced
- multi-source unsupported allocations do not show a misleading completion CTA
- single-source completion flow continues to work
- farmer-facing copy remains clear
- targeted tests pass
- typecheck and build pass