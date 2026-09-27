# Task: Campaign B temporal integrity — historical neat-slurry evidence versus current physical store volume

Starting HEAD: 53a4d49

## Goal

Investigate and, only if evidence proves it necessary, fix the temporal relationship between:

1. persisted regulatory neat-slurry evidence; and
2. the physical slurry-store volume used by `slurry-regulatory-context`.

A concern was identified during Campaign B persistence work:

A regulatory neat-slurry observation may be historically valid at the time it was recorded, while the store's physical volume may later change because of spreading, withdrawals, reconciliation or a newer physical observation.

Farm Return must not compare facts from different temporal states and falsely label valid historical regulatory evidence as conflicting.

Do not assume this is a bug. Trace the real data semantics first.

## A. Investigation — mandatory before any code change

Trace end-to-end:

- `src/domain/slurry-regulatory-context.ts`
- `src/domain/regulatory-evidence-records.ts`
- physical slurry/store reconciliation and lifecycle modules
- housing/store mapper and row types
- regulatory evidence farm-data loader
- all relevant dates/timestamps/provenance
- existing Campaign 1A physical-volume reconciliation semantics
- tests covering withdrawals, new observations and regulatory neat evidence

Establish exactly:

1. What timestamp/effective-date identifies a regulatory neat-slurry observation?
2. What timestamp/evidence date identifies the physical-volume fact passed into `storeSlurryIdentity`?
3. Is physical volume there:
   - the original observation,
   - a reconciled current volume,
   - or another concept?
4. Can a completed spreading event reduce the physical value without creating a new regulatory-neat observation?
5. Can a newer physical observation supersede withdrawals while the older regulatory-neat observation remains the latest neat evidence?
6. Does current code compare those temporally different facts?
7. Can that comparison produce:
   `NEAT_SLURRY_EXCEEDS_PHYSICAL_VOLUME`
   or another conflict even though each fact was individually valid at its own time?
8. Is there already enough provenance to establish temporal comparability without new schema?

Document concrete examples from the actual code.

## B. Required invariant

The following must hold:

> A regulatory neat-slurry evidence record may only be checked against a physical-volume fact when the two facts are legitimately comparable for the same store state.

Historical truth must not be rewritten because the physical store later changes.

But equally:

- a neat-slurry declaration of 150 m³ against a genuinely contemporaneous physical store volume of 100 m³ must remain conflicting;
- do not simply remove the `neat <= physical` invariant;
- do not assume every historical neat observation remains usable indefinitely.

## C. If current code is already temporally safe

If tracing proves the current comparison always uses temporally aligned facts:

- do NOT change production code;
- add/strengthen regression tests proving why;
- document the reasoning;
- report the exact invariant and evidence;
- stop.

## D. If a temporal defect is confirmed

Make the smallest defensible fix.

Preferred principle:

- preserve the original regulatory-neat observation as historical evidence;
- distinguish "cannot establish comparability with the current physical state" from a genuine contradictory measurement;
- only emit a physical-vs-neat conflict when the observations are legitimately contemporaneous/comparable.

Do NOT invent temporal matching tolerances such as "same day" or "within N hours" without an existing authoritative/domain contract.

If exact comparability cannot be established from current persisted provenance, fail closed as missing/unresolved evidence rather than declaring a false conflict.

Do not silently convert the old neat observation into the current physical volume.

Do not mutate/delete historical evidence.

## E. Required regression scenarios

Whether fixing code or proving it already safe, cover at least:

A. contemporaneous physical 100 m³ + neat 120 m³ => genuine conflict;

B. contemporaneous physical 100 m³ + neat 80 m³ => valid known evidence according to existing semantics;

C. valid neat observation recorded for an earlier store state, followed by a completed slurry withdrawal => historical neat record is not falsely reclassified as contradictory merely because current physical volume fell;

D. newer genuine physical-volume observation after the neat observation => old neat evidence is not blindly compared with the newer physical state;

E. new neat evidence aligned with the newer store state restores a legitimately comparable current fact;

F. no temporal provenance => fail closed if comparability cannot be established; do not invent a conflict or known quantity;

G. explicit zero remains handled correctly;

H. existing lifecycle/reconciliation behaviour does not regress.

## F. STOP conditions

STOP rather than guessing if:

1. current persisted physical-volume evidence lacks enough timestamp/provenance to determine comparability;
2. fixing this safely requires new schema beyond the current Campaign B persistence migration;
3. multiple possible temporal semantics exist and none is established by existing contracts;
4. resolution would require new regulatory/statutory interpretation.

If stopped, document the precise missing fact/schema requirement and do not implement a speculative rule.

## Scope exclusions

Do NOT:

- change Irish statutory interpretation;
- resolve Table 15/home-produced grazing-manure treatment;
- change nutrient coefficients;
- recommend slurry application rates;
- implement optimisation;
- wire What Matters;
- add farmer-facing forms;
- apply migrations to Farm Return V1 Dev;
- change unrelated timestamp-ordering behaviour;
- change the clean tied-observation logic unless directly required.

## Documentation/state

Update in the SAME commit if code/tests/docs change:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

State clearly whether the concern was:
- confirmed and fixed;
- disproved with tests; or
- blocked because temporal comparability cannot yet be established.

Campaign B remains PARTIAL unless all remaining Campaign B work is separately complete.

## Verification

Run focused regulatory evidence + slurry lifecycle/context tests.

Then full `npm test`.

Verify command: `npm run typecheck && npm run build`

Do not apply any migration to Farm Return V1 Dev.

