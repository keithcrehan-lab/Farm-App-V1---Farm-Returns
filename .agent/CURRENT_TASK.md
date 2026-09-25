# Task: Fix What Matters audit medium findings

Starting HEAD: auto

Verify command: `npm run typecheck && npm run build`

## Objective

Fix the two confirmed MEDIUM findings from Codex audit:

`.agent/history/audit-20260925T114530Z.md`

Do not redesign What Matters and do not change scientific, economic, ranking or actionability semantics.

## Finding 1 — Unsupported science misreported as missing prices or costs

Current behaviour can classify a slurry allocation as ECONOMIC_EVIDENCE_UNAVAILABLE when economics cannot be quantified because the scientific assessment itself is unsupported, for example `incorporate_24h`.

The farmer-facing UI must not claim that price or spreading-cost information is missing when those inputs actually exist.

Fix the explanation so that the presentation distinguishes, at minimum:

- missing economic evidence such as price or realisation cost
- unsupported or insufficient scientific evidence
- zero candidates because required planning data is missing

Use farmer-facing language.
Do not expose internal reason codes.

Add a regression test for unsupported slurry science.

## Finding 2 — Real Dev zero-candidate path lacks action-level tests

Current Dev evidence established that allocations missing `applicationMethod` and/or `applicationDate` are skipped by `buildRealCandidates()`, resulting in zero candidates before Phase 8.

Add server-action regression coverage through `evaluateWhatMattersPilot` for:

- missing application method
- missing application date
- both missing

Each should return the correct `NO_CANDIDATE_DATA` explanation with an empty candidate trace.

The test must exercise the real action path rather than only calling the explanation helper directly.

## Constraints

Do not:
- change slurry science rules
- make unsupported science supported
- fabricate method or date
- alter Phase 5 economics
- alter Phase 8 ranking
- alter Phase 9 selection
- alter Phase 10/11 actionability
- redesign Today
- work on map/mobile/news/AI

## Acceptance criteria

- Unsupported science is not described as missing price/cost evidence.
- Missing economic evidence remains accurately described.
- Missing method/date zero-candidate state is covered through the server action.
- Internal engine codes do not leak into farmer UI.
- Existing tests remain green.
- Typecheck and build pass.