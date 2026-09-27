# Task: Campaign B persistence stabilisation — preserve singleton invalid evidence semantics

Starting HEAD: f7f9936

## Goal

Fix the single remaining Codex MEDIUM from:

`.agent/history/audit-20260927T213112Z.md`

The tied-observation stabilisation introduced a regression where a latest group containing only one invalid observation can be reclassified as a tie conflict because the record is compared with itself and `NaN !== NaN`.

A singleton latest observation is not a tie.

Preserve the existing canonical interpretation for singleton observations before any tied-observation equivalence/conflict logic runs.

## Required behaviour

In `src/domain/regulatory-evidence-records.ts`:

1. If the highest-priority/latest observation group contains exactly one record, resolve that record using the existing single-record semantics.
2. Do not run tied-equivalence logic on a singleton group.
3. A single invalid regulatory neat-slurry observation must retain its existing invalid/missing outcome.
4. A single invalid spreadable-area observation must retain its existing invalid/missing outcome.
5. Existing valid singleton known values remain unchanged.
6. Existing singleton explicit zero remains known zero.
7. Existing singleton unavailable evidence remains unavailable.
8. Multi-record tied conflict/equivalence behaviour from the previous task must remain unchanged and deterministic.
9. Reversing multi-record input order must still produce identical results.

Do not special-case only NaN. Fix the structural bug: singleton groups are not ties.

## Required regression tests

Add focused tests proving at least:

A. one invalid spreadable-area record returns the same canonical invalid/missing result as before the tied-observation change;

B. one invalid regulatory neat-slurry record returns its existing canonical invalid/missing result;

C. one valid known neat record remains known;

D. one explicit-zero neat record remains known zero;

E. one unavailable neat record remains unavailable;

F. one valid spreadable-area record remains known;

G. one explicit-zero spreadable-area record remains known zero;

H. existing incompatible multi-record tie tests still return conflict;

I. existing equivalent multi-record tie tests still resolve deterministically;

J. reversed multi-record input order remains invariant.

## Scope

Do NOT:

- redesign tie handling;
- change the database schema or migration;
- apply anything to Farm Return V1 Dev;
- change farmer-facing wording;
- change timestamp ordering;
- address historical neat-slurry evidence versus current physical store volume;
- alter regulatory interpretation, science, recommendation rates, optimisation or What Matters.

This task fixes only the singleton regression.

## Documentation/state

Update in the SAME commit:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

Record that this closes the singleton-invalid regression introduced by tied-observation handling and that Campaign B overall remains partial.

## Verification

Run focused regulatory-evidence tests.

Then run full `npm test`.

Verify command: `npm run typecheck && npm run build`

Only report DONE if all tests and verification pass.

