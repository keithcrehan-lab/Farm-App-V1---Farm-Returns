# Task: Campaign B persistence stabilisation — deterministic tied evidence observations

Starting HEAD: f55dae2

## Goal

Fix the single remaining Codex MEDIUM from:

`.agent/history/audit-20260927T211433Z.md`

The current regulatory-evidence selector can return a different current fact when two observations have identical effective/capture timestamps but arrive in different array/database order.

Evidence resolution must be deterministic and must never silently choose one incompatible tied observation.

This task is ONLY about deterministic tie handling for the new regulatory neat-slurry and spreadable-area evidence records.

## Required behaviour

Trace the actual selector implementation in:

- `src/domain/regulatory-evidence-records.ts`
- its existing tests
- the new farm-data persistence layer

Do not redesign the persistence model.

For observations tied at the selector's highest-priority/latest timestamp:

1. Reversing input order must never change the canonical result.
2. If tied observations are materially incompatible, return the existing canonical conflicting/blocked evidence outcome rather than choosing either record.
3. Do not invent a winner based on incoming array/database order.
4. Do not silently prefer a more trusted status over a less trusted tied observation if doing so would erase contradictory evidence.
5. Do not turn unknown/unavailable into a known value merely because another tied row is known.
6. Known zero must remain a genuine known zero when there is no incompatible tied observation.
7. If tied observations are genuinely equivalent in every material evidence fact, resolution may collapse them only if provenance semantics remain honest and deterministic.
8. If a stable tie-break is required for genuinely equivalent records, use an immutable deterministic property already present in the record; do not use input position.
9. Do not change the meaning of non-tied observations.

Apply the same rule consistently to:

- regulatory neat-slurry evidence;
- spreadable-area evidence.

## Required regression tests

At minimum prove:

A. neat-slurry `[a,b]` and `[b,a]` produce exactly the same result;

B. tied known neat value vs unavailable neat evidence produces a conflict/block, never whichever came first;

C. tied different known neat values produce a conflict/block;

D. tied equivalent neat observations resolve deterministically;

E. spreadable-area `[a,b]` and `[b,a]` produce exactly the same result;

F. tied known spreadable area vs unavailable/missing incompatible evidence does not silently pick the known row;

G. tied different known spreadable-area values produce a conflict/block;

H. tied equivalent spreadable-area observations resolve deterministically;

I. explicit zero remains known when it is the sole/latest unambiguous fact;

J. all existing non-tied latest-record behaviour remains unchanged.

Where the existing canonical EvidenceFact type already has `conflicting`, use it rather than inventing a new state.

## Scope

Do NOT:

- alter the database schema unless strictly necessary to fix this exact finding;
- add migrations merely to impose query ordering;
- apply any migration to Farm Return V1 Dev;
- change regulatory coefficients or statutory interpretation;
- resolve the Table 15/home-produced grazing-manure question;
- add farmer-facing UX;
- wire What Matters;
- implement slurry recommendation rates or optimisation;
- address the separate temporal question of historical regulatory-neat observations versus current physical store volume in this task.

That temporal question will be reviewed separately after this audit finding is closed.

## Documentation/state

Update in the SAME commit:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

Record that this fixes the remaining tied-observation Codex MEDIUM and that Campaign B overall remains partial.

## Verification

Run focused regulatory-evidence tests.

Then run full `npm test`.

Verify command: `npm run typecheck && npm run build`

Only report DONE if all tests and verification pass.

