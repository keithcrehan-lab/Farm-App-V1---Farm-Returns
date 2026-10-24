# C10 — closure audit 13552 M1 remediation (test only)

Audit `audit-20261024T103926Z-13552` (bounded closure of `5aa207d..2fb2d20`): 0C / 0H / 1M / 0L. Its sole Medium was a regression-test gap: the several-target and mixed-result F020 tests read the view-model only, so a one-target-only rendering (`e.targets.slice(0, 1)`) passed all 18 repair tests. The production implementation was already correct (auditor and coordinator). Codex usage in the remediation: ZERO. The audit's result is not rewritten.

## Repair — `4bb4dc5` (`src/components/cattle/c10-audit-94767.test.tsx` only)
Two rendered tests build the real Animal Profile (1427) with two C5 target comparisons of distinct identity — `SYNTH-TARGET-FINISHING-ADG` v1 (source `SYNTH-SRC-TARGETS` v1, daily gain, 2 records) and `SYNTH-TARGET-SECOND` v2 (source `SYNTH-SRC-SECOND` v3, weight, 1 record, its own target definition) — render `AnimalProfileScreen`, open the real "Why this result?" disclosure and check each target's own rendered block:
- "2 (rendered)", both on track: headline "On track (2 targets, each explained below)"; per target the result, value compared, "Target version · source recorded with it: <source>, version <v>", review state, record count, and no other target's source in its block; each source line appears exactly once.
- "3 (rendered)", on track + behind: headline "Mixed target results — …"; target A "Result: On track" and not "Behind target"; target B "Result: Behind target", not "On track", with its own value.

## Mutation proof (production file restored; `git diff 510f003 -- AnimalProfileScreen.tsx` empty)
- `e.targets.slice(0, 1).map` (the auditor's form): both new tests fail; the 18 existing tests still pass (confirms the finding).
- every target rendered with `e.targets[0].lines` (first provenance for all): both new tests fail.

## Verification
New tests 2/2; `c10-audit-94767` 20/20; Animal Profile + C10 audit component tests 3 files / 66; C10 suite (`npx vitest run cattle animal-plan src/components/shell --maxWorkers=2`) 34 files / 1,358; typecheck pass; eslint on the test file clean. Production diff `510f003..4bb4dc5` (non-test `src`): empty — the full gate `quality-20261024T090919Z-98651` on `510f003` remains the production gate.

## Acceptance
94767 = full C10 baseline; 13552 = bounded closure of its repair, no production defect; its only Medium is closed by the requested rendered, mutation-proven test with production unchanged. No further audit run. Status: READY_FOR_C10_ADOPTION_AND_FREEZE (adoption/freeze is a separate authorised step; no receipt, not frozen, not pushed).
